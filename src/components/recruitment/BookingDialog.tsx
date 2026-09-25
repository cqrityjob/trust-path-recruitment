// Book interview times from the candidate list.
//
// Varbi's "Nytt intervjutillfälle" dialog, with CQrityjob's own rules:
//
//   * SAVING A TIME IS NOT SENDING AN INVITATION. This dialog writes bookings
//     in the state "planned -- not sent". The invitation is a message, written
//     and reviewed on the candidate's page, and it is what turns the booking
//     into one the candidate can answer. Nothing here reaches a candidate.
//   * SEVERAL CANDIDATES MEAN SEVERAL BOOKINGS. Each selected candidate gets
//     their own booking with their own start time, prefilled back to back so
//     nobody is accidentally booked into the same slot as somebody else. The
//     dialog says so in words before anything is saved.
//   * THE WHOLE SERIES IS CHECKED BEFORE THE FIRST SAVE. A series that does
//     not fit within the chosen day, two slots that overlap (prefilled or
//     typed by hand), or a wall-clock time that does not exist or exists
//     twice in the chosen zone on that day (a daylight-saving change) stops
//     the save with a sentence that says which, and nothing is written. No
//     time is clamped, shortened or moved to another day on the recruiter's
//     behalf.
//   * THE END TIME IS THE DURATION. The database keeps starts_at and
//     duration_minutes; "slut" is shown as a time because that is how people
//     read a calendar, and stored as the minutes between the two.
//   * A TIME ZONE IS ALWAYS NAMED. The time is stored as an instant and shown
//     in the zone chosen here, so a recruiter in Dubai and a candidate in
//     Göteborg read the same appointment.
//
// The fields Varbi shows that this data model does not hold -- a free-text
// title and "contact information in case of problems" -- belong in the
// invitation message, where the candidate reads them. The dialog says so
// rather than offering an input that is stored nowhere.

import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { recruitmentErrorKey } from "@/components/recruitment/errors";
import {
  COMMON_TIMEZONES,
  addMinutes,
  checkBookingSeries,
  consecutiveStarts,
  localTimezone,
  minutesBetween,
  resolveZonedTime,
  type SeriesProblem,
  type ZonedTime,
} from "@/lib/recruitment/format";
import { saveInterviewBooking } from "@/lib/recruitment/recruitment.functions";

export type BookingCandidate = { applicationId: string; name: string | null };

