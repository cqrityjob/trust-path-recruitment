// Direction B — PROFESSIONAL COLLECTIBLE.
//
// The desirable reading. Portrait proportions, a strong diagonal frame, the
// milestone numeral given real scale, and credentials as enamel-style pins
// down the lower third. This is the one a holder posts.
//
// ── WHERE THE COLLECTIBLE ANALOGY STOPS ────────────────────────────────
//
// A sports collectible earns its energy from a rating: one number that
// summarises a person. That number is precisely what this product forbids,
// so the energy has to come from somewhere else — here, from scale,
// framing and material rather than from judgement.
//
// The large numeral is verified YEARS, and the words "verified professional
// experience" are locked inside the emblem so the figure cannot be cropped
// away from what it counts. There is no second number anywhere on the card,
// which makes it structurally impossible to read as a rating: a rating
// needs something to compare against.
//
// Trade-off, stated honestly: the visual energy that makes this shareable
// is the same energy that could make a casual viewer expect a score. That
// is the risk this direction carries, and the reason Direction C exists.

import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import {
  BrandMark,
  CredentialPlate,
  EngravedField,
  MicroLabel,
  MilestoneEmblem,
  VerifiedSeal,
  VerifyBlock,
} from "./CardPrimitives";
import { useCardContent, type CardDirectionProps } from "./useCardContent";

export function DirectionB({
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
        background: `radial-gradient(120% 80% at 50% 0%, ${TRUST_PALETTE.navyRaised} 0%, ${TRUST_PALETTE.navy} 45%, ${TRUST_PALETTE.navyDeep} 100%)`,
        border: `1.5px solid ${rim}`,
        boxShadow: `0 22px 60px -28px rgba(0,0,0,0.85), inset 0 0 0 1px ${rimBright}22`,
      }}
      aria-label={c.brandLabel}
    >
      <EngravedField intensity={1.15} tone={rimBright} />

      {/* Diagonal frame sweep — the collectible gesture, drawn not imported. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 400 560"
      >
        <path d="M0 96 L400 24 L400 30 L0 102 Z" fill={rimBright} opacity="0.22" />
        <path d="M0 108 L400 36 L400 38 L0 110 Z" fill={rimBright} opacity="0.12" />
        <path d="M0 452 L400 386 L400 560 L0 560 Z" fill={TRUST_PALETTE.navyDeep} opacity="0.55" />
      </svg>

      <div className="relative flex h-full flex-col p-6">
        <header className="flex items-start justify-between">
          <div>
            <MicroLabel tone={rimBright}>{c.brandLabel}</MicroLabel>
            <p className="mt-1 text-xs" style={{ color: TRUST_PALETTE.inkMuted }}>
              {c.profession} · {c.jurisdiction}
            </p>
          </div>
          {c.milestone ? <VerifiedSeal tone={rimBright} size={38} /> : null}
        </header>

        {c.shareWarning ? (
          <p
            className="mt-4 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ background: `${TRUST_PALETTE.amber}1f`, color: TRUST_PALETTE.amber }}
          >
            {c.shareWarning}
          </p>
        ) : null}

        {/* Name given portrait-card scale */}
        <h3
          className="mt-8 text-4xl font-semibold leading-[1.05] tracking-tight text-balance"
          style={{ color: TRUST_PALETTE.ink, fontFamily: "var(--font-display)" }}
        >
          {c.holderName}
        </h3>

        <div className="mt-6">
          {c.milestone ? (
            <MilestoneEmblem
              years={c.milestone.years}
              yearsLabel={c.milestone.yearsLabel}
              verifiedLabel={c.milestone.verifiedLabel}
              style={c.milestone.style}
              size="large"
            />
          ) : (
            <div
              className="rounded-lg border border-dashed px-4 py-4"
              style={{ borderColor: `${TRUST_PALETTE.inkFaint}66` }}
            >
              <p
                className="text-xs uppercase tracking-[0.16em]"
                style={{ color: TRUST_PALETTE.inkMuted }}
              >
                {c.noVerifiedYet}
              </p>
            </div>
          )}
        </div>

        {/* Enamel-pin register */}
        {c.credentials.length > 0 ? (
          <section className="mt-5 space-y-2">
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

        <footer className="mt-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <BrandMark tone={TRUST_PALETTE.inkMuted} compact />
            <p
              className="mt-2 max-w-[16rem] text-[10px] leading-snug"
              style={{ color: TRUST_PALETTE.inkFaint }}
            >
              {c.verifyAtSource}
            </p>
            <p
              className="mt-1 break-all text-[10px] leading-snug"
              style={{ color: TRUST_PALETTE.inkMuted }}
            >
              {verifyUrl}
            </p>
            {c.attributions ? (
              <p className="mt-1 text-[10px]" style={{ color: TRUST_PALETTE.inkFaint }}>
                {c.attributions}
              </p>
            ) : null}
          </div>
          <VerifyBlock
            url={verifyUrl}
            actionLabel={c.verifyLabel}
            qrDataUrl={c.qrDataUrl}
            tone={rimBright}
            size={62}
            showUrl={false}
          />
        </footer>
      </div>
    </article>
  );
}
