// Inviting somebody to an assessment, whether or not the platform knows them.
//
// ── ONE CONTROL, TWO OUTCOMES ───────────────────────────────────────────
//
// The employer is doing one thing — asking a named person to sit an assessment
// — and should not have to know whether that person happens to have signed up
// already. So there is one form. The database resolves the address: if it
// belongs to an account the governed assign path runs immediately; if it does
// not, a pending invitation is recorded and binds later, when that person
// creates an account and confirms the address themselves.
//
// The two outcomes are reported differently because they mean different things
// to the recruiter: one is "they can start now", the other is "nothing has
// started, and it will when they sign up".
//
// ── WHY A PENDING INVITATION IS NOT AN ASSIGNMENT ───────────────────────
//
// It holds no subject, creates no attempt and produces no evidence. The
// pending list below says so in as many words, because an invitation sitting
// in a list looks exactly like an assignment sitting in a list, and a
// recruiter who believes an assessment is under way when it is not will wait
// for a result that was never coming.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Send, UserPlus } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  cancelInvitation,
  inviteParticipant,
  listEmployerInvitations,
  type ContentLibraryEntry,
  type InviteOutcome,
  type PendingInvitation,
} from "@/lib/security-competency/academy-employer.functions";

export function InviteParticipantPanel({
  employerId,
  entry,
  canInvite,
}: {
  employerId: string;
  entry: ContentLibraryEntry;
  canInvite: boolean;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";
  const qc = useQueryClient();
  const inviteFn = useServerFn(inviteParticipant);
  const cancelFn = useServerFn(cancelInvitation);
  const listFn = useServerFn(listEmployerInvitations);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState<"recruitment" | "workforce">(
    entry.designedFor === "recruitment_support" ? "recruitment" : "workforce",
  );
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null);
  const [failed, setFailed] = useState(false);

  const invitations = useQuery({
    queryKey: ["employer", employerId, "invitations"],
    queryFn: () => listFn({ data: { employerId } }),
    select: (rows: PendingInvitation[]) =>
      rows.filter((r) => r.status === "pending" || r.status === "expired"),
  });

  async function send() {
    if (!email.trim()) return;
    setBusy(true);
    setFailed(false);
    setOutcome(null);
    try {
      const r = await inviteFn({
        data: {
          employerId,
          assessmentVersionId: entry.itemId,
          email: email.trim(),
          useCase,
          invitedName: name.trim() || null,
          language: sv ? ("sv" as const) : ("en" as const),
        },
      });
      setOutcome(r.outcome);
      setEmail("");
      setName("");
      await qc.invalidateQueries({ queryKey: ["employer", employerId, "invitations"] });
      await qc.invalidateQueries({ queryKey: ["academy", "participants"] });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const pending = invitations.data ?? [];

  return (
    <div className="mt-4 rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-accent">
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {t("invite.title")}
      </p>
      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
        {t("invite.lede")}
      </p>

      {canInvite && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-foreground">
            {t("invite.email")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </label>

          <label className="text-[13px] font-medium text-foreground">
            {t("invite.name")}
            <input
              type="text"
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </label>

          <label className="text-[13px] font-medium text-foreground sm:col-span-2">
            {t("invite.context")}
            <select
              value={useCase}
              onChange={(e) => setUseCase(e.target.value as "recruitment" | "workforce")}
              className="mt-1.5 h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="recruitment">{t("invite.context.recruitment")}</option>
              <option value="workforce">{t("invite.context.workforce")}</option>
            </select>
          </label>

          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => void send()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {busy ? t("invite.sending") : t("invite.send")}
            </button>

            {outcome && (
              <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
                {t(`invite.outcome.${outcome}` as TranslationKey)}
              </p>
            )}
            {failed && (
              <p role="alert" className="mt-2 text-[13px] text-foreground">
                {t("invite.failed")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("invite.pending")}
        </p>
        <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("invite.pendingLede")}
        </p>

        {pending.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">{t("invite.pendingEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pending.map((i) => (
              <li
                key={i.invitationId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-border bg-card px-3 py-2"
              >
                <span className="text-[13px] font-medium text-foreground">
                  {i.invitedName ?? i.email}
                </span>
                {i.invitedName && <span className="text-xs text-muted-foreground">{i.email}</span>}
                <span className="text-xs text-muted-foreground">{sv ? i.nameSv : i.nameEn}</span>
                <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {t(`invite.status.${i.status}` as TranslationKey)}
                </span>
                {/* Why it stopped being claimable. "the grant expired" and "the
                    employer cancelled it" look identical from outside and mean
                    different things to the person who was invited. */}
                {i.closedReason && (
                  <span className="text-xs text-muted-foreground">
                    {t(`invite.reason.${i.closedReason}` as TranslationKey)}
                  </span>
                )}
                {canInvite && i.status === "pending" && (
                  <button
                    type="button"
                    onClick={() =>
                      void cancelFn({ data: { invitationId: i.invitationId } }).then(() =>
                        qc.invalidateQueries({
                          queryKey: ["employer", employerId, "invitations"],
                        }),
                      )
                    }
                    className="ml-auto text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("invite.cancel")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
