import type { Bi, CompetencyId, EducationId, CertificationId, ProfessionId, Profession } from "@/lib/career-center/types";
import { getProfession, professions, careerPaths } from "@/lib/career-center";
import { dimensionById } from "./dimensions";
import type { DimensionId, DimensionScore, EngineResult, MatchResult } from "./types";

export const DISCLAIMER_VERSION = "2026.07-06B";
export const ASSESSMENT_VERSION = "sca-1.0";

// -------- Experience background (frontend only) --------
export type ExperienceBackground =
  | "first_career"
  | "student"
  | "career_change"
  | "in_security"
  | "police_military_gov"
  | "specialist_leader";

export const experienceBackgrounds: {
  id: ExperienceBackground;
  label: Bi;
  description: Bi;
}[] = [
  {
    id: "first_career",
    label: { sv: "Jag utforskar min första karriär", en: "I am exploring my first career" },
    description: {
      sv: "Fokus på ingångsroller och att lära känna branschen.",
      en: "Focus on entry-level roles and getting to know the industry.",
    },
  },
  {
    id: "student",
    label: { sv: "Jag studerar", en: "I am a student" },
    description: {
      sv: "Kombinera studier med praktik och intern-erfarenhet.",
      en: "Combine studies with internships and hands-on experience.",
    },
  },
  {
    id: "career_change",
    label: { sv: "Jag byter karriär", en: "I am changing careers" },
    description: {
      sv: "Bygg vidare på tidigare erfarenheter i en ny riktning.",
      en: "Build on prior experience in a new direction.",
    },
  },
  {
    id: "in_security",
    label: { sv: "Jag arbetar redan inom säkerhet", en: "I already work in security" },
    description: {
      sv: "Utveckla dig i din nuvarande roll eller närliggande specialiseringar.",
      en: "Develop within your current role or adjacent specialisations.",
    },
  },
  {
    id: "police_military_gov",
    label: {
      sv: "Jag har polis-, militär- eller myndighetsbakgrund",
      en: "I have police, military or government experience",
    },
    description: {
      sv: "Utforska civila karriärvägar där din bakgrund är värdefull.",
      en: "Explore civilian paths where your background is valuable.",
    },
  },
  {
    id: "specialist_leader",
    label: {
      sv: "Jag vill utvecklas till specialist eller ledare",
      en: "I want to develop into a specialist or leadership role",
    },
    description: {
      sv: "Fokus på fördjupning eller ledarskapsutveckling.",
      en: "Focus on deeper specialisation or leadership development.",
    },
  },
];

// -------- Session data model --------
export interface ResultSession {
  assessmentId: string;
  assessmentVersion: string;
  completionTimestamp: number;
  topProfessionIds: ProfessionId[];
  matches: MatchResult[];
  rawSimilarities: Record<ProfessionId, number>; // internal only
  observedDimensions: DimensionId[];
  unobservedDimensions: DimensionId[];
  strengthDimensionIds: DimensionId[];
  developmentDimensionIds: DimensionId[];
  strengthCompetencyIds: CompetencyId[];
  developmentCompetencyIds: CompetencyId[];
  educationIds: EducationId[];
  certificationIds: CertificationId[];
  careerPathIds: string[]; // "from->to" edges
  selectedExperienceBackground?: ExperienceBackground;
  disclaimerVersion: string;
  professionContentStatuses: Record<ProfessionId, string | undefined>;
  explanationKeys: string[];
}

function pseudoId() {
  return "sca-" + Math.random().toString(36).slice(2, 10);
}

// -------- Derivations --------

export function pickStrengthDimensions(vector: DimensionScore[]): DimensionId[] {
  return [...vector]
    .filter((v) => v.observed && v.normalized >= 60)
    .sort((a, b) => b.normalized - a.normalized)
    .slice(0, 5)
    .map((v) => v.dimension);
}

export function pickDevelopmentDimensions(top: MatchResult | undefined, vector: DimensionScore[]): DimensionId[] {
  // Prefer engine-derived gaps against the top match, then fall back to
  // observed dimensions with low user score.
  const fromGaps = top?.gaps ?? [];
  if (fromGaps.length >= 2) return fromGaps.slice(0, 4);
  const lows = [...vector]
    .filter((v) => v.observed && v.normalized < 45)
    .sort((a, b) => a.normalized - b.normalized)
    .slice(0, 3)
    .map((v) => v.dimension);
  return Array.from(new Set([...fromGaps, ...lows])).slice(0, 4);
}

