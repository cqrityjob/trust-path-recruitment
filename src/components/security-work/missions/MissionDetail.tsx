import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  addSecurityMissionLink,
  removeSecurityMissionLink,
  setSecurityMissionMember,
  transitionSecurityMission,
  updateSecurityMission,
} from "@/lib/security-work/missions/functions";
import {
  analysisLinkKinds,
  canReview,
  canTransition,
  decisionLinkKinds,
  evidenceLinkKinds,
  executionStates,
  missingInputs,
  missionViews,
  parseBrief,
  systemOnlyStates,
  type ExecutionState,
  type LinkKind,
  type MissionKind,
  type MissionView,
  type ReviewState,
} from "@/lib/security-work/missions/model";
import type { MissionDetail as Detail } from "@/lib/security-work/missions/services";
import { useSecurityWorkspace } from "../context";
import { usePortfolio, useWorkText } from "../analysis-ui";
import { useProgramme } from "../programme-ui";
import { useTeam } from "../settings/Organisation";
import {
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
} from "../ui";
import {
  MissionStateBadge,
  missionKey,
  missionsKey,
  useMission,
  useMissionText,
} from "./mission-ui";

export function SecurityMissionDetail({ missionId }: { missionId: string }) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const query = useMission(missionId);
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <div className="space-y-4" data-testid="sw-mission-unavailable">
        <PageHeading
          title={l("Uppdraget är inte tillgängligt", "This mission is not available")}
          body={l(
            "Det finns inte, eller så är det begränsat till andra personer.",
            "It does not exist, or it is restricted to other people.",
          )}
        />
        <WorkButton asChild variant="outline">
          <Link to="/security-work/$workspaceId/missions" params={{ workspaceId: workspace.id }}>
            {l("Till uppdragen", "To missions")}
          </Link>
        </WorkButton>
      </div>
    );
  return <MissionWorkspace detail={query.data} />;
}

