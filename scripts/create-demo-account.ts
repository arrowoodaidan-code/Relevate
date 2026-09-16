/**
 * Seed script: Create or update the never-billing demo account.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." bun run scripts/create-demo-account.ts
 *
 * The script reads DATABASE_URL from the environment (the same variable the
 * server uses) so it can be pointed at production or preview DBs.
 *
 * Idempotent — safe to run multiple times (UPSERT by email).
 */
import { neon } from "@neondatabase/serverless";
import { randomUUID, randomBytes, scrypt } from "node:crypto";

const DEMO_EMAIL = "relevaterealestate.auto@gmail.com";
const DEMO_NAME = "Relevate Demo";
const DEMO_TIER = "demo";
const DEMO_PASSWORD = "AidanA415!";

/**
 * Hash exactly like src/lib/auth's Node fallback (salt:key scrypt).
 * IMPORTANT: production runs on Node (Vercel runtime), where verifyPassword
 * uses scrypt with "salt:hash" format — NOT Bun's bcrypt. The seed must
 * therefore generate the Node scrypt format, or production login will reject
 * the demo account. Do NOT switch this to Bun.password.hash.
 */
function hashPasswordNode(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required");
    console.error('  DATABASE_URL="postgres://..." bun run scripts/create-demo-account.ts');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  // Check if the user already exists
  const existing = await sql`SELECT id FROM users WHERE email = ${DEMO_EMAIL}`;
  // Node scrypt format — matches production verifyPassword (see note above)
  const passwordHash = await hashPasswordNode(DEMO_PASSWORD);
  const now = new Date().toISOString();

  if (existing.length > 0) {
    // Update existing user — set tier to demo and refresh password hash
    await sql`
      UPDATE users
      SET password_hash = ${passwordHash},
          subscription_tier = ${DEMO_TIER},
          name = ${DEMO_NAME}
      WHERE email = ${DEMO_EMAIL}
    `;
    console.log(`✅ Updated: ${DEMO_EMAIL} → tier=${DEMO_TIER}, name="${DEMO_NAME}"`);
  } else {
    // Create new demo user
    const id = randomUUID();
    await sql`
      INSERT INTO users (id, email, name, subscription_tier, password_hash, created_at)
      VALUES (${id}, ${DEMO_EMAIL}, ${DEMO_NAME}, ${DEMO_TIER}, ${passwordHash}, ${now})
    `;
    console.log(`✅ Created: ${DEMO_EMAIL} → tier=${DEMO_TIER}, name="${DEMO_NAME}", id=${id}`);
  }
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});