// Bilingual option lists for the two closed enums that have no external
// data source. `current_profession` options come from the live, published
// `cig_professions` catalogue instead — see profession-options.ts.

import type { Bi, CurrentStatus, YearsOfExperience } from "./types";

export const currentStatusOptions: readonly { id: CurrentStatus; label: Bi }[] = [
  {
    id: "new_to_industry",
    label: { sv: "Ny inom säkerhetsbranschen", en: "New to the security industry" },
  },
  {
    id: "student",
    label: { sv: "Student", en: "Student" },
  },
  {
    id: "working_in_industry",
    label: { sv: "Arbetar inom säkerhetsbranschen", en: "Working in the security industry" },
  },
  {
    id: "career_change",
    label: { sv: "Byter karriär från en annan bransch", en: "Career change from another industry" },
  },
  {
    id: "changing_role",
    label: {
      sv: "Byter roll inom säkerhetsbranschen",
      en: "Changing role within the security industry",
    },
  },
  {
    id: "other",
    label: { sv: "Annat", en: "Other" },
  },
] as const;

export const yearsOfExperienceOptions: readonly { id: YearsOfExperience; label: Bi }[] = [
  { id: "<1", label: { sv: "Mindre än 1 år", en: "<1 year" } },
  { id: "1-3", label: { sv: "1–3 år", en: "1–3 years" } },
  { id: "3-5", label: { sv: "3–5 år", en: "3–5 years" } },
  { id: "5-10", label: { sv: "5–10 år", en: "5–10 years" } },
  { id: "10+", label: { sv: "10+ år", en: "10+ years" } },
] as const;
