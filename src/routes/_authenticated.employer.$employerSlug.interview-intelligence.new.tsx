// Create an Interview Case.
//
// The pack list comes from RLS, so an employer only ever sees versions they are
// entitled to use — published, pilot-granted, or already pinned by one of their
// own cases. The screen does not re-implement that rule, and therefore cannot
// contradict it.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  ErrorSummary,
  Panel,
  State,
  interviewErrorMessage,
  ValidationChip,
  FIELD,
  PRIMARY_BUTTON,
  BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  createInterviewCase,
  listStartableInterviewPacks,
} from "@/lib/interview-intelligence/runtime.functions";
import { getApplicationInterviewStart } from "@/lib/interview-intelligence/context.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/new",
)({
  ssr: false,
  component: Page,
  errorComponent: EmployerErrorState,
  // Arriving from an application carries the application with it, so the case
  // is bound to the real recruitment record rather than floating beside it.
  // Both are validated as uuids and both are optional: the workspace's own
  // "Ny intervju" button still opens an unlinked case, which is the right
  // behaviour for an interview that is not tied to an advert.
  validateSearch: (search: Record<string, unknown>) => ({
    applicationId:
      typeof search.applicationId === "string" && UUID.test(search.applicationId)
        ? search.applicationId
        : undefined,
    jobId: typeof search.jobId === "string" && UUID.test(search.jobId) ? search.jobId : undefined,
  }),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Page() {
  const { employerSlug } = Route.useParams();
  const { applicationId, jobId } = Route.useSearch();
  const navigate = useNavigate();
  const ws = useEmployerWorkspace(employerSlug);
  const { t } = useT();
  const summaryRef = useRef<HTMLDivElement>(null);

  const packsFn = useServerFn(listStartableInterviewPacks);
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

  // ── WHAT THE APPLICATION ALREADY ANSWERS ──────────────────────────────
  //
  // Arriving from an application, the recruiter has just read the candidate's
  // name and the advert's title on the previous screen. Asking them to type
  // both again is not merely friction: a retyped name produces a case filed
  // under a slightly different person from the application it is attached to,
  // and the case is the record that outlives the memory of who was meant.
  const prefillFn = useServerFn(getApplicationInterviewStart);
  const prefill = useQuery({
    queryKey: ["ii", "new-prefill", applicationId],
    queryFn: () => prefillFn({ data: { applicationId: applicationId! } }),
    enabled: Boolean(applicationId),
    // A prefill that fails costs keystrokes. It must never cost the recruiter
    // the ability to start the interview, so it is never retried into a state
    // where the form waits on it.
    retry: false,
  });

  // Fills the two fields ONCE, and only while they are still untouched. A
  // recruiter who has started typing owns the field from that moment: a late
  // response overwriting their words would be the worse bug of the two.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !prefill.data) return;
    prefilled.current = true;
    const name = prefill.data.candidateName;
    const role = prefill.data.roleSv ?? prefill.data.roleEn;
    setCandidate((current) => (current === "" && name ? name : current));
    setTitle((current) =>
      current === "" && (role || name) ? [role, name].filter(Boolean).join(" — ") : current,
    );
  }, [prefill.data]);

  // The job comes from the APPLICATION when we could read it, and from the URL
  // only as a fallback. An application cannot name another employer's job, so
  // the authoritative value is also the one that cannot be steered by a
  // hand-edited query string.
  const effectiveJobId = prefill.data?.jobId ?? jobId ?? null;

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          employerId: ws.workspace!.employerId,
          title,
          packVersionId,
          candidateDisplayName: candidate,
          // scp_iv_create_case re-checks that both belong to this employer and
          // raises SCP_IV_CROSS_TENANT_* otherwise, so a hand-edited URL cannot
          // attach a case to somebody else's application.
          applicationId: applicationId ?? null,
          jobId: effectiveJobId,
        },
      }),
    onSuccess: ({ caseId }) =>
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/prepare",
        params: { employerSlug, caseId },
      }),
    // The list and the create call share one entitlement definition, so a
    // refusal here means the state changed after the list was drawn -- the
    // package was withdrawn, or the account stopped being active. Re-read the
    // list so the screen stops offering something that can no longer be
    // started, rather than leaving a stale option under an error message.
    onError: () => {
      setPackVersionId("");
      void packs.refetch();
    },
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
    if (title.trim() === "") next.push({ fieldId: "ii-title", message: t("iiu.new.err.title") });
    if (candidate.trim() === "")
      // Was a hardcoded Swedish string on an otherwise translated form: an
      // English-language recruiter who left the field empty got the one
      // message on the screen they could not read.
      next.push({ fieldId: "ii-candidate", message: t("iiu.new.err.candidate") });
    if (packVersionId === "") next.push({ fieldId: "ii-pack", message: t("iiu.new.err.pack") });
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
      activeSection="interviewIntelligence"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <nav aria-label={t("iiu.breadcrumbs")} className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence"
          params={{ employerSlug }}
          className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtolist")}
        </Link>
      </nav>

      <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
        {t("iiu.new.title")}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t("iiu.new.lead")}
      </p>

      {packs.isLoading && (
        <div className="mt-6">
          <State kind="loading" />
        </div>
      )}
      {packs.isError && (
        <div className="mt-6 max-w-3xl">
          <State kind="error" message={interviewErrorMessage(packs.error, t)} />
        </div>
      )}

      {packs.isSuccess && !packs.data.canStart && (
        <div className="mt-6 max-w-3xl">
          <State kind="empty">{t("iiu.new.notactive")}</State>
        </div>
      )}

      {packs.isSuccess && packs.data.canStart && packs.data.packs.length === 0 && (
        <div className="mt-6 max-w-3xl">
          <State kind="empty">{t("iiu.new.nopacks")}</State>
        </div>
      )}

      {packs.isSuccess && packs.data.canStart && packs.data.packs.length > 0 && (
        <form onSubmit={onSubmit} noValidate className="mt-6 max-w-3xl space-y-5">
          <div ref={summaryRef} tabIndex={-1}>
            <ErrorSummary errors={errors} />
          </div>

          {create.isError && (
            <Panel tone="governance" role="alert" title={t("iiu.new.failed")}>
              <p className="whitespace-pre-line">{interviewErrorMessage(create.error, t)}</p>
            </Panel>
          )}

          <div>
            <label htmlFor="ii-title" className="text-sm font-medium text-foreground">
              {t("iiu.new.field.title")}
            </label>
            <input
              id="ii-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={errorFor("ii-title") !== null}
              aria-describedby={errorFor("ii-title") ? "ii-title-error" : undefined}
              className={FIELD}
            />
            {/* Said out loud, because a field that filled itself in is
             *  otherwise indistinguishable from one the recruiter half
             *  remembers typing — and they need to know it is theirs to
             *  change. */}
            {prefill.data?.candidateName && (
              <p className="mt-1 text-xs text-muted-foreground">{t("iiu.new.prefill")}</p>
            )}
            {errorFor("ii-title") && (
              <p id="ii-title-error" className="mt-1 text-xs text-destructive">
                {errorFor("ii-title")}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ii-candidate" className="text-sm font-medium text-foreground">
              {t("iiu.new.field.candidate")}
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
              {t("iiu.new.candidatehint")}
            </p>
            {errorFor("ii-candidate") && (
              <p id="ii-candidate-error" className="mt-1 text-xs text-destructive">
                {errorFor("ii-candidate")}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="ii-pack" className="text-sm font-medium text-foreground">
              {t("iiu.new.field.pack")}
            </label>
            <select
              id="ii-pack"
              value={packVersionId}
              onChange={(e) => setPackVersionId(e.target.value)}
              aria-invalid={errorFor("ii-pack") !== null}
              aria-describedby={errorFor("ii-pack") ? "ii-pack-error" : undefined}
              className={FIELD}
            >
              <option value="">{t("iiu.new.choosepack")}</option>
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
            <Panel tone="attention" title={t("iiu.new.pilot.title")}>
              <p>{t("iiu.new.pilot.body")}</p>
              <p>
                <ValidationChip label={chosen.validationLabel} />
              </p>
            </Panel>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" disabled={create.isPending} className={PRIMARY_BUTTON}>
              {create.isPending ? t("iiu.new.creating") : t("iiu.new.create")}
            </button>
            <Link
              to="/employer/$employerSlug/interview-intelligence"
              params={{ employerSlug }}
              className={BUTTON}
            >
              {t("iiu.new.cancel")}
            </Link>
          </div>
        </form>
      )}
    </EmployerAppShell>
  );
}
