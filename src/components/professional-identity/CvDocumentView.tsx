// The CV, rendered.
//
// ── EVERY FACT ON THIS PAGE COMES FROM `CvDocument` ─────────────────────
//
// Employer names, role titles, dates, credential titles, issuers and the
// verification mark are read straight off the document's facts, which were
// carried there from the source bundle. A language model contributed the
// headline, the summary and the bullet lines and nothing else — and each of
// those is marked, so the person reviewing the draft can see which words
// are theirs and which were drafted for them.
//
// ── A RESTRAINED LAYOUT, ON PURPOSE ────────────────────────────────────
//
// Security recruitment reads CVs, it does not admire them. One column,
// generous leading, no colour blocks, no rating bars, no photograph frame,
// nothing that would survive a print to A4 badly. The print rules the
// report template already established (@page A4, .no-print) apply here
// unchanged, so "export" is the browser's own print-to-PDF rather than a
// dependency.
//
// ── THE VERIFICATION MARK ──────────────────────────────────────────────
//
// Drawn from `CvFactClaim.verified`, which is `isVerifiedClaim` — an
// authorised verifier's decision. It is never inferred from the claim being
// present, from evidence being attached, or from anything the model wrote.
//
// ── AND WHO MADE IT ────────────────────────────────────────────────────
//
// The mark says THAT somebody verified; `doc.trust` says WHO and HOW, from
// the Passport decision record, on a channel the model never saw. The two
// are drawn from different objects on purpose — see `trust-annotations.ts`.
//
// Three rules govern every trust line below:
//
//   1. ISSUER IS NOT VERIFIER. `claim.issuerName` is candidate-entered text
//      and is printed as the issuer, in the issuer's own position, and is
//      never permitted anywhere near the attribution line. A candidate who
//      types "Verified by Swedish Police" into the issuer field gets those
//      words rendered where an issuer goes, attached to a claim carrying no
//      verification mark at all.
//
//   2. NOTHING IS PRINTED FOR AN UNREADABLE STATE. `trust.unavailable` omits
//      the decoration entirely rather than printing a negative. A plainer CV
//      is a survivable failure; a CV that tells an employer this person has
//      nothing verified, because a query failed, is not.
//
//   3. IT SURVIVES PRINTING. None of this is `no-print`. Export is
//      `window.print()` over this very component, so a trust line the person
//      can see on screen is in the PDF they send, and the words carry the
//      meaning without the icons.

import { BadgeCheck, ShieldCheck } from "lucide-react";
import type { CvDocument } from "@/lib/professional-identity/cv/document";
import type { CvFactClaim } from "@/lib/professional-identity/cv/source-bundle";
import type { CvTrustAnnotations } from "@/lib/professional-identity/cv/trust-annotations";
import {
  employmentTrustLine,
  trustLabel,
  type TrustPresentation,
} from "@/lib/security-passport/trust-presentation";
import { c, L, type Lang } from "./copy";

const COPY = {
  experience: c("Erfarenhet", "Experience"),
  education: c("Utbildning", "Education"),
  credentials: c("Intyg och behörigheter", "Credentials and authorisations"),
  skills: c("Färdigheter", "Skills"),
  languages: c("Språk", "Languages"),
  summary: c("Sammanfattning", "Summary"),
  present: c("nu", "present"),
  aiDrafted: c("Utkast skrivet av AI — granska innan du använder det", "Drafted by AI — review before you use it"),
  verified: c("Verifierad", "Verified"),
  /** Screen-reader prefix so the line is never an icon plus a bare company
   *  name. §34: the meaning must not depend on seeing the symbol. */
  trustSr: c("Verifieringsuppgift:", "Verification detail:"),
  insightNote: c(
    "Career Discovery beskriver riktning och preferenser. Det är inte en kompetens och inte en kvalifikation.",
    "Career Discovery describes direction and preferences. It is not a competency and not a qualification.",
  ),
} as const;

function period(startedOn: string, endedOn: string | null, lang: Lang): string {
  const from = startedOn.slice(0, 7);
  const to = endedOn ? endedOn.slice(0, 7) : L(COPY.present, lang);
  return `${from} – ${to}`;
}

/**
 * One attribution line — "Document reviewed by CQrityjob".
 *
 * Renders nothing at all when there is nothing true to say, which is the
 * common case: most facts on most CVs are self-reported, and a CV covered in
 * "not verified" labels would be both uglier and less informative than one
 * that simply stays quiet about what nobody has checked.
 *
 * Restrained on purpose (§11). Muted foreground, small, one outline icon —
 * a professional document, not a certificate. The colour is decoration:
 * remove it and the sentence still says who did what.
 */
