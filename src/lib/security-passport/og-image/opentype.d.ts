// The slice of `@shuding/opentype.js` the preview image uses. The package
// ships no types; this declares only what og-image/text.ts calls, so a use of
// anything else is a compile error rather than a guess.
declare module "@shuding/opentype.js" {
  export interface PathCommand {
    readonly type: "M" | "L" | "C" | "Q" | "Z";
    readonly x?: number;
    readonly y?: number;
    readonly x1?: number;
    readonly y1?: number;
    readonly x2?: number;
    readonly y2?: number;
  }
  export interface OpenTypePath {
    readonly commands: readonly PathCommand[];
  }
  export interface Font {
    readonly unitsPerEm: number;
    charToGlyphIndex(ch: string): number;
    getAdvanceWidth(
      text: string,
      fontSize: number,
      options?: { readonly kerning?: boolean },
    ): number;
    getPath(
      text: string,
      x: number,
      y: number,
      fontSize: number,
      options?: { readonly kerning?: boolean },
    ): OpenTypePath;
  }
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
