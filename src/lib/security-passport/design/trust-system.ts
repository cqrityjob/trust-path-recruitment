// Security Passport — the CQrityjob Trust visual system.
//
// ── THE OWNABLE IDEA: SECURITY-DOCUMENT ENGRAVING ──────────────────────
//
// The Passport Card borrows its visual language from the thing it actually
// is: an identity document. Guilloche line-work, engraved hairlines, a
// debossed crest and a single metallic rule reserved for verified
// recognition. That vocabulary is centuries old, instantly reads as
// "official", and belongs to no company — so it is ownable without
// resembling anyone's trade dress.
//
// It is also structurally impossible to confuse with Career Card, whose
// language is normalised dimension bars on a flat navy field. No bar, no
// meter, no rating appears here or ever will.
//
// ── WHAT THE METAL MEANS, AND WHAT IT MUST NOT ────────────────────────
//
// `milestoneTier` is derived ONLY from verified years. It encodes elapsed,
// evidenced time — a factual category — never competence, quality,
// suitability or standing. The tier name is internal and never rendered;
// the UI prints the year count itself, so the meaning is carried by a
// number the reader can check rather than by a colour they must decode.
//
// Gold does not mean "better person". It means "twenty verified years",
// and the card says so in words.
//
// ── COLOUR IS NEVER LOAD-BEARING ───────────────────────────────────────
//
// Every trust state carries its word, its own border treatment and its own
// glyph. The palette below is the fifth channel, not the first.

import type { AssertionLevel, LifecycleState } from "../types";

/** Brand foundation. Hex values come from the CQrityjob palette documented
 *  in src/styles.css — the gold accent #B79255 is already the brand's, not
 *  invented here. Hard-coded rather than read from CSS custom properties
 *  because an exported PNG has to look right outside this app's DOM. */
export const TRUST_PALETTE = {
  /** Deep navy foundation. */
  navy: "#0B1F3A",
  navyDeep: "#061426",
  navyRaised: "#12294a",
  /** CQrityjob trust blue, used sparingly for structure and CTA. */
  blue: "#1769AA",
  blueLuminous: "#3B9BE0",
  /** Reserved exclusively for VERIFIED recognition. */
  gold: "#B79255",
  goldBright: "#E3C48B",
  goldDim: "#7A6238",
  ink: "#F4F7FB",
  inkMuted: "#9FB2C8",
  // Raised from #61748C, which measured 3.86:1 on the darkest card ground
  // and only 3.04:1 on the lightest — below WCAG AA for the issuer lines and
  // the verification URL that carry it. #8698AE clears 4.5:1 against all
  // three card backgrounds (worst case 4.94:1) and is asserted in
  // scripts/passport-fixture-check.ts so it cannot drift back.
  inkFaint: "#8698AE",
  /** Non-verified evidence: legible, dignified, deliberately unmetalled. */
  steel: "#8FA3BA",
  /** Lifecycle warnings. Never the only signal. */
  amber: "#E0A63B",
  danger: "#E06B6B",
} as const;

/** Milestone bands. Internal only — never rendered as a word. */
export type MilestoneTier = "entry" | "established" | "senior";

export interface MilestoneStyle {
  readonly tier: MilestoneTier;
  /** Rim/rule colour for the recognition emblem. */
  readonly rim: string;
  readonly rimBright: string;
  /** Fill behind the emblem. */
  readonly field: string;
}

/**
 * Verified years → emblem treatment.
 *
 * Three bands rather than six, because six metals invite a reading of
 * "rank". Three reads as "this is a long-service marker", which is what it
 * is. The printed year count carries the precision.
 */