function MissionWorkspace({ detail }: { detail: Detail }) {
  const l = useWorkText();
  const text = useMissionText();
  const { lang } = useT();
  const { workspace, canEdit, user } = useSecurityWorkspace();
  const queryClient = useQueryClient();
  const [view, setView] = useState<MissionView>("brief");
  const [error, setError] = useState<string | null>(null);
  const transition = useServerFn(transitionSecurityMission);
  const { mission } = detail;
  const kind = mission.kind as MissionKind;
  const brief = parseBrief(kind, mission.brief) as Record<string, unknown>;
  const missing = missingInputs(kind, brief);
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: missionKey(user.id, workspace.id, mission.id),
    });
    await queryClient.invalidateQueries({ queryKey: missionsKey(user.id, workspace.id) });
  };
  const run = async (
    action: () => Promise<{ ok: true } | { ok: false; code: string }>,
  ): Promise<boolean> => {
    setError(null);
    const result = await action();
    if (!result.ok) {
      setError(result.code);
      await refresh();
      return false;
    }
    await refresh();
    return true;
  };
  const moves = executionStates.filter(
    (state) =>
      !(systemOnlyStates as readonly string[]).includes(state) &&
      canTransition(mission, state) &&
      !(state === "ready" && missing.length > 0),
  );
  const reviewMoves = (["in_review", "accepted", "changes_requested"] as ReviewState[]).filter(
    (state) =>
      canReview(
        mission.review_state as ReviewState,
        state,
        mission.execution_state as ExecutionState,
      ),
  );
  const evidence = detail.links.filter((entry) =>
    (evidenceLinkKinds as readonly string[]).includes(entry.link.target_kind),
  );
  return (
    <div className="space-y-6" data-testid="sw-mission-detail">
      <div className="space-y-2">
        <Link
          to="/security-work/$workspaceId/missions"
          params={{ workspaceId: workspace.id }}
          className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
        >
          {l("← Alla uppdrag", "← All missions")}
        </Link>
        <PageHeading title={mission.title} body={text.kind(kind)} />
        <div className="flex flex-wrap items-center gap-2">
          <MissionStateBadge state={mission.execution_state} />
          <span className="text-xs text-muted-foreground" data-testid="sw-mission-review">
            {text.review(mission.review_state)}
          </span>
          {mission.restricted && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3.5" aria-hidden="true" />
              {l("Begränsat till uppdragets medlemmar", "Restricted to the mission's members")}
            </span>
          )}
          {mission.operating_profile_version && (
            <span className="text-xs text-muted-foreground">
              {l("Verksamhetsprofil version ", "Operating profile version ")}
              {mission.operating_profile_version}
            </span>
          )}
        </div>
      </div>
      <WorkError code={error} />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        <div className="min-w-0 space-y-4">
          <div
            role="tablist"
            aria-label={l("Uppdragets delar", "Mission views")}
            className="flex flex-wrap gap-2"
          >
            {missionViews.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                id={`sw-mission-tab-${entry}`}
                aria-selected={view === entry}
                aria-controls={`sw-mission-panel-${entry}`}
                onClick={() => setView(entry)}
                className={
                  view === entry
                    ? "min-h-11 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                    : "min-h-11 rounded-lg border border-border px-3 text-sm font-medium hover:bg-secondary"
                }
              >
                {text.view(entry)}
              </button>
            ))}
          </div>
          <section
            role="tabpanel"
            id={`sw-mission-panel-${view}`}
            aria-labelledby={`sw-mission-tab-${view}`}
            className={panelClass}
          >
            {view === "brief" && (
              <BriefView detail={detail} brief={brief} canEdit={canEdit} run={run} />
            )}
            {view === "evidence" && (
              <LinksView detail={detail} kinds={evidenceLinkKinds} canEdit={canEdit} run={run} />
            )}
            {view === "analysis" && (
              <LinksView detail={detail} kinds={analysisLinkKinds} canEdit={canEdit} run={run} />
            )}
            {view === "decisions" && (
              <LinksView detail={detail} kinds={decisionLinkKinds} canEdit={canEdit} run={run} />
            )}
            {view === "history" && (
              <ol className="space-y-2 text-sm" data-testid="sw-mission-history">
                {detail.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap gap-x-2">
                    <span className="text-muted-foreground">
                      {formatDate(event.created_at, lang, true)}
                    </span>
                    <span>
                      {event.event === "state_changed"
                        ? `${text.state(event.from_value ?? "")} → ${text.state(event.to_value ?? "")}`
                        : event.event === "review_changed"
                          ? `${text.review(event.from_value ?? "")} → ${text.review(event.to_value ?? "")}`
                          : historyLabel(event.event, l)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside
          className="mt-6 space-y-4 lg:mt-0"
          aria-label={l("Status och nästa steg", "Status and next steps")}
        >
          <div className={`${panelClass} space-y-3`} data-testid="sw-mission-side">
            <h2 className="text-sm font-semibold">{l("Saknas", "Missing")}</h2>
            {missing.length ? (
              <ul
                className="list-disc space-y-1 pl-5 text-sm"
                data-testid="sw-mission-missing-inputs"
              >
                {missing.map((field) => (
                  <li key={field}>{text.field(field)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {l("Briefen har det som krävs.", "The brief has what it needs.")}
              </p>
            )}
            <p className="text-sm">
              {l("Kopplat underlag: ", "Linked evidence: ")}
              <strong>{evidence.length}</strong>
            </p>
            {canEdit && (moves.length > 0 || reviewMoves.length > 0) && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">{l("Tillåtna steg", "Permitted steps")}</h2>
                <div className="flex flex-wrap gap-2">
                  {moves.map((state) => (
                    <WorkButton
                      key={state}
                      variant={state === "cancelled" ? "outline" : "default"}
                      data-testid={`sw-mission-to-${state}`}
                      onClick={() =>
                        void run(() =>
                          transition({
                            data: {
                              workspaceId: workspace.id,
                              missionId: mission.id,
                              version: mission.version,
                              executionState: state,
                            },
                          }),
                        )
                      }
                    >
                      {text.state(state)}
                    </WorkButton>
                  ))}
                  {reviewMoves.map((state) => (
                    <WorkButton
                      key={state}
                      variant="outline"
                      data-testid={`sw-mission-review-${state}`}
                      onClick={() =>
                        void run(() =>
                          transition({
                            data: {
                              workspaceId: workspace.id,
                              missionId: mission.id,
                              version: mission.version,
                              reviewState: state,
                            },
                          }),
                        )
                      }
                    >
                      {text.review(state)}
                    </WorkButton>
                  ))}
                </div>
                {missing.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {l(
                      "Uppdraget kan inte bli redo förrän briefen är komplett.",
                      "The mission cannot become ready until the brief is complete.",
                    )}
                  </p>
                )}
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {l(
                "Ett sparat utkast är inte en godkänd rapport, och en godkänd rapport visar inte att åtgärderna har genomförts.",
                "A saved draft is not an approved report, and an approved report does not show that actions were carried out.",
              )}
            </p>
          </div>
          <Circle detail={detail} run={run} />
        </aside>
      </div>
    </div>
  );
}

function historyLabel(event: string, l: (sv: string, en: string) => string) {
  return (
    {
      created: l("Uppdraget skapades", "Mission created"),
      brief_changed: l("Briefen ändrades", "Brief changed"),
      member_added: l("En person lades till", "A person was added"),
      member_removed: l("En person togs bort", "A person was removed"),
      link_added: l("Underlag eller post kopplades", "A record was linked"),
      link_removed: l("En koppling togs bort", "A link was removed"),
      restriction_changed: l("Begränsningen ändrades", "Restriction changed"),
      owner_changed: l("Ansvarig ändrades", "Owner changed"),
    }[event] ?? event
  );
}

type Run = (action: () => Promise<{ ok: true } | { ok: false; code: string }>) => Promise<boolean>;

function BriefView({
  detail,
  brief,
  canEdit,
  run,
}: {
  detail: Detail;
  brief: Record<string, unknown>;
  canEdit: boolean;
  run: Run;
}) {
  const l = useWorkText();
  const text = useMissionText();
  const { workspace } = useSecurityWorkspace();
  const update = useServerFn(updateSecurityMission);
  const { mission } = detail;
  const fields = Object.keys(brief).filter((key) => !["assetIds", "method"].includes(key));
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((key) => {
        const value = brief[key];
        return [key, Array.isArray(value) ? value.join("\n") : value == null ? "" : String(value)];
      }),
    ),
  );
  const [nextAction, setNextAction] = useState(mission.next_action);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(false);
    const next: Record<string, unknown> = { ...brief };
    for (const key of fields) {
      const current = brief[key];
      next[key] = Array.isArray(current)
        ? draft[key]
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : typeof current === "number" || key === "expectedAttendance"
          ? draft[key].trim() === ""
            ? null
            : Number(draft[key])
          : draft[key];
    }
    const ok = await run(() =>
      update({
        data: {
          workspaceId: workspace.id,
          missionId: mission.id,
          version: mission.version,
          brief: next,
          nextAction,
        },
      }),
    );
    setSaved(ok);
  };
  return (
    <form
      className="space-y-4"
      data-testid="sw-mission-brief"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {fields.map((key) =>
        Array.isArray(brief[key]) || ["scope", "existingControls"].includes(key) ? (
          <TextAreaField
            key={key}
            label={text.field(key)}
            value={draft[key]}
            disabled={!canEdit}
            hint={Array.isArray(brief[key]) ? l("En per rad.", "One per line.") : undefined}
            onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
          />
        ) : (
          <TextField
            key={key}
            label={text.field(key)}
            value={draft[key]}
            disabled={!canEdit}
            onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
          />
        ),
      )}
      <TextField
        label={l("Nästa steg (egen formulering)", "Next step (your own wording)")}
        value={nextAction}
        maxLength={500}
        disabled={!canEdit}
        onChange={(event) => setNextAction(event.target.value)}
      />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <WorkButton type="submit">{l("Spara briefen", "Save the brief")}</WorkButton>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              {l("Sparat.", "Saved.")}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function useLinkOptions(kinds: readonly LinkKind[]) {
  const { sources, requirements } = useSecurityWorkspace();
  const programme = useProgramme();
  const portfolio = usePortfolio();
  const p = programme.data;
  const options: { kind: LinkKind; id: string; title: string }[] = [];
  const push = (kind: LinkKind, rows: { id: string; title: string }[]) => {
    if (kinds.includes(kind)) for (const row of rows) options.push({ kind, ...row });
  };
  push(
    "source",
    sources.map((row) => ({ id: row.id, title: row.name })),
  );
  push(
    "requirement",
    requirements.map((row) => ({ id: row.id, title: row.question })),
  );
  push(
    "asset",
    (p?.assets ?? []).map((row) => ({ id: row.id, title: row.name })),
  );
  push(
    "risk",
    (p?.risks ?? []).map((row) => ({ id: row.id, title: row.title })),
  );
  push(
    "action",
    (p?.actions ?? []).map((row) => ({ id: row.id, title: row.title })),
  );
  push(
    "gap",
    (p?.gaps ?? []).map((row) => ({ id: row.id, title: row.title })),
  );
  push(
    "management_report",
    (p?.managementReports ?? []).map((row) => ({ id: row.id, title: row.title })),
  );
  push(
    "assessment",
    (portfolio.data?.analyses ?? []).map((row) => ({ id: row.id, title: row.title })),
  );
  push(
    "report",
    (portfolio.data?.reports ?? []).map((row) => ({ id: row.id, title: row.title })),
  );
  return options;
}

function LinksView({
  detail,
  kinds,
  canEdit,
  run,
}: {
  detail: Detail;
  kinds: readonly LinkKind[];
  canEdit: boolean;
  run: Run;
}) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const add = useServerFn(addSecurityMissionLink);
  const remove = useServerFn(removeSecurityMissionLink);
  const options = useLinkOptions(kinds);
  const linked = detail.links.filter((entry) =>
    (kinds as readonly string[]).includes(entry.link.target_kind),
  );
  const available = options.filter(
    (option) =>
      !linked.some(
        (entry) => entry.link.target_kind === option.kind && entry.link.target_id === option.id,
      ),
  );
  const [choice, setChoice] = useState("");
  const kindLabel = (kind: string) =>
    ({
      source: l("Källa", "Source"),
      source_item: l("Källpost", "Source item"),
      requirement: l("Bevakningsbehov", "Monitoring requirement"),
      asset: l("Skyddsvärd tillgång", "Protected asset"),
      risk: l("Risk", "Risk"),
      action: l("Åtgärd", "Action"),
      gap: l("Brist", "Gap"),
      assessment: l("Analys", "Analysis"),
      report: l("Rapport", "Report"),
      management_report: l("Ledningsrapport", "Management report"),
    })[kind] ?? kind;
  return (
    <div className="space-y-4" data-testid="sw-mission-links">
      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {l("Inget är kopplat här ännu.", "Nothing is linked here yet.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {linked.map((entry) => (
            <li
              key={entry.link.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-sm"
            >
              <span className="min-w-0 break-words">
                <span className="text-muted-foreground">{kindLabel(entry.link.target_kind)}: </span>
                {entry.title ?? l("(inte synlig för dig)", "(not visible to you)")}
                {entry.status && <span className="text-muted-foreground"> · {entry.status}</span>}
              </span>
              {canEdit && (
                <WorkButton
                  variant="ghost"
                  onClick={() =>
                    void run(() =>
                      remove({
                        data: {
                          workspaceId: workspace.id,
                          missionId: detail.mission.id,
                          linkId: entry.link.id,
                        },
                      }),
                    )
                  }
                >
                  {l("Ta bort koppling", "Remove link")}
                </WorkButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <label htmlFor={`sw-link-${kinds[0]}`} className="block text-sm font-semibold">
              {l("Koppla en post", "Link a record")}
            </label>
            <select
              id={`sw-link-${kinds[0]}`}
              className={selectClass}
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">{l("Välj…", "Choose…")}</option>
              {available.map((option) => (
                <option key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>
                  {kindLabel(option.kind)}: {option.title}
                </option>
              ))}
            </select>
          </div>
          <WorkButton
            disabled={!choice}
            onClick={async () => {
              const [targetKind, targetId] = choice.split(":");
              const ok = await run(() =>
                add({
                  data: {
                    workspaceId: workspace.id,
                    missionId: detail.mission.id,
                    targetKind: targetKind as LinkKind,
                    targetId,
                    note: "",
                  },
                }),
              );
              if (ok) setChoice("");
            }}
          >
            {l("Koppla", "Link")}
          </WorkButton>
        </div>
      )}
    </div>
  );
}

function Circle({ detail, run }: { detail: Detail; run: Run }) {
  const l = useWorkText();
  const { workspace, user, membership } = useSecurityWorkspace();
  const team = useTeam();
  const setMember = useServerFn(setSecurityMissionMember);
  const { mission } = detail;
  const manages =
    mission.created_by === user.id || mission.owner_id === user.id || membership.role === "owner";
  const candidates = (team.data?.members ?? []).filter(
    (member) =>
      member.active && !detail.members.some((existing) => existing.user_id === member.user_id),
  );
  const [choice, setChoice] = useState("");
  return (
    <div className={`${panelClass} space-y-3`} data-testid="sw-mission-circle">
      <h2 className="text-sm font-semibold">
        {mission.restricted
          ? l("Vilka som ser uppdraget", "Who can see this mission")
          : l("I uppdraget", "In this mission")}
      </h2>
      <ul className="space-y-1 text-sm">
        {detail.members.map((member) => (
          <li key={member.user_id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 break-all">
              {member.user_id === user.id ? l("Du", "You") : (member.email ?? member.user_id)}
            </span>
            {manages && member.user_id !== mission.created_by && (
              <WorkButton
                variant="ghost"
                onClick={() =>
                  void run(() =>
                    setMember({
                      data: {
                        workspaceId: workspace.id,
                        missionId: mission.id,
                        userId: member.user_id,
                        member: false,
                      },
                    }),
                  )
                }
              >
                {l("Ta bort", "Remove")}
              </WorkButton>
            )}
          </li>
        ))}
      </ul>
      {manages && candidates.length > 0 && (
        <div className="space-y-2">
          <label htmlFor="sw-circle-add" className="block text-sm font-semibold">
            {l("Lägg till en kollega", "Add a colleague")}
          </label>
          <select
            id="sw-circle-add"
            className={selectClass}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">{l("Välj…", "Choose…")}</option>
            {candidates.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.email}
              </option>
            ))}
          </select>
          <WorkButton
            disabled={!choice}
            onClick={async () => {
              const ok = await run(() =>
                setMember({
                  data: {
                    workspaceId: workspace.id,
                    missionId: mission.id,
                    userId: choice,
                    member: true,
                  },
                }),
              );
              if (ok) setChoice("");
            }}
          >
            {l("Lägg till", "Add")}
          </WorkButton>
        </div>
      )}
    </div>
  );
}
