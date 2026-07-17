// Phase D.2 — deterministic bilingual labels and copy helpers for the
// engine-driven assessment result view.
//
// Pure functions of already-computed engine output. No AI, no I/O,
// no scoring changes. Everything here is a presentation-layer mapping.

import type { Lang } from "@/i18n/dictionaries";
import type {
  ArchetypeKey,
  CareerProfile,
  ConfidenceLevel,
  Match,
} from "@/lib/career-intelligence-engine/types";

export type Bi = { sv: string; en: string };

export function pick(b: Bi | undefined | null, lang: Lang): string {
  if (!b) return "";
  return lang === "sv" ? b.sv || b.en : b.en || b.sv;
}

// -------------------- Career Profile label --------------------
//
// Deterministic guiding-profile label derived from the top archetype in
// the engine's Career Profile. Presented as a career profile, never as a
// psychological personality type.

const ARCHETYPE_TO_PROFILE: Record<
  ArchetypeKey,
  { label: Bi; blurb: Bi }
> = {
  operational_guardian: {
    label: {
      sv: "Operativ problemlösare",
      en: "Operational Problem Solver",
    },
    blurb: {
      sv: "En profil som trivs i konkreta säkerhetsuppdrag, med tydliga uppgifter och nära kontakt med människor och miljöer.",
      en: "A profile that thrives in concrete security work with clear tasks and close contact with people and environments.",
    },
  },
  strategic_leader: {
    label: {
      sv: "Strategisk säkerhetsutvecklare",
      en: "Strategic Security Developer",
    },
    blurb: {
      sv: "En profil som söker helhet, långsiktighet och möjlighet att forma säkerhetsarbetet på en organisatorisk nivå.",
      en: "A profile drawn to the whole picture, long horizons and shaping security work at an organisational level.",
    },
  },
  analytical_investigator: {
    label: {
      sv: "Analytisk säkerhetsspecialist",
      en: "Analytical Security Specialist",
    },
    blurb: {
      sv: "En profil som gärna arbetar strukturerat med analys, granskning och att förstå mönster bakom händelser.",
      en: "A profile that works methodically with analysis, scrutiny and understanding the patterns behind events.",
    },
  },
  technical_specialist: {
    label: {
      sv: "Teknisk säkerhetsspecialist",
      en: "Technical Security Specialist",
    },
    blurb: {
      sv: "En profil som drivs av teknik, system och att bygga och driva säkerhetslösningar.",
      en: "A profile driven by technology, systems and building and operating security solutions.",
    },
  },
  service_communicator: {
    label: {
      sv: "Relationsorienterad säkerhetsprofil",
      en: "People-Focused Security Professional",
    },
    blurb: {
      sv: "En profil som möter människor, kommunicerar tydligt och representerar en verksamhet i vardagen.",
      en: "A profile that meets people, communicates clearly and represents an organisation day to day.",
    },
  },
  risk_crisis_responder: {
    label: {
      sv: "Risk- och krisorienterad profil",
      en: "Risk-and-Crisis-Focused Professional",
    },
    blurb: {
      sv: "En profil som fungerar väl under press, med sinne för risk, snabba beslut och krishantering.",
      en: "A profile that functions well under pressure, with a sense for risk, quick decisions and crisis response.",
    },
  },
};

export function careerProfileLabel(profile: CareerProfile): {
  label: Bi;
  blurb: Bi;
  key: ArchetypeKey | "generalist";
} {
  const top = profile.archetypes[0];
  if (!top || top.strength < 40) {
    return {
      key: "generalist",
      label: {
        sv: "Bred säkerhetsprofil",
        en: "Broad Security Profile",
      },
      blurb: {
        sv: "Dina svar spänner över flera områden. En bred karriärprofil kan passa flera olika inriktningar inom säkerhet.",
        en: "Your answers span several areas. A broad career profile can fit several directions within security.",
      },
    };
  }
  const spec = ARCHETYPE_TO_PROFILE[top.key];
  return { key: top.key, label: spec.label, blurb: spec.blurb };
}

// -------------------- Match strength band --------------------
//
// Turns the numeric currentFit + confidence into a plain-language label.
// The numeric score remains available; the band is presented alongside.

export type MatchStrength =
  | "very_strong"
  | "strong"
  | "relevant"
  | "possible"
  | "limited";

