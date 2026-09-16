/** Vision-analyze a clean native-res PNG render for layout defects only. */
import { readFileSync } from "node:fs";
const file = process.argv[2];
const b64 = readFileSync(file).toString("base64");
const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";

const system = `You are a meticulous print-layout QA inspector for real estate flyers and social graphics.
This is a CLEAN full-resolution PNG of a single generated graphic (NOT a UI screenshot — there is
no browser chrome, no buttons, no form fields). Judge ONLY the graphic itself.
List EVERY layout defect you can see, however small. For each, name the element and describe
exactly what is wrong. Look hard for:
- elements overlapping / colliding
- clipped or truncated text (cut off at an edge or under another element)
- misaligned / ragged text (left/center/vertical)
- uneven spacing and padding
- the FOR SALE / OPEN HOUSE ribbon: position, overlap, angle
- the price text: does it collide with anything (a label, the photo edge, chips)?
- the Bed/Bath/SqFt chips: alignment, gaps, overlap
- the address / body / footer stacking: awkward gaps or crowding
- the agent / contact line
- the small watermark
- anything that reads as cluttered or "jumbled"
Be concrete and specific. Use approximate coordinates or top/bottom/left/right/center.
If an element looks clean, don't dwell. Output a numbered list of concrete defects, then a short
"TOP FIXES" section. If there are NO significant layout defects, say so clearly.`;

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model: "gpt-4o",
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text: "Analyze this graphic for layout defects." },
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } },
      ] },
    ],
  }),
});
const j = await res.json();
console.log(j?.choices?.[0]?.message?.content ?? JSON.stringify(j, null, 2));
