/**
 * Locale-aware date/date-time display for the employer job surfaces.
 *
 * Product-owner finding: the employer job list and edit page showed
 * stored dates via `.toLocaleDateString()`/`.toLocaleString()` with no
 * explicit locale, which falls back to the browser's own locale (usually
 * en-US) regardless of the app's active language — showing mm/dd/yyyy and
 * 12-hour "12:00 PM" style times even in Swedish view. Mirrors the
 * locale choice already established in src/routes/jobs.$slug.tsx's own
 * (unexported) formatDate: sv-SE for Swedish, en-GB for English (not
 * en-US, which is the actual source of the mm/dd/yyyy bug). Storage
 * values are never touched — this only affects display.
 */

export type Lang = "sv" | "en";

function localeFor(lang: Lang): string {
  return lang === "sv" ? "sv-SE" : "en-GB";
}

export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(localeFor(lang), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Always 24-hour, no AM/PM, in both languages -- unambiguous and
// consistent regardless of locale, and sv-SE's numeric year/month/day
// ordering naturally renders as yyyy-mm-dd.
export function formatDateTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(localeFor(lang), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
