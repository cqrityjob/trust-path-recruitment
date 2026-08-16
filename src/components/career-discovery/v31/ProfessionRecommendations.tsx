// Profession recommendations — the rendering half of Layer 4.
//
// Renders snapshot.professions when available: the candidate's own current
// role (if self-reported) plus four discovery tiers (Strongest / Also worth
// exploring / Longer-term / Career pivot), each card carrying a stage badge,
// the candidate-specific "why" (explainMatch), and an expandable detail
// panel fetched live from CIG (requirements, education, certifications,
// pathway) — see profession-detail.functions.ts's header for why that split
// exists.
//
// ── OWNER REVIEW UX PASS (presentation only) ─────────────────────────────
//
// The Radix Accordion this used to be wrapped in put every card behind one
// undifferentiated trigger, which meant the three actions a candidate
// actually wants ("Explore career", "How do I get there?", "Current jobs")
// could not be shown until after they had already guessed to click. It is
// now a card with its own disclosure button set — same content, same data,
// same order, no nested-interactive markup. Keyboard and screen-reader
// behaviour is preserved explicitly via aria-expanded/aria-controls.
//
// Nothing about matching, ranking, staging or wording changed: this file
// still only renders what matchProfessions and explainMatch produced.
//
// This never runs in production today: snapshot.professions.available is
// false until an owner approves a profession (see ./professions.ts).

import { useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  Compass,
  ExternalLink,
  Route as RouteIcon,
} from "lucide-react";
import { translateFor } from "@/i18n/context";
import {
  explainMatch,
  FIT_LABEL,
  STAGE_LABEL,
  TIER_HEADING,
} from "@/lib/career-discovery/v31/profession-explanations";
import type { ProfessionMatch } from "@/lib/career-discovery/v31/professions";
import {
  getProfessionDetails,
  REQUIREMENT_LEVEL_LABEL,
  type ProfessionDetail,
  type RequirementLevel,
} from "@/lib/career-discovery/profession-detail.functions";

type Locale = "sv" | "en";

/** "primary" is the strongest tier: full-width, generous, one per row.
 *  "compact" is every other tier — visually lighter on purpose, so the
 *  report never reads as though all professions are equally important. */
type CardVariant = "primary" | "compact";

function StageBadge({ match, locale }: { match: ProfessionMatch; locale: Locale }) {
  const tone =
    match.stage === "explore_now"
      ? "border-accent/40 bg-accent/10 text-accent"
      : match.stage === "possible_next_step"
        ? "border-border bg-muted/60 text-foreground"
        : match.stage === "career_pivot"
          ? "border-dashed border-border bg-muted/20 text-muted-foreground"
          : "border-border bg-muted/30 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {STAGE_LABEL[match.stage][locale]}
    </span>
  );
}

