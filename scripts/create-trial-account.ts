/**
 * Create (or refresh) a time-boxed trial account.
 *
 * Parameterized via argv/env — NO credentials are hardcoded here.
 *
 *   DATABASE_URL="postgres://..." node --experimental-strip-types scripts/create-trial-account.ts \
 *     --email neil@monaghan-co.com \
 *     --name "Neil Monaghan" \
 *     --password 'RelevateTrial!' \
 *     --starts 2026-09-16T21:00:00Z \
 *     --ends   2026-09-20T21:00:00Z \
 *     --tier demo
 *
 * (or env: TRIAL_EMAIL / TRIAL_NAME / TRIAL_PASSWORD / TRIAL_STARTS / TRIAL_ENDS / TRIAL_TIER)
 *
 * Hashes exactly like src/lib/auth's Node fallback (salt:key scrypt).
 * IMPORTANT: production runs on Node (Vercel runtime) where verifyPassword
 * uses scrypt "salt:hash" — NOT Bun's bcrypt. Do NOT switch to Bun.password.hash.
 * Idempotent: upserts by email (refreshes password/tier/window, keeps user id).
 */
import { neon } from "@neondatabase/serverless";
import { randomUUID, randomBytes, scrypt } from "node:crypto";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

const EMAIL = argValue("--email") ?? process.env.TRIAL_EMAIL;
const NAME = argValue("--name") ?? process.env.TRIAL_NAME;
const PASSWORD = argValue("--password") ?? process.env.TRIAL_PASSWORD;
const STARTS = argValue("--starts") ?? process.env.TRIAL_STARTS;
const ENDS = argValue("--ends") ?? process.env.TRIAL_ENDS;
const TIER = argValue("--tier") ?? process.env.TRIAL_TIER ?? "demo";

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
  if (!EMAIL || !NAME || !PASSWORD || !STARTS || !ENDS) {
    console.error(
      "Usage: DATABASE_URL=... node --experimental-strip-types scripts/create-trial-account.ts \\\n" +
        "  --email <email> --name '<name>' --password '<password>' \\\n" +
        "  --starts <ISO UTC> --ends <ISO UTC> [--tier demo]",
    );
    process.exit(1);
  }
  const startMs = Date.parse(STARTS);
  const endMs = Date.parse(ENDS);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    console.error("ERROR: --starts/--ends must be ISO-8601 timestamps");
    process.exit(1);
  }
  if (endMs <= startMs) {
    console.error("ERROR: --ends must be after --starts");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required");
    process.exit(1);
  }
  const sql = neon(databaseUrl);
  const passwordHash = await hashPasswordNode(PASSWORD);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const existing = await sql`SELECT id FROM users WHERE email = ${EMAIL}`;
  if (existing.length > 0) {
    const id = String(existing[0].id);
    await sql`
      UPDATE users
      SET name = ${NAME},
          subscription_tier = ${TIER},
          password_hash = ${passwordHash},
          access_starts_at = ${startIso},
          access_expires_at = ${endIso}
      WHERE email = ${EMAIL}
    `;
    console.log(`✅ Updated trial account (id=${id})`);
  } else {
    const id = randomUUID();
    await sql`
      INSERT INTO users (id, email, name, subscription_tier, password_hash, created_at, access_starts_at, access_expires_at)
      VALUES (${id}, ${EMAIL}, ${NAME}, ${TIER}, ${passwordHash}, ${new Date().toISOString()}, ${startIso}, ${endIso})
    `;
    console.log(`✅ Created trial account (id=${id})`);
  }
  const row = await sql`
    SELECT id, email, name, subscription_tier, access_starts_at, access_expires_at
    FROM users WHERE email = ${EMAIL} LIMIT 1
  `;
  console.log(JSON.stringify(row[0], null, 2));
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
