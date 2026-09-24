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

/** A wall-clock date and time IN a named zone, converted to the instant it
 *  denotes. Iterates on the zone's offset so it is right across DST changes. */
export function zonedToUtcIso(
  dateInput: string,
  timeInput: string,
  timezone: string,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  const n = /^(\d{2}):(\d{2})$/.exec(timeInput);
  if (!m || !n) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +n[1], +n[2]);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const offset = zoneOffsetMs(new Date(guess), timezone);
    if (offset === null) return null;
    guess = wall - offset;
  }
  return new Date(guess).toISOString();
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

/** HH:MM plus minutes, kept on the same day (clamped at 23:59). */
export function addMinutes(time: string, minutes: number): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const total = Math.min(23 * 60 + 59, +m[1] * 60 + +m[2] + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Start times for N candidates booked back to back from one first slot. */
export function consecutiveStarts(first: string, minutes: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMinutes(first, i * minutes));
}
