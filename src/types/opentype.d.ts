/**
 * Minimal ambient declarations for @shuding/opentype.js (the OpenType parser
 * Satori itself bundles and uses for text layout). Only the surface used by
 * the renderer's EXACT text-width measurement is declared; the package ships
 * no types of its own.
 */
declare module "@shuding/opentype.js" {
  export interface OpentypeGlyph {
    advanceWidth: number;
  }
  export interface OpentypeFont {
    unitsPerEm: number;
    charToGlyph(ch: string): OpentypeGlyph;
  }
  export function parse(buffer: ArrayBuffer): OpentypeFont;
  const opentype: { parse: typeof parse };
  export default opentype;
}
