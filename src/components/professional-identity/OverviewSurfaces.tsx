// Profile and CV, on the career home — two of the three candidate surfaces.
//
// ── THREE SURFACES, THREE QUESTIONS, THREE WAYS IN ─────────────────────
//
//   Profile            who am I now?            → Edit Profile
//   CV                 what have I done?        → Edit CV
//   Security Passport  what can I document      → Open Security Passport
//                      and selectively share?     (the column beside these)
//
// The overview used to state a person's identity as one line under the
// greeting with a text link beside it, and the CV as one of four equal
// status tiles next to "Applications" and "Sharing". Neither said what
// belonged where, and a new candidate had no way to tell whether a job
// they had held went in "my details", in the CV tile or in the Passport.
//
// These two cards are summaries with ONE action each. Nothing is edited
// here: the overview navigates, and the page that owns a fact edits it.
//
// ── A MISSING FACT IS AN INVITATION, NOT A STATUS ──────────────────────
//
// "Professional title not filled in" beside nothing a person can press is
// dead text. A missing fact here is a link to the field that fills it,
// resolved from `profile-destinations.ts` — the one contract that says
// where each section is edited — so the card and the recommendation can
// never send the same person to two different places.
//
// ── EACH CARD OWNS ITS OWN STATE ───────────────────────────────────────
//
// The Profile card follows the identity read; the CV card follows the
// identity read for its content and the saved-CV read for its documents,
// and either half can fail without costing the other.

import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, FileText, Plus, UserRound } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  homeRoleTitle,
  type CvModel,
  type HomeProfile,
} from "@/lib/professional-identity/home-presentation";
import { sectionLinkTarget } from "@/lib/professional-identity/profile-destinations";
import type { CompletenessSection } from "@/lib/professional-identity/completeness";
import {
  EDUCATION_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  SKILL_CLAIM_TYPES,
  claimsOfType,
  type ProfessionalIdentityV1,
} from "@/lib/professional-identity/types";
import { formatWorkLocation } from "@/lib/security-passport/format";
import { L, Lf, Lp, type Copy, type Lang } from "./copy";
import { HUB_TILE, SURFACES } from "./home-copy";
import { Failed } from "./home-primitives";
import { formatDate } from "./home-format";

/** The one action a surface card carries. A real button-shaped link, at
 *  least 44px tall, so it reads as the way in and not as a footnote. */
const ACTION =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-[color:var(--accent)]/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Shell({
  surface,
  icon,
  title,
  children,
}: {
  surface: "profile" | "cv";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`overview-${surface}-heading`}
      data-overview-surface={surface}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 shadow-xs md:p-6"
    >
      <h2
        id={`overview-${surface}-heading`}
        className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <span className="text-accent" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="mt-4" data-loading>
      <p className="sr-only">{label}</p>
      <div className="h-5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    </div>
  );
}

