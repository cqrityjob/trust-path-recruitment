// Admin Portal — user detail + platform role grant/revoke.
//
// Grant/revoke is only offered when the CURRENT caller is themselves a
// superadmin (adminWhoAmI's isSuperadmin flag, read fresh here -- never
// inferred from anything client-cached). Even then, admin_set_platform_role()
// is the real boundary: it independently re-verifies is_superadmin(),
// blocks changing one's own role, and blocks removing the last superadmin
// -- this page's own gating is a friendly UX convenience, not the
// enforcement.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  adminGetUserDetail,
  adminSetPlatformRole,
} from "@/lib/job-intelligence/admin-users-roles.functions";
import { adminWhoAmI } from "@/lib/job-intelligence/admin.functions";
import {
  adminGetPersonOverview,
  adminGetUserDeletionImpact,
  adminSetUserDisabled,
  adminAnonymiseUser,
  adminDeleteUser,
} from "@/lib/job-intelligence/admin-lifecycle.functions";
import { DangerZone, AccountDeletionImpactPreview } from "@/components/admin/DangerZone";
import { lifecycleErrorKey } from "@/lib/job-intelligence/admin-lifecycle-labels";
import { formatDate, formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  ssr: false,
  component: AdminUserDetailPage,
  errorComponent: AdminErrorState,
});

const ERROR_KEY: Record<string, TranslationKey> = {
  SELF_ROLE_CHANGE_NOT_ALLOWED: "admin.users.detail.error.selfChange",
  LAST_SUPERADMIN_PROTECTED: "admin.users.detail.error.lastSuperadmin",
  FORBIDDEN_SUPERADMIN_REQUIRED: "admin.users.detail.error.forbidden",
};

