// Security Passport — shared card primitives.
//
// The vocabulary all three directions are built from: engraved guilloche
// fields, a verified seal, credential plates, the milestone emblem, the
// verification affordance and the brand mark.
//
// ── EVERY PRIMITIVE IS COMPLETE WITHOUT ANIMATION AND WITHOUT COLOUR ───
//
// These render into static exported images, so nothing here depends on
// motion, hover or JavaScript to be readable. And every trust-bearing
// primitive prints its state as a WORD — VERIFIERAD / VERIFIED, EXPIRED,
// DISPUTED — so a greyscale screenshot carries the same meaning as the
// original.
//
// ── NO RATING VOCABULARY, STRUCTURALLY ─────────────────────────────────
//
// There is no primitive here that can express a score, a percentage, a bar,
// a meter or a rank, because none was built. The only numeral any primitive
// renders is a verified year count, and it is always accompanied by the
// words that say what it counts.

import { useId } from "react";
import { TRUST_PALETTE, type MilestoneStyle } from "@/lib/security-passport/design/trust-system";
import type { CredentialPresentationState } from "@/lib/security-passport/design/credential-symbols";
import { CredentialSymbol } from "../CredentialSymbol";

/* ------------------------------------------------------------------ */
/* Engraved field — the ownable texture                                */
/* ------------------------------------------------------------------ */

/**
 * Guilloche line-work, as used on passports and banknotes.
 *
 * Pure inline SVG: no image asset, no external font, nothing that could
 * fail to load in an exported PNG. Rendered at very low opacity so it reads
 * as material rather than pattern, and marked aria-hidden because it
 * carries no information.
 */
