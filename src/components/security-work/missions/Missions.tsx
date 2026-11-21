import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { useT } from "@/i18n/context";
import { createSecurityMission } from "@/lib/security-work/missions/functions";
import {
  missingInputs,
  nextStep,
  offeredMissionKinds,
  requiredBriefFields,
  terminalStates,
  type ExecutionState,
  type MissionKind,
} from "@/lib/security-work/missions/model";
import type { MissionSummary } from "@/lib/security-work/missions/services";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";
import {
  EmptyState,
  LoadingState,
  PageHeading,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
} from "../ui";
import { MissionStateBadge, missionsKey, useMissionText, useMissions } from "./mission-ui";

export function MissionNextStep({ mission }: { mission: MissionSummary }) {
  const l = useWorkText();
  const text = useMissionText();
  const step = nextStep({
    kind: mission.kind as MissionKind,
    execution_state: mission.execution_state,
    review_state: mission.review_state,
    brief: (mission.brief ?? {}) as Record<string, unknown>,
    evidenceCount: mission.evidenceCount,
  });
  const label =
    step.kind === "complete_brief"
      ? l("Komplettera briefen: ", "Complete the brief: ") +
        step.missing.map((field) => text.field(field).toLowerCase()).join(", ")
      : step.kind === "add_evidence"
        ? l("Koppla underlag", "Link evidence")
        : step.kind === "review"
          ? l("Granska utkastet", "Review the draft")
          : step.kind === "decide"
            ? l("Fatta beslut och avsluta", "Decide and close")
            : step.kind === "draft"
              ? l("Ta fram analys eller plan", "Prepare the analysis or plan")
              : l("Inget kvar att göra", "Nothing left to do");
  return <span>{mission.next_action.trim() || label}</span>;
}

