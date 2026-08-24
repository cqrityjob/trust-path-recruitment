// Security Passport — the shared Passport, as the recipient sees it.
//
// A stranger following a share link should meet the same considered object
// the holder previewed, not a bare list. So this is the Direction C
// material — deep navy, engraved guilloche, one gold rule, restrained metal
// — carrying only what the disclosure package permits.
//
// ── IT RENDERS A MODEL, NOT A PAYLOAD ──────────────────────────────────
//
// The input is `RecipientPresentation`, built once from the server payload
// (recipient-presentation.ts). The page, this card and the downloadable
// image all consume that same model, so none of them can form its own
// opinion about whether a credential is current.
//
// ── WHY THE MILESTONE IS ABSENT ────────────────────────────────────────
//
// The private card can show a verified-years milestone because it reads the
// holder's whole period history. A disclosure carries only a tenure total,
// and only for the packages that promise one, so the total is printed as a
// plain duration with the words that say what it counts — never as an
// emblem that could be mistaken for a rating.

import { CredentialScopeLine } from "./CredentialScopeLine";
import { joinTitles } from "@/lib/security-passport/identity/presentation";
import { EligibilityLine } from "../EligibilityLine";
import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatDuration } from "@/lib/security-passport/format";
import type { RecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { presentationWordKey } from "@/lib/security-passport/design/credential-symbols";
import { BrandMark, EngravedField, EngravedRule, MicroLabel } from "../card/CardPrimitives";
import { CredentialSymbol } from "../CredentialSymbol";

/** Tones for the status word ON THE CARD's navy ground. Distinct from the
 *  theme-surface tones used elsewhere; both are supplementary to the word. */
const CARD_WORD_TONE: Record<string, string> = {
  verified: TRUST_PALETTE.goldBright,
  documented: TRUST_PALETTE.ink,
  self_declared: TRUST_PALETTE.inkMuted,
  draft: TRUST_PALETTE.inkMuted,
  expired: TRUST_PALETTE.amber,
  disputed: TRUST_PALETTE.amber,
  revoked: TRUST_PALETTE.danger,
  superseded: TRUST_PALETTE.inkFaint,
};

export function RecipientPassportCard({
  presentation,
  verifyUrl,
  className = "",
}: {
  presentation: RecipientPresentation;
  /** A PUBLIC verification address, when one exists for this presentation.
   *  Optional on purpose: a surface that has no public link must omit it
   *  rather than substitute whatever address it happens to be rendered at. */
  verifyUrl?: string;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const rim = TRUST_PALETTE.gold;
  const rimBright = TRUST_PALETTE.goldBright;

  const holderName = presentation.holderLabel ?? pt("rec.anonymousHolder");
  const jurisdiction =
    presentation.jurisdiction === "SE" ? pt("jurisdiction.SE") : presentation.jurisdiction;

  return (
    <article
      className={`relative isolate overflow-hidden rounded-2xl ${className}`}
      style={{
        background: `linear-gradient(165deg, ${TRUST_PALETTE.navyRaised} 0%, ${TRUST_PALETTE.navy} 38%, ${TRUST_PALETTE.navyDeep} 100%)`,
        border: `1px solid ${rim}88`,
        boxShadow: `0 20px 56px -26px rgba(0,0,0,0.8), inset 0 1px 0 ${rimBright}22`,
      }}
      aria-label={pt("card.brand")}
    >
      <EngravedField intensity={0.95} tone={rimBright} />

      <div className="relative flex h-full flex-col p-5 sm:p-6">
        {/* ── Identity band ─────────────────────────────────────────── */}
        <header>
          <BrandMark tone={TRUST_PALETTE.ink} />
          <MicroLabel tone={rimBright} className="mt-2">
            {pt("card.brand")}
          </MicroLabel>

          <h2
            className="mt-5 text-2xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-3xl"
            style={{ color: TRUST_PALETTE.ink, fontFamily: "var(--font-display)" }}
          >
            {holderName}
          </h2>
          <p className="mt-2 text-sm" style={{ color: TRUST_PALETTE.inkMuted }}>
            {joinTitles(presentation.titles, lang, pt("common.notStated"))}
            <span aria-hidden="true"> · </span>
            <span style={{ color: TRUST_PALETTE.ink }}>{jurisdiction}</span>
          </p>
        </header>

        <EligibilityLine titles={presentation.eligibility} withNote={false} className="mt-4" />

        <div className="relative mt-5">
          <EngravedRule tone={`${rim}99`} />
        </div>

        {/* ── Verified tenure, where the package discloses it ───────── */}
        {presentation.verifiedExperienceDays > 0 ? (
          <div className="mt-4">
            <MicroLabel tone={TRUST_PALETTE.inkMuted}>{pt("rec.tenure")}</MicroLabel>
            <p
              className="mt-1 text-xl font-semibold tabular-nums"
              style={{ color: TRUST_PALETTE.ink, fontFamily: "var(--font-display)" }}
            >
              {formatDuration(presentation.verifiedExperienceDays, lang)}
            </p>
          </div>
        ) : null}

        {/* ── Disclosed credentials ─────────────────────────────────── */}
        {presentation.credentials.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {presentation.credentials.map((c) => {
              const isCurrent = c.lifecycle === "active";
              const tone = CARD_WORD_TONE[c.presentation] ?? TRUST_PALETTE.inkMuted;
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-md px-3 py-2.5"
                  style={{
                    background: isCurrent ? "rgba(183,146,85,0.12)" : "transparent",
                    border: `1px solid ${isCurrent ? rim : TRUST_PALETTE.amber}`,
                  }}
                >
                  <span className="mt-0.5 shrink-0">
                    <CredentialSymbol
                      code={c.code}
                      state={c.presentation}
                      name={c.title}
                      size={34}
                      decorative
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-sm font-semibold leading-snug"
                      style={{ color: TRUST_PALETTE.ink }}
                    >
                      {c.title}
                    </span>
                    {/* A credential that is not current leads with the
                        lifecycle word; its verification is stated as past. */}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {!isCurrent ? (
                        <>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                            style={{ color: tone }}
                          >
                            {pt(`lifecycle.${c.lifecycle}` as const)}
                          </span>
                          <span aria-hidden="true" style={{ color: TRUST_PALETTE.inkFaint }}>
                            ·
                          </span>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                            style={{ color: TRUST_PALETTE.inkMuted }}
                          >
                            {pt("assertion.verified.historical")}
                          </span>
                        </>
                      ) : (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                          style={{ color: tone }}
                        >
                          {pt(presentationWordKey(c.presentation))}
                        </span>
                      )}
                    </span>
                    {c.verifierOrganisation ? (
                      <span
                        className="mt-1 block truncate text-[11px]"
                        style={{ color: TRUST_PALETTE.inkFaint }}
                      >
                        {pt("rec.verifiedBy")}: {c.verifierOrganisation}
                      </span>
                    ) : null}
                    {/* An approval shown without its limits reads as a general
                        national licence. This card is what the employer's view
                        of an application renders, so the limit has to appear
                        here and not only on the public page. */}
                    <CredentialScopeLine credential={c} tone="inline" className="text-[11px]" />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* Nothing disclosed is a legitimate outcome, and it is said in
            words rather than left as an empty panel. */}
        {presentation.isEmpty ? (
          <p
            className="mt-4 rounded-lg border border-dashed px-4 py-3 text-[11px] uppercase tracking-[0.16em]"
            style={{ borderColor: `${TRUST_PALETTE.inkFaint}66`, color: TRUST_PALETTE.inkMuted }}
          >
            {pt("rec.nothing")}
          </p>
        ) : null}

        {presentation.containsExpired ? (
          <p className="mt-3 text-[11px]" style={{ color: TRUST_PALETTE.amber }}>
            {pt("card.containsExpired")}
          </p>
        ) : null}

        <div className="flex-1" />

        {/* ── Verification footer ───────────────────────────────────── */}
        {verifyUrl && (
          <footer className="mt-6">
            <EngravedRule tone={`${rim}44`} />
            <p className="mt-3 text-[10px] leading-snug" style={{ color: TRUST_PALETTE.inkMuted }}>
              {pt("card.verifyAtSource")}
            </p>
            <p
              className="mt-1 break-all text-[10px] leading-snug"
              style={{ color: TRUST_PALETTE.inkFaint }}
            >
              {verifyUrl}
            </p>
          </footer>
        )}
      </div>
    </article>
  );
}
