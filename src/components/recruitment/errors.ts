// Server error codes, as sentences a recruiter can act on.
//
// Every code the recruitment functions throw has its own line; anything else
// falls back to one generic, translated sentence. Raw server text never
// renders.

import type { TranslationKey } from "@/i18n/dictionaries";

const MAP: Record<string, TranslationKey> = {
  RECRUITMENT_NOT_FOUND: "rec.error.notFound",
  APPLICATION_NOT_FOUND: "rec.error.notFound",
  RECRUITMENT_NOT_PERMITTED: "rec.error.notPermitted",
  RECRUITMENT_DECISION_NOT_PERMITTED: "rec.error.decisionNotPermitted",
  RECRUITMENT_COMPLETED: "rec.error.completed",
  RECRUITMENT_STILL_ACCEPTING: "rec.error.stillAccepting",
  RECRUITMENT_HAS_UNRESOLVED: "rec.error.unresolved",
  RECRUITMENT_ALREADY_COMPLETED: "rec.error.alreadyCompleted",
  RECRUITMENT_NOT_COMPLETED: "rec.error.notCompleted",
  RESPONSIBLE_NOT_A_MEMBER: "rec.error.notMember",
  STALE_VERSION: "rec.error.stale",
  STALE_APPLICATION_STAGE: "rec.error.staleStage",
  INVALID_TRANSITION: "rec.error.invalidTransition",
  INVALID_APPLICATION_TRANSITION: "rec.error.invalidTransition",
  APPLICATION_NOT_OPEN: "rec.error.applicationClosed",
  VACANCY_STRUCTURE_LOCKED: "rec.error.structureLocked",
  VACANCY_STRUCTURE_INVALID: "rec.error.structureInvalid",
  BOOKING_NOT_FOUND: "rec.error.notFound",
  BOOKING_NOT_EDITABLE: "rec.error.bookingNotEditable",
  BOOKING_TIMEZONE_INVALID: "rec.error.timezone",
  BOOKING_LOCATION_MISSING: "rec.error.bookingLocation",
  MESSAGE_NOT_FOUND: "rec.error.notFound",
  MESSAGE_NOT_EDITABLE: "rec.error.messageNotEditable",
  MESSAGE_KEY_REUSED: "rec.error.generic",
};

export function recruitmentErrorKey(code: string | null | undefined): TranslationKey {
  if (code && MAP[code]) return MAP[code];
  if (code && /fetch|network|Failed to fetch/i.test(code)) return "rec.error.network";
  if (code && /Unauthorized|JWT|session|401/i.test(code)) return "rec.error.session";
  return "rec.error.generic";
}
