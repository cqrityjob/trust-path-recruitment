// TRUST Evidence Report — the identity band.
//
// Who, for which role, released when, commissioned by whom, and the one
// sentence that stays on every report: "Beslutsstöd för fortsatt mänsklig
// bedömning." The dominant action is the structured interview; print, share
// and the way back are secondary. The navy band is the trust anchor on
// screen and a plain bordered card on paper (styles.css).

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronRight, Link2, Printer, UserCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TrustReportDocument } from "@/lib/security-competency/trust-report.types";
import { pick } from "@/lib/security-competency/trust-report.types";
import { formatDate } from "@/lib/security-competency/trust-report.presentation";
import type { TrustReportNav, TrustReportSubject } from "./nav";

const SECONDARY =
  "inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-primary-foreground/30 px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transition-none";

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

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <header data-print-order={1} className="tr-identity">
      <nav aria-label="Breadcrumb" className="no-print mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
          <li>
            <Link
              to="/employer/$employerSlug/assessments/participants"
              params={{ employerSlug: nav.employerSlug }}
              className="inline-flex min-h-[44px] items-center rounded-[6px] px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("report.trust.breadcrumb.assessments")}
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li>
            {nav.applicationId ? (
              <Link
                to="/employer/$employerSlug/applications/$applicationId"
                params={{ employerSlug: nav.employerSlug, applicationId: nav.applicationId }}
                className="inline-flex min-h-[44px] items-center rounded-[6px] px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {subject.candidateName ?? t("report.trust.breadcrumb.candidate")}
              </Link>
            ) : (
              <span className="inline-flex min-h-[44px] items-center px-1">
                {subject.candidateName ?? t("report.trust.breadcrumb.candidate")}
              </span>
            )}
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li
            aria-current="page"
            className="inline-flex min-h-[44px] items-center px-1 font-medium text-foreground"
          >
            {t("report.trust.breadcrumb.report")}
          </li>
        </ol>
      </nav>

      <div className="tr-hero-navy overflow-hidden rounded-[18px] bg-primary text-primary-foreground shadow-[var(--shadow-lg)]">
        <div className="px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-8">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/70">
                {t("report.trust.title")}
              </p>
              <h1
                className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-primary-foreground sm:text-[32px]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {subject.candidateName ?? t("report.trust.meta.candidate")}
              </h1>
              <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed text-primary-foreground/85">
                {[subject.jobTitle, assessment].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-4 text-[14px] font-medium italic text-primary-foreground/90">
                {t("report.trust.decisionSupport")}
              </p>
            </div>
            <div className="flex flex-row flex-wrap items-start gap-2 sm:flex-col sm:items-end">
              <span className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-primary-foreground/30 px-3 text-[12px] font-semibold">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {reviewed ? t("report.trust.humanReviewed") : t("report.trust.humanReviewPending")}
              </span>
              <span className="inline-flex min-h-[28px] items-center rounded-full bg-primary-foreground/10 px-3 text-[12px] font-semibold">
                {t("report.trust.status.released")}
                {released ? ` · ${released}` : ""}
              </span>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-primary-foreground/15 pt-5 text-primary-foreground sm:grid-cols-4">
            <HeroMeta
              label={t("report.trust.meta.employer")}
              value={employer.context?.organisation_name}
            />
            <HeroMeta
              label={t("report.trust.meta.participantRef")}
              value={employer.context?.participant_ref}
            />
            <HeroMeta label={t("report.trust.meta.released")} value={released} />
            <HeroMeta label={t("report.trust.meta.reportId")} value={doc.report_id} mono />
          </dl>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2 border-t border-primary-foreground/15 bg-primary-foreground/5 px-6 py-4 sm:px-8">
          {nav.applicationId ? (
            <Link
              to="/employer/$employerSlug/interview-intelligence/new"
              params={{ employerSlug: nav.employerSlug }}
              search={{ applicationId: nav.applicationId, jobId: nav.jobId ?? undefined }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-semibold text-accent-foreground shadow-[var(--shadow-sm)] hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            >
              {t("report.trust.action.startInterview")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <a
              href="#trust-plan"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-semibold text-accent-foreground shadow-[var(--shadow-sm)] hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            >
              {t("report.trust.action.openPlan")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {nav.applicationId && (
            <a href="#trust-plan" className={SECONDARY}>
              {t("report.trust.action.openPlan")}
            </a>
          )}
          <button type="button" onClick={() => window.print()} className={SECONDARY}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            {t("report.trust.action.print")}
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className={SECONDARY}
            aria-live="polite"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {copied ? t("report.trust.action.shared") : t("report.trust.action.share")}
          </button>
          <span className="flex-1" />
          <Link
            to="/employer/$employerSlug/assessments/participants"
            params={{ employerSlug: nav.employerSlug }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-medium text-primary-foreground/80 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("report.trust.action.backToList")}
          </Link>
        </div>
      </div>

      <p className="print-only mt-3 text-[12px] text-muted-foreground">
        {pick(employer.context?.standing_limitation, lang)}
      </p>
    </header>
  );
}

function HeroMeta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/60">
        {label}
      </dt>
      <dd
        className={`m-0 mt-0.5 truncate text-[13px] ${mono ? "font-mono text-[12px]" : "font-medium"}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
