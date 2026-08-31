// Security Passport — WHAT THE CANDIDATE CLAIMS, on the reviewer's screen.
//
// ── THE DEFECT THIS COMPONENT EXISTS TO FIX ────────────────────────────
//
// `sp_verifier_request_detail` has always returned the claim and the period.
// The client mapper dropped both, so the review page rendered a holder name,
// a list of file names and a decision form. A reviewer approved or refused a
// state-regulated credential having seen its TITLE and nothing else: not the
// issuer, not the credential reference, not the jurisdiction, not the claimed
// issue or expiry dates. None of the fields a certificate is actually checked
// against.
//
// A verification decision made without them is not a weak decision. It is a
// decision about a different question — "does this title sound plausible" —
// dressed as an answer to "does this document support this claim".
//
// ── EVERY FIELD HERE IS HOLDER-AUTHORED ────────────────────────────────
//
// That is the whole point. The review is a COMPARISON: what the candidate
// stated, against what the document says. It cannot be made if only one side
// is on screen. So the issuer is labelled "as stated" and never presented as
// a verified fact — the same distinction that, further downstream, kept
// `claimed_issuer_name` out of the "Verified by" line on the Passport Card.
//
// ── IT LIVES IN ITS OWN FILE SO IT CAN BE RENDERED ─────────────────────
//
// The route that used to hold this markup is a TanStack file route and does
// not export its component, so nothing could assert what a reviewer actually
// sees. A field carried faithfully through the mapper and then rendered by
// nothing would pass any source scan and fix nothing. Here it renders, and
// `passport-reviewer-decision-check` asserts the markup.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatWorkLocation } from "@/lib/security-passport/format";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type {
  VerifierClaimFacts,
  VerifierPeriodFacts,
} from "@/lib/security-passport/verification.functions";

/** One labelled fact. Renders NOTHING when there is no value.
 *
 *  An absent field must not print a dash: a reviewer scanning for a
 *  credential reference needs "this claim has none" to look different from
 *  "this claim has one, and it is a dash". Nothing is fabricated, nothing is
 *  padded, and a missing value costs a row rather than gaining a placeholder. */
export function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

export const CLAIM_TYPE_KEY: Readonly<Record<string, PassportCopyKey>> = {
  training: "claims.type.training",
  certification: "claims.type.certification",
  licence: "claims.type.licence",
  specialisation: "claims.type.specialisation",
  education: "claims.type.education",
  professional_membership: "claims.type.professional_membership",
};

export const EMPLOYMENT_TYPE_KEY: Readonly<Record<string, PassportCopyKey>> = {
  full_time: "entry.emp.type.full_time",
  part_time: "entry.emp.type.part_time",
  hourly: "entry.emp.type.hourly",
  temporary: "entry.emp.type.temporary",
};

export const RELEVANCE_KEY: Readonly<Record<string, PassportCopyKey>> = {
  primary: "entry.emp.relevance.primary",
  partial: "entry.emp.relevance.partial",
  none: "entry.emp.relevance.none",
};

/** A stored code rendered through the copy table, or — for a code nobody has
 *  written words for — the code itself. A visible `professional_membership`
 *  is a bug report. A plausible invented label is not, and the reviewer would
 *  never learn the difference. */
export function codeLabel(
  code: string | null,
  map: Readonly<Record<string, PassportCopyKey>>,
  pt: (k: PassportCopyKey) => string,
): string | null {
  if (!code) return null;
  const key = map[code];
  return key ? pt(key) : code;
}

export function ReviewClaimFacts({
  holderName,
  claim,
  headingId,
}: {
  holderName: string;
  claim: VerifierClaimFacts;
  headingId: string;
}) {
  const { pt, lang } = usePassportCopy();
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {pt("vq.claimHeading")}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label={pt("vq.holder")} value={holderName || null} />
        <Fact label={pt("entry.claim.title")} value={claim.title} />
        <Fact label={pt("vq.claimType")} value={codeLabel(claim.claimType, CLAIM_TYPE_KEY, pt)} />
        {/* Candidate-entered, and labelled as such. This is the ISSUER. It
            does not become the verifier here, and it does not become one on
            any surface the candidate can later share. */}
        <Fact label={pt("vq.issuerStated")} value={claim.issuer} />
        <Fact label={pt("vq.credentialCode")} value={claim.credentialCode} />
        <Fact label={pt("vq.credentialReference")} value={claim.credentialReference} />
        {/* Country AND sub-jurisdiction, through the canonical formatter. A
            Dubai licence flattened to "AE" states a UAE-wide validity SIRA
            never granted, and the reviewer is the last person who can catch
            that before it becomes a verified fact. */}
        <Fact
          label={pt("vq.jurisdiction")}
          value={
            claim.jurisdictionCode
              ? formatWorkLocation(claim.jurisdictionCode, claim.subJurisdictionCode, lang)
              : null
          }
        />
        <Fact label={pt("claims.issuedOn")} value={claim.issuedOn} />
        <Fact label={pt("vq.validFrom")} value={claim.validFrom} />
        <Fact label={pt("claims.validUntil")} value={claim.validUntil} />
        {/* An approval shown without its limits reads as a general national
            licence, so the scope is part of what is being judged. */}
        <Fact label={pt("vq.authorisationScope")} value={claim.authorisationScope} />
        <Fact
          label={pt("vq.currentState")}
          value={
            claim.assertion
              ? `${pt(`assertion.${claim.assertion}` as PassportCopyKey)} · ${pt(`lifecycle.${claim.lifecycle}` as PassportCopyKey)}`
              : null
          }
        />
        <Fact
          label={pt("vq.version")}
          value={claim.versionNo === null ? null : `v${claim.versionNo}`}
        />
      </dl>
      {/* The holder's own note is deliberately NOT rendered, and is not in
          the payload to render. Phase 7 documents `holder_note` as the
          holder's private words; unlike the credential reference, it is not
          something a document is checked against. */}
    </section>
  );
}

export function ReviewPeriodFacts({
  holderName,
  period,
  headingId,
}: {
  holderName: string;
  period: VerifierPeriodFacts;
  headingId: string;
}) {
  const { pt, lang } = usePassportCopy();
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {pt("vq.periodHeading")}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label={pt("vq.holder")} value={holderName || null} />
        <Fact label={pt("vq.employer")} value={period.employer} />
        <Fact label={pt("vq.role")} value={period.role} />
        <Fact
          label={pt("vq.period")}
          value={
            period.startedOn
              ? `${period.startedOn} – ${period.endedOn ?? pt("common.present")}`
              : null
          }
        />
        <Fact
          label={pt("vq.employmentType")}
          value={codeLabel(period.employmentType, EMPLOYMENT_TYPE_KEY, pt)}
        />
        <Fact
          label={pt("vq.jurisdiction")}
          value={
            period.jurisdictionCode ? formatWorkLocation(period.jurisdictionCode, null, lang) : null
          }
        />
        {/* Security relevance decides how much of this period counts as time
            in the profession, so it is part of the claim being judged rather
            than background about it. */}
        <Fact
          label={pt("vq.securityRelevance")}
          value={codeLabel(period.securityRelevance, RELEVANCE_KEY, pt)}
        />
        <Fact
          label={pt("vq.currentState")}
          value={
            period.assertion
              ? `${pt(`assertion.${period.assertion}` as PassportCopyKey)} · ${pt(`lifecycle.${period.lifecycle}` as PassportCopyKey)}`
              : null
          }
        />
        <Fact
          label={pt("vq.version")}
          value={period.versionNo === null ? null : `v${period.versionNo}`}
        />
      </dl>
    </section>
  );
}
