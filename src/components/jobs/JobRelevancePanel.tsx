import { Link } from "@tanstack/react-router";
import { Sparkles, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import type { PublicJobDetail } from "@/lib/job-intelligence/public-queries";
import type { CareerProfileForJobsV1 } from "@/lib/career-intelligence-engine/profile-for-jobs";
import {
  relevanceForJob,
  dimensionLabel,
  legacySlugForJob,
} from "@/lib/job-intelligence/personal-relevance";
import { getProfession } from "@/lib/career-center/professions";
import type { Competency } from "@/lib/career-center/types";
import { competencies as competencyCatalogue } from "@/lib/career-center/competencies";

function pickBi(sv: string, en: string, lang: "sv" | "en"): string {
  return lang === "sv" ? sv || en : en || sv;
}

function joinNaturally(items: string[], lang: "sv" | "en"): string {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  const and = lang === "sv" ? " och " : " and ";
  return clean.slice(0, -1).join(", ") + and + clean[clean.length - 1];
}

/**
 * Personal Job Relevance panel — Phase E.
 *
 * Renders natural-language guidance for a signed-in user with a saved
 * Career Profile. Never exposes raw scores or CIG objects. Clearly
 * separates "profile relevance" from "formal requirements" via an
 * explicit disclaimer.
 */
export function JobRelevancePanel({
  job,
  profile,
}: {
  job: PublicJobDetail;
  profile: CareerProfileForJobsV1;
}) {
  const { t, lang } = useT();
  const relevance = relevanceForJob(job, profile);
  const legacySlug = legacySlugForJob(job, profile);
  const profession = legacySlug ? getProfession(legacySlug) : null;

  // Natural-language "why this role may suit you" — deterministic, from
  // the same signals the engine already produced. Never fabricated.
  const strongDimNames = relevance.strongDims
    .slice(0, 3)
    .map((d) => dimensionLabel(d, lang));
  const developDimNames = relevance.developDims
    .slice(0, 3)
    .map((d) => dimensionLabel(d, lang));

  const whyParagraphs: string[] = [];
  if (relevance.basis === "profession") {
    if (profile.archetype) {
      const archetypeLabel = lang === "sv" ? profile.archetype.labelSv : profile.archetype.labelEn;
      whyParagraphs.push(
        t("jobs.relevance.why.archetype").replace("{archetype}", `“${archetypeLabel}”`),
      );
    }
    if (strongDimNames.length > 0) {
      whyParagraphs.push(
        t("jobs.relevance.why.strong_dims").replace("{dims}", joinNaturally(strongDimNames, lang)),
      );
    }
    if (relevance.band === "promising") {
      whyParagraphs.push(t("jobs.relevance.why.promising"));
    } else if (relevance.band === "exploratory") {
      whyParagraphs.push(t("jobs.relevance.why.exploratory"));
    }
  } else if (relevance.basis === "family") {
    whyParagraphs.push(t("jobs.relevance.why.family"));
  }

  // Related competencies + career transitions come from the static
  // profession catalogue, never from CIG rows. The catalogue is public
  // information; the personalisation is purely which slug we look up.
  const topCompetencies: Competency[] = profession
    ? profession.competencies
        .slice()
        .sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || b.requiredLevel - a.requiredLevel)
        .slice(0, 5)
        .map((rc) => competencyCatalogue.find((c) => c.id === rc.competencyId))
        .filter((c): c is Competency => !!c)
    : [];

  const nextRoles = profession
    ? (profession.nextRoles ?? [])
        .map((slug) => getProfession(slug))
        .filter((p): p is NonNullable<ReturnType<typeof getProfession>> => !!p)
        .slice(0, 4)
    : [];

  const noProfessionMatch = relevance.basis === "none";

  return (
    <section
      className="rounded-lg border border-primary/30 bg-primary/5 p-5"
      aria-labelledby="job-relevance-heading"
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="job-relevance-heading" className="text-xl font-semibold">
            {t("jobs.relevance.panel.title")}
          </h2>
        </div>
      </div>

      {noProfessionMatch && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("jobs.relevance.panel.no_match.body")}
        </p>
      )}

      {relevance.basis === "family" && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("jobs.relevance.panel.family_only.body")}
        </p>
      )}

      {whyParagraphs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("jobs.relevance.panel.why.title")}
          </h3>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground">
            {whyParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      )}

      {strongDimNames.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("jobs.relevance.panel.strengths.title")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {strongDimNames.map((n) => (
              <li
                key={n}
                className="rounded-full border border-primary/30 bg-background px-2.5 py-0.5 text-xs"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {developDimNames.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("jobs.relevance.panel.develop.title")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {developDimNames.map((n) => (
              <li
                key={n}
                className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {topCompetencies.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("jobs.relevance.panel.competencies.title")}
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {topCompetencies.map((c) => (
              <li key={c.id} className="leading-relaxed">
                <span className="font-medium">{pickBi(c.name.sv, c.name.en, lang)}</span>
                <span className="text-muted-foreground">
                  {" — "}
                  {pickBi(c.definition.sv, c.definition.en, lang)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextRoles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("jobs.relevance.panel.transitions.title")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {nextRoles.map((p) => (
              <li key={p.slug}>
                <Link
                  to="/career-center/$profession"
                  params={{ profession: p.slug }}
                  className="rounded-full border border-border bg-background px-3 py-1 text-primary hover:underline"
                >
                  {lang === "sv" ? p.titleSv : p.titleEn}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profession && (
        <div className="mt-5">
          <Link
            to="/career-center/$profession"
            params={{ profession: profession.slug }}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t("jobs.relevance.panel.career_center.cta")} →
          </Link>
        </div>
      )}

      <div className="mt-5 flex items-start gap-2 border-t border-primary/20 pt-4 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>{t("jobs.relevance.panel.disclaimer")}</p>
      </div>
    </section>
  );
}