function TrustLine({ text, lang }: { text: string | null; lang: Lang }) {
  if (!text) return null;
  return (
    // `items-start` + `min-w-0` + `break-words`: an organisation name is
    // arbitrary text from a decision record, and a long one with no spaces
    // would otherwise push the row past the page edge at 375px -- a flex
    // child defaults to min-width:auto and refuses to shrink below its
    // content. The icon keeps `shrink-0` so it is the TEXT that wraps, and
    // `mt-px` keeps it optically aligned with the first line once it does.
    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck
        className="mt-px h-3.5 w-3.5 shrink-0 text-[color:var(--gold)]"
        aria-hidden="true"
      />
      <span className="sr-only">{L(COPY.trustSr, lang)} </span>
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

function ClaimList({
  claims,
  lang,
  trust,
}: {
  claims: readonly CvFactClaim[];
  lang: Lang;
  trust: CvTrustAnnotations;
}) {
  return (
    <ul className="mt-2 space-y-1.5">
      {claims.map((claim) => {
        const t: TrustPresentation | undefined = trust.claims[claim.id];
        // ── THE MARK IS LIVE, THE FACT IS FROZEN ────────────────────────
        //
        // This was `claim.verified` — a boolean frozen into
        // `cv_documents.source_bundle` at save time. A saved CV therefore
        // kept printing "Verified" after the credential behind it had been
        // revoked: the live attribution line below correctly vanished, and
        // the chip above it did not, leaving a verification mark with
        // nothing willing to say who made it.
        //
        // A saved CV may freeze career CONTENT — the title, the issuer, the
        // dates the person reviewed and accepted. It must never freeze TRUST,
        // which is not a property of the document but the Passport's current
        // answer about the claim underneath it. So the chip now reads the
        // same live annotations the attribution does, and the two can no
        // longer disagree with each other on one line.
        //
        // `trust.unavailable` still suppresses BOTH rather than printing a
        // negative we did not establish (PR 4's rule); `claim.verified`
        // remains on the fact for the persisted bundle's schema and is no
        // longer consulted for anything the reader sees.
        const currentlyVerified = !trust.unavailable && t?.status === "verified";
        return (
          <li key={claim.id} className="text-sm text-foreground">
            <span className="font-medium">{claim.title}</span>
            {/* The ISSUER, in the issuer's position. Candidate-entered, and
                never reused as an attribution — see rule 1 in the header. */}
            {claim.issuerName ? (
              <span className="text-muted-foreground"> · {claim.issuerName}</span>
            ) : null}
            {claim.issuedOn ? (
              <span className="text-muted-foreground"> · {claim.issuedOn.slice(0, 4)}</span>
            ) : null}
            {claim.level ? <span className="text-muted-foreground"> · {claim.level}</span> : null}
            {currentlyVerified && (
              <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-xs font-semibold text-[color:var(--gold)]">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {L(COPY.verified, lang)}
              </span>
            )}
            {/* The VERIFIER, on its own line and in the verifier's words. */}
            {!trust.unavailable && t ? <TrustLine text={trustLabel(t, lang)} lang={lang} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-7 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </h3>
  );
}

export function CvDocumentView({ document: doc }: { document: CvDocument }) {
  const l = doc.locale as Lang;

  return (
    <article className="rounded-xl border border-border bg-card p-6 text-foreground shadow-sm md:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {doc.displayName}
        </h2>
        {doc.headline && (
          <p className="mt-1 text-base text-muted-foreground">
            {doc.headline}
            {doc.headlineIsAiWritten && (
              <span className="no-print ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider text-accent">
                AI
              </span>
            )}
          </p>
        )}
        {doc.country && <p className="mt-1 text-sm text-muted-foreground">{doc.country}</p>}
      </header>

      {doc.summary && (
        <>
          <SectionHeading>{L(COPY.summary, l)}</SectionHeading>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{doc.summary}</p>
          {doc.summaryIsAiWritten && (
            <p className="no-print mt-1.5 text-xs italic text-muted-foreground">
              {L(COPY.aiDrafted, l)}
            </p>
          )}
        </>
      )}

      {doc.experience.length > 0 && (
        <>
          <SectionHeading>{L(COPY.experience, l)}</SectionHeading>
          <ol className="mt-2 space-y-4">
            {doc.experience.map((entry) => (
              <li key={entry.fact.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="text-sm font-semibold">{entry.fact.roleTitle}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {period(entry.fact.startedOn, entry.fact.endedOn, l)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{entry.fact.employerName}</p>
                {/* Employment attribution. Comes from the decision record via
                    `doc.trust`, NOT from `employerName` and NOT from the
                    assertion level alone: an employment verified by document
                    review says so, and does not claim the employer confirmed
                    it. `employmentTrustLine` returns null for everything not
                    currently verified, so a self-reported period gets no line
                    rather than a negative one. */}
                {!doc.trust.unavailable && doc.trust.employment[entry.fact.id] ? (
                  <TrustLine
                    text={employmentTrustLine(doc.trust.employment[entry.fact.id], l)}
                    lang={l}
                  />
                ) : null}
                {entry.bullets.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                    {entry.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {doc.education.length > 0 && (
        <>
          <SectionHeading>{L(COPY.education, l)}</SectionHeading>
          <ClaimList claims={doc.education} lang={l} trust={doc.trust} />
        </>
      )}

      {doc.credentials.length > 0 && (
        <>
          <SectionHeading>{L(COPY.credentials, l)}</SectionHeading>
          <ClaimList claims={doc.credentials} lang={l} trust={doc.trust} />
        </>
      )}

      {doc.skills.length > 0 && (
        <>
          <SectionHeading>{L(COPY.skills, l)}</SectionHeading>
          <ClaimList claims={doc.skills} lang={l} trust={doc.trust} />
        </>
      )}

      {doc.languages.length > 0 && (
        <>
          <SectionHeading>{L(COPY.languages, l)}</SectionHeading>
          <ClaimList claims={doc.languages} lang={l} trust={doc.trust} />
        </>
      )}

      {/* Career Discovery, when the person chose to include it, is LABELLED.
          Printing an assessment insight among skills would turn a preference
          into a qualification, which the trust contract forbids in as many
          words. */}
      {doc.careerInsightSnapshotId && (
        <p className="mt-7 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          {L(COPY.insightNote, l)}
        </p>
      )}
    </article>
  );
}
