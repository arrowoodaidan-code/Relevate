/**
 * Database connection utility for Neon Postgres.
 */
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

export const sql = neon(DATABASE_URL);
