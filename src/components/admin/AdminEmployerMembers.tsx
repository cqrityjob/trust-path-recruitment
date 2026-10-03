// The members of one organisation, with the controls an administrator needs to
// take somebody's access away, give it back, or change what it is.
//
// ── WHY THIS IS HERE ────────────────────────────────────────────────────
//
// The two server functions behind it, `adminUpdateEmployerMembershipStatus` and
// `adminUpdateEmployerMembershipRole`, existed from Phase G1 and were called by
// nothing. The organisation page listed members read-only; the owner's own
// team panel can approve a request and grant a reviewer, and nothing more. So
// "somebody has left, take their access away" could not be done in the product
// and -- as the owner found -- could not be tried in a browser either.
//
// ── WHAT AN ACTION DOES, AND DOES NOT ───────────────────────────────────
//
// Every control opens a confirmation that says what will happen to THIS person
// in words, then calls the existing function. Nothing is written from the
// client: the function checks is_platform_admin(), update_employer_membership()
// checks it again, takes the row locks and refuses a change that would leave the
// organisation with no active owner, and an audit row is written for a real
// change. The membership row is never deleted -- "removed" is a status, and
// "reactivate" undoes it.
//
// What is OFFERED is advisory (membership-admin.ts); what is REFUSED is the
// database's. When the database refuses, the dialog says so through
// <AdminActionError />, in a closed set of sentences, never in the database's
// wording.
//
// There is no owner-facing version of this. Letting an owner remove a member
// themselves needs a new function (an owner is not a platform administrator, and
// update_employer_membership() is not callable by one), which is a schema
// decision, not a screen.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminActionError } from "@/components/admin/AdminActionError";
import {
  adminUpdateEmployerMembershipRole,
  adminUpdateEmployerMembershipStatus,
} from "@/lib/job-intelligence/membership.functions";
import type { AdminEmployerMembershipRow } from "@/lib/job-intelligence/admin-employer-moderation.functions";
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_TARGET_STATUS,
  availableStatusActions,
  canChangeRole,
  isOnlyActiveOwner,
  wouldLeaveNoActiveOwner,
  type MembershipRole,
  type MembershipStatusAction,
} from "@/lib/job-intelligence/membership-admin";

const ROLE_LABEL: Record<MembershipRole, TranslationKey> = {
  owner: "employer.role.owner",
  admin: "employer.role.admin",
  member: "employer.role.member",
};

const STATUS_LABEL: Record<string, TranslationKey> = {
  active: "employer.team.status.active",
  invited: "employer.team.status.invited",
  suspended: "employer.team.status.suspended",
  removed: "employer.team.status.removed",
};

const ACTION_LABEL: Record<MembershipStatusAction, TranslationKey> = {
  suspend: "admin.employers.members.action.suspend",
  remove: "admin.employers.members.action.remove",
  reactivate: "admin.employers.members.action.reactivate",
};

const DIALOG_TITLE: Record<MembershipStatusAction | "role", TranslationKey> = {
  suspend: "admin.employers.members.dialog.suspend.title",
  remove: "admin.employers.members.dialog.remove.title",
  reactivate: "admin.employers.members.dialog.reactivate.title",
  role: "admin.employers.members.dialog.role.title",
};

const DIALOG_BODY: Record<MembershipStatusAction | "role", TranslationKey> = {
  suspend: "admin.employers.members.dialog.suspend.body",
  remove: "admin.employers.members.dialog.remove.body",
  reactivate: "admin.employers.members.dialog.reactivate.body",
  role: "admin.employers.members.dialog.role.body",
};

const RESULT_TEXT: Record<MembershipStatusAction | "role", TranslationKey> = {
  suspend: "admin.employers.members.result.suspend",
  remove: "admin.employers.members.result.remove",
  reactivate: "admin.employers.members.result.reactivate",
  role: "admin.employers.members.result.role",
};

type Pending =
  | { kind: "status"; action: MembershipStatusAction; member: AdminEmployerMembershipRow }
  | { kind: "role"; member: AdminEmployerMembershipRow };

type Outcome = { kind: "applied"; text: string } | { kind: "unchanged"; text: string };

