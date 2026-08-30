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

/**
 * A count-bearing sentence, in both forms.
 *
 * "1 uppgift är inlagd men ännu inte granskad" and "5 uppgifter är inlagda
 * men ännu inte granskade" are not one string with a number in front of
 * them -- Swedish inflects the noun AND both participles. A single template
 * produces "5 uppgift är inlagd", which is the kind of thing a Swedish
 * reader notices immediately and quietly reads as "this was not built for
 * me". The dictionary already has `tp` for exactly this; `Lp` is the same
 * idea for copy authored beside its screen.
 */
export type PluralCopy = { readonly one: Copy; readonly other: Copy };

export const cp = (one: Copy, other: Copy): PluralCopy => ({ one, other });

export function Lp(value: PluralCopy, lang: Lang, count: number): string {
  return Lf(count === 1 ? value.one : value.other, lang, count);
}
