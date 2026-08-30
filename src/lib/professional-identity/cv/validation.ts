// The anti-fabrication sweep.
//
// The schema (schema.ts) makes most fabrication structurally impossible by
// giving it nowhere to go. This file catches what is left: invention inside
// the free text the model IS allowed to write.
//
// Four checks, each aimed at a specific failure that has a real cost:
//
//   1. CITATION       every id the model names must be one we supplied. An
//                     id we did not supply is a fabricated reference, and it
//                     is the check that would catch a model quietly writing
//                     about an employment that is not in this person's
//                     history.
//
//   2. FABRICATED     a year in the prose that appears nowhere in the
//      DATES          person's real dates. "Since 2015" on a CV whose
//                     earliest employment starts in 2019 is an invented
//                     employment history, written in a field that was only
//                     supposed to summarise.
//
//   3. QUANTIFIED     "led a team of 12", "reduced incidents by 30%". The
//      ACHIEVEMENTS   product holds no team sizes and no percentages, so any
//                     that appear were invented — this is the single most
//                     common and most convincing CV fabrication, and it is
//                     also the easiest to detect precisely because we hold
//                     no such numbers to legitimise it.
//
//   4. VERIFICATION   "verifierad", "certified by", "godkänd av". Whether
//      LANGUAGE       something is verified is decided by the Passport and
//                     rendered from `CvFactClaim.verified`. A model must
//                     never be able to say it in prose, because prose is not
//                     checked by the thing that grants it.
//
// ── WHAT A FAILURE DOES ────────────────────────────────────────────────
//
// It rejects the RUN, not the field. There is no repair pass and no
// resample: rewriting a fabricated line until it passes is how a validator
// becomes a fabrication-laundering step. The caller falls back to the
// factual document and tells the person the assisted draft was rejected.
// That is the same "no semantic reroll" rule the interview adapter states,
// for the same reason.

import type { CvPresentation } from "./schema";
import { citableIds, type CvSourceBundle } from "./source-bundle";

export const CV_VALIDATION_VERSION = "cv-validation-v1" as const;

export type CvViolationKind =
  | "fabricated_citation"
  | "duplicate_citation"
  | "fabricated_date"
  | "quantified_achievement"
  | "verification_claim";

