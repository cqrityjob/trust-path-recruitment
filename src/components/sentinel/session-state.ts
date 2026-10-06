import type { Session } from "@/lib/sentinel/types";

export function isClosed(session: Session | null) {
  return !!session && ["completed", "timed_out", "abandoned"].includes(session.status);
}

/** Network snapshots can arrive out of order. Closure is final for this run. */
export function acceptsSnapshot(current: Session | null, next: Session, attemptId: string) {
  if (next.attemptId !== attemptId) return false;
  if (!current) return true;
  if (next.revision < current.revision) return false;
  if (isClosed(current) && next.status !== current.status) return false;
  return (
    next.revision !== current.revision ||
    Date.parse(next.serverNow) >= Date.parse(current.serverNow)
  );
}
