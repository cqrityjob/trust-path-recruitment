// Direction C — CQrityjob SIGNATURE. The recommended foundation.
//
// ── WHAT IT TAKES FROM EACH ────────────────────────────────────────────
//
// From Tenure Crest: the engraved security-document material, the formal
// register of credentials, the discipline of a footer that states its own
// limits. From Professional Collectible: the confident scale of the name
// and the milestone, and a frame with enough presence to survive a
// crowded feed. From a credential wallet: the assumption that the reader is
// checking something, not admiring it.
//
// ── THE STRUCTURAL IDEA: A BANDED DOCUMENT ─────────────────────────────
//
// One horizontal gold rule divides the card into an identity band and an
// evidence band. Everything above the rule is who this is; everything below
// is what has been verified. That single line does the work a rating badge
// does on a collectible — it gives the eye an anchor — without encoding any
// judgement, and it is the element that makes the layout recognisably
// CQrityjob's rather than a genre's.
//
// The milestone sits ON the rule, spanning both bands, because it belongs
// to both: it is an attribute of the person AND the strongest piece of
// evidence. That placement is the signature gesture.

import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import { ExperienceMark } from "../ExperienceMark";
import {
  BrandMark,
  CredentialPlate,
  EngravedField,
  EngravedRule,
  MicroLabel,
  MilestoneEmblem,
  VerifiedSeal,
  VerifyBlock,
} from "./CardPrimitives";
import { useCardContent, type CardDirectionProps } from "./useCardContent";

export function DirectionC({
  card,
  shareOverlay = "none",
  verifyUrl,
  socialSafe = false,
  className = "",
}: CardDirectionProps) {
  const c = useCardContent(card, verifyUrl, shareOverlay, socialSafe);
  const rim = c.milestone ? c.milestone.style.rim : TRUST_PALETTE.blue;
  const rimBright = c.milestone ? c.milestone.style.rimBright : TRUST_PALETTE.blueLuminous;

  return (
    <article
      className={`relative isolate overflow-hidden rounded-2xl ${className}`}
      style={{
        background: `linear-gradient(165deg, ${TRUST_PALETTE.navyRaised} 0%, ${TRUST_PALETTE.navy} 38%, ${TRUST_PALETTE.navyDeep} 100%)`,
        border: `1px solid ${rim}88`,
        boxShadow: `0 20px 56px -26px rgba(0,0,0,0.8), inset 0 1px 0 ${rimBright}22`,
      }}
      aria-label={c.brandLabel}
    >
      <EngravedField intensity={0.95} tone={rimBright} />

      <div className="relative flex h-full flex-col p-6">
        {/* ── Identity band ─────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <BrandMark tone={TRUST_PALETTE.ink} />
            <MicroLabel tone={rimBright} className="mt-2">
              {c.brandLabel}
            </MicroLabel>
          </div>
          {c.milestone ? <VerifiedSeal tone={rimBright} size={36} /> : null}
        </header>

        {c.shareWarning ? (
          <p
            className="mt-4 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ background: `${TRUST_PALETTE.amber}1f`, color: TRUST_PALETTE.amber }}
          >
            {c.shareWarning}
          </p>
        ) : null}

        <div className="mt-6">
          <h3
            className="text-3xl font-semibold leading-[1.08] tracking-tight text-balance"
            style={{ color: TRUST_PALETTE.ink, fontFamily: "var(--font-display)" }}
          >
            {c.holderName}
          </h3>
          <p className="mt-2 text-sm" style={{ color: TRUST_PALETTE.inkMuted }}>
            {c.profession}
            <span aria-hidden="true"> · </span>
            <span style={{ color: TRUST_PALETTE.ink }}>{c.jurisdiction}</span>
          </p>
        </div>

        {/* ── The signature rule, with the milestone straddling it ──── */}
        <div className="relative mt-6">
          <EngravedRule tone={`${rim}99`} />
          <div className="-mt-px pt-4">
            {c.milestone ? (
              <MilestoneEmblem
                years={c.milestone.years}
                yearsLabel={c.milestone.yearsLabel}
                verifiedLabel={c.milestone.verifiedLabel}
                style={c.milestone.style}
              />
            ) : (
              <div
                className="rounded-lg border border-dashed px-4 py-3"
                style={{ borderColor: `${TRUST_PALETTE.inkFaint}66` }}
              >
                <p
                  className="text-[11px] uppercase tracking-[0.16em]"
                  style={{ color: TRUST_PALETTE.inkMuted }}
                >
                  {c.noVerifiedYet}
                </p>
              </div>
            )}

            {/* Verified time in the profession, as the five intervals plus the
                exact duration. It sits under the milestone because it answers
                a different question: the milestone is a threshold reached,
                this is how much has actually been checked. Neither is a
                score, and the figure is always printed so the segments never
                have to be decoded. */}
            <div className="mt-4">
              <ExperienceMark
                verifiedDays={c.experience.verifiedDays}
                selfDeclaredDays={c.experience.reportedDays}
                onNavy
              />
            </div>
          </div>
        </div>

        {/* ── Evidence band ─────────────────────────────────────────── */}
        {c.credentials.length > 0 ? (
          <section className="mt-4 space-y-2">
            {c.credentials.map((p) => (
              <CredentialPlate key={p.title} {...p} />
            ))}
          </section>
        ) : null}

        {c.stateWords.length > 0 ? (
          <ul className="mt-3 space-y-0.5">
            {c.stateWords.map((w) => (
              <li key={w} className="text-[11px]" style={{ color: TRUST_PALETTE.amber }}>
                {w}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex-1" />

        {/* ── Verification footer ───────────────────────────────────── */}
        <footer className="mt-6">
          <EngravedRule tone={`${rim}44`} />
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              {c.attributions ? (
                <p className="text-[11px] leading-snug" style={{ color: TRUST_PALETTE.inkFaint }}>
                  {c.attributions}
                </p>
              ) : null}
              <p
                className="mt-1.5 text-[10px] leading-snug"
                style={{ color: TRUST_PALETTE.inkMuted }}
              >
                {c.verifyAtSource}
              </p>
              <p
                className="mt-1 break-all text-[10px] leading-snug"
                style={{ color: TRUST_PALETTE.inkFaint }}
              >
                {verifyUrl}
              </p>
            </div>
            <VerifyBlock
              url={verifyUrl}
              actionLabel={c.verifyLabel}
              qrDataUrl={c.qrDataUrl}
              tone={rimBright}
              size={64}
              showUrl={false}
            />
          </div>
        </footer>
      </div>
    </article>
  );
}
