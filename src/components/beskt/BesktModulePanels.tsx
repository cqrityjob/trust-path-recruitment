// The parts of the BESKT module that are about THIS organisation's work: its
// ongoing assignments, its open invitations, and who holds its security
// function. A security vetting is listed for the appointed security function
// only — the rows do not come back for anyone else, and this list says so
// rather than pretending there are none.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  appointBesktSecurityOfficer,
  listBesktAssignments,
  listBesktInvitations,
  listBesktPeople,
  revokeBesktInvitation,
  revokeBesktSecurityOfficer,
  type BesktMode,
} from "@/lib/beskt/complete.functions";

const FIELD =
  "mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function purposeKey(mode: BesktMode | string): TranslationKey {
  return mode === "security_vetting_support"
    ? "beskt.purpose.securityVetting"
    : "beskt.purpose.recruitment";
}

export function topicReasonKey(reason: string): TranslationKey {
  if (reason === "omitted") return "beskt.readback.reason.omitted";
  if (reason === "discuss_orally") return "beskt.readback.reason.discuss_orally";
  return "beskt.readback.reason.candidate_disclosed";
}

const STATE: Record<string, TranslationKey> = {
  assigned: "beskt.readback.state.assigned",
  notice_acknowledged: "beskt.readback.state.notice_acknowledged",
  in_progress: "beskt.readback.state.in_progress",
  submitted: "beskt.readback.state.submitted",
  cancelled: "beskt.readback.state.cancelled",
};

