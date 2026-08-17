// Security Passport — the CQrityjob credential symbols.
//
// ── FOUR ORIGINAL MARKS, ONE FAMILY ────────────────────────────────────
//
// Each supported credential gets an original CQrityjob mark: a small navy
// plate in the Passport's engraved security-document vocabulary, carrying a
// geometric device and the credential's short label. The devices are
// abstract on purpose:
//
//   VU1 — a single ascending chevron: the first completed training step.
//   VU2 — a doubled chevron: the continuation built on the first.
//   OV  — a hexagon with a fixed centre: order held around a point.
//   SV  — nested squares: a guarded perimeter around a protected object.
//
// None of this borrows from police, government, heraldic or uniform
// insignia — no crown, no wreath, no star, no eagle, no three-crowns motif,
// and no shield (the drawn shield outline belongs to the CQrityjob brand
// mark alone). The vocabulary is the Passport's own: hairline engraving,
// one metal, and words.
//
// ── STATUS IS SHAPE + GLYPH + WORD, NEVER ONLY COLOUR ──────────────────
//
// Every presentation state changes at least three channels at once: the
// plate's border STYLE (dashed / solid / doubled), a corner status GLYPH
// (check, document, warning triangle, question, cross, arrow), and the
// WORD rendered beside the symbol by every consuming surface. Colour is the
// fourth channel, never the first. A greyscale print of any card still
// reads correctly.
//
// Only `approved` — a VERIFIED credential whose lifecycle is currently
// ACTIVE — receives the full treatment: gold, the doubled rim and the check
// seal. An expired or disputed credential keeps its dignity but visibly is
// not current, which is the single most important honesty property of the
// whole symbol system.
//
// ── WHY THE MARKUP IS A STRING, NOT A COMPONENT ────────────────────────
//
// The same drawing must appear in React surfaces AND inside the exported
// social PNGs, which are assembled as self-contained SVG strings in
// social-export.ts. One geometry builder that returns an SVG fragment
// serves both, so the symbol on a downloaded card is pixel-identical to
// the one reviewed on screen. The React wrapper lives in
// components/security-passport/CredentialSymbol.tsx.

import type { AssertionLevel, LifecycleState } from "../types";
import type { PassportCopyKey } from "../i18n";
import { TRUST_PALETTE } from "./trust-system";

/* ------------------------------------------------------------------ */
/* Presentation state                                                  */
/* ------------------------------------------------------------------ */

/** The eight ways a credential can present. Derived from the two stored
 *  axes — never stored itself, and never settable by the holder. */
export type CredentialPresentationState =
  | "draft"
  | "self_declared"
  | "documented"
  | "approved"
  | "expired"
  | "revoked"
  | "superseded"
  | "disputed";

/**
 * Two axes in, one presentation out.
 *
 * Callers pass the EFFECTIVE lifecycle (from validityOf), so a stored-active
 * appointment whose valid-until has passed arrives here as "expired" and can
 * never take the approved treatment. Lifecycle qualifications always win
 * over evidence level: a revoked verified licence presents as revoked.
 */
export function credentialPresentation(
  assertionLevel: AssertionLevel,
  effectiveLifecycle: LifecycleState,
): CredentialPresentationState {
  switch (effectiveLifecycle) {
    case "draft":
      return "draft";
    case "expired":
      return "expired";
    case "revoked":
      return "revoked";
    case "superseded":
      return "superseded";
    case "disputed":
      return "disputed";
    case "active":
      break;
  }
  if (assertionLevel === "verified") return "approved";
  if (assertionLevel === "document_provided") return "documented";
  return "self_declared";
}

/** The one word each presentation carries. Reuses the established assertion
 *  and lifecycle vocabulary so the symbol system cannot drift from the rest
 *  of the product. */