export function EngravedField({
  intensity = 1,
  tone = TRUST_PALETTE.blueLuminous,
}: {
  intensity?: number;
  tone?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 400 560"
    >
      <defs>
        <pattern id={`g-${id}`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M0 20 Q10 0 20 20 T40 20 M0 40 Q10 20 20 40 T40 40 M0 0 Q10 -20 20 0 T40 0"
            fill="none"
            stroke={tone}
            strokeWidth="0.5"
            opacity={0.5 * intensity}
          />
        </pattern>
        <radialGradient id={`v-${id}`} cx="50%" cy="0%" r="90%">
          <stop offset="0%" stopColor={tone} stopOpacity={0.16 * intensity} />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="560" fill={`url(#g-${id})`} opacity={0.28 * intensity} />
      <rect width="400" height="560" fill={`url(#v-${id})`} />
    </svg>
  );
}

/** A rosette — the concentric engraving used at the centre of an official
 *  seal. Decorative only. */
export function Rosette({ size = 96, tone }: { size?: number; tone: string }) {
  const rings = [0.96, 0.82, 0.68, 0.54, 0.4];
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 100 100">
      {rings.map((r, i) => (
        <circle
          key={r}
          cx="50"
          cy="50"
          r={r * 45}
          fill="none"
          stroke={tone}
          strokeWidth={i % 2 === 0 ? 0.7 : 0.35}
          opacity={0.55 - i * 0.07}
        />
      ))}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={50 + Math.cos(a) * 18}
            y1={50 + Math.sin(a) * 18}
            x2={50 + Math.cos(a) * 43}
            y2={50 + Math.sin(a) * 43}
            stroke={tone}
            strokeWidth="0.4"
            opacity="0.4"
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Typographic primitives                                              */
/* ------------------------------------------------------------------ */

export function MicroLabel({
  children,
  tone = TRUST_PALETTE.inkFaint,
  className = "",
}: {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <p
      className={`text-[10px] font-semibold uppercase leading-none tracking-[0.22em] ${className}`}
      style={{ color: tone }}
    >
      {children}
    </p>
  );
}

/** An engraved hairline. Structure, not decoration: it is what makes the
 *  card read as a document rather than a poster. */
export function EngravedRule({ tone = "rgba(159,178,200,0.22)" }: { tone?: string }) {
  return <div aria-hidden="true" className="h-px w-full" style={{ background: tone }} />;
}

/* ------------------------------------------------------------------ */
/* Milestone emblem — the one prominent number                         */
/* ------------------------------------------------------------------ */

/**
 * "5 ÅR — VERIFIERAD YRKESERFARENHET".
 *
 * The numeral is large because it is the thing a holder is proud of, and it
 * is factual: verified elapsed time. It is never a rating, and the words
 * that qualify it are part of the emblem rather than a caption beside it,
 * so the number cannot be cropped away from its meaning.
 */
export function MilestoneEmblem({
  years,
  yearsLabel,
  verifiedLabel,
  style,
  size = "default",
}: {
  years: number;
  /** "år" / "years" — already pluralised and localised by the caller. */
  yearsLabel: string;
  /** "Verifierad yrkeserfarenhet" / "Verified professional experience". */
  verifiedLabel: string;
  style: MilestoneStyle;
  size?: "default" | "large" | "compact";
}) {
  const numeral = size === "large" ? "text-6xl" : size === "compact" ? "text-3xl" : "text-5xl";
  return (
    <div
      className="relative flex items-center gap-4 overflow-hidden rounded-lg px-4 py-3"
      style={{
        background: style.field,
        border: `1px solid ${style.rim}`,
        boxShadow: `inset 0 1px 0 ${style.rimBright}33`,
      }}
    >
      <div className="absolute -right-4 -top-6 opacity-40">
        <Rosette size={size === "compact" ? 72 : 110} tone={style.rimBright} />
      </div>
      <div className="relative min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`${numeral} font-semibold leading-none tracking-tight tabular-nums`}
            style={{ color: style.rimBright, fontFamily: "var(--font-display)" }}
          >
            {years}
          </span>
          <span
            className="text-sm font-medium uppercase tracking-widest"
            style={{ color: style.rimBright }}
          >
            {yearsLabel}
          </span>
        </div>
        <p
          className="mt-1.5 text-[11px] font-semibold uppercase leading-tight tracking-[0.18em]"
          style={{ color: TRUST_PALETTE.ink }}
        >
          {verifiedLabel}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Verified seal                                                       */
/* ------------------------------------------------------------------ */

/** A compact official seal. Always paired with the word VERIFIED by its
 *  caller — never used as a standalone "trust me" mark, because a seal on
 *  its own is exactly the thing a reader should not have to interpret. */
export function VerifiedSeal({ tone, size = 34 }: { tone: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, border: `1px solid ${tone}` }}
    >
      <Rosette size={size - 6} tone={tone} />
      <svg
        className="absolute"
        width={size * 0.42}
        height={size * 0.42}
        viewBox="0 0 24 24"
        fill="none"
        stroke={tone}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Credential plate                                                    */
/* ------------------------------------------------------------------ */

export interface CredentialPlateProps {
  readonly title: string;
  /** The evidence word — VERIFIERAD / VERIFIED / DOCUMENT PROVIDED / … */
  readonly evidenceWord: string;
  /** Lifecycle word, when the state needs qualifying. Null otherwise. */
  readonly lifecycleWord: string | null;
  readonly edge: string;
  readonly edgeStyle: "solid" | "dashed";
  readonly fill: string;
  readonly textTone: string;
  readonly premium: boolean;
  /** Issuer text. Never a logo — Phase 1B holds no issuer rights. */
  readonly issuer?: string | null;
  readonly overlayTone?: string | null;
  /** Taxonomy code for the credential symbol. Null keeps the plate's
   *  original seal treatment for free-text claims. */
  readonly symbolCode?: string | null;
  /** Presentation state for the symbol. Required whenever symbolCode is
   *  set, so a mark can never render without its status treatment. */
  readonly symbolState?: CredentialPresentationState;
}

/**
 * One credential, as a physical plate.
 *
 * Verified plates get the metal rim and the seal; everything else gets a
 * plain plate. The title WRAPS rather than truncating: a credential whose
 * name a reader cannot finish is not a credential, and Swedish compounds
 * like "Väktargrundutbildning" are long by nature.
 */
export function CredentialPlate({
  title,
  evidenceWord,
  lifecycleWord,
  edge,
  edgeStyle,
  fill,
  textTone,
  premium,
  issuer,
  overlayTone,
  symbolCode,
  symbolState,
}: CredentialPlateProps) {
  return (
    <div
      className="flex items-start gap-3 rounded-md px-3 py-2.5"
      style={{
        background: fill,
        border: `1px ${edgeStyle} ${overlayTone ?? edge}`,
      }}
    >
      {/* A supported credential leads with its mark; the mark's own state
          treatment repeats what the words beside it say. Free-text claims
          keep the original seal-on-verified treatment. */}
      {symbolCode && symbolState ? (
        <span className="mt-0.5 shrink-0">
          <CredentialSymbol
            code={symbolCode}
            state={symbolState}
            name={title}
            size={34}
          />
        </span>
      ) : premium ? (
        <span className="mt-0.5">
          <VerifiedSeal tone={overlayTone ?? edge} size={28} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug" style={{ color: TRUST_PALETTE.ink }}>
          {title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: overlayTone ?? textTone }}
          >
            {evidenceWord}
          </span>
          {lifecycleWord ? (
            <>
              <span aria-hidden="true" style={{ color: TRUST_PALETTE.inkFaint }}>
                ·
              </span>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: overlayTone ?? TRUST_PALETTE.inkMuted }}
              >
                {lifecycleWord}
              </span>
            </>
          ) : null}
        </div>
        {issuer ? (
          <p className="mt-1 truncate text-[11px]" style={{ color: TRUST_PALETTE.inkFaint }}>
            {issuer}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brand mark and verification affordance                              */
/* ------------------------------------------------------------------ */

/** Original wordmark lockup. Type and a drawn shield outline — no imported
 *  logo asset, nothing borrowed. */
export function BrandMark({
  tone = TRUST_PALETTE.ink,
  compact = false,
}: {
  tone?: string;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" width="16" height="18" viewBox="0 0 16 18" fill="none">
        <path
          d="M8 1 1 3.6v5.2C1 13.1 4 16.3 8 17c4-.7 7-3.9 7-8.2V3.6z"
          stroke={tone}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M5.4 9.1 7.2 11l3.4-3.6" stroke={tone} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span
        className={`font-semibold tracking-tight ${compact ? "text-xs" : "text-sm"}`}
        style={{ color: tone, fontFamily: "var(--font-display)" }}
      >
        CQrityjob
      </span>
    </span>
  );
}

/**
 * The verification affordance: a QR-shaped destination block plus the
 * short URL in text.
 *
 * Both, always. A QR alone is useless in a screenshot someone is reading on
 * the same phone, and a URL alone is useless across a room.
 */
export function VerifyBlock({
  url,
  actionLabel,
  tone = TRUST_PALETTE.ink,
  qrDataUrl,
  size = 68,
  showUrl = true,
}: {
  url: string;
  actionLabel: string;
  tone?: string;
  qrDataUrl: string | null;
  size?: number;
  /** False where the layout prints the URL elsewhere. The QR and the URL
   *  must both appear SOMEWHERE on every card — never neither. */
  showUrl?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="shrink-0 overflow-hidden rounded-sm bg-white p-1"
        style={{ width: size, height: size }}
      >
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="" aria-hidden="true" className="h-full w-full" />
        ) : (
          <div className="h-full w-full" style={{ background: "#e8edf3" }} />
        )}
      </div>
      {showUrl ? (
        <div className="min-w-0">
          <MicroLabel tone={tone}>{actionLabel}</MicroLabel>
          <p
            className="mt-1 break-all text-[11px] leading-tight"
            style={{ color: TRUST_PALETTE.inkMuted }}
          >
            {url}
          </p>
        </div>
      ) : null}
    </div>
  );
}
