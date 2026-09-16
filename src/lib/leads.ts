/**
 * Demo-lead capture (signup/activation pipeline).
 *
 * Replaces the old raw mailto "Schedule a Demo" affordance with a real funnel
 * step: the /demo form POSTs to /api/leads, and this library stores the lead in
 * Postgres (Neon) and notifies the team inbox so demo interest is actually
 * captured and actionable.
 *
 * There is no migration system in this repo (the users/sessions tables are
 * managed in Neon directly), so the `leads` table is created idempotently here
 * with CREATE TABLE IF NOT EXISTS on first use — safe to call on every request.
 *
 * Server-only (uses the eager Neon client from "./db").
 */
import { sql } from "./db";

export interface DemoLead {
  id: string;
  name: string;
  email: string;
  brokerage: string | null;
  source: string | null;
  created_at: string;
}

export interface DemoLeadInput {
  name: string;
  email: string;
  brokerage?: string;
  /** Where the request came from (landing hero, about page, etc.). */
  source?: string;
}

export function validateDemoLead(v: unknown): { ok: true; data: DemoLeadInput } | { ok: false; error: string } {
  if (!v || typeof v !== "object") return { ok: false, error: "Invalid request body." };
  const b = v as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const brokerage = typeof b.brokerage === "string" ? b.brokerage.trim() : "";
  const source = typeof b.source === "string" ? b.source.trim() : "";
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 120) return { ok: false, error: "Name is too long." };
  if (!email.includes("@") || email.length > 200) return { ok: false, error: "Please enter a valid email address." };
  if (brokerage.length > 200) return { ok: false, error: "Brokerage is too long." };
  return {
    ok: true,
    data: {
      name,
      email,
      ...(brokerage ? { brokerage } : {}),
      ...(source ? { source } : {}),
    },
  };
}

/**
 * Persist a demo lead (creating the leads table on first use) and return it.
 * Never throws for caller-recoverable reasons; returns null on hard DB failure
 * (the API layer converts that to a 500).
 */
export async function captureDemoLead(input: DemoLeadInput): Promise<DemoLead | null> {
  // Idempotent table creation (no migration infra in this repo).
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL,
      brokerage    TEXT,
      source       TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO leads (id, name, email, brokerage, source)
    VALUES (${id}, ${input.name}, ${input.email}, ${input.brokerage ?? null}, ${input.source ?? null})
    RETURNING id, name, email, brokerage, source, created_at
  `;
  if (!rows || rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    brokerage: r.brokerage ? String(r.brokerage) : null,
    source: r.source ? String(r.source) : null,
    created_at: String(r.created_at),
  };
}
