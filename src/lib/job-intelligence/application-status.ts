// The employer's side of the application lifecycle, in one place.
//
// The persisted lifecycle is submitted / reviewing / interview / rejected /
// hired / withdrawn, and it does not change here: assessment progress is a
// SEPARATE lifecycle that the UI composes alongside this one, never merges
// into it. There is deliberately no `assessment_in_progress` in this file,
// because there is none in job_applications.status.
//
// Both the applications list and the candidate view offer status actions, and
// two copies of a transition table is how they eventually disagree — so the
// table lives here, once, and each surface renders it.

import type { TranslationKey } from "@/i18n/dictionaries";
import type { ApplicationStatus } from "./applications.functions";

export const APPLICATION_STATUS_LABEL_KEY: Record<ApplicationStatus, TranslationKey> = {
  submitted: "employer.applications.status.submitted",
  reviewing: "employer.applications.status.reviewing",
  interview: "employer.applications.status.interview",
  rejected: "employer.applications.status.rejected",
  hired: "employer.applications.status.hired",
  withdrawn: "employer.applications.status.withdrawn",
};

export type EmployerSettableStatus = "reviewing" | "interview" | "rejected" | "hired";

// Mirrors set_application_status()'s own employer-side transition allow-list
// exactly (supabase/migrations/20260720150000_h3_4a_candidate_application_
// core.sql) -- only ever offer a button for a transition the database will
// actually accept. An employer can therefore never be shown, or send,
// 'withdrawn': that is the candidate's own action.
export const EMPLOYER_NEXT_STATUSES: Partial<Record<ApplicationStatus, EmployerSettableStatus[]>> =
  {
    submitted: ["reviewing", "rejected"],
    reviewing: ["interview", "rejected"],
    interview: ["hired", "rejected"],
  };

export const APPLICATION_ACTION_LABEL_KEY: Record<EmployerSettableStatus, TranslationKey> = {
  reviewing: "employer.applications.action.markReviewing",
  interview: "employer.applications.action.markInterview",
  rejected: "employer.applications.action.markRejected",
  hired: "employer.applications.action.markHired",
};

/** A status column read back as `text` (the recruitment read models return
 *  text, not the enum) narrowed to the lifecycle this module can label.
 *
 *  Returns null for anything unrecognised rather than guessing. A status the
 *  database grows before this build knows about it must offer NO transitions —
 *  quietly mapping it onto a known one would show an employer a button the
 *  database is going to refuse. */
export function asApplicationStatus(value: string): ApplicationStatus | null {
  return value in APPLICATION_STATUS_LABEL_KEY ? (value as ApplicationStatus) : null;
}