export function milestoneStyle(earnedYears: number | null): MilestoneStyle {
  if (earnedYears !== null && earnedYears >= 15) {
    return {
      tier: "senior",
      rim: TRUST_PALETTE.gold,
      rimBright: TRUST_PALETTE.goldBright,
      field: "rgba(183,146,85,0.14)",
    };
  }
  if (earnedYears !== null && earnedYears >= 5) {
    return {
      tier: "established",
      rim: TRUST_PALETTE.goldDim,
      rimBright: TRUST_PALETTE.gold,
      field: "rgba(183,146,85,0.10)",
    };
  }
  return {
    tier: "entry",
    rim: TRUST_PALETTE.blue,
    rimBright: TRUST_PALETTE.blueLuminous,
    field: "rgba(23,105,170,0.14)",
  };
}

export interface EvidenceStyle {
  /** Border colour. */
  readonly edge: string;
  /** Border style — the non-colour channel. */
  readonly edgeStyle: "solid" | "dashed";
  readonly fill: string;
  readonly text: string;
  /** True only for VERIFIED: the premium plate treatment. */
  readonly premium: boolean;
}

/**
 * Evidence level → plate treatment.
 *
 * Only VERIFIED receives metal. DOCUMENT PROVIDED is a solid, unmetalled
 * plate; SELF-DECLARED is a dashed outline. All three are legible and
 * dignified — a self-reported entry is genuinely useful information, and
 * making it look like a defect would push holders to overclaim.
 */
export function evidenceStyle(level: AssertionLevel): EvidenceStyle {
  switch (level) {
    case "verified":
      return {
        edge: TRUST_PALETTE.gold,
        edgeStyle: "solid",
        fill: "rgba(183,146,85,0.12)",
        text: TRUST_PALETTE.goldBright,
        premium: true,
      };
    case "document_provided":
      return {
        edge: TRUST_PALETTE.steel,
        edgeStyle: "solid",
        fill: "rgba(143,163,186,0.10)",
        text: TRUST_PALETTE.ink,
        premium: false,
      };
    case "self_declared":
      return {
        edge: TRUST_PALETTE.inkFaint,
        edgeStyle: "dashed",
        fill: "transparent",
        text: TRUST_PALETTE.inkMuted,
        premium: false,
      };
  }
}

/** Lifecycle states that must visibly qualify an otherwise premium item.
 *  Returns null for states that need no overlay. */
export function lifecycleOverlay(
  state: LifecycleState,
): { readonly edge: string; readonly text: string } | null {
  if (state === "expired") return { edge: TRUST_PALETTE.amber, text: TRUST_PALETTE.amber };
  if (state === "disputed") return { edge: TRUST_PALETTE.amber, text: TRUST_PALETTE.amber };
  if (state === "revoked") return { edge: TRUST_PALETTE.danger, text: TRUST_PALETTE.danger };
  if (state === "superseded") return { edge: TRUST_PALETTE.inkFaint, text: TRUST_PALETTE.inkMuted };
  return null;
}

/** The three card directions under review. */
export type CardDirection = "tenure-crest" | "collectible" | "signature";

export const CARD_DIRECTIONS: readonly CardDirection[] = [
  "tenure-crest",
  "collectible",
  "signature",
] as const;

/** Share/export formats. Pixel sizes are the real target dimensions; the
 *  review harness scales them down for display without changing layout, so
 *  what a reviewer sees is what an export would produce. */
export type ShareFormat = "square" | "story" | "og" | "compact";

export interface ShareFormatSpec {
  readonly id: ShareFormat;
  readonly width: number;
  readonly height: number;
  readonly labelKey: string;
}

export const SHARE_FORMATS: readonly ShareFormatSpec[] = [
  { id: "square", width: 1080, height: 1080, labelKey: "share.format.square" },
  { id: "story", width: 1080, height: 1920, labelKey: "share.format.story" },
  { id: "og", width: 1200, height: 630, labelKey: "share.format.og" },
  { id: "compact", width: 720, height: 400, labelKey: "share.format.compact" },
] as const;

export function shareFormat(id: ShareFormat): ShareFormatSpec {
  const found = SHARE_FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown share format: ${id}`);
  return found;
}
