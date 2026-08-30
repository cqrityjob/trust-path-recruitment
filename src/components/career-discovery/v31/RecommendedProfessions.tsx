// The occupational recommendation — the answer Career Discovery promises.
//
// ── WHY THIS SECTION EXISTS SEPARATELY FROM ProfessionRecommendations ──
//
// ProfessionRecommendations renders the GATED tiers: professions the
// candidate has a real, differentiated affinity with, grouped by career
// stage. Every threshold behind it is an exclusion, which is right — the
// report must not claim a fit it cannot support.
//
// The consequence, though, was that a genuinely balanced profile (several
// comparable strengths, no dominant one — a real result, and the one the
// report calls "Bred profil") could clear nothing at all, and somebody who
// answered twenty-eight questions about their working life reached the end
// with no occupation named. An orientation product that produces no
// orientation has not delivered.
//
// So this section renders the always-present ranking instead: rank 1, 2 and
// 3 out of the calibrated catalogue, in a stated order, each with the
// reason it is there and the two-to-three Career DNA traits that put it
// there. The claim is scaled by `confidence`, which is where the honesty
// lives — a "strong"/"moderate" entry cleared the same gates a tier card
// clears; an "indicative" one is the closest profession to these answers
// and is labelled as exactly that, with a clarifier under the list.
//
// It renders no percentage and no score, same as everywhere else (PMR006).
// It is not a competence judgement and the copy says so.

import { translateFor } from "@/i18n/context";
import {
  explainMatch,
  RECOMMENDATION_CONFIDENCE_LABEL,
  STAGE_LABEL,
} from "@/lib/career-discovery/v31/profession-explanations";
import type { ProfessionStage, RankedProfession } from "@/lib/career-discovery/v31/professions";

type Locale = "sv" | "en";

/** Rank 1 is the recommendation; 2 and 3 are the alternatives held against
 *  it. Giving them visibly different weight is the point — three cards of
 *  equal size would say "these are interchangeable", which is the opposite
 *  of a ranked recommendation. */
function RankBadge({ rank, locale }: { rank: number; locale: Locale }) {
  const t = translateFor(locale);
  const label = rank === 1 ? t("careerDiscovery.report.v31.rec.rank1") : `#${rank}`;
  return (
    <span
      className={
        rank === 1
          ? "inline-flex items-center rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-foreground"
          : "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground"
      }
    >
      {label}
    </span>
  );
}

/** How realistic this profession is FROM WHERE THE CANDIDATE IS TODAY.
 *
 *  ── WHY THE RECOMMENDATION NEEDS THIS AND DID NOT HAVE IT ────────────
 *
 *  This section answers "which professions are closest to these answers".
 *  That is a statement about AFFINITY and says nothing about timing — and
 *  affinity is deliberately computed with no knowledge of career stage, so
 *  a senior profession can and does rank highly for someone just starting
 *  out. Rendering rank and confidence alone therefore let a beginner's
 *  report present, say, Risk Manager as headline recommendation #2 with
 *  nothing anywhere on the card saying it is years away — the exact
 *  "senior role as a direct next step" presentation Owner Approval Gate
 *  §6/§8 forbid, arriving through an omission rather than a wrong label.
 *
 *  The stage was always in the data (ProfessionMatch.stage, the same field
 *  the tier cards render through their own StageBadge); this section simply
 *  never showed it. Reusing STAGE_LABEL rather than writing new copy is
 *  deliberate: the two surfaces must say the SAME word about the same
 *  profession, which is also why professions.ts now runs the ranking pass
 *  through the identical career-pivot classification the tier buckets use. */
function StageBadge({ stage, locale }: { stage: ProfessionStage; locale: Locale }) {
  const tone =
    stage === "explore_now"
      ? "border-accent/40 bg-accent/10 text-accent"
      : stage === "possible_next_step"
        ? "border-border bg-muted/60 text-foreground"
        : stage === "career_pivot"
          ? "border-dashed border-border bg-muted/20 text-muted-foreground"
          : "border-border bg-muted/30 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {STAGE_LABEL[stage][locale]}
    </span>
  );
}

function RecommendationCard({
  entry,
  locale,
  primary,
}: {
  entry: RankedProfession;
  locale: Locale;
  primary: boolean;
}) {
  const t = translateFor(locale);
  const explanation = explainMatch(entry.match, locale);
  const title = locale === "sv" ? entry.match.titleSv : entry.match.titleEn;
  // Two to three traits, never the full aligned list: the ask is "the
  // strongest characteristics contributing to this recommendation", and a
  // list of six reads as a description of the person rather than a reason.
  const traits = explanation.alignedDimensionNames.slice(0, 3);

  return (
    <div
      className={
        primary
          ? "rounded-2xl border border-accent/40 bg-card p-6 sm:p-8"
          : "rounded-xl border border-border bg-card p-5"
      }
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <RankBadge rank={entry.rank} locale={locale} />
        <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {RECOMMENDATION_CONFIDENCE_LABEL[entry.confidence][locale]}
        </span>
        <StageBadge stage={entry.match.stage} locale={locale} />
      </div>

      <h3
        className={
          primary
            ? "mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            : "mt-3 text-lg font-semibold tracking-tight text-foreground"
        }
        style={primary ? { fontFamily: "var(--font-display)" } : undefined}
      >
        {title}
      </h3>

      {/* Why this profession. The authored inclusion rationale, not a
          generated sentence — the same text the tier cards show. */}
      <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
        {explanation.rationale}
      </p>

      {traits.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            {t("careerDiscovery.report.v31.rec.traitsLabel")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {traits.map((name) => (
              <li
                key={name}
                className="rounded-full border border-border bg-[color:var(--surface-subtle)] px-3 py-1 text-[13px] text-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {explanation.limitationNote && (
        <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed text-muted-foreground">
          {explanation.limitationNote}
        </p>
      )}
    </div>
  );
}

export function RecommendedProfessions({
  ranked,
  locale,
}: {
  ranked: readonly RankedProfession[];
  locale: Locale;
}) {
  const t = translateFor(locale);
  if (ranked.length === 0) return null;

  const [primary, ...rest] = ranked;
  // True when NOTHING in the recommendation cleared the fit gates. The
  // clarifier is shown for the whole section in that case rather than
  // per-card, because the honest statement is about the list as a whole:
  // this is an ordering, and no profession stood out.
  const allIndicative = ranked.every((r) => r.confidence === "indicative");

  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        {t("careerDiscovery.report.v31.rec.title")}
      </h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {t("careerDiscovery.report.v31.rec.lede")}
      </p>
      {allIndicative && (
        <p
          role="note"
          className="mt-4 max-w-[70ch] rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground"
        >
          {t("careerDiscovery.report.v31.rec.indicativeNote")}
        </p>
      )}

      <div className="mt-6">
        <RecommendationCard entry={primary} locale={locale} primary />
      </div>

      {rest.length > 0 && (
        <>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("careerDiscovery.report.v31.rec.alternativesTitle")}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {rest.map((entry) => (
              <RecommendationCard
                key={entry.match.professionId}
                entry={entry}
                locale={locale}
                primary={false}
              />
            ))}
          </div>
        </>
      )}

      {/* The boundary, stated where the recommendation is read rather than
          in a methodology block further down. Career Discovery is an
          orientation product: it does not measure competence and it makes no
          hiring decision. */}
      <p className="mt-6 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
        {t("careerDiscovery.report.v31.rec.boundary")}
      </p>
    </section>
  );
}
