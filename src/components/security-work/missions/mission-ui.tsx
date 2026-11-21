import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSecurityMission, listSecurityMissions } from "@/lib/security-work/missions/functions";
import type {
  ExecutionState,
  MissionKind,
  MissionView,
  ReviewState,
} from "@/lib/security-work/missions/model";
import type { MissionDetail, MissionSummary } from "@/lib/security-work/missions/services";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { cn } from "@/lib/utils";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";

export const missionsKey = (userId: string, workspaceId: string) =>
  [...securityWorkKeys.workspace(userId, workspaceId), "missions"] as const;
export const missionKey = (userId: string, workspaceId: string, missionId: string) =>
  [...securityWorkKeys.workspace(userId, workspaceId), "missions", missionId] as const;

export function useMissions() {
  const { user, workspace, deny } = useSecurityWorkspace();
  const read = useServerFn(listSecurityMissions);
  const query = useQuery({
    queryKey: missionsKey(user.id, workspace.id),
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data as MissionSummary[];
    },
  });
  useEffect(() => {
    if (query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error, deny]);
  return query;
}

/** A mission the person may not see answers exactly like one that does not exist. */
export function useMission(missionId: string) {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getSecurityMission);
  return useQuery({
    queryKey: missionKey(user.id, workspace.id, missionId),
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id, missionId } });
      if (!result.ok) throw new Error(result.code);
      return result.data as MissionDetail;
    },
  });
}

export function useMissionText() {
  const l = useWorkText();
  return {
    kind: (kind: MissionKind | string) =>
      ({
        monitoring_impact: l("Bevakning till verksamhetspåverkan", "Monitoring to business impact"),
        risk_assessment: l("Hot- och riskbedömning", "Threat and risk assessment"),
        event_security: l("Evenemang och festival", "Event and festival security"),
      })[kind as MissionKind] ?? kind,
    state: (state: ExecutionState | string) =>
      ({
        created: l("Skapat", "Created"),
        collecting: l("Samlar underlag", "Collecting"),
        waiting_for_input: l("Väntar på uppgifter", "Waiting for input"),
        ready: l("Redo", "Ready"),
        running: l("Utkast tas fram", "Drafting"),
        needs_review: l("Behöver granskas", "Review needed"),
        completed: l("Klart", "Completed"),
        cancelled: l("Avbrutet", "Cancelled"),
        failed: l("Misslyckades", "Failed"),
        outcome_unknown: l("Utfall okänt", "Outcome unknown"),
      })[state as ExecutionState] ?? state,
    review: (state: ReviewState | string) =>
      ({
        not_started: l("Ingen granskning ännu", "Not reviewed yet"),
        in_review: l("Under granskning", "In review"),
        accepted: l("Granskat och godtaget", "Reviewed and accepted"),
        changes_requested: l("Ändringar begärda", "Changes requested"),
      })[state as ReviewState] ?? state,
    view: (view: MissionView) =>
      ({
        brief: l("Brief", "Brief"),
        evidence: l("Underlag", "Evidence"),
        analysis: l("Analys eller plan", "Analysis or plan"),
        decisions: l("Beslut och åtgärder", "Decisions and actions"),
        history: l("Historik", "History"),
      })[view],
    field: (field: string) =>
      ({
        decision: l("Beslut som ska stödjas", "Decision to support"),
        scope: l("Omfattning", "Scope"),
        horizon: l("Tidshorisont", "Time horizon"),
        method: l("Metod", "Method"),
        existingControls: l("Befintliga skydd", "Existing controls"),
        requirement: l("Bevakningsbehov", "Monitoring requirement"),
        places: l("Platser", "Places"),
        materiality: l("Vad som är väsentligt för er", "What is material to you"),
        questions: l("Öppna frågor", "Open questions"),
        eventType: l("Typ av evenemang", "Event type"),
        place: l("Plats", "Place"),
        startsAt: l("Start", "Starts"),
        endsAt: l("Slut", "Ends"),
        timeZone: l("Tidszon", "Time zone"),
        expectedAttendance: l("Förväntat antal besökare", "Expected attendance"),
      })[field] ?? field,
  };
}

const tone: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  needs_review: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  waiting_for_input: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  outcome_unknown: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
};
export function MissionStateBadge({ state }: { state: string }) {
  const text = useMissionText();
  return (
    <span
      data-mission-state={state}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone[state] ?? "bg-secondary text-foreground",
      )}
    >
      {text.state(state)}
    </span>
  );
}
