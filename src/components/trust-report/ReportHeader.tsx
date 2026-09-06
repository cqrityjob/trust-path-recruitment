// TRUST Evidence Report — the masthead and the identity card.
//
// The Passport hero pattern: a slim navy masthead that frames the report
// (product identity, report title, the breadcrumb) and a white executive
// identity card overlapping it -- who, for which role, released when,
// commissioned by whom, "Mänskligt granskat", and the sentence that stays on
// every report: "Beslutsstöd för fortsatt mänsklig bedömning." One primary
// action, one secondary, the rest under "Mer". On paper the masthead is a
// plain rule and the card a bordered block (styles.css).

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Hash,
  Link2,
  ListChecks,
  Printer,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import { formatDate } from "@/lib/security-competency/trust-report.presentation";
import type { TrustReportNav, TrustReportSubject } from "./nav";

const PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-[color:var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none";
const SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none";

function initials(name: string | null): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ReportHeader({
  doc,
  nav,
  subject,
}: {
  doc: TrustReportDocument;
  nav: TrustReportNav;
  subject: TrustReportSubject;
}) {
  const { t, lang } = useT();
  const { core, employer } = doc.frozen_report;
  const [copied, setCopied] = useState(false);
  const released = formatDate(core.timestamps?.released_at ?? core.provenance?.released_at, lang);
  const assessment =
    lang === "en" ? core.assessment?.assessment_name_en : core.assessment?.assessment_name_sv;
  const reviewed = Boolean(core.human_review?.completed);
  const name = subject.candidateName ?? t("report.trust.meta.candidate");
  const mono = initials(subject.candidateName);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const startInterview = nav.applicationId ? (
    <Link
      to="/employer/$employerSlug/interview-intelligence/new"
      params={{ employerSlug: nav.employerSlug }}
      search={{ applicationId: nav.applicationId, jobId: nav.jobId ?? undefined }}
      className={PRIMARY}
    >
      {t("report.trust.action.startInterview")}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  ) : (
    <a href="#trust-plan" className={PRIMARY}>
      {t("report.trust.action.openPlan")}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );

  return (
    <header data-print-order={1} className="tr-identity">
      {/* ── Masthead: the navy trust anchor, framing, not dominating ── */}
      <div className="tr-masthead -mx-4 rounded-none bg-primary px-4 pb-12 pt-4 text-primary-foreground sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-xl lg:px-8">
        <nav aria-label="Breadcrumb" className="no-print">
          <ol className="flex flex-wrap items-center gap-1 text-[12px] text-primary-foreground/60">
            <li>
              <Link
                to="/employer/$employerSlug/assessments/participants"
                params={{ employerSlug: nav.employerSlug }}
                className="inline-flex min-h-[44px] items-center rounded-md px-1 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
              >
                {t("report.trust.breadcrumb.assessments")}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3 w-3" />
            </li>
            <li>
              {nav.applicationId ? (
                <Link
                  to="/employer/$employerSlug/applications/$applicationId"
                  params={{ employerSlug: nav.employerSlug, applicationId: nav.applicationId }}
                  className="inline-flex min-h-[44px] items-center rounded-md px-1 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
                >
                  {name}
                </Link>
              ) : (
                <span className="inline-flex min-h-[44px] items-center px-1">{name}</span>
              )}
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3 w-3" />
            </li>
            <li
              aria-current="page"
              className="inline-flex min-h-[44px] items-center px-1 font-medium text-primary-foreground/90"
            >
              {t("report.trust.breadcrumb.report")}
            </li>
          </ol>
        </nav>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
              <span
                className="text-[15px] normal-case tracking-tight text-primary-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                C<span className="text-trust">Q</span>rityjob
              </span>
              <span aria-hidden="true" className="h-3 w-px bg-primary-foreground/30" />
              {t("report.trust.masthead.tagline")}
            </p>
            <h1
              className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-primary-foreground sm:text-[32px]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("report.trust.title")}
            </h1>
            <p className="mt-1 text-[15px] text-primary-foreground/80">
              {t("report.trust.plan.subheading")}
            </p>
          </div>
        </div>
        <span aria-hidden="true" className="mt-5 block h-0.5 w-12 rounded-full bg-trust" />
      </div>

      {/* ── Identity card: the executive document head ── */}
      <div className="tr-identity-card relative -mt-8 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-md)] sm:p-6 lg:mx-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary text-[20px] font-semibold text-primary-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {mono || <UserRound className="h-7 w-7" />}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="text-[24px] font-semibold leading-tight tracking-tight text-foreground sm:text-[26px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {name}
              </p>
              <p className="mt-0.5 text-[15px] text-muted-foreground">
                {[subject.jobTitle, assessment].filter(Boolean).join(" · ")}
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
                {employer.context?.organisation_name && (
                  <li className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                    <span className="sr-only">{t("report.trust.meta.employer")}: </span>
                    {employer.context.organisation_name}
                  </li>
                )}
                {released && (
                  <li className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                    <span className="sr-only">{t("report.trust.meta.released")}: </span>
                    {t("report.trust.status.released")} {released}
                  </li>
                )}
                {employer.context?.participant_ref && (
                  <li className="inline-flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-primary/70" aria-hidden="true" />
                    <span className="sr-only">{t("report.trust.meta.participantRef")}: </span>
                    {employer.context.participant_ref}
                  </li>
                )}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="inline-flex h-8 items-center gap-2 rounded-md border border-trust/30 bg-trust/10 px-2.5 text-[12.5px] font-semibold text-foreground">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-trust text-trust-foreground">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                  {reviewed
                    ? t("report.trust.humanReviewed")
                    : t("report.trust.humanReviewPending")}
                </span>
                <span className="text-[13px] italic text-muted-foreground">
                  {t("report.trust.decisionSupport")}
                </span>
              </div>
            </div>
          </div>

          <div className="no-print flex flex-col gap-2 sm:flex-row lg:w-[276px] lg:flex-col">
            {startInterview}
            <button type="button" onClick={() => window.print()} className={SECONDARY}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              {t("report.trust.action.printShort")}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={SECONDARY}>
                  {t("report.trust.action.more")}
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem asChild>
                  <a href="#trust-plan" className="flex cursor-pointer items-center gap-2">
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                    {t("report.trust.action.openPlan")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void share()}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  {copied ? t("report.trust.action.shared") : t("report.trust.action.share")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {nav.applicationId && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/employer/$employerSlug/applications/$applicationId"
                      params={{ employerSlug: nav.employerSlug, applicationId: nav.applicationId }}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      {t("report.trust.action.backToCandidate")}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link
                    to="/employer/$employerSlug/assessments/participants"
                    params={{ employerSlug: nav.employerSlug }}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    {t("report.trust.action.backToList")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <p className="print-only mt-3 text-[12px] text-muted-foreground">
        {pick(employer.context?.standing_limitation, lang)}
      </p>
    </header>
  );
}
