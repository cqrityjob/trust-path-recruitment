// Team & behörigheter — who is in this organisation, and what each of them may do.
//
// ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────
//
// Nothing underneath. Every capability an owner needs already existed and had
// been tested for months:
//
//   employer_access_requests        the row a colleague creates to ask to join
//   approve_access_request()        owner/admin approves; atomically creates
//                                   the employer_memberships row and no other
//                                   path ever does
//   scp_employer_team               the team, with each person's review grant
//   scp_grant/revoke_employer_reviewer
//
// The owner's half of that had NO INTERFACE. listAccessRequestsForMyEmployer
// and decideAccessRequest were written, wrapped, RLS-tested -- and called from
// nowhere in the entire application. An owner who was told "a colleague with
// review authorisation must take this one" had no way to produce such a
// colleague, because the screen that approves them did not exist.
//
// So this panel is wiring, not architecture. No new table, no new role model,
// no new RPC, no migration.
//
// ── WHY AN INVITE LINK RATHER THAN AN INVITE-BY-EMAIL FORM ──────────────
//
// employer_memberships.user_id is NOT NULL REFERENCES auth.users(id): a
// membership cannot exist before the person does. So "type an address, press
// send" would need somewhere to park an invitation for a human who has no
// account yet -- a new table, a new acceptance path, a new expiry rule. That
// is the parallel invitation system the brief says not to build, and the
// product does not need it: the request half already exists.
//
// The link therefore carries the organisation and nothing else. The colleague
// signs up as they normally would, opens the link, and asks to join; the owner
// approves here and picks the role in the same click.
//
// The self-service request UI was removed once before (see the note in
// _authenticated.employer.onboarding.tsx) because it let any signed-in user
// SEARCH for any organisation and file a request against it. That objection is
// about discovery, and this design has none: there is no search, the
// organisation is named by a link the owner chose to send, and a pending
// request still grants exactly nothing until an owner approves it.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ShieldCheck, UserPlus, X } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  getEmployerTeam,
  grantEmployerReviewer,
  revokeEmployerReviewer,
  type EmployerTeamMember,
} from "@/lib/security-competency/employer-team.functions";
import {
  listAccessRequestsForMyEmployer,
  decideAccessRequest,
  type IncomingAccessRequest,
} from "@/lib/job-intelligence/employer-onboarding.functions";

/** The roles an owner actually assigns, in the words an employer uses.
 *
 *  These are LABELS over the existing owner/admin/member model, not a new
 *  model: `member` is presented as "Rekryterare" because that is what a plain
 *  member of a recruitment workspace is -- somebody who works the jobs, the
 *  candidates and the assessments, and does not administer the organisation.
 *  Nothing in the database changed to make that sentence true. */
const ROLE_LABEL: Record<EmployerTeamMember["employerRole"], TranslationKey> = {
  owner: "employer.team.role.owner",
  admin: "employer.team.role.admin",
  member: "employer.team.role.member",
};

const STATUS_LABEL: Record<string, TranslationKey> = {
  active: "employer.team.status.active",
  invited: "employer.team.status.invited",
  suspended: "employer.team.status.suspended",
  removed: "employer.team.status.removed",
};

