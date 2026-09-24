// Dates and times as the recruitment workspace shows them.
//
// An interview time is always shown IN ITS OWN ZONE with the zone named, so
// "14:00 (Europe/Stockholm)" means the same thing to a recruiter in Dubai and
// a candidate in Göteborg.

export function formatInZone(iso: string, timezone: string, lang: "sv" | "en"): string {
  try {
    return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
      timeZone: timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  }
}

export function formatDay(iso: string, lang: "sv" | "en"): string {
  return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatStamp(iso: string, lang: "sv" | "en"): string {
  return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** The browser's own zone, falling back to Stockholm -- the product's home
 *  market -- when the runtime cannot say. */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Stockholm";
  } catch {
    return "Europe/Stockholm";
  }
}

/** A wall-clock date and time IN a named zone, resolved to the instant it
 *  denotes -- or the reason it denotes none, or two.
 *
 *  Around a daylight-saving change a wall-clock time can be a time that
 *  never happens (the hour the clocks skip) or one that happens twice (the
 *  hour they repeat). Both are found by trying every offset the zone uses
 *  around that day and keeping the instants that really show that wall
 *  time; none means the time does not exist, two means it is ambiguous.
 *  Neither is guessed at: an interview booked into a gap would land an hour
 *  off, and one booked into a repeat could land on either. */
export type ZonedTime =
  | { ok: true; iso: string }
  | { ok: false; reason: "invalid" | "nonexistent" | "ambiguous" };

export function resolveZonedTime(
  dateInput: string,
  timeInput: string,
  timezone: string,
): ZonedTime {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  const n = /^(\d{2}):(\d{2})$/.exec(timeInput);
  if (!m || !n) return { ok: false, reason: "invalid" };
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +n[1], +n[2]);
  // A date that only exists by rolling over (month 13, day 32, 25:00) is
  // not a date; Date.UTC would quietly make one.
  const back = new Date(wall);
  if (
    Number.isNaN(wall) ||
    back.getUTCFullYear() !== +m[1] ||
    back.getUTCMonth() !== +m[2] - 1 ||
    back.getUTCDate() !== +m[3] ||
    back.getUTCHours() !== +n[1] ||
    back.getUTCMinutes() !== +n[2]
  ) {
    return { ok: false, reason: "invalid" };
  }
  const day = 24 * 60 * 60 * 1000;
  const offsets = new Set<number>();
  for (const probe of [wall - day, wall, wall + day]) {
    const o = zoneOffsetMs(new Date(probe), timezone);
    if (o === null) return { ok: false, reason: "invalid" };
    offsets.add(o);
  }
  const instants = new Set<number>();
  for (const o of offsets) {
    const instant = wall - o;
    if (zoneOffsetMs(new Date(instant), timezone) === o) instants.add(instant);
  }
  if (instants.size === 0) return { ok: false, reason: "nonexistent" };
  if (instants.size > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, iso: new Date([...instants][0]).toISOString() };
}

/** The instant a wall-clock date and time in a zone denotes, or null when
 *  it denotes none or two (see resolveZonedTime). */
export function zonedToUtcIso(
  dateInput: string,
  timeInput: string,
  timezone: string,
): string | null {
  const r = resolveZonedTime(dateInput, timeInput, timezone);
  return r.ok ? r.iso : null;
}

function zoneOffsetMs(at: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    return asUtc - at.getTime();
  } catch {
    return null;
  }
}

/** The same instant, as the wall-clock date and time inputs of a zone. */
export function utcToZonedInputs(iso: string, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export const COMMON_TIMEZONES = [
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "UTC",
] as const;

// ── Wall-clock arithmetic for the booking dialog ─────────────────────────

/** Minutes between two HH:MM wall-clock times on the same day, or null. */
export function minutesBetween(start: string, end: string): number | null {
  const a = /^(\d{2}):(\d{2})$/.exec(start);
  const b = /^(\d{2}):(\d{2})$/.exec(end);
  if (!a || !b) return null;
  const m = +b[1] * 60 + +b[2] - (+a[1] * 60 + +a[2]);
  return m > 0 ? m : null;
}

function wallMinutes(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const v = +m[1] * 60 + +m[2];
  return v < 24 * 60 ? v : null;
}

/** HH:MM plus minutes, on the same day -- or null when the result would be
 *  on the next day. Never clamped: a time that does not fit is not a time,
 *  and saying "23:59" for it would book two candidates into one slot. */
export function addMinutes(time: string, minutes: number): string | null {
  const v = wallMinutes(time);
  if (v === null) return null;
  const total = v + minutes;
  if (total < 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Start times for N candidates booked back to back from one first slot;
 *  null for every slot that would start on the next day. */
export function consecutiveStarts(first: string, minutes: number, n: number): (string | null)[] {
  return Array.from({ length: n }, (_, i) => addMinutes(first, i * minutes));
}

export type BookingSlot = { id: string; start: string | null };

/** Why a series of bookings cannot be saved as it stands. */
export type SeriesProblem =
  | { kind: "invalid"; id: string }
  /** `fits` of `total` slots begin and end within the day. */
  | { kind: "overflow"; fits: number; total: number }
  /** Two slots overlap: the second starts before the first ends. */
  | { kind: "overlap"; first: string; second: string };

/** Check a whole series BEFORE any booking is saved: every slot must be a
 *  time, begin and end within the day, and none may overlap another --
 *  whether the slots were prefilled or typed by hand. */
export function checkBookingSeries(
  slots: readonly BookingSlot[],
  minutes: number,
): SeriesProblem | null {
  const parsed: { id: string; at: number }[] = [];
  let fits = 0;
  for (const s of slots) {
    if (s.start === null) continue;
    const at = wallMinutes(s.start);
    if (at === null) return { kind: "invalid", id: s.id };
    if (at + minutes <= 24 * 60) fits += 1;
    parsed.push({ id: s.id, at });
  }
  if (fits < slots.length) return { kind: "overflow", fits, total: slots.length };
  parsed.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].at < parsed[i - 1].at + minutes) {
      return { kind: "overlap", first: parsed[i - 1].id, second: parsed[i].id };
    }
  }
  return null;
}
