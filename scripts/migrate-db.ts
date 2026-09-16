// Migration script to create production database tables in Neon
import { sql } from "../src/db";

const db = sql();

async function migrate() {
  console.log("Running database migration...");

  await db`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subscription_tier TEXT NOT NULL DEFAULT 'starter',
      password_hash TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ users table");

  await db`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ sessions table");

  await db`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      address TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ properties table");

  await db`
    CREATE TABLE IF NOT EXISTS generated_content (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL REFERENCES properties(id),
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ generated_content table");

  // Saved design templates (template-replica renderer persistence).
  // image_data_url holds the uploaded raster template (≤4MB base64 data URL);
  // width/height are its natural pixel dimensions (determine flyer vs social);
  // style_description is the vision-analysis brand/style summary (nullable);
  // regions is a JSONB array of TemplateRegion (id, label, kind, fractional
  // x/y/w/h 0–1, optional textColor/fontFamily/fontWeight/fontSizePx/align).
  await db`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      image_data_url TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      style_description TEXT,
      regions JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ templates table");
  // User-created from-scratch design templates (rev-35 pivot / task 856289a6).
  // `design` holds the full DesignDoc JSONB (native layers — no raster), with
  // width/height mirrored to columns for convenience. Reopening into the
  // editor / rendering read straight from `design`.
  await db`
    CREATE TABLE IF NOT EXISTS design_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      design JSONB NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ design_templates table");

    console.log("Migration complete!");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
