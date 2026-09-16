/**
 * POST /api/auth/login
 * Authenticates a user with email/password and returns a session.
 * All node:crypto usage is inside the handler to avoid client-bundle breakage.
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/lib/db";

export const login = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => {
    if (!data.email?.includes("@")) throw new Error("Invalid email");
    if (!data.password) throw new Error("Password is required");
    return data;
  })
  .handler(async ({ data }) => {
    const { scrypt } = await import("node:crypto");

    async function verifyPassword(
      password: string,
      hash: string
    ): Promise<boolean> {
      const [salt, key] = hash.split(":");
      return new Promise((resolve, reject) => {
        scrypt(password, salt, 64, (err: any, derivedKey: Buffer) => {
          if (err) reject(err);
          resolve(derivedKey.toString("hex") === key);
        });
      });
    }

    const users = await sql`
      SELECT id, email, name, password_hash, subscription_tier
      FROM users WHERE email = ${data.email} LIMIT 1
    `;

    if (users.length === 0) {
      return { success: false, error: "Invalid email or password" };
    }

    const user = users[0];

    if (!user.password_hash) {
      return { success: false, error: "Invalid email or password" };
    }

    const valid = await verifyPassword(data.password, user.password_hash);
    if (!valid) {
      return { success: false, error: "Invalid email or password" };
    }

    // Create new session
    const sessionToken = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    await sql`
      INSERT INTO sessions (id, user_id, token, expires_at, created_at)
      VALUES (${sessionId}, ${user.id}, ${sessionToken}, NOW() + INTERVAL '7 days', NOW())
    `;

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_tier: user.subscription_tier,
      },
      sessionToken,
    };
  });
