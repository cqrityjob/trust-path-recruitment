// Direction A — TENURE CREST.
//
// The institutional reading. Restrained, symmetrical, document-like: this
// is the card a Väktare would put in a frame, or attach to a formal
// application, and it should look at home next to a service medal.
//
// Layout logic: a centred crest axis. Brand at the top, the crest and the
// milestone on the vertical centreline, credentials as a formal register
// below, attribution and verification in a footer plate. Symmetry is what
// reads as "official" — asymmetry reads as "marketing".
//
// Trade-off, stated honestly: this is the least shareable of the three.
// Centred formality photographs well but scrolls past quickly, and it gives
// a proud holder the least reason to post it. It buys maximum credibility
// with employers and regulators.

import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import {
  BrandMark,
  CredentialPlate,
  EngravedField,
  EngravedRule,
  MicroLabel,
  MilestoneEmblem,
  Rosette,
  VerifyBlock,
} from "./CardPrimitives";
import { useCardContent, type CardDirectionProps } from "./useCardContent";

export function DirectionA({
  card,
  shareOverlay = "none",
  verifyUrl,
  socialSafe = false,
  className = "",
}: CardDirectionProps) {
  const c = useCardContent(card, verifyUrl, shareOverlay, socialSafe);

  return (
    <article
      className={`relative isolate overflow-hidden rounded-2xl ${className}`}
      style={{
        background: `linear-gradient(180deg, ${TRUST_PALETTE.navy} 0%, ${TRUST_PALETTE.navyDeep} 100%)`,
        border: `1px solid ${TRUST_PALETTE.gold}55`,
        boxShadow: "0 18px 48px -24px rgba(0,0,0,0.75)",
      }}
      aria-label={c.brandLabel}
    >
      <EngravedField intensity={0.75} tone={TRUST_PALETTE.blueLuminous} />

      <div className="relative flex h-full flex-col p-6">
        {/* Brand rail */}
        <header className="flex items-center justify-between">
          <BrandMark tone={TRUST_PALETTE.ink} />
          <MicroLabel tone={TRUST_PALETTE.gold}>{c.brandLabel}</MicroLabel>
        </header>

        <div className="mt-4">
          <EngravedRule tone={`${TRUST_PALETTE.gold}44`} />
        </div>

        {c.shareWarning ? (
          <p
            className="mt-4 rounded-md px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ background: `${TRUST_PALETTE.amber}1f`, color: TRUST_PALETTE.amber }}
          >
            {c.shareWarning}
          </p>
        ) : null}

        {/* Crest axis */}
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="relative flex items-center justify-center">
            <Rosette size={116} tone={`${TRUST_PALETTE.gold}`} />
            <span className="absolute">
              <svg width="30" height="34" viewBox="0 0 16 18" fill="none" aria-hidden="true">
                <path
                  d="M8 1 1 3.6v5.2C1 13.1 4 16.3 8 17c4-.7 7-3.9 7-8.2V3.6z"
                  stroke={TRUST_PALETTE.goldBright}
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>

          <h3
            className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-balance"
            style={{ color: TRUST_PALETTE.ink, fontFamily: "var(--font-display)" }}
          >
            {c.holderName}
          </h3>
          <p className="mt-1.5 text-sm" style={{ color: TRUST_PALETTE.inkMuted }}>
            {c.profession} · {c.jurisdiction}
          </p>
        </div>

        {/* Milestone */}
        <div className="mt-6">
          {c.milestone ? (
            <MilestoneEmblem
              years={c.milestone.years}
              yearsLabel={c.milestone.yearsLabel}
              verifiedLabel={c.milestone.verifiedLabel}
              style={c.milestone.style}
            />
          ) : (
            <p
              className="rounded-lg border border-dashed px-4 py-3 text-center text-xs uppercase tracking-[0.16em]"
              style={{ borderColor: `${TRUST_PALETTE.inkFaint}66`, color: TRUST_PALETTE.inkMuted }}
            >
              {c.noVerifiedYet}
            </p>
          )}
        </div>

        {/* Register of credentials */}
        {c.credentials.length > 0 ? (
          <section className="mt-5 space-y-2">
            <MicroLabel tone={TRUST_PALETTE.inkFaint}>{c.brandLabel}</MicroLabel>
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

        {/* Footer plate */}
        <footer className="mt-6">
          <EngravedRule tone={`${TRUST_PALETTE.gold}33`} />
          {c.attributions ? (
            <p className="mt-3 text-[11px] leading-snug" style={{ color: TRUST_PALETTE.inkFaint }}>
              {c.attributions}
            </p>
          ) : null}
          <div className="mt-3">
            <VerifyBlock
              url={verifyUrl}
              actionLabel={c.verifyLabel}
              qrDataUrl={c.qrDataUrl}
              tone={TRUST_PALETTE.gold}
            />
          </div>
          <p className="mt-3 text-[10px] leading-snug" style={{ color: TRUST_PALETTE.inkFaint }}>
            {c.verifyAtSource}
          </p>
        </footer>
      </div>
    </article>
  );
}