export function SecurityMissions({ startWith }: { startWith?: MissionKind } = {}) {
  const l = useWorkText();
  const text = useMissionText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const missions = useMissions();
  const [creating, setCreating] = useState(Boolean(startWith) && canEdit);
  const open = (missions.data ?? []).filter(
    (mission) => !terminalStates.includes(mission.execution_state as ExecutionState),
  );
  const done = (missions.data ?? []).filter((mission) =>
    terminalStates.includes(mission.execution_state as ExecutionState),
  );
  return (
    <div className="space-y-7" data-testid="sw-missions">
      <PageHeading
        title={l("Uppdrag", "Missions")}
        body={l(
          "Ett uppdrag samlar en fråga, dess underlag, analysen eller planen och de beslut den leder till. Begränsade uppdrag syns bara för de som är med i uppdraget.",
          "A mission holds one question, its evidence, the analysis or plan and the decisions it leads to. Restricted missions are visible only to the people in them.",
        )}
        action={
          canEdit && !creating ? (
            <WorkButton onClick={() => setCreating(true)} data-testid="sw-mission-new">
              {l("Nytt uppdrag", "New mission")}
            </WorkButton>
          ) : null
        }
      />
      {creating && <CreateMission initialKind={startWith} onClose={() => setCreating(false)} />}
      {missions.isPending ? (
        <LoadingState />
      ) : missions.isError ? (
        <WorkError code={missions.error.message} onRetry={() => void missions.refetch()} />
      ) : !missions.data?.length ? (
        <EmptyState
          title={l("Inga uppdrag ännu", "No missions yet")}
          body={l(
            "Börja med en fråga som behöver ett underbyggt svar, till exempel en riskbedömning inför ett beslut.",
            "Start with a question that needs a supported answer, such as a risk assessment ahead of a decision.",
          )}
        />
      ) : (
        <>
          <MissionList
            title={l("Pågående", "In progress")}
            missions={open}
            workspaceId={workspace.id}
          />
          {done.length > 0 && (
            <MissionList
              title={l("Avslutade", "Closed")}
              missions={done}
              workspaceId={workspace.id}
            />
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {text.kind("event_security")}:{" "}
        {l(
          "planering och bemanning byggs i nästa steg och erbjuds inte förrän det fungerar.",
          "planning and staffing are built next and are not offered until they work.",
        )}
      </p>
    </div>
  );
}

function MissionList({
  title,
  missions,
  workspaceId,
}: {
  title: string;
  missions: MissionSummary[];
  workspaceId: string;
}) {
  const l = useWorkText();
  const text = useMissionText();
  const { lang } = useT();
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <ul className="space-y-3">
        {missions.map((mission) => (
          <li key={mission.id} className={panelClass} data-testid="sw-mission-row">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <Link
                  to="/security-work/$workspaceId/missions/$missionId"
                  params={{ workspaceId, missionId: mission.id }}
                  className="break-words font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {mission.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {text.kind(mission.kind)} · {l("Uppdaterat", "Updated")}{" "}
                  {formatDate(mission.updated_at, lang)}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">{l("Nästa steg: ", "Next step: ")}</span>
                  <MissionNextStep mission={mission} />
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {mission.restricted && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden="true" />
                    {l("Begränsat", "Restricted")}
                  </span>
                )}
                <MissionStateBadge state={mission.execution_state} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreateMission({
  onClose,
  initialKind,
}: {
  onClose: () => void;
  initialKind?: MissionKind;
}) {
  const l = useWorkText();
  const text = useMissionText();
  const { workspace, user } = useSecurityWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createSecurityMission);
  const [kind, setKind] = useState<MissionKind>(initialKind ?? "risk_assessment");
  const [title, setTitle] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError("INVALID_INPUT");
    setBusy(true);
    try {
      const result = await create({
        data: { workspaceId: workspace.id, kind, title, restricted, brief },
      });
      if (!result.ok) return setError(result.code);
      await queryClient.invalidateQueries({ queryKey: missionsKey(user.id, workspace.id) });
      await navigate({
        to: "/security-work/$workspaceId/missions/$missionId",
        params: { workspaceId: workspace.id, missionId: result.data.id },
      });
    } finally {
      setBusy(false);
    }
  };
  const missing = missingInputs(kind, brief);
  return (
    <form
      className={`${panelClass} space-y-5`}
      data-testid="sw-mission-create"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="font-display text-lg font-semibold">
        {l("Vad behöver du få gjort?", "What do you need to get done?")}
      </h2>
      <div className="space-y-2">
        <label htmlFor="sw-mission-kind" className="block text-sm font-semibold">
          {l("Typ av uppdrag", "Mission type")}
        </label>
        <select
          id="sw-mission-kind"
          className={selectClass}
          value={kind}
          onChange={(event) => setKind(event.target.value as MissionKind)}
        >
          {offeredMissionKinds.map((value) => (
            <option key={value} value={value}>
              {text.kind(value)}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label={l("Rubrik", "Title")}
        value={title}
        required
        maxLength={300}
        onChange={(event) => setTitle(event.target.value)}
      />
      {requiredBriefFields[kind].map((field) => (
        <TextField
          key={`${kind}-${field}`}
          label={text.field(field)}
          value={brief[field] ?? ""}
          maxLength={1000}
          hint={l(
            "Kan fyllas i senare. Uppdraget väntar på uppgiften tills den finns.",
            "Can be filled in later. The mission waits for it until it is there.",
          )}
          onChange={(event) => setBrief({ ...brief, [field]: event.target.value })}
        />
      ))}
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={restricted}
          onChange={(event) => setRestricted(event.target.checked)}
        />
        <span>
          <span className="font-semibold">{l("Begränsat uppdrag", "Restricted mission")}</span>
          <span className="block text-muted-foreground">
            {l(
              "Bara du och de du lägger till ser uppdraget, även arbetsytans ägare utesluts.",
              "Only you and the people you add see it; even the workspace owner is excluded.",
            )}
          </span>
        </span>
      </label>
      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="sw-mission-missing">
          {l("Saknas fortfarande: ", "Still missing: ")}
          {missing.map((field) => text.field(field).toLowerCase()).join(", ")}
        </p>
      )}
      <WorkError code={error} />
      <div className="flex flex-wrap gap-3">
        <WorkButton type="submit" disabled={busy}>
          {l("Skapa uppdrag", "Create mission")}
        </WorkButton>
        <WorkButton type="button" variant="outline" onClick={onClose}>
          {l("Avbryt", "Cancel")}
        </WorkButton>
      </div>
    </form>
  );
}
