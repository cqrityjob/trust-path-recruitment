// Writing to a candidate.
//
// Every message is a DRAFT until a person reviews who it goes to and presses
// send. The send is a two-step database act (claim, then settle), so a
// double-click, a retry after a network error and a second tab all end in ONE
// message; and what the screen reports afterwards is what the database and
// the mail provider actually said -- "delivered in CQrityjob", and separately
// what happened to the e-mail copy. Nothing here ever says "sent" for a
// message that was not.
//
// A template is always available. The AI button only replaces the text with a
// draft to edit; when no model is available it says so and leaves the
// template in place.

import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Sparkles, Send, Save, Trash2 } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import { outcomeText } from "@/components/recruitment/send-outcome";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  discardMessageDraft,
  saveMessageDraft,
  sendRecruitmentMessages,
  type BookingRow,
  type MessageRow,
  type SendOutcome,
} from "@/lib/recruitment/recruitment.functions";
import {
  draftCandidateMessage,
  type AssistUnavailableReason,
} from "@/lib/recruitment/ai.functions";
import {
  MESSAGE_KINDS,
  messageTemplate,
  type MessageKind,
} from "@/lib/recruitment/message-templates";
import { recruitmentErrorKey } from "@/components/recruitment/errors";
import { formatInZone } from "@/lib/recruitment/format";

const fieldCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function assistNotice(
  t: (k: TranslationKey) => string,
  source: "ai" | "template",
  reason: AssistUnavailableReason,
): string {
  if (source === "ai") return t("rec.ai.draftReady");
  if (reason === "not_configured") return t("rec.ai.notConfigured");
  if (reason === "disabled") return t("rec.ai.disabled");
  return t("rec.ai.failed");
}