/** A missing fact, as the link that fills it. */
function Add({ section, children }: { section: CompletenessSection; children: React.ReactNode }) {
  const target = sectionLinkTarget(section);
  return (
    <Link
      to={target.to}
      search={target.search}
      hash={target.hash}
      data-overview-add={section}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export function OverviewProfileCard({
  profile,
  displayName,
  onRetry,
}: {
  profile: HomeProfile;
  /** The name as the Profile stores it. The greeting uses a first name;
   *  this card states the person. */
  displayName: string | null;
  onRetry?: () => void;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  const title = profile.state === "ready" ? homeRoleTitle(profile, l) : null;

  return (
    <Shell
      surface="profile"
      icon={<UserRound className="h-5 w-5" />}
      title={L(SURFACES.profile.title, l)}
    >
      {profile.state === "loading" ? (
        <Skeleton label={L(SURFACES.loading, l)} />
      ) : profile.state === "unavailable" ? (
        <Failed message={L(SURFACES.profile.unavailable, l)} onRetry={onRetry} className="mt-3" />
      ) : (
        <div className="mt-4 min-w-0" data-identity-row>
          {displayName ? (
            <p className="break-words text-base font-semibold text-foreground">{displayName}</p>
          ) : (
            <Add section="identity">{L(SURFACES.profile.addName, l)}</Add>
          )}
          {title ? (
            <p className="mt-0.5 break-words text-sm text-foreground">{title}</p>
          ) : (
            <p>
              <Add section="identity">{L(SURFACES.profile.addTitle, l)}</Add>
            </p>
          )}
          {profile.workCountry ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatWorkLocation(profile.workCountry, profile.workSubJurisdiction, l)}
            </p>
          ) : (
            <p>
              <Add section="location">{L(SURFACES.profile.addCountry, l)}</Add>
            </p>
          )}
          {profile.complete && (
            <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" />
              {L(SURFACES.profile.complete, l)}
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {L(SURFACES.profile.selfReported, l)}
          </p>
        </div>
      )}

      {/* ── ONE BUTTON, ONE CANONICAL PLACE ─────────────────────────────
          The page itself, never a query that opens a quick-edit dialog: the
          Profile page offers every Profile field, and a dialog holding three
          of them is how a person ends up closing it to look for the fourth.
          Offered in every state, including a failed read -- being unable to
          summarise a profile is not a reason to withhold the way to it. */}
      <div className="mt-auto pt-5">
        <Link to="/my-career/profile" data-edit-details className={ACTION}>
          {L(SURFACES.profile.edit, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* CV                                                                  */
/* ------------------------------------------------------------------ */

/** The most recent employment: the ongoing one, else the latest to start.
 *  ISO dates sort as strings. */
function latestRole(identity: ProfessionalIdentityV1) {
  const periods = [...identity.employment].sort((a, b) => b.startedOn.localeCompare(a.startedOn));
  return periods.find((p) => p.endedOn === null) ?? periods[0] ?? null;
}

export function OverviewCvCard({
  identity,
  identityState,
  cv,
  onRetryCv,
}: {
  /** The CV's CONTENT is read from the identity seam -- the same rows the
   *  CV page edits. Null while loading or when the read failed. */
  identity: ProfessionalIdentityV1 | null;
  identityState: "loading" | "ready" | "unavailable";
  /** The saved CV DOCUMENTS. */
  cv: CvModel;
  onRetryCv: () => void;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  const counts: readonly (readonly [number, Parameters<typeof Lp>[0]])[] = identity
    ? [
        [identity.employment.length, SURFACES.cv.employment],
        [claimsOfType(identity.claims, EDUCATION_CLAIM_TYPES).length, SURFACES.cv.education],
        [claimsOfType(identity.claims, LANGUAGE_CLAIM_TYPES).length, SURFACES.cv.languages],
        [claimsOfType(identity.claims, SKILL_CLAIM_TYPES).length, SURFACES.cv.skills],
      ]
    : [];
  const stated = counts.filter(([n]) => n > 0).map(([n, copy]) => Lp(copy, l, n));
  const role = identity ? latestRole(identity) : null;

  return (
    <Shell surface="cv" icon={<FileText className="h-5 w-5" />} title={L(SURFACES.cv.title, l)}>
      {identityState === "loading" ? (
        <Skeleton label={L(SURFACES.loading, l)} />
      ) : identityState === "unavailable" || !identity ? (
        <p className="mt-4 text-sm text-muted-foreground">{L(SURFACES.cv.contentUnavailable, l)}</p>
      ) : stated.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">{L(SURFACES.cv.empty, l)}</p>
          <Add section="employment">{L(SURFACES.cv.addEmployment, l)}</Add>
        </div>
      ) : (
        <div className="mt-4 min-w-0" data-cv-content-summary>
          {role && (
            <p className="break-words text-base font-semibold text-foreground">
              {role.roleTitle}
              <span className="font-normal text-muted-foreground"> · {role.employerName}</span>
            </p>
          )}
          <p className="mt-0.5 text-sm text-foreground">{stated.join(" · ")}</p>
          {identity.employment.length === 0 && (
            <Add section="employment">{L(SURFACES.cv.addEmployment, l)}</Add>
          )}
        </div>
      )}

      {/* The documents, on their own read. A failed list costs this line and
          nothing else on the card. */}
      {cv.state === "unavailable" ? (
        <Failed message={L(HUB_TILE.unavailable, l)} onRetry={onRetryCv} className="mt-3" />
      ) : cv.state === "loading" ? null : (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground" data-cv-documents-line>
          {cv.state === "none" ? (
            L(SURFACES.cv.noDocuments, l)
          ) : (
            <>
              {Lp(SURFACES.cv.saved, l, cv.count)}
              {cv.latest && formatDate(cv.latest.updatedAt, l)
                ? ` · ${Lf(SURFACES.cv.latest as Copy, l, formatDate(cv.latest.updatedAt, l)!)}`
                : ""}
            </>
          )}
        </p>
      )}

      <div className="mt-auto pt-5">
        <Link to="/my-career/cv" data-edit-cv className={ACTION}>
          {L(SURFACES.cv.edit, l)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Shell>
  );
}
