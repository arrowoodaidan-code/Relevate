/**
 * Vision-analyze the owner's screenshot of the branded flyer/social output
 * (the "jumbled" feedback). Uses gpt-4o vision (same pipeline as the rest of
 * the renderer) to enumerate layout defects: overlap, clipping, misalignment,
 * uneven spacing, awkward stacking, ribbon/band/chip issues.
 */
import { readFileSync } from "node:fs";

const SHOT = "/home/team/shared/Screenshot_20-8-2026_9830_site-3jf1xcgov-aidan-1616.vercel.app.jpeg";

const b64 = readFileSync(SHOT).toString("base64");
const mime = "image/jpeg";

const system = `You are a meticulous print-layout QA inspector for real estate flyers and social graphics.
I am going to give you a screenshot of a product UI showing a generated real-estate flyer / social post.
List EVERY layout defect you can see, however small. For each, name the element involved and
describe exactly what is wrong. Look hard for:
- elements overlapping / colliding with each other
- clipped or truncated text (words cut off at an edge or under another element)
- misaligned text (left/center/vertical misalignment, ragged or uneven)
- uneven / inconsistent spacing and padding
- the FOR SALE ribbon: its position, whether it overlaps the hero photo or text, its angle
- the price band: what it overlaps, contrast, whether text sits well inside it
- Bed / Bath / SqFt chips: alignment, gaps, overlap with text or the photo
- the address / body / footer stacking: line spacing, awkward gaps or crowding
- the agent CTA / contact line
- the watermark: placement, whether it collides with text
- anything that reads as cluttered, imperfect, or "jumbled"
IMPORTANT: this is a product screenshot of a demo UI — IGNORE any browser chrome, buttons,
form fields, toolbars, or app chrome. Only judge the rendered flyer/graphic itself.
Be specific and concrete. If something is fine, don't dwell on it — focus on defects.
Output a numbered list of concrete defects, then a short "TOP FIXES" section.`;

const user = "Analyze the rendered real-estate graphic(s) in this screenshot and list every layout defect precisely.";

async function main() {
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
        {
          role: "user",
          content: [
            { type: "text", text: user },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${b64}`, detail: "high" },
            },
          ],
        },
      ],
    }),
  });
  const j = (await res.json()) as any;
  console.log(j?.choices?.[0]?.message?.content ?? JSON.stringify(j, null, 2));
}

main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
