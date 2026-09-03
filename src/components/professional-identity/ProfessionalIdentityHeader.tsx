// The career hero — "who am I, and what does CQrityjob know about me".
//
// ── WHY THIS IS ONE COMPONENT AND NOT SEVEN CARDS ──────────────────────
//
// The dashboard this replaces opened with seven equally weighted panels.
// Equal weight is a refusal to decide, and it pushed the answer to "where
// do I stand" below the fold behind six things that were not the answer.
//
// So there is a hierarchy, and it is the one the questions come in:
//
//   1. WHO AM I        name, professional identity, experience, location
//   2. WHAT IS PROVEN  a short trust line — verified, direction, profile
//
// ── WHY THE STATUS GRID SHRANK ─────────────────────────────────────────
//
// It used to be four equal cells: Passport, Career Discovery, Career Card,
// CV. Four cells of equal size is the seven-card dashboard again in
// miniature — the eye has to read all four to find out that three of them
// were "not yet". Two of those facts now live where they are actionable
// rather than merely true: the Career Card is a CTA on this hero when it
// exists, and CV readiness is a stage in the career journey. What survives
// here is the three that answer "what has this platform established about
// me": what is verified, whether there is a career direction, and how much
// of the profile is filled in.
//
// ── THE PERCENTAGE IS NOT A JUDGEMENT ──────────────────────────────────
//
// "Profil ifylld till 78 %" counts answers. It is not a quality score, not
// an employability score and not a ranking, it is never shown to an
// employer, and the wording says the first thing rather than implying the
// second. `completeness.ts` carries the same warning at the place the
// number is computed, because a number travels further than its caption.
//
// ── SELF-REPORTED AND VERIFIED ARE NEVER MIXED ─────────────────────────
//
// The headline, profession, experience band and location here are all
// SELF-REPORTED, and the panel says so in one line. The verified count
// beside it comes from the Passport and counts only claims an authorised
// verifier decided on — `isVerifiedClaim`, the single definition. A tick
// never appears next to anything on the self-reported side.
//
// ── ONE h1 PER PAGE ────────────────────────────────────────────────────
//
// This component owns the page's only <h1>, on both surfaces that mount it,
// which is why the title is a variant rather than a fixed string. On
// /my-career the person's professional title IS the page subject. On
// /my-career/profile it is not: that page's subject is the profile, and it
// used to open with this exact hero and therefore looked like /my-career
// with the cards removed. Naming the page is the fix, and it has to happen
// here or the profile page would carry a second h1.

import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, BadgeCheck, Clock3, MapPin, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { computeProfileCompleteness } from "@/lib/professional-identity/completeness";
import {
  isPendingClaim,
  isUnavailable,
  isVerifiedClaim,
  professionLabel,
  type ProfessionalIdentityV1,
} from "@/lib/professional-identity/types";
// The work location is Passport-owned, and so is the only correct way to
// render it. `formatWorkLocation` keeps the emirate: a Dubai holder is not
// "a UAE holder", and this header printed the bare code `AE` for both.
import { formatWorkLocation } from "@/lib/security-passport/format";
import { yearsOfExperienceOptions } from "@/lib/security-career-profile/options";
import { SECTION_DESTINATIONS } from "@/lib/professional-identity/profile-destinations";
import { c, L, Lf, type Lang } from "./copy";
import { GREETING } from "./home-copy";