export interface CvViolation {
  readonly kind: CvViolationKind;
  /** Which field it was found in, for the rejection notice. */
  readonly field: string;
  /** The exact text that triggered it, so a human can judge the decision. */
  readonly trigger: string;
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/**
 * Words that assert somebody else checked this.
 *
 * Phrase-level where a bare word would be wrong: "certifiering" is the name
 * of a real section on this CV and "utbildning" is a claim type, so neither
 * can be a trigger. What is forbidden is the CLAIM — that a thing has been
 * verified, validated or approved by someone.
 */
const VERIFICATION_PHRASES: readonly string[] = [
  "verifierad",
  "verifierade",
  "verifierat",
  "validerad",
  "validerat",
  "godkänd av",
  "godkand av",
  "intygad",
  "kontrollerad av",
  "bekräftad av",
  "bekraftad av",
  "verified",
  "validated",
  "certified by",
  "approved by",
  "confirmed by",
  "attested",
  "vetted",
];

/** Years this product could plausibly be writing about. */
const YEAR_PATTERN = /\b(19\d{2}|20\d{2})\b/g;

/**
 * Numbers that make a claim about scale or effect.
 *
 * Deliberately NOT "any digit". A CV legitimately says "VU1" and "ISO 27001",
 * and quarantining those would make the feature unusable while catching
 * nothing. What is caught is a bare quantity next to a word that turns it
 * into an achievement, and a percentage in any position — the product holds
 * no percentages at all, so every one of them is invented.
 */
const PERCENTAGE_PATTERN = /\b\d{1,3}\s?%/g;

const QUANTITY_PHRASES: readonly RegExp[] = [
  // "team of 12", "grupp om 8", "ansvarade för 25 personer"
  /\bteam of \d+/gi,
  /\bgrupp (?:om|på) \d+/gi,
  /\b\d+\s+(?:personer|medarbetare|anställda|employees|staff members|direct reports)\b/gi,
  // "reduced X by 30", "ökade med 40"
  /\b(?:reduced|increased|improved|minskade|ökade|okade|förbättrade|forbattrade)\b[^.]{0,40}?\bby\s+\d+/gi,
  /\b(?:minskade|ökade|okade|förbättrade|forbattrade)\b[^.]{0,40}?\bmed\s+\d+/gi,
  // "över 500 incidenter", "more than 500 incidents"
  /\b(?:över|over|more than|fler än|fler an)\s+\d{2,}/gi,
];

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

/** Every 4-digit year that legitimately appears in this person's record. */
export function permittedYears(bundle: CvSourceBundle): ReadonlySet<string> {
  const years = new Set<string>();
  const take = (date: string | null | undefined) => {
    if (typeof date === "string" && /^\d{4}/.test(date)) years.add(date.slice(0, 4));
  };
  for (const e of bundle.employment) {
    take(e.startedOn);
    take(e.endedOn);
  }
  for (const group of [
    bundle.education,
    bundle.credentials,
    bundle.skills,
    bundle.languages,
  ]) {
    for (const c of group) {
      take(c.issuedOn);
      take(c.validUntil);
    }
  }
  return years;
}

function scanText(
  field: string,
  text: string,
  permitted: ReadonlySet<string>,
  out: CvViolation[],
): void {
  const lower = text.toLowerCase();

  for (const phrase of VERIFICATION_PHRASES) {
    if (lower.includes(phrase)) {
      out.push({ kind: "verification_claim", field, trigger: phrase });
    }
  }

  for (const match of text.matchAll(YEAR_PATTERN)) {
    if (!permitted.has(match[0])) {
      out.push({ kind: "fabricated_date", field, trigger: match[0] });
    }
  }

  for (const match of text.matchAll(PERCENTAGE_PATTERN)) {
    out.push({ kind: "quantified_achievement", field, trigger: match[0].trim() });
  }
  for (const pattern of QUANTITY_PHRASES) {
    for (const match of text.matchAll(pattern)) {
      out.push({ kind: "quantified_achievement", field, trigger: match[0].trim() });
    }
  }
}

/**
 * Check one generated presentation against the facts it was built from.
 *
 * Returns every violation rather than the first: a rejection notice that
 * names one problem invites a second run that hits the next one, and the
 * evaluation harness needs the whole picture.
 */
export function validateCvPresentation(
  presentation: CvPresentation,
  bundle: CvSourceBundle,
): readonly CvViolation[] {
  const violations: CvViolation[] = [];
  const allowed = citableIds(bundle);
  const employmentIds = new Set(bundle.employment.map((e) => e.id));
  const permitted = permittedYears(bundle);

  /* 1 · Citations ---------------------------------------------------- */

  const seen = new Set<string>();
  for (const item of presentation.experience) {
    if (!employmentIds.has(item.sourceId)) {
      violations.push({
        kind: "fabricated_citation",
        field: "experience.sourceId",
        trigger: item.sourceId,
      });
      continue;
    }
    if (seen.has(item.sourceId)) {
      // One employment, presented twice, is one employment turned into two.
      violations.push({
        kind: "duplicate_citation",
        field: "experience.sourceId",
        trigger: item.sourceId,
      });
    }
    seen.add(item.sourceId);
  }

  for (const id of presentation.emphasisedClaimIds) {
    if (!allowed.has(id)) {
      violations.push({
        kind: "fabricated_citation",
        field: "emphasisedClaimIds",
        trigger: id,
      });
    }
  }

  /* 2–4 · Free text -------------------------------------------------- */

  scanText("headline", presentation.headline, permitted, violations);
  scanText("summary", presentation.summary, permitted, violations);
  scanText("tailoringRationale", presentation.tailoringRationale, permitted, violations);
  for (const item of presentation.experience) {
    item.bullets.forEach((bullet, i) =>
      scanText(`experience[${item.sourceId}].bullets[${i}]`, bullet, permitted, violations),
    );
  }

  return violations;
}
