import { Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { icon, type PersonalDirection as Direction } from "@/lib/career-center";
import { DURATION_CLAIM } from "@/lib/career-discovery/v31/duration";

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
  exploreHref,
  onProfessionOpen,
  onAssessmentStart,
  facts,
}: {
  direction: Direction;
  onRetry?: () => void;
  /** Where "utforska i stället" goes — the explorer anchor on this page. */
  exploreHref: string;
  onProfessionOpen?: (slug: string) => void;
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

  // Anonymous and "signed in but no analysis" get the same content on purpose:
  // in both cases the page has no result, and the honest offer is identical.
  // Only the extra line differs — a signed-out reader may already HAVE a
  // result and simply not be signed in, and telling them so is the difference
  // between a dead end and a door.
  if (direction.state === "anonymous" || direction.state === "no_result") {
    return (
      <Shell state={direction.state}>
        <p className="mt-3 text-base font-semibold text-foreground">{t("cc.me.invite.title")}</p>
        <p className="mt-1 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
          {t("cc.me.invite.body")} {DURATION_CLAIM[lang === "en" ? "en" : "sv"]}.
        </p>
        {direction.state === "anonymous" && (
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.me.invite.signedout")}
          </p>
        )}
        {facts}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <PrimaryLink
            to="/security-career-assessment"
            variant="primary"
            onClick={onAssessmentStart}
          >
            {t("cc.me.invite.cta")}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </PrimaryLink>
          <a
            href={exploreHref}
            className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("cc.me.invite.secondary")}
          </a>
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
          <a
            href={exploreHref}
            className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("cc.me.invite.secondary")}
          </a>
        </div>
      </Shell>
    );
  }

  const total = direction.items.length;

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

      <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        {direction.items.map((item) => {
          const Icon = icon(item.profession?.icon);
          const title = item.profession
            ? lang === "sv"
              ? item.profession.titleSv
              : item.profession.titleEn
            : lang === "sv"
              ? item.reportTitleSv
              : item.reportTitleEn;
          const reason =
            item.reason === "ranked_indicative"
              ? t("cc.me.reason.indicative")
              : item.rank === 1
                ? t("cc.me.reason.ranked")
                : t("cc.me.reason.rankedN").replace("{n}", String(item.rank));
          return (
            <li
              key={`${item.rank}-${item.reportTitleSv}`}
              data-personal-recommendation
              data-rank={item.rank}
              className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] tabular-nums text-muted-foreground">
                  {t("cc.me.rank")} {item.rank}/{total}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{reason}</p>
              {item.profession ? (
                <Link
                  to="/career-center/$profession"
                  params={{ profession: item.profession.slug }}
                  onClick={() => onProfessionOpen?.(item.profession!.slug)}
                  data-personal-guide={item.profession.slug}
                  className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("cc.me.cta")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              ) : (
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                  {t("cc.me.noGuide")}
                </p>
              )}
            </li>
          );
        })}
      </ol>

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

      <div className="mt-6">
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
