// Profession recommendations — the rendering half of Layer 4.
//
// Renders snapshot.professions when available: three tiers (Strongest /
// Also worth exploring / Longer-term), each card carrying a stage badge, the
// candidate-specific "why" (explainMatch), and an expandable detail section
// fetched live from CIG (requirements, education, certifications, pathway) —
// see profession-detail.functions.ts's header for why that split exists.
//
// This never runs in production today: snapshot.professions.available is
// false until an owner approves a profession (see ./professions.ts). It
// exists now, fully wired and tested against golden persona fixtures, so
// approval is the only remaining step between "built" and "live" —
// Execution Mandate §29's "build it completely, keep the flag off" rule.

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
}: {
  detail: ProfessionDetail | undefined;
  locale: Locale;
  jobsHref: string;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
}) {
  const { t } = useT();
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

      <div>
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

function ProfessionCard({
  match,
  locale,
  detail,
  onOpenCareerCard,
  sessionId,
  isGoal,
  onSetGoal,
  settingGoal,
  onEvent,
}: {
  match: ProfessionMatch;
  locale: Locale;
  detail: ProfessionDetail | undefined;
  onOpenCareerCard?: (match: ProfessionMatch) => void;
  /** Present only once a result is claimed — setting a goal needs a real
   *  owned cd_sessions row (see setCareerGoal). Absent for an anonymous
   *  preview, so the action is hidden rather than shown and failing. */
  sessionId?: string | null;
  isGoal?: boolean;
  onSetGoal?: (match: ProfessionMatch) => void;
  settingGoal?: boolean;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
}) {
  const { t } = useT();
  const explanation = explainMatch(match, locale);
  const title = locale === "sv" ? match.titleSv : match.titleEn;
  const jobsHref = match.cigProfessionSlug
    ? `/jobs/profession/${encodeURIComponent(match.cigProfessionSlug)}`
    : "/jobs";
  const exploredFiredRef = useRef(false);

  return (
    <AccordionItem
      value={match.professionId}
      className="rounded-lg border border-border bg-background px-5 last:border-b"
    >
      <AccordionTrigger
        className="py-5 hover:no-underline [&>svg]:hidden"
        onClick={() => {
          if (!exploredFiredRef.current) {
            exploredFiredRef.current = true;
            onEvent?.("profession_explored", { professionId: match.professionId });
          }
        }}
      >
        <div className="flex w-full flex-wrap items-start justify-between gap-3 text-left">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <StageBadge match={match} locale={locale} />
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {explanation.rationale}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
            {FIT_LABEL[match.fitTier][locale]}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
              aria-hidden="true"
            />
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-6">
        <p className="mb-4 text-sm leading-relaxed text-foreground">{explanation.stageSentence}</p>
        {explanation.contextCorroborationSentence && (
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            {explanation.contextCorroborationSentence}
          </p>
        )}
        {explanation.alignedDimensionNames.length > 0 && (
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{explanation.alignedIntro}</span>{" "}
            {explanation.alignedDimensionNames.join(" · ")}
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
      </AccordionContent>
    </AccordionItem>
  );
}

function Tier({
  heading,
  matches,
  locale,
  detailsBySlug,
  onOpenCareerCard,
  sessionId,
  goalProfessionId,
  onSetGoal,
  settingGoal,
  onEvent,
}: {
  heading: string;
  matches: readonly ProfessionMatch[];
  locale: Locale;
  detailsBySlug: Record<string, ProfessionDetail>;
  onOpenCareerCard?: (match: ProfessionMatch) => void;
  sessionId?: string | null;
  goalProfessionId?: string | null;
  onSetGoal?: (match: ProfessionMatch) => void;
  settingGoal?: boolean;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="mt-8 first:mt-0">
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{heading}</h3>
      <Accordion type="multiple" className="mt-4 space-y-3">
        {matches.map((m) => (
          <ProfessionCard
            key={m.professionId}
            match={m}
            locale={locale}
            detail={m.cigProfessionSlug ? detailsBySlug[m.cigProfessionSlug] : undefined}
            onOpenCareerCard={onOpenCareerCard}
            sessionId={sessionId}
            isGoal={goalProfessionId === m.professionId}
            onSetGoal={onSetGoal}
            settingGoal={settingGoal}
            onEvent={onEvent}
          />
        ))}
      </Accordion>
    </div>
  );
}

export function ProfessionRecommendations({
  strongestDirections,
  alsoWorthExploring,
  longerTermPossibilities,
  careerPivots,
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
  locale: Locale;
  onOpenCareerCard?: (match: ProfessionMatch) => void;
  /** Present only for a claimed (authenticated, owned) result. */
  sessionId?: string | null;
  goalProfessionId?: string | null;
  onSetGoal?: (match: ProfessionMatch) => void;
  settingGoal?: boolean;
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
}) {
  const allSlugs = [
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

  return (
    <div>
      <Tier
        heading={TIER_HEADING.strongest[locale]}
        matches={strongestDirections}
        locale={locale}
        detailsBySlug={detailsBySlug}
        onOpenCareerCard={onOpenCareerCard}
        sessionId={sessionId}
        goalProfessionId={goalProfessionId}
        onSetGoal={onSetGoal}
        settingGoal={settingGoal}
        onEvent={onEvent}
      />
      <Tier
        heading={TIER_HEADING.alsoWorth[locale]}
        matches={alsoWorthExploring}
        locale={locale}
        detailsBySlug={detailsBySlug}
        onOpenCareerCard={onOpenCareerCard}
        sessionId={sessionId}
        goalProfessionId={goalProfessionId}
        onSetGoal={onSetGoal}
        settingGoal={settingGoal}
        onEvent={onEvent}
      />
      <Tier
        heading={TIER_HEADING.longerTerm[locale]}
        matches={longerTermPossibilities}
        locale={locale}
        detailsBySlug={detailsBySlug}
        onOpenCareerCard={onOpenCareerCard}
        sessionId={sessionId}
        goalProfessionId={goalProfessionId}
        onSetGoal={onSetGoal}
        settingGoal={settingGoal}
        onEvent={onEvent}
      />
      <Tier
        heading={TIER_HEADING.careerPivot[locale]}
        matches={careerPivots ?? []}
        locale={locale}
        detailsBySlug={detailsBySlug}
        onOpenCareerCard={onOpenCareerCard}
        sessionId={sessionId}
        goalProfessionId={goalProfessionId}
        onSetGoal={onSetGoal}
        settingGoal={settingGoal}
        onEvent={onEvent}
      />
    </div>
  );
}
