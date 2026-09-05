// Security Passport — the disclosed credentials, as the recipient page lists
// them in full.
//
// ── WHY THIS IS A COMPONENT AND NOT PART OF THE ROUTE ──────────────────
//
// It used to be inline in /p/$token, where nothing could render it without
// a share cookie and a server function. The one surface a stranger reads
// with no way to check behind it was therefore the one surface no guard
// could put in front of a fixture. It now takes the interpreted model and
// nothing else, so a render proof can hand it a legacy credential and read
// the markup back.
//
// ── IT RENDERS A MODEL, NOT A PAYLOAD ──────────────────────────────────
//
// Every word of trust here -- the status chip, the symbol state, the
// who/how/when labels, the legacy note -- comes from `RecipientCredential`,
// which recipient-presentation.ts derived once through the central trust
// helpers. This file compares nothing against a method or an organisation.

import { AssertionChip } from "../AssertionChip";
import { CredentialSymbol } from "../CredentialSymbol";
import { LifecycleChip, LifecycleNote } from "../LifecycleChip";
import { CredentialScopeLine } from "./CredentialScopeLine";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  formatExpiry,
  formatJurisdiction,
  formatWorkLocation,
} from "@/lib/security-passport/format";
import { methodLabelKey } from "@/lib/security-passport/trust-presentation";
import type { RecipientCredential } from "@/lib/security-passport/recipient-presentation";
import { BadgeCheck } from "lucide-react";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function RecipientCredentialList({
  credentials,
}: {
  credentials: readonly RecipientCredential[];
}) {
  const { pt, lang } = usePassportCopy();
  if (credentials.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {pt("rec.qualifications")}
      </h2>
      <ul className="mt-3 space-y-3">
        {credentials.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <CredentialSymbol
                  code={c.code}
                  state={c.presentation}
                  name={c.title}
                  size={40}
                  className="mt-0.5 shrink-0"
                />
                <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground">
                  {c.title}
                </h3>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                {/* The present-tense VERIFIED pill is worn ONLY by a
                    credential whose derived presentation is verified. An
                    entry that is no longer current, and a legacy unsupported
                    entry whose effective level is documented, both take the
                    chip for the level they actually have. */}
                {c.lifecycle === "active" && c.presentation === "verified" ? (
                  <span
                    data-trust-pill="verified"
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
                  >
                    <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    {pt(c.statusWordKey)}
                  </span>
                ) : (
                  <AssertionChip
                    // The STORED level plus the provenance: the chip derives the
                    // outward level itself, so a review reads Dokumenterad, not
                    // "document provided". Passing the effective level would
                    // hand it a file-attached credential it never was.
                    level={c.assertion}
                    lifecycleState={c.lifecycle}
                    provenance={{
                      verifierName: c.verifierOrganisation,
                      verificationMethod: c.verificationMethod,
                    }}
                    size="sm"
                    className={c.lifecycle === "active" ? undefined : "opacity-80"}
                  />
                )}
                <LifecycleChip state={c.lifecycle} />
              </span>
            </div>

            <LifecycleNote state={c.lifecycle} />

            {/* The same component the card uses, so the public page and the
                employer's application view cannot drift into two readings
                of one privacy boundary. */}
            <CredentialScopeLine credential={c} className="mt-3" />

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Row label={pt("rec.issuer")} value={c.issuer ?? pt("common.notStated")} />
              {/* The credential's OWN market, on every credential. Rendered
                  through formatWorkLocation so an emirate prints as "Dubai,
                  Förenade Arabemiraten" and is never flattened to the UAE. */}
              {c.jurisdiction ? (
                <Row
                  label={pt("rec.credentialMarket")}
                  value={formatWorkLocation(c.jurisdiction, c.subJurisdiction, lang)}
                />
              ) : null}
              <Row
                label={pt(c.labels.by)}
                value={c.verifierOrganisation ?? pt("common.notStated")}
              />
              <Row
                label={pt(c.labels.method)}
                value={
                  c.verificationMethod
                    ? pt(
                        methodLabelKey(c.verificationMethod, c.verifierOrganisation) ??
                          "common.notStated",
                      )
                    : pt("common.notStated")
                }
              />
              <Row
                label={pt(c.labels.at)}
                value={c.verifiedAt ? c.verifiedAt.slice(0, 10) : pt("common.notStated")}
              />
              <Row label={pt("rec.validUntil")} value={formatExpiry(c.validUntil, lang)} />
              {c.jurisdiction ? (
                <Row
                  label={pt("rec.jurisdiction")}
                  value={formatJurisdiction(c.jurisdiction, lang)}
                />
              ) : null}
            </dl>

            {c.noticeKey ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {pt(c.noticeKey)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
