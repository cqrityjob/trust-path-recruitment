import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import {
  listTargetProfessions,
  createGapSnapshot,
  addNextActionMilestone,
  listMilestonesForTarget,
} from "@/lib/journey/journey.functions";
import {
  readProfessionGraph,
  getCompetencyName,
  getFormalRequirement,
  computeGapAnalysis,
  GRAPH_VERSION,
  getEducationName,
  getCertification,
} from "@/lib/knowledge-graph";

export const Route = createFileRoute("/_authenticated/journey/$targetId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Career plan — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TargetPlanPage,
});

type FormalStatus = "required" | "self_reported_as_met" | "not_provided" | "not_applicable";

function TargetPlanPage() {
  const { targetId } = Route.useParams();
  const fetchTargets = useServerFn(listTargetProfessions);
  const saveSnapshot = useServerFn(createGapSnapshot);
  const addMilestone = useServerFn(addNextActionMilestone);
  const fetchMilestones = useServerFn(listMilestonesForTarget);
  const qc = useQueryClient();

  const targets = useQuery({ queryKey: ["journey", "targets"], queryFn: () => fetchTargets({ data: undefined as any }) });
  const target = targets.data?.find((t: any) => t.id === targetId);
  const professionId = target?.profession_id as string | undefined;
  const graph = professionId ? readProfessionGraph(professionId) : undefined;

  const [formalReports, setFormalReports] = useState<Record<string, "self_reported_as_met" | "not_applicable" | undefined>>({});

  const milestones = useQuery({
    queryKey: ["journey", "milestones", targetId],
    enabled: !!targetId,
    queryFn: () => fetchMilestones({ data: { targetId } }),
  });

  const analysis = useMemo(() => {
    if (!professionId) return null;
    return computeGapAnalysis({
      professionId,
      formalReports: Object.entries(formalReports)
        .filter(([, v]) => !!v)
        .map(([requirementId, status]) => ({ requirementId, status: status as "self_reported_as_met" | "not_applicable" })),
    });
  }, [professionId, formalReports]);

  const snapshot = useMutation({
    mutationFn: () => saveSnapshot({
      data: {
        targetId,
        formalReports: Object.entries(formalReports)
          .filter(([, v]) => !!v)
          .map(([requirementId, status]) => ({ requirementId, status: status as "self_reported_as_met" | "not_applicable" })),
      },
    }),
  });

  const addAction = useMutation({
    mutationFn: (input: { title: string; targetRef?: string; kind?: any }) =>
      addMilestone({ data: { targetId, title: input.title, targetRef: input.targetRef, milestoneKind: input.kind ?? "action" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journey", "milestones", targetId] }),
  });

  if (targets.isLoading) {
    return (
      <SiteLayout>
        <Section><p className="text-sm text-muted-foreground">Loading…</p></Section>
      </SiteLayout>
    );
  }

  if (!target || !graph) {
    return (
      <SiteLayout>
        <Section>
          <p>Target not found. <Link to="/journey" className="underline">Back to Journey</Link>.</p>
        </Section>
      </SiteLayout>
    );
  }

  const legal = analysis?.formalRequirementGaps.filter((g) => g.legalBlocker) ?? [];
  const development = analysis?.formalRequirementGaps.filter((g) => !g.legalBlocker) ?? [];

  return (
    <SiteLayout>
      <Section>
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="text-xs text-muted-foreground">
            <Link to="/journey" className="underline">← Journey</Link> · graph {GRAPH_VERSION}
          </div>

          <header className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{graph.titleSv}</h1>
            <p className="text-sm text-muted-foreground">{graph.titleEn}</p>
          </header>

          {graph.status !== "reviewed" && graph.status !== "published" && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              This profile is research-stage. Verify regulated requirements against the official sources listed below.
            </div>
          )}

          {/* Legal requirements */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Legal requirements</h2>
            {legal.length === 0 && (
              <p className="text-sm text-muted-foreground">No formal legal blockers on file for this role.</p>
            )}
            <ul className="space-y-2">
              {legal.map((g) => {
                const r = getFormalRequirement(g.requirementId)!;
                return (
                  <li key={g.requirementId} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{r.name.sv}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.name.en} · {r.authority.sv}
                          {g.appliesTo === "organization" && " · applies to employer"}
                        </div>
                        {r.authorityConductsSuitabilityCheck && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            The authority conducts suitability and background checks as part of approval/appointment.
                            You are not asked to upload personal records here.
                          </p>
                        )}
                      </div>
                      <StatusPicker
                        status={statusFor(g.status, formalReports[g.requirementId])}
                        appliesToOrg={g.appliesTo === "organization"}
                        onChange={(next) =>
                          setFormalReports((prev) => ({
                            ...prev,
                            [g.requirementId]: next === "self_reported_as_met" ? "self_reported_as_met"
                              : next === "not_applicable" ? "not_applicable"
                              : undefined,
                          }))
                        }
                      />
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => addAction.mutate({ title: `Verify: ${r.name.sv}`, targetRef: r.id, kind: "formal_requirement" })}
                        className="text-xs underline text-muted-foreground"
                      >
                        Add as next action
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Development requirements */}
          {development.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Development areas</h2>
              <ul className="space-y-2">
                {development.map((g) => {
                  const r = getFormalRequirement(g.requirementId)!;
                  return (
                    <li key={g.requirementId} className="rounded-md border p-3 text-sm">
                      <div className="font-medium">{r.name.sv}</div>
                      <div className="text-xs text-muted-foreground">{r.name.en} · {r.authority.sv}</div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Competencies (guidance signals) */}
          {graph.competencyIds.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Competencies (guidance)</h2>
              <p className="text-xs text-muted-foreground">
                These are guidance signals, strengths and development areas — not verified competence.
              </p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {graph.competencyIds.map((id) => {
                  const n = getCompetencyName(id);
                  return (
                    <li key={id} className="rounded-md border p-2 text-sm">
                      <span className="font-medium">{n?.sv ?? id}</span>
                      {n?.en && <span className="ml-2 text-xs text-muted-foreground">{n.en}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Education & certifications */}
          {(graph.educationIds.length > 0 || graph.certificationIds.length > 0) && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Education and certifications</h2>
              <ul className="space-y-1 text-sm">
                {graph.educationIds.map((id) => {
                  const n = getEducationName(id);
                  return <li key={`e-${id}`}>• {n?.sv ?? id}</li>;
                })}
                {graph.certificationIds.map((id) => {
                  const c = getCertification(id);
                  return <li key={`c-${id}`}>• {c?.fullName?.sv ?? id}</li>;
                })}
              </ul>
            </section>
          )}

          {/* Next action milestone */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Next action</h2>
            <NextActionForm onAdd={(title) => addAction.mutate({ title })} />
            {milestones.data && milestones.data.length > 0 && (
              <ul className="space-y-1 text-sm">
                {milestones.data.map((m: any) => (
                  <li key={m.id} className="rounded-md border p-2">
                    <span className="font-medium">{m.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{m.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sources */}
          {graph.sources.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xl font-semibold">Sources</h2>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {graph.sources.map((s, i) => (
                  <li key={i}>
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label.sv}</a> : s.label.sv}
                    {s.publisher && <span> — {s.publisher}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div>
            <button
              type="button"
              onClick={() => snapshot.mutate()}
              disabled={snapshot.isPending}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {snapshot.isPending ? "Saving…" : "Save gap snapshot"}
            </button>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}

function statusFor(computed: FormalStatus, local?: "self_reported_as_met" | "not_applicable"): FormalStatus {
  if (local) return local;
  return computed;
}

function StatusPicker({
  status,
  onChange,
  appliesToOrg,
}: {
  status: FormalStatus;
  onChange: (next: FormalStatus) => void;
  appliesToOrg?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <span className="rounded-full border px-2 py-0.5">{labelFor(status)}</span>
      {!appliesToOrg && (
        <div className="flex gap-2">
          <button type="button" className="underline" onClick={() => onChange("self_reported_as_met")}>I have this</button>
          <button type="button" className="underline" onClick={() => onChange("not_applicable")}>N/A</button>
          <button type="button" className="underline" onClick={() => onChange("not_provided")}>Clear</button>
        </div>
      )}
    </div>
  );
}

function labelFor(s: FormalStatus): string {
  switch (s) {
    case "required": return "required";
    case "self_reported_as_met": return "self-reported as met";
    case "not_provided": return "not provided";
    case "not_applicable": return "not applicable";
  }
}

function NextActionForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) {
          onAdd(v.trim());
          setV("");
        }
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="e.g. Enrol in väktarutbildning at authorised company"
        className="flex-1 rounded-md border px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded-md border px-3 py-2 text-sm">Add</button>
    </form>
  );
}
