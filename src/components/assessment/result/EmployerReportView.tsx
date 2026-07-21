// Employer Report MVP (Public Assessment v2.0, Phase E).
//
// Decision support only -- never approves, rejects, ranks, or shortlists.
// Reuses the candidate's already-computed, deterministic EngineResultV1
// verbatim (no re-scoring, no AI). Its only original contribution is
// re-framing the same evidence for an employer reader: separating evidence
// by type, surfacing interview focus areas and verification flags, and a
// prominent human-decision disclaimer. See
// docs/job-intelligence/public-assessment-v2-questions.md for the
// evidence-category source data this view reads from.

import type { Bi, DimensionId } from "@/lib/career-assessment/types";
import type { EngineResultV1, Match } from "@/lib/career-intelligence-engine/types";
import { questionMappingById } from "@/lib/career-assessment/question-mappings";
import { dimensionById } from "@/lib/career-assessment/dimensions";
import type { Lang } from "@/i18n/dictionaries";

function pick(b: Bi, lang: Lang): string {
  return lang === "sv" ? b.sv : b.en;
}

// Evidence-category classification per question, matching the authoring
// specification in docs/job-intelligence/public-assessment-v2-questions.md.
// A presentational-layer lookup only -- does not affect scoring.
type EvidenceCategory = "self_report" | "scenario_based" | "behavioural" | "preference";

// Public Assessment v2.0 (Security Assessment Quality Review revision):
// most items were converted from abstract Likert self-report to concrete
// scenario-based single-select questions, so evidence-type coverage shifted
// accordingly -- this table reflects the revised content, not the original
// authoring spec.
const QUESTION_EVIDENCE_CATEGORY: Record<string, EvidenceCategory> = {
  q1: "behavioural",
  q2: "scenario_based",
  q3: "scenario_based",
  q4: "scenario_based",
  q5: "scenario_based",
  q6: "scenario_based",
  q7: "scenario_based",
  q8: "scenario_based",
  q9: "scenario_based",
  q10: "scenario_based",
  q11: "behavioural",
  q12: "scenario_based",
  q13: "scenario_based",
  q14: "behavioural",
  q15: "preference",
  q16: "preference",
};

const CATEGORY_LABEL: Record<EvidenceCategory, Bi> = {
  self_report: { sv: "Självskattning", en: "Self-report" },
  scenario_based: { sv: "Scenariobaserat", en: "Scenario-based" },
  behavioural: { sv: "Beteendebaserat", en: "Behavioural" },
  preference: { sv: "Preferens", en: "Preference" },
};

// Dimensions whose only evidence source is a preference-framed item (Q15
// service-orientation fit, Q16 environment/role fit). Per the Security
// Assessment Quality Review's result-model requirement, these must never be
// presented as competency evidence -- they inform career/role fit only.
const PREFERENCE_DIMENSIONS = new Set<DimensionId>([
  "service_orientation",
  "leadership_orientation",
  "strategic_orientation",
  "technical_orientation",
  "investigation_orientation",
]);

function questionIdsForDimension(dim: DimensionId): string[] {
  const ids: string[] = [];
  for (const m of Object.values(questionMappingById)) {
    if (m.rating?.some((r) => r.dimension === dim)) ids.push(m.questionId);
    else if (m.options?.some((o) => o.weights.some((w) => w.dimension === dim)))
      ids.push(m.questionId);
  }
  return ids;
}

function evidenceCategoriesForDimension(dim: DimensionId): EvidenceCategory[] {
  const cats = new Set<EvidenceCategory>();
  for (const qId of questionIdsForDimension(dim)) {
    const cat = QUESTION_EVIDENCE_CATEGORY[qId];
    if (cat) cats.add(cat);
  }
  return Array.from(cats);
}

