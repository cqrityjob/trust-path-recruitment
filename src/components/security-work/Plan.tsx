import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  PLAN_90_PERIODS,
  PLAN_90_TASKS,
  PLAN_90_VERSION,
} from "@/lib/security-work/programme/content/plan-90-v1";
import { saveSecurityPlan } from "@/lib/security-work/programme/programme.functions";
import { daysBetween } from "@/lib/security-work/programme/rules";
import { useSecurityWorkspace } from "./context";
import { useWorkText } from "./analysis-ui";
import { AREA_ROUTES, Explain, programmeKey, useProgramme } from "./programme-ui";
import { AssistantButton, useAiAvailability, useAssistantContext } from "./SecurityAssistant";
import { EmptyState, LoadingState, PageHeading, WorkButton, WorkError, panelClass } from "./ui";

/** Optional onboarding: a fixed, versioned checklist, never AI-generated.
 * Dismissable at any time; established programmes never need it. */
export function SecurityPlanPage() {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const aiAvailable = useAiAvailability().available;
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const save = useServerFn(saveSecurityPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useAssistantContext({ kind: "workspace", id: null, title: t("sw.prog.nav.plan") });
  if (programme.isPending) return <LoadingState />;
  if (programme.isError || !programme.data)
    return (
      <WorkError
        code={programme.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void programme.refetch()}
      />
    );
  const plan = programme.data.plan;
  const persist = async (status: "active" | "dismissed" | "completed", completed: string[]) => {
    setBusy(true);
    setError(null);
    const result = await save({
      data: {
        workspaceId: workspace.id,
        status,
        completedTaskIds: completed,
        version: plan?.version ?? null,
      },
    });
    if (!result.ok) setError(result.code);
    await queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) });
    setBusy(false);
  };
  const done = new Set(plan?.completed_task_ids ?? []);
  const day = plan ? daysBetween(plan.started_on, programme.data.today) + 1 : 0;
  const routeFor = (area: (typeof PLAN_90_TASKS)[number]["area"]) =>
    area === "monitoring"
      ? "/security-work/$workspaceId/monitoring"
      : area === "evidence"
        ? "/security-work/$workspaceId/sources"
        : AREA_ROUTES[area];
  return (
    <>
      <PageHeading
        title={t("sw.prog.nav.plan")}
        body={l(
          "Förstå, bedöma, prioritera. En fast checklista för de första 90 dagarna i rollen. Frivillig – stäng av den när som helst.",
          "Understand, assess, prioritise. A fixed checklist for the first 90 days in the role. Optional – switch it off at any time.",
        )}
        action={<AssistantButton />}
      />
      <WorkError code={error} />
      {!plan || plan.status === "dismissed" ? (
        <EmptyState
          title={t("sw.prog.plan.cta.title")}
          body={l(
            "Planen passar den som är ny i rollen eller bygger upp säkerhetsarbetet från början. En etablerad organisation behöver den inte.",
            "The plan suits someone new in the role or building the security work from scratch. An established organisation does not need it.",
          )}
        >
          {canEdit && (
            <WorkButton
              disabled={busy}
              onClick={() => void persist("active", plan?.completed_task_ids ?? [])}
              data-testid="sw-plan-start"
            >
              {t("sw.prog.plan.cta.start")}
            </WorkButton>
          )}
        </EmptyState>
      ) : (
        <>
          <section
            className={`${panelClass} flex flex-wrap items-center justify-between gap-3`}
            data-testid="sw-plan-summary"
          >
            <p className="text-sm">
              {l("Dag", "Day")} {day} · {done.size}/{PLAN_90_TASKS.length}{" "}
              {l("uppgifter klara", "tasks done")} · {PLAN_90_VERSION}
              {plan.status === "completed" && ` · ${l("Slutförd", "Completed")}`}
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {plan.status === "active" && done.size === PLAN_90_TASKS.length && (
                  <WorkButton disabled={busy} onClick={() => void persist("completed", [...done])}>
                    {l("Markera planen som slutförd", "Mark the plan as completed")}
                  </WorkButton>
                )}
                <WorkButton
                  variant="outline"
                  disabled={busy}
                  onClick={() => void persist("dismissed", [...done])}
                  data-testid="sw-plan-dismiss"
                >
                  {l("Stäng av planen", "Dismiss the plan")}
                </WorkButton>
              </div>
            )}
          </section>
          {PLAN_90_PERIODS.map((period) => (
            <section key={period.id} className="space-y-2" data-testid={`sw-plan-${period.id}`}>
              <h2 className="font-display text-lg font-semibold">
                {period.title[lang]} · {period.range[lang]}
              </h2>
              <p className="text-sm text-muted-foreground">{period.theme[lang]}</p>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {PLAN_90_TASKS.filter((task) => task.period === period.id).map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-start justify-between gap-3 p-4"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-5"
                        checked={done.has(task.id)}
                        disabled={!canEdit || busy || plan.status !== "active"}
                        onChange={(e) => {
                          const next = new Set(done);
                          if (e.target.checked) next.add(task.id);
                          else next.delete(task.id);
                          void persist("active", [...next]);
                        }}
                      />
                      <span className="min-w-0">
                        <span
                          className={
                            done.has(task.id)
                              ? "block font-medium line-through"
                              : "block font-medium"
                          }
                        >
                          {task.title[lang]}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {task.description[lang]}
                        </span>
                      </span>
                    </label>
                    <WorkButton asChild variant="ghost" className="min-h-10">
                      <Link to={routeFor(task.area)} params={{ workspaceId: workspace.id }}>
                        {l("Öppna", "Open")}
                      </Link>
                    </WorkButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <Explain title={l("Varför 90 dagar?", "Why 90 days?")}>
        <p>
          {aiAvailable
            ? l(
                "De första tre månaderna avgör om säkerhetsarbetet blir förankrat eller personberoende. Checklistan är fast och versionerad; Security AI kan förklara uppgifterna och hjälpa till med utkast, men skriver aldrig om planen.",
                "The first three months decide whether security work becomes anchored or person-dependent. The checklist is fixed and versioned; Security AI can explain tasks and help with drafts, but never rewrites the plan.",
              )
            : l(
                "De första tre månaderna avgör om säkerhetsarbetet blir förankrat eller personberoende. Checklistan är fast och versionerad.",
                "The first three months decide whether security work becomes anchored or person-dependent. The checklist is fixed and versioned.",
              )}
        </p>
      </Explain>
    </>
  );
}
