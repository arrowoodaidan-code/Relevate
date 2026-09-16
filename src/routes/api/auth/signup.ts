/**
 * POST /api/auth/signup
 * Creates a new user account with hashed password and returns a session.
 * All node:crypto usage is inside the handler to avoid client-bundle breakage.
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/lib/db";

function generateId(): string {
  return crypto.randomUUID();
}

export const signup = createServerFn({ method: "POST" })
  .validator(
    (data: { email: string; name: string; password: string }) => {
      if (!data.email?.includes("@")) throw new Error("Invalid email");
      if (!data.name?.trim()) throw new Error("Name is required");
      if (!data.password || data.password.length < 6)
        throw new Error("Password must be at least 6 characters");
      return data;
    }
  )
  .handler(async ({ data }) => {
    // Dynamic import so node:crypto never touches the client bundle
    const { scrypt, randomBytes } = await import("node:crypto");

    async function hashPassword(password: string): Promise<string> {
      return new Promise((resolve, reject) => {
        const salt = randomBytes(16).toString("hex");
        scrypt(password, salt, 64, (err: any, derivedKey: Buffer) => {
          if (err) reject(err);
          resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
      });
    }

    // Check if user already exists
    const existing = await sql`
      SELECT id FROM users WHERE email = ${data.email} LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, error: "An account with this email already exists" };
    }

    const userId = generateId();
    const passwordHash = await hashPassword(data.password);

    await sql`
      INSERT INTO users (id, email, name, password_hash, subscription_tier, created_at)
      VALUES (${userId}, ${data.email}, ${data.name.trim()}, ${passwordHash}, 'free', NOW())
    `;

    // Create session
    const sessionToken = generateId();
    const sessionId = generateId();
    await sql`
      INSERT INTO sessions (id, user_id, token, expires_at, created_at)
      VALUES (${sessionId}, ${userId}, ${sessionToken}, NOW() + INTERVAL '7 days', NOW())
    `;

    return {
      success: true,
      user: { id: userId, email: data.email, name: data.name.trim(), subscription_tier: "free" },
      sessionToken,
    };
  });