export function matchStrengthBand(
  currentFit: number,
  confidence: ConfidenceLevel,
): MatchStrength {
  if (confidence === "limited") return "limited";
  if (currentFit >= 85 && confidence === "stronger") return "very_strong";
  if (currentFit >= 70) return "strong";
  if (currentFit >= 55) return "relevant";
  if (currentFit >= 40) return "possible";
  return "limited";
}

export function matchStrengthLabel(band: MatchStrength): Bi {
  switch (band) {
    case "very_strong":
      return { sv: "Mycket stark matchning", en: "Very strong match" };
    case "strong":
      return { sv: "Stark matchning", en: "Strong match" };
    case "relevant":
      return { sv: "Relevant matchning", en: "Relevant match" };
    case "possible":
      return { sv: "Möjlig riktning", en: "Possible direction" };
    case "limited":
    default:
      return { sv: "Begränsat underlag", en: "Limited evidence" };
  }
}

export function confidenceLabelBi(c: ConfidenceLevel): Bi {
  if (c === "stronger") return { sv: "Starkare underlag", en: "Stronger evidence" };
  if (c === "moderate") return { sv: "Måttligt underlag", en: "Moderate evidence" };
  return { sv: "Begränsat underlag", en: "Limited evidence" };
}

// -------------------- Phase D.2.1: Overall evidence status --------------------
//
// A single, user-facing evidence level shown in the hero. It re-uses the
// deterministic overallEvidenceScore (0..100) already produced by the
// engine. No scoring changes — pure presentation mapping.

export type OverallEvidenceLevel = "strong" | "moderate" | "limited";

export function overallEvidenceLevel(score: number): OverallEvidenceLevel {
  if (score >= 70) return "strong";
  if (score >= 45) return "moderate";
  return "limited";
}

export function overallEvidenceLabel(level: OverallEvidenceLevel): Bi {
  switch (level) {
    case "strong":
      return { sv: "Tydligt underlag", en: "Strong evidence" };
    case "moderate":
      return { sv: "Måttligt underlag", en: "Moderate evidence" };
    case "limited":
    default:
      return { sv: "Begränsat underlag", en: "Limited evidence" };
  }
}

export const overallEvidenceHelp: Bi = {
  sv: "Underlagsnivån beskriver hur mycket relevant och samstämmig information som kunde utläsas ur dina svar. Den bedömer inte din förmåga eller lämplighet.",
  en: "The evidence level describes how much relevant and consistent information was found in your answers. It does not measure your ability or suitability.",
};

// -------------------- Phase D.2.1: Qualitative fit / potential --------------------
//
// The engine keeps producing the same numeric currentFit / potential. The
// hero presents them qualitatively so users do not read them as
// probabilities of suitability, competence or employment.

export type FitBand = "strong" | "promising" | "exploratory" | "limited";

export function currentFitBand(
  currentFit: number,
  confidence: ConfidenceLevel,
): FitBand {
  if (confidence === "limited") return "limited";
  if (currentFit >= 70) return "strong";
  if (currentFit >= 55) return "promising";
  if (currentFit >= 40) return "exploratory";
  return "limited";
}

export function currentFitLabel(band: FitBand): Bi {
  switch (band) {
    case "strong":
      return { sv: "Stark matchning", en: "Strong alignment" };
    case "promising":
      return { sv: "Lovande matchning", en: "Promising alignment" };
    case "exploratory":
      return { sv: "Utforskande matchning", en: "Exploratory alignment" };
    case "limited":
    default:
      return { sv: "Begränsat underlag", en: "Limited current evidence" };
  }
}

export function potentialBand(
  potential: number,
  confidence: ConfidenceLevel,
): FitBand {
  if (confidence === "limited") return "limited";
  if (potential >= 70) return "strong";
  if (potential >= 55) return "promising";
  if (potential >= 40) return "exploratory";
  return "limited";
}

export function potentialLabel(band: FitBand): Bi {
  switch (band) {
    case "strong":
      return { sv: "Stark utvecklingspotential", en: "Strong development potential" };
    case "promising":
      return { sv: "God utvecklingspotential", en: "Good development potential" };
    case "exploratory":
      return { sv: "Möjlig utvecklingsväg", en: "Possible development path" };
    case "limited":
    default:
      return { sv: "Begränsat underlag", en: "Limited evidence" };
  }
}

export const guidanceSignalHelp: Bi = {
  sv: "Detta är en vägledande karriärsignal baserad på dina svar. Det är inte en sannolikhet för framgång eller ett mått på yrkesmässig lämplighet.",
  en: "This is a career-guidance signal based on your answers. It is not a probability of success or a measure of professional suitability.",
};

