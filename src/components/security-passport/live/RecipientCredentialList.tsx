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
  formatIsoDay,
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
          <li
            key={c.key}
            data-recipient-credential={c.key}
            className="rounded-lg border border-border bg-card p-4"
          >
            {/* ── STACKED ON A PHONE, SIDE BY SIDE FROM `sm` ─────────────
                This was one wrapping flex row at every width, with the title
                allowed to shrink (`min-w-0 flex-1`) beside chips that are not
                (`shrink-0`). At 390px the title's box shrank below its longest
                word — "Ordningsvaktsförordnande" — and the word painted
                straight over the trust chip. A title is not something to
                squeeze: on a narrow screen it takes the full width and the
                status sits on its own line beneath it; from `sm` the original
                presentation is unchanged. */}
            <div
              data-recipient-credential-head
              className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4"
            >
              <div className="flex min-w-0 items-start gap-3 sm:flex-1">
                <CredentialSymbol
                  code={c.code}
                  state={c.presentation}
                  name={c.title}
                  size={40}
                  className="mt-0.5 shrink-0"
                />
                <h3
                  data-recipient-credential-title
                  className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground [hyphens:none] [overflow-wrap:normal] [word-break:keep-all]"
                >
                  {c.title}
                </h3>
              </div>
              <span
                data-recipient-credential-status
                className="flex flex-row flex-wrap items-center gap-1.5 pl-[3.25rem] sm:shrink-0 sm:flex-col sm:items-end sm:pl-0"
              >
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

            {/* The STORED level and provenance, as the chip above receives
                them: what an expired entry "was" is derived, never assumed. */}
            <LifecycleNote
              state={c.lifecycle}
              entry={{
                assertionLevel: c.assertion,
                verifierName: c.verifierOrganisation,
                verificationMethod: c.verificationMethod,
                subjectKind: "credential",
              }}
            />
            {c.credentialIdentifier && (
              <p className="mt-2 break-all text-sm">
                {lang === "sv" ? "Certifikats- eller licensnummer" : "Credential identifier"}:{" "}
                {c.credentialIdentifier}
              </p>
            )}

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
              {/* WHO / HOW / WHEN, and only when there is an answer.
                  
                  Since chosen-merit sharing carries self-declared entries too,
                  a credential nobody has assessed reached this list — and
                  printed "Verifierad av: Ej angivet · Metod: Ej angivet ·
                  Verifierad: Ej angivet". Three empty verification fields
                  under a merit read as a verification that was expected and is
                  missing, which is a heavier statement than the truth: nobody
                  was asked. The chip above already says Egen uppgift; these
                  rows appear when there is something to put in them. */}
              {c.verifierOrganisation ? (
                <Row label={pt(c.labels.by)} value={c.verifierOrganisation} />
              ) : null}
              {c.verificationMethod ? (
                <Row
                  label={pt(c.labels.method)}
                  value={pt(
                    methodLabelKey(c.verificationMethod, c.verifierOrganisation) ??
                      "common.notStated",
                  )}
                />
              ) : null}
              {c.verifiedAt ? (
                <Row
                  label={pt(c.labels.at)}
                  value={formatIsoDay(c.verifiedAt.slice(0, 10), lang)}
                />
              ) : null}
              <Row
                label={pt("rec.validUntil")}
                value={
                  c.validUntil
                    ? formatIsoDay(c.validUntil, lang)
                    : formatExpiry(null, lang, c.noExpiry)
                }
              />
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
