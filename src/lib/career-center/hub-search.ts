// The Career Center hub's URL state, and the list of professions it shows.
//
// ── ONE PARAMETER ──────────────────────────────────────────────────────
//
// `from` — the reader's stated CURRENT profession, the input to `pathFrom`
// (career-origin.ts). In the URL rather than in component state or the
// profile, for three reasons: an anonymous reader can use it, the resulting
// view is a link somebody can send to a colleague, and choosing a profession
// to explore from is a question, not a change to who you are. A signed-in
// reader's own profile still seeds it when the URL says nothing, and
// `from=none` means "cleared", which is not the same as absent.
//
// ── WHY THE CATALOGUE FILTERS ARE GONE ─────────────────────────────────
//
// The hub used to hide its professions behind "Visa alla yrken" and then
// show a search box, a family filter grouped under four headings, a level
// filter and four more behind "Fler filter" — 29 controls over eleven
// guides. A reader who had just chosen their own profession and followed a
// link onward landed in that block and had to start looking again. Eleven
// guides need no filter: the hub lists every one of them as a card.
//
// The classifications the filters read — family, level, sector, orientation,
// jurisdiction — are unchanged on every profession and still printed on the
// cards and guides. Only the controls went.
//
// ── OLD LINKS STILL OPEN THE PAGE, AND NARROW NOTHING ──────────────────
//
// Links minted for the explorer (`?all=1#utforska-yrken`, `?level=entry`,
// `?family=…`, `?q=…`, a return link stored before this change) still land on
// the hub and on the list. Their parameters are accepted and IGNORED: a
// filter the reader can neither see nor remove would hide professions for no
// visible reason, which is worse than no filter at all. The parser drops
// them, and the hub rewrites the address without them
// (`hasLegacyCatalogueParams`).

import type { ExperienceLevel, Profession } from "./types";
import { experienceLevels } from "./categories";
import { publishedProfessions } from "./publishability";
import { isSelectableOrigin } from "./career-origin";

export interface HubSearch {
  /** A published guide's slug, or `none` (the reader cleared the selector). */
  readonly from?: string;
}

/** Every search parameter the retired explorer wrote. Accepted, never
 *  applied, and removed from the address by the hub. */
export const LEGACY_CATALOGUE_KEYS = [
  "q",
  "family",
  "level",
  "regulated",
  "sector",
  "orientation",
  "country",
  "more",
  "all",
] as const;

/** Route `validateSearch`. Total: any input produces a valid HubSearch, and a
 *  hand-edited or stale `from` degrades to "nothing selected" rather than to
 *  a heading naming a profession that does not exist. */
export function parseHubSearch(raw: Record<string, unknown>): HubSearch {
  const from = typeof raw.from === "string" ? raw.from.trim() : "";
  return from && isSelectableOrigin(from) ? { from } : {};
}

/** Whether a raw search carries anything the retired explorer wrote. */
export function hasLegacyCatalogueParams(raw: Record<string, unknown>): boolean {
  return LEGACY_CATALOGUE_KEYS.some((key) => raw[key] !== undefined);
}

const LEVEL_ORDER: readonly ExperienceLevel[] = experienceLevels.map((l) => l.id);

/**
 * Every published guide, in the order the hub lists them: the level a reader
 * can start at first (ingångsnivå → mellannivå → senior → ledning), then by
 * title in the reading language. An order a reader can see the reason for,
 * rather than the dataset's array position.
 */
export function hubProfessions(
  lang: "sv" | "en",
  list: readonly Profession[] = publishedProfessions,
): Profession[] {
  const title = (p: Profession) => (lang === "sv" ? p.titleSv : p.titleEn);
  return [...list].sort(
    (a, b) =>
      LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
      title(a).localeCompare(title(b), lang),
  );
}
