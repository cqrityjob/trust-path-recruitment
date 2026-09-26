// The recruitment half of one application: what the candidate answered, the
// interview times, what was written to them, what the team noted internally,
// and how the application moved.
//
// Internal notes and candidate communication are separate sections with
// separate wording, and never share a component: nothing typed into an
// internal note can reach a candidate, because the only way anything reaches
// a candidate is the message composer's explicit, reviewed send.

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CalendarPlus, Download, Lock, MessageSquarePlus, RotateCcw } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import { BookingBadge, DeliveryBadge } from "@/components/recruitment/RecruitmentStatus";
import { MessageComposer } from "@/components/recruitment/MessageComposer";
import { outcomeText, receiptOutcomeText } from "@/components/recruitment/send-outcome";
import { recruitmentErrorKey } from "@/components/recruitment/errors";
import {
  addRecruitmentComment,
  saveInterviewBooking,
  retryReceiptEmail,
  sendRecruitmentMessages,
  setApplicationResponsible,
  setInterviewBookingStatus,
  type AnswerRow,
  type ApplicationWorkspace,
  type BookingRow,
} from "@/lib/recruitment/recruitment.functions";
import {
  COMMON_TIMEZONES,
  formatInZone,
  formatStamp,
  localTimezone,
  zonedToUtcIso,
} from "@/lib/recruitment/format";
import { bookingIcs, type MessageKind } from "@/lib/recruitment/message-templates";
import { APPLICATION_STATUS_LABEL_KEY } from "@/lib/job-intelligence/application-status";
import type { ApplicationStatus } from "@/lib/job-intelligence/applications.functions";