export function AdminEmployerMembers({
  employerId,
  memberships,
}: {
  employerId: string;
  memberships: readonly AdminEmployerMembershipRow[];
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const statusFn = useServerFn(adminUpdateEmployerMembershipStatus);
  const roleFn = useServerFn(adminUpdateEmployerMembershipRole);

  const [pending, setPending] = useState<Pending | null>(null);
  const [newRole, setNewRole] = useState<MembershipRole>("member");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const nameOf = (m: AdminEmployerMembershipRow) =>
    m.displayName ?? `${t("admin.employers.members.unnamed")} (${m.userId.slice(0, 8)})`;
  const roleName = (role: string) =>
    role in ROLE_LABEL ? t(ROLE_LABEL[role as MembershipRole]) : role;
  const fill = (key: TranslationKey, name: string, role?: string) =>
    t(key)
      .replaceAll("{name}", name)
      .replaceAll("{role}", role ?? "");

  // The role travels with the call rather than being read back from state in
  // the success handler, so the sentence shown afterwards names the role that
  // was actually sent.
  const change = useMutation({
    mutationFn: async (v: { pending: Pending; role: MembershipRole }) =>
      v.pending.kind === "status"
        ? statusFn({
            data: {
              membershipId: v.pending.member.id,
              status: MEMBERSHIP_TARGET_STATUS[v.pending.action],
            },
          })
        : roleFn({ data: { membershipId: v.pending.member.id, role: v.role } }),
    onSuccess: (result, v) => {
      const p = v.pending;
      const name = nameOf(p.member);
      if (!result.changed) {
        setOutcome({
          kind: "unchanged",
          text: fill("admin.employers.members.result.unchanged", name),
        });
      } else {
        const action = p.kind === "status" ? p.action : "role";
        setOutcome({
          kind: "applied",
          text: fill(RESULT_TEXT[action], name, roleName(v.role)),
        });
      }
      setPending(null);
      change.reset();
      // The page's own read, and the list the moderation queue is built from
      // (an organisation's named owner comes from its memberships).
      void qc.invalidateQueries({ queryKey: ["admin", "employer-detail", employerId] });
      void qc.invalidateQueries({ queryKey: ["admin", "employers-moderation"] });
    },
  });

  function open(next: Pending) {
    change.reset();
    setOutcome(null);
    if (next.kind === "role") {
      // Start on a role the person does not already have, so the primary
      // button never means "change nothing".
      setNewRole(MEMBERSHIP_ROLES.find((r) => r !== next.member.role) ?? "member");
    }
    setPending(next);
  }

  const blockedByFinalOwner =
    pending !== null &&
    wouldLeaveNoActiveOwner(
      memberships,
      pending.member.id,
      pending.kind === "status"
        ? { status: MEMBERSHIP_TARGET_STATUS[pending.action] }
        : { role: newRole },
    );

  const roleUnchanged = pending?.kind === "role" && newRole === pending.member.role;

  return (
    <>
      <p className="mt-1 text-xs text-muted-foreground">{t("admin.employers.members.intro")}</p>

      {outcome && (
        <div
          role="status"
          data-testid="admin-membership-result"
          className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
        >
          {outcome.text}
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-4">{t("admin.employers.list.column.owner")}</th>
              <th className="py-1.5 pr-4">{t("admin.employers.detail.field.role")}</th>
              <th className="py-1.5 pr-4">{t("admin.employers.list.column.status")}</th>
              <th className="py-1.5 pr-4">{t("admin.employers.members.col.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {memberships.map((m) => {
              const only = isOnlyActiveOwner(memberships, m.id);
              return (
                <tr key={m.id} data-testid="admin-membership-row" data-membership-id={m.id}>
                  <td className="py-2 pr-4">{m.displayName ?? "—"}</td>
                  <td className="py-2 pr-4">{roleName(m.role)}</td>
                  <td className="py-2 pr-4">
                    {t(STATUS_LABEL[m.status] ?? "employer.team.status.invited")}
                    {only && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("admin.employers.members.onlyOwner")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-2">
                      {availableStatusActions(m.status).map((action) => (
                        <Button
                          key={action}
                          type="button"
                          size="sm"
                          variant={action === "reactivate" ? "outline" : "destructive"}
                          data-action={action}
                          onClick={() => open({ kind: "status", action, member: m })}
                        >
                          {t(ACTION_LABEL[action])}
                        </Button>
                      ))}
                      {canChangeRole(m.status) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-action="role"
                          onClick={() => open({ kind: "role", member: m })}
                        >
                          {t("admin.employers.members.action.role")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {fill(
                    DIALOG_TITLE[pending.kind === "status" ? pending.action : "role"],
                    nameOf(pending.member),
                  )}
                </DialogTitle>
                <DialogDescription>
                  {fill(
                    DIALOG_BODY[pending.kind === "status" ? pending.action : "role"],
                    nameOf(pending.member),
                    roleName(pending.member.role),
                  )}
                </DialogDescription>
              </DialogHeader>

              {pending.kind === "role" && (
                <div className="mt-2">
                  <label
                    htmlFor="admin-membership-role"
                    className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t("admin.employers.members.dialog.role.label")}
                  </label>
                  <select
                    id="admin-membership-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as MembershipRole)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {MEMBERSHIP_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleName(r)}
                      </option>
                    ))}
                  </select>
                  {newRole === "owner" && pending.member.role !== "owner" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("admin.employers.members.dialog.role.ownerWarning")}
                    </p>
                  )}
                </div>
              )}

              {/* Said before the button is pressed, from the rows this page
                  already holds. The database would refuse the same change and
                  that refusal is still handled below -- this only spares an
                  administrator a button that cannot work. */}
              {blockedByFinalOwner && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {fill("admin.employers.members.dialog.finalOwner", nameOf(pending.member))}
                </p>
              )}

              <AdminActionError error={change.error} className="mt-2 text-sm text-destructive" />

              <DialogFooter className="mt-4">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {t("admin.employers.action.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant={
                    pending.kind === "status" && pending.action !== "reactivate"
                      ? "destructive"
                      : "default"
                  }
                  disabled={change.isPending || blockedByFinalOwner || roleUnchanged}
                  onClick={() => change.mutate({ pending, role: newRole })}
                >
                  {change.isPending
                    ? t("admin.employers.action.submitting")
                    : t("admin.employers.action.confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
