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

import { isCalendarDate, isFutureDate } from "./dates";
import type { PassportCopyKey } from "./i18n";

/** The four launch credentials. A wider vocabulary is a database INSERT; this
 *  union exists only so the UI can be explicit about what it ships today. */
export type CredentialCode = "VU1" | "VU2" | "OV" | "SV";

/**
 * The longest credential code the database will accept.
 *
 * ── WHY THIS IS A CONSTANT AND NOT A LITERAL ───────────────────────────
 *
 * `sp_credential_types_code_check` is `^[A-Z0-9_]{2,48}$`, relaxed from the
 * original 16 by 20260907091000 because `SE_PERSONNEL_APPROVAL` is 21
 * characters and `AE_DU_PEOPLE_OF_DETERMINATION` is 29.
 *
 * The Zod schemas that guard the write paths kept the old 16. The result was
 * not theoretical: `SE_PERSONNEL_APPROVAL` ships ACTIVE in Sweden, so a
 * credential the product offers could not be recorded — the client refused it
 * before the database ever saw it. Every UK and UAE code would have hit the
 * same wall.
 *
 * One exported constant, used by every layer, and
 * `scripts/passport-credential-form-check.ts` parses the CHECK out of the
 * migration and fails the build if the two ever disagree again.
 */
export const CREDENTIAL_CODE_MAX_LENGTH = 48;

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
  /** The authorisation is limited to an employer, principal or protected
   *  object. A skyddsvakt approval shown without one reads as a general
   *  national licence. */
  readonly requiresScope: boolean;
  /** The credential may only ever carry a controlled result: no holder note,
   *  and the taxonomy's own label as the title. For facts whose underlying
   *  material — a register check, a fitness certificate — must never enter the
   *  Passport at all. */
  readonly narrowResultOnly: boolean;
  /** Whether the HOLDER supplies this credential's name.
   *
   *  ── WHY THIS IS DATA AND NOT A RULE IN THIS FILE ───────────────────────
   *
   *  A tester selected Skyddsvaktsförordnande and typed "Bajskorv" into
   *  Benämning, and it saved. The name of a regulated authorisation is the one
   *  thing a governed vocabulary exists to control, and it was the one field
   *  the holder could write freely — the controlled-label rule reached only
   *  `narrowResultOnly` credentials, which the skyddsvakt appointment is not.
   *
   *  `false` for every credential shipped today, from the column's DEFAULT, so
   *  a credential added later is controlled unless somebody deliberately says
   *  otherwise. Reserved for a future "other training / other certificate"
   *  type whose entire point is that the holder names it. */
  readonly titleIsHolderWritten: boolean;
  /** Where the credential itself belongs — NOT where its holder works.
   *
   *  A Swedish VU1 is a Swedish credential for a guard who has moved to Dubai,
   *  and this is the field that keeps saying so. The database already pins it
   *  (`SP_CREDENTIAL_JURISDICTION_MISMATCH`); carrying it into the domain type
   *  is what lets the form STATE the jurisdiction instead of asking the holder
   *  to choose one. */
  readonly jurisdictionCode: string | null;
  /** The emirate or region, where the authority is not national. `AE-DU` for a
   *  Dubai credential; NULL everywhere the regulator is the country. */
  readonly subJurisdictionCode: string | null;
}

/** The name a governed credential must carry, in the reader's language.
 *
 *  Both language forms are the credential's real name and the database accepts
 *  either, so the holder reads Swedish in Swedish and English in English
 *  without the stored value becoming free text. */
export function controlledTitle(type: CredentialType, lang: "sv" | "en"): string {
  return lang === "sv" ? type.nameSv : type.nameEn;
}