const fieldCls =
  "mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function BookingDialog({
  candidates,
  onClose,
}: {
  candidates: BookingCandidate[];
  /** `saved` is how many bookings were written; the list refreshes on > 0. */
  onClose: (saved: number) => void;
}) {
  const { t } = useT();
  const fn = useServerFn(saveInterviewBooking);
  const tz0 = localTimezone();
  const zones = Array.from(new Set([tz0, ...COMMON_TIMEZONES]));
  const [date, setDate] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("10:45");
  const [timezone, setTimezone] = useState(tz0);
  const [kind, setKind] = useState<"onsite" | "video" | "phone">("onsite");
  const [locationText, setLocationText] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [interviewers, setInterviewers] = useState("");
  // Per-candidate start times, only shown for more than one candidate.
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    { applicationId: string; name: string | null; ok: boolean; code: string | null }[] | null
  >(null);

  const duration = minutesBetween(start, end);
  const many = candidates.length > 1;
  // A prefilled slot is null when it would start on the next day: shown as
  // "does not fit", never as 23:59. A slot that starts today but would end
  // tomorrow does not fit either, and is flagged the same way.
  const startFor = (id: string, i: number): string | null =>
    starts[id] ?? (duration ? consecutiveStarts(start, duration, candidates.length)[i] : start);
  const slotFits = (value: string | null): boolean =>
    value !== null && addMinutes(value, duration ?? 0) !== null;

  function seriesMessage(p: SeriesProblem): string {
    const nameOf = (id: string) =>
      candidates.find((c) => c.applicationId === id)?.name ?? anonymous;
    switch (p.kind) {
      case "overflow":
        return t("rec.bookingDialog.error.overflow")
          .replace("{fits}", String(p.fits))
          .replace("{n}", String(p.total))
          .replace("{start}", start);
      case "overlap":
        return t("rec.bookingDialog.error.overlap")
          .replace("{a}", nameOf(p.first))
          .replace("{b}", nameOf(p.second));
      case "invalid":
        return t("rec.booking.error.when");
    }
  }

  function zoneMessage(r: Extract<ZonedTime, { ok: false }>, time: string): string {
    const key =
      r.reason === "nonexistent"
        ? "rec.bookingDialog.error.nonexistent"
        : r.reason === "ambiguous"
          ? "rec.bookingDialog.error.ambiguous"
          : "rec.booking.error.when";
    return t(key).replace("{time}", time).replace("{date}", date).replace("{zone}", timezone);
  }

  // Slots the recruiter has not typed by hand follow the first slot.
  function retime(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
  }

  async function save() {
    setError(null);
    if (!date) return setError(t("rec.booking.error.when"));
    if (!duration) return setError(t("rec.booking.error.end"));
    if (duration < 10 || duration > 480) return setError(t("rec.booking.error.end"));
    if (kind === "video" && !/^https:\/\//.test(meetingUrl.trim()))
      return setError(t("rec.booking.error.link"));
    if (kind === "onsite" && !locationText.trim()) return setError(t("rec.booking.error.place"));

    // The whole series first, then each slot's instant in the chosen zone.
    // Only when every one of them holds is anything saved.
    const slots = candidates.map((c, i) => ({
      id: c.applicationId,
      start: many ? startFor(c.applicationId, i) : start,
    }));
    const problem = checkBookingSeries(slots, duration);
    if (problem) return setError(seriesMessage(problem));
    const plan: { applicationId: string; name: string | null; startsAt: string }[] = [];
    for (const [i, c] of candidates.entries()) {
      const time = slots[i].start ?? "";
      const resolved = resolveZonedTime(date, time, timezone);
      if (!resolved.ok) return setError(zoneMessage(resolved, time));
      plan.push({ applicationId: c.applicationId, name: c.name, startsAt: resolved.iso });
    }
    if (plan.some((p) => Date.parse(p.startsAt) < Date.now()))
      return setError(t("rec.booking.error.past"));

    setBusy(true);
    const out: NonNullable<typeof results> = [];
    for (const p of plan) {
      try {
        await fn({
          data: {
            bookingId: null,
            applicationId: p.applicationId,
            startsAt: p.startsAt,
            durationMinutes: duration,
            timezone,
            locationKind: kind,
            locationText: kind === "onsite" ? locationText.trim() : null,
            meetingUrl: kind === "video" ? meetingUrl.trim() : null,
            interviewerNames: interviewers.trim() || null,
            expectedVersion: null,
          },
        });
        out.push({ applicationId: p.applicationId, name: p.name, ok: true, code: null });
      } catch (e) {
        out.push({
          applicationId: p.applicationId,
          name: p.name,
          ok: false,
          code: (e as Error).message,
        });
      }
    }
    setBusy(false);
    setResults(out);
  }

  const saved = results?.filter((r) => r.ok).length ?? 0;
  const anonymous = t("employer.applications.anonymousCandidate");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(saved)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("rec.bookingDialog.title")}</DialogTitle>
          <DialogDescription>
            {many
              ? t("rec.bookingDialog.ledeMany").replace("{n}", String(candidates.length))
              : t("rec.bookingDialog.ledeOne").replace("{name}", candidates[0]?.name ?? anonymous)}
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div>
            <p className="text-sm font-medium" role="status">
              {t("rec.bookingDialog.savedCount")
                .replace("{ok}", String(saved))
                .replace("{total}", String(results.length))}
            </p>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
              {results.map((r) => (
                <li
                  key={r.applicationId}
                  className="flex flex-wrap justify-between gap-2 px-3 py-2"
                >
                  <span className="font-medium">{r.name ?? anonymous}</span>
                  <span
                    className={r.ok ? "text-emerald-800 dark:text-emerald-200" : "text-destructive"}
                  >
                    {r.ok
                      ? t("rec.booking.status.planned")
                      : t(recruitmentErrorKey(r.code ?? "RECRUITMENT_ACTION_FAILED"))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">{t("rec.bookingDialog.nextStep")}</p>
            <DialogFooter className="mt-4">
              <button
                type="button"
                onClick={() => onClose(saved)}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground"
              >
                {t("rec.common.close")}
              </button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
              <label className="text-sm font-medium">
                {t("rec.booking.date")}
                <input
                  type="date"
                  required
                  className={fieldCls}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="text-sm font-medium">
                {t("rec.bookingDialog.start")}
                <input
                  type="time"
                  required
                  className={fieldCls}
                  value={start}
                  onChange={(e) => {
                    const d = duration ?? 45;
                    // An end that would fall on the next day is left empty
                    // rather than clamped; the line below then asks for one.
                    retime(e.target.value, addMinutes(e.target.value, d) ?? "");
                  }}
                />
              </label>
              <label className="text-sm font-medium">
                {t("rec.bookingDialog.end")}
                <input
                  type="time"
                  required
                  className={fieldCls}
                  value={end}
                  onChange={(e) => retime(start, e.target.value)}
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              {duration
                ? t("rec.bookingDialog.duration").replace("{m}", String(duration))
                : t("rec.booking.error.end")}
            </p>
            <label className="mt-3 block text-sm font-medium">
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

            {many && (
              <fieldset className="mt-4 rounded-md border border-border p-3">
                <legend className="px-1 text-sm font-medium">{t("rec.bookingDialog.slots")}</legend>
                <p className="text-xs text-muted-foreground">{t("rec.bookingDialog.slotsLede")}</p>
                <ul className="mt-2 space-y-2">
                  {candidates.map((c, i) => (
                    <li
                      key={c.applicationId}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-medium">{c.name ?? anonymous}</span>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t("rec.bookingDialog.start")}
                        {!slotFits(startFor(c.applicationId, i)) && (
                          <span className="text-destructive">
                            {t("rec.bookingDialog.slotOverflow")}
                          </span>
                        )}
                        <input
                          type="time"
                          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                          value={startFor(c.applicationId, i) ?? ""}
                          aria-invalid={!slotFits(startFor(c.applicationId, i)) || undefined}
                          onChange={(e) =>
                            setStarts((prev) => ({ ...prev, [c.applicationId]: e.target.value }))
                          }
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            <fieldset className="mt-4">
              <legend className="text-sm font-medium">{t("rec.booking.where")}</legend>
              <div className="mt-1 flex flex-wrap gap-4 text-sm">
                {(["onsite", "video", "phone"] as const).map((k) => (
                  <label key={k} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="booking-dialog-kind"
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
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {t("rec.bookingDialog.linkNote")}
                </span>
              </label>
            )}
            <label className="mt-3 block text-sm font-medium">
              {t("rec.bookingDialog.interviewers")}
              <input
                className={fieldCls}
                value={interviewers}
                maxLength={300}
                onChange={(e) => setInterviewers(e.target.value)}
              />
            </label>
            <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {t("rec.bookingDialog.notSent")}
            </p>
            {error && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => onClose(0)}
                className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {t("rec.common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {busy
                  ? t("rec.common.saving")
                  : many
                    ? t("rec.bookingDialog.saveMany").replace("{n}", String(candidates.length))
                    : t("rec.booking.save")}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