// -------------------- Phase D.2.1: Insufficient-evidence copy --------------------

export const insufficientEvidenceLabel: Bi = {
  sv: "Otillräckligt underlag",
  en: "Insufficient evidence",
};

export const insufficientEvidenceHelp: Bi = {
  sv: "Dina svar gav inte tillräckligt med information för att visa en tillförlitlig signal inom detta område.",
  en: "Your answers did not provide enough information to present a reliable signal for this dimension.",
};

// -------------------- Level / regulated wording --------------------

export function levelLabel(level: string | undefined): Bi | undefined {
  switch (level) {
    case "entry":
      return { sv: "Ingångsnivå", en: "Entry level" };
    case "mid":
      return { sv: "Erfaren nivå", en: "Mid level" };
    case "senior":
      return { sv: "Seniornivå", en: "Senior level" };
    case "executive":
      return { sv: "Ledande befattning", en: "Executive" };
    default:
      return undefined;
  }
}

// Phase D.2.1: replaces the previous "Regulated profession" wording. The
// badge must never imply the user has been verified or found eligible.
export const regulatedLabel: Bi = {
  sv: "Formella krav gäller",
  en: "Formal requirements apply",
};

export const regulatedHelp: Bi = {
  sv: "Yrket har formella krav, exempelvis på utbildning, godkännande eller förordnande. Testet verifierar inte att du uppfyller kraven.",
  en: "This profession has formal requirements such as approved training, authorisation or appointment. The assessment does not verify that you meet these requirements.",
};

// -------------------- Score tooltips --------------------

export const scoreTooltips: Record<
  "currentFit" | "potential" | "confidence" | "evidence",
  { label: Bi; help: Bi }
> = {
  currentFit: {
    label: { sv: "Nuvarande passform", en: "Current Fit" },
    help: {
      sv: "Hur nära din nuvarande profil ligger yrket, baserat på dina svar och yrkets kända drag. Det är inte ett anställnings- eller behörighetsbeslut.",
      en: "How close your current profile is to the profession, based on your answers and its known traits. It is not a hiring or eligibility decision.",
    },
  },
  potential: {
    label: { sv: "Potential", en: "Potential" },
    help: {
      sv: "Hur lovande yrket kan vara om du utvecklar relevant kompetens, erfarenhet eller formella meriter.",
      en: "How promising the profession may be if you develop relevant skills, experience or formal qualifications.",
    },
  },
  confidence: {
    label: { sv: "Konfidens", en: "Confidence" },
    help: {
      sv: "Hur säkert underlaget är för rekommendationen, baserat på mängden och relevansen av dina svar.",
      en: "How reliable the recommendation is, based on the amount and relevance of your answers.",
    },
  },
  evidence: {
    label: { sv: "Underlag", en: "Evidence" },
    help: {
      sv: "Hur komplett och väl underbyggd vägledningen är — hur mycket av modellens indata som är observerat.",
      en: "How complete and well-supported the guidance is — how much of the model's input is observed.",
    },
  },
};

// -------------------- Candidate background --------------------

export type BackgroundKey =
  | "exploring"
  | "student"
  | "career_changer"
  | "security_experience"
  | "adjacent_field"
  | "returning";

export const backgroundOptions: Array<{
  key: BackgroundKey;
  label: Bi;
  blurb: Bi;
}> = [
  {
    key: "exploring",
    label: { sv: "Utforskar branschen", en: "Exploring the field" },
    blurb: {
      sv: "Ny för säkerhetsbranschen och söker en riktning.",
      en: "New to the security field and looking for a direction.",
    },
  },
  {
    key: "student",
    label: { sv: "Student", en: "Student" },
    blurb: {
      sv: "Studerar eller planerar utbildning inom säkerhet eller angränsande område.",
      en: "Currently studying or planning studies in security or an adjacent field.",
    },
  },
  {
    key: "career_changer",
    label: { sv: "Karriärbytare", en: "Career changer" },
    blurb: {
      sv: "Har yrkeserfarenhet från ett annat område och överväger säkerhet.",
      en: "Have professional experience from another field and considering security.",
    },
  },
  {
    key: "security_experience",
    label: { sv: "Erfarenhet i branschen", en: "Security experience" },
    blurb: {
      sv: "Arbetar eller har arbetat inom säkerhet och söker nästa steg.",
      en: "Working or have worked in security and looking for the next step.",
    },
  },
  {
    key: "adjacent_field",
    label: { sv: "Angränsande område", en: "Adjacent field" },
    blurb: {
      sv: "Har erfarenhet från polis, försvar, räddning, IT eller liknande.",
      en: "Have experience from police, defence, emergency response, IT or similar.",
    },
  },
  {
    key: "returning",
    label: { sv: "Återvänder till arbete", en: "Returning to work" },
    blurb: {
      sv: "Kommer tillbaka till arbetsmarknaden efter en paus.",
      en: "Returning to the workforce after a break.",
    },
  },
];

