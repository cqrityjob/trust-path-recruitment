import { Link } from "@tanstack/react-router";
import {
  offeredMissionKinds,
  terminalStates,
  type ExecutionState,
} from "@/lib/security-work/missions/model";
import type { ProgrammeSnapshot } from "@/lib/security-work/programme/services";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";
import { WorkButton, panelClass } from "../ui";
import { MissionNextStep } from "./Missions";
import { MissionStateBadge, useMissionText, useMissions } from "./mission-ui";

/**
 * The top of the Overview: what do you need done, what changed that affects
 * you, what needs your decision, and which missions are under way. An absent
 * or empty monitoring connection is said in words and is never shown as
 * "nothing happened": no attention items and no evidence are different states.
 */
export function WorkEntrance({ facts }: { facts: ProgrammeSnapshot | undefined }) {
  const l = useWorkText();
  const text = useMissionText();
  const { workspace, canEdit, sources, requirements, counts } = useSecurityWorkspace();
  const missions = useMissions();
  const params = { workspaceId: workspace.id };
  const open = (missions.data ?? []).filter(
    (mission) => !terminalStates.includes(mission.execution_state as ExecutionState),
  );
  const awaitingDecision = open.filter((mission) => mission.execution_state === "needs_review");
  const suggestions = (facts?.suggestions ?? []).filter(
    (suggestion) => suggestion.status === "proposed" && suggestion.decision_required,
  );
  const activeSources = sources.filter((source) => source.active);
  const coverage =
    activeSources.length === 0
      ? "none"
      : requirements.length === 0
        ? "no_requirements"
        : counts.pending > 0
          ? "pending"
          : "quiet";
  return (
    <div className="space-y-6" data-testid="sw-work-entrance">
      <section aria-labelledby="sw-task-heading" className={`${panelClass} space-y-3`}>
        <h2 id="sw-task-heading" className="font-display text-xl font-semibold">
          {l("Vad behöver du få gjort?", "What do you need to get done?")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {canEdit &&
            offeredMissionKinds.map((kind) => (
              <WorkButton key={kind} asChild variant="outline">
                <Link
                  to="/security-work/$workspaceId/missions"
                  params={params}
                  search={{ new: kind }}
                  data-testid={`sw-start-${kind}`}
                >
                  {text.kind(kind)}
                </Link>
              </WorkButton>
            ))}
          <WorkButton asChild variant="ghost">
            <Link to="/security-work/$workspaceId/missions" params={params}>
              {l("Alla uppdrag", "All missions")}
            </Link>
          </WorkButton>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section
          aria-labelledby="sw-changes-heading"
          className={`${panelClass} space-y-2`}
          data-testid="sw-changes"
          data-coverage={coverage}
        >
          <h2 id="sw-changes-heading" className="font-semibold">
            {l("Förändringar som berör er", "Changes that affect you")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {coverage === "none"
              ? l(
                  "Ingen bevakningskälla är ansluten. Vi kan därför inte säga att inget har hänt.",
                  "No monitoring source is connected, so we cannot say that nothing has happened.",
                )
              : coverage === "no_requirements"
                ? l(
                    "Källor finns men inga bevakningsbehov är beskrivna, så inget kan bedömas som relevant för er.",
                    "Sources exist but no monitoring requirements are described, so nothing can be judged relevant to you.",
                  )
                : coverage === "pending"
                  ? l(
                      `${counts.pending} ${counts.pending === 1 ? "post" : "poster"} väntar på bedömning.`,
                      `${counts.pending} ${counts.pending === 1 ? "item awaits" : "items await"} assessment.`,
                    )
                  : l(
                      "Inget obedömt i de anslutna källorna. Det gäller bara de källor som är anslutna.",
                      "Nothing unassessed in the connected sources. That holds only for the sources that are connected.",
                    )}
          </p>
          <Link
            to="/security-work/$workspaceId/monitoring"
            params={params}
            className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
          >
            {l("Till bevakningen", "To monitoring")}
          </Link>
        </section>

        <section
          aria-labelledby="sw-decide-heading"
          className={`${panelClass} space-y-2`}
          data-testid="sw-decisions"
        >
          <h2 id="sw-decide-heading" className="font-semibold">
            {l("Behöver ditt beslut", "Needs your decision")}
          </h2>
          {awaitingDecision.length === 0 && suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {l("Inget väntar på beslut just nu.", "Nothing is waiting for a decision right now.")}
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {awaitingDecision.map((mission) => (
                <li key={mission.id}>
                  <Link
                    to="/security-work/$workspaceId/missions/$missionId"
                    params={{ ...params, missionId: mission.id }}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {mission.title}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {text.review(mission.review_state)}
                  </span>
                </li>
              ))}
              {suggestions.length > 0 && (
                <li>
                  {suggestions.length}{" "}
                  {l(
                    "AI-förslag väntar på ditt ställningstagande",
                    "AI proposals await your decision",
                  )}
                </li>
              )}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="sw-ongoing-heading"
          className={`${panelClass} space-y-2`}
          data-testid="sw-ongoing-missions"
        >
          <h2 id="sw-ongoing-heading" className="font-semibold">
            {l("Pågående uppdrag", "Missions in progress")}
          </h2>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {l("Inga pågående uppdrag.", "No missions in progress.")}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {open.slice(0, 5).map((mission) => (
                <li key={mission.id} className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/security-work/$workspaceId/missions/$missionId"
                      params={{ ...params, missionId: mission.id }}
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      {mission.title}
                    </Link>
                    <MissionStateBadge state={mission.execution_state} />
                  </div>
                  <p className="text-muted-foreground">
                    <MissionNextStep mission={mission} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