export function presentationWordKey(state: CredentialPresentationState): PassportCopyKey {
  switch (state) {
    case "draft":
      return "lifecycle.draft";
    case "self_declared":
      return "assertion.self_declared";
    case "documented":
      return "assertion.document_provided";
    case "approved":
      return "assertion.verified";
    case "expired":
      return "lifecycle.expired";
    case "revoked":
      return "lifecycle.revoked";
    case "superseded":
      return "lifecycle.superseded";
    case "disputed":
      return "lifecycle.disputed";
  }
}

/* ------------------------------------------------------------------ */
/* Treatment tokens                                                    */
/* ------------------------------------------------------------------ */

type StatusGlyph = "check" | "document" | "warning" | "question" | "cross" | "arrow" | null;

export interface SymbolTreatment {
  /** Plate border colour. */
  readonly edge: string;
  /** Dash pattern, or null for solid. The non-colour border channel. */
  readonly dash: string | null;
  /** True adds the doubled inner rim — reserved for `approved`. */
  readonly doubleRim: boolean;
  /** Device and label tone. */
  readonly device: string;
  readonly label: string;
  /** Corner status glyph — the second non-colour channel. */
  readonly glyph: StatusGlyph;
  readonly glyphTone: string;
  /** Whole-mark opacity. Superseded history fades; nothing else does. */
  readonly opacity: number;
  /** Diagonal void stroke across the plate. Revoked only. */
  readonly strike: boolean;
}

