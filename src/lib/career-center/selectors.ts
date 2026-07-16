import type {
  Bi,
  Profession,
  ProfessionId,
  CategoryId,
  ExperienceLevel,
  Sector,
  Orientation,
  Region,
  ProfessionFamilyId,
} from "./types";
import { professions, getProfession } from "./professions";
import { competencies, getCompetency } from "./competencies";
import { education, getEducation } from "./education";
import { certifications, getCertification } from "./certifications";
import { careerPaths } from "./career-paths";
import { categories, getCategory, experienceLevels } from "./categories";
import { professionFamilies, getFamily } from "./profession-families";

export {
  professions,
  getProfession,
  competencies,
  getCompetency,
  education,
  getEducation,
  certifications,
  getCertification,
  careerPaths,
  categories,
  getCategory,
  experienceLevels,
  professionFamilies,
  getFamily,
};

export function getRoadmap(p: Profession, lang: "sv" | "en"): string[] {
  const prev = (p.previousRoles ?? [])
    .map((id) => getProfession(id))
    .filter((r): r is Profession => Boolean(r))
    .map((r) => (lang === "sv" ? r.titleSv : r.titleEn));
  const next = (p.nextRoles ?? [])
    .map((id) => getProfession(id))
    .filter((r): r is Profession => Boolean(r))
    .map((r) => (lang === "sv" ? r.titleSv : r.titleEn));
  const self = lang === "sv" ? p.titleSv : p.titleEn;
  return [...prev, self, ...next];
}

export function getProfessionsByFamily(id: ProfessionFamilyId): Profession[] {
  return professions.filter((p) => p.family === id);
}

export function getRelatedProfessions(p: Profession): Profession[] {
  return (p.related ?? [])
    .map((id) => getProfession(id))
    .filter((r): r is Profession => Boolean(r));
}

export type ProfessionFilters = {
  query?: string;
  family?: ProfessionFamilyId | "all";
  category?: CategoryId | "all";
  level?: ExperienceLevel | "all";
  regulated?: "regulated" | "not_regulated" | "all";
  sector?: Sector | "all";
  orientation?: Orientation | "all";
  region?: Region | "all";
};

export function filterProfessions(list: readonly Profession[], f: ProfessionFilters, lang: "sv" | "en"): Profession[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return list.filter((p) => {
    if (f.family && f.family !== "all" && p.family !== f.family) return false;
    if (f.category && f.category !== "all" && p.category !== f.category) return false;
    if (f.level && f.level !== "all" && p.level !== f.level) return false;
    if (f.regulated === "regulated" && !p.regulated) return false;
    if (f.regulated === "not_regulated" && p.regulated) return false;
    if (f.sector && f.sector !== "all" && p.sector !== f.sector) return false;
    if (f.orientation && f.orientation !== "all" && !p.orientation.includes(f.orientation)) return false;
    if (f.region && f.region !== "all" && !p.countries.includes(f.region)) return false;
    if (q) {
      const hay = [
        p.titleSv,
        p.titleEn,
        p.titleCanonical,
        p.description[lang],
        p.category,
        p.family,
        ...(p.aliases ?? []).map((a) => a[lang]),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function pickBi(b: Bi, lang: "sv" | "en"): string { return b[lang]; }

export type { ProfessionId };