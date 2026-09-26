// Security Passport — the credential shield: scope and constellation rules.
//
// Pure. No React, no copy lookups beyond `passportT`, nothing fetched. Every
// surface that draws a shield — the holder's card, the share preview, the
// recipient page — resolves scope and picks its shields HERE, so none of them
// can disagree about which flag a credential wears or how many are shown.
//
// ── THE FLAG IS A CUE, THE TEXT IS THE FACT ────────────────────────────
//
// A flag says "somewhere in this country". A SIRA card is Dubai's, not the
// UAE's; an SIA licence is Great Britain's, not Northern Ireland's. So a scope
// always carries a written label, and the flag only ever comes from the
// COUNTRY part of the code. A reader who cannot see the flag loses nothing.
//
// ── GLOBAL IS DECLARED, NEVER INFERRED ─────────────────────────────────
//
// A credential is global when its DEFINITION says so (`isGlobalCertification`)
// and the caller passes `global: true`. A missing jurisdiction is NOT global:
// it is "not stated". Treating the two as one is how a row with a blank field
// would start wearing a globe, and a globe reads as "valid everywhere".

import { credentialMark } from "./credentials";
import { formatJurisdiction } from "./format";
import { passportT, type PassportLang } from "./i18n";
import type { CredentialPresentationState } from "./design/credential-symbols";

/** Countries this product can DRAW. A country outside this set still gets its
 *  written label and the generic marker — never a broken image. */
export const DRAWN_FLAGS = ["SE", "GB", "AE", "IN"] as const;
export type FlagCode = (typeof DRAWN_FLAGS)[number];

export type ScopeKind =
  /** The definition declares an international professional certification. */
  | "global"
  /** A named jurisdiction, with or without a flag this product can draw. */
  | "jurisdiction"
  /** Nobody stated where it applies. Not global. */
  | "not_stated";

export interface CredentialScope {
  readonly kind: ScopeKind;
  /** The exact stored code, sub-jurisdiction first. Null unless `jurisdiction`. */
  readonly code: string | null;
  /** Null for global, for not-stated, and for a country with no drawn flag. */
  readonly flag: FlagCode | null;
  /** The written scope. Always present; always what a screen reader hears. */
  readonly label: string;
}

export interface ScopeInput {
  /** From the credential DEFINITION. Never from the claim. */
  readonly global?: boolean;
  readonly jurisdictionCode?: string | null;
  readonly subJurisdictionCode?: string | null;
}

/** Scope labels that differ from the work-country label of the same code.
 *  An SIA licence covers Great Britain; the holder's work country may still
 *  read "United Kingdom". Everything else uses the shared formatter. */
const SCOPE_LABEL_KEY = { GB: "scope.GB" } as const;

export function resolveCredentialScope(input: ScopeInput, lang: PassportLang): CredentialScope {
  if (input.global === true) {
    return { kind: "global", code: null, flag: null, label: passportT("scope.global", lang) };
  }
  const code = (input.subJurisdictionCode || input.jurisdictionCode || "").trim().toUpperCase();
  if (!code) {
    return {
      kind: "not_stated",
      code: null,
      flag: null,
      label: passportT("scope.notStated", lang),
    };
  }
  const country = code.slice(0, 2);
  const flag = (DRAWN_FLAGS as readonly string[]).includes(country) ? (country as FlagCode) : null;
  const label =
    code in SCOPE_LABEL_KEY
      ? passportT(SCOPE_LABEL_KEY[code as keyof typeof SCOPE_LABEL_KEY], lang)
      : // Returns the code itself for a jurisdiction nobody has reviewed. A
        // visible "NO" is a bug report; an invented country name is not.
        formatJurisdiction(code, lang);
  return { kind: "jurisdiction", code, flag, label };
}

/**
 * The abbreviation on the shield.
 *
 * The governed table first. Where it has none — every GB and UAE credential
 * today — the only thing printed is an abbreviation ALREADY WRITTEN in the
 * credential's own name: a leading all-capitals token such as "SIA" or "SIRA".
 * Nothing is ever composed from initials ("SIA Licence — Security Guarding"
 * is not an "SLS"), and never from the database code — see
 * `credentialSymbolMarkup`. With neither, the shield carries no code and its
 * name stays in the label and in the row beneath the card.
 */
export function shieldMarkText(c: {
  readonly code: string | null;
  readonly name: string;
}): string | null {
  return (
    credentialMark(c.code) ??
    c.name.trim().match(/^[A-ZÅÄÖ][A-ZÅÄÖ0-9]{1,5}(?=$|[\s,:;–—-])/u)?.[0] ??
    null
  );
}

/* ------------------------------------------------------------------ */
/* Which shields a card shows                                          */
/* ------------------------------------------------------------------ */

/** The most a card ever draws. The card is a fixed identity object: a holder
 *  with thirty credentials gets the same card as a holder with four. */
export const SHIELD_SLOTS = 4;

export interface ShieldCandidate {
  readonly id: string;
  readonly state: CredentialPresentationState;
  /** The EFFECTIVE lifecycle, expiry already applied. */
  readonly lifecycle: string;
}

/** A shield means "holds this now". A draft is unfinished; an expired, revoked,
 *  superseded, disputed or archived record is history. None is current. */
export function isCurrentShield(candidate: Pick<ShieldCandidate, "lifecycle">): boolean {
  return candidate.lifecycle === "active";
}

/**
 * Trust standing only — NOT a ranking of professions or credentials.
 *
 * What was checked leads, because the card is the part people glance at. Inside
 * one standing the caller's own order is kept (the page's display order), so
 * this never decides that one credential matters more than another.
 */
const TRUST_ORDER: Readonly<Record<string, number>> = {
  verified: 0,
  documented: 1,
  under_review: 2,
  clarification_required: 2,
  self_declared: 3,
};

export interface Constellation<T> {
  readonly shown: readonly T[];
  /** Current credentials NOT drawn. Zero when everything fits. Counts only
   *  what was passed in — a shared view passes only what was disclosed, so
   *  this can never reveal the existence of an undisclosed credential. */
  readonly overflow: number;
}

export function constellationOf<T extends ShieldCandidate>(
  candidates: readonly T[],
): Constellation<T> {
  const current = candidates
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => isCurrentShield(c))
    .sort(
      (a, b) => (TRUST_ORDER[a.c.state] ?? 9) - (TRUST_ORDER[b.c.state] ?? 9) || a.index - b.index,
    )
    .map(({ c }) => c);
  if (current.length <= SHIELD_SLOTS) return { shown: current, overflow: 0 };
  // The fourth slot becomes the count, so the row never grows.
  const shown = current.slice(0, SHIELD_SLOTS - 1);
  return { shown, overflow: current.length - shown.length };
}
