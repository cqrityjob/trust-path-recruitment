import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { listContentLibrary } from "@/lib/security-competency/academy-employer.functions";
import { listEmployerJobs } from "@/lib/job-intelligence/employer-jobs.functions";
import { listRecruitmentCandidatesPage } from "@/lib/recruitment/recruitment.functions";
import { getTestAssignmentAccess } from "@/lib/library/start.functions";
import { resolveLevelOffers } from "@/lib/library/levels";
import type { RoleGroup } from "@/lib/library/catalogue";
import { SendTestDialog } from "./SendTestDialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function SendTestEntry({
  employerId,
  employerSlug,
  initialGroup,
  initialVersionId,
}: {
  employerId: string;
  employerSlug: string;
  initialGroup?: RoleGroup;
  initialVersionId?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="send-test-entry"
        className="my-3 min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground"
        onClick={() => setOpen(true)}
      >
        {t("sendTest.action")}
      </button>
      {open && (
        <TestRecipients
          employerId={employerId}
          employerSlug={employerSlug}
          initialGroup={initialGroup}
          initialVersionId={initialVersionId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TestRecipients({
  employerId,
  employerSlug,
  initialGroup,
  initialVersionId,
  onClose,
}: {
  employerId: string;
  employerSlug: string;
  initialGroup?: RoleGroup;
  initialVersionId?: string;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";
  const jobsFn = useServerFn(listEmployerJobs);
  const appsFn = useServerFn(listRecruitmentCandidatesPage);
  const accessFn = useServerFn(getTestAssignmentAccess);
  const [job, setJob] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<
    Map<string, { applicationId: string; name: string | null; jobTitle: string }>
  >(new Map());
  const [next, setNext] = useState(false);
  const access = useQuery({
    queryKey: ["employer", employerId, "test-assignment-access"],
    queryFn: () => accessFn({ data: { employerId } }),
  });
  const jobs = useQuery({
    queryKey: ["employer", employerId, "test-recruitments"],
    queryFn: () => jobsFn({ data: { employerId } }),
    enabled: access.data?.allowed === true,
  });
  const apps = useQuery({
    queryKey: ["employer", employerId, "test-recipients", job, page, search],
    queryFn: () =>
      appsFn({
        data: { employerId, jobId: job, view: { stage: "open", page, q: search || undefined } },
      }),
    enabled: access.data?.allowed === true && !!job,
  });
  const chosenJob = jobs.data?.find((j) => j.id === job);
  const jobTitle = (sv ? chosenJob?.title_sv : (chosenJob?.title_en ?? chosenJob?.title_sv)) ?? "—";
  const candidates = [...selected.values()];
  if (next && candidates.length)
    return (
      <SendTestDialog
        employerId={employerId}
        employerSlug={employerSlug}
        applicationId={candidates[0].applicationId}
        candidateName={candidates[0].name}
        jobTitle={candidates[0].jobTitle}
        candidates={candidates.length > 1 ? candidates : undefined}
        initialGroup={initialGroup}
        initialVersionId={initialVersionId}
        onClose={onClose}
      />
    );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogTitle>{t("sendTest.action")}</DialogTitle>
        <DialogDescription>
          {sv
            ? "Välj rekrytering och de sökande som ska få testet."
            : "Choose a recruitment and the applicants to receive the test."}
        </DialogDescription>
        {access.isPending ? (
          <p>{t("employer.loading")}</p>
        ) : access.isError ? (
          <p role="alert">{t("sendTest.error.unavailable")}</p>
        ) : !access.data.allowed ? (
          <p role="alert" data-refusal={access.data.reason}>
            {access.data.reason === "organisation_under_review"
              ? t("sendTest.refusal.underReview")
              : access.data.reason === "organisation_not_active"
                ? t("sendTest.refusal.notActive")
                : sv
                  ? "Skicka test kräver aktiv ägar- eller administratörsbehörighet. Kontrollera vald organisation eller kontakta dess ägare för rätt åtkomst."
                  : "Sending tests requires active owner or administrator access. Check the selected organisation or contact its owner for access."}
          </p>
        ) : (
          <>
            <label>
              {sv ? "Rekrytering" : "Recruitment"}
              <select
                className="mt-1 w-full rounded border p-2"
                value={job}
                onChange={(e) => {
                  setJob(e.target.value);
                  setSelected(new Map());
                  setPage(1);
                  setSearch("");
                }}
              >
                <option value="">{sv ? "Välj rekrytering" : "Choose recruitment"}</option>
                {(jobs.data ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {(sv ? j.title_sv : (j.title_en ?? j.title_sv)) ?? "—"}
                  </option>
                ))}
              </select>
            </label>
            {jobs.isLoading && <p>{t("employer.loading")}</p>}
            {(jobs.data?.length ?? 0) >= 200 && (
              <p>
                {sv
                  ? "De senaste 200 rekryteringarna visas. Äldre rekryteringar kan öppnas från rekryteringslistan."
                  : "Showing the latest 200 recruitments. Open older recruitments from the recruitment list."}
              </p>
            )}
            {(jobs.isError || apps.isError) && (
              <p role="alert">
                {t("sendTest.error.unavailable")}{" "}
                <button
                  className="underline"
                  onClick={() => {
                    void jobs.refetch();
                    if (job) void apps.refetch();
                  }}
                >
                  {sv ? "Försök igen" : "Retry"}
                </button>
              </p>
            )}
            {job && (
              <>
                <label>
                  {sv ? "Sök kandidat" : "Search applicant"}
                  <input
                    className="w-full rounded border p-2"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                {apps.isLoading && <p>{t("employer.loading")}</p>}
                {apps.isSuccess && !apps.data.total && (
                  <p>{sv ? "Inga öppna ansökningar matchar." : "No open applications match."}</p>
                )}
                <fieldset>
                  <legend>{sv ? "Mottagare" : "Recipients"}</legend>
                  {(apps.data?.rows ?? []).map((a) => (
                    <label
                      key={a.applicationId}
                      className="flex min-h-11 items-center gap-3 border-b py-2"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(a.applicationId)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const n = new Map(prev);
                            if (e.target.checked)
                              n.set(a.applicationId, {
                                applicationId: a.applicationId,
                                name: a.name,
                                jobTitle,
                              });
                            else n.delete(a.applicationId);
                            return n;
                          })
                        }
                      />
                      {a.name ?? t("sendTest.recipientAnonymous")}
                    </label>
                  ))}
                </fieldset>
                {apps.data && apps.data.pages > 1 && (
                  <div className="flex items-center justify-between">
                    <button
                      disabled={page <= 1 || apps.isFetching}
                      onClick={() => setPage(page - 1)}
                    >
                      {sv ? "Föregående" : "Previous"}
                    </button>
                    <span>
                      {page} / {apps.data.pages}
                    </span>
                    <button
                      disabled={page >= apps.data.pages || apps.isFetching}
                      onClick={() => setPage(page + 1)}
                    >
                      {sv ? "Nästa" : "Next"}
                    </button>
                  </div>
                )}
              </>
            )}
            <p className="text-sm">
              {sv ? "Markerade:" : "Selected:"}{" "}
              {candidates.map((c) => c.name ?? t("sendTest.recipientAnonymous")).join(", ") || "—"}
            </p>
            <button
              className="min-h-11 rounded bg-accent px-4 text-accent-foreground disabled:opacity-50"
              disabled={!candidates.length}
              onClick={() => setNext(true)}
            >
              {sv ? "Välj test" : "Choose test"} ({candidates.length})
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TestBank({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";
  const load = useServerFn(listContentLibrary);
  const q = useQuery({
    queryKey: ["employer", employerId, "library", "recruitment"],
    queryFn: () => load({ data: { employerId } }),
  });
  const offers = resolveLevelOffers(q.data ?? [], new Set());
  return (
    <section data-testid="test-bank">
      <h1 className="text-3xl font-semibold">{sv ? "Testbank" : "Test library"}</h1>
      <p className="mt-2 text-muted-foreground">
        {sv
          ? "Välj test och skicka det direkt till sökande i en rekrytering."
          : "Choose a test and send it directly to applicants in a recruitment."}
      </p>
      {q.isLoading && <p>{t("employer.loading")}</p>}
      {q.isError && (
        <p role="alert">
          {t("sendTest.error.unavailable")}{" "}
          <button onClick={() => void q.refetch()} className="underline">
            {sv ? "Försök igen" : "Retry"}
          </button>
        </p>
      )}
      {q.isSuccess && (
        <>
          <div className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {sv ? "Yrkesbedömningar" : "Role assessments"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sv
                ? "Kunskap och omdöme i situationer från yrket."
                : "Knowledge and judgement in situations from the role."}
            </p>
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {offers.map((o) => {
              const a = o.assessment;
              return (
                <article
                  key={o.level.group}
                  className="flex flex-col rounded-xl border bg-card p-5"
                >
                  <h2 className="text-lg font-semibold leading-snug">
                    {a ? (sv ? a.nameSv : a.nameEn) : t(`sendTest.level.${o.level.group}`)}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t(`sendTest.level.${o.level.group}.purpose`)}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        {sv ? "Målgrupp" : "Audience"}
                      </dt>
                      <dd>{t(`sendTest.level.${o.level.group}.audience`)}</dd>
                    </div>
                    {a && (
                      <>
                        <div>
                          <dt className="text-xs text-muted-foreground">{sv ? "Tid" : "Time"}</dt>
                          <dd>
                            {a.minutesMin && a.minutesMax
                              ? `${a.minutesMin}–${a.minutesMax} min`
                              : "–"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            {sv ? "Språk" : "Languages"}
                          </dt>
                          <dd>
                            {q.data
                              .find((r) => r.itemId === a.itemId)
                              ?.languages.join(", ")
                              .toUpperCase()}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                  {a && (
                    <>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {a.validationStatus === "validated"
                          ? sv
                            ? "Validerat innehåll"
                            : "Validated content"
                          : sv
                            ? "Pilotinnehåll – inte validerat"
                            : "Pilot content — not validated"}{" "}
                        · {a.contentStatus} · v
                        {q.data.find((r) => r.itemId === a.itemId)?.versionNumber}
                      </p>
                    </>
                  )}
                  {o.state === "sendable" ? (
                    <SendTestEntry
                      employerId={employerId}
                      employerSlug={employerSlug}
                      initialGroup={o.level.group}
                    />
                  ) : (
                    <p className="mt-auto pt-3 text-sm text-muted-foreground">
                      {t(
                        o.draftAwaitingRelease
                          ? "sendTest.level.strategic.pendingApproval"
                          : "sendTest.level.notAssignable",
                      )}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <div className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {sv ? "Abstrakt problemlösning" : "Abstract reasoning"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sv
                ? "Mönster i figurer, utan koppling till ett visst yrke."
                : "Patterns in figures, not tied to a specific role."}
            </p>
          </div>
        </>
      )}
      {(q.data ?? [])
        .filter(
          (a) =>
            a.libraryKind === "assessment" &&
            a.designedFor === "recruitment_support" &&
            !offers.some((o) => o.level.assessmentSlug === a.slug),
        )
        .map((a) => (
          <article
            key={a.itemId}
            data-testid={a.slug === "abstract_reasoning_v1" ? "sentinel-test-card" : undefined}
            className="my-3 rounded-xl border border-l-4 border-l-accent bg-card p-5"
          >
            <h2 className="text-lg font-semibold leading-snug">{sv ? a.nameSv : a.nameEn}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{sv ? a.summarySv : a.summaryEn}</p>
            {a.slug === "abstract_reasoning_v1" && (
              <p className="mt-2 text-sm text-muted-foreground">
                {sv
                  ? "Problemlösning · Pilotinnehåll – inte psykometriskt validerat · v1"
                  : "Reasoning · Pilot content — not psychometrically validated · v1"}
              </p>
            )}
            {a.slug !== "abstract_reasoning_v1" && (
              <p>
                {sv ? a.targetRoleSv : a.targetRoleEn} · {a.languages.join(", ")} · v
                {a.versionNumber} · {a.contentStatus} · {a.validationStatus}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{sv ? "Tid" : "Time"}</dt>
                <dd>
                  {a.minutesMin === a.minutesMax ? a.minutesMin : `${a.minutesMin}–${a.minutesMax}`}{" "}
                  min
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{sv ? "Språk" : "Languages"}</dt>
                <dd>{a.languages.join(" / ").toUpperCase()}</dd>
              </div>
              {a.slug === "abstract_reasoning_v1" && (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {sv ? "Uppgifter" : "Questions"}
                  </dt>
                  <dd>20</dd>
                </div>
              )}
            </dl>
            {a.assignable ? (
              <SendTestEntry
                employerId={employerId}
                employerSlug={employerSlug}
                initialVersionId={a.itemId}
              />
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {a.slug === "abstract_reasoning_v1"
                  ? sv
                    ? "Inväntar innehålls- och releasegodkännande."
                    : "Awaiting content and release approval."
                  : t("sendTest.level.notAssignable")}
              </p>
            )}
          </article>
        ))}
      <div className="mt-6 border-t pt-4">
        <h2 className="font-semibold">{sv ? "Intervjuguider" : "Interview guides"}</h2>
        <p className="text-sm text-muted-foreground">
          {sv
            ? "Ett separat flöde för att förbereda intervjuer."
            : "A separate flow for preparing interviews."}
        </p>
        <Link
          to="/employer/$employerSlug/assessments/library"
          params={{ employerSlug }}
          search={{ view: "guides" }}
          className="mt-2 inline-block underline"
        >
          {sv ? "Förbered intervju" : "Prepare interview"}
        </Link>
      </div>
    </section>
  );
}
