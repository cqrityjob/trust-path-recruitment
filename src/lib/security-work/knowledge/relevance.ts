/**
 * Why a development may matter to this customer. Pure and explainable: every
 * point of the score is a named match against the operating profile or the
 * monitoring requirement, shown to the person, and the threshold is theirs to
 * move. It filters what is shown; it never decides that something is safe.
 */
import type { OperatingProfile } from "../operating-context/schema";

export type MatchKind =
  | "critical_service"
  | "supplier"
  | "location"
  | "country"
  | "topic"
  | "requirement"
  | "asset";
export interface RelevanceMatch {
  kind: MatchKind;
  term: string;
  weight: number;
}
export interface Relevance {
  score: number;
  matches: RelevanceMatch[];
  excludedBy: string | null;
}

const WEIGHTS: Record<MatchKind, number> = {
  critical_service: 3,
  asset: 3,
  supplier: 2,
  location: 2,
  requirement: 2,
  topic: 1,
  country: 1,
};

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function contains(haystack: string, term: string): boolean {
  const needle = normalise(term);
  // Short words are noise, but short codes with a digit (E6, A1, M25) are places.
  if (needle.length < 2 || (needle.length < 3 && !/\d/.test(needle))) return false;
  return (
    ` ${haystack} `.includes(` ${needle} `) || (needle.includes(" ") && haystack.includes(needle))
  );
}

const COUNTRY_NAMES: Record<string, string[]> = {
  SE: ["sweden", "sverige"],
  NO: ["norway", "norge"],
  DK: ["denmark", "danmark"],
  FI: ["finland", "suomi"],
  GB: ["united kingdom", "britain", "storbritannien"],
  AE: ["united arab emirates", "uae", "forenade arabemiraten"],
};

export function assessRelevance(
  item: { title: string; text: string },
  context: {
    profile: OperatingProfile | null;
    assets?: readonly string[];
    requirement?: string | null;
  },
): Relevance {
  const haystack = normalise(`${item.title} ${item.text}`);
  const profile = context.profile;
  const excluded = (profile?.monitoring.exclusions ?? []).find((term) => contains(haystack, term));
  if (excluded) return { score: 0, matches: [], excludedBy: excluded };
  const matches: RelevanceMatch[] = [];
  const add = (kind: MatchKind, terms: readonly string[]) => {
    for (const term of terms)
      if (contains(haystack, term) && !matches.some((m) => m.kind === kind && m.term === term))
        matches.push({ kind, term, weight: WEIGHTS[kind] });
  };
  if (profile) {
    add("critical_service", profile.criticalServices);
    add("supplier", profile.suppliers);
    add(
      "location",
      profile.locations.map((location) => location.name),
    );
    add("location", profile.monitoring.places);
    add("topic", profile.monitoring.topics);
    for (const country of profile.countries)
      for (const name of COUNTRY_NAMES[country] ?? [])
        if (
          contains(haystack, name) &&
          !matches.some((m) => m.kind === "country" && m.term === country)
        )
          matches.push({ kind: "country", term: country, weight: WEIGHTS.country });
  }
  add("asset", context.assets ?? []);
  if (context.requirement) {
    const words = normalise(context.requirement)
      .split(" ")
      .filter((word) => word.length >= 5);
    add("requirement", [...new Set(words)]);
  }
  return {
    score: matches.reduce((sum, match) => sum + match.weight, 0),
    matches,
    excludedBy: null,
  };
}

export const DEFAULT_MATERIALITY = 2;
export const isMaterial = (relevance: Relevance, threshold = DEFAULT_MATERIALITY) =>
  relevance.excludedBy === null && relevance.score >= threshold;