const COPY = {
  welcome: c("Välkommen tillbaka, {0}", "Welcome back, {0}"),
  welcomeAnon: c("Välkommen tillbaka", "Welcome back"),

  eyebrowHome: c("Min karriär", "My Career"),
  eyebrowProfile: c("Min profil", "My Profile"),
  profileTitle: c("Min profil", "My Profile"),
  profilePurpose: c(
    "Allt du har registrerat om dig själv, avsnitt för avsnitt — och vilken del av CQrityjob som äger varje uppgift.",
    "Everything you have recorded about yourself, section by section — and which part of CQrityjob owns each fact.",
  ),

  noHeadline: c(
    "Din yrkestitel är inte ifylld ännu",
    "Your professional title is not filled in yet",
  ),
  selfReported: c(
    "Uppgifterna här är självrapporterade. Det som är verifierat visas i Security Passport.",
    "The information here is self-reported. What has been verified is shown in the Security Passport.",
  ),
  viewProfile: c("Visa profil", "View profile"),
  viewCard: c("Visa Career Card", "View Career Card"),
  experienceYears: c("{0} års erfarenhet", "{0} years of experience"),

  // ── The trust line ────────────────────────────────────────────────────
  trustVerified: c("Verifierat", "Verified"),
  trustVerifiedCount: c("{0} uppgifter", "{0} credentials"),
  trustVerifiedOne: c("1 uppgift", "1 credential"),
  trustVerifiedNone: c("Inget ännu", "Nothing yet"),
  trustPassportNone: c("Passet är inte öppnat", "Passport not opened"),
  trustPending: c(
    "{0} uppgifter granskas – inget krävs av dig",
    "{0} entries being reviewed – nothing needed from you",
  ),

  trustDiscovery: c("Karriärriktning", "Career direction"),
  trustDiscoveryDone: c("Utforskning genomförd", "Discovery completed"),
  trustDiscoveryNone: c("Ej genomförd", "Not taken"),

  trustProfile: c("Profil", "Profile"),
  trustProfileFilled: c("{0} av {1} delar ifyllda", "{0} of {1} sections filled in"),
  trustProfileComplete: c("Grundprofil komplett", "Basic profile complete"),

  verifiedMeaning: c(
    "Verifierat betyder att en behörig granskare har fattat ett beslut — inte att du har fyllt i något.",
    "Verified means an authorised reviewer reached a decision — not that you filled something in.",
  ),

  // ── When a read did not answer ────────────────────────────────────────
  // "0 verifierade" and "vi kunde inte läsa dina uppgifter" are different
  // sentences about a person's professional standing, and printing the first
  // when the second is true is the failure this copy exists to prevent.
  unreadable: c("Kunde inte läsas", "Could not be read"),
  degradedTitle: c(
    "Delar av din profil kunde inte läsas",
    "Parts of your profile could not be read",
  ),
  degradedBody: c(
    "Siffrorna nedan är inte fullständiga. Ingenting har tagits bort — försök igen om en stund.",
    "The figures below are incomplete. Nothing has been removed — try again in a moment.",
  ),
  retry: c("Försök igen", "Try again"),
} as const;

/** One fact on the trust line, stated in words. Never a score, and never a
 *  colour on its own — every state here is carried by text, so nothing
 *  depends on seeing hue. */
