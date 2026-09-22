// Employee 360 — one colleague, one page, the post-hire mirror of Candidate 360.
//
// ── WHAT THIS PAGE USED TO BE ───────────────────────────────────────────
//
// Three headings, two of which rendered nothing. "Kompetensutveckling" was a
// link to every programme the organisation had ever assigned to anybody;
// "Kompetenser & certifikat" was a lede over empty space. The assessments
// section was real and is unchanged.
//
// The audit's finding was that the recruitment half of the lifecycle hands
// each step its context and the post-hire half does not. This page is where
// that stops: who and where, what the role requires, what this person's own
// development activity is, what has been assessed, and one next step that
// carries the person with it.
//
// ── THE IDENTITY RULE, STATED ONCE ──────────────────────────────────────
//
// Nothing on this page holds, renders or sends a subject reference. Every
// server call takes `{ employerId, employeeId }` -- a product-level identifier
// this organisation already owns -- and the canonical identity is resolved
// server-side behind it. That is governance rule 10 and it is now also the
// Product Owner's contract.
//
// ── AND THE LINE THAT MUST NEVER BE CROSSED ─────────────────────────────
//
// A completed programme renders as "Programme completed". It is never called
// verified competence, and nothing here moves, derives or displays a maturity:
// training_completion carries counts_toward_maturity = false in the database,
// and this page adds no second opinion. There is no readiness score, no gap
// percentage, no met/unmet and no pass or fail anywhere on it.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, ClipboardList, GraduationCap, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import type { Lang, TranslationKey } from "@/i18n/dictionaries";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { WorkforcePage } from "@/components/academy/AcademyWorkspace";
import { LifecycleChip, nextActionLabel } from "@/components/academy/LifecycleChip";
import {
  getPersonAssessments,
  type PersonAssessmentRow,
} from "@/lib/security-competency/assessment-lifecycle.functions";
import {
  getEmployeeCompetenceContext,
  listEmployeeDevelopmentActivity,
  type CompetenceRequirement,
  type EmployeeDevelopmentRow,
} from "@/lib/security-competency/employee-development.functions";
import { listEmployerEmployees } from "@/lib/job-intelligence/employer-workforce.functions";
import { formatDate } from "@/lib/job-intelligence/date-format";

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
        <PersonDetail
          employerId={ws.employerId}
          employerSlug={employerSlug}
          personId={personId}
          canAssign={ws.role === "owner" || ws.role === "admin"}
        />
      )}
    </WorkforcePage>
  );
}

