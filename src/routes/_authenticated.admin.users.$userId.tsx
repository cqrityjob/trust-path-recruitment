// Admin Portal — user detail + platform role grant/revoke.
//
// Grant/revoke is only offered when the CURRENT caller is themselves a
// superadmin (adminWhoAmI's isSuperadmin flag, read fresh here -- never
// inferred from anything client-cached). Even then, admin_set_platform_role()
// is the real boundary: it independently re-verifies is_superadmin(),
// blocks changing one's own role, and blocks removing the last superadmin
// -- this page's own gating is a friendly UX convenience, not the
// enforcement.

import { createFileRoute, Link } from "@tanstack/react-router";
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
import { formatDateTime } from "@/lib/job-intelligence/date-format";

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
      </AdminShellChrome>
    </SiteLayout>
  );
}