export function BesktAssignmentsList({
  employerId,
  employerSlug,
}: {
  readonly employerId: string;
  readonly employerSlug: string;
}) {
  const { t, lang } = useT();
  const listFn = useServerFn(listBesktAssignments);
  const invFn = useServerFn(listBesktInvitations);
  const revokeFn = useServerFn(revokeBesktInvitation);
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: ["beskt", "assignments", employerId],
    queryFn: () => listFn({ data: { employerId } }),
    retry: false,
  });
  const invitations = useQuery({
    queryKey: ["beskt", "invitations", employerId],
    queryFn: () => invFn({ data: { employerId } }),
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      revokeFn({
        data: {
          operationId: crypto.randomUUID(),
          invitationId,
          reason: t("beskt.module.invitationRevokeReason"),
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["beskt", "invitations"] }),
  });
  const pending = (invitations.data ?? []).filter((i) => i.state === "pending");

  return (
    <section className="mt-6" aria-labelledby="beskt-assignments-h" data-testid="beskt-assignments">
      <h3 id="beskt-assignments-h" className="text-sm font-semibold">
        {t("beskt.module.assignments")}
      </h3>
      {rows.isPending ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {t("beskt.library.loading")}
        </p>
      ) : rows.isError ? (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{t(besktErrorKey(rows.error))}</AlertDescription>
        </Alert>
      ) : rows.data.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="beskt-assignments-empty">
          {t("beskt.module.assignmentsEmpty")}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.data.map((a) => (
            <li
              key={a.assignmentId}
              className="rounded-lg border bg-background p-3"
              data-testid="beskt-assignment-row"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {t(purposeKey(a.mode))}
                </Badge>
                <Badge variant="secondary">{t(STATE[a.lifecycleState] ?? STATE.assigned)}</Badge>
                {a.reportFinalised ? (
                  <Badge variant="secondary">{t("beskt.module.reportFinalised")}</Badge>
                ) : null}
              </div>
              <p className="mt-1.5 break-words text-sm font-medium">
                {a.candidateDisplayName} — {a.roleTitle ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("beskt.module.started")}{" "}
                {new Date(a.assignedAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
                {a.applicationId ? "" : ` · ${t("beskt.module.byInvitation")}`}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2 min-h-[44px]">
                <Link
                  to="/employer/$employerSlug/assessments/beskt/$assignmentId"
                  params={{ employerSlug, assignmentId: a.assignmentId }}
                  data-testid="beskt-assignment-open"
                >
                  {t("beskt.module.openAssignment")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("beskt.module.vettingListNote")}</p>

      {pending.length > 0 ? (
        <div className="mt-4" data-testid="beskt-invitations">
          <h4 className="text-sm font-semibold">{t("beskt.module.invitations")}</h4>
          <ul className="mt-2 space-y-2">
            {pending.map((i) => (
              <li key={i.invitationId} className="rounded-lg border bg-background p-3 text-sm">
                <p className="break-words">
                  {i.candidateDisplayName ?? i.invitedEmail} — {i.roleTitle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(purposeKey(i.mode))} · {t("beskt.module.invitationExpires")}{" "}
                  {new Date(i.expiresAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 min-h-[44px]"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(i.invitationId)}
                >
                  {t("beskt.module.invitationRevoke")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function BesktSecurityFunctionPanel({
  employerId,
  canManage,
}: {
  readonly employerId: string;
  readonly canManage: boolean;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const peopleFn = useServerFn(listBesktPeople);
  const appointFn = useServerFn(appointBesktSecurityOfficer);
  const revokeFn = useServerFn(revokeBesktSecurityOfficer);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const people = useQuery({
    queryKey: ["beskt", "people", employerId],
    queryFn: () => peopleFn({ data: { employerId } }),
    retry: false,
  });
  const done = () => queryClient.invalidateQueries({ queryKey: ["beskt"] });
  const appoint = useMutation({
    mutationFn: () =>
      appointFn({
        data: { operationId: crypto.randomUUID(), employerId, userId, reason: reason.trim() },
      }),
    onSuccess: async () => {
      setUserId("");
      setReason("");
      await done();
    },
  });
  const revoke = useMutation({
    mutationFn: (officerId: string) =>
      revokeFn({
        data: {
          operationId: crypto.randomUUID(),
          officerId,
          reason: t("beskt.security.revokeReason"),
        },
      }),
    onSuccess: done,
  });
  const officers = (people.data ?? []).filter((p) => p.isSecurityOfficer);
  const others = (people.data ?? []).filter((p) => !p.isSecurityOfficer);

  return (
    <section
      className="mt-6 rounded-lg border bg-background p-4"
      aria-labelledby="beskt-security-h"
      data-testid="beskt-security-function"
    >
      <h3 id="beskt-security-h" className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        {t("beskt.security.heading")}
      </h3>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        {t("beskt.security.lede")}
      </p>
      {people.isPending ? (
        <Loader2 aria-hidden="true" className="mt-2 h-4 w-4 animate-spin" />
      ) : officers.length === 0 ? (
        <p className="mt-2 text-sm" data-testid="beskt-security-none">
          {t("beskt.security.none")}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {officers.map((p) => (
            <li
              key={p.userId}
              className="flex flex-wrap items-center gap-2 text-sm"
              data-testid="beskt-security-officer"
            >
              <span className="font-medium">{p.displayName}</span>
              <span className="text-xs text-muted-foreground">{p.email}</span>
              {canManage && p.officerId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() => revoke.mutate(p.officerId!)}
                >
                  {t("beskt.security.revoke")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (userId && reason.trim().length >= 3) appoint.mutate();
          }}
        >
          <div>
            <label htmlFor="beskt-security-person" className="text-xs font-medium">
              {t("beskt.security.person")}
            </label>
            <select
              id="beskt-security-person"
              className={FIELD}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">{t("beskt.security.choosePerson")}</option>
              {others.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="beskt-security-reason" className="text-xs font-medium">
              {t("beskt.security.reason")}
            </label>
            <input
              id="beskt-security-reason"
              className={FIELD}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            className="min-h-[44px]"
            disabled={!userId || reason.trim().length < 3 || appoint.isPending}
            data-testid="beskt-security-appoint"
          >
            {t("beskt.security.appoint")}
          </Button>
        </form>
      ) : null}
      {appoint.isError || revoke.isError ? (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{t(besktErrorKey(appoint.error ?? revoke.error))}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
