import { Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useCareerAnalysisOpen } from "@/components/career-discovery/use-career-analysis-open";
import {
  icon,
  jobsProfessionSlug,
  type PersonalDirection as Direction,
  type PersonalRecommendation,
} from "@/lib/career-center";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";
import { DIMENSIONS } from "@/lib/career-discovery/v31/dimensions";
import {
  RECOMMENDATION_CONFIDENCE_LABEL,
  STAGE_LABEL,
} from "@/lib/career-discovery/v31/profession-explanations";
import { jobsEnabled } from "@/lib/job-intelligence/feature-flag";
import { ProfessionInfoAction } from "./ProfessionInfoAction";

// "Din riktning" — the Career Center's only personal section.
//
// ── THE ONE RULE ───────────────────────────────────────────────────────
//
// This component renders recommendations in exactly one of its branches: the
// one where the reader's own frozen report is in hand. Every other branch —
// anonymous, no analysis, unreadable, an instrument that named areas rather
// than occupations — renders ITSELF, with its own heading and its own action.
// None of them shows a profession list under a personal heading.
//
// That is the whole point of the section. "Rekommenderat för dig" over three
// catalogue entries picked by anything other than the reader's result is
// indistinguishable from the real thing right up until somebody acts on it.
//
// ── TWO SENTENCES THAT ARE NOT DECORATION ──────────────────────────────
//
// `cc.me.notAssessed` states that formal requirements were not tested. It is
// rendered from `formalRequirementsAssessed`, which is typed `false`, so the
// sentence cannot be dropped by an edit that "tidies up the copy" without
// first changing a type.
//
// `cc.me.frozenLocale` appears when the snapshot was frozen in the other
// language. The stored titles are in THAT language whatever the reader has
// selected, and presenting them as though they had been translated would be
// mislabelling our own content.

