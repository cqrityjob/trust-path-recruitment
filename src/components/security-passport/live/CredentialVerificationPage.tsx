// Security Passport — one credential, as the recipient sees it.
//
// ── WHY THIS IS NOT THE PASSPORT PAGE WITH ONE ROW ─────────────────────
//
// A holder sharing a single credential is doing something different from
// sharing their Passport: they are presenting one qualification and asking
// somebody to check it. The recipient should meet the credential, large and
// legible, with the four things that make it checkable — who issued it, who
// verified it, how, and until when — and nothing else competing for
// attention.
//
// It renders from the same `RecipientPresentation` as the Passport page, so
// the two can never disagree about whether the credential is current.
//
// ── WHAT IT NEVER SHOWS ────────────────────────────────────────────────
//
// No evidence, no private certificate number, no contact details, no other
// claims, no employment history, no reviewer notes. The server already
// refuses to send them; this component has no field for them either.

import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatExpiry } from "@/lib/security-passport/format";
import { presentationWordKey } from "@/lib/security-passport/design/credential-symbols";
import type { RecipientCredential } from "@/lib/security-passport/recipient-presentation";
import { BrandMark, EngravedField, EngravedRule } from "../card/CardPrimitives";
import { CredentialSymbol } from "../CredentialSymbol";

const METHOD_KEY: Readonly<
  Record<
    string,
    | "ver.method.document_review"
    | "ver.method.employer_confirmation"
    | "ver.method.issuer_confirmation"
  >
> = {
  document_review: "ver.method.document_review",
  employer_confirmation: "ver.method.employer_confirmation",
  issuer_confirmation: "ver.method.issuer_confirmation",
};

export function CredentialVerificationPage({
  credential,
  holderLabel,
  jurisdiction,
  verifyUrl,
}: {
  credential: RecipientCredential;
  holderLabel: string;
  jurisdiction: string;
  verifyUrl: string;
}) {
  const { pt, lang } = usePassportCopy();
  const isCurrent = credential.lifecycle === "active";

  return (
    <div className="space-y-5">
      {/* ── The credential itself, large ──────────────────────────────── */}
      <article
        className="relative isolate overflow-hidden rounded-2xl"
        style={{
          background: `linear-gradient(165deg, ${TRUST_PALETTE.navyRaised} 0%, ${TRUST_PALETTE.navy} 38%, ${TRUST_PALETTE.navyDeep} 100%)`,
          border: `1px solid ${TRUST_PALETTE.gold}88`,
          boxShadow: `0 20px 56px -26px rgba(0,0,0,0.8)`,
        }}
      >
        <EngravedField intensity={0.95} tone={TRUST_PALETTE.goldBright} />

        <div className="relative flex flex-col items-center p-6 text-center sm:p-8">
          <BrandMark tone={TRUST_PALETTE.ink} />

          <div className="mt-6">
            <CredentialSymbol
              code={credential.code}
              state={credential.presentation}
              name={credential.title}
              size={96}
              decorative
            />
          </div>

          <h1
            className="mt-5 text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl"
            style={{ color: TRUST_PALETTE.ink, fontFamily: "var(--font-display)" }}
          >
            {credential.title}
          </h1>

          {credential.issuer ? (
            <p className="mt-2 text-sm" style={{ color: TRUST_PALETTE.inkMuted }}>
              {credential.issuer}
            </p>
          ) : null}

          {/* Trust state in word, shape and glyph — never colour alone. */}
          <p
            className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{
              color: isCurrent ? TRUST_PALETTE.goldBright : TRUST_PALETTE.amber,
              border: `1px ${isCurrent ? "solid" : "dashed"} ${isCurrent ? TRUST_PALETTE.gold : TRUST_PALETTE.amber}`,
            }}
          >
            {isCurrent
              ? pt(presentationWordKey(credential.presentation))
              : `${pt(`lifecycle.${credential.lifecycle}` as const)} · ${pt("assertion.verified.historical")}`}
          </p>

          <p className="mt-4 text-sm" style={{ color: TRUST_PALETTE.inkMuted }}>
            {holderLabel}
            <span aria-hidden="true"> · </span>
            <span style={{ color: TRUST_PALETTE.ink }}>{jurisdiction}</span>
          </p>

          <div className="mt-6 w-full">
            <EngravedRule tone={`${TRUST_PALETTE.gold}66`} />
          </div>

          <p
            className="mt-3 break-all text-[10px] leading-snug"
            style={{ color: TRUST_PALETTE.inkFaint }}
          >
            {verifyUrl}
          </p>
        </div>
      </article>

      {/* ── The four things that make it checkable ────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {pt("cw.detailsTitle")}
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("rec.issuer")}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {credential.issuer ?? pt("common.notStated")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("rec.verifiedBy")}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {credential.verifierOrganisation ?? pt("common.notStated")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("rec.method")}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {/* A method this build has no words for prints its own stored
                  code. The fallback used to be "ver.method.document_review",
                  which told the reader CQrityjob had examined a document
                  whenever the recorded method was merely unrecognised -- an
                  invented provenance claim on the surface a stranger trusts
                  precisely because they cannot check behind it. Registry and
                  authority verification arrive as new methods, so an unknown
                  value here is expected, not exceptional. */}
              {credential.verificationMethod
                ? (() => {
                    const key = METHOD_KEY[credential.verificationMethod];
                    return key ? pt(key) : credential.verificationMethod;
                  })()
                : pt("common.notStated")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("rec.verifiedAt")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">
              {credential.verifiedAt ? credential.verifiedAt.slice(0, 10) : pt("common.notStated")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("rec.validUntil")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">
              {formatExpiry(credential.validUntil, lang)}
            </dd>
          </div>
          {credential.issuedOn ? (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pt("claims.issuedOn")}
              </dt>
              <dd className="mt-0.5 text-sm tabular-nums text-foreground">{credential.issuedOn}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
