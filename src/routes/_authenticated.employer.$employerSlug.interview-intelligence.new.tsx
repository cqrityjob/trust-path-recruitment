// Create an Interview Case.
//
// The pack list comes from RLS, so an employer only ever sees versions they are
// entitled to use — published, pilot-granted, or already pinned by one of their
// own cases. The screen does not re-implement that rule, and therefore cannot
// contradict it.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  ErrorSummary,
  Panel,
  State,
  ValidationChip,
  FIELD,
  PRIMARY_BUTTON,
  BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  createInterviewCase,
  listUsablePacks,
} from "@/lib/interview-intelligence/runtime.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/new",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

function Page() {
  const { employerSlug } = Route.useParams();
  const navigate = useNavigate();
  const ws = useEmployerWorkspace(employerSlug);
  const summaryRef = useRef<HTMLDivElement>(null);

  const packsFn = useServerFn(listUsablePacks);
  const createFn = useServerFn(createInterviewCase);

  const packs = useQuery({
    queryKey: ["ii", "packs", ws.workspace?.employerId],
    queryFn: () => packsFn({ data: { employerId: ws.workspace!.employerId } }),
    enabled: Boolean(ws.workspace?.employerId),
  });

  const [title, setTitle] = useState("");
  const [candidate, setCandidate] = useState("");
  const [packVersionId, setPackVersionId] = useState("");
  const [errors, setErrors] = useState<readonly { fieldId: string; message: string }[]>([]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          employerId: ws.workspace!.employerId,
          title,
          packVersionId,
          candidateDisplayName: candidate,
        },
      }),
    onSuccess: ({ caseId }) =>
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/prepare",
        params: { employerSlug, caseId },
      }),
  });

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const errorFor = (id: string) => errors.find((e) => e.fieldId === id)?.message ?? null;
  const chosen = packs.data?.packs.find((p) => p.packVersionId === packVersionId) ?? null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Array<{ fieldId: string; message: string }> = [];
    if (title.trim() === "")
      next.push({ fieldId: "ii-title", message: "Ange en rubrik för intervjun." });
    if (candidate.trim() === "")
      next.push({ fieldId: "ii-candidate", message: "Ange kandidatens namn eller referens." });
    if (packVersionId === "") next.push({ fieldId: "ii-pack", message: "Välj ett rollpaket." });
    setErrors(next);
    if (next.length > 0) {
      window.requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    create.mutate();
  }

  return (
    <EmployerAppShell
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      activeSection="assessments"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <nav aria-label="Brödsmulor" className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className="text-accent underline-offset-2 hover:underline"
        >
          Interview Intelligence
        </Link>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">Ny intervju</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Intervjun låses till en exakt version av rollpaketet. En senare ändring av paketet påverkar
        därför aldrig en pågående intervju eller en färdig rapport.
      </p>

      {packs.isLoading && (
        <div className="mt-6">
          <State kind="loading" />
        </div>
      )}
      {packs.isError && (
        <div className="mt-6 max-w-3xl">
          <State kind="error" message={(packs.error as Error).message} />
        </div>
      )}

      {packs.isSuccess && packs.data.packs.length === 0 && (
        <div className="mt-6 max-w-3xl">
          <State kind="empty">
            Inget rollpaket är tillgängligt för er ännu. Ett paket måste vara publicerat, eller så
            behöver ni ett pilotmedgivande från plattformen.
          </State>
        </div>
      )}

      {packs.isSuccess && packs.data.packs.length > 0 && (
        <form onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl space-y-5">
          <div ref={summaryRef} tabIndex={-1}>
            <ErrorSummary errors={errors} />
          </div>

          {create.isError && (
            <Panel tone="governance" role="alert" title="Intervjun kunde inte skapas">
              <p className="whitespace-pre-line">{(create.error as Error).message}</p>
            </Panel>
          )}

          <div>
            <label htmlFor="ii-title" className="text-sm font-medium text-foreground">
              Rubrik
            </label>
            <input
              id="ii-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={errorFor("ii-title") !== null}
              aria-describedby={errorFor("ii-title") ? "ii-title-error" : undefined}
              className={FIELD}
            />
            {errorFor("ii-title") && (
              <p id="ii-title-error" className="mt-1 text-xs text-destructive">
                {errorFor("ii-title")}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ii-candidate" className="text-sm font-medium text-foreground">
              Kandidat (namn eller referens)
            </label>
            <input
              id="ii-candidate"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
              aria-invalid={errorFor("ii-candidate") !== null}
              aria-describedby={
                errorFor("ii-candidate")
                  ? "ii-candidate-error ii-candidate-hint"
                  : "ii-candidate-hint"
              }
              className={FIELD}
            />
            <p id="ii-candidate-hint" className="mt-1 text-xs text-muted-foreground">
              Används för att identifiera underlaget internt.
            </p>
            {errorFor("ii-candidate") && (
              <p id="ii-candidate-error" className="mt-1 text-xs text-destructive">
                {errorFor("ii-candidate")}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ii-pack" className="text-sm font-medium text-foreground">
              Rollpaket
            </label>
            <select
              id="ii-pack"
              value={packVersionId}
              onChange={(e) => setPackVersionId(e.target.value)}
              aria-invalid={errorFor("ii-pack") !== null}
              aria-describedby={errorFor("ii-pack") ? "ii-pack-error" : undefined}
              className={FIELD}
            >
              <option value="">Välj rollpaket …</option>
              {packs.data.packs.map((p) => (
                <option key={p.packVersionId} value={p.packVersionId}>
                  {p.name} — v{p.versionNumber} ({p.locale})
                </option>
              ))}
            </select>
            {errorFor("ii-pack") && (
              <p id="ii-pack-error" className="mt-1 text-xs text-destructive">
                {errorFor("ii-pack")}
              </p>
            )}
          </div>

          {chosen && chosen.validationLabel === "pilot_hypothesis" && (
            <Panel tone="attention" title="Detta paket är en pilothypotes">
              <p>
                Innehållet är en genomarbetad hypotes som ännu inte är innehållsvaliderad genom
                dokumenterad arbetsanalys och expertpanel. Det får användas i en kontrollerad pilot
                och för intervjustöd, men inga vetenskapliga eller prediktiva påståenden får göras
                om det.
              </p>
              <p>
                <ValidationChip label={chosen.validationLabel} />
              </p>
            </Panel>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" disabled={create.isPending} className={PRIMARY_BUTTON}>
              {create.isPending ? "Skapar …" : "Skapa intervju"}
            </button>
            <Link
              to="/employer/$employerSlug/interview-intelligence"
              params={{ employerSlug }}
              className={BUTTON}
            >
              Avbryt
            </Link>
          </div>
        </form>
      )}
    </EmployerAppShell>
  );
}