// -------------------- Action plan (deterministic) --------------------
//
// Career action plan copy is generated deterministically from the primary
// match and the selected background. It does not fabricate providers,
// courses or specific jobs. Each item links to an existing destination
// (or none).

export interface ActionItem {
  title: Bi;
  body: Bi;
  href?: string;
}

export interface ActionPlan {
  now: ActionItem[];
  near: ActionItem[];
  long: ActionItem[];
}

function professionHref(match: Match): string | undefined {
  return match.legacySlug ? `/career-center/${match.legacySlug}` : undefined;
}

export function buildActionPlan(
  match: Match,
  background: BackgroundKey,
): ActionPlan {
  const href = professionHref(match);
  const profTitleBi: Bi = {
    sv: match.titleSv ?? match.professionKey,
    en: match.titleEn ?? match.professionKey,
  };
  const hasFormal = match.enrichment.formalRequirements.length > 0;
  const hasEducation = match.enrichment.educationPathways.length > 0;
  const hasCerts = match.enrichment.certifications.length > 0;
  const regulated = match.regulated;

  const now: ActionItem[] = [];
  now.push({
    title: {
      sv: `Läs yrkesguiden för ${profTitleBi.sv}`,
      en: `Read the profession guide for ${profTitleBi.en}`,
    },
    body: {
      sv: "Bekanta dig med rollen, ansvar, arbetsmiljö och nuvarande formella krav.",
      en: "Get familiar with the role, responsibilities, work environment and current formal requirements.",
    },
    href,
  });
  if (regulated || hasFormal) {
    now.push({
      title: {
        sv: "Kontrollera formella krav",
        en: "Check the formal requirements",
      },
      body: {
        sv: "Verifiera lag- och arbetsgivarkrav hos ansvarig myndighet eller arbetsgivare innan du planerar nästa steg.",
        en: "Verify legal and employer requirements with the responsible authority or employer before planning your next step.",
      },
      href,
    });
  }
  if (background === "exploring" || background === "student") {
    now.push({
      title: {
        sv: "Utforska karriärfamiljen",
        en: "Explore the career family",
      },
      body: {
        sv: "Titta på närliggande yrken i samma familj för att förstå bredden av möjliga vägar.",
        en: "Look at nearby professions in the same family to see the breadth of possible paths.",
      },
      href: "/career-center",
    });
  }

  const near: ActionItem[] = [];
  if (hasEducation) {
    near.push({
      title: {
        sv: "Utforska utbildningsvägar",
        en: "Explore education pathways",
      },
      body: {
        sv: "Se de utbildningsvägar som listas för yrket och jämför omfattning och nivå.",
        en: "Review the education pathways listed for the profession and compare scope and level.",
      },
      href,
    });
  } else {
    near.push({
      title: {
        sv: "Kartlägg utbildningsalternativ",
        en: "Map out education options",
      },
      body: {
        sv: "Vi kompletterar löpande vägledningen. Använd yrkesguiden som utgångspunkt när du söker aktuella utbildningar.",
        en: "We are continuously expanding the guidance. Use the profession guide as a starting point when searching for current programmes.",
      },
      href,
    });
  }
  if (hasCerts) {
    near.push({
      title: {
        sv: "Överväg relevanta certifieringar",
        en: "Consider relevant certifications",
      },
      body: {
        sv: "Certifieringar kan stärka din profil på 6–12 månaders sikt. Kontrollera aktuella krav och giltighet.",
        en: "Certifications can strengthen your profile on a 6–12 month horizon. Check current requirements and validity.",
      },
      href,
    });
  }
  if (background === "career_changer" || background === "adjacent_field") {
    near.push({
      title: {
        sv: "Bygg en överföringsberättelse",
        en: "Build a transfer narrative",
      },
      body: {
        sv: "Beskriv hur din tidigare erfarenhet överförs till säkerhetsområdet — konkret och verifierbart.",
        en: "Describe how your prior experience transfers into security — concretely and verifiably.",
      },
    });
  }

  const long: ActionItem[] = [
    {
      title: {
        sv: "Fördjupa dig i karriärfamiljen",
        en: "Deepen your career family",
      },
      body: {
        sv: "På längre sikt kan flera yrken inom samma familj bli aktuella. Utforska karriärvägar och nästa roller.",
        en: "On a longer horizon several roles in the same family may become relevant. Explore career paths and next roles.",
      },
      href: "/career-center",
    },
    {
      title: {
        sv: "Följ utvecklingen över tid",
        en: "Follow your development over time",
      },
      body: {
        sv: "Gör om testet efter ny erfarenhet eller utbildning — så följer vägledningen din utveckling.",
        en: "Retake the assessment after new experience or study so the guidance follows your development.",
      },
    },
  ];

  return { now, near, long };
}

