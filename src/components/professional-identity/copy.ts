// Copy for the Professional Identity surfaces.
//
// ── WHY IT IS AUTHORED HERE AND NOT IN dictionaries.ts ─────────────────
//
// Both patterns are in use in this codebase and both are first-class. The
// dictionary carries the chrome — navigation, account, auth — where one
// string is read by many surfaces and a key is the only sane way to find
// them all. Page copy that belongs to exactly one screen is authored as
// `c(sv, en)` pairs beside that screen, which is what
// `_authenticated.my-career.index.tsx` already does at length.
//
// The property that matters is the same either way and is what the guard
// script asserts: Swedish and English are authored TOGETHER, in one place,
// so a sentence cannot be added in one language and forgotten in the
// other. A pair makes that structurally impossible rather than merely
// checked.

export type Lang = "sv" | "en";
export type Copy = { readonly sv: string; readonly en: string };

export const c = (sv: string, en: string): Copy => ({ sv, en });

/** Read one pair in the active language. */
export function L(value: Copy, lang: Lang): string {
  return value[lang];
}

/** Interpolate a single {0} placeholder. Enough for every count this
 *  product shows, and deliberately not a template engine. */
export function Lf(value: Copy, lang: Lang, arg: string | number): string {
  return value[lang].replace("{0}", String(arg));
}
