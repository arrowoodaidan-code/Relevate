import { measureGlyphMetrics } from "/home/team/shared/site/src/lib/render";
import { readFile } from "node:fs/promises";

const fonts: [string,string][] = [
  ["Relevate Sans","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
  ["Relevate Serif","/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
  ["Relevate Mono","/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
  ["Relevate Display","/home/team/shared/design-assets/fonts/PlayfairDisplay-Regular.ttf"],
  ["Relevate Script","/home/team/shared/design-assets/fonts/GreatVibes-Regular.ttf"],
  ["Relevate Condensed","/home/team/shared/design-assets/fonts/BebasNeue-Regular.ttf"],
];
const t0 = Date.now();
for (const [name, path] of fonts) {
  const buf = await readFile(path);
  const g = await measureGlyphMetrics(buf);
  console.log(`${name}: {capEm:${g.capEm.toFixed(6)}, ascEm:${g.ascEm.toFixed(6)}, descEm:${g.descEm.toFixed(6)}, baselineEm:${g.baselineEm.toFixed(6)}}`);
}
console.log("total ms (cold, Satori passes):", Date.now()-t0);
