// The profession explorer's filter state, and the URL it round-trips through.
//
// ── WHY THE URL IS THE STATE ───────────────────────────────────────────
//
// The explorer previously held its filters in component state. A visitor who
// narrowed the catalogue to entry-level guarding roles had nothing to send a
// friend, nothing to bookmark, and lost the whole selection on a back button.
// Worse, the hub's own "see roles you can start in with no prior experience"
// entry path had no way to express itself: it could only scroll to an
// unfiltered list and hope.
//
// So the search params ARE the state. `parseExplorerSearch` is the route's
// validateSearch; every control writes through `navigate({ search })`; the
// entry paths are plain links to a pre-filtered URL. Nothing in the explorer
// holds filter state of its own except the search box's uncommitted text.
//
// ── WHY LEVEL IS A LIST AND THE OTHERS ARE NOT ─────────────────────────
//
// "I already work in security — show me roles at the next level" is one of
// the three entry paths, and it means mid AND senior. A single-valued level
// filter would force that promise to under-deliver by hiding half of what it
// offered. Every other axis is genuinely a single choice, so only level pays
// the extra complexity.
//
// Level is carried as a comma-joined string rather than an array because the
// router serialises non-string search values as JSON: `?level=mid,senior` is
// a link a person can read, edit and paste into a chat message, whereas
// `?level=%5B%22mid%22%2C%22senior%22%5D` is not.
//
// ── VALIDATION ─────────────────────────────────────────────────────────
//
// Every value is checked against the taxonomy before it is accepted. A URL
// carrying `?family=nonsense` yields no family filter rather than a chip
// labelled "nonsense" over an empty result — a hand-edited or stale link
// degrades to a wider view, never to a broken one.

import type {
  ExperienceLevel,
  Orientation,
  ProfessionFamilyId,
  Profession,
  Region,
  Sector,
} from "./types";
import { experienceLevels } from "./categories";
import { filterableFamilyIds } from "./meta-groups";
import { publishedProfessions } from "./publishability";

export type RegulatedFilter = "regulated" | "not_regulated";

/** Absent key === no filter. Never store "all" in the URL: an explicit "all"
 *  is indistinguishable from a filter the reader chose, and it makes every
 *  shared link carry six meaningless params. */
export interface ExplorerSearch {
  readonly q?: string;
  readonly family?: ProfessionFamilyId;
  /** Comma-joined ExperienceLevel list, normalised to taxonomy order. Read it
   *  with `selectedLevels`, never by splitting at the call site. */
  readonly level?: string;
  readonly regulated?: RegulatedFilter;
  readonly sector?: Sector;
  readonly orientation?: Orientation;
  readonly country?: Region;
  /** Whether the "Fler filter" disclosure is open. Part of the URL so a
   *  shared link that uses an advanced filter opens showing that control. */
  readonly more?: true;
}

/** The two filters that are always visible. Everything else lives behind
 *  "Fler filter". */
export const PRIMARY_FILTER_KEYS = ["family", "level"] as const;
export const ADVANCED_FILTER_KEYS = ["regulated", "sector", "orientation", "country"] as const;

export type FilterKey =
  | (typeof PRIMARY_FILTER_KEYS)[number]
  | (typeof ADVANCED_FILTER_KEYS)[number];

const LEVEL_VALUES: readonly ExperienceLevel[] = experienceLevels.map((l) => l.id);
const SECTOR_VALUES: readonly Sector[] = ["public", "private", "hybrid"];
const ORIENTATION_VALUES: readonly Orientation[] = [
  "operational",
  "technical",
  "analytical",
  "leadership",
];
const REGULATED_VALUES: readonly RegulatedFilter[] = ["regulated", "not_regulated"];
const REGION_VALUES: readonly Region[] = ["SE", "NORDICS", "EU", "UK", "US", "INTL"];

// ── WHAT THE CONTROLS OFFER ────────────────────────────────────────────
//
// Only values that some published guide actually carries. Fourteen family
// chips over a catalogue where six families have no guide at all is not a
// filter, it is six guaranteed dead ends and a wall of chips on a phone; the
// same goes for an "Executive" level rung with nothing behind it.
//
// The PARSER is deliberately more permissive than the CONTROLS. A URL may
// legitimately carry a taxonomy-valid value that has no content yet — a link
// shared before a guide was unpublished, or one made in a future state of the
// catalogue. Those are accepted, produce zero results, and are recovered by
// `nearestNonEmpty`, which is a better outcome than silently widening a link
// into a view the sender never saw. Only values that are not in the taxonomy
// at all are rejected.