export function EmployerTeamPanel({
  employerId,
  canManage,
}: {
  employerId: string;
  canManage: boolean;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(getEmployerTeam);
  const grantFn = useServerFn(grantEmployerReviewer);
  const revokeFn = useServerFn(revokeEmployerReviewer);
  const requestsFn = useServerFn(listAccessRequestsForMyEmployer);
  const decideFn = useServerFn(decideAccessRequest);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const team = useQuery({
    queryKey: ["employer", employerId, "team"],
    queryFn: () => listFn({ data: { employerId } }),
  });

  // Only an owner/admin can see anything here: the RLS policy behind it
  // (employer_access_requests_owner_select) returns an empty set to everybody
  // else rather than an error, so a plain member simply sees no queue.
  const requests = useQuery({
    queryKey: ["employer", employerId, "access-requests"],
    queryFn: () => requestsFn({ data: { employerId } }),
    enabled: canManage,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "team"] });
    void qc.invalidateQueries({ queryKey: ["employer", employerId, "access-requests"] });
    // The review workspace and the candidate panel both read the caller's
    // capability; granting somebody a seat must not leave those stale.
    void qc.invalidateQueries({ queryKey: ["academy", "my-review-capability", employerId] });
    void qc.invalidateQueries({ queryKey: ["academy", "review-board", employerId] });
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
  const decide = useMutation({
    mutationFn: (v: {
      requestId: string;
      decision: "approved" | "denied";
      grantedRole: "admin" | "member";
    }) =>
      decideFn({
        data: { requestId: v.requestId, decision: v.decision, grantedRole: v.grantedRole },
      }),
    onSuccess: invalidate,
  });

  const rows = (team.data ?? []) as EmployerTeamMember[];
  const pending = ((requests.data ?? []) as IncomingAccessRequest[]).filter(
    (r) => r.status === "pending",
  );
  // Recruitment specifically. An organisation with three workforce reviewers
  // and nobody who may review CANDIDATES still cannot release a candidate
  // brief, and the old warning counted both and said everything was fine.
  const recruitmentReviewers = rows.filter(
    (r) => r.isReviewer && r.reviewerUseCases.includes("recruitment"),
  ).length;

  const joinLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/employer/join?org=${employerId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard refused; the field is selectable, which is the fallback */
    }
  }

  return (
    <section id="team" className="mt-12 scroll-mt-8 border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">{t("employer.team.heading")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("employer.team.lede")}</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setInviteOpen((v) => !v)}
            aria-expanded={inviteOpen}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("employer.team.invite")}
          </button>
        )}
      </div>

      {/* ── Invite ───────────────────────────────────────────────────── */}
      {canManage && inviteOpen && (
        <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t("employer.team.invite.heading")}
          </h3>
          {/* Two steps, said plainly, because the second one is the part an
              owner will otherwise wait for forever. */}
          <ol className="mt-2 max-w-2xl list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("employer.team.invite.step1")}</li>
            <li>{t("employer.team.invite.step2")}</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={joinLink}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t("employer.team.invite.linkLabel")}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {copied ? (
                <Check className="h-4 w-4 text-accent" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? t("employer.team.invite.copied") : t("employer.team.invite.copy")}
            </button>
          </div>
        </div>
      )}

      {/* ── Waiting on a decision ────────────────────────────────────── */}
      {canManage && pending.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">
            {t("employer.team.requests.heading")} ({pending.length})
          </h3>
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {r.requesterDisplayName ?? t("employer.team.requests.unknownPerson")}
                  </p>
                  {r.message && (
                    <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{r.message}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* The role is chosen AS the request is approved, because
                      approve_access_request takes it in the same call. There is
                      deliberately no "approve as owner": handing over the
                      organisation is not a queue action. */}
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        requestId: r.id,
                        decision: "approved",
                        grantedRole: "member",
                      })
                    }
                    className="inline-flex min-h-[36px] items-center rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("employer.team.requests.approveMember")}
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        requestId: r.id,
                        decision: "approved",
                        grantedRole: "admin",
                      })
                    }
                    className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("employer.team.requests.approveAdmin")}
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({ requestId: r.id, decision: "denied", grantedRole: "member" })
                    }
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("employer.team.requests.deny")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 max-w-2xl rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
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
          {recruitmentReviewers === 0 && (
            <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
              {t("employer.team.noRecruitmentReviewerWarning")}
            </p>
          )}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.person")}</th>
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.role")}</th>
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.recruitment")}</th>
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.review")}</th>
                  <th className="py-2 pr-4 font-medium">{t("employer.team.col.status")}</th>
                  {canManage && (
                    <th className="py-2 font-medium">{t("employer.team.col.action")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const reviewsRecruitment = m.reviewerUseCases.includes("recruitment");
                  const active = m.membershipStatus === "active";
                  return (
                    <tr key={m.userId} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-4 text-foreground">
                        {m.displayName}
                        {m.isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("employer.team.you")}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {t(ROLE_LABEL[m.employerRole])}
                      </td>
                      {/* Recruitment access is not a separate grant in this
                          model and pretending otherwise would be inventing a
                          permission: an active member of a recruitment
                          workspace has it. Stated rather than toggled. */}
                      <td className="py-3 pr-4 text-muted-foreground">
                        {active ? t("employer.team.yes") : t("employer.team.no")}
                      </td>
                      <td className="py-3 pr-4">
                        {reviewsRecruitment ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            {t("employer.team.yes")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t("employer.team.no")}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {t(STATUS_LABEL[m.membershipStatus] ?? "employer.team.status.active")}
                      </td>
                      {canManage && (
                        <td className="py-3">
                          {reviewsRecruitment ? (
                            <button
                              type="button"
                              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              disabled={revoke.isPending}
                              onClick={() => revoke.mutate(m.userId)}
                            >
                              {t("employer.team.revokeReview")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="rounded-md border border-accent/50 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              disabled={grant.isPending || !active}
                              onClick={() =>
                                // Re-granting preserves any workforce scope the
                                // person already holds; scp_grant_employer_reviewer
                                // replaces the array it is given, so it is
                                // composed here rather than silently narrowed.
                                grant.mutate({
                                  userId: m.userId,
                                  useCases: Array.from(
                                    new Set([...m.reviewerUseCases, "recruitment"]),
                                  ) as ("workforce" | "recruitment")[],
                                })
                              }
                            >
                              {t("employer.team.grantReview")}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(grant.isError || revoke.isError || decide.isError) && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t("employer.team.actionError")}
        </p>
      )}
    </section>
  );
}
