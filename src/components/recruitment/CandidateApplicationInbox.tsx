// What an employer has sent a candidate about ONE application: interview
// invitations they can answer, and messages. Only what was actually sent
// reaches here -- the database shows a candidate no draft, no planned-but-
// unsent time and no internal note -- so everything on this card is something
// the employer chose to say to them.

import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CalendarCheck2, CalendarX2, Download, Mail } from "lucide-react";
import { useT } from "@/i18n/context";
import { BookingBadge } from "@/components/recruitment/RecruitmentStatus";
import {
  respondToInterviewBooking,
  type CandidateInboxItem,
} from "@/lib/recruitment/recruitment.functions";
import { formatStamp } from "@/lib/recruitment/format";
import {
  bookingIcs,
  formatBookingWhen,
  formatBookingWhere,
} from "@/lib/recruitment/message-templates";

export function CandidateApplicationInbox({
  item,
  employerName,
  jobTitle,
  onChanged,
}: {
  item: CandidateInboxItem | undefined;
  employerName: string;
  jobTitle: string;
  onChanged: () => void;
}) {
  const { t, lang } = useT();
  const respondFn = useServerFn(respondToInterviewBooking);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!item || (item.messages.length === 0 && item.bookings.length === 0)) return null;

  async function respond(bookingId: string, response: "confirmed" | "declined") {
    setBusy(bookingId);
    setError(null);
    try {
      await respondFn({ data: { bookingId, response } });
      onChanged();
    } catch {
      setError(t("rec.inbox.respondFailed"));
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {item.bookings.map((b) => (
        <div key={b.id} className="rounded-md border border-accent/40 bg-accent/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("rec.inbox.interview")}</p>
            <BookingBadge status={b.status} />
          </div>
          <p className="mt-1 text-sm">{formatBookingWhen(b, lang)}</p>
          <p className="text-sm">
            {b.locationKind === "video" && b.meetingUrl ? (
              <a
                href={b.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {formatBookingWhere(b, lang)}
              </a>
            ) : (
              formatBookingWhere(b, lang)
            )}
          </p>
          {b.interviewerNames && (
            <p className="text-xs text-muted-foreground">
              {t("rec.booking.interviewers")}: {b.interviewerNames}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {b.status === "invited" && (
              <button
                type="button"
                disabled={busy === b.id}
                onClick={() => void respond(b.id, "confirmed")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
                {t("rec.inbox.confirm")}
              </button>
            )}
            {(b.status === "invited" || b.status === "confirmed") && (
              <button
                type="button"
                disabled={busy === b.id}
                onClick={() => void respond(b.id, "declined")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm disabled:opacity-60"
              >
                <CalendarX2 className="h-4 w-4" aria-hidden="true" />
                {t("rec.inbox.decline")}
              </button>
            )}
            {(b.status === "invited" || b.status === "confirmed") && (
              <button
                type="button"
                onClick={() => {
                  const ics = bookingIcs({
                    uid: b.id,
                    title: `${t("rec.booking.icsTitle")}: ${jobTitle} – ${employerName}`,
                    booking: b,
                    organiser: employerName,
                  });
                  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "interview.ics";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("rec.booking.ics")}
              </button>
            )}
          </div>
          {b.status === "declined" && (
            <p className="mt-1 text-xs text-muted-foreground">{t("rec.inbox.declinedNote")}</p>
          )}
        </div>
      ))}
      {item.messages.map((m) => (
        <details key={m.id} className="rounded-md border border-border p-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{m.subject}</span>
            {m.kind === "receipt" && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {t("rec.message.kind.receipt")}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{formatStamp(m.sentAt, lang)}</span>
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-[inherit] text-sm">{m.body}</pre>
        </details>
      ))}
    </div>
  );
}
