// Employer Assessment Assignment — assign form.
//
// Entry points: Assessment Center detail page ("Assign assessment"),
// Applications (assign to a specific applicant), Workforce (assign to a
// specific employee) — all land here with optional search params
// pre-filling context; nothing about the form itself is entry-point
// specific.

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Check, Copy } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  listApplicationsForEmployer,
  type EmployerApplicationRow,
} from "@/lib/job-intelligence/applications.functions";
import {
  listEmployerEmployees,
  type EmployerEmployeeRow,
} from "@/lib/job-intelligence/employer-workforce.functions";
import { createAssessmentAssignment } from "@/lib/job-intelligence/assessment-assignments.functions";
import type { TranslationKey } from "@/i18n/dictionaries";

const ERROR_CODE_KEY: Record<string, TranslationKey> = {
  ORGANISATION_NOT_ACTIVE: "assignment.form.error.orgNotActive",
  ASSESSMENT_NOT_ASSIGNABLE: "assignment.form.error.generic",
  NO_PUBLISHED_VERSION: "assignment.form.error.generic",
  APPLICATION_NOT_FOUND: "assignment.form.error.generic",
  EMPLOYEE_NOT_FOUND: "assignment.form.error.generic",
  ACCESS_NOT_AVAILABLE: "assignment.form.error.generic",
  ASSIGNMENT_CREATE_FAILED: "assignment.form.error.generic",
};

function translateAssignmentError(
  message: string | undefined,
  t: (k: TranslationKey) => string,
): string {
  return t(ERROR_CODE_KEY[message ?? ""] ?? "assignment.form.error.generic");
}

