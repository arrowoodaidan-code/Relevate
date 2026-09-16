/**
 * Authentication service for Relevate.
 * Uses Bun's built-in password hashing (bcrypt) and session tokens stored in Neon Postgres.
 */
import { randomUUID } from "node:crypto";
import { sql as neonSql } from "../db";

// Shared Neon client singleton. Reuse one pooled connection per serverless
// instance instead of creating a fresh client per call (the documented
// @neondatabase/serverless best practice). Fresh-per-call means every
// signup/login/session op pays cold connection establishment + pool creation,
// which on a cold function can push the DB-backed auth route past the host's
// ~30s upstream cutoff and stall the UI at "Creating account…". The provider
// client is safe to share across concurrent tagged-template calls.
type Db = ReturnType<typeof neonSql>;
let sharedDb: Db | null = null;
function getDb(): Db {
  if (!sharedDb) sharedDb = neonSql();
  return sharedDb;
}

export interface User {
  id: string;
  email: string;
  name: string;
  subscription_tier: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
}

export interface AuthResult {
  user: User;
  session: Session;
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Full-access tiers: "demo" and "team" get everything.
 * Future tier-gating code should use this as its single source of truth.
 */
export function isFullAccessTier(tier: string): boolean {
  return tier === "demo" || tier === "team";
}

/**
 * Hash a password using Node.js crypto (scrypt with random salt).
 * Always emits the portable "salt:key" scrypt format so accounts created on the
 * preview (Bun) verify identically on production (Node/Vercel) and match the
 * demo seed hash. Bun's native bcrypt is intentionally NOT used here: production
 * runs on Node, which has no bcrypt verifier without an extra dependency.
 */
export async function hashPassword(password: string): Promise<string> {
  const { scrypt, randomBytes } = await import("node:crypto");
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verify a password against a stored hash.
 * Format-agnostic across runtimes:
 *  - scrypt "salt:key" (production signups + demo seed) → node:crypto, works on
 *    both Node (Vercel) and Bun (preview).
 *  - bcrypt/argon2 (legacy Bun signups) → Bun native verify when available;
 *    on Node (no Bun) a bcrypt hash cannot be verified without a dependency, so
 *    it is treated as a mismatch rather than throwing.
 * Never throws on unrecognized formats — returns false.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  // scrypt format ("salt:key") — node:crypto path, works on every runtime.
  if (hash.includes(":")) {
    const { scrypt } = await import("node:crypto");
    const [salt, key] = hash.split(":");
    if (!salt || !key) return false;
    return new Promise((resolve) => {
      scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) return resolve(false);
        resolve(derivedKey.toString("hex") === key);
      });
    });
  }
  // bcrypt/argon2 hash → Bun native verification (preview runtime).
  if (typeof Bun !== "undefined" && Bun.password) {
    try {
      return await Bun.password.verify(password, hash);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Sign up a new user. Creates user record with hashed password and returns a session.
 */
export async function signup(
  email: string,
  name: string,
  password: string,
): Promise<AuthResult> {
  if (!email || !email.includes("@")) throw new Error("Valid email is required");
  if (!name || name.length < 1) throw new Error("Name is required");
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");

  const db = getDb();

  // Check if email already exists
  const existing = await db`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) throw new Error("Email already registered");

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  // Insert user
  await db`
    INSERT INTO users (id, email, name, subscription_tier, password_hash, created_at)
    VALUES (${id}, ${email}, ${name}, 'starter', ${passwordHash}, ${now})
  `;

  // Create session
  const session = await createSession(id);

  return {
    user: { id, email, name, subscription_tier: "starter", created_at: now },
    session,
  };
}

/**
 * Time-boxed access windows (trial accounts).
 * A user row may carry a [access_starts_at, access_expires_at] window
 * (timestamptz, either nullable). NULL means "no window" — every normal
 * account (demo + real signups) behaves exactly as before.
 */
const ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});
function formatET(d: Date): string {
  return `${ET_FORMAT.format(d)} ET`;
}
/**
 * Throws with a distinct message when the account's access window has not
 * started or has already ended. Only called AFTER the password has verified,
 * so the unauthenticated path still cannot tell whether an email exists.
 */
export function assertAccessWindowOpen(user: {
  access_starts_at?: string | null;
  access_expires_at?: string | null;
}): void {
  const now = Date.now();
  if (user.access_starts_at) {
    const start = new Date(user.access_starts_at);
    if (now < start.getTime()) {
      throw new Error(`This trial isn't active yet — it opens ${formatET(start)}`);
    }
  }
  if (user.access_expires_at) {
    const end = new Date(user.access_expires_at);
    if (now >= end.getTime()) {
      throw new Error("This trial has ended");
    }
  }
}
/** The session must never outlive the trial window. */
function capExpiryAtWindow(expiresAt: string, accessExpiresAt: string | null): string {
  if (!accessExpiresAt) return expiresAt;
  const end = new Date(accessExpiresAt).getTime();
  if (new Date(expiresAt).getTime() > end) return new Date(end).toISOString();
  return expiresAt;
}
/**
 * Log in an existing user. Verifies password and returns a session.
 */
