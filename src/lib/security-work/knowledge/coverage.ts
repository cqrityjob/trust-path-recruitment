/**
 * What the monitoring can honestly claim. Pure. "No developments" is only
 * ever a statement about sources that are connected and were checked
 * recently; every other state says what is missing instead.
 */
export type CoverageState =
  | "no_connected_source"
  | "never_checked"
  | "failing"
  | "stale"
  | "current";

export interface SourceHealth {
  id: string;
  name: string;
  source_type: string;
  active: boolean;
  poll_target_minutes: number | null;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure: string | null;
}
export interface SourceCoverage {
  sourceId: string;
  name: string;
  state: Exclude<CoverageState, "no_connected_source">;
  /** Minutes since the last successful check, measured, or null if never. */
  minutesSinceSuccess: number | null;
  targetMinutes: number;
  failure: string | null;
}
export interface Coverage {
  state: CoverageState;
  sources: SourceCoverage[];
}

const DEFAULT_TARGET = 24 * 60;

export function sourceCoverage(source: SourceHealth, now: Date): SourceCoverage {
  const target = source.poll_target_minutes ?? DEFAULT_TARGET;
  const success = source.last_success_at ? Date.parse(source.last_success_at) : null;
  const failure = source.last_failure_at ? Date.parse(source.last_failure_at) : null;
  const minutes =
    success === null ? null : Math.max(0, Math.round((now.getTime() - success) / 60000));
  let state: SourceCoverage["state"];
  if (!source.last_checked_at) state = "never_checked";
  else if (failure !== null && (success === null || failure >= success)) state = "failing";
  else if (minutes === null || minutes > target * 2) state = "stale";
  else state = "current";
  return {
    sourceId: source.id,
    name: source.name,
    state,
    minutesSinceSuccess: minutes,
    targetMinutes: target,
    failure: state === "failing" ? source.last_failure : null,
  };
}

/** The workspace's state is its weakest connected feed. Manual sources are not monitoring. */
export function coverage(sources: readonly SourceHealth[], now: Date): Coverage {
  const feeds = sources.filter((source) => source.active && source.source_type === "official_feed");
  if (!feeds.length) return { state: "no_connected_source", sources: [] };
  const each = feeds.map((source) => sourceCoverage(source, now));
  const order: SourceCoverage["state"][] = ["failing", "never_checked", "stale", "current"];
  const state =
    order.find((candidate) => each.some((entry) => entry.state === candidate)) ?? "current";
  return { state, sources: each };
}
