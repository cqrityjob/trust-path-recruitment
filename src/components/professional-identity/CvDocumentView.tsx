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

import { BadgeCheck } from "lucide-react";
import type { CvDocument } from "@/lib/professional-identity/cv/document";
import type { CvFactClaim } from "@/lib/professional-identity/cv/source-bundle";
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

function ClaimList({ claims, lang }: { claims: readonly CvFactClaim[]; lang: Lang }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {claims.map((claim) => (
        <li key={claim.id} className="text-sm text-foreground">
          <span className="font-medium">{claim.title}</span>
          {claim.issuerName ? (
            <span className="text-muted-foreground"> · {claim.issuerName}</span>
          ) : null}
          {claim.issuedOn ? (
            <span className="text-muted-foreground"> · {claim.issuedOn.slice(0, 4)}</span>
          ) : null}
          {claim.level ? <span className="text-muted-foreground"> · {claim.level}</span> : null}
          {claim.verified && (
            <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-xs font-semibold text-[color:var(--gold)]">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {L(COPY.verified, lang)}
            </span>
          )}
        </li>
      ))}
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
          <ClaimList claims={doc.education} lang={l} />
        </>
      )}

      {doc.credentials.length > 0 && (
        <>
          <SectionHeading>{L(COPY.credentials, l)}</SectionHeading>
          <ClaimList claims={doc.credentials} lang={l} />
        </>
      )}

      {doc.skills.length > 0 && (
        <>
          <SectionHeading>{L(COPY.skills, l)}</SectionHeading>
          <ClaimList claims={doc.skills} lang={l} />
        </>
      )}

      {doc.languages.length > 0 && (
        <>
          <SectionHeading>{L(COPY.languages, l)}</SectionHeading>
          <ClaimList claims={doc.languages} lang={l} />
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
