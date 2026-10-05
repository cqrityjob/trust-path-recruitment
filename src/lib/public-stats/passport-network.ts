// Security Passport Network — the client's whole view of the public statistics.
//
// ONE call (`sp_network_stats`), ONE bounded jsonb document, no realtime and
// no private rows: the browser never reads a Passport table to produce these
// numbers (the database aggregates; see
// supabase/migrations/20261227090000_sp_network_statistics.sql).
//
// The payload is re-parsed here against an allow-list. Anything the database
// might one day add that this file does not name is dropped, never rendered,
// and a malformed or hidden payload is "unavailable": the homepage then draws
// nothing at all rather than a zero it cannot back.
import { supabase } from "@/integrations/supabase/client";

export type NetworkDisplay = "passport_page" | "public";

export interface NetworkStats {
  /** Where the owner has said these may be shown. */
  display: NetworkDisplay;
  passports: number;
  credentials: number;
  /** ISO 3166-1 alpha-2 codes of markets at or above the disclosure threshold.
   *  Alphabetical, carrying no size information. */
  markets: readonly string[];
  /** Whether smaller markets exist. A boolean on purpose: no count of them. */
  otherMarkets: boolean;
}

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Null = nothing to show (hidden, missing function, malformed). */
export function parseNetworkStats(raw: unknown): NetworkStats | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.display !== "passport_page" && r.display !== "public") return null;
  if (!isCount(r.passports) || !isCount(r.credentials)) return null;
  const markets = Array.isArray(r.markets)
    ? r.markets.filter((m): m is string => typeof m === "string" && /^[A-Z]{2}$/.test(m))
    : [];
  return {
    display: r.display,
    passports: r.passports,
    credentials: r.credentials,
    markets,
    otherMarkets: r.otherMarkets === true,
  };
}

/** Whether a surface may draw the statistics under the owner's setting. */
export function mayShowNetworkStats(
  stats: NetworkStats | null,
  surface: "homepage" | "passport_page",
): stats is NetworkStats {
  if (!stats) return false;
  return surface === "passport_page" ? true : stats.display === "public";
}

/** Null = the owner has not published (or the payload is unusable). A failed
 *  READ is different and throws: the query then keeps the last good figures and
 *  never turns a failure into a zero. */
export async function fetchNetworkStats(): Promise<NetworkStats | null> {
  const { data, error } = await supabase.rpc("sp_network_stats");
  if (error) throw new Error("Network statistics unavailable");
  return parseNetworkStats(data);
}

/** How the figures stay live: re-read about once a minute while the page is
 *  visible (never in a background tab), on returning to the tab, and when the
 *  app invalidates the key after something changed. They are counts of real
 *  Passports, so they are re-derived by the database on every read; nothing is
 *  cached longer than the interval. */
export const NETWORK_STATS_REFETCH_MS = 60_000;

export const NETWORK_STATS_QUERY = {
  queryKey: ["sp-network-stats"],
  queryFn: fetchNetworkStats,
  staleTime: 30_000,
  refetchInterval: NETWORK_STATS_REFETCH_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: false,
} as const;

/** The time of day the figures were last read, in the reader's language. */
export function formatUpdatedAt(epochMs: number, lang: "sv" | "en"): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: "2-digit", minute: "2-digit" }).format(
    new Date(epochMs),
  );
}

const LOCALE = { sv: "sv-SE", en: "en-GB" } as const;

export function formatCount(n: number, lang: "sv" | "en"): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(n);
}

/** A market's name in the reader's language, from the platform's own locale
 *  data. Falls back to the code, never to a guess. */
export function marketName(code: string, lang: "sv" | "en"): string {
  try {
    return new Intl.DisplayNames([LOCALE[lang]], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