const fieldCls =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function PanelSection({
  id,
  title,
  lede,
  actions,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`${id}-h`} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {lede && <p className="mt-0.5 max-w-[68ch] text-sm text-muted-foreground">{lede}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ── Answers ────────────────────────────────────────────────────────────

export function AnswersPanel({ answers }: { answers: AnswerRow[] }) {
  const { t, lang } = useT();
  if (answers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("rec.answers.none")}</p>;
  }
  return (
    <dl className="space-y-3">
      {answers.map((a) => {
        const prompt = (lang === "en" ? a.promptEn || a.promptSv : a.promptSv || a.promptEn) ?? "";
        const req =
          lang === "en"
            ? a.requirementLabelEn || a.requirementLabelSv
            : a.requirementLabelSv || a.requirementLabelEn;
        return (
          <div key={a.questionId} className="rounded-md border border-border p-3">
            <dt className="text-sm font-medium text-foreground">{prompt}</dt>
            {req && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(
                  a.requirementKind === "mandatory"
                    ? "rec.requirement.mandatory"
                    : "rec.requirement.desirable",
                )}
                : {req}
              </p>
            )}
            <dd className="mt-1.5 text-sm">
              {a.answerKind === "yes_no" ? (
                a.answerBool === null ? (
                  <span className="text-muted-foreground">{t("rec.answers.notAnswered")}</span>
                ) : (
                  <span className="font-medium">
                    {a.answerBool ? t("rec.answers.yes") : t("rec.answers.no")}
                  </span>
                )
              ) : a.answerText ? (
                <span className="whitespace-pre-wrap">{a.answerText}</span>
              ) : (
                <span className="text-muted-foreground">{t("rec.answers.notAnswered")}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// ── Responsible ────────────────────────────────────────────────────────

export function ResponsiblePicker({
  ws,
  onChanged,
}: {
  ws: ApplicationWorkspace;
  onChanged: () => void;
}) {
  const { t } = useT();
  const fn = useServerFn(setApplicationResponsible);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = ws.meta.responsibleUserId ?? "";
  if (!ws.canManage) {
    const name = ws.team.find((m) => m.userId === current)?.name;
    return <span className="text-sm">{name ?? "—"}</span>;
  }
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label={t("rec.col.responsible")}
        value={current}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          try {
            await fn({
              data: {
                applicationId: ws.applicationId,
                userId: e.target.value || null,
                expectedVersion: ws.meta.version,
              },
            });
            onChanged();
          } catch (err) {
            setError(t(recruitmentErrorKey((err as Error).message)));
            onChanged();
          } finally {
            setBusy(false);
          }
        }}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">{t("rec.filter.owner.none")}</option>
        {ws.team.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

// ── Interview bookings ─────────────────────────────────────────────────

export function BookingsPanel({
  ws,
  employerId,
  candidateName,
  employerName,
  jobTitle,
  onChanged,
  onInvite,
}: {
  ws: ApplicationWorkspace;
  employerId: string;
  candidateName: string | null;
  employerName: string;
  jobTitle: string;
  onChanged: () => void;
  onInvite: (bookingId: string) => void;
}) {
  const { t, lang } = useT();
  const statusFn = useServerFn(setInterviewBookingStatus);
  const [planning, setPlanning] = useState(false);
  const [editing, setEditing] = useState<BookingRow | null>(null);
  const [cancelling, setCancelling] = useState<BookingRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = ["submitted", "reviewing", "interview"].includes(ws.status);

  async function setStatus(
    b: BookingRow,
    status: "cancelled" | "completed",
    reason: string | null,
  ) {
    setError(null);
    try {
      await statusFn({ data: { bookingId: b.id, status, reason, expectedVersion: b.version } });
      onChanged();
    } catch (e) {
      setError(t(recruitmentErrorKey((e as Error).message)));
      onChanged();
    }
  }

  function downloadIcs(b: BookingRow) {
    const ics = bookingIcs({
      uid: b.id,
      title: `${t("rec.booking.icsTitle")}: ${candidateName ?? ""} – ${jobTitle}`,
      booking: b,
      organiser: employerName,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "intervju.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {ws.bookings.length === 0 && !planning && (
        <p className="text-sm text-muted-foreground">{t("rec.booking.none")}</p>
      )}
      <ul className="space-y-2">
        {ws.bookings.map((b) => (
          <li key={b.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium tabular-nums">
                {formatInZone(b.startsAt, b.timezone, lang)} · {b.durationMinutes} min ·{" "}
                {b.timezone}
              </p>
              <BookingBadge status={b.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {b.locationKind === "video" ? (
                <>
                  {t("rec.booking.kind.video")}:{" "}
                  <a
                    href={b.meetingUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {b.meetingUrl}
                  </a>
                </>
              ) : b.locationKind === "phone" ? (
                t("rec.booking.kind.phone")
              ) : (
                `${t("rec.booking.kind.onsite")}: ${b.locationText ?? ""}`
              )}
              {b.interviewerNames
                ? ` · ${t("rec.booking.interviewers")}: ${b.interviewerNames}`
                : ""}
            </p>
            {b.cancelledReason && (
              <p className="mt-1 text-xs text-muted-foreground">{b.cancelledReason}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {b.status === "planned" && ws.canManage && (
                <button
                  type="button"
                  onClick={() => onInvite(b.id)}
                  className="min-h-9 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground"
                >
                  {t("rec.booking.sendInvitation")}
                </button>
              )}
              {b.status === "planned" && (
                <button
                  type="button"
                  onClick={() => setEditing(b)}
                  className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/50"
                >
                  {t("rec.common.edit")}
                </button>
              )}
              {["planned", "invited", "confirmed"].includes(b.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => void setStatus(b, "completed", null)}
                    className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/50"
                  >
                    {t("rec.booking.markHeld")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelling(b)}
                    className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/50"
                  >
                    {t("rec.booking.cancel")}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => downloadIcs(b)}
                className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {t("rec.booking.ics")}
              </button>
            </div>
            {b.status === "planned" && !ws.canManage && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("rec.booking.inviteRestricted")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {(planning || editing) && (
        <BookingForm
          applicationId={ws.applicationId}
          booking={editing}
          onDone={() => {
            setPlanning(false);
            setEditing(null);
            onChanged();
          }}
          onCancel={() => {
            setPlanning(false);
            setEditing(null);
          }}
        />
      )}
      {!planning && !editing && open && (
        <button
          type="button"
          onClick={() => setPlanning(true)}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {t("rec.booking.plan")}
        </button>
      )}

      {cancelling && (
        <CancelBookingDialog
          onCancel={() => setCancelling(null)}
          onConfirm={(reason) => {
            const b = cancelling;
            setCancelling(null);
            void setStatus(b, "cancelled", reason);
          }}
          invited={cancelling.status !== "planned"}
        />
      )}
    </div>
  );
}

function CancelBookingDialog({
  onCancel,
  onConfirm,
  invited,
}: {
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
  invited: boolean;
}) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  return (
    <ConfirmAction
      open
      onOpenChange={(o) => !o && onCancel()}
      tone="destructive"
      title={t("rec.booking.cancelTitle")}
      consequence={
        <div className="space-y-2">
          <p>{invited ? t("rec.booking.cancelInvitedBody") : t("rec.booking.cancelPlannedBody")}</p>
          <label className="block text-sm">
            {t("rec.booking.cancelReason")}
            <input
              className={fieldCls}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
      }
      confirmLabel={t("rec.booking.cancel")}
      cancelLabel={t("rec.common.back")}
      onConfirm={() => onConfirm(reason.trim() || null)}
    />
  );
}

function BookingForm({
  applicationId,
  booking,
  onDone,
  onCancel,
}: {
  applicationId: string;
  booking: BookingRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const fn = useServerFn(saveInterviewBooking);
  const tz0 = booking?.timezone ?? localTimezone();
  const init = booking
    ? (() => {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: booking.timezone,
          hourCycle: "h23",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }).formatToParts(new Date(booking.startsAt));
        const g = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
        return {
          date: `${g("year")}-${g("month")}-${g("day")}`,
          time: `${g("hour")}:${g("minute")}`,
        };
      })()
    : { date: "", time: "10:00" };
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [duration, setDuration] = useState(booking?.durationMinutes ?? 45);
  const [timezone, setTimezone] = useState(tz0);
  const [kind, setKind] = useState<"onsite" | "video" | "phone">(booking?.locationKind ?? "onsite");
  const [locationText, setLocationText] = useState(booking?.locationText ?? "");
  const [meetingUrl, setMeetingUrl] = useState(booking?.meetingUrl ?? "");
  const [interviewers, setInterviewers] = useState(booking?.interviewerNames ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = Array.from(new Set([tz0, ...COMMON_TIMEZONES]));

  async function save() {
    setError(null);
    const startsAt = zonedToUtcIso(date, time, timezone);
    if (!startsAt) return setError(t("rec.booking.error.when"));
    if (Date.parse(startsAt) < Date.now()) return setError(t("rec.booking.error.past"));
    if (kind === "video" && !/^https:\/\//.test(meetingUrl.trim()))
      return setError(t("rec.booking.error.link"));
    if (kind === "onsite" && !locationText.trim()) return setError(t("rec.booking.error.place"));
    setBusy(true);
    try {
      await fn({
        data: {
          bookingId: booking?.id ?? null,
          applicationId,
          startsAt,
          durationMinutes: duration,
          timezone,
          locationKind: kind,
          locationText: kind === "onsite" ? locationText.trim() : null,
          meetingUrl: kind === "video" ? meetingUrl.trim() : null,
          interviewerNames: interviewers.trim() || null,
          expectedVersion: booking?.version ?? null,
        },
      });
      onDone();
    } catch (e) {
      setError(t(recruitmentErrorKey((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-4">
      <h3 className="text-sm font-semibold">
        {booking ? t("rec.booking.editTitle") : t("rec.booking.planTitle")}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("rec.booking.planLede")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-medium sm:col-span-1">
          {t("rec.booking.date")}
          <input
            type="date"
            className={fieldCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          {t("rec.booking.time")}
          <input
            type="time"
            className={fieldCls}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          {t("rec.booking.duration")}
          <select
            className={fieldCls}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {[20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          {t("rec.booking.timezone")}
          <select
            className={fieldCls}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="mt-3">
        <legend className="text-sm font-medium">{t("rec.booking.where")}</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-sm">
          {(["onsite", "video", "phone"] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="booking-kind"
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {t(`rec.booking.kind.${k}` as TranslationKey)}
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "onsite" && (
        <label className="mt-3 block text-sm font-medium">
          {t("rec.booking.place")}
          <input
            className={fieldCls}
            value={locationText}
            maxLength={300}
            onChange={(e) => setLocationText(e.target.value)}
          />
        </label>
      )}
      {kind === "video" && (
        <label className="mt-3 block text-sm font-medium">
          {t("rec.booking.link")}
          <input
            className={fieldCls}
            value={meetingUrl}
            placeholder="https://"
            maxLength={500}
            onChange={(e) => setMeetingUrl(e.target.value)}
          />
        </label>
      )}
      <label className="mt-3 block text-sm font-medium">
        {t("rec.booking.interviewers")}
        <input
          className={fieldCls}
          value={interviewers}
          maxLength={300}
          onChange={(e) => setInterviewers(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {busy ? t("rec.common.saving") : t("rec.booking.save")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("rec.common.cancel")}
        </button>
      </div>
    </div>
  );
}

// ── Communication ──────────────────────────────────────────────────────

export function CommunicationPanel({
  ws,
  employerId,
  candidateName,
  employerName,
  jobTitle,
  composeRequest,
  onComposeHandled,
  onChanged,
}: {
  ws: ApplicationWorkspace;
  employerId: string;
  candidateName: string | null;
  employerName: string;
  jobTitle: string;
  composeRequest: { kind: MessageKind; bookingId: string | null; nonce: number } | null;
  onComposeHandled: () => void;
  onChanged: () => void;
}) {
  const { t, lang } = useT();
  const sendFn = useServerFn(sendRecruitmentMessages);
  const retryReceiptFn = useServerFn(retryReceiptEmail);
  const [composing, setComposing] = useState<{
    kind: MessageKind;
    bookingId: string | null;
    draftId: string | null;
  } | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // A request from elsewhere on the page -- "send invitation" on a booking,
  // "tell the candidate" after a decision -- opens the composer here.
  useEffect(() => {
    if (!composeRequest) return;
    setComposing({ kind: composeRequest.kind, bookingId: composeRequest.bookingId, draftId: null });
    onComposeHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeRequest?.nonce]);

  const draft = composing?.draftId
    ? (ws.messages.find((m) => m.id === composing.draftId) ?? null)
    : null;

  async function retry(id: string, acceptDuplicate = false) {
    setRetrying(id);
    setRetryNotice(null);
    try {
      const m = ws.messages.find((x) => x.id === id);
      if (m?.kind === "receipt") {
        // The receipt's e-mail is driven by the server with its own
        // credentials; this names the person asking, and the database
        // decides. A resend after the provider's window goes only with the
        // person's explicit acceptance that the candidate may get it twice.
        const r = await retryReceiptFn({
          data: { employerId, applicationId: ws.applicationId, acceptDuplicate },
        });
        setRetryNotice(receiptOutcomeText(t, r.outcome, r.code, r.windowOpen));
      } else {
        const res = await sendFn({ data: { messageIds: [id] } });
        setRetryNotice(outcomeText(t, res.outcomes[0]).text);
      }
    } catch {
      setRetryNotice(t("rec.send.uncertain"));
    } finally {
      setRetrying(null);
      onChanged();
    }
  }

  if (!ws.canManage) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden="true" />
          {t("rec.message.restricted")}
        </p>
        <MessageList ws={ws} lang={lang} retrying={retrying} onRetry={null} onEditDraft={null} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {composing ? (
        <MessageComposer
          key={`${composing.kind}-${composing.bookingId}-${composing.draftId}`}
          employerId={employerId}
          applicationId={ws.applicationId}
          candidateName={candidateName}
          employerName={employerName}
          jobTitle={jobTitle}
          bookings={ws.bookings}
          draft={draft}
          initialKind={composing.kind}
          initialBookingId={composing.bookingId}
          onChanged={onChanged}
          onClose={() => setComposing(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setComposing({ kind: "general", bookingId: null, draftId: null })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          {t("rec.message.new")}
        </button>
      )}
      {retryNotice && (
        <p role="status" className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {retryNotice}
        </p>
      )}
      <MessageList
        ws={ws}
        lang={lang}
        retrying={retrying}
        onRetry={(id, acceptDuplicate) => void retry(id, acceptDuplicate)}
        onEditDraft={(id, kind, bookingId) => setComposing({ kind, bookingId, draftId: id })}
      />
    </div>
  );
}

function MessageList({
  ws,
  lang,
  retrying,
  onRetry,
  onEditDraft,
}: {
  ws: ApplicationWorkspace;
  lang: "sv" | "en";
  retrying: string | null;
  onRetry: ((id: string, acceptDuplicate: boolean) => void) | null;
  onEditDraft: ((id: string, kind: MessageKind, bookingId: string | null) => void) | null;
}) {
  const { t } = useT();
  // "Send again anyway" is a two-step decision: the second step says, in
  // words, that the candidate may receive the receipt twice.
  const [confirmResend, setConfirmResend] = useState<string | null>(null);
  if (ws.messages.length === 0)
    return <p className="text-sm text-muted-foreground">{t("rec.message.none")}</p>;
  return (
    <ul className="space-y-2">
      {ws.messages.map((m) => (
        <li key={m.id} className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{m.subject}</p>
            <DeliveryBadge status={m.status} emailStatus={m.emailStatus} kind={m.kind} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(`rec.message.kind.${m.kind}` as TranslationKey)} ·{" "}
            {m.sentAt ? formatStamp(m.sentAt, lang) : formatStamp(m.createdAt, lang)}
            {m.kind === "receipt"
              ? ` · ${t("rec.receipt.byNobody")}`
              : m.authorName
                ? ` · ${m.authorName}`
                : ""}
          </p>
          {m.kind === "receipt" && (m.emailStatus === "failed" || m.emailStatus === "unknown") && (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="receipt-email-detail">
              {m.emailStatus === "unknown"
                ? m.emailWindowOpen
                  ? t("rec.receipt.unknownWindowOpen")
                  : t("rec.receipt.unknownWindowClosed")
                : t("rec.receipt.failedDetail")}
              {m.emailError ? ` (${m.emailError})` : ""} ·{" "}
              {t("rec.receipt.attempts").replace("{n}", String(m.emailAttempts))}
            </p>
          )}
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-accent">
              {t("rec.message.show")}
            </summary>
            <pre className="mt-1 whitespace-pre-wrap font-[inherit] text-sm">{m.body}</pre>
          </details>
          <div className="mt-2 flex flex-wrap gap-2">
            {m.status === "draft" && onEditDraft && (
              <button
                type="button"
                onClick={() => onEditDraft(m.id, m.kind as MessageKind, m.bookingId)}
                className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted/50"
              >
                {t("rec.message.continueDraft")}
              </button>
            )}
            {m.status === "sent" &&
              (m.emailStatus === "failed" ||
                m.emailStatus === "not_configured" ||
                m.emailStatus === "sending" ||
                (m.emailStatus === "unknown" && (m.kind !== "receipt" || m.emailWindowOpen)) ||
                (m.kind === "receipt" && m.emailStatus === "not_attempted")) &&
              onRetry && (
                <button
                  type="button"
                  disabled={retrying === m.id}
                  onClick={() => onRetry(m.id, false)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted/50 disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("rec.message.retryEmail")}
                </button>
              )}
            {/* A receipt whose outcome is unknown AFTER the provider's window:
                nothing resends it by itself, and a person resends it only
                after reading that the candidate may get it twice. */}
            {m.status === "sent" &&
              m.kind === "receipt" &&
              m.emailStatus === "unknown" &&
              !m.emailWindowOpen &&
              onRetry &&
              (confirmResend === m.id ? (
                <span
                  role="group"
                  aria-label={t("rec.receipt.resendConfirm")}
                  className="inline-flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm"
                >
                  {t("rec.receipt.resendConfirm")}
                  <button
                    type="button"
                    disabled={retrying === m.id}
                    onClick={() => {
                      setConfirmResend(null);
                      onRetry(m.id, true);
                    }}
                    className="min-h-8 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                  >
                    {t("rec.receipt.resendYes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResend(null)}
                    className="min-h-8 rounded-md border border-border px-3 text-sm"
                  >
                    {t("rec.receipt.resendNo")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={retrying === m.id}
                  onClick={() => setConfirmResend(m.id)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-amber-500/60 px-3 text-sm hover:bg-amber-500/10 disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("rec.receipt.resendAnyway")}
                </button>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Internal notes ─────────────────────────────────────────────────────

export function InternalNotesPanel({
  ws,
  onChanged,
}: {
  ws: ApplicationWorkspace;
  onChanged: () => void;
}) {
  const { t, lang } = useT();
  const fn = useServerFn(addRecruitmentComment);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await fn({ data: { applicationId: ws.applicationId, body: body.trim() } });
      setBody("");
      onChanged();
    } catch (e) {
      setError(t(recruitmentErrorKey((e as Error).message)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium">
        <span className="sr-only">{t("rec.notes.add")}</span>
        <textarea
          className={`${fieldCls} min-h-[80px]`}
          value={body}
          maxLength={4000}
          placeholder={t("rec.notes.placeholder")}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void add()}
          className="min-h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/50 disabled:opacity-60"
        >
          {busy ? t("rec.common.saving") : t("rec.notes.add")}
        </button>
        {body.trim() && (
          <span className="text-xs text-muted-foreground">{t("rec.notes.unsaved")}</span>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {ws.comments.map((c) => (
          <li key={c.id} className="rounded-md bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              {c.authorName ?? t("rec.notes.colleague")} · {formatStamp(c.createdAt, lang)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
          </li>
        ))}
      </ul>
      {ws.comments.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{t("rec.notes.none")}</p>
      )}
    </div>
  );
}

// ── History ────────────────────────────────────────────────────────────

export function HistoryPanel({ ws }: { ws: ApplicationWorkspace }) {
  const { t, lang } = useT();
  const items = [
    ...ws.events.map((e) => ({
      at: e.createdAt,
      text: `${e.actorRole === "candidate" ? t("rec.history.candidate") : (e.actorName ?? t("rec.notes.colleague"))}: ${t(
        APPLICATION_STATUS_LABEL_KEY[e.previousStatus as ApplicationStatus] ?? "rec.stage.unknown",
      )} → ${t(APPLICATION_STATUS_LABEL_KEY[e.newStatus as ApplicationStatus] ?? "rec.stage.unknown")}${e.note ? ` — ${e.note}` : ""}`,
    })),
    ...ws.messages
      .filter((m) => m.sentAt)
      .map((m) => ({
        at: m.sentAt as string,
        text: `${t("rec.history.messageSent")}: ${m.subject}`,
      })),
    ...ws.bookings.map((b) => ({
      at: b.candidateResponseAt ?? b.invitedAt ?? b.startsAt,
      text: `${t("rec.history.booking")}: ${formatInZone(b.startsAt, b.timezone, lang)} — ${t(`rec.booking.status.${b.status}` as TranslationKey)}`,
    })),
    { at: ws.appliedAt, text: t("rec.history.applied") },
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <ol className="space-y-2 border-l border-border pl-4">
      {items.map((i, idx) => (
        <li key={idx} className="text-sm">
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatStamp(i.at, lang)}
          </span>
          <p>{i.text}</p>
        </li>
      ))}
    </ol>
  );
}
