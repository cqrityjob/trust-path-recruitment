// "Din karriärbild" — the career analysis result, read and never recomputed.
//
// ── WHAT IT SHOWS ──────────────────────────────────────────────────────
//
// The occupation the report actually recommended, up to two alternatives,
// and the themes the report named. Every value comes from
// `deriveCareerDirection`, which reads the FROZEN snapshot. The dashboard
// therefore cannot disagree with the report it links to — which it would,
// eventually, if it recomputed anything from live catalogue data.
//
// ── GUIDANCE, STATED AS GUIDANCE ───────────────────────────────────────
//
// One sentence, always present when a result is shown, saying these are
// possible directions based on the person's answers. No ranking language,
// no suitability claim, no readiness score, no hiring prediction. When the
// report's own confidence is `indicative`, a second sentence says what that
// means: closest in the catalogue, and nothing more.
//
// ── WHY A RETAKE IS NOT A FEATURE CARD ─────────────────────────────────
//
// "Redo the career analysis" used to be a dashboard card of the same weight
// as taking it for the first time, which put a completed person one click
// from throwing their result away. It belongs on the result page, and the
// link here is "see the full analysis".

import { Link } from "@tanstack/react-router";
import { ArrowRight, Compass } from "lucide-react";
import { useT } from "@/i18n/context";
import type { CareerDirection, RoleSummary } from "@/lib/professional-identity/career-direction";
import { L, Lf, type Lang } from "./copy";
import { CAREER } from "./home-copy";

function formatDate(iso: string | null, l: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(l === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

const roleTitle = (r: RoleSummary, l: Lang) => (l === "sv" ? r.titleSv : r.titleEn);

function SectionShell({ children, className }: { children: React.ReactNode; className?: string }) {
  const { lang } = useT();
  const l = lang as Lang;
  return (
    <section aria-labelledby="career-direction-heading" data-career-direction className={className}>
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L(CAREER.eyebrow, l)}
        </p>
        <h2
          id="career-direction-heading"
          className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span className="text-accent" aria-hidden="true">
            <Compass className="h-5 w-5" />
          </span>
          {L(CAREER.heading, l)}
        </h2>
        {children}
      </div>
    </section>
  );
}

export function CareerDirectionSection({
  career,
  /** The gate ANSWERED no: the analysis is not open to this person. Then the
   *  empty state says why and offers something they can actually do, rather
   *  than a button the product will refuse. */
  closed = false,
  /** Earlier analyses, when there are any. A compact disclosure INSIDE this
   *  section rather than the full-width "Alla mina rapporter" panel the home
   *  used to render empty at the bottom of the page. */
  children,
  className,
}: {
  career: CareerDirection;
  closed?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  if (career.state === "loading") {
    return (
      <SectionShell className={className}>
        <div role="status" aria-live="polite" className="mt-4">
          <p className="sr-only">{L(CAREER.loading, l)}</p>
          <div className="h-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        </div>
      </SectionShell>
    );
  }

  if (career.state === "unavailable") {
    return (
      <SectionShell className={className}>
        <p role="status" className="mt-3 text-sm italic text-muted-foreground">
          {L(CAREER.unavailable, l)}
        </p>
      </SectionShell>
    );
  }

  if (career.state === "unreadable") {
    return (
      <SectionShell className={className}>
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">{L(CAREER.unreadable, l)}</p>
        <Link
          to="/security-career-assessment/history"
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {L(CAREER.unreadableCta, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </SectionShell>
    );
  }

  if (career.state === "legacy") {
    const legacyDate = formatDate(career.completedAt, l);
    return (
      <SectionShell className={className}>
        {legacyDate && (
          <p className="mt-1 text-xs text-muted-foreground">
            <time dateTime={career.completedAt ?? undefined}>
              {Lf(CAREER.completed, l, legacyDate)}
            </time>
          </p>
        )}
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">{L(CAREER.legacy, l)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            to={career.reportHref}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {L(CAREER.view, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <Link
            to="/career-center"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {L(CAREER.explore, l)}
          </Link>
        </div>
        {children}
      </SectionShell>
    );
  }

  if (career.state === "none") {
    return (
      <SectionShell className={className}>
        <p className="mt-3 text-base font-semibold text-foreground">{L(CAREER.noneTitle, l)}</p>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          {closed ? L(CAREER.closed, l) : L(CAREER.noneBody, l)}
        </p>
        <Link
          to={closed ? "/career-center" : "/security-career-assessment"}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {closed ? L(CAREER.closedCta, l) : L(CAREER.noneCta, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </SectionShell>
    );
  }

  const completed = formatDate(career.completedAt, l);
  // Only about the TOP role. The sentence is singular -- "this is the
  // closest match" -- and attaching it because a third-ranked alternative is
  // indicative would weaken a recommendation the report did not weaken.
  const indicative = career.topRole?.confidence === "indicative";
  // The snapshot is frozen in the language it was taken in, and the strength
  // themes are the part that has no second-language form. Saying so is more
  // honest than silently showing Swedish content on an English page — and
  // the note is withheld when nothing on screen is actually in that other
  // language, since a warning about nothing is just noise.
  const otherLocale =
    career.frozenLocale !== null && career.frozenLocale !== l && career.strengthThemes.length > 0;

  return (
    <SectionShell className={className}>
      {completed && (
        <p className="mt-1 text-xs text-muted-foreground">
          <time dateTime={career.completedAt ?? undefined}>
            {Lf(CAREER.completed, l, completed)}
          </time>
        </p>
      )}

      {career.topRole ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {L(CAREER.topRole, l)}
          </p>
          <p
            data-top-role
            className="mt-1 text-xl font-semibold tracking-tight text-balance text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {roleTitle(career.topRole, l)}
          </p>
        </div>
      ) : (
        <p className="mt-4 max-w-[60ch] text-sm text-muted-foreground">
          {L(CAREER.noRolesNamed, l)}
        </p>
      )}

      {career.alternativeRoles.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {L(CAREER.alternatives, l)}
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {career.alternativeRoles.map((r) => (
              <li
                key={`${r.rank}-${r.titleSv}`}
                data-alternative-role
                className="rounded-full border border-border px-3 py-1 text-sm text-foreground"
              >
                {roleTitle(r, l)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {career.strengthThemes.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {L(CAREER.strengths, l)}
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {career.strengthThemes.map((t) => (
              <li
                key={t.id}
                data-strength-theme
                className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-accent"
              >
                {l === "sv" ? t.labelSv : t.labelEn}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Guidance, said as guidance. Always present beside a result. */}
      <p className="mt-4 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
        {L(CAREER.guidance, l)}
        {indicative ? ` ${L(CAREER.indicative, l)}` : ""}
        {otherLocale ? ` ${L(CAREER.frozenLocale, l)}` : ""}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          to={career.reportHref}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {L(CAREER.view, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <Link
          to="/career-center"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {L(CAREER.explore, l)}
        </Link>
      </div>
      {children}
    </SectionShell>
  );
}
