// The immutable Candidate Interview Report, its blockers, its audit trail and
// the interview's process quality.
//
// The report is built ONLY from confirmed evidence and recorded human
// assessments. It states that the employment decision belongs to the employer
// and records no outcome, because this engine does not make or store one.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseStatusChip,
  CaseSteps,
  Chip,
  LevelZeroNote,
  Panel,
  State,
  BUTTON,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  finaliseReport,
  getInterviewCase,
  getProcessQuality,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/report",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const qc = useQueryClient();

  const getFn = useServerFn(getInterviewCase);
  const qualityFn = useServerFn(getProcessQuality);
  const finaliseFn = useServerFn(finaliseReport);

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
    retry: false,
  });
  const quality = useQuery({
    queryKey: ["ii", "quality", caseId],
    queryFn: () => qualityFn({ data: { caseId } }),
    retry: false,
  });
  const finalise = useMutation({
    mutationFn: () => finaliseFn({ data: { caseId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ii"] });
    },
  });

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const shell = (children: React.ReactNode) => (
    <EmployerAppShell
      employerSlug={ws.workspace!.employerSlug}
      employerName={ws.workspace!.employerName}
      role={ws.workspace!.role}
      status={ws.workspace!.employerStatus}
      activeSection="assessments"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      {children}
    </EmployerAppShell>
  );

  if (q.isLoading) return shell(<State kind="loading" />);
  if (q.isError) {
    const nf = (q.error as Error).message.includes("NOT_FOUND");
    return shell(
      <State
        kind={nf ? "denied" : "error"}
        message={nf ? undefined : (q.error as Error).message}
      />,
    );
  }
  const d = q.data;
  if (!d) return shell(<State kind="loading" />);

  const report = d.report;
  const isFinal = report?.status === "final";
  const payload = (report?.payload ?? null) as null | Record<string, unknown>;
  const qual = quality.data?.quality ?? null;

  return shell(
    <>
      <nav aria-label="Brödsmulor" className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className="text-accent underline-offset-2 hover:underline"
        >
          Interview Intelligence
        </Link>
      </nav>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{d.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{d.candidateDisplayName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CaseStatusChip status={d.status} />
          {isFinal && (
            <Chip tone="confirmed" srPrefix="Rapport">
              Slutlig och oföränderlig
            </Chip>
          )}
          {report?.contentHash && (
            <Chip srPrefix="Innehållssumma">
              <code className="font-mono text-[11px]">{report.contentHash.slice(0, 12)}</code>
            </Chip>
          )}
        </div>
      </header>

      <div className="mt-6">
        <CaseSteps current={d.status} />
      </div>

      {/* ---- Blockers ---- */}
      {!isFinal && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-block">
          <h2 id="s-block" className="text-lg font-semibold text-foreground">
            Vad som återstår
          </h2>
          {d.blockers.length === 0 ? (
            <div className="mt-3">
              <Panel tone="confirmed" title="Inget hindrar rapporten">
                <p>
                  Allt AI föreslog har granskats av en människa och varje fråga har en bedömning.
                </p>
              </Panel>
              {finalise.isError && (
                <div className="mt-3">
                  <Panel tone="governance" role="alert" title="Rapporten kunde inte slutföras">
                    <p className="whitespace-pre-line">{(finalise.error as Error).message}</p>
                  </Panel>
                </div>
              )}
              <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Bekräfta att rapporten ska slutföras
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  En slutförd rapport är oföränderlig. En senare ändring kräver en ny version, och
                  den här bevaras.
                </p>
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} mt-3`}
                  onClick={() => finalise.mutate()}
                  disabled={finalise.isPending}
                >
                  {finalise.isPending ? "Slutför …" : "Slutför rapporten"}
                </button>
              </div>
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {d.blockers.map((b) => (
                <li
                  key={`${b.code}-${b.message}`}
                  className="rounded-md border border-amber-600/40 bg-amber-500/5 p-3 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">{b.code}</span>
                  <p className="mt-0.5 text-foreground">{b.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- The report ---- */}
      {isFinal && payload && (
        <section className="mt-8 max-w-4xl" aria-labelledby="s-report">
          <h2 id="s-report" className="text-lg font-semibold text-foreground">
            Kandidatrapport
          </h2>

          <div className="mt-3">
            <Panel tone="confirmed" title="Slutlig och oföränderlig">
              <p>
                Rapporten bygger enbart på evidens som en namngiven människa har bekräftat och på
                mänskliga bedömningar. Ett AI-förslag kan inte nå hit.
              </p>
            </Panel>
          </div>

          <div className="mt-4 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">Låst innehåll</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Rollpaket</dt>
                <dd className="text-foreground">{d.packName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Paketets innehållssumma</dt>
                <dd>
                  <code className="font-mono text-xs">
                    {String((payload.pinned as Record<string, unknown>)?.pack_content_hash ?? "—")}
                  </code>
                </dd>
              </div>
            </dl>
          </div>

          {Array.isArray(payload.questions) && (
            <ol className="mt-4 space-y-3">
              {(payload.questions as Array<Record<string, unknown>>).map((qq) => {
                const assessment = qq.assessment as Record<string, unknown> | null;
                const evidence = (qq.evidence ?? []) as Array<Record<string, unknown>>;
                const level = assessment ? Number(assessment.level) : null;
                return (
                  <li key={String(qq.code)} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="work">{String(qq.code)}</Chip>
                      {level !== null && (
                        <Chip
                          tone={level === 0 ? "attention" : "confirmed"}
                          srPrefix="Mänsklig bedömning"
                        >
                          Nivå {level} — {String(assessment?.level_meaning ?? "")}
                        </Chip>
                      )}
                      <Chip>{evidence.length} bekräftad evidens</Chip>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{String(qq.prompt)}</p>

                    {evidence.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {evidence.map((e, i) => (
                          <li
                            key={i}
                            className="rounded-md border border-teal-700/30 bg-teal-700/5 p-2.5 text-sm text-foreground"
                          >
                            {String(e.excerpt)}
                            {e.was_corrected === true && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (korrigerad av granskare)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {assessment && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        <p>
                          <span className="font-medium">Motivering: </span>
                          {String(assessment.rationale)}
                        </p>
                        {assessment.uncertainty ? (
                          <p className="mt-0.5">
                            <span className="font-medium">Osäkerhet: </span>
                            {String(assessment.uncertainty)}
                          </p>
                        ) : null}
                        <p className="mt-0.5">
                          <span className="font-medium">Ankare: </span>
                          {String(assessment.anchor)}
                        </p>
                        {level === 0 && (
                          <div className="mt-1.5">
                            <LevelZeroNote />
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {Array.isArray(payload.unresolved) && (payload.unresolved as unknown[]).length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Kvarstående och att verifiera
              </h3>
              <ul className="mt-2 space-y-1.5">
                {(payload.unresolved as Array<Record<string, unknown>>).map((f, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-amber-600/40 bg-amber-500/5 p-2.5 text-sm"
                  >
                    <Chip tone="attention">{String(f.kind)}</Chip>
                    <span className="ml-2 text-foreground">{String(f.statement)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <Panel tone="ai" title="AI:s roll">
              <p>{String((payload.ai_disclosure as Record<string, unknown>)?.statement ?? "")}</p>
            </Panel>
            <Panel tone="work" title="Beslutet">
              <p>{String(payload.decision_boundary ?? "")}</p>
            </Panel>
          </div>
        </section>
      )}

      {/* ---- Process quality ---- */}
      {qual && (
        <section className="mt-10 max-w-4xl" aria-labelledby="s-quality">
          <h2 id="s-quality" className="text-lg font-semibold text-foreground">
            Processkvalitet
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mått på hur intervjun genomfördes och hur fullständigt underlaget är. Inget här är ett
            mått på kandidaten, och ingenting jämförs mellan kandidater.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Frågor besvarade"
              value={`${qual.questions_answered}/${qual.questions_in_pack}`}
            />
            <Metric
              label="Dimensioner med bekräftad evidens"
              value={`${qual.dimensions_with_confirmed_evidence}/${qual.dimensions_in_pack}`}
            />
            <Metric
              label="AI-förslag korrigerade"
              value={`${qual.proposals_corrected}/${qual.proposals_total}`}
            />
            <Metric
              label="Väntar på granskning"
              value={qual.proposals_awaiting_review}
              tone={qual.proposals_awaiting_review > 0 ? "attention" : "neutral"}
            />
            <Metric
              label="Otillräcklig evidens (nivå 0)"
              value={qual.insufficient_evidence_count}
              tone="attention"
            />
            <Metric
              label="Verifieringar kvar"
              value={qual.verifications_outstanding}
              tone={qual.verifications_outstanding > 0 ? "attention" : "neutral"}
            />
            <Metric label="Bedömare" value={qual.assessors_involved} />
            <Metric
              label="Intervjuaren reflekterade"
              value={qual.interviewer_reflected ? "Ja" : "Nej"}
            />
          </div>
        </section>
      )}

      {/* ---- Audit ---- */}
      <section className="mt-10 max-w-4xl" aria-labelledby="s-audit">
        <h2 id="s-audit" className="text-lg font-semibold text-foreground">
          Spårbarhet
        </h2>
        {d.events.length === 0 ? (
          <div className="mt-3">
            <State kind="empty">Ingen historik ännu.</State>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="sr-only">Händelsehistorik för intervjun</caption>
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2">
                    Händelse
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Utförd av
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Orsak
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Tid
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.events.map((e) => (
                  <tr key={e.seq}>
                    <th scope="row" className="px-4 py-2 font-medium text-foreground">
                      {e.event}
                    </th>
                    <td className="px-4 py-2">
                      <Chip
                        tone={
                          e.actorKind === "ai"
                            ? "ai"
                            : e.actorKind === "system"
                              ? "neutral"
                              : "confirmed"
                        }
                      >
                        {e.actorKind === "ai"
                          ? "AI"
                          : e.actorKind === "system"
                            ? "System"
                            : "Människa"}
                      </Chip>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {new Date(e.at).toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/evidence"
          params={{ employerSlug, caseId }}
          className={BUTTON}
        >
          Evidensgranskning
        </Link>
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className={BUTTON}
        >
          Alla intervjuer
        </Link>
      </div>
    </>,
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "attention";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${tone === "attention" ? "border-amber-600/40" : "border-border"} bg-muted/20`}
    >
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
