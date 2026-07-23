// Employer OS Phase 1 — Workforce module: Employee Directory.
//
// First real "existing workforce" surface, per the Employer OS product
// vision: a candidate and an employee are the same underlying person at
// different stages, and Workforce is the second entry point (alongside
// Recruitment) into that eventual shared Competency Graph. This phase is
// deliberately data-minimised (see supabase/migrations/20260722090000_
// employer_workforce_employees.sql) -- name, optional email, role title,
// optional site, employment status, start date. No payroll, scheduling,
// disciplinary, background-check, medical or automatic-decision data
// exists anywhere in this schema.
//
// Access-resolution pattern identical to every other
// /employer/$employerSlug/* route: the slug is a lookup key only,
// re-verified independently via listMyEmployerWorkspaces() on every load.

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  EmployerAppShell,
  type EmployerRole,
  type EmployerStatus,
} from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { formatDate } from "@/lib/job-intelligence/date-format";
import {
  listEmployerEmployees,
  createEmployerEmployee,
  updateEmployerEmployee,
  setEmployerEmployeeStatus,
  type EmployerEmployeeRow,
} from "@/lib/job-intelligence/employer-workforce.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/workforce/")({
  ssr: false,
  component: EmployerWorkforcePage,
  errorComponent: EmployerErrorState,
});

function EmployerWorkforcePage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: employerPortalEnabled(),
  });

  if (!employerPortalEnabled()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }

  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  if (workspacesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (workspacesQuery.isError || !workspace) {
    return <EmployerAccessDenied workspaces={workspacesQuery.data} />;
  }

  return (
    <WorkforceDirectory
      employerId={workspace.employerId}
      employerSlug={workspace.employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    />
  );
}

type FormValues = {
  firstName: string;
  lastName: string;
  email: string;
  roleTitle: string;
  siteName: string;
  startDate: string;
};

const EMPTY_FORM: FormValues = {
  firstName: "",
  lastName: "",
  email: "",
  roleTitle: "",
  siteName: "",
  startDate: "",
};

function WorkforceDirectory({
  employerId,
  employerSlug,
  employerName,
  role,
  status,
  hasMultipleWorkspaces,
}: {
  employerId: string;
  employerSlug: string;
  employerName: string;
  role: EmployerRole;
  status: EmployerStatus;
  hasMultipleWorkspaces: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployerEmployees);
  const createFn = useServerFn(createEmployerEmployee);
  const updateFn = useServerFn(updateEmployerEmployee);
  const setStatusFn = useServerFn(setEmployerEmployeeStatus);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormValues>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["employer", employerId, "employees"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["employer", employerId, "employees"] });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createFn({
        data: {
          employerId,
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          roleTitle: values.roleTitle,
          siteName: values.siteName,
          startDate: values.startDate,
        },
      }),
    onSuccess: () => {
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      setFormError(null);
      invalidate();
    },
    onError: () => setFormError(t("employer.workforce.error.save")),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { employeeId: string; values: FormValues }) =>
      updateFn({
        data: {
          employerId,
          employeeId: vars.employeeId,
          firstName: vars.values.firstName,
          lastName: vars.values.lastName,
          email: vars.values.email,
          roleTitle: vars.values.roleTitle,
          siteName: vars.values.siteName,
          startDate: vars.values.startDate,
        },
      }),
    onSuccess: () => {
      setEditId(null);
      setFormError(null);
      invalidate();
    },
    onError: () => setFormError(t("employer.workforce.error.save")),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { employeeId: string; employmentStatus: "active" | "inactive" }) =>
      setStatusFn({
        data: { employerId, employeeId: vars.employeeId, employmentStatus: vars.employmentStatus },
      }),
    onSuccess: () => invalidate(),
  });

  const rows: EmployerEmployeeRow[] = query.data ?? [];

  function startEdit(row: EmployerEmployeeRow) {
    setEditId(row.id);
    setEditForm({
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email ?? "",
      roleTitle: row.roleTitle ?? "",
      siteName: row.siteName ?? "",
      startDate: row.startDate ?? "",
    });
  }

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={employerName}
      role={role}
      status={status}
      activeSection="workforce"
      hasMultipleWorkspaces={hasMultipleWorkspaces}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {t("employer.workforce.heading")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("employer.workforce.subheading")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            setFormError(null);
          }}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          {t("employer.workforce.action.add")}
        </button>
      </div>

      {formError && (
        <p
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {formError}
        </p>
      )}

      {showAdd && (
        <EmployeeForm
          values={addForm}
          onChange={setAddForm}
          onCancel={() => setShowAdd(false)}
          onSubmit={() => createMutation.mutate(addForm)}
          submitting={createMutation.isPending}
          submitLabel={t("employer.workforce.form.save")}
        />
      )}

      <div className="mt-6">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{t("employer.workforce.error.load")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {t("employer.workforce.empty.heading")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("employer.workforce.empty.body")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) =>
              editId === row.id ? (
                <li
                  key={row.id}
                  className="rounded-xl border border-accent/50 bg-background p-4 shadow-sm"
                >
                  <EmployeeForm
                    values={editForm}
                    onChange={setEditForm}
                    onCancel={() => setEditId(null)}
                    onSubmit={() => updateMutation.mutate({ employeeId: row.id, values: editForm })}
                    submitting={updateMutation.isPending}
                    submitLabel={t("employer.workforce.form.save")}
                  />
                </li>
              ) : (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {row.firstName} {row.lastName}
                      </p>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest " +
                          (row.employmentStatus === "active"
                            ? "border border-border text-muted-foreground"
                            : "border border-dashed border-border text-muted-foreground/70")
                        }
                      >
                        {t(
                          row.employmentStatus === "active"
                            ? "employer.workforce.status.active"
                            : "employer.workforce.status.inactive",
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[row.roleTitle, row.siteName].filter(Boolean).join(" · ") || "—"}
                      {row.startDate ? ` · ${formatDate(row.startDate, lang)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-none gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                    >
                      {t("employer.workforce.action.edit")}
                    </button>
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          employeeId: row.id,
                          employmentStatus:
                            row.employmentStatus === "active" ? "inactive" : "active",
                        })
                      }
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                    >
                      {t(
                        row.employmentStatus === "active"
                          ? "employer.workforce.action.deactivate"
                          : "employer.workforce.action.reactivate",
                      )}
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </EmployerAppShell>
  );
}

function EmployeeForm({
  values,
  onChange,
  onCancel,
  onSubmit,
  submitting,
  submitLabel,
}: {
  values: FormValues;
  onChange: (v: FormValues) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  const { t } = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-4 rounded-xl border border-border bg-muted/10 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("employer.workforce.form.firstName")} required>
          <input
            required
            value={values.firstName}
            onChange={(e) => onChange({ ...values, firstName: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("employer.workforce.form.lastName")} required>
          <input
            required
            value={values.lastName}
            onChange={(e) => onChange({ ...values, lastName: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("employer.workforce.form.email")}>
          <input
            type="email"
            value={values.email}
            onChange={(e) => onChange({ ...values, email: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("employer.workforce.form.roleTitle")}>
          <input
            value={values.roleTitle}
            onChange={(e) => onChange({ ...values, roleTitle: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("employer.workforce.form.siteName")}>
          <input
            value={values.siteName}
            onChange={(e) => onChange({ ...values, siteName: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t("employer.workforce.form.startDate")}>
          <input
            type="date"
            value={values.startDate}
            onChange={(e) => onChange({ ...values, startDate: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
        >
          {t("employer.workforce.form.cancel")}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      {required ? " *" : ""}
      <div className="mt-1">{children}</div>
    </label>
  );
}
