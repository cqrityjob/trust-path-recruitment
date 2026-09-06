// "Din karriärbild" — the career analysis result, read and never recomputed.
//
// The occupation the report recommended, up to two alternatives, and the
// themes it named — each occupation a link to ITS profession guide when
// the catalogue has one. The catalogue link below is labelled as the whole
// catalogue: it is not filtered to the person's top three, and the label
// must not imply it is. Guidance is stated as guidance.
//
// A failed read offers a retry and the person's analysis history; a report
// this build cannot read is its own state; a legacy result is a result.

import { Link } from "@tanstack/react-router";
import { ArrowRight, Compass } from "lucide-react";
import { useT } from "@/i18n/context";
import type { CareerDirection, RoleSummary } from "@/lib/professional-identity/career-direction";
import { L, Lf, type Lang } from "./copy";
import { CAREER } from "./home-copy";
import { Failed, Group, Loading } from "./home-primitives";
import { LINK, formatDate } from "./home-format";

const roleTitle = (r: RoleSummary, l: Lang) => (l === "sv" ? r.titleSv : r.titleEn);

function RoleLink({ role, className }: { role: RoleSummary; className: string }) {
  const { lang } = useT();
  const l = lang as Lang;
  if (!role.cigSlug) return <span className={className}>{roleTitle(role, l)}</span>;
  return (
    <Link
      to="/career-center/$profession"
      params={{ profession: role.cigSlug }}
      data-role-link={role.cigSlug}
      aria-label={Lf(CAREER.openProfession, l, roleTitle(role, l))}
      className={`${className} inline-flex min-h-11 items-center text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
    >
      {roleTitle(role, l)}
    </Link>
  );
}

export function CareerDirectionSection({
  career,
  closed = false,
  onRetry,
  children,
  className,
}: {
  career: CareerDirection;
  closed?: boolean;
  onRetry?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const groupProps = {
    id: "career-direction",
    title: L(CAREER.heading, l),
    eyebrow: L(CAREER.eyebrow, l),
    icon: <Compass className="h-5 w-5" />,
    className,
    "data-career-direction": "",
    "data-career-state": career.state,
  } as const;

  if (career.state === "loading") {
    return (
      <Group {...groupProps}>
        <Loading label={L(CAREER.loading, l)} className="mt-4" />
      </Group>
    );
  }
  if (career.state === "unavailable") {
    return (
      <Group {...groupProps}>
        <Failed
          message={L(CAREER.unavailable, l)}
          onRetry={onRetry}
          href="/security-career-assessment/history"
          hrefLabel={L(CAREER.history, l)}
          className="mt-3"
        />
      </Group>
    );
  }
  if (career.state === "unreadable") {
    return (
      <Group {...groupProps}>
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">{L(CAREER.unreadable, l)}</p>
        <Link to="/security-career-assessment/history" className={`${LINK} mt-3`}>
          {L(CAREER.history, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Group>
    );
  }
  if (career.state === "none") {
    return (
      <Group {...groupProps}>
        <p className="mt-3 text-base font-semibold text-foreground">{L(CAREER.noneTitle, l)}</p>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          {closed ? L(CAREER.closed, l) : L(CAREER.noneBody, l)}
        </p>
        <Link
          to={closed ? "/career-center" : "/security-career-assessment"}
          className={`${LINK} mt-3`}
        >
          {closed ? L(CAREER.closedCta, l) : L(CAREER.noneCta, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Group>
    );
  }

  const completed = formatDate(career.completedAt, l);
  const dateLine = completed && (
    <p className="mt-1 text-xs text-muted-foreground">
      <time dateTime={career.completedAt ?? undefined}>{Lf(CAREER.completed, l, completed)}</time>
    </p>
  );
  const actions = (href: string) => (
    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
      <Link to={href} className={LINK}>
        {L(CAREER.view, l)}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      <Link to="/career-center" className={LINK}>
        {L(CAREER.explore, l)}
      </Link>
    </div>
  );

  if (career.state === "legacy") {
    return (
      <Group {...groupProps}>
        {dateLine}
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">{L(CAREER.legacy, l)}</p>
        {actions(career.reportHref)}
        {children}
      </Group>
    );
  }

  const indicative = career.topRole?.confidence === "indicative";
  const otherLocale =
    career.frozenLocale !== null && career.frozenLocale !== l && career.strengthThemes.length > 0;

  return (
    <Group {...groupProps}>
      {dateLine}
      {career.topRole ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {L(CAREER.topRole, l)}
          </p>
          <p data-top-role className="mt-1" style={{ fontFamily: "var(--font-display)" }}>
            <RoleLink
              role={career.topRole}
              className="text-xl font-semibold tracking-tight text-balance text-foreground"
            />
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
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {career.alternativeRoles.map((r) => (
              <li
                key={`${r.rank}-${r.titleSv}`}
                data-alternative-role
                className="flex min-h-11 items-center"
              >
                <RoleLink role={r} className="text-sm font-medium text-foreground" />
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
      <p className="mt-4 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
        {L(CAREER.guidance, l)}
        {indicative ? ` ${L(CAREER.indicative, l)}` : ""}
        {otherLocale ? ` ${L(CAREER.frozenLocale, l)}` : ""}
      </p>
      {actions(career.reportHref)}
      {children}
    </Group>
  );
}
