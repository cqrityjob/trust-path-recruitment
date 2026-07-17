/**
 * Public display labels for job enum values (employment type, workplace
 * type, experience level, status). Presentation only — stored enum
 * values, filter parameters and database logic are unchanged. Unknown
 * values fall back to a human-readable form of the raw token so
 * unmapped rows never expose `snake_case` in the UI.
 */

export type Lang = "sv" | "en";

type Dict = Record<string, { sv: string; en: string }>;

const EMPLOYMENT_LABELS: Dict = {
  full_time: { sv: "Heltid", en: "Full-time" },
  part_time: { sv: "Deltid", en: "Part-time" },
  contract: { sv: "Konsultuppdrag", en: "Contract" },
  temporary: { sv: "Vikariat", en: "Temporary" },
  internship: { sv: "Praktik", en: "Internship" },
};

const WORKPLACE_LABELS: Dict = {
  onsite: { sv: "På plats", en: "On-site" },
  hybrid: { sv: "Hybrid", en: "Hybrid" },
  remote: { sv: "Distans", en: "Remote" },
};

const EXPERIENCE_LABELS: Dict = {
  entry: { sv: "Junior", en: "Entry level" },
  mid: { sv: "Erfaren", en: "Mid level" },
  senior: { sv: "Senior", en: "Senior" },
  lead: { sv: "Ledande befattning", en: "Lead" },
};

const STATUS_LABELS: Dict = {
  draft: { sv: "Utkast", en: "Draft" },
  pending_review: { sv: "Under granskning", en: "Pending review" },
  published: { sv: "Publicerad", en: "Published" },
  closed: { sv: "Stängd", en: "Closed" },
  expired: { sv: "Stängd", en: "Closed" },
  archived: { sv: "Arkiverad", en: "Archived" },
};

function humanize(raw: string): string {
  const s = raw.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pick(dict: Dict, raw: string | null | undefined, lang: Lang): string {
  if (!raw) return "";
  const entry = dict[raw];
  return entry ? entry[lang] : humanize(raw);
}

export const employmentTypeLabel = (v: string | null | undefined, lang: Lang) =>
  pick(EMPLOYMENT_LABELS, v, lang);

export const workplaceTypeLabel = (v: string | null | undefined, lang: Lang) =>
  pick(WORKPLACE_LABELS, v, lang);

export const experienceLevelLabel = (v: string | null | undefined, lang: Lang) =>
  pick(EXPERIENCE_LABELS, v, lang);

export const jobStatusLabel = (v: string | null | undefined, lang: Lang) =>
  pick(STATUS_LABELS, v, lang);

export const EMPLOYMENT_TYPE_VALUES = Object.keys(EMPLOYMENT_LABELS);
export const WORKPLACE_TYPE_VALUES = Object.keys(WORKPLACE_LABELS);
export const EXPERIENCE_LEVEL_VALUES = Object.keys(EXPERIENCE_LABELS);