const searchSchema = z.object({
  assessmentId: z.string().default("security-guard-foundation"),
  applicationId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/assign")({
  ssr: false,
  component: EmployerAssignAssessmentPage,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

type RecipientMode = "applicant" | "employee" | "email";

function EmployerAssignAssessmentPage() {
  const { employerSlug } = Route.useParams();
  const search = Route.useSearch();
  const { t } = useT();
  const ws = useEmployerWorkspace(employerSlug);

  if (!ws.portalEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }
  if (ws.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }
  if (ws.isError || !ws.workspace) {
    return <EmployerAccessDenied workspaces={ws.workspaces} />;
  }

  return (
    <AssignForm
      employerId={ws.workspace.employerId}
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
      assessmentId={search.assessmentId}
      initialApplicationId={search.applicationId ?? null}
      initialEmployeeId={search.employeeId ?? null}
    />
  );
}

function AssignForm({
  employerId,
  employerSlug,
  employerName,
  role,
  status,
  hasMultipleWorkspaces,
  assessmentId,
  initialApplicationId,
  initialEmployeeId,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
  assessmentId: string;
  initialApplicationId: string | null;
  initialEmployeeId: string | null;
}) {
  const { t, lang } = useT();
  const navigate = useNavigate();

  const [useCase, setUseCase] = useState<"recruitment" | "workforce">(
    initialEmployeeId ? "workforce" : "recruitment",
  );
  const [recipientMode, setRecipientMode] = useState<RecipientMode>(
    initialEmployeeId ? "employee" : initialApplicationId ? "applicant" : "email",
  );
  const [applicationId, setApplicationId] = useState<string>(initialApplicationId ?? "");
  const [employeeId, setEmployeeId] = useState<string>(initialEmployeeId ?? "");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<"sv" | "en">(lang);
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const listApplicationsFn = useServerFn(listApplicationsForEmployer);
  const listEmployeesFn = useServerFn(listEmployerEmployees);
  const createFn = useServerFn(createAssessmentAssignment);

  const applicationsQuery = useQuery({
    queryKey: ["employer", employerId, "applications"],
    queryFn: () => listApplicationsFn({ data: { employerId } }),
    enabled: recipientMode === "applicant",
  });
  const employeesQuery = useQuery({
    queryKey: ["employer", employerId, "employees"],
    queryFn: () => listEmployeesFn({ data: { employerId } }),
    enabled: recipientMode === "employee",
  });

  const applications: EmployerApplicationRow[] = applicationsQuery.data ?? [];
  const employees: EmployerEmployeeRow[] = (employeesQuery.data ?? []).filter(
    (e) => e.employmentStatus === "active",
  );

  const selectedApplication = useMemo(
    () => applications.find((a) => a.id === applicationId),
    [applications, applicationId],
  );
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId),
    [employees, employeeId],
  );

  const createMutation = useMutation({
    mutationFn: () => {
      const recipientEmail =
        recipientMode === "email"
          ? email
          : recipientMode === "employee"
            ? (selectedEmployee?.email ?? email)
            : email; // applicant email resolved server-side from the account; the field below still collects a fallback contact address for the employer's own reference

      return createFn({
        data: {
          employerId,
          assessmentId,
          useCase,
          recipientEmail: recipientEmail || "unknown@invalid.example",
          applicationId: recipientMode === "applicant" ? applicationId || null : null,
          employeeId: recipientMode === "employee" ? employeeId || null : null,
          language,
          employerMessage: message || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        },
      });
    },
    onSuccess: (result) => {
      setFormError(null);
      const url = `${window.location.origin}/invite/${result.invitationToken}`;
      setCreatedLink(url);
    },
    onError: (e: any) => setFormError(translateAssignmentError(e?.message, t)),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (recipientMode === "applicant" && !applicationId) {
      setFormError(t("assignment.form.error.selectApplicant"));
      return;
    }
    if (recipientMode === "employee" && !employeeId) {
      setFormError(t("assignment.form.error.selectEmployee"));
      return;
    }
    if (recipientMode === "email" && !email.trim()) {
      setFormError(t("assignment.form.error.enterEmail"));
      return;
    }
    createMutation.mutate();
  }

  if (createdLink) {
    return (
      <EmployerAppShell
        employerSlug={employerSlug}
        employerName={employerName}
        role={role}
        status={status}
        activeSection="assessments"
        hasMultipleWorkspaces={hasMultipleWorkspaces}
      >
        <div className="mx-auto max-w-xl">
          <h1 className="text-xl font-semibold text-foreground">
            {t("assignment.form.success.heading")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("assignment.form.success.body")}</p>
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
            <input
              readOnly
              value={createdLink}
              className="flex-1 truncate bg-transparent text-sm text-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(createdLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t("assignment.form.success.copied") : t("assignment.form.success.copy")}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("assignment.form.success.deliveryNote")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/employer/$employerSlug/assessments/assignments"
              params={{ employerSlug }}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t("assignment.form.success.viewAssignments")}
            </Link>
            <button
              type="button"
              onClick={() => setCreatedLink(null)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted/40"
            >
              {t("assignment.form.success.assignAnother")}
            </button>
          </div>
        </div>
      </EmployerAppShell>
    );
  }

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="assessments"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          {t("assignment.form.heading")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("assignment.form.subheading")}</p>

        {status !== "active" && (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            {t("assignment.form.orgNotActive")}
          </div>
        )}

        {formError && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-6">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("assignment.form.useCase")}
            </legend>
            <div className="mt-2 flex gap-2">
              {(["recruitment", "workforce"] as const).map((uc) => (
                <button
                  key={uc}
                  type="button"
                  onClick={() => setUseCase(uc)}
                  className={
                    "rounded-md border px-3 py-1.5 text-sm font-medium " +
                    (useCase === uc
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {t(
                    uc === "recruitment"
                      ? "employer.assessments.useCase.recruitment.title"
                      : "employer.assessments.useCase.development.title",
                  )}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("assignment.form.recipient")}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["applicant", "employee", "email"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRecipientMode(m)}
                  className={
                    "rounded-md border px-3 py-1.5 text-sm font-medium " +
                    (recipientMode === m
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground hover:text-foreground")
                  }
                >
                  {t(`assignment.form.recipientMode.${m}` as TranslationKey)}
                </button>
              ))}
            </div>

            {recipientMode === "applicant" && (
              <select
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("assignment.form.selectApplicant")}</option>
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.applicantDisplayName ?? t("employer.applications.anonymousCandidate")) +
                      " — " +
                      ((lang === "sv" ? a.jobTitleSv : a.jobTitleEn) ||
                        a.jobTitleSv ||
                        a.jobTitleEn ||
                        "")}
                  </option>
                ))}
              </select>
            )}

            {recipientMode === "employee" && (
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("assignment.form.selectEmployee")}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                    {emp.roleTitle ? ` — ${emp.roleTitle}` : ""}
                  </option>
                ))}
              </select>
            )}

            {(recipientMode === "email" ||
              (recipientMode === "employee" && selectedEmployee && !selectedEmployee.email) ||
              recipientMode === "applicant") && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("assignment.form.emailPlaceholder")}
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            )}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-muted-foreground">
              {t("assignment.form.language")}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "sv" | "en")}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="sv">Svenska</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              {t("assignment.form.expiresAt")}
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-muted-foreground">
            {t("assignment.form.message")}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending || status !== "active"}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? t("employer.loading") : t("assignment.form.submit")}
            </button>
            <button
              type="button"
              onClick={() =>
                navigate({ to: "/employer/$employerSlug/assessments", params: { employerSlug } })
              }
              className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium hover:bg-muted/40"
            >
              {t("employer.workforce.form.cancel")}
            </button>
          </div>
        </form>
      </div>
    </EmployerAppShell>
  );
}