function TrustFact({
  label,
  value,
  detail,
  emphasis,
}: {
  label: string;
  value: string;
  detail?: string | null;
  /** The fact is established rather than absent. Weight only. */
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-sm text-balance",
          emphasis ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {value}
      </dd>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The compact greeting                                                */
/* ------------------------------------------------------------------ */

// ── WHY THERE IS A COMPACT VARIANT ─────────────────────────────────────
//
// The full hero -- a framed panel with the trust grid, the self-reported
// note and the action row -- occupied most of the first screen and pushed
// the one thing the page had decided about below the fold. The personal
// home now opens with two lines and one identity row: who this is, in
// their own words, and a way to the profile. What the platform has
// established about them lives where it is actionable -- the Passport card,
// the priority workspace -- and not in a second grid above them.
//
// Same data, same provenance rule: everything on this row is SELF-REPORTED
// and says so in one short line, and "Grundprofil komplett" is a fact about
// answered sections, never a percentage and never a judgement of quality.

/** "10+ år" becomes "10+ års erfarenhet"; "10+ years" becomes "10+ years of
 *  experience". The catalogue label is the input, never the stored band. */
function experienceSentence(label: string, l: Lang): string {
  if (l === "sv") return label.endsWith(" år") ? `${label}s erfarenhet` : `${label} erfarenhet`;
  return /years?$/.test(label) ? `${label} of experience` : `${label} experience`;
}

function CompactGreeting({
  identity,
  profileComplete,
  onRetry,
}: {
  identity: ProfessionalIdentityV1;
  profileComplete: boolean;
  onRetry?: () => void;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const degraded = identity.unavailable.length > 0;
  const firstName = (identity.displayName ?? "").trim().split(/\s+/)[0] ?? "";
  const profession = professionLabel(identity, l);
  const location = identity.workCountry
    ? formatWorkLocation(identity.workCountry, identity.workSubJurisdiction, l)
    : identity.accountCountry
      ? formatWorkLocation(identity.accountCountry, null, l)
      : null;
  // The experience BAND is a stored enum; it reaches the screen only through
  // the catalogue the editor offers, never as the raw value.
  const years = identity.yearsOfExperience
    ? (yearsOfExperienceOptions.find((o) => o.id === identity.yearsOfExperience)?.label[l] ?? null)
    : null;
  const title = identity.headline ?? profession ?? L(GREETING.noTitle, l);
  const row = [title, location, years ? experienceSentence(years, l) : null].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <header data-identity-variant="compact">
      <h1
        className="text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {firstName ? Lf(GREETING.welcome, l, firstName) : L(GREETING.welcomeAnon, l)}
      </h1>
      <p className="mt-1.5 text-base text-muted-foreground">{L(GREETING.lede, l)}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-medium text-foreground" data-identity-row>
          {row.join(" · ")}
        </p>
        {profileComplete && (
          <p className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-accent">
            <BadgeCheck className="h-3 w-3" aria-hidden="true" />
            {L(GREETING.basicsComplete, l)}
          </p>
        )}
      </div>

      {degraded ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {L(GREETING.degraded, l)}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {L(GREETING.retry, l)}
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link
          to="/my-career/profile"
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {L(GREETING.viewProfile, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <Link
          to={SECTION_DESTINATIONS.profession.href}
          className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {L(GREETING.editProfile, l)}
        </Link>
        <span className="text-xs text-muted-foreground">{L(GREETING.selfReported, l)}</span>
      </div>
    </header>
  );
}

export function ProfessionalIdentityHeader({
  identity,
  /** Which page this hero is opening. `profile` names the page in the <h1>,
   *  because the profile route used to open with the dashboard's own hero and
   *  was therefore indistinguishable from it above the fold. `compact` is the
   *  personal home's greeting: two lines and an identity row, no panel. */
  variant = "home",
  /** The profile page shows the same summary without offering itself as a
   *  destination. */
  showProfileLink = true,
  /** Re-run the identity read. Given one, the degraded notice offers it; the
   *  requirement is that a person who was told something failed can act on
   *  it without reloading the page. */
  onRetry,
  /** Compact only: every basic section is answered. Said in words, never
   *  as a percentage. */
  profileComplete = false,
}: {
  identity: ProfessionalIdentityV1;
  variant?: "home" | "profile" | "compact";
  showProfileLink?: boolean;
  onRetry?: () => void;
  profileComplete?: boolean;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  if (variant === "compact") {
    return (
      <CompactGreeting identity={identity} profileComplete={profileComplete} onRetry={onRetry} />
    );
  }

  // Which facts this render is entitled to state. See IdentityFactGroup.
  const passportKnown = !isUnavailable(identity, "passport") && !isUnavailable(identity, "claims");
  const discoveryKnown = !isUnavailable(identity, "discovery");
  const degraded = identity.unavailable.length > 0;

  const completeness = computeProfileCompleteness(identity);

  const verified = identity.claims.filter(isVerifiedClaim).length;
  const pending = identity.claims.filter(isPendingClaim).length;

  const firstName = (identity.displayName ?? "").trim().split(/\s+/)[0] ?? "";
  // Resolved through the canonical catalogue, never the stored slug. See
  // `professionLabel` — a slug is an identifier, not a person's job title.
  const profession = professionLabel(identity, l);
  // The Passport's stated work location wins over the account country, and
  // carries its sub-jurisdiction so an emirate is not flattened to a country.
  const location = identity.workCountry
    ? formatWorkLocation(identity.workCountry, identity.workSubJurisdiction, l)
    : identity.accountCountry
      ? formatWorkLocation(identity.accountCountry, null, l)
      : null;

  const cardReady =
    discoveryKnown && identity.discovery.hasCompletedReport && identity.discovery.namesCareers;

  const isProfile = variant === "profile";
  // The professional title. On /my-career it is the <h1>; on the profile page
  // the page's own name is, and this becomes the line beneath it.
  const professionalTitle = identity.headline ?? profession ?? L(COPY.noHeadline, l);

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
      {!isProfile && (
        <p className="text-sm text-muted-foreground">
          {firstName ? Lf(COPY.welcome, l, firstName) : L(COPY.welcomeAnon, l)}
        </p>
      )}

      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.16em] text-accent",
          isProfile ? "" : "mt-6",
        )}
      >
        {L(isProfile ? COPY.eyebrowProfile : COPY.eyebrowHome, l)}
      </p>

      <h1
        className="mt-1.5 text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {isProfile ? L(COPY.profileTitle, l) : professionalTitle}
      </h1>

      {isProfile && (
        <>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {L(COPY.profilePurpose, l)}
          </p>
          <p className="mt-4 text-base font-medium text-balance text-foreground">
            {professionalTitle}
          </p>
        </>
      )}

      {/* Experience and location, as separate facts rather than a single
          "10+ years · Sweden" string — one of them is routinely absent, and
          a joined string with a dangling separator is how that reads. */}
      {(identity.yearsOfExperience || location) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {identity.yearsOfExperience && (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {Lf(COPY.experienceYears, l, identity.yearsOfExperience)}
            </span>
          )}
          {location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {location}
            </span>
          )}
        </p>
      )}

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        {L(COPY.selfReported, l)}
      </p>

      {/* ── What this platform has established ───────────────────────────
          Three facts, not four cells. Withheld outright when a read failed:
          the score is computed over nine sections, an unreadable one scores
          as missing, and "Profil ifylld till 34 %" is a claim about how much
          of themselves this person has filled in — not something to derive
          from a request that did not answer. */}
      {degraded ? (
        <div
          role="alert"
          className="mt-6 max-w-2xl rounded-lg border border-border bg-secondary/50 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {L(COPY.degradedTitle, l)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{L(COPY.degradedBody, l)}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {L(COPY.retry, l)}
            </button>
          )}
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 border-t border-border pt-6 sm:grid-cols-3">
        <TrustFact
          label={L(COPY.trustVerified, l)}
          value={
            !passportKnown
              ? L(COPY.unreadable, l)
              : !identity.hasPassport
                ? L(COPY.trustPassportNone, l)
                : verified === 0
                  ? L(COPY.trustVerifiedNone, l)
                  : verified === 1
                    ? L(COPY.trustVerifiedOne, l)
                    : Lf(COPY.trustVerifiedCount, l, verified)
          }
          detail={
            passportKnown && identity.hasPassport && pending > 0
              ? Lf(COPY.trustPending, l, pending)
              : null
          }
          emphasis={passportKnown && verified > 0}
        />
        <TrustFact
          label={L(COPY.trustDiscovery, l)}
          value={
            !discoveryKnown
              ? L(COPY.unreadable, l)
              : identity.discovery.hasCompletedReport
                ? L(COPY.trustDiscoveryDone, l)
                : L(COPY.trustDiscoveryNone, l)
          }
          emphasis={discoveryKnown && identity.discovery.hasCompletedReport}
        />
        <TrustFact
          label={L(COPY.trustProfile, l)}
          value={
            degraded
              ? L(COPY.unreadable, l)
              : completeness.missingSections.length === 0
                ? L(COPY.trustProfileComplete, l)
                : Lf(COPY.trustProfileFilled, l, completeness.completedSections.length).replace(
                    "{1}",
                    String(completeness.applicableSections.length),
                  )
          }
          emphasis={!degraded && completeness.score > 0}
        />
      </dl>

      {passportKnown && verified > 0 && (
        <p className="mt-4 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--gold)]"
            aria-hidden="true"
          />
          {L(COPY.verifiedMeaning, l)}
        </p>
      )}

      {/* Rendered only when there is something in it. On the profile page
          the profile link is suppressed, and a person with no Career
          Discovery report has no card either -- which left an empty row
          holding open five rems of nothing. */}
      <div className={showProfileLink || cardReady ? "mt-6 flex flex-wrap gap-2.5" : "hidden"}>
        {showProfileLink && (
          <Link
            to="/my-career/profile"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {L(COPY.viewProfile, l)}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
        {cardReady && (
          <Link
            to="/my-career/career-card"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {L(COPY.viewCard, l)}
          </Link>
        )}
      </div>
    </section>
  );
}