function RequirementList({
  items,
  locale,
  empty,
}: {
  items: readonly { titleSv: string; titleEn: string; level: RequirementLevel }[];
  locale: Locale;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
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

function ProfessionDetailBody({
  detail,
  locale,
  jobsHref,
  onEvent,
  requirementsAnchorId,
}: {
  detail: ProfessionDetail | undefined;
  locale: Locale;
  jobsHref: string;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
  requirementsAnchorId: string;
}) {
  // Bound to the `locale` prop, not the live site toggle — see
  // FeedbackForm.tsx / V31ReportView.tsx for why.
  const t = translateFor(locale);
  const pathwayFiredRef = useRef(false);

  if (!detail) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("careerDiscovery.report.v31.professionDetailLoading")}
      </p>
    );
  }

  const overview =
    locale === "sv"
      ? (detail.overviewSv ?? detail.summarySv)
      : (detail.overviewEn ?? detail.summaryEn);
  const pathwayFrom = detail.pathway.filter((p) => p.direction === "from");
  const pathwayTo = detail.pathway.filter((p) => p.direction === "to");

  if ((pathwayFrom.length > 0 || pathwayTo.length > 0) && !pathwayFiredRef.current) {
    pathwayFiredRef.current = true;
    onEvent?.("pathway_opened", { professionSlug: detail.slug });
  }

  return (
    <div className="space-y-6">
      {overview && <p className="text-sm leading-relaxed text-muted-foreground">{overview}</p>}

      <div id={requirementsAnchorId} className="scroll-mt-24">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("careerDiscovery.report.v31.requirementsTitle")}
        </h4>
        <div className="mt-3">
          <RequirementList
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
            <RequirementList
              items={[...detail.education, ...detail.certifications]}
              locale={locale}
              empty={t("careerDiscovery.report.v31.requirementsEmpty")}
            />
          </div>
        </div>
      )}

      {(pathwayFrom.length > 0 || pathwayTo.length > 0) && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("careerDiscovery.report.v31.pathwayTitle")}
          </h4>
          <div className="mt-3 space-y-2">
            {pathwayTo.map((edge) => (
              <div
                key={`to-${edge.otherSlug}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background p-3 text-sm text-foreground"
              >
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                {locale === "sv" ? edge.otherTitleSv : edge.otherTitleEn}
              </div>
            ))}
            {pathwayFrom.map((edge) => (
              <div
                key={`from-${edge.otherSlug}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground"
              >
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 rotate-180 text-muted-foreground"
                  aria-hidden="true"
                />
                {locale === "sv" ? edge.otherTitleSv : edge.otherTitleEn}
              </div>
            ))}
          </div>
        </div>
      )}

      <a
        href={jobsHref}
        onClick={() => onEvent?.("jobs_clicked", { professionSlug: detail.slug })}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        {t("careerDiscovery.report.v31.currentJobsInDirection")}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