function professionCompetencyIds(p: Profession | undefined): CompetencyId[] {
  if (!p) return [];
  return p.competencies.map((c) => c.competencyId);
}

export function pickStrengthCompetencies(top: MatchResult | undefined): CompetencyId[] {
  const p = top ? getProfession(top.professionId) : undefined;
  return professionCompetencyIds(p).slice(0, 4);
}

export function pickDevelopmentCompetencies(
  top: MatchResult | undefined,
  strengths: CompetencyId[],
): CompetencyId[] {
  const p = top ? getProfession(top.professionId) : undefined;
  // Competencies flagged critical but not already in the strengths shortlist.
  const ids = (p?.competencies ?? [])
    .filter((c) => c.critical && !strengths.includes(c.competencyId))
    .map((c) => c.competencyId);
  if (ids.length >= 2) return ids.slice(0, 3);
  return (p?.competencies ?? [])
    .map((c) => c.competencyId)
    .filter((id) => !strengths.includes(id))
    .slice(0, 3);
}

export function pickEducationIds(top: MatchResult | undefined): EducationId[] {
  const p = top ? getProfession(top.professionId) : undefined;
  return p?.educationPathways ?? [];
}

export function pickCertificationIds(top: MatchResult | undefined): CertificationId[] {
  const p = top ? getProfession(top.professionId) : undefined;
  return p?.certifications ?? [];
}

export interface PathwayStep {
  professionId: ProfessionId;
  title: Bi;
  role: "previous" | "current" | "next";
}

export function buildCareerPathway(top: MatchResult | undefined): PathwayStep[] {
  if (!top) return [];
  const p = getProfession(top.professionId);
  if (!p) return [];
  const prev = (p.previousRoles ?? [])
    .map((id) => getProfession(id))
    .filter((x): x is Profession => Boolean(x))
    .slice(0, 2)
    .map<PathwayStep>((x) => ({
      professionId: x.id,
      title: { sv: x.titleSv, en: x.titleEn },
      role: "previous",
    }));
  const next = (p.nextRoles ?? [])
    .map((id) => getProfession(id))
    .filter((x): x is Profession => Boolean(x))
    .slice(0, 2)
    .map<PathwayStep>((x) => ({
      professionId: x.id,
      title: { sv: x.titleSv, en: x.titleEn },
      role: "next",
    }));
  return [
    ...prev,
    { professionId: p.id, title: { sv: p.titleSv, en: p.titleEn }, role: "current" as const },
    ...next,
  ];
}

export function pickCareerPathIds(top: MatchResult | undefined): string[] {
  if (!top) return [];
  return careerPaths
    .filter((cp) => cp.from === top.professionId || cp.to === top.professionId)
    .map((cp) => `${cp.from}->${cp.to}`);
}

export function relatedFamilyIds(top: MatchResult | undefined, matches: MatchResult[]): string[] {
  if (!top) return [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (m.family && m.family !== top.family) seen.add(m.family);
  }
  return Array.from(seen).slice(0, 3);
}

// -------- Comparison rows --------

export interface CompareRow {
  professionId: ProfessionId;
  title: Bi;
  family: string;
  familyLabel: Bi;
  level: string;
  regulated: boolean;
  displayedMatch: number;
  confidence: MatchResult["confidence"];
  topDimensions: DimensionId[];
  gaps: DimensionId[];
  workEnvironments: Bi[];
  competencies: CompetencyId[];
  formalRequirements: Bi[];
  educationIds: EducationId[];
  certificationIds: CertificationId[];
  nextRoleTitle?: Bi;
  contentStatus?: string;
  slug?: string;
  whyItMayFit: Bi;
}

import { professionFamilies } from "@/lib/career-center";
import { whyThisResult } from "./explanations";

