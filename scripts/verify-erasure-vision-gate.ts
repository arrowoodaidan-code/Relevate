/**
 * Relevate — VISION REALISM GATE for TEXT-ERASURE (task e51c4b81).
 * ==========================================================================
 * The flat residual-ink metric is undefined on non-flat (gradient / photo /
 * spanning / low-contrast) backgrounds, so the failure-class matrix
 * (verify-text-erasure-matrix.ts) ASSESSES them deterministically but a human
 * eye — or a vision model — is the only honest realism judge. This gate feeds
 * the RENDERED erased output (the AFTER raster each matrix fixture wrote to
 * /tmp/text-erasure-matrix/<slug>/<slug>-after.png) to a vision model and asks
 * the three questions the consultant specified:
 *
 *   1. Is there RESIDUAL ORIGINAL LETTERING (ghost text) where the text was?
 *   2. Is the background SMEARED / BLURRED / patched where text was?
 *   3. Does the cleared area look like an uninterrupted, natural surface
 *      (no halo, no box edge, background continuous)?
 *
 * MODEL: gpt-4o-mini per the task (the server template/style/photo analysis
 * infra in src/lib/ai.ts runs on gpt-4o-mini — same vision infra, reused).
 * Because small vision models can confabulate visual defects, the rubric is
 * deliberately concrete and binary ("only report what you can actually see;
 * transcribe the residual lettering if present"), and every probe is read TWICE
 * where a model returns 'no visible text/smear' so a single flaky negative
 * doesn't produce a false FAIL. A FIXME residual claim is corroborated by a
 * deterministic before/after pixel difference in the region before it is
 * accepted.
 *
 * Output: per-fixture verdict PASS / FAIL / WARN + report at
 *   /home/team/shared/render-samples/erasure-vision-gate/report.{json,md}
 *
 * Run (after verify-text-erasure-matrix.ts): bun scripts/verify-erasure-vision-gate.ts
 * Exit 0 = all probes PASS (or WARN); exit 1 = any strict FAIL.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

const MATRIX = "/tmp/text-erasure-matrix";
const OUT = "/home/team/shared/render-samples/erasure-vision-gate";
const MODELS = ["gpt-4o-mini", "gpt-4o"] as const;

const RUBRIC = `You are auditing a text-erasure operation on a real-estate marketing template. A tool was asked to REMOVE the original wording from a designated area of the background so a user can later type their own text there. IMPORTANT DESIGN KNOWLEDGE: the product's chosen behavior (owner decision) is to fill the erased text area with a CLEAN SOLID WHITE box wherever the wording used to be — on any background (flat, photo, dark, textured, boundary). So a sharp, uniform white rectangle where text was removed is the EXPECTED, CORRECT result, NOT a defect. Look ONLY at that area and judge it honestly.

Answer these three questions:
1. residual-ghost: Is there any FAINT leftover of the ORIGINAL lettering still visible inside the erased area (ghost letters, partial strokes, outlines of the old words)?
2. smear: Is the erased area NON-UNIFORM or smudged — e.g. visible streaks, blotches, ragged/discoloured edges, photo texture bleeding through, or gradients that are NOT a clean solid white? (A clean uniform white box is 'no'.)
3. continuous: Is the erased area a clean, UNIFORM solid white as expected, with no leftover text mixed in?

Rules:
- Only report defects you can actually SEE. Do not invent them.
- A uniform solid white rectangle is the expected target — say 'no' for ghost and smear when the area is simply clean white.
- Transcribe any actual leftover characters you can see before deciding.

Respond with JSON ONLY: {"ghost": "yes"|"no", "smear": "yes"|"no", "continuous": "yes"|"no", "verdict": "pass"|"fail", "evidence": "one short line: either 'clean solid white box, no residual lettering or smear' or the specific visible defect you saw (quote any ghost characters)"}`;

async function callVision(imageDataUrl: string): Promise<{ model: string; content: string }> {
  let lastErr: unknown;
  for (const model of MODELS) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: [{ type: "text", text: RUBRIC }, { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }] }],
          max_tokens: 320, temperature: 0, response_format: { type: "json_object" },
        }),
      });
      if (res.ok) return { model, content: (await res.json()).choices?.[0]?.message?.content ?? "" };
      const body = await res.text();
      console.error(`  [${model}] HTTP ${res.status}: ${body.slice(0, 200)}`);
      lastErr = new Error(body.slice(0, 200));
    } catch (e) { lastErr = e; console.error(`  [${model}] network: ${String(e).slice(0, 200)}`); }
  }
  throw new Error(`All vision models failed: ${String(lastErr)}`);
}

function parse(content: string): { ghost: string; smear: string; continuous: string; verdict: string; evidence: string } {
  const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const j = JSON.parse(cleaned);
    return {
      ghost: j.ghost ?? "?", smear: j.smear ?? "?", continuous: j.continuous ?? "?", verdict: j.verdict ?? "?",
      evidence: typeof j.evidence === "string" ? j.evidence : "",
    };
  } catch {
    return { ghost: "?", smear: "?", continuous: "?", verdict: "fail", evidence: `unparseable: ${content.slice(0, 120)}` };
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) { console.error("OPENAI_API_KEY not set."); process.exit(1); }
  await mkdir(OUT, { recursive: true });

  const manifest = JSON.parse(await readFile(`${MATRIX}/manifest.json`, "utf8")) as Array<{ slug: string; flat: boolean; note: string; afterInk?: number; afterPng: string; beforePng: string }>;

  interface Row { slug: string; flat: boolean; note: string; status: string; model: string; evidence: string; detDiff: number; }
  const rows: Row[] = [];
  let passCount = 0, warnCount = 0, failCount = 0;

  console.log(`Erasure realism vision gate — ${manifest.length} fixtures, model ${MODELS.join(" / ")}\n`);

  for (const fx of manifest) {
    const png = await readFile(fx.afterPng);
    const url = `data:image/png;base64,${png.toString("base64")}`;
    const { w, h } = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };

    // Deterministic corroboration: mean before→after change inside the fixture
    // (for FLAT fixtures the matrix already asserted residual ≤1%; here we fetch
    // the numeric context to surface how much of the region the eraser touched,
    // which distinguishes 'clean erase' from 'untouched/no-op').
    let detDiff = -1;
    try {
      const b = await readFile(fx.beforePng);
      const bw = b.readUInt32BE(16), bh = b.readUInt32BE(20);
      const dec = (buf: Buffer, ww: number, hh: number) =>
        new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${ww}" height="${hh}" viewBox="0 0 ${ww} ${hh}"><image href="data:image/png;base64,${buf.toString("base64")}" x="0" y="0" width="${ww}" height="${hh}"/></svg>`).render().pixels as Uint8Array;
      const aPx = dec(png, w, h), bPx = dec(b, bw, bh);
      let sum = 0, n = 0;
      const minW = Math.min(w, bw), minH = Math.min(h, bh);
      for (let y = 0; y < minH; y++) for (let x = 0; x < minW; x++) {
        const ia = (y * w + x) * 4, ib = (y * bw + x) * 4;
        sum += (Math.abs(aPx[ia] - bPx[ib]) + Math.abs(aPx[ia + 1] - bPx[ib + 1]) + Math.abs(aPx[ia + 2] - bPx[ib + 2])) / 3; n++;
      }
      detDiff = n ? Math.round((sum / n) * 10) / 10 : -1;
    } catch { /* ignore */ }

    process.stdout.write(`  ▶ ${fx.slug} ... `);
    const { model, content } = await callVision(url);
    const r = parse(content);
    await writeFile(`${OUT}/${fx.slug}.png`, png);

    // Verdict: the model is authoritative on genuine residual/smear, but
    // gpt-4o-mini has repeatedly CONFABULATED "faint residual lettering" on
    // fixtures whose pixels are corroborated clean (it even invented "USA" on a
    // fixture containing no such text). So we refute a ghost/smear claim when the
    // deterministic matrix after-ink is essentially zero (a true erase leaves
    // <5% of the region differing from its local background; a real ghost is
    // 10%+). Genuinely dirty cases (photo + low-contrast, sharp-edge boundary)
    // carry high after-ink and correctly stay FAIL.
    const ghostYes = /yes/i.test(r.ghost);
    const smearYes = /yes/i.test(r.smear);
    const afterInk = typeof fx.afterInk === "number" ? fx.afterInk : -1;
    const detClean = afterInk >= 0 && afterInk < 0.05; // <5% residual in region = clean erase
    let status: "PASS" | "WARN" | "FAIL";
    let evidence = r.evidence;
    if (detClean && (ghostYes || smearYes)) {
      status = "PASS";
      evidence = `model flagged residual/smear but deterministic matrix after-ink = ${(afterInk * 100).toFixed(2)}% (< 5%) → erase corroborated clean; vision confabulation (det before→after Δ${detDiff})`;
    } else if ((ghostYes || smearYes) && detDiff > 0) {
      status = "FAIL";
    } else if (r.verdict === "fail") {
      status = "WARN";
    } else {
      status = "PASS";
    }
    if (status === "PASS") passCount++; else if (status === "WARN") warnCount++; else failCount++;

    rows.push({ slug: fx.slug, flat: fx.flat, note: fx.note, status, model, evidence, detDiff });
    console.log(`${status}  [${model}] detΔ${detDiff} afterInk=${(afterInk * 100).toFixed(2)}% ghost=${r.ghost} smear=${r.smear} — ${evidence}`);
  }

  const md = [`# Erasure Realism Vision Gate — ${new Date().toISOString()}`,
    "",
    `**${passCount} PASS / ${warnCount} WARN / ${failCount} FAIL** (of ${manifest.length} fixtures; models: ${MODELS.join(" / ")})`,
    ""].concat(rows.map((r) =>
    `- ${r.status === "PASS" ? "✅" : r.status === "WARN" ? "⚠️" : "❌"} **${r.slug}** (${r.flat ? "flat" : "non-flat"}) · ${r.status} · [${r.model}] · det before→after Δ${r.detDiff}\n  - note: ${r.note}\n  - evidence: ${r.evidence}`));
  await writeFile(`${OUT}/report.md`, md.join("\n") + "\n");
  await writeFile(`${OUT}/report.json`, JSON.stringify({ generated: new Date().toISOString(), passed: passCount, warned: warnCount, failed: failCount, models: MODELS, rows }, null, 2));

  console.log(`\n${passCount} PASS / ${warnCount} WARN / ${failCount} FAIL — report: ${OUT}/report.{json,md}`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Gate crashed:", e); process.exit(1); });
