import { z } from "zod";

/**
 * Missions: pure rules shared by server, client and checks. The state machine
 * mirrors sw_private.guard_mission (20270327090000) exactly; the database is
 * the authority and this copy only decides which buttons to offer.
 */
export const missionKinds = ["monitoring_impact", "risk_assessment", "event_security"] as const;
export type MissionKind = (typeof missionKinds)[number];
/** Offered in the product today. event_security exists in the schema for
 * Release C and is not offered until its planning and staffing work. */
export const offeredMissionKinds: readonly MissionKind[] = ["monitoring_impact", "risk_assessment"];

export const executionStates = [
  "created",
  "collecting",
  "waiting_for_input",
  "ready",
  "running",
  "needs_review",
  "completed",
  "cancelled",
  "failed",
  "outcome_unknown",
] as const;
export type ExecutionState = (typeof executionStates)[number];
export const reviewStates = ["not_started", "in_review", "accepted", "changes_requested"] as const;
export type ReviewState = (typeof reviewStates)[number];
export const terminalStates: readonly ExecutionState[] = [
  "completed",
  "cancelled",
  "failed",
  "outcome_unknown",
];

export const executionTransitions: Record<ExecutionState, readonly ExecutionState[]> = {
  created: ["collecting", "waiting_for_input", "ready", "cancelled"],
  collecting: ["waiting_for_input", "ready", "failed", "cancelled"],
  waiting_for_input: ["collecting", "ready", "cancelled"],
  ready: ["running", "needs_review", "collecting", "waiting_for_input", "cancelled"],
  running: ["needs_review", "failed", "outcome_unknown", "waiting_for_input"],
  needs_review: ["completed", "collecting", "ready", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
  outcome_unknown: [],
};
/** Only the system moves a mission into or out of `running`; people never press it. */
export const systemOnlyStates: readonly ExecutionState[] = ["running", "failed", "outcome_unknown"];

export function canTransition(
  from: { execution_state: string; review_state: string },
  to: ExecutionState,
): boolean {
  const allowed = executionTransitions[from.execution_state as ExecutionState] ?? [];
  if (!allowed.includes(to)) return false;
  if (to === "completed" && from.review_state !== "accepted") return false;
  return true;
}
export function canReview(from: ReviewState, to: ReviewState, execution: ExecutionState): boolean {
  if (terminalStates.includes(execution)) return false;
  return (
    (["not_started", "changes_requested"].includes(from) && to === "in_review") ||
    (from === "in_review" && (to === "accepted" || to === "changes_requested")) ||
    (from === "accepted" && to === "changes_requested")
  );
}

const text = (max: number) => z.string().trim().max(max);
const ids = z.array(z.string().uuid()).max(50).default([]);

/** The brief per family. Required inputs are what the work cannot start without. */
export const briefSchemas = {
  risk_assessment: z
    .object({
      decision: text(1000).default(""),
      scope: text(2000).default(""),
      horizon: text(200).default(""),
      method: z.enum(["rsa", "operating_profile"]).default("operating_profile"),
      assetIds: ids,
      existingControls: text(4000).default(""),
      questions: z.array(text(500)).max(30).default([]),
    })
    .strict(),
  monitoring_impact: z
    .object({
      requirement: text(1000).default(""),
      scope: text(2000).default(""),
      assetIds: ids,
      places: z.array(text(200)).max(30).default([]),
      materiality: text(1000).default(""),
      questions: z.array(text(500)).max(30).default([]),
    })
    .strict(),
  event_security: z
    .object({
      eventType: text(200).default(""),
      place: text(500).default(""),
      startsAt: text(40).default(""),
      endsAt: text(40).default(""),
      timeZone: text(60).default(""),
      expectedAttendance: z.number().int().min(0).max(10_000_000).nullable().default(null),
      questions: z.array(text(500)).max(30).default([]),
    })
    .strict(),
} as const;
export type Brief<K extends MissionKind> = z.infer<(typeof briefSchemas)[K]>;

export function parseBrief<K extends MissionKind>(kind: K, value: unknown): Brief<K> {
  return briefSchemas[kind].parse(value ?? {}) as Brief<K>;
}

export const requiredBriefFields: Record<MissionKind, readonly string[]> = {
  risk_assessment: ["decision", "scope", "horizon"],
  monitoring_impact: ["requirement", "scope"],
  event_security: ["eventType", "place", "startsAt", "endsAt", "timeZone", "expectedAttendance"],
};

/** Inputs still missing. Unknown stays unknown: nothing here is ever filled in for the user. */
export function missingInputs(kind: MissionKind, brief: Record<string, unknown>): string[] {
  return requiredBriefFields[kind].filter((field) => {
    const value = brief[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}

export type NextStep =
  | { kind: "complete_brief"; missing: string[] }
  | { kind: "add_evidence" }
  | { kind: "draft" }
  | { kind: "review" }
  | { kind: "decide" }
  | { kind: "none" };

/** The one next step a mission shows, from its state, brief and evidence. */
export function nextStep(mission: {
  kind: MissionKind;
  execution_state: string;
  review_state: string;
  brief: Record<string, unknown>;
  evidenceCount: number;
}): NextStep {
  if (terminalStates.includes(mission.execution_state as ExecutionState)) return { kind: "none" };
  const missing = missingInputs(mission.kind, mission.brief);
  if (missing.length) return { kind: "complete_brief", missing };
  if (mission.evidenceCount === 0 && mission.kind !== "event_security")
    return { kind: "add_evidence" };
  if (mission.execution_state === "needs_review")
    return mission.review_state === "accepted" ? { kind: "decide" } : { kind: "review" };
  return { kind: "draft" };
}

export const evidenceLinkKinds = ["source", "source_item", "requirement"] as const;
export const analysisLinkKinds = ["assessment", "report", "management_report"] as const;
export const decisionLinkKinds = ["risk", "action", "gap", "asset"] as const;
export const linkKinds = [
  ...evidenceLinkKinds,
  ...analysisLinkKinds,
  ...decisionLinkKinds,
] as const;
export type LinkKind = (typeof linkKinds)[number];

/** Five views, in this order, for every mission. */
export const missionViews = ["brief", "evidence", "analysis", "decisions", "history"] as const;
export type MissionView = (typeof missionViews)[number];
