// One claim, with the context that must always travel with it.
//
// Issuer, verifier, jurisdiction, dates, evidence level, lifecycle state and
// any limitation are rendered together, in one block, always. They are not
// progressive-disclosure details behind a chevron: a licence shown without
// its expiry, or a certification shown without the fact that nobody
// verified it, is the specific failure the whole trust model exists to
// prevent (Product Architecture v1.1 §7.3).
//
// The same component renders the holder's private view and the recipient's
// verification page, so the two can never drift into showing different
// context for the same entry.

import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  formatDate,
  formatExpiry,
  formatJurisdiction,
  verifierAttributionKey,
} from "@/lib/security-passport/format";
import { credentialPresentation } from "@/lib/security-passport/design/credential-symbols";
import type { Claim } from "@/lib/security-passport/types";
import { AssertionChip } from "./AssertionChip";
import { CredentialSymbol } from "./CredentialSymbol";
import { LifecycleChip, LifecycleNote } from "./LifecycleChip";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function ClaimRow({
  claim,
  className,
  /** Suppressed when the list is already grouped under a type heading —
   *  otherwise every card in a "Certification" group is itself captioned
   *  "Certification". Kept on by default because the recipient page renders
   *  claims ungrouped, where the type is the first thing a reader needs. */
  showType = true,
  /** Optional on purpose. The recipient page and the fixture prototype render
   *  the same row with nothing to open — a claim is a fact there, not a
   *  destination. Only the holder's own overview passes this. */
  onOpen,
}: {
  claim: Claim;
  className?: string;
  showType?: boolean;
  onOpen?: () => void;
}) {
  const { pt, lang } = usePassportCopy();
  const title = lang === "sv" ? claim.titleSv : claim.titleEn;
  const limitation = lang === "sv" ? claim.limitationSv : claim.limitationEn;

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        // Expired, revoked and disputed entries stay fully legible. Fading
        // them would hide exactly the information a reader most needs.
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* A supported credential carries its mark. The symbol repeats the
              state the chips beside it spell out — a fifth channel, never
              the only one. */}
          {claim.credentialCode ? (
            <CredentialSymbol
              code={claim.credentialCode}
              state={credentialPresentation(claim.assertionLevel, claim.lifecycleState)}
              name={title}
              size={40}
              className="mt-0.5 shrink-0"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            {showType ? (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pt(`claims.type.${claim.claimType}` as const)}
              </p>
            ) : null}
            <h4 className="mt-1 text-base font-semibold tracking-tight text-foreground">{title}</h4>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AssertionChip
            level={claim.assertionLevel}
            lifecycleState={claim.lifecycleState}
            size="sm"
          />
          <LifecycleChip state={claim.lifecycleState} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {/* ── "—" IS A SENTINEL, NOT A LABEL ─────────────────────────────
            `issuerName` is `claimed_issuer_name ?? "—"` in the read model, and
            that em dash is load-bearing elsewhere: the Passport Card filters
            attributions on it and the correction form maps it back to an empty
            input. So it stays in the model and is translated HERE, where a
            reader sees it. A dash under "Utfärdare" reads as a value nobody
            can interpret; "Ej angivet" says the one true thing, in the same
            words `formatDate` already uses two fields to the right. */}
        <Field
          label={pt("claims.issuer")}
          value={claim.issuerName === "—" ? pt("common.notStated") : claim.issuerName}
        />
        {claim.jurisdictionCode ? (
          <Field
            label={pt("claims.jurisdiction")}
            value={formatJurisdiction(claim.jurisdictionCode, lang)}
          />
        ) : null}
        <Field label={pt("claims.issuedOn")} value={formatDate(claim.issuedOn, lang)} />
        <Field label={pt("claims.validUntil")} value={formatExpiry(claim.validUntil, lang)} />
        {/* ── ISSUER AND VERIFIER, SIDE BY SIDE AND NEVER MERGED ────────
            "Issuer" above is what the candidate typed. This is who made the
            verification DECISION, read from the decision record, and its
            label follows the recorded METHOD -- "Document reviewed by
            CQrityjob" is a different claim from "Confirmed by Bevakning AB"
            and the reader is owed the difference. Absent when nobody has
            verified it, which is most claims: the row simply omits the
            field rather than reaching for the issuer's name. */}
        {claim.verifierName ? (
          <Field
            label={pt(verifierAttributionKey(claim.verificationMethod, claim.verifierName))}
            value={claim.verifierName}
          />
        ) : null}
        {claim.verifierName && claim.verifiedOn ? (
          <Field label={pt("claims.verifiedOn")} value={claim.verifiedOn} />
        ) : null}
      </dl>

      <LifecycleNote state={claim.lifecycleState} />

      {limitation ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-widest">
            {pt("claims.limitation")}:{" "}
          </span>
          {limitation}
        </p>
      ) : null}

      {claim.versionNo > 1 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {pt("claims.version")} {claim.versionNo} · {pt("claims.history")}
        </p>
      ) : null}

      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("claim.openDetail")}
        </button>
      ) : null}
    </li>
  );
}

export function ClaimList({
  claims,
  emptyLabel,
  showType = true,
  onOpenClaim,
}: {
  claims: readonly Claim[];
  emptyLabel: string;
  showType?: boolean;
  onOpenClaim?: (claimId: string) => void;
}) {
  if (claims.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-3">
      {claims.map((c) => (
        <ClaimRow
          key={c.id}
          claim={c}
          showType={showType}
          onOpen={onOpenClaim ? () => onOpenClaim(c.id) : undefined}
        />
      ))}
    </ul>
  );
}