export const availableFamilies: readonly ProfessionFamilyId[] = filterableFamilyIds.filter((id) =>
  publishedProfessions.some((p) => p.family === id),
);

export const availableLevels: readonly ExperienceLevel[] = experienceLevels
  .map((l) => l.id)
  .filter((id) => publishedProfessions.some((p) => p.level === id));

export const availableSectors: readonly Sector[] = (
  ["public", "private", "hybrid"] as const
).filter((s) => publishedProfessions.some((p) => p.sector === s));

export const availableOrientations: readonly Orientation[] = (
  ["operational", "technical", "analytical", "leadership"] as const
).filter((o) => publishedProfessions.some((p) => p.orientation.includes(o)));

/** Jurisdictions that PUBLISHED guides actually claim. The country control is
 *  shown only when this holds more than one — a single-jurisdiction catalogue
 *  makes the filter a no-op. */
export const availableCountries: readonly Region[] = Array.from(
  new Set(publishedProfessions.flatMap((p) => p.countries)),
).sort();

export const COUNTRY_FILTER_AVAILABLE = availableCountries.length > 1;

/** Both regulated values are offered only when the catalogue holds some of
 *  each; otherwise the pair is a no-op dressed up as a choice. */
export const REGULATED_FILTER_AVAILABLE =
  publishedProfessions.some((p) => p.regulated) && publishedProfessions.some((p) => !p.regulated);

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

/** The levels a search selects, in taxonomy order. Empty means "every level",
 *  which is also what an absent or entirely invalid `level` param means. */
export function selectedLevels(s: ExplorerSearch): readonly ExperienceLevel[] {
  if (!s.level) return [];
  const chosen = new Set(s.level.split(","));
  return LEVEL_VALUES.filter((l) => chosen.has(l));
}

/** Builds the canonical `level` param from a set of levels: taxonomy order,
 *  de-duplicated, and `undefined` when nothing (or everything) is selected —
 *  so "all four levels" and "no level filter" produce the same clean URL
 *  rather than two links that look different and behave identically. */
export function levelParam(levels: readonly ExperienceLevel[]): string | undefined {
  const chosen = new Set(levels);
  const ordered = LEVEL_VALUES.filter((l) => chosen.has(l));
  if (ordered.length === 0 || ordered.length === LEVEL_VALUES.length) return undefined;
  return ordered.join(",");
}

/** Adds or removes one level, preserving the rest. */
export function toggleLevel(s: ExplorerSearch, level: ExperienceLevel): ExplorerSearch {
  const current = new Set(selectedLevels(s));
  if (current.has(level)) current.delete(level);
  else current.add(level);
  const next = levelParam([...current]);
  return next ? { ...s, level: next } : withoutFilter(s, "level");
}

/** Route `validateSearch`. Total: any input produces a valid ExplorerSearch. */
export function parseExplorerSearch(raw: Record<string, unknown>): ExplorerSearch {
  const out: {
    q?: string;
    family?: ProfessionFamilyId;
    level?: string;
    regulated?: RegulatedFilter;
    sector?: Sector;
    orientation?: Orientation;
    country?: Region;
    more?: true;
  } = {};

  const q = typeof raw.q === "string" ? raw.q.trim() : "";
  if (q) out.q = q;

  const family = pick(raw.family, filterableFamilyIds);
  if (family) out.family = family;

  if (typeof raw.level === "string") {
    const level = levelParam(
      raw.level
        .split(",")
        .map((v) => v.trim())
        .filter((v): v is ExperienceLevel => (LEVEL_VALUES as readonly string[]).includes(v)),
    );
    if (level) out.level = level;
  }

  const regulated = pick(raw.regulated, REGULATED_VALUES);
  if (regulated) out.regulated = regulated;

  const sector = pick(raw.sector, SECTOR_VALUES);
  if (sector) out.sector = sector;

  const orientation = pick(raw.orientation, ORIENTATION_VALUES);
  if (orientation) out.orientation = orientation;

  const country = pick(raw.country, REGION_VALUES);
  if (country) out.country = country;

  // Forced open when an advanced filter is set, so the reader can see and
  // remove the control that is narrowing their results.
  const advancedInUse = ADVANCED_FILTER_KEYS.some((k) => out[k] !== undefined);
  if (advancedInUse || raw.more === true || raw.more === "true" || raw.more === "1") {
    out.more = true;
  }

  return out;
}

/** True when the reader has narrowed anything at all. Drives "Rensa alla". */
export function hasActiveFilters(s: ExplorerSearch): boolean {
  return Boolean(
    s.q || s.family || s.level || s.regulated || s.sector || s.orientation || s.country,
  );
}