// Deterministic, templated interview-focus and follow-up suggestions per
// dimension. Static text, not AI-generated -- consistent with Assessment
// DNA Document 08's AI boundary (no AI involvement in this view at all).
const INTERVIEW_FOCUS: Partial<Record<DimensionId, Bi>> = {
  structure_documentation: {
    sv: "Be kandidaten beskriva ett konkret exempel på när de följde en rutin trots att det var opraktiskt.",
    en: "Ask the candidate to describe a concrete example of following a procedure even when it was inconvenient.",
  },
  risk_awareness: {
    sv: "Be kandidaten beskriva en situation där de upptäckte något innan det blev ett problem.",
    en: "Ask the candidate to describe a situation where they noticed something before it became a problem.",
  },
  conflict_management: {
    sv: "Utforska hur kandidaten faktiskt avgör när en situation ska eskaleras.",
    en: "Explore how the candidate actually decides when to escalate a situation.",
  },
  independent_decision_making: {
    sv: "Be om ett exempel på ett beslut som togs med ofullständig information.",
    en: "Ask for an example of a decision made with incomplete information.",
  },
  communication: {
    sv: "Be kandidaten förklara en teknisk eller känslig sak för en icke-expert under intervjun.",
    en: "Ask the candidate to explain a technical or sensitive matter to a non-expert during the interview.",
  },
  teamwork: {
    sv: "Fråga om ett exempel på samordning med andra under tidspress.",
    en: "Ask for an example of coordinating with others under time pressure.",
  },
  learning_development: {
    sv: "Fråga hur kandidaten senast satte sig in i något nytt och obekant.",
    en: "Ask how the candidate most recently got up to speed on something new and unfamiliar.",
  },
  operational_orientation: {
    sv: "Utforska hur kandidaten håller fokus när flera saker händer samtidigt.",
    en: "Explore how the candidate stays focused when several things happen at once.",
  },
  service_orientation: {
    sv: "Fråga om en situation med krävande publik kontakt.",
    en: "Ask about a situation involving demanding public interaction.",
  },
};

export type EmployerReportViewProps = {
  result: EngineResultV1;
  lang: Lang;
  completedAt: string | null;
  assessmentVersionLabel: string;
};

