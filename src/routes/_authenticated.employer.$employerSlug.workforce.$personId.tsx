// #51 — Min personal > Medarbetare > [Person].
//
// The employer's lightweight competence view of one person. It is NOT an HRIS:
// it answers what this person has been assessed on, where each assessment
// stands, and what the employer should do next.
//
// The assessment history is resolved through the employment record's
// subject_id, never by matching an email. That is the whole point of the
// identity spine: a person who changes address, or whose employer recorded a
// work address while their account uses a private one, keeps their history.
//
// Both current and released work appear here. A page that showed only finished
// assessments would leave the employer wondering where the one they assigned
// yesterday went -- which is the question this whole lifecycle exists to answer.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { WorkforcePage } from "@/components/academy/AcademyWorkspace";
import { LifecycleChip, nextActionLabel } from "@/components/academy/LifecycleChip";
import {
  getPersonAssessments,
  type PersonAssessmentRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";
import { listEmployerEmployees } from "@/lib/job-intelligence/employer-workforce.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/workforce/$personId")({
  ssr: false,
  component: PersonRoute,
  errorComponent: EmployerErrorState,
});

function PersonRoute() {
  const { employerSlug, personId } = Route.useParams();
  return (
    <WorkforcePage employerSlug={employerSlug}>
      {(ws) => (
        <PersonDetail employerId={ws.employerId} employerSlug={employerSlug} personId={personId} />
      )}
    </WorkforcePage>
  );
}

function PersonDetail({
  employerId,
  employerSlug,
  personId,
}: {
  employerId: string;
  employerSlug: string;
  personId: string;
}) {
  const { t, lang } = useT();
  const listEmployees = useServerFn(listEmployerEmployees);
  const listAssessments = useServerFn(getPersonAssessments);

  // The roster is already a governed, RLS-scoped read; picking the one person
  // out of it avoids inventing a second single-employee endpoint.
  const people = useQuery({
    queryKey: ["employer", employerId, "employees"],
    queryFn: () => listEmployees({ data: { employerId } }),
  });
  const person = (people.data ?? []).find((p: { id: string }) => p.id === personId);

  const assessments = useQuery({
    queryKey: ["employer", employerId, "person", personId, "assessments"],
    queryFn: () => listAssessments({ data: { employerId, employeeId: personId } }),
  });

  const rows = (assessments.data ?? []) as PersonAssessmentRow[];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link
        to="/employer/$employerSlug/workforce"
        params={{ employerSlug }}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("employer.person.backToWorkforce")}
      </Link>

      {/* ── Översikt ───────────────────────────────────────────────── */}
      <h1 className="mt-4 text-2xl font-semibold text-foreground sm:text-3xl">
        {person ? `${person.firstName} ${person.lastName}` : t("employer.person.unknown")}
      </h1>
      {person && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <Fact label={t("employer.person.roleTitle")}>{person.roleTitle ?? "—"}</Fact>
          <Fact label={t("employer.person.site")}>{person.siteName ?? "—"}</Fact>
          <Fact label={t("employer.person.status")}>
            {t(
              person.employmentStatus === "active"
                ? "employer.workforce.status.active"
                : "employer.workforce.status.inactive",
            )}
          </Fact>
        </dl>
      )}

      {/* ── Tester & bedömningar ───────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">
          {t("employer.person.assessments.heading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("employer.person.assessments.lede")}
        </p>

        {/* Assigning belongs in the person's context: an employer looking at
            somebody is exactly where they decide to develop them. The assign
            step needs content chosen first, so this leads to a library rather
            than inventing a second assignment flow.
            
            That library is Kompetensutveckling's, not the recruitment one.
            This used to point at Bedomningsbibliotek, which now holds only
            content written for recruitment -- so an employer standing on a
            colleague's page would have been offered a candidate assessment and
            nothing else. What this organisation assigns to its own people is a
            development programme, and that is where the link goes. */}
        <Link
          to="/employer/$employerSlug/training/programmes"
          params={{ employerSlug }}
          className="mt-4 inline-flex rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("employer.person.development.assign")}
        </Link>

        {assessments.isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : assessments.isError ? (
          <p className="mt-6 text-sm text-destructive">
            {t("employer.person.assessments.loadError")}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {t("employer.person.assessments.empty")}
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {rows.map((a) => (
              <li
                key={a.attemptId}
                className="rounded-xl border border-border bg-background p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {(lang === "en" ? a.assessmentNameEn : a.assessmentNameSv) ??
                        a.assessmentSlug}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        a.useCase === "recruitment"
                          ? "lifecycle.purpose.recruitment"
                          : "lifecycle.purpose.workforce",
                      )}
                      {a.assignedAt && ` · ${new Date(a.assignedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <LifecycleChip state={a.lifecycleState} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>{nextActionLabel(t, a.lifecycleState)}</span>
                  {a.submittedAt && (
                    <span>
                      {t("employer.person.assessments.submitted")}{" "}
                      {new Date(a.submittedAt).toLocaleDateString()}
                    </span>
                  )}
                  {a.reviewsOpen > 0 && (
                    <span className="tabular-nums">
                      {t("employer.person.assessments.reviewsOpen")} {a.reviewsOpen}
                    </span>
                  )}
                  {a.releasedAt && (
                    <span>
                      {t("employer.person.assessments.released")}{" "}
                      {new Date(a.releasedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* The report link appears only once the row actually carries a
                    released employer snapshot. Whether a report may be opened is
                    the server's answer, not a guess made from a date. */}
                {a.lifecycleState === "result_available" && a.employerSnapshotId && (
                  <Link
                    to="/employer/$employerSlug/assessments/results/$attemptId"
                    params={{ employerSlug, attemptId: a.attemptId }}
                    className="mt-3 inline-flex rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    {t("employer.person.assessments.openReport")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Kompetensutveckling ────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">
          {t("employer.person.development.heading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("employer.person.development.lede")}
        </p>
        <Link
          to="/employer/$employerSlug/training/participants"
          params={{ employerSlug }}
          className="mt-3 inline-flex rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("employer.person.development.open")}
        </Link>
      </section>

      {/* ── Kompetenser & certifikat ───────────────────────────────── */}
      <section className="mt-10 pb-4">
        <h2 className="text-lg font-semibold text-foreground">
          {t("employer.person.credentials.heading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("employer.person.credentials.lede")}
        </p>
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