/**
 * The governed four-character mark a credential's symbol plate carries.
 *
 * ── WHY A RESOLVER AND NOT A FALLBACK TO THE CODE ──────────────────────
 *
 * The plate used to default to the credential CODE when no caller supplied a
 * label, truncated to the four characters the plate can hold. That was
 * invisible while the only credentials were VU1, VU2, OV and SV, whose
 * `symbol_label` happens to equal their code. The Swedish truth model
 * (20260907091000) added four whose codes are nothing a reader should see,
 * and the private overview, the Passport Card, the recipient page and the
 * exported social frame all render a claim WITHOUT a label in hand:
 *
 *     SE_PERSONNEL_APPROVAL -> "SE_P"     OV_TRAINING  -> "OV_T"
 *     OV_REFRESHER          -> "OV_R"     OV_TRANSPORT -> "OV_T"
 *
 * Two separate credentials wearing the identical mark, and every one of them
 * a database enum fragment printed onto the surface a candidate screenshots
 * and sends to an employer.
 *
 * So the code is never the mark. `symbol_label` is a governed column and this
 * is the one place a code becomes one without a database read
 * (`scripts/passport-credential-form-check.ts` pins these against the seed).
 *
 * ── WHY NULL RATHER THAN A GUESS ───────────────────────────────────────
 *
 * A code with no governed mark returns null, and the symbol renders its
 * neutral document device with no plate text at all. Deriving four characters
 * from an unreviewed code is how the leak happened in the first place: the
 * mark is a designed abbreviation of a credential somebody approved, not a
 * substring of its identifier. Nothing here invents one.
 */
const CREDENTIAL_MARKS: Readonly<Record<string, string>> = {
  VU1: "VU1",
  VU2: "VU2",
  OV: "OV",
  SV: "SV",
  OV_TRAINING: "OVU",
  OV_REFRESHER: "OVF",
  OV_TRANSPORT: "OVT",
  SE_PERSONNEL_APPROVAL: "PG",
};

export function credentialMark(code: string | null | undefined): string | null {
  if (!code) return null;
  return CREDENTIAL_MARKS[code] ?? null;
}

/** Whether the definition owns this credential's title rather than the holder.
 *
 *  A narrow-result credential is controlled regardless of the column, for the
 *  same reason it accepts no holder note: what it records is a checked result,
 *  and every free-text field on it is somewhere the underlying material could
 *  arrive. */
export function titleIsControlled(type: CredentialType): boolean {
  return type.narrowResultOnly || !type.titleIsHolderWritten;
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
  readonly authorisationScope: string;
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
    authorisationScope: "",
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
  /** What the authorisation is limited to. */
  readonly scope: boolean;
  /** A narrow-result credential asks for neither, and the database refuses
   *  both. Hiding them is not cosmetic: a form that offers a note the server
   *  will reject teaches the holder to write one. */
  readonly title: boolean;
  readonly note: boolean;
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
    scope: type.requiresScope,
    // Whether the title is an INPUT. A controlled title is still shown — as
    // the derived value it is — because hiding the credential's own name would
    // leave the holder unable to see what they had chosen.
    title: !titleIsControlled(type),
    note: !type.narrowResultOnly,
  };
}

/**
 * Drops every value the chosen credential does not ask for.
 *
 * ── WHY A HIDDEN FIELD IS NOT AN EMPTY ONE ─────────────────────────────
 *
 * `fieldsFor` decides what the form SHOWS. It does not decide what the draft
 * CARRIES, and until this existed those were different things: a holder who
 * filled in a skyddsvakt scope and an end date, then changed their mind and
 * picked VU1, still had both in the draft. The scope field was hidden. The
 * value was submitted.
 *
 * The consequences were not cosmetic. A VU1 would have been written with a
 * `valid_until` — a fabricated expiry on a course that has none — and with an
 * `authorisation_scope` describing an authorisation it is not. Switching to a
 * narrow-result credential was worse: the retained note is refused by both the
 * validator and the database, so the holder saw an error about a field the
 * form was no longer showing them.
 *
 * Applied on the switch AND again on the server before the write, so a stale
 * value cannot reach the database through a caller that skipped the form.
 */
