// What a start may answer, as the app shows it.
//
// Which guide and test belong to a setup is decided in ONE place: the
// database (scp_recruitment_content_links, verified by scp_iv_start_interview
// and listed by scp_iv_start_choices). This module holds no routing of its
// own -- only the shapes, and the mapping from the database's refusal codes to
// the sentence the employer reads.

import type { EnvironmentKey, RoleGroup, RoleProfileKey } from "@/lib/library/catalogue";

export interface StartSetup {
  readonly roleGroup: RoleGroup;
  readonly roleProfile: RoleProfileKey;
  readonly environment: EnvironmentKey;
}

export type StartRefusal =
  | "setup_already_recorded"
  | "no_role_content"
  | "environment_without_content"
  | "setup_test_mismatch"
  | "guide_mismatch"
  | "no_setup_for_test"
  | "test_not_on_application"
  | "beskt_not_submitted";

/** The database's refusal codes that are an answer for the employer rather
 *  than a fault. Anything else is thrown and shown as an error. */
const REFUSALS: ReadonlyArray<readonly [string, StartRefusal]> = [
  ["SCP_SETUP_ALREADY_RECORDED", "setup_already_recorded"],
  ["SCP_START_SETUP_INCOMPATIBLE", "no_role_content"],
  ["SCP_START_NO_CONTENT", "environment_without_content"],
  ["SCP_START_TEST_MISMATCH", "setup_test_mismatch"],
  ["SCP_START_GUIDE_MISMATCH", "guide_mismatch"],
  ["SCP_START_SOURCE_MISMATCH", "test_not_on_application"],
  ["SCP_START_BESKT_NOT_SUBMITTED", "beskt_not_submitted"],
];

export function refusalOf(message: string): StartRefusal | null {
  for (const [code, refusal] of REFUSALS) {
    if (new RegExp(`\\b${code}\\b`).test(message)) return refusal;
  }
  return null;
}

export function isSetupRequired(message: string): boolean {
  return /\bSCP_START_SETUP_REQUIRED\b/.test(message);
}