export function activeFilterKeys(s: ExplorerSearch): readonly FilterKey[] {
  return [...PRIMARY_FILTER_KEYS, ...ADVANCED_FILTER_KEYS].filter(
    (k) => s[k] !== undefined,
  ) as FilterKey[];
}

/** Removes one filter, preserving everything else. Used by the removable
 *  chips. `more` is deliberately kept: closing the disclosure because the
 *  reader removed the last advanced chip would make the control they were
 *  just using disappear under their cursor. */
export function withoutFilter(s: ExplorerSearch, key: FilterKey | "q"): ExplorerSearch {
  const next: Record<string, unknown> = { ...s };
  delete next[key];
  return next as ExplorerSearch;
}

export function clearAllFilters(s: ExplorerSearch): ExplorerSearch {
  return s.more ? { more: true } : {};
}

/**
 * Applies the search to the PUBLISHED catalogue.
 *
 * Free text matches title (both languages plus the canonical English), the
 * short description in the reading language, and aliases — the words a
 * newcomer actually types. It deliberately does not match the family or
 * category ids: those are machine tokens, and matching them made "tech"
 * return everything in `security_technology` whether or not the word appeared
 * in anything a reader could see.
 */
export function applyExplorerSearch(
  s: ExplorerSearch,
  lang: "sv" | "en",
  list: readonly Profession[] = publishedProfessions,
): Profession[] {
  const q = (s.q ?? "").trim().toLowerCase();
  const levels = selectedLevels(s);
  return list.filter((p) => {
    if (s.family && p.family !== s.family) return false;
    if (levels.length > 0 && !levels.includes(p.level)) return false;
    if (s.regulated === "regulated" && !p.regulated) return false;
    if (s.regulated === "not_regulated" && p.regulated) return false;
    if (s.sector && p.sector !== s.sector) return false;
    if (s.orientation && !p.orientation.includes(s.orientation)) return false;
    if (s.country && !p.countries.includes(s.country)) return false;
    if (q) {
      const haystack = [
        p.titleSv,
        p.titleEn,
        p.titleCanonical,
        p.description[lang],
        ...(p.aliases ?? []).map((a) => a[lang]),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/**
 * The nearest wider view that actually returns something.
 *
 * "Inga yrken matchar" is a dead end: it tells a reader their combination
 * failed and leaves them to guess which of six controls caused it. This walks
 * one filter off at a time — least meaningful first — and returns the first
 * relaxation that yields results, together with the key it dropped so the UI
 * can say WHICH constraint it is offering to lift ("Visa alla nivåer" rather
 * than a bare "try something else").
 *
 * Free text is dropped last: it is the only part of the state the reader
 * typed themselves, and discarding it silently reads as the search box being
 * broken. Returns null only when even the empty search finds nothing, which
 * for a non-empty published catalogue cannot happen.
 */
export interface Relaxation {
  readonly search: ExplorerSearch;
  readonly dropped: FilterKey | "q";
  readonly count: number;
}

const RELAXATION_ORDER: readonly (FilterKey | "q")[] = [
  "country",
  "orientation",
  "sector",
  "regulated",
  "level",
  "family",
  "q",
];

export function nearestNonEmpty(
  s: ExplorerSearch,
  lang: "sv" | "en",
  list: readonly Profession[] = publishedProfessions,
): Relaxation | null {
  // Single-filter relaxations, in order of how little the reader loses.
  for (const key of RELAXATION_ORDER) {
    if (s[key] === undefined) continue;
    const candidate = withoutFilter(s, key);
    const count = applyExplorerSearch(candidate, lang, list).length;
    if (count > 0) return { search: candidate, dropped: key, count };
  }

  // Nothing single-step works: fall back to lifting everything, reporting the
  // most specific thing the reader had set as what was dropped.
  const cleared = clearAllFilters(s);
  const count = applyExplorerSearch(cleared, lang, list).length;
  if (count === 0) return null;
  const mostSpecific = RELAXATION_ORDER.find((k) => s[k] !== undefined);
  return { search: cleared, dropped: mostSpecific ?? "q", count };
}

/** The pre-filtered entry points the hub's three paths link to. Exported so
 *  the hub, the guard and any future surface agree on one definition of
 *  "roles you can start in" rather than each hard-coding a query string. */
export const ENTRY_LEVEL_SEARCH: ExplorerSearch = { level: "entry" };
export const NEXT_LEVEL_SEARCH: ExplorerSearch = { level: "mid,senior" };