export function PersonalDirectionSection({
  direction,
  onRetry,
  exploreSearch,
  exploreAnchor,
  savedProfessionId,
  onProfessionOpen,
  onAssessmentStart,
  facts,
}: {
  direction: Direction;
  onRetry?: () => void;
  /** Where "utforska i stället" goes: the hub's current search with the
   *  catalogue OPEN, plus its anchor. A bare `#anchor` used to scroll to a
   *  collapsed section and show nothing. */
  exploreSearch: Record<string, unknown>;
  exploreAnchor: string;
  /** The Career Center id of the profession saved in the profile, so the
   *  recommendation can say when the two coincide. Never used to re-rank. */
  savedProfessionId?: string | null;
  /** Fired alongside navigation, with the destination href. */
  onProfessionOpen?: (href: string) => void;
  /** Fired on the analysis CTA. Fire-and-forget funnel tracking; it must
   *  never delay the click it measures. */
  onAssessmentStart?: () => void;
  /** The instrument's own facts — question count, duration, no account, no
   *  right answers. Rendered ONLY in the states that actually offer the
   *  analysis, so a reader who already has a result is not told again how
   *  long it takes. */
  facts?: React.ReactNode;
}) {
  const { t, lang } = useT();
  // Asked only where the analysis is offered: a signed-out reader answers the
  // availability question, a signed-in reader without a result also the
  // tester gate — the same two questions the canonical route asks.
  const analysisOpen = useCareerAnalysisOpen(
    direction.state === "anonymous" ? false : direction.state === "no_result" ? true : null,
  );

  if (direction.state === "loading") {
    return (
      <Shell state="loading">
        {/* Before a session has been observed, nobody has been identified —
            including the crawler that will keep this HTML — so the surface
            says nothing about fetching anybody's analysis. Once a session
            IS known, the status line is true and is announced. */}
        {direction.reason === "report" ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {t("cc.me.loading")}
          </p>
        ) : (
          <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
            {t("cc.me.invite.body")}
          </p>
        )}
      </Shell>
    );
  }

  // Anonymous and "signed in but no analysis" get the same offer on purpose:
  // in both cases the page has no result. Two lines differ. A signed-in
  // reader is told plainly that they have no saved analysis (MVP text
  // specification §6); a signed-out reader may already HAVE one and simply
  // not be signed in, and telling them so is the difference between a dead
  // end and a door.
  //
  // A definite "not open" answer withdraws the offer rather than advertise a
  // door the canonical route will refuse, and says so in the homepage's
  // words. An unknown or failed answer keeps it: the route asks again and
  // shows its own honest state.
  if (direction.state === "anonymous" || direction.state === "no_result") {
    const closed = analysisOpen === false;
    return (
      <Shell state={direction.state}>
        <p className="mt-3 text-base font-semibold text-foreground">{t("cc.me.invite.title")}</p>
        <p className="mt-1 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
          {closed ? (
            t("home.career.closed")
          ) : (
            <>
              {t(direction.state === "no_result" ? "cc.me.none.body" : "cc.me.invite.body")}{" "}
              {DURATION_CLAIM[lang === "en" ? "en" : "sv"]}.
            </>
          )}
        </p>
        {direction.state === "anonymous" && (
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.me.invite.signedout")}
          </p>
        )}
        {!closed && facts}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {!closed && (
            <PrimaryLink
              to="/security-career-assessment"
              variant="primary"
              onClick={onAssessmentStart}
            >
              {t("cc.me.invite.cta")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
          )}
          <Link
            to="/career-center"
            search={{ ...exploreSearch, all: true } as never}
            hash={exploreAnchor}
            data-explore-catalogue
            className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("cc.me.invite.secondary")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (direction.state === "unreadable") {
    return (
      <Shell state="unreadable">
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
          {t("cc.me.unreadable.body")}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cc.me.unreadable.retry")}
            </button>
          )}
          <Link
            to="/security-career-assessment/history"
            className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("cc.me.unreadable.history")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (direction.state === "no_roles_named") {
    return (
      <Shell state="no_roles_named">
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
          {t("cc.me.noroles.body")}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            to={direction.reportHref}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)]"
          >
            {t("cc.me.view")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link
            to="/career-center"
            search={{ ...exploreSearch, all: true } as never}
            hash={exploreAnchor}
            data-explore-catalogue
            className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("cc.me.invite.secondary")}
          </Link>
        </div>
      </Shell>
    );
  }

  const { primary, alternatives } = direction;
  const allIndicative = direction.items.every((i) => i.confidence === "indicative");

  return (
    <Shell state="ready">
      <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-muted-foreground">
        {t("cc.me.subtitle")}
      </p>
      {direction.completedAt && (
        <p className="mt-2 text-xs text-muted-foreground">
          <time dateTime={direction.completedAt}>
            {t("cc.me.completed")} {direction.completedAt.slice(0, 10)}
          </time>
        </p>
      )}
      {allIndicative && (
        <p
          role="note"
          className="mt-4 max-w-[70ch] rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground"
        >
          {t("cc.me.allIndicative")}
        </p>
      )}

      {/* ── THE FIRST-RANKED PROFESSION ─────────────────────────────── */}
      <PrimaryRecommendation
        item={primary}
        isSavedProfession={Boolean(
          savedProfessionId && primary.profession?.id === savedProfessionId,
        )}
        onProfessionOpen={onProfessionOpen}
      />

      {/* ── ALTERNATIVES, VISIBLY SECONDARY ─────────────────────────── */}
      {alternatives.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("cc.me.alternatives")}
          </h3>
          <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {alternatives.map((item) => (
              <AlternativeRecommendation
                key={`${item.rank}-${item.reportTitleSv}`}
                item={item}
                onProfessionOpen={onProfessionOpen}
              />
            ))}
          </ol>
        </div>
      )}

      <p
        data-personal-not-assessed
        className="mt-8 flex max-w-[70ch] items-start gap-2 text-xs leading-relaxed text-muted-foreground"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
        <span>
          {/* Rendered from the model, not from copy discipline. See the file
              header: `formalRequirementsAssessed` is typed `false`. */}
          {direction.formalRequirementsAssessed ? null : t("cc.me.notAssessed")}
          {direction.frozenLocale && direction.frozenLocale !== lang
            ? ` ${t("cc.me.frozenLocale")}`
            : ""}
        </span>
      </p>

      <div className="mt-4">
        <Link
          to={direction.reportHref}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)]"
        >
          {t("cc.me.view")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </Shell>
  );
}

function itemTitle(item: PersonalRecommendation, lang: string): string {
  // The guide's own title when there is a guide — the name the reader will
  // see on the page they open — else the report's frozen title.
  if (item.profession) return lang === "sv" ? item.profession.titleSv : item.profession.titleEn;
  return lang === "sv" ? item.reportTitleSv : item.reportTitleEn;
}

