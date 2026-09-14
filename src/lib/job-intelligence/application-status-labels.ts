/**
 * One label per application status, for every surface that shows the
 * candidate their own applications.
 *
 * This map lived inside /my-career/applications as a route-local const.
 * Sketch 3 puts a summary of the same applications in the Jobs workspace,
 * which gave the map a second reader -- and a second copy of it is how the
 * two surfaces start disagreeing about what `interview` is called. One
 * definition, imported by both.
 *
 * TranslationKey rather than raw sv/en pairs: these keys already exist in
 * the dictionary and are typed, so a status added to the enum without a
 * label is a build error rather than a chip reading `hired` at a user.
 */
import type { TranslationKey } from "@/i18n/dictionaries";
import type { ApplicationStatus } from "./applications.functions";

export const APPLICATION_STATUS_LABEL_KEY: Record<ApplicationStatus, TranslationKey> = {
  submitted: "candidate.applications.status.submitted",
  reviewing: "candidate.applications.status.reviewing",
  interview: "candidate.applications.status.interview",
  rejected: "candidate.applications.status.rejected",
  hired: "candidate.applications.status.hired",
  withdrawn: "candidate.applications.status.withdrawn",
};
