import { currentStatusOptions } from "@/lib/security-career-profile/options";
import type { CurrentStatus } from "@/lib/security-career-profile/types";
import type { AssessmentProfileId } from "./types";

// The Public Career Assessment's "Current Situation" step reuses the
// existing security-career-profile CurrentStatus enum/options -- exactly 5
// of its 6 values (dropping "other", which has no defined profile mapping).
export const CURRENT_SITUATION_OPTIONS = currentStatusOptions.filter((o) => o.id !== "other");

export function profileForCurrentStatus(status: CurrentStatus | null): AssessmentProfileId {
  switch (status) {
    case "student":
    case "new_to_industry":
      return "student_or_new";
    case "working_in_industry":
    case "changing_role":
      return "security_professional";
    case "career_change":
      return "career_changer";
    default:
      return "student_or_new";
  }
}