function PrimaryRecommendation({
  item,
  isSavedProfession,
  onProfessionOpen,
}: {
  item: PersonalRecommendation;
  isSavedProfession: boolean;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  const locale = lang === "en" ? "en" : "sv";
  const Icon = icon(item.profession?.icon);
  const title = itemTitle(item, lang);
  const rationale = locale === "sv" ? item.rationaleSv : item.rationaleEn;
  const traits = item.alignedDimensions
    .slice(0, 3)
    .map((d) => DIMENSIONS[d]?.name[locale])
    .filter((n): n is string => Boolean(n));
  const jobsSlug =
    jobsEnabled() && item.profession
      ? jobsProfessionSlug(item.profession)
      : jobsEnabled()
        ? item.cigSlug
        : null;
  const fallbackReason =
    item.reason === "ranked_indicative" ? t("cc.me.reason.indicative") : t("cc.me.reason.ranked");

  return (
    <article
      data-personal-recommendation
      data-personal-primary
      data-rank={item.rank}
      aria-labelledby="personal-primary-title"
      className="mt-8 rounded-2xl border border-accent/40 bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-foreground">
          {t("cc.me.primary.badge")}
        </span>
        <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {RECOMMENDATION_CONFIDENCE_LABEL[item.confidence][locale]}
        </span>
        {item.stage && (
          <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            {STAGE_LABEL[item.stage][locale]}
          </span>
        )}
      </div>
      <div className="mt-5 flex items-start gap-4">
        <span className="hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-accent sm:inline-flex">
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3
            id="personal-primary-title"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h3>
          <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{t("cc.me.why")} </span>
            {rationale || fallbackReason}
          </p>
          {traits.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                {t("cc.me.traits")}
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
          {isSavedProfession && (
            <p data-personal-same-as-saved className="mt-4 text-sm text-muted-foreground">
              {t("cc.me.sameAsSaved")}
            </p>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ProfessionInfoAction
          info={item.info}
          title={title}
          variant="button"
          onOpen={onProfessionOpen}
        />
        {jobsSlug && (
          <Link
            to="/jobs/profession/$professionSlug"
            params={{ professionSlug: jobsSlug }}
            data-personal-jobs={jobsSlug}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("cc.jobs.for").replace("{role}", title)}
          </Link>
        )}
      </div>
    </article>
  );
}

function AlternativeRecommendation({
  item,
  onProfessionOpen,
}: {
  item: PersonalRecommendation;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  const locale = lang === "en" ? "en" : "sv";
  const title = itemTitle(item, lang);
  return (
    <li
      data-personal-recommendation
      data-rank={item.rank}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          #{item.rank}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {RECOMMENDATION_CONFIDENCE_LABEL[item.confidence][locale]}
        </span>
      </div>
      <h4 className="mt-3 text-base font-semibold tracking-tight text-foreground">{title}</h4>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
        {item.reason === "ranked_indicative"
          ? t("cc.me.reason.indicative")
          : t("cc.me.reason.rankedN").replace("{n}", String(item.rank))}
      </p>
      <div className="mt-3">
        <ProfessionInfoAction info={item.info} title={title} onOpen={onProfessionOpen} />
      </div>
    </li>
  );
}

/** The section heading is state-aware, and deliberately so.
 *
 *  "Din riktning — Utifrån din karriäranalys" over an invitation to take an
 *  analysis the reader has not taken is the small version of the same lie the
 *  whole component exists to avoid: it claims a personal basis that is not
 *  there. Each state names itself. */
function Shell({ state, children }: { state: Direction["state"]; children: React.ReactNode }) {
  const { t } = useT();
  const personal = state === "ready";
  // The heading is stable across the hydration boundary: "Var står du i dag?"
  // is true before we know who is reading AND once we know there is no result,
  // so the SSR heading is never replaced by a different one on the way to the
  // anonymous state. Only a reader whose own analysis IS in hand sees it
  // change, and only then to a heading that is finally justified.
  const title =
    state === "ready"
      ? t("cc.me.title")
      : state === "unreadable"
        ? t("cc.me.unreadable.title")
        : state === "no_roles_named"
          ? t("cc.me.noroles.title")
          : t("cc.me.loading.title");
  return (
    <div data-personal-direction data-personal-state={state}>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Compass className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden />
        {personal ? t("cc.me.eyebrow") : t("cc.test.eyebrow")}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl">
        {title}
      </h2>
      {children}
    </div>
  );
}
