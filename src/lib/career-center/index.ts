// Public barrel for the Career Center data layer.
//
// Single import surface for UI code:
//    import { professions, getProfession, L } from "@/lib/career-center";

export * from "./types";
export * from "./icon-registry";
export * from "./categories";
export * from "./profession-families";
export * from "./competencies";
export * from "./education";
export * from "./certifications";
export * from "./career-paths";
export * from "./selectors";

// Legacy compatibility for older consumers:
import type { Lang } from "@/i18n/dictionaries";
import type { Bi, CompetencyId } from "./types";
import { pickBi } from "./selectors";
import { competencies } from "./competencies";

// Old name-based aliases used by earlier code:
export type SkillId = CompetencyId;
export const skills = competencies;

export const L = (b: Bi, lang: Lang): string => pickBi(b, lang);

// Trigger dev integrity checks on import.
import "./integrity";