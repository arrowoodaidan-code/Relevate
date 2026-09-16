/**
 * Vision-analyze the owner's editor screenshot(s) to characterize the region
 * overlay / box misalignment vs the actual text/images on the canvas.
 *
 * The owner's #1 blocker: "editable region overlays/boxes do NOT line up with
 * the actual text/images on the canvas." This script asks gpt-4o to describe
 * the NATURE of the misalignment (offset direction, scale, which elements) so
 * we can match it against deterministic code/coordinate findings.
 */
import { readFileSync } from "node:fs";

const SHOTS = process.argv.slice(2);
if (!SHOTS.length) {
  SHOTS.push(
    "/home/team/shared/Screenshot_20-8-2026_10238_site-jdrtk31q1-aidan-1616.vercel.app.jpeg",
    "/home/team/shared/Screenshot_20-8-2026_9830_site-3jf1xcgov-aidan-1616.vercel.app.jpeg",
  );
}

const system = `You are a meticulous UI-QA inspector specializing in pixel-coordinate alignment of in-place design editors.
I am going to give you a screenshot of a Canva-style editor where EDITABLE REGION BOXES (dashed/highlighted selection rectangles) are overlaid on top of a raster design (a real-estate flyer / graphic). The boxes are interactive: each box should perfectly contain the text line or image it edits, at the exact same position and scale.
Look VERY carefully at how accurately each visible selection box lines up with the element it is supposed to contain. Report on the ALIGNMENT between boxes and their content. Describe for each box:
- what element it appears to edit (a headline, subheadline, body paragraph, photo, logo, etc.)
- whether the box boundary matches the element's actual position and extent, and how it is off (box too big / too small / shifted up-down / shifted left-right / rotated / wrong aspect ratio / centered-offset)
- whether the box seems to be at a DIFFERENT SCALE than the image (e.g. box covers content that is visually larger/smaller than the box)
- the apparent ratio/direction of the offset if you can estimate it (e.g. boxes a scaled-up version of the image, boxes offset toward bottom-right, etc.)
IMPORTANT: This is a product screenshot of a demo UI — IGNORE browser chrome, buttons, form fields, toolbars, sidebars, nav. Focus ONLY on the editor canvas region: the raster design + its overlay boxes.
Be concrete and quantitative where possible. If the alignment is EXACT, say so for that box (don't invent defects). If some boxes line up and others don't, distinguish them.`;

const user = "Analyze the editor canvas in this screenshot. For each visible selection/region box, state the element it edits and precisely how well (or poorly) the box lines up with that element — offset direction, scale mismatch, and any estimate of the offset magnitude.";

async function main() {
  for (const shot of SHOTS) {
    const b64 = readFileSync(shot).toString("base64");
    const mime = shot.endsWith(".png") ? "image/png" : "image/jpeg";
    console.log(`\n================= ${shot} =================`);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: [
            { type: "text", text: user },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } },
          ] },
        ],
      }),
    });
    const j = (await res.json()) as any;
    console.log(j?.choices?.[0]?.message?.content ?? JSON.stringify(j, null, 2));
  }
}

main().catch((e) => { console.error("ERR", e); process.exit(1); });