export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (!email || !password) throw new Error("Email and password are required");

  const db = getDb();

  const users = await db`
    SELECT id, email, name, subscription_tier, password_hash, created_at,
           access_starts_at, access_expires_at
    FROM users WHERE email = ${email}
  `;

  if (users.length === 0) throw new Error("Invalid email or password");

  const row = users[0];

  if (!row.password_hash) throw new Error("Invalid email or password");

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) throw new Error("Invalid email or password");

  // Time-boxed trial gate — only reached with a correct password, so the
  // distinct window messages never reveal whether an email exists.
  assertAccessWindowOpen(row);

  const session = await createSession(row.id);

  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      subscription_tier: row.subscription_tier,
      created_at: String(row.created_at),
    },
    session,
  };
}

/**
 * Create a new session for a user.
 */
export async function createSession(userId: string): Promise<Session> {
  const db = getDb();
  const id = randomUUID();
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  // Cap the 7-day session at the user's trial window end (if any), so a
  // session issued inside a 4-day trial dies with the trial.
  const windowRows = await db`
    SELECT access_expires_at FROM users WHERE id = ${userId} LIMIT 1
  `;
  const accessExpiresAt = windowRows.length > 0 ? (windowRows[0].access_expires_at ?? null) : null;
  const expiresAt = capExpiryAtWindow(
    new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    accessExpiresAt ? new Date(accessExpiresAt).toISOString() : null,
  );

  await db`
    INSERT INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES (${id}, ${userId}, ${token}, ${expiresAt}, ${new Date().toISOString()})
  `;

  return { id, user_id: userId, token, expires_at: expiresAt };
}

/**
 * Verify a session token and return the user and session.
 */
export async function verifySession(
  token: string,
): Promise<AuthResult | null> {
  if (!token) return null;

  const db = getDb();

  const rows = await db`
    SELECT s.id as sid, s.user_id, s.token, s.expires_at,
           u.id, u.email, u.name, u.subscription_tier, u.created_at,
           u.access_expires_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token}
  `;

  if (rows.length === 0) return null;

  const row = rows[0];
  const expiresAt = new Date(row.expires_at);
  // Time-boxed trial: a session must not outlive the user's access window.
  const windowClosed = row.access_expires_at != null && Date.now() >= new Date(row.access_expires_at).getTime();

  if (expiresAt < new Date() || windowClosed) {
    // Session expired, or the user's trial window has closed — clean it up
    // so a session issued inside the window cannot outlive the trial.
    await db`DELETE FROM sessions WHERE id = ${row.sid}`;
    return null;
  }

  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      subscription_tier: row.subscription_tier,
      created_at: String(row.created_at),
    },
    session: {
      id: row.sid,
      user_id: row.user_id,
      token: row.token,
      expires_at: String(row.expires_at),
    },
  };
}

/**
 * Delete a session (logout).
 */
export async function deleteSession(token: string): Promise<void> {
  const db = getDb();
  await db`DELETE FROM sessions WHERE token = ${token}`;
}