function PersonDetail({
  employerId,
  employerSlug,
  personId,
  canAssign,
}: {
  employerId: string;
  employerSlug: string;
  personId: string;
  /** Assigning a programme is owner/admin, the same boundary the database
   *  applies. The control is hidden rather than offered-and-refused; the
   *  database still re-decides on write. */
  canAssign: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listEmployees = useServerFn(listEmployerEmployees);
  const listAssessments = useServerFn(getPersonAssessments);
  const competenceFn = useServerFn(getEmployeeCompetenceContext);
  const developmentFn = useServerFn(listEmployeeDevelopmentActivity);

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

  const competence = useQuery({
    queryKey: ["employer", employerId, "person", personId, "competence"],
    queryFn: () => competenceFn({ data: { employerId, employeeId: personId } }),
  });

  const development = useQuery({
    queryKey: ["employer", employerId, "person", personId, "development"],
    queryFn: () => developmentFn({ data: { employerId, employeeId: personId } }),
  });

  const rows = (assessments.data ?? []) as PersonAssessmentRow[];

  // The evidence this organisation actually holds about this person, counted
  // from the section below rather than from a second read -- so the two can
  // never disagree about how many reports exist. A released employer snapshot
  // is the only assessment evidence an employer may see, and it is therefore
  // the only thing this page may call evidence.
  const releasedReports = rows.filter(
    (a) => a.lifecycleState === "result_available" && a.employerSnapshotId,
  ).length;

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

      {/* ── 1 · Who and where ──────────────────────────────────────── */}
      <h1 className="mt-4 text-2xl font-semibold text-foreground sm:text-3xl">
        {person ? `${person.firstName} ${person.lastName}` : t("employer.person.unknown")}
      </h1>
      {person && (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <Fact label={t("employer.person.roleTitle")}>{person.roleTitle ?? "—"}</Fact>
            <Fact label={t("employer.person.site")}>{person.siteName ?? "—"}</Fact>
            <Fact label={t("employer.person.startDate")}>
              {person.startDate ? formatDate(person.startDate, lang) : "—"}
            </Fact>
            <Fact label={t("employer.person.status")}>
              {t(
                person.employmentStatus === "active"
                  ? "employer.workforce.status.active"
                  : "employer.workforce.status.inactive",
              )}
            </Fact>
          </dl>

          {/* ── THE DOOR BACK ──────────────────────────────────────────
           *
           *  The candidate page has offered the door forwards since the hire
           *  bridge landed -- "this person is now in Medarbetare" -- and there
           *  was no way back. An employer looking at a colleague and wanting
           *  the assessment, the interview and the report behind the decision
           *  to hire them had to find the application by name, which is how
           *  one person becomes two records in somebody's head.
           *
           *  Drawn only when the lineage column actually carries an
           *  application. An employee added by hand has none, and this block
           *  simply is not there -- it never says "added directly", because
           *  that is a fact about the record and not about the person. */}
          {person.hiredFromApplicationId && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-[color:var(--surface-subtle)] p-3 text-sm text-foreground">
              <ClipboardList className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {t("employer.person.hiredFrom")}
              <Link
                to="/employer/$employerSlug/applications/$applicationId"
                params={{ employerSlug, applicationId: person.hiredFromApplicationId }}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                {t("employer.person.hiredFrom.open")}
              </Link>
            </p>
          )}
        </>
      )}

      {/* ── 2 · Competence today ───────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="person-competence">
        <h2 id="person-competence" className="text-lg font-semibold text-foreground">
          {t("employer.person.competence.heading")}
        </h2>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.person.competence.lede")}
        </p>

        {competence.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : competence.isError ? (
          <p className="mt-4 text-sm text-destructive">
            {t("employer.person.competence.loadError")}
          </p>
        ) : competence.data?.state !== "ready" ? (
          /* AN HONEST EMPTY STATE, and two of them, because the two reasons
             are different facts: no role has been recorded against this
             employment, or a role has and the catalogue does not publish it.
             A reader who sees nothing under a role title they recognise needs
             to know the catalogue is the reason and not their colleague. */
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {competence.data?.state === "professionNotPublished"
              ? t("employer.person.competence.professionNotPublished")
              : t("employer.person.competence.noProfession")}
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-foreground">
              {t("employer.person.competence.profession")}{" "}
              <span className="font-medium">
                {(lang === "en"
                  ? competence.data.professionTitleEn
                  : competence.data.professionTitleSv) ?? competence.data.professionSlug}
              </span>
            </p>

            {competence.data.requirements.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                {t("employer.person.competence.noRequirements")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {competence.data.requirements.map((r) => (
                  <RequirementRow key={r.competencyId} requirement={r} lang={lang} />
                ))}
              </ul>
            )}

            {/* WHAT THE ORGANISATION ACTUALLY HOLDS, said as a count of
                documents and never as a verdict. An employer may see a
                released report and nothing else about a person's competence;
                claiming more than that on this page would be inventing
                evidence that does not exist. */}
            <p className="mt-4 flex flex-wrap items-start gap-2 rounded-lg border border-border bg-[color:var(--surface-subtle)] p-3 text-sm text-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span>
                {releasedReports > 0
                  ? t("employer.person.competence.evidenceSome")
                  : t("employer.person.competence.evidenceNone")}
              </span>
            </p>
          </>
        )}
      </section>

      {/* ── 3 · Development ────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="person-development">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="person-development" className="text-lg font-semibold text-foreground">
            {t("employer.person.development.heading")}
          </h2>
          {canAssign && (
            <AssignProgrammeLink employerSlug={employerSlug} personId={personId} qc={qc} />
          )}
        </div>
        <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
          {t("employer.person.development.lede")}
        </p>

        {development.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : development.isError ? (
          <p className="mt-4 text-sm text-destructive">
            {t("employer.person.development.loadError")}
          </p>
        ) : development.data?.state === "unlinked" ? (
          /* Development activity is attached to a PERSON, and this employment
             record is not yet linked to one. An empty list here would read as
             "this colleague has had no development", which is a claim about
             them rather than about the record. */
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {t("employer.person.development.unlinked")}
          </p>
        ) : (development.data?.rows.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {t("employer.person.development.empty")}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {development.data!.rows.map((r) => (
              <DevelopmentRow key={r.assignmentId} row={r} lang={lang} />
            ))}
          </ul>
        )}
      </section>

      {/* ── 4 · Assessments ────────────────────────────────────────── */}
      <section className="mt-10 pb-4" aria-labelledby="person-assessments">
        <h2 id="person-assessments" className="text-lg font-semibold text-foreground">
          {t("employer.person.assessments.heading")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("employer.person.assessments.lede")}
        </p>

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
                      {a.assignedAt && ` · ${formatDate(a.assignedAt, lang)}`}
                    </p>
                  </div>
                  <LifecycleChip state={a.lifecycleState} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>{nextActionLabel(t, a.lifecycleState)}</span>
                  {a.submittedAt && (
                    <span>
                      {t("employer.person.assessments.submitted")} {formatDate(a.submittedAt, lang)}
                    </span>
                  )}
                  {a.reviewsOpen > 0 && (
                    <span className="tabular-nums">
                      {t("employer.person.assessments.reviewsOpen")} {a.reviewsOpen}
                    </span>
                  )}
                  {a.releasedAt && (
                    <span>
                      {t("employer.person.assessments.released")} {formatDate(a.releasedAt, lang)}
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** One requirement of the ROLE.
 *
 *  It describes the profession and says nothing about the person in front of
 *  it: there is no state here for met, unmet, in progress or at risk, because
 *  the product has no honest way to compute one and inventing it would be the
 *  readiness score governance rule 1 forbids. */
function RequirementRow({ requirement, lang }: { requirement: CompetenceRequirement; lang: Lang }) {
  const { t } = useT();
  const description = lang === "en" ? requirement.descriptionEn : requirement.descriptionSv;
  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          {lang === "en" ? requirement.titleEn : requirement.titleSv}
        </p>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {t(
            CRITICALITY_LABEL[requirement.criticality] ?? "employer.person.competence.criticality",
          )}
        </span>
      </div>
      {description && (
        <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </li>
  );
}

/** The catalogue's own criticality vocabulary, translated. An unrecognised
 *  value falls back to the neutral word rather than rendering a raw
 *  identifier. */
const CRITICALITY_LABEL: Record<string, TranslationKey> = {
  essential: "employer.person.competence.criticality.essential",
  important: "employer.person.competence.criticality.important",
  supporting: "employer.person.competence.criticality.supporting",
};

/** One development assignment.
 *
 *  THE WORDING RULE LIVES HERE. A finished programme says "Programme
 *  completed" and nothing stronger: training is a development activity, it is
 *  recorded as training_completion evidence, that source type carries
 *  counts_toward_maturity = false, and calling it verified competence on this
 *  page would assert in the interface what the database deliberately refuses
 *  to assert. */
function DevelopmentRow({ row, lang }: { row: EmployeeDevelopmentRow; lang: Lang }) {
  const { t } = useT();
  const name = lang === "en" ? row.programmeNameEn : row.programmeNameSv;
  const stateKey: TranslationKey =
    row.status === "completed"
      ? "employer.person.development.state.completed"
      : row.status === "cancelled"
        ? "employer.person.development.state.cancelled"
        : row.status === "in_progress"
          ? "employer.person.development.state.inProgress"
          : "employer.person.development.state.assigned";

  return (
    <li className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("employer.training.assigned")}{" "}
            {row.assignedAt ? formatDate(row.assignedAt, lang) : "—"}
            {row.completedAt &&
              ` · ${t("employer.training.completed")} ${formatDate(row.completedAt, lang)}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {t(stateKey)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {row.modulesCompleted}/{row.modulesTotal} {t("employer.training.modules")}
        </span>
        <div
          className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-[color:var(--surface-subtle)]"
          role="progressbar"
          aria-valuenow={row.modulesCompleted}
          aria-valuemin={0}
          aria-valuemax={row.modulesTotal}
          aria-label={name}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{
              width: `${row.modulesTotal > 0 ? Math.round((row.modulesCompleted / row.modulesTotal) * 100) : 0}%`,
            }}
          />
        </div>
      </div>
    </li>
  );
}

/** "Assign a development programme", carrying the person.
 *
 *  It used to link to /training/programmes, which knew nothing about who was
 *  being looked at, so the employer re-found them by typing an address into a
 *  form they had just navigated away from. The employee now travels in the
 *  URL as a product-level id, the library reads it, and the assignment is made
 *  through a server function that resolves the person behind it. */
function AssignProgrammeLink({
  employerSlug,
  personId,
  qc,
}: {
  employerSlug: string;
  personId: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { t } = useT();
  return (
    <Link
      to="/employer/$employerSlug/training/programmes"
      params={{ employerSlug }}
      search={{ employee: personId }}
      // The person's own caches, so returning to this page after assigning
      // shows the programme rather than yesterday's list.
      onClick={() => {
        void qc.invalidateQueries({ queryKey: ["employer"] });
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {t("employer.person.development.assign")}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
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
