/**
 * Guard test: DesignDoc template save -> list -> load round-trip fidelity.
 * (rev-35 pivot, task 856289a6)
 *
 * Part 1 (no DB): runs a DesignDoc through the payload validator, JSON
 * round-trips it (simulating the JSONB store), and asserts deep fidelity.
 * Part 2 (real Neon): if DATABASE_URL is set, actually creates a template via
 * the service, lists it, loads it back, asserts the stored DesignDoc matches
 * the normalized design, updates it, and cleans up.
 *
 * Run: bun scripts/test-design-templates.ts
 */
import { randomUUID } from "node:crypto";
import { sql as neonSql } from "../src/db";
import {
  createDesignTemplate,
  deleteDesignTemplate,
  getDesignTemplate,
  listDesignTemplates,
  updateDesignTemplate,
  validateDesignTemplatePayload,
} from "../src/lib/design-templates";
import { makeShapeLayer, makeTextLayer } from "../src/lib/design";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${extra ? " — " + extra : ""}`);
  }
}
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
// Canonicalize values so comparison is insensitive to object key order
// (Postgres JSONB does not preserve key order).
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canon((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

const SAMPLE_DOC = {
  width: 1275,
  height: 1650,
  background: "#ffffff",
  layers: [
    makeTextLayer({
      id: "t1",
      rect: { x: 100, y: 100, w: 500, h: 90 },
      text: "Open House — 123 Maple St",
      fontFamily: "serif",
      fontWeight: 700,
      fontSize: 64,
      color: "#1a2e1a",
      align: "center",
    }),
    makeTextLayer({
      id: "t2",
      rect: { x: 100, y: 220, w: 500, h: 60 },
      text: "Saturday 2–4 PM",
      letterSpacing: 2,
      lineHeight: 1.2,
      uppercase: true,
    }),
    makeShapeLayer({
      id: "s1",
      rect: { x: 540, y: 400, w: 200, h: 120 },
      shape: "ellipse",
      fill: "#2f6f4f",
      rotation: 12,
      opacity: 0.9,
    }),
  ],
};

async function main() {
  console.log("DesignDoc template round-trip guard test\n");

  // ---- Part 1: pure validator + JSON round-trip ----
  console.log("[1] validator + JSON round-trip (no DB)");
  const v = validateDesignTemplatePayload({ name: " Flyer A ", design: SAMPLE_DOC }, false);
  check("create payload validates", v.ok === true);
  if (v.ok) {
    check("name trimmed", v.data.name === "Flyer A");
    const stored = JSON.parse(JSON.stringify(v.data.design)); // simulate JSONB store+load
    check("design JSON round-trip deep-equal", deepEqual(stored, v.data.design));
    check("background preserved", stored.background === "#ffffff");
    check("z-order array preserved (3 layers)", stored.layers.length === 3);
    check("rotation/opacity preserved", stored.layers[2].rotation === 12 && stored.layers[2].opacity === 0.9);
  }

  // update payload with partial fields
  const vPartial = validateDesignTemplatePayload({ name: "Renamed" }, true);
  check("partial update with only name validates", vPartial.ok === true && vPartial.data.design === undefined);

  // invalid payloads rejected
  const bad1 = validateDesignTemplatePayload({ design: { width: 10, height: 10, layers: [] } }, false);
  check("missing name rejected", bad1.ok === false);
  const bad2 = validateDesignTemplatePayload({ name: "x", design: { ...SAMPLE_DOC, width: -5 } }, false);
  check("bad dimension rejected", bad2.ok === false);

  // ---- Part 2: real Neon round-trip (only if DATABASE_URL) ----
  if (!process.env.DATABASE_URL) {
    console.log("\n[2] SKIPPED — DATABASE_URL not set (SKIP)");
  } else {
    console.log("\n[2] real Neon round-trip");
    const db = neonSql();
    const userId = "guard-test-" + randomUUID();
    let cleanup = true;
    try {
      await db`INSERT INTO users (id, email, name, created_at) VALUES (${userId}, ${userId + "@test.local"}, ${userId}, NOW())`;
      const created = await createDesignTemplate(userId, { name: "RoundTrip", design: SAMPLE_DOC });
      check("create returns id", typeof created.id === "string" && created.id.length > 0);
      check("create name", created.name === "RoundTrip");
      check("create design fideltiy", deepEqual(created.design, JSON.parse(JSON.stringify(SAMPLE_DOC))));

      const listed = await listDesignTemplates(userId);
      check("list contains created", listed.some((t) => t.id === created.id));

      const loaded = await getDesignTemplate(userId, created.id);
      check("get returns template", loaded !== null);
      if (loaded) {
        check("loaded design fidelity", deepEqual(loaded.design, JSON.parse(JSON.stringify(SAMPLE_DOC))));
        check("loaded width/height mirrored", loaded.width === 1275 && loaded.height === 1650);
      }

      const notOwned = await getDesignTemplate("some-other-user", created.id);
      check("owner isolation (other user sees null)", notOwned === null);

      const updated = await updateDesignTemplate(userId, created.id, { name: "RoundTrip v2" });
      check("update name", updated?.name === "RoundTrip v2");
      if (updated) check("update kept design", deepEqual(updated.design, JSON.parse(JSON.stringify(SAMPLE_DOC))));

      const promised = await updateDesignTemplate(userId, created.id, {
        design: { ...SAMPLE_DOC, layers: [...SAMPLE_DOC.layers.slice(0, 1)] },
      });
      check("update design (fewer layers)", Array.isArray(promised?.design.layers) && promised!.design.layers.length === 1);

      await deleteDesignTemplate(userId, created.id);
      const gone = await getDesignTemplate(userId, created.id);
      check("delete removes template", gone === null);
      check("list empty after delete", (await listDesignTemplates(userId)).length === 0);
    } catch (err) {
      cleanup = false;
      console.error("  DB round-trip error (this may indicate the design_templates table needs migration):", err);
      failed++;
    } finally {
      try {
        await db`DELETE FROM design_templates WHERE user_id = ${userId}`;
        await db`DELETE FROM users WHERE id = ${userId}`;
      } catch {
        /* ignore cleanup errors */
      }
      if (!cleanup) console.log("  (cleanup still attempted after error)");
    }
  }

  console.log(`\nRESULT: ${failed === 0 ? "PASS ✅" : "FAIL ❌"} (${passed} passed, ${failed} failed)`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