export function symbolTreatment(state: CredentialPresentationState): SymbolTreatment {
  switch (state) {
    case "approved":
      return {
        edge: TRUST_PALETTE.gold,
        dash: null,
        doubleRim: true,
        device: TRUST_PALETTE.goldBright,
        label: TRUST_PALETTE.goldBright,
        glyph: "check",
        glyphTone: TRUST_PALETTE.goldBright,
        opacity: 1,
        strike: false,
      };
    case "documented":
      return {
        edge: TRUST_PALETTE.steel,
        dash: null,
        doubleRim: false,
        device: TRUST_PALETTE.ink,
        label: TRUST_PALETTE.ink,
        glyph: "document",
        glyphTone: TRUST_PALETTE.steel,
        opacity: 1,
        strike: false,
      };
    case "self_declared":
      return {
        edge: TRUST_PALETTE.inkFaint,
        dash: "3.2 2.4",
        doubleRim: false,
        device: TRUST_PALETTE.inkMuted,
        label: TRUST_PALETTE.ink,
        glyph: null,
        glyphTone: TRUST_PALETTE.inkFaint,
        opacity: 1,
        strike: false,
      };
    case "draft":
      return {
        edge: TRUST_PALETTE.inkFaint,
        dash: "1.4 2.6",
        doubleRim: false,
        device: TRUST_PALETTE.inkFaint,
        label: TRUST_PALETTE.inkMuted,
        glyph: null,
        glyphTone: TRUST_PALETTE.inkFaint,
        opacity: 0.9,
        strike: false,
      };
    case "expired":
      return {
        edge: TRUST_PALETTE.amber,
        dash: null,
        doubleRim: false,
        device: TRUST_PALETTE.inkMuted,
        label: TRUST_PALETTE.amber,
        glyph: "warning",
        glyphTone: TRUST_PALETTE.amber,
        opacity: 1,
        strike: false,
      };
    case "disputed":
      return {
        edge: TRUST_PALETTE.amber,
        dash: "5 2.2",
        doubleRim: false,
        device: TRUST_PALETTE.inkMuted,
        label: TRUST_PALETTE.amber,
        glyph: "question",
        glyphTone: TRUST_PALETTE.amber,
        opacity: 1,
        strike: false,
      };
    case "revoked":
      return {
        edge: TRUST_PALETTE.danger,
        dash: null,
        doubleRim: false,
        device: TRUST_PALETTE.inkFaint,
        label: TRUST_PALETTE.danger,
        glyph: "cross",
        glyphTone: TRUST_PALETTE.danger,
        opacity: 1,
        strike: true,
      };
    case "superseded":
      return {
        edge: TRUST_PALETTE.inkFaint,
        dash: null,
        doubleRim: false,
        device: TRUST_PALETTE.inkFaint,
        label: TRUST_PALETTE.inkMuted,
        glyph: "arrow",
        glyphTone: TRUST_PALETTE.inkFaint,
        opacity: 0.62,
        strike: false,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** The canvas every symbol is drawn on. Consumers scale the viewBox. */
export const SYMBOL_VIEWBOX = 44;

const FONT_STACK =
  "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, -apple-system, sans-serif";

/** The four launch devices. An unknown code falls back to the neutral
 *  document device, so a free-text credential still gets a coherent mark. */
function devicePath(code: string | null): string {
  const stroke = (d: string, w = 2) =>
    `<path d="${d}" fill="none" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (code) {
    case "VU1":
      // One ascending chevron over a baseline: the first completed step.
      return stroke("M13.5 21.5 L22 13 L30.5 21.5") + stroke("M15.5 25 L28.5 25", 1.2);
    case "VU2":
      // The doubled chevron: continuation built on the first.
      return stroke("M13.5 24 L22 15.5 L30.5 24") + stroke("M13.5 17.5 L22 9 L30.5 17.5");
    case "OV": {
      // Flat-top hexagon with a held centre: order around a point.
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return `${(22 + Math.cos(a) * 8.4).toFixed(2)} ${(17 + Math.sin(a) * 8.4).toFixed(2)}`;
      }).join(" L");
      return stroke(`M${pts} Z`) + `<circle cx="22" cy="17" r="1.7" stroke="none"/>`;
    }
    case "SV":
      // Nested squares: a guarded perimeter around a protected object.
      return (
        stroke("M14 9 H30 V25 H14 Z") +
        stroke("M18.5 13.5 H25.5 V20.5 H18.5 Z", 1.5) +
        `<circle cx="22" cy="17" r="1.1" stroke="none"/>`
      );
    default:
      // Neutral: an engraved document sheet.
      return (
        stroke("M15.5 9.5 H25.5 L28.5 12.5 V24.5 H15.5 Z", 1.7) +
        stroke("M18.5 15 H25.5", 1.2) +
        stroke("M18.5 18.2 H25.5", 1.2) +
        stroke("M18.5 21.4 H23", 1.2)
      );
  }
}

/** Corner status glyph, drawn — never a font character, so it cannot fall
 *  back to a missing glyph box inside an exported PNG. */
function glyphMarkup(glyph: StatusGlyph, tone: string): string {
  if (!glyph) return "";
  const cx = 35;
  const cy = 9;
  const r = 6.2;
  const disc =
    glyph === "check"
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${tone}" stroke="${TRUST_PALETTE.navyDeep}" stroke-width="1"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TRUST_PALETTE.navyDeep}" stroke="${tone}" stroke-width="1.3"/>`;
  const stroke = (d: string, w = 1.7, t = tone) =>
    `<path d="${d}" fill="none" stroke="${t}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (glyph) {
    case "check":
      return disc + stroke("M32.4 9.1 L34.3 11 L37.7 7.2", 1.9, TRUST_PALETTE.navyDeep);
    case "document":
      return disc + stroke("M33 6.2 H36.2 V12 H33 Z", 1.1) + stroke("M34 8.2 H35.4", 0.9);
    case "warning":
      return (
        `<path d="M${cx} ${cy - 5.6} L${cx + 5.6} ${cy + 4.4} H${cx - 5.6} Z" fill="${TRUST_PALETTE.navyDeep}" stroke="${tone}" stroke-width="1.3" stroke-linejoin="round"/>` +
        stroke(`M${cx} ${cy - 2.4} V${cy + 0.8}`, 1.5) +
        `<circle cx="${cx}" cy="${cy + 2.9}" r="0.85" fill="${tone}"/>`
      );
    case "question":
      return (
        disc +
        stroke(`M${cx - 1.9} ${cy - 1.6} a1.9 1.9 0 1 1 2.6 1.8 c-0.5 0.25 -0.7 0.6 -0.7 1.2`, 1.4) +
        `<circle cx="${cx}" cy="${cy + 3.1}" r="0.8" fill="${tone}"/>`
      );
    case "cross":
      return disc + stroke(`M${cx - 2.3} ${cy - 2.3} L${cx + 2.3} ${cy + 2.3}`) +
        stroke(`M${cx + 2.3} ${cy - 2.3} L${cx - 2.3} ${cy + 2.3}`);
    case "arrow":
      return disc + stroke(`M${cx - 2.8} ${cy} H${cx + 2.4}`) +
        stroke(`M${cx + 0.4} ${cy - 2.2} L${cx + 2.6} ${cy} L${cx + 0.4} ${cy + 2.2}`);
  }
}

/**
 * The full symbol as an SVG fragment for a `0 0 44 44` viewBox.
 *
 * Self-contained: no defs, no gradients, no external references — the same
 * string works inside a React `<svg>` and inside the exported social SVG.
 * The plate carries its own navy ground so the mark is legible on any
 * surface, light or dark.
 */
export function credentialSymbolMarkup(
  code: string | null,
  state: CredentialPresentationState,
  /** Text on the plate. Defaults to the code; taxonomy rows carry
   *  `symbol_label` for this. Max four characters by database CHECK. */
  label?: string,
): string {
  const t = symbolTreatment(state);
  const text = (label ?? code ?? "—").slice(0, 4).toUpperCase();
  const dash = t.dash ? ` stroke-dasharray="${t.dash}"` : "";

  const parts: string[] = [
    `<g opacity="${t.opacity}">`,
    // The plate: its own navy ground, engraved inner hairline.
    `<rect x="1.6" y="1.6" width="40.8" height="40.8" rx="9.4" fill="${TRUST_PALETTE.navy}" stroke="${t.edge}" stroke-width="1.6"${dash}/>`,
    `<rect x="4.6" y="4.6" width="34.8" height="34.8" rx="6.8" fill="none" stroke="${t.edge}" stroke-opacity="0.28" stroke-width="0.7"/>`,
  ];

  if (t.doubleRim) {
    // The approved rim: one extra bright hairline, the only doubled border
    // in the system. Restrained metal, not a glow.
    parts.push(
      `<rect x="3.1" y="3.1" width="37.8" height="37.8" rx="8.1" fill="none" stroke="${TRUST_PALETTE.goldBright}" stroke-opacity="0.55" stroke-width="0.8"/>`,
    );
  }

  // fill as well as stroke: the OV/SV centre dots are stroke-less circles
  // that inherit the group fill, and an unset fill would default to black.
  parts.push(`<g stroke="${t.device}" fill="${t.device}">${devicePath(code)}</g>`);

  parts.push(
    `<text x="22" y="36.4" text-anchor="middle" font-family="${FONT_STACK}" font-size="8.6" font-weight="700" letter-spacing="1.1" fill="${t.label}">${text}</text>`,
  );

  if (t.strike) {
    // The void stroke: unmistakable in greyscale, and it crosses the label
    // on purpose — a revoked credential is cancelled, not annotated.
    parts.push(
      `<path d="M6.5 37.5 L37.5 6.5" stroke="${t.edge}" stroke-width="1.9" stroke-linecap="round" opacity="0.9"/>`,
    );
  }

  parts.push(glyphMarkup(t.glyph, t.glyphTone));
  parts.push("</g>");
  return parts.join("");
}

/** Every state, for harness matrices and checks. */
export const CREDENTIAL_PRESENTATION_STATES: readonly CredentialPresentationState[] = [
  "draft",
  "self_declared",
  "documented",
  "approved",
  "expired",
  "revoked",
  "superseded",
  "disputed",
] as const;

/** The four launch codes with drawn devices. */
export const SYMBOL_CODES: readonly string[] = ["VU1", "VU2", "OV", "SV"] as const;
