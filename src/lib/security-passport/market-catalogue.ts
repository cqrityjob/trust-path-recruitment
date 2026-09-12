// Security Passport — the credential catalogue, as data.
//
// ── ONE CATALOGUE, THREE SURFACES ──────────────────────────────────────
//
// "Mina uppgifter", the credential form and the Passport overview each used
// to render their own list of what a holder may register: a flat row of
// buttons here, a radio grid there, a code-only chip on the front page. Three
// renderings of one fact is three places for it to drift, and it did — the
// entry page passed the governed catalogue only for a PRODUCTION market,
// while the form and the section it fed already understood a pilot one. An
// entitled pilot holder saw the market status line and no credentials under
// it.
//
// This module is the one answer all three surfaces now share. It is pure:
// no React, no server, no Supabase. The route resolves the market with
// `getRegulatedCredentialAvailability`; this decides what a surface may OFFER
// from that answer, how the options are grouped and how a search narrows
// them. Every rule here is asserted by scripts/passport-market-catalogue-check.
//
// ── NOTHING HERE IS MARKET-SPECIFIC ────────────────────────────────────
//
// There is no Swedish, British or Dubai array in this file. The rows come
// from `sp_credential_types` through the server tier, with `category` and
// `sort_order` decided in the database. A fourth market pack changes what
// these functions return without changing a line of them.

import type { CredentialCategory } from "./credentials";

/** One registrable credential, as every catalogue surface needs it.
 *
 *  Structural rather than the full `CredentialType`: the overview and the
 *  entry section hold only what they render, the form holds the whole row,
 *  and both satisfy this shape without conversion. */
export interface CatalogueOption {
  readonly code: string;
  /** `sp_credential_types.category`. The grouping key — a qualification is
   *  never a licence, and the catalogue says so by putting them under
   *  different headings rather than by relying on the name. */
  readonly category: CredentialCategory;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly symbolLabel: string | null;
}

/** The two headings every market's catalogue is grouped under.
 *
 *  Deliberately two and not three: "licences, appointments and cadre cards"
 *  are all `appointment` rows in the taxonomy — an authorisation somebody
 *  decided to grant, with an end date — and "training and qualifications"
 *  are all `qualification` rows. The heading text says all three words so a
 *  British or Dubai reader recognises their own credential under it. */
export interface CatalogueGroups {
  readonly appointments: readonly CatalogueOption[];
  readonly qualifications: readonly CatalogueOption[];
}

/** The market states in which a surface may offer a catalogue at all.
 *
 *  "open" and "open_pilot" are the two, and the ONLY two. Every other state
 *  is a different absence — no work country, a pack under review, no pack —
 *  and none of them gets a list, whatever the caller happens to hold. */
export type OfferableMarketState = "open" | "open_pilot";

export function isOfferableMarketState(state: string | null | undefined): boolean {
  return state === "open" || state === "open_pilot";
}

/** What a surface may offer, from the governed availability answer.
 *
 *  ── THE DEFECT THIS FUNCTION REPLACES ────────────────────────────────
 *
 *  The entry route wrote `availability?.state === "open" ? types : []`. That
 *  was correct on the day it was written — "open" was the only open state —
 *  and became wrong the day `open_pilot` was added, because a literal
 *  comparison in a route is not something a type checker notices when the
 *  union grows. The section below it and the form after it both used
 *  `state === "open" || state === "open_pilot"`, so the three surfaces
 *  disagreed about the same answer.
 *
 *  The decision lives here now, once, and the routes call it. A caller that
 *  wants to know whether a market is open asks `isOfferableMarketState`;
 *  neither is allowed to restate the comparison. */
export function catalogueOptionsFor<T extends CatalogueOption>(
  availability: { readonly state: string; readonly types: readonly T[] } | null | undefined,
): readonly T[] {
  if (!availability) return [];
  return isOfferableMarketState(availability.state) ? availability.types : [];
}

/** Group by meaning, preserving the database sort order within each group.
 *
 *  A stable partition, never a sort: `sp_credential_types.sort_order` is the
 *  order the market pack's author chose, and this function must not have an
 *  opinion of its own about it. */
export function groupCatalogue<T extends CatalogueOption>(
  options: readonly T[],
): { readonly appointments: readonly T[]; readonly qualifications: readonly T[] } {
  return {
    appointments: options.filter((o) => o.category === "appointment"),
    qualifications: options.filter((o) => o.category === "qualification"),
  };
}

/** Above this many choices a catalogue gains a search field. Dubai's thirty
 *  and Great Britain's thirteen get one; Sweden's eight and Northern
 *  Ireland's one do not, because a search over eight items is a control that
 *  costs more attention than it saves. */
export const CATALOGUE_SEARCH_THRESHOLD = 12;

export function catalogueNeedsSearch(optionCount: number): boolean {
  return optionCount > CATALOGUE_SEARCH_THRESHOLD;
}

/** Fold a query for matching: lower-cased, trimmed, diacritics kept.
 *
 *  Diacritics are NOT stripped. "Väktarutbildning" is what the Swedish
 *  reader types, and stripping would make "vaktar" match while a reader who
 *  typed the correct word would expect exactly that too — both work because
 *  the comparison is a substring of the folded name, and the folded name
 *  keeps its letters. */
function fold(s: string): string {
  return s.trim().toLocaleLowerCase();
}

/** Narrow a catalogue by a free-text query without losing the selection.
 *
 *  Matches the name in BOTH languages and the code, so a reader in the
 *  English interface still finds "Ordningsvaktsförordnande" and a reader who
 *  knows only the code "CCTV" finds the licence. Order is preserved.
 *
 *  `pinnedCode` is always kept in the result, whatever the query. A form
 *  whose chosen credential vanished from the list the moment the holder
 *  typed a search would look as though the choice had been undone; the
 *  choice is the holder's, and the search is a lens, not an edit. */
export function filterCatalogue<T extends CatalogueOption>(
  options: readonly T[],
  query: string,
  pinnedCode: string | null = null,
): readonly T[] {
  const q = fold(query);
  if (q.length === 0) return options;
  return options.filter(
    (o) =>
      o.code === pinnedCode ||
      fold(o.nameSv).includes(q) ||
      fold(o.nameEn).includes(q) ||
      fold(o.code).includes(q) ||
      (o.symbolLabel !== null && fold(o.symbolLabel).includes(q)),
  );
}

/** The one place a credential code becomes a form URL, so the two surfaces
 *  that navigate there build the same search string. */
export const NEW_CREDENTIAL_ROUTE = "/passport/credentials/new" as const;
