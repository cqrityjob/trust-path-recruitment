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

import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { translateFor } from "@/i18n/context";
import { exploreDestinationFor } from "@/lib/career-center/profession-links";
import {
  getProfessionDetails,
  REQUIREMENT_LEVEL_LABEL,
  type ProfessionDetail,
  type RequirementLevel,
} from "@/lib/career-discovery/profession-detail.functions";
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

/** The chip's hit area: 44px tall and keyboard-focusable, wrapped around a
 *  chip that keeps the compact pill the card always had. The hit area is
 *  the anchor/button itself, so the target size holds without the chip
 *  growing into a tall button. */
const CHIP_TARGET_CLASS =
  "group inline-flex min-h-11 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const CHIP_CLASS =
  "inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent transition-colors group-hover:bg-accent/20";

/** "Utforska nu" — the one action on a recommendation card.
 *
 *  ── WHY THIS IS A LINK (OR A BUTTON) AND NOT A BADGE ──────────────────
 *
 *  The chip used to be StageBadge's <span> for the "explore_now" stage. It
 *  read as the card's call to action — accent-coloured, imperative, next to
 *  the occupation's name — and did nothing when pressed, which the owner
 *  reported as "the Explore now button is not clickable". A control that
 *  looks pressable must be pressable, and it must go somewhere that shows
 *  the occupation.
 *
 *  Where it goes is decided by exploreDestinationFor (profession-links.ts),
 *  not here: a published Career Center guide when one exists, otherwise the
 *  card's own details panel fed from the Career Intelligence Graph. This
 *  component only renders whichever the resolver returned.
 *
 *  For the "explore_now" stage the chip IS the stage badge, so the card
 *  looks exactly as before with the one difference that it works. For the
 *  other stages the stage badge stays as it was (it is a classification,
 *  and "Långsiktig riktning" is not an instruction to explore now) and the
 *  chip reads "Utforska yrket" beside it, so every card has the action. */
function ExploreChip({
  entry,
  locale,
  title,
  open,
  onToggle,
  panelId,
}: {
  entry: RankedProfession;
  locale: Locale;
  title: string;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  const t = translateFor(locale);
  const destination = exploreDestinationFor(entry.match);
  const label =
    entry.match.stage === "explore_now"
      ? STAGE_LABEL.explore_now[locale]
      : t("careerDiscovery.report.v31.exploreCareer");
  // The accessible name carries the occupation, so a screen-reader user
  // tabbing through three cards hears "Explore now: Polis", not "Explore
  // now" three times.
  const accessibleName = `${label}: ${title}`;

  if (destination.kind === "career_center") {
    return (
      <Link
        to="/career-center/$profession"
        params={{ profession: destination.slug }}
        aria-label={accessibleName}
        data-explore-link={entry.match.professionId}
        data-explore-kind="career_center"
        className={CHIP_TARGET_CLASS}
      >
        <span className={CHIP_CLASS}>
          {label}
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={accessibleName}
      data-explore-link={entry.match.professionId}
      data-explore-kind="inline_details"
      className={CHIP_TARGET_CLASS}
    >
      <span className={CHIP_CLASS}>
        {label}
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

function DetailList({
  items,
  locale,
  empty,
}: {
  items: readonly { titleSv: string; titleEn: string; level: RequirementLevel }[];
  locale: Locale;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={`${item.titleSv}-${item.level}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3"
        >
          <span className="text-sm text-foreground">
            {locale === "sv" ? item.titleSv : item.titleEn}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {REQUIREMENT_LEVEL_LABEL[item.level][locale]}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The last-resort destination: live Career Intelligence Graph content for
 *  an occupation with no published guide, inside the card.
 *
 *  Mounted only while the panel is open. The reads need a QueryClient and a
 *  server-function client, neither of which the static-markup guards
 *  provide, and no read should be made for a panel nobody opened. Nothing
 *  here is synthesised: it is the same `getProfessionDetails` read the
 *  gated tier cards use, or an honest "could not read" line. */
function InlineProfessionDetails({
  cigSlug,
  locale,
  stageSentence,
}: {
  cigSlug: string | null;
  locale: Locale;
  stageSentence: string;
}) {
  const t = translateFor(locale);
  const load = useServerFn(getProfessionDetails);
  const query = useQuery({
    queryKey: ["v31", "profession-details", [cigSlug]],
    queryFn: () => load({ data: { slugs: [cigSlug as string] } }),
    enabled: cigSlug !== null,
    staleTime: 5 * 60 * 1000,
  });
  const detail: ProfessionDetail | undefined = cigSlug ? query.data?.[cigSlug] : undefined;
  const overview = detail
    ? locale === "sv"
      ? (detail.overviewSv ?? detail.summarySv)
      : (detail.overviewEn ?? detail.summaryEn)
    : null;

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-foreground">{stageSentence}</p>
      {cigSlug !== null && query.isPending && (
        <p className="text-sm text-muted-foreground" role="status">
          {t("careerDiscovery.report.v31.professionDetailLoading")}
        </p>
      )}
      {cigSlug !== null && !query.isPending && !detail && (
        <p className="text-sm text-muted-foreground" role="status">
          {t("careerDiscovery.report.v31.professionDetailError")}
        </p>
      )}
      {detail && (
        <>
          {overview && <p className="text-sm leading-relaxed text-muted-foreground">{overview}</p>}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("careerDiscovery.report.v31.requirementsTitle")}
            </h4>
            <div className="mt-3">
              <DetailList
                items={detail.requirements}
                locale={locale}
                empty={t("careerDiscovery.report.v31.requirementsEmpty")}
              />
            </div>
          </div>
          {(detail.education.length > 0 || detail.certifications.length > 0) && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t("careerDiscovery.report.v31.educationTitle")}
              </h4>
              <div className="mt-3">
                <DetailList
                  items={[...detail.education, ...detail.certifications]}
                  locale={locale}
                  empty={t("careerDiscovery.report.v31.requirementsEmpty")}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
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
  const destination = exploreDestinationFor(entry.match);
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-explore`;

  return (
    <div
      className={
        primary
          ? "rounded-2xl border border-accent/40 bg-card p-6 sm:p-8"
          : "rounded-xl border border-border bg-card p-5"
      }
      data-recommendation-card={entry.match.professionId}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <RankBadge rank={entry.rank} locale={locale} />
        <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {RECOMMENDATION_CONFIDENCE_LABEL[entry.confidence][locale]}
        </span>
        {entry.match.stage !== "explore_now" && (
          <StageBadge stage={entry.match.stage} locale={locale} />
        )}
        <ExploreChip
          entry={entry}
          locale={locale}
          title={title}
          open={open}
          onToggle={() => setOpen((o) => !o)}
          panelId={panelId}
        />
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

      {/* The in-card destination, present only when no published guide
          exists (see exploreDestinationFor). The region is always in the
          DOM so aria-controls resolves; its content mounts on open. */}
      {destination.kind === "inline_details" && (
        <div
          id={panelId}
          role="region"
          aria-label={title}
          hidden={!open}
          data-explore-panel={entry.match.professionId}
          className="mt-5 border-t border-border pt-5"
        >
          {open && (
            <InlineProfessionDetails
              cigSlug={destination.cigSlug}
              locale={locale}
              stageSentence={explanation.stageSentence}
            />
          )}
        </div>
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