// -------------------- Guiding profile grouping --------------------
//
// Buckets a dimension score into a presentation band. Distinguishes
// low observed evidence from insufficient evidence, so an unanswered
// dimension is never rendered as a verified weakness.

export type DimensionBand =
  | "prominent" // observed & high
  | "moderate" // observed & moderate
  | "develop" // observed & clearly below neutral
  | "insufficient"; // not observed / neutral fallback

export function dimensionBand(score: {
  normalized: number;
  observed: boolean;
}): DimensionBand {
  if (!score.observed) return "insufficient";
  if (score.normalized >= 65) return "prominent";
  if (score.normalized >= 45) return "moderate";
  return "develop";
}

export function dimensionBandLabel(band: DimensionBand): Bi {
  switch (band) {
    case "prominent":
      return { sv: "Framträdande", en: "Prominent" };
    case "moderate":
      return { sv: "Måttlig", en: "Moderate" };
    case "develop":
      return { sv: "Område att utforska vidare", en: "Area to explore further" };
    case "insufficient":
    default:
      return { sv: "Inte tillräckligt underlag", en: "Insufficient evidence" };
  }
}

// -------------------- Empty-data copy --------------------

export const emptyEducationCopy: Bi = {
  sv: "Vi kompletterar löpande vägledningen med kvalitetssäkrade utbildningar. Se yrkesguiden för aktuella möjliga utbildningsvägar.",
  en: "We are continuously expanding the guidance with quality-assured education pathways. See the profession guide for current possible routes.",
};

export const emptyCertificationsCopy: Bi = {
  sv: "Vi kompletterar löpande vägledningen med kvalitetssäkrade certifieringar. Se yrkesguiden för aktuella formella krav.",
  en: "We are continuously expanding the guidance with quality-assured certifications. See the profession guide for current formal requirements.",
};

// -------------------- Methodology --------------------

export interface MethodologyBullet {
  text: Bi;
}

export const methodologyBullets: MethodologyBullet[] = [
  {
    text: {
      sv: "Dina svar översätts till vägledande karriärdimensioner.",
      en: "Your answers are mapped to guiding career dimensions.",
    },
  },
  {
    text: {
      sv: "Dimensionerna jämförs med provisoriska yrkesprofiler.",
      en: "The dimensions are compared with provisional profession profiles.",
    },
  },
  {
    text: {
      sv: "Konfidensen beror på mängden och relevansen av dina svar.",
      en: "Confidence depends on the amount and relevance of your answers.",
    },
  },
  {
    text: {
      sv: "Resultatet är karriärvägledning — inte en psykologisk diagnos.",
      en: "The result is career guidance — not a psychological diagnosis.",
    },
  },
  {
    text: {
      sv: "Det avgör inte kompetens, behörighet eller anställning.",
      en: "It does not determine competence, eligibility or employment.",
    },
  },
  {
    text: {
      sv: "CQrityjob fattar inga rekryteringsbeslut.",
      en: "CQrityjob makes no hiring decisions.",
    },
  },
  {
    text: {
      sv: "Formella krav måste alltid verifieras separat.",
      en: "Formal requirements must always be verified separately.",
    },
  },
  {
    text: {
      sv: "Modellen är en tidig version och genomgår löpande testning och expertgranskning.",
      en: "The model is an early version undergoing continuous testing and expert review.",
    },
  },
];