export function EmployerReportView({
  result,
  lang,
  completedAt,
  assessmentVersionLabel,
}: EmployerReportViewProps) {
  const top = result.matches[0] as Match | undefined;
  const competencyStrengths =
    top?.strongestDimensions.filter((d) => !PREFERENCE_DIMENSIONS.has(d)) ?? [];
  const competencyDevelopment =
    top?.developmentAreas.filter((d) => !PREFERENCE_DIMENSIONS.has(d)) ?? [];
  const preferenceInterest =
    top?.strongestDimensions.filter((d) => PREFERENCE_DIMENSIONS.has(d)) ?? [];
  const preferenceLowInterest =
    top?.developmentAreas.filter((d) => PREFERENCE_DIMENSIONS.has(d)) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 text-sm">
      <header className="border-b border-border pb-4">
        <h1 className="text-xl font-semibold text-foreground">
          {lang === "sv" ? "Kandidatrapport – arbetsgivarvy" : "Candidate Report — Employer View"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {lang === "sv"
            ? `Bedömningsversion: ${assessmentVersionLabel} · Genomförd: ${completedAt ? new Date(completedAt).toLocaleDateString("sv-SE") : "—"}`
            : `Assessment version: ${assessmentVersionLabel} · Completed: ${completedAt ? new Date(completedAt).toLocaleDateString("en-GB") : "—"}`}
        </p>
      </header>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        <p className="font-medium">
          {lang === "sv"
            ? "Detta är beslutsstöd, inte ett beslut."
            : "This is decision support, not a decision."}
        </p>
        <p className="mt-1">
          {lang === "sv"
            ? "Denna rapport godkänner, avvisar, rangordnar eller listar aldrig automatiskt kandidater. Anställningsbeslut fattas alltid av er organisation, aldrig av plattformen."
            : "This report never automatically approves, rejects, ranks, or shortlists candidates. Employment decisions are always made by your organisation, never by the platform."}
        </p>
      </section>

      {!top ? (
        <p className="text-muted-foreground">
          {lang === "sv"
            ? "Inget resultat tillgängligt för denna bedömning."
            : "No result available for this assessment."}
        </p>
      ) : (
        <>
          <section>
            <h2 className="text-base font-semibold text-foreground">
              {lang === "sv" ? "Sammanfattning" : "Summary"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {lang === "sv"
                ? `Starkast matchande profil: ${pick({ sv: top.titleSv ?? top.legacySlug, en: top.titleEn ?? top.legacySlug }, lang)} (konfidensnivå: ${top.confidence}).`
                : `Strongest matching profile: ${pick({ sv: top.titleSv ?? top.legacySlug, en: top.titleEn ?? top.legacySlug }, lang)} (confidence: ${top.confidence}).`}
            </p>
            <p className="mt-1 text-muted-foreground">
              {lang === "sv"
                ? `Övergripande evidensnivå: ${result.overallEvidenceScore}/100. Detta är inte ett kompetensbetyg — det anger hur mycket underlag resultatet vilar på.`
                : `Overall evidence level: ${result.overallEvidenceScore}/100. This is not a competence score — it indicates how much evidence the result rests on.`}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              {lang === "sv" ? "Kompetensevidens – styrkor" : "Competency evidence — strengths"}
            </h2>
            <ul className="mt-2 space-y-2">
              {competencyStrengths.map((dim) => (
                <li key={dim} className="rounded border border-border p-3">
                  <div className="font-medium text-foreground">
                    {pick(dimensionById[dim]?.name ?? { sv: dim, en: dim }, lang)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {lang === "sv" ? "Evidenstyp: " : "Evidence type: "}
                    {evidenceCategoriesForDimension(dim)
                      .map((c) => pick(CATEGORY_LABEL[c], lang))
                      .join(", ")}
                  </div>
                </li>
              ))}
              {competencyStrengths.length === 0 && (
                <li className="text-muted-foreground">
                  {lang === "sv"
                    ? "Inget område med starkt underlag identifierat."
                    : "No area with strong evidence identified."}
                </li>
              )}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground">
              {lang === "sv" ? "Utvecklingsområden" : "Development areas"}
            </h2>
            <ul className="mt-2 space-y-2">
              {competencyDevelopment.map((dim) => (
                <li key={dim} className="rounded border border-border p-3">
                  <div className="font-medium text-foreground">
                    {pick(dimensionById[dim]?.name ?? { sv: dim, en: dim }, lang)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {lang === "sv" ? "Evidenstyp: " : "Evidence type: "}
                    {evidenceCategoriesForDimension(dim)
                      .map((c) => pick(CATEGORY_LABEL[c], lang))
                      .join(", ")}
                  </div>
                  <div className="mt-1 text-xs italic text-muted-foreground">
                    {lang === "sv"
                      ? "Detta är vägledande utvecklingsinformation, inte en verifierad brist."
                      : "This is inferred development guidance, not a verified deficiency."}
                  </div>
                </li>
              ))}
              {competencyDevelopment.length === 0 && (
                <li className="text-muted-foreground">
                  {lang === "sv"
                    ? "Inget tydligt utvecklingsområde identifierat."
                    : "No clear development area identified."}
                </li>
              )}
            </ul>
          </section>

          {(preferenceInterest.length > 0 || preferenceLowInterest.length > 0) && (
            <section>
              <h2 className="text-base font-semibold text-foreground">
                {lang === "sv"
                  ? "Angivna intressen och preferenser"
                  : "Stated interests and preferences"}
              </h2>
              <p className="mt-1 text-xs italic text-muted-foreground">
                {lang === "sv"
                  ? "Preferens är inte kompetens. Dessa signaler kommer från kandidatens egna miljö- och rollpreferenser, inte från demonstrerat beteende, och ska aldrig läsas som ett kompetensomdöme."
                  : "Preference is not competence. These signals come from the candidate's own stated environment and role preferences, not demonstrated behaviour, and should never be read as a competency judgement."}
              </p>
              <ul className="mt-2 space-y-2">
                {preferenceInterest.map((dim) => (
                  <li key={dim} className="rounded border border-border p-3">
                    <div className="font-medium text-foreground">
                      {pick(dimensionById[dim]?.name ?? { sv: dim, en: dim }, lang)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {lang === "sv"
                        ? "Kandidaten angav intresse för detta."
                        : "The candidate indicated interest in this."}
                    </div>
                  </li>
                ))}
                {preferenceLowInterest.map((dim) => (
                  <li key={dim} className="rounded border border-border p-3">
                    <div className="font-medium text-foreground">
                      {pick(dimensionById[dim]?.name ?? { sv: dim, en: dim }, lang)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {lang === "sv"
                        ? "Kandidaten angav begränsat intresse för detta."
                        : "The candidate indicated limited interest in this."}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-base font-semibold text-foreground">
              {lang === "sv" ? "Intervjufokus" : "Interview focus areas"}
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {competencyDevelopment
                .concat(competencyStrengths.slice(0, 1))
                .filter((dim, i, arr) => arr.indexOf(dim) === i)
                .map(
                  (dim) =>
                    INTERVIEW_FOCUS[dim] && (
                      <li key={dim}>{pick(INTERVIEW_FOCUS[dim] as Bi, lang)}</li>
                    ),
                )}
            </ul>
          </section>

          {top.enrichment.formalRequirements.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-foreground">
                {lang === "sv"
                  ? "Kräver verifiering av arbetsgivaren"
                  : "Requires verification by the employer"}
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {top.enrichment.formalRequirements.map((r, i) => (
                  <li key={i}>{pick(r.label, lang)}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t border-border pt-4 text-xs text-muted-foreground">
            <p>
              {lang === "sv"
                ? "Självrapporterade svar är inte verifierat beteende. Kandidatens fullständiga svarsevidens, inklusive metod per fråga, kan granskas separat vid behov."
                : "Self-reported answers are not verified conduct. The candidate's full response evidence, including method per question, can be reviewed separately if needed."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