export function buildCompareRows(matches: MatchResult[], limit = 3): CompareRow[] {
  return matches.slice(0, limit).map((m) => {
    const p = getProfession(m.professionId);
    const fam = professionFamilies.find((f) => f.id === (p?.family ?? m.family));
    const next = (p?.nextRoles ?? []).map((id) => getProfession(id)).find((x) => x);
    const title: Bi = p
      ? { sv: p.titleSv, en: p.titleEn }
      : { sv: m.professionId, en: m.professionId };
    return {
      professionId: m.professionId,
      title,
      family: p?.family ?? m.family,
      familyLabel: fam?.name ?? { sv: p?.family ?? m.family, en: p?.family ?? m.family },
      level: p?.level ?? "",
      regulated: Boolean(m.regulated ?? p?.regulated),
      displayedMatch: m.displayedMatch,
      confidence: m.confidence,
      topDimensions: m.topDimensions,
      gaps: m.gaps,
      workEnvironments: p?.workEnvironments ?? [],
      competencies: (p?.competencies ?? []).slice(0, 5).map((c) => c.competencyId),
      formalRequirements: p?.formalRequirements ?? [],
      educationIds: p?.educationPathways ?? [],
      certificationIds: p?.certifications ?? [],
      nextRoleTitle: next ? { sv: next.titleSv, en: next.titleEn } : undefined,
      contentStatus: p?.status,
      slug: p?.slug,
      whyItMayFit: whyThisResult(m, title),
    };
  });
}

// -------- Deterministic three-horizon action plan --------

export interface ActionItem {
  id: string;
  text: Bi;
  actionHint?: Bi;
}

export interface ActionPlan {
  now: ActionItem[];
  midTerm: ActionItem[];
  longTerm: ActionItem[];
}

function dimName(d: DimensionId): Bi {
  return dimensionById[d].name;
}

export function buildActionPlan(input: {
  top: MatchResult | undefined;
  matches: MatchResult[];
  developmentDimensions: DimensionId[];
  developmentCompetencies: CompetencyId[];
  background?: ExperienceBackground;
  isPlaceholder: boolean;
  isRegulated: boolean;
  educationIds: EducationId[];
  certificationIds: CertificationId[];
  hasPathway: boolean;
}): ActionPlan {
  const { top, developmentDimensions, background, isPlaceholder, isRegulated, educationIds, certificationIds, hasPathway } = input;
  const topProf = top ? getProfession(top.professionId) : undefined;
  const topTitle: Bi = topProf ? { sv: topProf.titleSv, en: topProf.titleEn } : { sv: "denna roll", en: "this role" };

  const now: ActionItem[] = [];
  now.push({
    id: "read-profession-guide",
    text: {
      sv: `Läs yrkesguiden för ${topTitle.sv} för att förstå vardagen i rollen.`,
      en: `Read the profession guide for ${topTitle.en} to understand what the role looks like day to day.`,
    },
  });
  now.push({
    id: "compare-top-three",
    text: {
      sv: "Jämför dina tre främsta matchningar innan du väljer väg.",
      en: "Compare your top three matches before choosing a direction.",
    },
  });
  if (isRegulated) {
    now.push({
      id: "review-formal",
      text: {
        sv: "Läs igenom de formella kraven – reglerade roller kräver särskild behörighet.",
        en: "Review the formal requirements — regulated roles need specific authorisation.",
      },
    });
  } else {
    now.push({
      id: "review-formal-general",
      text: {
        sv: "Skanna de formella kraven för rollen så du vet vad som förväntas.",
        en: "Skim the formal requirements so you know what employers expect.",
      },
    });
  }
  if (developmentDimensions.length > 0) {
    const first = developmentDimensions[0];
    now.push({
      id: `focus-${first}`,
      text: {
        sv: `Välj en utvecklingsdimension att fokusera på – till exempel ${dimName(first).sv.toLowerCase()}.`,
        en: `Pick one development area to focus on — for example, ${dimName(first).en.toLowerCase()}.`,
      },
    });
  }
  if (background === "student") {
    now.push({
      id: "student-mentor",
      text: {
        sv: "Ta kontakt med en yrkesverksam inom området och boka ett kort samtal.",
        en: "Reach out to a professional in the field and book a short conversation.",
      },
    });
  }
  if (background === "police_military_gov") {
    now.push({
      id: "transfer-mapping",
      text: {
        sv: "Kartlägg vilka av dina tidigare erfarenheter som är överförbara till civila roller.",
        en: "Map which parts of your background transfer well into civilian security roles.",
      },
    });
  }

  const mid: ActionItem[] = [];
  if (educationIds.length > 0 && !isPlaceholder) {
    mid.push({
      id: "explore-education",
      text: {
        sv: "Utforska minst en av de föreslagna utbildningsvägarna.",
        en: "Explore at least one of the suggested education pathways.",
      },
    });
  } else {
    mid.push({
      id: "explore-adjacent-education",
      text: {
        sv: "Undersök relevanta utbildningar inom samma yrkesfamilj.",
        en: "Research relevant education options within the same profession family.",
      },
    });
  }
  if (developmentDimensions.length > 1) {
    const second = developmentDimensions[1];
    mid.push({
      id: `build-${second}`,
      text: {
        sv: `Bygg praktisk erfarenhet av ${dimName(second).sv.toLowerCase()} – till exempel genom projekt, praktik eller sidoansvar.`,
        en: `Build practical experience of ${dimName(second).en.toLowerCase()} — for example through projects, internships or side responsibilities.`,
      },
    });
  }
  if (background === "career_change" || background === "first_career") {
    mid.push({
      id: "entry-transition",
      text: {
        sv: "Sök en ingångsroll eller övergångsroll som ger relevanta erfarenheter.",
        en: "Apply for an entry-level or transition role that gives relevant experience.",
      },
    });
  }
  if (background === "in_security") {
    mid.push({
      id: "in-security-broaden",
      text: {
        sv: "Sök projekt eller uppdrag som breddar din erfarenhet mot din målroll.",
        en: "Take on projects or assignments that broaden your experience toward the target role.",
      },
    });
  }
  mid.push({
    id: "talk-to-people",
    text: {
      sv: "Prata med två eller tre yrkesverksamma inom området för att kalibrera dina förväntningar.",
      en: "Speak with two or three people already working in the field to calibrate expectations.",
    },
  });

  const long: ActionItem[] = [];
  if (hasPathway) {
    long.push({
      id: "next-role",
      text: {
        sv: `Sikta på nästa steg i karriärvägen mot ${topTitle.sv}.`,
        en: `Aim toward the next step in the pathway toward ${topTitle.en}.`,
      },
    });
  }
  if (certificationIds.length > 0 && !isPlaceholder) {
    long.push({
      id: "consider-certifications",
      text: {
        sv: "Överväg relevanta certifieringar när du byggt erfarenhet.",
        en: "Consider relevant certifications once you have built experience.",
      },
    });
  }
  if (background === "specialist_leader") {
    long.push({
      id: "leadership-track",
      text: {
        sv: "Sök ansvar för team, projekt eller specialistområde för att ta nästa steg.",
        en: "Take on team, project or specialist ownership to move to the next level.",
      },
    });
  }
  long.push({
    id: "retake-later",
    text: {
      sv: "Gör om vägledningen efter en tid när du fått mer erfarenhet – resultatet kan förändras.",
      en: "Retake the guidance after gaining experience — results may change with time.",
    },
  });

  return { now, midTerm: mid, longTerm: long };
}