const ACTION_CLASS =
  "inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function ProfessionCard({
  match,
  locale,
  detail,
  variant,
  onOpenCareerCard,
  sessionId,
  isGoal,
  onSetGoal,
  settingGoal,
  onEvent,
  isCurrentRole,
}: {
  match: ProfessionMatch;
  locale: Locale;
  detail: ProfessionDetail | undefined;
  variant: CardVariant;
  onOpenCareerCard?: (match: ProfessionMatch) => void;
  /** Present only once a result is claimed — setting a goal needs a real
   *  owned cd_sessions row (see setCareerGoal). Absent for an anonymous
   *  preview, so the action is hidden rather than shown and failing. */
  sessionId?: string | null;
  isGoal?: boolean;
  onSetGoal?: (match: ProfessionMatch) => void;
  settingGoal?: boolean;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
  /** True only for the single card rendered from
   *  ProfessionMatchResult.currentProfessionMatch (Mandate item 8) — swaps
   *  the normal stage badge ("Explore now" etc, which reads oddly for a
   *  candidate's OWN current job) for a "Develop in your current role"
   *  label, and skips the stage sentence, which describes the gap between
   *  the candidate and a NEW direction — not applicable to where they
   *  already are. */
  isCurrentRole?: boolean;
}) {
  // Bound to the `locale` prop, not the live site toggle — see
  // FeedbackForm.tsx / V31ReportView.tsx for why.
  const t = translateFor(locale);
  const explanation = explainMatch(match, locale);
  const title = locale === "sv" ? match.titleSv : match.titleEn;
  const jobsHref = match.cigProfessionSlug
    ? `/jobs/profession/${encodeURIComponent(match.cigProfessionSlug)}`
    : "/jobs";
  const exploredFiredRef = useRef(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const requirementsAnchorId = `${panelId}-requirements`;

  function reveal(intent: "explore" | "requirements") {
    setOpen(true);
    if (!exploredFiredRef.current) {
      exploredFiredRef.current = true;
      onEvent?.("profession_explored", { professionId: match.professionId });
    }
    if (intent === "requirements") {
      // Runs after the panel has been painted; harmless no-op if the anchor
      // is not there yet (detail still loading).
      requestAnimationFrame(() => {
        document.getElementById(requirementsAnchorId)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }

  return (
    <article
      className={`relative overflow-hidden rounded-xl border bg-card transition-shadow ${
        variant === "primary"
          ? "border-border shadow-[0_1px_2px_rgba(11,31,58,0.04),0_8px_24px_-16px_rgba(11,31,58,0.18)] hover:shadow-[0_1px_2px_rgba(11,31,58,0.05),0_14px_32px_-18px_rgba(11,31,58,0.22)]"
          : "border-border"
      }`}
    >
      {variant === "primary" && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent to-accent/30"
        />
      )}
      <div className={variant === "primary" ? "p-5 pl-6 sm:p-6 sm:pl-7" : "p-5"}>
        <div className="flex flex-wrap items-center gap-2">
          {isCurrentRole ? (
            <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
              {t("careerDiscovery.report.v31.developCurrentRole")}
            </span>
          ) : (
            <StageBadge match={match} locale={locale} />
          )}
          <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
            {FIT_LABEL[match.fitTier][locale]}
          </span>
        </div>

        <h3
          className={`mt-3 font-semibold tracking-tight text-foreground ${
            variant === "primary" ? "text-xl md:text-2xl" : "text-base md:text-lg"
          }`}
          style={variant === "primary" ? { fontFamily: "var(--font-display)" } : undefined}
        >
          {title}
        </h3>

        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("careerDiscovery.report.v31.whyThisAppeared")}
        </p>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {explanation.rationale}
        </p>

        {explanation.alignedDimensionNames.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {explanation.alignedDimensionNames.map((name) => (
              <li
                key={name}
                className="rounded-full border border-border bg-[color:var(--surface-subtle)] px-2.5 py-1 text-xs text-muted-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : reveal("explore"))}
            aria-expanded={open}
            aria-controls={panelId}
            className={ACTION_CLASS}
          >
            <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
            {open
              ? t("careerDiscovery.report.v31.closeDetail")
              : t("careerDiscovery.report.v31.exploreCareer")}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => reveal("requirements")}
            aria-controls={panelId}
            className={ACTION_CLASS}
          >
            <RouteIcon className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("careerDiscovery.report.v31.howDoIGetThere")}
          </button>
          <a
            href={jobsHref}
            onClick={() => onEvent?.("jobs_clicked", { professionSlug: match.cigProfessionSlug })}
            className={ACTION_CLASS}
          >
            <Briefcase className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("careerDiscovery.report.v31.currentJobsShort")}
          </a>
        </div>
      </div>

      <div
        id={panelId}
        role="region"
        aria-label={title}
        hidden={!open}
        className={variant === "primary" ? "px-5 pb-6 pl-6 sm:px-6 sm:pl-7" : "px-5 pb-6"}
      >
        <div className="border-t border-border pt-5">
          {!isCurrentRole && (
            <p className="mb-4 text-sm leading-relaxed text-foreground">
              {explanation.stageSentence}
            </p>
          )}
          {explanation.contextCorroborationSentence && (
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {explanation.contextCorroborationSentence}
            </p>
          )}
          {explanation.limitationNote && (
            <p className="mb-5 rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
              {explanation.limitationNote}
            </p>
          )}
          <ProfessionDetailBody
            detail={detail}
            locale={locale}
            jobsHref={jobsHref}
            onEvent={onEvent}
            requirementsAnchorId={requirementsAnchorId}
          />
          <div className="mt-6 flex flex-wrap gap-3">
            {onOpenCareerCard && (
              <button
                type="button"
                onClick={() => onOpenCareerCard(match)}
                className="inline-flex h-10 items-center rounded-[10px] border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-subtle)]"
              >
                {t("careerDiscovery.report.v31.createCareerCardFor")}
              </button>
            )}
            {sessionId && onSetGoal && (
              <button
                type="button"
                onClick={() => onSetGoal(match)}
                disabled={settingGoal}
                aria-pressed={Boolean(isGoal)}
                className={`inline-flex h-10 items-center rounded-[10px] border px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
                  isGoal
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card text-foreground hover:bg-[color:var(--surface-subtle)]"
                }`}
              >
                {isGoal
                  ? t("careerDiscovery.report.v31.goalSet")
                  : t("careerDiscovery.report.v31.setAsGoal")}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Tier({
  heading,
  description,
  matches,
  locale,
  variant,
  detailsBySlug,
  onOpenCareerCard,
  sessionId,
  goalProfessionId,
  onSetGoal,
  settingGoal,
  onEvent,
  isCurrentRole,
}: {
  heading: string;
  description?: string;
  matches: readonly ProfessionMatch[];
  locale: Locale;
  variant: CardVariant;
  detailsBySlug: Record<string, ProfessionDetail>;
  onOpenCareerCard?: (match: ProfessionMatch) => void;
  sessionId?: string | null;
  goalProfessionId?: string | null;
  onSetGoal?: (match: ProfessionMatch) => void;
  settingGoal?: boolean;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
  isCurrentRole?: boolean;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="mt-10 first:mt-0">
      <h3
        className={
          variant === "primary"
            ? "text-lg font-semibold tracking-tight text-foreground"
            : "text-sm font-semibold uppercase tracking-widest text-muted-foreground"
        }
      >
        {heading}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      <div className={`mt-4 ${variant === "primary" ? "space-y-4" : "grid gap-3 md:grid-cols-2"}`}>
        {matches.map((m) => (
          <ProfessionCard
            key={m.professionId}
            match={m}
            locale={locale}
            variant={variant}
            detail={m.cigProfessionSlug ? detailsBySlug[m.cigProfessionSlug] : undefined}
            onOpenCareerCard={onOpenCareerCard}
            sessionId={sessionId}
            isGoal={goalProfessionId === m.professionId}
            onSetGoal={onSetGoal}
            settingGoal={settingGoal}
            onEvent={onEvent}
            isCurrentRole={isCurrentRole}
          />
        ))}
      </div>
    </div>
  );
}

export function ProfessionRecommendations({
  strongestDirections,
  alsoWorthExploring,
  longerTermPossibilities,
  careerPivots,
  currentProfessionMatch,
  locale,
  onOpenCareerCard,
  sessionId,
  goalProfessionId,
  onSetGoal,
  settingGoal,
  onEvent,
}: {
  strongestDirections: readonly ProfessionMatch[];
  alsoWorthExploring: readonly ProfessionMatch[];
  longerTermPossibilities: readonly ProfessionMatch[];
  /** stage === "career_pivot" (§12-13) — real affinity, different direction.
   *  Optional only so existing callers (e.g. a frozen older snapshot without
   *  this bucket) don't break; render nothing when absent. */
  careerPivots?: readonly ProfessionMatch[];
  /** The candidate's own current profession's match entry (Mandate item 8),
   *  already excluded from every bucket above by professions.ts — rendered
   *  here as its own "Develop in your current role" block, never mixed into
   *  the discovery tiers. Optional/null for the same frozen-snapshot
   *  backward-compatibility reason as careerPivots. */
  currentProfessionMatch?: ProfessionMatch | null;
  locale: Locale;
  onOpenCareerCard?: (match: ProfessionMatch) => void;
  /** Present only for a claimed (authenticated, owned) result. */
  sessionId?: string | null;
  goalProfessionId?: string | null;
  onSetGoal?: (match: ProfessionMatch) => void;
  settingGoal?: boolean;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
}) {
  const t = translateFor(locale);
  const allSlugs = [
    ...(currentProfessionMatch ? [currentProfessionMatch] : []),
    ...strongestDirections,
    ...alsoWorthExploring,
    ...longerTermPossibilities,
    ...(careerPivots ?? []),
  ]
    .map((m) => m.cigProfessionSlug)
    .filter((s): s is string => Boolean(s));
  const uniqueSlugs = [...new Set(allSlugs)];

  const load = useServerFn(getProfessionDetails);
  const query = useQuery({
    queryKey: ["v31", "profession-details", uniqueSlugs],
    queryFn: () => load({ data: { slugs: uniqueSlugs } }),
    enabled: uniqueSlugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const detailsBySlug = query.data ?? {};

  // PROFESSION SCORING FRAMEWORK v1 §7: secondary/alternative directions
  // default to at most SECONDARY_VISIBLE_DEFAULT cards, the rest behind
  // "Show more" — presentation only, the engine still returns every
  // legitimate match (alsoWorthExploring/longerTermPossibilities/
  // careerPivots), this just caps what's visible before the candidate asks
  // for more. Tier headings/semantics (§8: distinguishable pathway labels)
  // are unchanged — a tier only disappears when collapsing leaves it with
  // zero visible matches, never merged into an undifferentiated bucket.
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const SECONDARY_VISIBLE_DEFAULT = 2;
  const secondaryTiersAll = [
    { heading: TIER_HEADING.alsoWorth[locale], matches: alsoWorthExploring },
    { heading: TIER_HEADING.longerTerm[locale], matches: longerTermPossibilities },
    { heading: TIER_HEADING.careerPivot[locale], matches: careerPivots ?? [] },
  ].filter((tier) => tier.matches.length > 0);
  const secondaryTotal = secondaryTiersAll.reduce((sum, tier) => sum + tier.matches.length, 0);
  const hiddenSecondaryCount = Math.max(0, secondaryTotal - SECONDARY_VISIBLE_DEFAULT);
  const secondaryTiers = useMemo(() => {
    if (secondaryExpanded || hiddenSecondaryCount === 0) return secondaryTiersAll;
    let remaining = SECONDARY_VISIBLE_DEFAULT;
    return secondaryTiersAll
      .map((tier) => {
        const take = tier.matches.slice(0, Math.max(0, remaining));
        remaining -= take.length;
        return { ...tier, matches: take };
      })
      .filter((tier) => tier.matches.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    secondaryExpanded,
    hiddenSecondaryCount,
    alsoWorthExploring,
    longerTermPossibilities,
    careerPivots,
    locale,
  ]);

  return (
    <div>
      {currentProfessionMatch && (
        <Tier
          heading={t("careerDiscovery.report.v31.developCurrentRole")}
          matches={[currentProfessionMatch]}
          locale={locale}
          variant="primary"
          detailsBySlug={detailsBySlug}
          onOpenCareerCard={onOpenCareerCard}
          sessionId={sessionId}
          goalProfessionId={goalProfessionId}
          onSetGoal={onSetGoal}
          settingGoal={settingGoal}
          onEvent={onEvent}
          isCurrentRole
        />
      )}
      <Tier
        heading={TIER_HEADING.strongest[locale]}
        matches={strongestDirections}
        locale={locale}
        variant="primary"
        detailsBySlug={detailsBySlug}
        onOpenCareerCard={onOpenCareerCard}
        sessionId={sessionId}
        goalProfessionId={goalProfessionId}
        onSetGoal={onSetGoal}
        settingGoal={settingGoal}
        onEvent={onEvent}
      />

      {/* 8 · OTHER DIRECTIONS TO EXPLORE — deliberately lighter than the
          strongest tier, and clearly separated into secondary exploration,
          longer-term directions and career pivots. Same buckets, same
          order, same content as before: only the visual weight differs. */}
      {secondaryTiers.length > 0 && (
        <div className="mt-14 border-t border-border pt-10">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {t("careerDiscovery.report.v31.otherDirectionsTitle")}
          </h3>
          {secondaryTiers.map((tier) => (
            <Tier
              key={tier.heading}
              heading={tier.heading}
              matches={tier.matches}
              locale={locale}
              variant="compact"
              detailsBySlug={detailsBySlug}
              onOpenCareerCard={onOpenCareerCard}
              sessionId={sessionId}
              goalProfessionId={goalProfessionId}
              onSetGoal={onSetGoal}
              settingGoal={settingGoal}
              onEvent={onEvent}
            />
          ))}
          {hiddenSecondaryCount > 0 && (
            <button
              type="button"
              onClick={() => setSecondaryExpanded((v) => !v)}
              aria-expanded={secondaryExpanded}
              className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-subtle)]"
            >
              {secondaryExpanded
                ? t("careerDiscovery.report.v31.showFewerDirections")
                : `${t("careerDiscovery.report.v31.showMoreDirections")} (${hiddenSecondaryCount})`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${secondaryExpanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