function AdminUserDetailPage() {
  const { userId } = Route.useParams();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetUserDetail);
  const whoAmIFn = useServerFn(adminWhoAmI);
  const setRoleFn = useServerFn(adminSetPlatformRole);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "user-detail", userId],
    queryFn: () => getFn({ data: { userId } }),
  });
  const whoAmI = useQuery({
    queryKey: ["admin", "whoami"],
    queryFn: () => whoAmIFn(),
  });

  // The canonical person view: one governed read that spans the account, the
  // pseudonymous subject, employment, applications, assessment history and
  // Passport. It reports COUNTS for everything evidential -- an administrator
  // learns that three claims exist, never what they assert.
  const overviewFn = useServerFn(adminGetPersonOverview);
  const overview = useQuery({
    queryKey: ["admin", "person-overview", userId],
    queryFn: () => overviewFn({ data: { userId } }),
    retry: false,
  });

  const impactFn = useServerFn(adminGetUserDeletionImpact);
  const impact = useQuery({
    queryKey: ["admin", "user-deletion-impact", userId],
    queryFn: () => impactFn({ data: { userId } }),
    retry: false,
  });

  const navigate = useNavigate();
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleDone, setLifecycleDone] = useState(false);

  function refreshPerson() {
    setLifecycleError(null);
    setLifecycleDone(true);
    qc.invalidateQueries({ queryKey: ["admin", "person-overview", userId] });
    qc.invalidateQueries({ queryKey: ["admin", "user-deletion-impact", userId] });
    qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] });
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  const setDisabledFn = useServerFn(adminSetUserDisabled);
  const setDisabled = useMutation({
    mutationFn: (vars: { disabled: boolean; reason: string }) =>
      setDisabledFn({ data: { userId, disabled: vars.disabled, reason: vars.reason } }),
    onSuccess: refreshPerson,
    onError: (e: Error) => {
      setLifecycleDone(false);
      setLifecycleError(e.message);
    },
  });

  const anonymiseFn = useServerFn(adminAnonymiseUser);
  const anonymise = useMutation({
    mutationFn: (vars: { reason: string }) =>
      anonymiseFn({
        data: {
          userId,
          reason: vars.reason,
          confirmEmail: overview.data?.account.email ?? "",
        },
      }),
    onSuccess: refreshPerson,
    onError: (e: Error) => {
      setLifecycleDone(false);
      setLifecycleError(e.message);
    },
  });

  const deleteUserFn = useServerFn(adminDeleteUser);
  const deleteUser = useMutation({
    mutationFn: (vars: { reason: string }) =>
      deleteUserFn({
        data: {
          userId,
          reason: vars.reason,
          confirmEmail: overview.data?.account.email ?? "",
        },
      }),
    onSuccess: (result) => {
      refreshPerson();
      // The account IS erased -- that committed in the database. Any Storage
      // object still owed is a separate, retryable obligation, so it is
      // carried to the list as a warning rather than reported as a failed
      // deletion, which it is not. Datahantering is where it can be chased.
      navigate({
        to: "/admin/users",
        search: result.storageObjectsOwed > 0 ? { storageOwed: result.storageObjectsOwed } : {},
      });
    },
    onError: (e: Error) => {
      setLifecycleDone(false);
      setLifecycleError(e.message);
    },
  });

  const lifecyclePending = setDisabled.isPending || anonymise.isPending || deleteUser.isPending;

  const setRole = useMutation({
    mutationFn: (vars: { role: "admin" | "superadmin"; grant: boolean }) =>
      setRoleFn({ data: { targetUserId: userId, role: vars.role, grant: vars.grant } }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin", "user-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="users">
          <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
        </AdminShellChrome>
      </SiteLayout>
    );
  }
  if (q.isError || !q.data) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="users">
          <h1 className="text-xl font-semibold text-foreground">
            {t("admin.users.detail.notFound")}
          </h1>
          <div className="mt-4">
            <Link to="/admin/users" className="text-sm font-medium text-accent hover:underline">
              {t("admin.users.detail.backToList")}
            </Link>
          </div>
        </AdminShellChrome>
      </SiteLayout>
    );
  }

  const user = q.data;
  const isSelf = whoAmI.data?.userId === userId;

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="users">
        <Link to="/admin/users" className="text-xs font-medium text-accent hover:underline">
          ← {t("admin.users.detail.backToList")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {user.displayName ?? user.email ?? user.id}
        </h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.users.detail.section.account")}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.users.detail.field.created")}
                </dt>
                <dd className="text-foreground">
                  {user.createdAt ? formatDateTime(user.createdAt, lang) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.users.detail.field.lastSignIn")}
                </dt>
                <dd className="text-foreground">
                  {user.lastSignInAt ? formatDateTime(user.lastSignInAt, lang) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.users.detail.field.emailConfirmed")}
                </dt>
                <dd className="text-foreground">
                  {user.emailConfirmedAt ? formatDateTime(user.emailConfirmedAt, lang) : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.users.detail.section.roles")}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {user.isCandidate && (
                <Badge variant="outline">{t("admin.users.role.candidate")}</Badge>
              )}
              {user.memberships.length > 0 && (
                <Badge variant="outline">{t("admin.users.role.employerMember")}</Badge>
              )}
              {user.isAdmin && <Badge variant="secondary">{t("admin.users.role.admin")}</Badge>}
              {user.isSuperadmin && <Badge>{t("admin.users.role.superadmin")}</Badge>}
            </div>

            {whoAmI.data?.isSuperadmin && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.users.detail.platformRoles")}
                </p>
                {isSelf ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("admin.users.detail.error.selfChange")}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={user.isAdmin ? "outline" : "default"}
                      disabled={setRole.isPending}
                      onClick={() => setRole.mutate({ role: "admin", grant: !user.isAdmin })}
                    >
                      {user.isAdmin
                        ? t("admin.users.detail.action.revokeAdmin")
                        : t("admin.users.detail.action.grantAdmin")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={user.isSuperadmin ? "outline" : "default"}
                      disabled={setRole.isPending}
                      onClick={() =>
                        setRole.mutate({ role: "superadmin", grant: !user.isSuperadmin })
                      }
                    >
                      {user.isSuperadmin
                        ? t("admin.users.detail.action.revokeSuperadmin")
                        : t("admin.users.detail.action.grantSuperadmin")}
                    </Button>
                  </div>
                )}
                {error && (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    {ERROR_KEY[error] ? t(ERROR_KEY[error]) : error}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {user.memberships.length > 0 && (
          <section className="mt-6 rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.users.detail.section.memberships")}
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-4">{t("admin.users.detail.column.employer")}</th>
                    <th className="py-1.5 pr-4">{t("admin.users.detail.column.role")}</th>
                    <th className="py-1.5 pr-4">{t("admin.users.detail.column.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {user.memberships.map((m) => (
                    <tr key={m.employerId}>
                      <td className="py-1.5 pr-4">
                        <Link
                          to="/admin/employers/$employerId"
                          params={{ employerId: m.employerId }}
                          className="text-accent hover:underline"
                        >
                          {m.employerName}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-4">{m.role}</td>
                      <td className="py-1.5 pr-4">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {overview.data && (
          <>
            <section className="mt-6 rounded-lg border border-border bg-background p-5">
              <h2 className="text-sm font-semibold text-foreground">
                {t("admin.lifecycle.person.section.identity")}
              </h2>
              <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("admin.lifecycle.person.field.subject")}
                  </dt>
                  <dd className="text-foreground">
                    {overview.data.subjectId ? (
                      <code className="text-xs">{overview.data.subjectId}</code>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("admin.lifecycle.person.field.noSubject")}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("admin.lifecycle.person.section.account")}
                  </dt>
                  <dd
                    className={
                      overview.data.account.disabled ? "text-destructive" : "text-foreground"
                    }
                  >
                    {overview.data.account.disabled
                      ? t("admin.lifecycle.person.field.disabled")
                      : t("admin.lifecycle.person.field.active")}
                  </dd>
                </div>
              </dl>
            </section>

            {overview.data.employment.length > 0 && (
              <section className="mt-6 rounded-lg border border-border bg-background p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("admin.lifecycle.person.section.employment")}
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {overview.data.employment.map((e) => (
                    <li key={e.employeeId} className="flex flex-wrap justify-between gap-2">
                      <Link
                        to="/admin/employers/$employerId"
                        params={{ employerId: e.employerId }}
                        className="text-accent hover:underline"
                      >
                        {e.employerName}
                      </Link>
                      <span className="text-muted-foreground">{e.employmentStatus}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {overview.data.applications.length > 0 && (
              <section className="mt-6 rounded-lg border border-border bg-background p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("admin.lifecycle.person.section.applications")}
                </h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-1.5 pr-4">{t("employer.jobs.list.title")}</th>
                        <th className="py-1.5 pr-4">{t("admin.users.detail.column.employer")}</th>
                        <th className="py-1.5 pr-4">{t("admin.users.detail.column.status")}</th>
                        <th className="py-1.5 pr-4">{t("admin.employers.detail.field.created")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {overview.data.applications.map((a) => (
                        <tr key={a.id}>
                          <td className="py-1.5 pr-4">
                            <Link
                              to="/admin/applications/$applicationId"
                              params={{ applicationId: a.id }}
                              className="text-accent hover:underline"
                            >
                              {a.titleSv || a.titleEn || "—"}
                            </Link>
                          </td>
                          <td className="py-1.5 pr-4">{a.employerName}</td>
                          <td className="py-1.5 pr-4">{a.status}</td>
                          <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                            {formatDate(a.createdAt, lang)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-border bg-background p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("admin.lifecycle.person.section.assessments")}
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Count
                    label={t("admin.lifecycle.person.counts.assignments")}
                    value={overview.data.assessments.assignments}
                  />
                  <Count
                    label={t("admin.lifecycle.person.counts.runs")}
                    value={overview.data.assessments.runs}
                  />
                  <Count
                    label={t("admin.lifecycle.person.counts.attempts")}
                    value={overview.data.assessments.attempts}
                  />
                  <Count
                    label={t("admin.lifecycle.person.counts.releasedReports")}
                    value={overview.data.assessments.releasedReports}
                  />
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("admin.lifecycle.person.evidenceNote")}
                </p>
              </section>

              <section className="rounded-lg border border-border bg-background p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  {t("admin.lifecycle.person.section.passport")}
                </h2>
                {overview.data.passport.hasProfile ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <Count
                      label={t("admin.lifecycle.person.counts.claims")}
                      value={overview.data.passport.claims}
                    />
                    <Count
                      label={t("admin.lifecycle.person.counts.evidence")}
                      value={overview.data.passport.evidence}
                    />
                    <Count
                      label={t("admin.lifecycle.person.counts.activeDisclosures")}
                      value={overview.data.passport.activeDisclosures}
                    />
                    <Count
                      label={t("admin.lifecycle.person.counts.verificationRequests")}
                      value={overview.data.passport.verificationRequests}
                    />
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("admin.lifecycle.person.passport.none")}
                  </p>
                )}
              </section>
            </div>

            <DangerZone
              title={t("admin.lifecycle.person.dangerTitle")}
              description={t("admin.lifecycle.person.dangerDescription")}
              pending={lifecyclePending}
              errorMessage={lifecycleError ? t(lifecycleErrorKey(lifecycleError)) : null}
              successMessage={lifecycleDone ? t("admin.lifecycle.person.action.success") : null}
              actions={[
                overview.data.account.disabled
                  ? {
                      key: "enable",
                      label: t("admin.lifecycle.person.enable.label"),
                      consequence: t("admin.lifecycle.person.enable.consequence"),
                      variant: "default" as const,
                      blockedReason: isSelf
                        ? t("admin.lifecycle.error.selfAction")
                        : impact.data?.alreadyErased
                          ? t("admin.lifecycle.person.delete.alreadyErased")
                          : null,
                      onConfirm: ({ reason }: { reason: string }) =>
                        setDisabled.mutate({ disabled: false, reason }),
                    }
                  : {
                      key: "disable",
                      label: t("admin.lifecycle.person.disable.label"),
                      consequence: t("admin.lifecycle.person.disable.consequence"),
                      blockedReason: isSelf
                        ? t("admin.lifecycle.error.selfAction")
                        : impact.data?.alreadyErased
                          ? t("admin.lifecycle.person.delete.alreadyErased")
                          : null,
                      onConfirm: ({ reason }: { reason: string }) =>
                        setDisabled.mutate({ disabled: true, reason }),
                    },
                {
                  key: "anonymise",
                  label: t("admin.lifecycle.person.anonymise.label"),
                  consequence: t("admin.lifecycle.person.anonymise.consequence"),
                  confirmPhrase: overview.data.account.email,
                  confirmPhraseLabel: t("admin.lifecycle.person.delete.confirmPhraseLabel"),
                  impact: (
                    <p className="text-sm text-muted-foreground">
                      {t("admin.lifecycle.person.anonymise.retained")}
                    </p>
                  ),
                  blockedReason: !whoAmI.data?.isSuperadmin
                    ? t("admin.lifecycle.person.delete.blockedSuperadmin")
                    : isSelf
                      ? t("admin.lifecycle.error.selfAction")
                      : impact.data?.alreadyErased
                        ? t("admin.lifecycle.person.delete.alreadyErased")
                        : null,
                  onConfirm: ({ reason }: { reason: string }) => anonymise.mutate({ reason }),
                },
                {
                  key: "delete",
                  label: t("admin.lifecycle.person.delete.label"),
                  consequence: t("admin.lifecycle.person.delete.consequence"),
                  confirmPhrase: overview.data.account.email,
                  confirmPhraseLabel: t("admin.lifecycle.person.delete.confirmPhraseLabel"),
                  // History no longer blocks the action. It is handled, and
                  // the dialog says exactly how -- what is deleted, and what
                  // survives detached or anonymised. The only things that can
                  // still block are the two that are about the CALLER rather
                  // than the data: not being a superadmin, and being the
                  // account in question.
                  impact: impact.data ? (
                    <AccountDeletionImpactPreview
                      deleted={impact.data.deleted}
                      detached={impact.data.detached}
                      preserved={impact.data.preserved}
                      hasHistory={impact.data.hasHistory}
                      passportEvidenceFiles={impact.data.deleted["sp_evidence.holder_user_id"] ?? 0}
                    />
                  ) : null,
                  blockedReason: !whoAmI.data?.isSuperadmin
                    ? t("admin.lifecycle.person.delete.blockedSuperadmin")
                    : isSelf
                      ? t("admin.lifecycle.error.selfAction")
                      : impact.data?.alreadyErased
                        ? t("admin.lifecycle.person.delete.alreadyErased")
                        : null,
                  onConfirm: ({ reason }: { reason: string }) => deleteUser.mutate({ reason }),
                },
              ]}
            />
          </>
        )}
      </AdminShellChrome>
    </SiteLayout>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
