# -*- coding: utf-8 -*-
import sys, os
p = "src/lib/auth.ts"; src = open(p, encoding="utf-8").read()
h_start = src.find("/**\n * Time-boxed access windows (trial accounts).")
h_end = src.find("/**\n * Log in an existing user. Verifies password and returns a session.\n */")
if h_start < 0 or h_end <= h_start: print("REV FAIL helpers"); sys.exit(1)
src = src[:h_start] + src[h_end:]
pairs = [
("""    SELECT id, email, name, subscription_tier, password_hash, created_at,
           access_starts_at, access_expires_at
    FROM users WHERE email = ${email}""","""    SELECT id, email, name, subscription_tier, password_hash, created_at
    FROM users WHERE email = ${email}"""),
("""  if (!valid) throw new Error("Invalid email or password");

  // Time-boxed trial gate — only reached with a correct password, so the
  // distinct window messages never reveal whether an email exists.
  assertAccessWindowOpen(row);

  const session = await createSession(row.id);""","""  if (!valid) throw new Error("Invalid email or password");

  const session = await createSession(row.id);"""),
("""  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  // Cap the 7-day session at the user's trial window end (if any), so a
  // session issued inside a 4-day trial dies with the trial.
  const windowRows = await db`
    SELECT access_expires_at FROM users WHERE id = ${userId} LIMIT 1
  `;
  const accessExpiresAt = windowRows.length > 0 ? (windowRows[0].access_expires_at ?? null) : null;
  const expiresAt = capExpiryAtWindow(
    new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    accessExpiresAt ? new Date(accessExpiresAt).toISOString() : null,
  );""","""  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();"""),
("""           u.id, u.email, u.name, u.subscription_tier, u.created_at,
           u.access_expires_at
    FROM sessions s""","""           u.id, u.email, u.name, u.subscription_tier, u.created_at
    FROM sessions s"""),
("""  const expiresAt = new Date(row.expires_at);
  // Time-boxed trial: a session must not outlive the user's access window.
  const windowClosed = row.access_expires_at != null && Date.now() >= new Date(row.access_expires_at).getTime();

  if (expiresAt < new Date() || windowClosed) {
    // Session expired, or the user's trial window has closed — clean it up
    // so a session issued inside the window cannot outlive the trial.
    await db`DELETE FROM sessions WHERE id = ${row.sid}`;
    return null;
  }""","""  const expiresAt = new Date(row.expires_at);

  if (expiresAt < new Date()) {
    // Session expired, clean it up
    await db`DELETE FROM sessions WHERE id = ${row.sid}`;
    return null;
  }"""),
]
for pair in pairs:
    old, new = pair[0], pair[1]
    if src.count(old) != 1:
        print("REV FAIL pair " + str(pairs.index(pair))); sys.exit(1)
    src = src.replace(old, new, 1)
open(p, "w", encoding="utf-8").write(src)
s2 = open("scripts/migrate-db.ts", encoding="utf-8").read()
start = s2.find("  // Time-boxed trial windows (task b8d0d115).")
endm = s2.find("  console.log(\"\u2713 users.access_starts_at / access_expires_at (nullable trial window)\");")
if start < 0 or endm < 0:
    print("REV FAIL migrate"); sys.exit(1)
endm = s2.find("\n", endm) + 1
open("scripts/migrate-db.ts", "w", encoding="utf-8").write(s2[:start] + s2[endm:])
if os.path.exists("scripts/create-trial-account.ts"):
    os.remove("scripts/create-trial-account.ts")
print("BASELINE_OK")
