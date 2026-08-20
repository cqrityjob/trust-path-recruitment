// #51 — Team and response-review authorisation.
//
// This is the surface that makes the self-service reviewer model reachable.
// Before it existed the capability was real but unusable: an employer could not
// see who belonged to its account, and authorising a reviewer required a
// database insert.
//
// The panel is deliberately small. It answers two questions -- who is in this
// organisation, and who may review participant responses -- and does not try to
// become user management. Adding and removing members is still a separate
// concern.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  getEmployerTeam,
  grantEmployerReviewer,
  revokeEmployerReviewer,
  type EmployerTeamMember,
} from "@/lib/security-competency/employer-team.functions";

export function EmployerTeamPanel({
  employerId,
  canManage,
}: {
  employerId: string;
  canManage: boolean;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(getEmployerTeam);
  const grantFn = useServerFn(grantEmployerReviewer);
  const revokeFn = useServerFn(revokeEmployerReviewer);

  const team = useQuery({
    queryKey: ["employer", employerId, "team"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "team"] });
  };

  const grant = useMutation({
    mutationFn: (v: { userId: string; useCases: ("workforce" | "recruitment")[] }) =>
      grantFn({ data: { employerId, userId: v.userId, useCases: v.useCases } }),
    onSuccess: invalidate,
  });
  const revoke = useMutation({
    mutationFn: (userId: string) => revokeFn({ data: { employerId, userId } }),
    onSuccess: invalidate,
  });

  const rows = (team.data ?? []) as EmployerTeamMember[];
  const reviewerCount = rows.filter((r) => r.isReviewer).length;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-xl font-semibold text-foreground">{t("employer.team.heading")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {t("employer.team.lede")}
      </p>

      {/* The independence rule is a product promise, so it is stated where the
          decision is made rather than buried in documentation. */}
      <p className="mt-3 max-w-2xl rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {t("employer.team.separationNotice")}
      </p>

      {team.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("employer.loading")}</p>
      ) : team.isError ? (
        <p className="mt-6 text-sm text-destructive">{t("employer.team.loadError")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("employer.team.empty")}</p>
      ) : (
        <>
          {reviewerCount === 0 && (
            <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
              {t("employer.team.noReviewerWarning")}
            </p>
          )}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.person")}</th>
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.role")}</th>
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.reviewer")}</th>
                  {canManage && (
                    <th className="py-2 font-medium">{t("employer.team.col.action")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.userId} className="border-b border-border/60">
                    <td className="py-3 pr-4 text-foreground">
                      {m.displayName}
                      {m.isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("employer.team.you")}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {t(`employer.team.role.${m.employerRole}`)}
                    </td>
                    <td className="py-3 pr-4">
                      {m.isReviewer ? (
                        <span className="text-foreground">
                          {m.reviewerUseCases
                            .map((u) =>
                              u === "recruitment"
                                ? t("employer.team.useCase.recruitment")
                                : t("employer.team.useCase.workforce"),
                            )
                            .join(" · ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("employer.team.notReviewer")}</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-3">
                        {m.isReviewer ? (
                          <button
                            type="button"
                            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(m.userId)}
                          >
                            {t("employer.team.revoke")}
                          </button>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                              disabled={grant.isPending}
                              onClick={() =>
                                grant.mutate({ userId: m.userId, useCases: ["workforce"] })
                              }
                            >
                              {t("employer.team.grantWorkforce")}
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                              disabled={grant.isPending}
                              onClick={() =>
                                grant.mutate({
                                  userId: m.userId,
                                  useCases: ["workforce", "recruitment"],
                                })
                              }
                            >
                              {t("employer.team.grantBoth")}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(grant.isError || revoke.isError) && (
            <p className="mt-4 text-sm text-destructive">{t("employer.team.actionError")}</p>
          )}
        </>
      )}
    </section>
  );
}