// -------- Result session builder --------

export function buildResultSession(input: {
  engine: EngineResult;
  background?: ExperienceBackground;
}): ResultSession {
  const { engine, background } = input;
  const matches = engine.matches;
  const top = matches[0];
  const strengthDims = pickStrengthDimensions(engine.userVector);
  const devDims = pickDevelopmentDimensions(top, engine.userVector);
  const strengthCompetencies = pickStrengthCompetencies(top);
  const devCompetencies = pickDevelopmentCompetencies(top, strengthCompetencies);
  const educationIds = pickEducationIds(top);
  const certificationIds = pickCertificationIds(top);
  const careerPathIds = pickCareerPathIds(top);

  const rawSimilarities = Object.fromEntries(
    matches.map((m) => [m.professionId, m.rawSimilarity]),
  ) as Record<ProfessionId, number>;

  const professionContentStatuses = Object.fromEntries(
    matches.map((m) => [m.professionId, m.professionContentStatus]),
  );

  const explanationKeys = strengthDims.map((d) => dimensionById[d].explanationKey);

  return {
    assessmentId: pseudoId(),
    assessmentVersion: ASSESSMENT_VERSION,
    completionTimestamp: Date.now(),
    topProfessionIds: matches.slice(0, 5).map((m) => m.professionId),
    matches,
    rawSimilarities,
    observedDimensions: engine.observedDimensions,
    unobservedDimensions: engine.unobservedDimensions,
    strengthDimensionIds: strengthDims,
    developmentDimensionIds: devDims,
    strengthCompetencyIds: strengthCompetencies,
    developmentCompetencyIds: devCompetencies,
    educationIds,
    certificationIds,
    careerPathIds,
    selectedExperienceBackground: background,
    disclaimerVersion: DISCLAIMER_VERSION,
    professionContentStatuses,
    explanationKeys,
  };
}

// Small helper: match professions listed only by ID even when profession
// data isn't yet on disk.
export function professionTitle(id: ProfessionId): Bi {
  const p = professions.find((x) => x.id === id);
  return p ? { sv: p.titleSv, en: p.titleEn } : { sv: id, en: id };
}