export function MessageComposer({
  employerId,
  applicationId,
  candidateName,
  employerName,
  jobTitle,
  bookings,
  draft,
  initialKind,
  initialBookingId,
  onChanged,
  onClose,
}: {
  employerId: string;
  applicationId: string;
  candidateName: string | null;
  employerName: string;
  jobTitle: string;
  bookings: BookingRow[];
  draft?: MessageRow | null;
  initialKind?: MessageKind;
  initialBookingId?: string | null;
  onChanged: () => void;
  onClose?: () => void;
}) {
  const { t, lang } = useT();
  const saveFn = useServerFn(saveMessageDraft);
  const sendFn = useServerFn(sendRecruitmentMessages);
  const discardFn = useServerFn(discardMessageDraft);
  const aiFn = useServerFn(draftCandidateMessage);

  const firstName = candidateName?.split(/\s+/)[0] ?? null;
  const [kind, setKind] = useState<MessageKind>(
    (draft?.kind as MessageKind) ?? initialKind ?? "general",
  );
  const [language, setLanguage] = useState<"sv" | "en">(draft?.language ?? lang);
  const [bookingId, setBookingId] = useState<string | null>(
    draft?.bookingId ?? initialBookingId ?? null,
  );
  const booking = bookings.find((b) => b.id === bookingId) ?? null;
  const initial = draft
    ? { subject: draft.subject, body: draft.body }
    : messageTemplate({
        kind: initialKind ?? "general",
        language: lang,
        candidateName: firstName,
        employerName,
        jobTitle,
        booking: booking,
      });
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [dirty, setDirty] = useState(!draft);
  const [busy, setBusy] = useState<null | "save" | "send" | "ai" | "discard">(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const key = useRef(newKey());

  function applyTemplate(
    nextKind: MessageKind,
    nextLang: "sv" | "en",
    nextBookingId: string | null,
  ) {
    const b = bookings.find((x) => x.id === nextBookingId) ?? null;
    const tpl = messageTemplate({
      kind: nextKind,
      language: nextLang,
      candidateName: firstName,
      employerName,
      jobTitle,
      booking: b,
    });
    setSubject(tpl.subject);
    setBody(tpl.body);
    setDirty(true);
  }

  async function ensureSaved(): Promise<string | null> {
    if (draftId && !dirty) return draftId;
    try {
      const res = await saveFn({
        data: {
          messageId: draftId,
          applicationId,
          kind,
          subject,
          body,
          language,
          bookingId: kind === "interview_invitation" ? bookingId : null,
          idempotencyKey: draftId ? null : key.current,
        },
      });
      setDraftId(res.id);
      setDirty(false);
      return res.id;
    } catch (e) {
      setNotice({ tone: "warn", text: t(recruitmentErrorKey((e as Error).message)) });
      return null;
    }
  }

  async function onSave() {
    setBusy("save");
    setNotice(null);
    const id = await ensureSaved();
    setBusy(null);
    if (id) {
      setNotice({ tone: "ok", text: t("rec.message.saved") });
      onChanged();
    }
  }

  async function onSend() {
    setReviewing(false);
    setBusy("send");
    setNotice(null);
    const id = await ensureSaved();
    if (!id) {
      setBusy(null);
      return;
    }
    try {
      const res = await sendFn({ data: { messageIds: [id] } });
      const o = res.outcomes[0];
      setNotice(outcomeText(t, o));
      if (o.delivery === "delivered" || o.delivery === "already_sent") {
        onChanged();
        onClose?.();
      }
    } catch (e) {
      // The request itself failed. The message may or may not have been
      // claimed; the list below re-reads the truth, and sending again is safe.
      setNotice({ tone: "warn", text: t("rec.send.uncertain") });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function onAi() {
    setBusy("ai");
    setNotice(null);
    try {
      const res = await aiFn({
        data: {
          employerId,
          applicationId,
          kind,
          language,
          bookingId: kind === "interview_invitation" ? bookingId : null,
          useAi: true,
        },
      });
      setSubject(res.subject);
      setBody(res.body);
      setDirty(true);
      setNotice({
        tone: res.source === "ai" ? "ok" : "warn",
        text: assistNotice(t, res.source, res.reason),
      });
    } catch {
      setNotice({ tone: "warn", text: t("rec.ai.failed") });
    } finally {
      setBusy(null);
    }
  }

  async function onDiscard() {
    if (!draftId) {
      onClose?.();
      return;
    }
    setBusy("discard");
    try {
      await discardFn({ data: { messageId: draftId } });
      onChanged();
      onClose?.();
    } catch (e) {
      setNotice({ tone: "warn", text: t(recruitmentErrorKey((e as Error).message)) });
    } finally {
      setBusy(null);
    }
  }

  const invitationWithoutBooking = kind === "interview_invitation" && !booking;
  const openBookings = bookings.filter(
    (b) => b.status === "planned" || b.status === "invited" || b.status === "confirmed",
  );

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium">
          {t("rec.message.kind")}
          <select
            className={fieldCls}
            value={kind}
            onChange={(e) => {
              const k = e.target.value as MessageKind;
              setKind(k);
              applyTemplate(k, language, bookingId);
            }}
          >
            {MESSAGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`rec.message.kind.${k}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          {t("rec.message.language")}
          <select
            className={fieldCls}
            value={language}
            onChange={(e) => {
              const l = e.target.value as "sv" | "en";
              setLanguage(l);
              applyTemplate(kind, l, bookingId);
            }}
          >
            <option value="sv">Svenska</option>
            <option value="en">English</option>
          </select>
        </label>
        {kind === "interview_invitation" && (
          <label className="text-sm font-medium">
            {t("rec.message.booking")}
            <select
              className={fieldCls}
              value={bookingId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setBookingId(id);
                applyTemplate(kind, language, id);
              }}
            >
              <option value="">{t("rec.message.bookingNone")}</option>
              {openBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatInZone(b.startsAt, b.timezone, lang)} ({b.timezone})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {invitationWithoutBooking && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {t("rec.message.bookingHint")}
        </p>
      )}

      <label className="mt-3 block text-sm font-medium">
        {t("rec.message.subject")}
        <input
          className={fieldCls}
          value={subject}
          maxLength={200}
          onChange={(e) => {
            setSubject(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        {t("rec.message.body")}
        <textarea
          className={`${fieldCls} min-h-[220px] font-[inherit]`}
          value={body}
          maxLength={8000}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        {dirty ? t("rec.message.unsaved") : draftId ? t("rec.message.savedDraft") : ""}
      </p>

      {notice && (
        <div
          role="status"
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}
        >
          {notice.text}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null || !subject.trim() || !body.trim()}
          onClick={() => setReviewing(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {busy === "send" ? t("rec.send.sending") : t("rec.message.reviewAndSend")}
        </button>
        <button
          type="button"
          disabled={busy !== null || !subject.trim() || !body.trim()}
          onClick={() => void onSave()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {t("rec.message.saveDraft")}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onAi()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {busy === "ai" ? t("rec.ai.working") : t("rec.ai.draftMessage")}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void onDiscard()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {draftId ? t("rec.message.discard") : t("rec.common.cancel")}
        </button>
      </div>

      {reviewing && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setReviewing(false)}
          title={t("rec.message.reviewTitle")}
          consequence={
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{t("rec.message.to")}:</span>{" "}
                {candidateName ?? t("employer.applications.anonymousCandidate")} · {jobTitle}
              </p>
              <p className="text-muted-foreground">{t("rec.message.channels")}</p>
              <p>
                <span className="font-medium">{t("rec.message.subject")}:</span> {subject}
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-[inherit] text-xs">
                {body}
              </pre>
              {kind === "interview_invitation" && booking && (
                <p className="text-xs">{t("rec.message.bookingWillBeInvited")}</p>
              )}
            </div>
          }
          confirmLabel={t("rec.message.send")}
          cancelLabel={t("rec.message.keepEditing")}
          busy={busy === "send"}
          onConfirm={() => void onSend()}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Several candidates at once
// ═══════════════════════════════════════════════════════════════════════════

export function BatchMessageDialog({
  employerId,
  employerName,
  recipients,
  onClose,
}: {
  employerId: string;
  employerName: string;
  recipients: { applicationId: string; name: string | null; jobTitle: string }[];
  onClose: (sent: boolean) => void;
}) {
  const { t, lang } = useT();
  const saveFn = useServerFn(saveMessageDraft);
  const sendFn = useServerFn(sendRecruitmentMessages);
  const [kind, setKind] = useState<MessageKind>("information");
  const [language, setLanguage] = useState<"sv" | "en">(lang);
  const sameJob = new Set(recipients.map((r) => r.jobTitle)).size === 1;
  const jobTitle = sameJob ? (recipients[0]?.jobTitle ?? "") : "";
  const tpl = messageTemplate({
    kind: "information",
    language: lang,
    candidateName: null,
    employerName,
    jobTitle,
  });
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [step, setStep] = useState<"write" | "review" | "done">("write");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; tone: "ok" | "warn"; text: string }[]>([]);
  // One key per batch; each recipient's draft is keyed `${batch}:${application}`,
  // so pressing send twice finds the same drafts rather than making new ones.
  const batchKey = useRef(newKey());

  function retemplate(k: MessageKind, l: "sv" | "en") {
    const x = messageTemplate({
      kind: k,
      language: l,
      candidateName: null,
      employerName,
      jobTitle,
    });
    setSubject(x.subject);
    setBody(x.body);
  }

  async function send() {
    setBusy(true);
    const out: { name: string; tone: "ok" | "warn"; text: string }[] = [];
    const ids: { id: string; name: string }[] = [];
    for (const r of recipients) {
      const name = r.name ?? t("employer.applications.anonymousCandidate");
      try {
        const res = await saveFn({
          data: {
            messageId: null,
            applicationId: r.applicationId,
            kind,
            subject,
            body,
            language,
            bookingId: null,
            idempotencyKey: `${batchKey.current}:${r.applicationId}`,
          },
        });
        ids.push({ id: res.id, name });
      } catch (e) {
        out.push({ name, tone: "warn", text: t(recruitmentErrorKey((e as Error).message)) });
      }
    }
    if (ids.length > 0) {
      try {
        const res = await sendFn({ data: { messageIds: ids.map((x) => x.id) } });
        res.outcomes.forEach((o, i) => out.push({ name: ids[i].name, ...outcomeText(t, o) }));
      } catch {
        ids.forEach((x) => out.push({ name: x.name, tone: "warn", text: t("rec.send.uncertain") }));
      }
    }
    setResults(out);
    setStep("done");
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose(step === "done")}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("rec.batchMessage.title").replace("{n}", String(recipients.length))}
          </DialogTitle>
          <DialogDescription>{t("rec.batchMessage.lede")}</DialogDescription>
        </DialogHeader>

        {step === "write" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                {t("rec.message.kind")}
                <select
                  className={fieldCls}
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as MessageKind;
                    setKind(k);
                    retemplate(k, language);
                  }}
                >
                  {MESSAGE_KINDS.filter((k) => k !== "interview_invitation").map((k) => (
                    <option key={k} value={k}>
                      {t(`rec.message.kind.${k}` as TranslationKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                {t("rec.message.language")}
                <select
                  className={fieldCls}
                  value={language}
                  onChange={(e) => {
                    const l = e.target.value as "sv" | "en";
                    setLanguage(l);
                    retemplate(kind, l);
                  }}
                >
                  <option value="sv">Svenska</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              {t("rec.message.subject")}
              <input
                className={fieldCls}
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              {t("rec.message.body")}
              <textarea
                className={`${fieldCls} min-h-[200px]`}
                value={body}
                maxLength={8000}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {t("rec.common.cancel")}
              </button>
              <button
                type="button"
                disabled={!subject.trim() || !body.trim()}
                onClick={() => setStep("review")}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {t("rec.batchMessage.review")}
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3 text-sm">
            <p className="font-medium">{t("rec.message.to")}:</p>
            <ul className="max-h-40 list-disc overflow-auto pl-5">
              {recipients.map((r) => (
                <li key={r.applicationId}>
                  {r.name ?? t("employer.applications.anonymousCandidate")} · {r.jobTitle}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">{t("rec.message.channels")}</p>
            <p>
              <span className="font-medium">{t("rec.message.subject")}:</span> {subject}
            </p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-[inherit] text-xs">
              {body}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep("write")}
                className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {t("rec.message.keepEditing")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {busy
                  ? t("rec.send.sending")
                  : t("rec.batchMessage.send").replace("{n}", String(recipients.length))}
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 text-sm">
            <ul className="space-y-1">
              {results.map((r, i) => (
                <li key={i} className={r.tone === "ok" ? "" : "text-amber-900 dark:text-amber-200"}>
                  <span className="font-medium">{r.name}:</span> {r.text}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onClose(true)}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground"
              >
                {t("rec.common.done")}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
