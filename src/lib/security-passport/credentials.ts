// Security Passport — credential form rules.
//
// Pure domain: no Supabase, no React, no server. That is what lets the
// validation below run in the browser for instant feedback AND on the server
// before a write, from one definition rather than two that drift.
//
// ── WHY THE RULES ARE NOT LISTED HERE ──────────────────────────────────
//
// The obvious shape would be a table in this file saying "OV needs an end
// date, VU1 does not". It is deliberately absent. Those rules live in
// `sp_credential_types` and are enforced by a database trigger; restating
// them in TypeScript would create a second source of truth that agrees today
// and disagrees after the first INSERT adds a fifth credential.
//
// So every function here takes the taxonomy ROW and reads `category`,
// `requires_valid_until` and `requires_issuer` off it. Adding a credential to
// the database changes the forms with no code change, and the two can never
// contradict each other.
//
// ── WHY ERRORS ARE COPY KEYS ───────────────────────────────────────────
//
// Validation returns `PassportCopyKey`s, never sentences. The Passport is
// Swedish-first with enforced English parity, and a validation message is
// user-facing text — so it has to come from the copy module like everything
// else, and be resolved at render time in the reader's language.

import type { PassportCopyKey } from "./i18n";

/** The four launch credentials. A wider vocabulary is a database INSERT; this
 *  union exists only so the UI can be explicit about what it ships today. */
export type CredentialCode = "VU1" | "VU2" | "OV" | "SV";

export type CredentialCategory = "qualification" | "appointment";

/** One row of `sp_credential_types`, in domain terms.
 *
 *  Deliberately structural rather than imported from the generated database
 *  types: this module must stay free of any database dependency so the
 *  separation check keeps it out of the server tier. The server maps its rows
 *  onto this shape. */
export interface CredentialType {
  readonly code: string;
  readonly category: CredentialCategory;
  readonly claimType: string;
  readonly nameSv: string;
  readonly nameEn: string;
  readonly symbolLabel: string;
  readonly requiresValidUntil: boolean;
  readonly requiresIssuer: boolean;
}

/** What the holder types. Every field is optional at this stage — a draft is
 *  allowed to be incomplete, and completeness is decided by
 *  `validateCredential` at the moment it stops being a draft. */
export interface CredentialDraft {
  readonly credentialCode: string | null;
  readonly title: string;
  readonly issuerName: string;
  readonly jurisdictionCode: string;
  readonly issuedOn: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly credentialReference: string;
  readonly holderNote: string;
}

export function emptyCredentialDraft(): CredentialDraft {
  return {
    credentialCode: null,
    title: "",
    issuerName: "",
    jurisdictionCode: "SE",
    issuedOn: null,
    validFrom: null,
    validUntil: null,
    credentialReference: "",
    holderNote: "",
  };
}

/** Which fields a given credential actually asks for.
 *
 *  This is the progressive disclosure: an appointment asks who granted it and
 *  until when, a qualification asks who trained you and when you finished.
 *  Showing every field for every credential is how a form ends up asking a
 *  guard for the expiry date of a course that does not expire. */
export interface FieldVisibility {
  readonly issuer: boolean;
  readonly issuedOn: boolean;
  readonly validFrom: boolean;
  readonly validUntil: boolean;
  readonly reference: boolean;
}

export function fieldsFor(type: CredentialType): FieldVisibility {
  const isAppointment = type.category === "appointment";
  return {
    issuer: true,
    // A qualification is completed on a date; an appointment is decided on one.
    issuedOn: true,
    // Only meaningful when the document itself carries a separate start.
    validFrom: isAppointment,
    // Shown whenever the credential can expire at all. Required separately.
    validUntil: isAppointment || type.requiresValidUntil,
    reference: true,
  };
}

/** The label an appointment's issuer field should carry.
 *
 *  "Training provider" and "appointing authority" are not synonyms, and using
 *  the first for a förordnande would misdescribe what the holder is recording. */
export function issuerLabelKey(type: CredentialType): PassportCopyKey {
  return type.category === "appointment"
    ? "cred.field.appointingAuthority"
    : "cred.field.trainingProvider";
}

export function issuedOnLabelKey(type: CredentialType): PassportCopyKey {
  return type.category === "appointment" ? "cred.field.decidedOn" : "cred.field.completedOn";
}

export interface CredentialFieldError {
  readonly field: keyof CredentialDraft;
  readonly messageKey: PassportCopyKey;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Validates a credential the holder is trying to make real.
 *
 * `mode: "draft"` checks only what would be structurally impossible to store
 * — a malformed date, an over-long note. A draft is explicitly allowed to be
 * missing its mandatory fields, because that is what makes save-and-resume
 * work.
 *
 * `mode: "active"` additionally enforces the taxonomy's own requirements. The
 * database enforces these too, via trigger, for every caller; this runs first
 * so the holder gets a field-level message in their language instead of a
 * PostgREST error.
 */
export function validateCredential(
  draft: CredentialDraft,
  type: CredentialType | null,
  mode: "draft" | "active",
): readonly CredentialFieldError[] {
  const errors: CredentialFieldError[] = [];

  for (const [field, value] of [
    ["issuedOn", draft.issuedOn],
    ["validFrom", draft.validFrom],
    ["validUntil", draft.validUntil],
  ] as const) {
    if (value !== null && value !== "" && !ISO_DATE.test(value)) {
      errors.push({ field, messageKey: "cred.error.dateFormat" });
    }
  }

  if (draft.credentialReference.length > 120) {
    errors.push({ field: "credentialReference", messageKey: "cred.error.referenceTooLong" });
  }
  if (draft.holderNote.length > 2000) {
    errors.push({ field: "holderNote", messageKey: "cred.error.noteTooLong" });
  }

  // An end date before the start date is wrong in either mode: it is not an
  // incomplete draft, it is a contradiction.
  if (
    draft.validUntil &&
    ISO_DATE.test(draft.validUntil) &&
    draft.validFrom &&
    ISO_DATE.test(draft.validFrom) &&
    draft.validUntil < draft.validFrom
  ) {
    errors.push({ field: "validUntil", messageKey: "cred.error.endBeforeStart" });
  }

  if (mode === "draft") return errors;

  if (!type) {
    errors.push({ field: "credentialCode", messageKey: "cred.error.selectCredential" });
    return errors;
  }

  if (isBlank(draft.title)) {
    errors.push({ field: "title", messageKey: "cred.error.titleRequired" });
  }
  if (isBlank(draft.jurisdictionCode)) {
    errors.push({ field: "jurisdictionCode", messageKey: "cred.error.jurisdictionRequired" });
  }

  // Straight from the taxonomy row, not from a list in this file.
  if (type.requiresIssuer && isBlank(draft.issuerName)) {
    errors.push({
      field: "issuerName",
      messageKey: "cred.error.authorityRequired",
    });
  }
  if (type.requiresValidUntil && !draft.validUntil) {
    errors.push({ field: "validUntil", messageKey: "cred.error.validUntilRequired" });
  }

  return errors;
}

/** Whether this draft could be submitted for verification.
 *
 *  Verification is a request about a real claim, so an incomplete credential
 *  must not be able to enter the queue — the holder completes it first. */
export function canSubmitForVerification(
  draft: CredentialDraft,
  type: CredentialType | null,
): boolean {
  return validateCredential(draft, type, "active").length === 0;
}