export function clearIncompatible(draft: CredentialDraft, type: CredentialType): CredentialDraft {
  const fields = fieldsFor(type);
  return {
    ...draft,
    issuerName: fields.issuer ? draft.issuerName : "",
    issuedOn: fields.issuedOn ? draft.issuedOn : null,
    validFrom: fields.validFrom ? draft.validFrom : null,
    validUntil: fields.validUntil ? draft.validUntil : null,
    credentialReference: fields.reference ? draft.credentialReference : "",
    authorisationScope: fields.scope ? draft.authorisationScope : "",
    holderNote: fields.note ? draft.holderNote : "",
    // A governed credential's title is not the holder's to choose, so switching
    // to one SETS the controlled label rather than blanking it or leaving the
    // previous credential's name behind. This once applied only to
    // narrow-result credentials; it now applies wherever the definition owns
    // the name, because `fieldsFor` reads `titleIsControlled`.
    //
    // The first version left it alone, reasoning that the write path supplies
    // the label anyway. It does — but `validateCredential` runs first and
    // refuses a title that is not the controlled one, so a switch away from
    // Skyddsvaktsförordnande produced SP_CREDENTIAL_INVALID on a field the
    // form was no longer showing. The guard caught it.
    title: fields.title ? draft.title : type.nameSv,
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

/** A real calendar date, not merely a well-shaped string.
 *
 *  This used to be `/^\d{4}-\d{2}-\d{2}$/`, which accepts 2026-13-45. See
 *  ./dates.ts for the whole account of why a shape check was not enough and
 *  what replaced it. Kept under the same name so every existing call site
 *  reads the same and none was missed. */
const ISO_DATE = { test: (v: string) => isCalendarDate(v) };

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

  // A course completed, or an authority's decision taken, in the FUTURE is
  // not an incomplete draft -- it is a claim about something that has not
  // happened, so it is refused in both modes.
  //
  // Deliberately NOT applied to validFrom or validUntil: a validity window
  // is supposed to run into the future, and an appointment that expires next
  // year is the normal case, not an error.
  if (draft.issuedOn && isFutureDate(draft.issuedOn)) {
    errors.push({ field: "issuedOn", messageKey: "cred.error.dateFuture" });
  }

  if (draft.credentialReference.length > 120) {
    errors.push({ field: "credentialReference", messageKey: "cred.error.referenceTooLong" });
  }
  if (draft.holderNote.length > 2000) {
    errors.push({ field: "holderNote", messageKey: "cred.error.noteTooLong" });
  }

  // An end date that does not come after the start date is wrong in either
  // mode: it is not an incomplete draft, it is a contradiction.
  //
  // The comparison is `<=`, not `<`, to mirror the database exactly:
  //
  //     sp_claim_validity_ordered
  //       CHECK (valid_until IS NULL OR valid_from IS NULL
  //              OR valid_until > valid_from)
  //
  // is STRICT. While this read `<`, two equal dates passed the form, reached
  // the insert, and came back as the constraint violation's generic
  // "Something went wrong. Please try again." — the holder was told nothing
  // about which field was wrong or why. The database stays as the last line of
  // defence; it is no longer the FIRST thing to notice.
  if (
    draft.validUntil &&
    ISO_DATE.test(draft.validUntil) &&
    draft.validFrom &&
    ISO_DATE.test(draft.validFrom) &&
    draft.validUntil <= draft.validFrom
  ) {
    errors.push({ field: "validUntil", messageKey: "cred.error.endBeforeStart" });
  }

  // The narrow-result rules are checked BEFORE the draft exemption, because
  // the database checks them on a draft too — a draft that has already stored
  // register commentary has already done the harm. Validating them only at
  // submit would mean the form accepts a note the server then refuses, which
  // is how a holder learns to write one.
  if (type?.narrowResultOnly && !isBlank(draft.holderNote)) {
    errors.push({ field: "holderNote", messageKey: "cred.error.noNoteAllowed" });
  }

  // The controlled title, checked in BOTH modes and for every governed
  // credential rather than only the narrow-result ones — the gap that let
  // "Bajskorv" onto a skyddsvakt appointment. The database refuses the same
  // write for every caller; this runs first so the holder gets a field-level
  // message in their own language instead of a 23514.
  if (
    type &&
    titleIsControlled(type) &&
    !isBlank(draft.title) &&
    draft.title.trim() !== type.nameSv &&
    draft.title.trim() !== type.nameEn
  ) {
    errors.push({ field: "title", messageKey: "cred.error.controlledLabelOnly" });
  }

  if (mode === "draft") return errors;

  if (!type) {
    errors.push({ field: "credentialCode", messageKey: "cred.error.selectCredential" });
    return errors;
  }

  // Asked only of a title the holder actually supplies. A controlled title is
  // never blank by the time it is written — `clearIncompatible` sets it and the
  // write path sets it again — so demanding one here would demand it of a field
  // the form does not offer.
  if (isBlank(draft.title) && !titleIsControlled(type)) {
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
  if (type.requiresScope && isBlank(draft.authorisationScope)) {
    errors.push({ field: "authorisationScope", messageKey: "cred.error.scopeRequired" });
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
