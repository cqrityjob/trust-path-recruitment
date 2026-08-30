// "Who am I, what do I have, what should I do next" — the top of the
// personal home, and the top of the profile page.
//
// ── WHY THIS IS ONE COMPONENT AND NOT SEVEN CARDS ──────────────────────
//
// The dashboard this replaces opened with seven equally weighted panels.
// Equal weight is a refusal to decide, and it pushed the answer to "where
// do I stand" below the fold behind six things that were not the answer.
//
// So there is a hierarchy, and it is the one the questions come in:
//
//   1. WHO AM I      name, professional identity, experience, country
//   2. WHAT DO I HAVE  one row of states, each a fact, none of them a score
//   3. WHAT NEXT     at most three actions, from the deterministic ladder
//
// ── THE PERCENTAGE IS NOT A JUDGEMENT ──────────────────────────────────
//
// "Profil komplett till 78 %" counts answers. It is not a quality score,
// not an employability score and not a ranking, it is never shown to an
// employer, and the wording says the first thing rather than implying the
// second. `completeness.ts` carries the same warning at the place the
// number is computed, because a number travels further than its caption.
//
// ── SELF-REPORTED AND VERIFIED ARE NEVER MIXED ─────────────────────────
//
// The headline, profession, experience band and country here are all
// SELF-REPORTED, and the panel says so in one line. The verified count
// beside it comes from the Passport and counts only claims an authorised
// verifier decided on — `isVerifiedClaim`, the single definition. A tick
// never appears next to anything on the self-reported side.

import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Clock3, MapPin } from "lucide-react";
import { useT } from "@/i18n/context";
import { computeProfileCompleteness } from "@/lib/professional-identity/completeness";
import { computeCvReadiness } from "@/lib/professional-identity/cv/readiness";
import {
  isPendingClaim,
  isVerifiedClaim,
  type ProfessionalIdentityV1,
} from "@/lib/professional-identity/types";
import { c, L, Lf, type Lang } from "./copy";

const COPY = {
  welcome: c("Välkommen tillbaka, {0}", "Welcome back, {0}"),
  welcomeAnon: c("Välkommen tillbaka", "Welcome back"),
  eyebrow: c("Din yrkesidentitet", "Your professional identity"),
  noHeadline: c("Din yrkestitel är inte ifylld ännu", "Your professional title is not filled in yet"),
  selfReported: c(
    "Uppgifterna här är självrapporterade. Det som är verifierat visas i Säkerhetspasset.",
    "The information here is self-reported. What has been verified is shown in the Security Passport.",
  ),
  completeness: c("Profil komplett till {0} %", "Profile {0} % complete"),
  viewProfile: c("Visa profil", "View profile"),
  viewCard: c("Visa karriärkort", "View Career Card"),
  experienceYears: c("{0} års erfarenhet", "{0} years of experience"),

  statusPassport: c("Säkerhetspass", "Security Passport"),
  statusPassportNone: c("Inte öppnat", "Not opened"),
  statusPassportCounts: c("{0} verifierade", "{0} verified"),
  statusPassportPending: c("{0} väntar", "{0} pending"),

  statusDiscovery: c("Karriärutforskning", "Career Discovery"),
  statusDiscoveryDone: c("Genomförd", "Completed"),
  statusDiscoveryNone: c("Ej genomförd", "Not completed"),

  statusCard: c("Karriärkort", "Career Card"),
  statusCardReady: c("Klart att dela", "Ready to share"),
  statusCardBlocked: c("Kräver karriärutforskning", "Needs Career Discovery"),

  statusCv: c("CV", "CV"),
  statusCvReady: c("Klart att skapa", "Ready to create"),
  statusCvBlocked: c("Behöver mer information", "Needs more information"),
} as const;

/** One state, stated as a fact. Never a score and never a colour on its own —
 *  every state here is carried by words, so nothing depends on seeing hue. */
function StatusCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">{value}</dd>
      {detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function ProfessionalIdentityHeader({
  identity,
  /** The profile page shows the same summary without offering itself as a
   *  destination. */
  showProfileLink = true,
}: {
  identity: ProfessionalIdentityV1;
  showProfileLink?: boolean;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  const completeness = computeProfileCompleteness(identity);
  const cv = computeCvReadiness(identity);

  const verified = identity.claims.filter(isVerifiedClaim).length;
  const pending = identity.claims.filter(isPendingClaim).length;

  const firstName = (identity.displayName ?? "").trim().split(/\s+/)[0] ?? "";
  const profession =
    identity.currentProfessionOther ?? identity.currentProfessionSlug ?? null;
  const country = identity.workCountry ?? identity.accountCountry;

  const cardReady = identity.discovery.hasCompletedReport && identity.discovery.namesCareers;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
      <p className="text-sm text-muted-foreground">
        {firstName ? Lf(COPY.welcome, l, firstName) : L(COPY.welcomeAnon, l)}
      </p>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
        {L(COPY.eyebrow, l)}
      </p>

      <h1
        className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {identity.headline ?? profession ?? L(COPY.noHeadline, l)}
      </h1>

      {/* Experience and country, as separate facts rather than a single
          "10+ years · Sweden" string — one of them is routinely absent, and
          a joined string with a dangling separator is how that reads. */}
      {(identity.yearsOfExperience || country) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {identity.yearsOfExperience && (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {Lf(COPY.experienceYears, l, identity.yearsOfExperience)}
            </span>
          )}
          {country && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {country}
            </span>
          )}
        </p>
      )}

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {L(COPY.selfReported, l)}
      </p>

      {/* ── Completeness ──────────────────────────────────────────────
          A progress bar plus the sentence. The bar alone would be a number
          without a caption, and this number needs its caption. */}
      <div className="mt-6 max-w-md">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-foreground">
            {Lf(COPY.completeness, l, completeness.score)}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={completeness.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={Lf(COPY.completeness, l, completeness.score)}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${completeness.score}%` }}
          />
        </div>
      </div>

      {/* Rendered only when there is something in it. On the profile page
          the profile link is suppressed, and a person with no Career
          Discovery report has no card either -- which left an empty row
          holding open five rems of nothing. */}
      <div
        className={
          showProfileLink || cardReady ? "mt-5 flex flex-wrap gap-2.5" : "hidden"
        }
      >
        {showProfileLink && (
          <Link
            to="/my-career/profile"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-[color:var(--primary-hover)]"
          >
            {L(COPY.viewProfile, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
        {cardReady && (
          <Link
            to="/my-career/career-card"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            {L(COPY.viewCard, l)}
          </Link>
        )}
      </div>

      {/* ── What do I have ───────────────────────────────────────────── */}
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-6 lg:grid-cols-4">
        <StatusCell
          label={L(COPY.statusPassport, l)}
          value={
            identity.hasPassport
              ? Lf(COPY.statusPassportCounts, l, verified)
              : L(COPY.statusPassportNone, l)
          }
          detail={
            identity.hasPassport && pending > 0 ? Lf(COPY.statusPassportPending, l, pending) : null
          }
        />
        <StatusCell
          label={L(COPY.statusDiscovery, l)}
          value={
            identity.discovery.hasCompletedReport
              ? L(COPY.statusDiscoveryDone, l)
              : L(COPY.statusDiscoveryNone, l)
          }
        />
        <StatusCell
          label={L(COPY.statusCard, l)}
          value={cardReady ? L(COPY.statusCardReady, l) : L(COPY.statusCardBlocked, l)}
        />
        <StatusCell
          label={L(COPY.statusCv, l)}
          value={cv.state === "ready" ? L(COPY.statusCvReady, l) : L(COPY.statusCvBlocked, l)}
        />
      </dl>

      {verified > 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck className="h-3.5 w-3.5 text-[color:var(--gold)]" aria-hidden="true" />
          {L(
            c(
              "Verifierat betyder att en behörig granskare har fattat ett beslut — inte att du har fyllt i något.",
              "Verified means an authorised reviewer reached a decision — not that you filled something in.",
            ),
            l,
          )}
        </p>
      )}
    </section>
  );
}
