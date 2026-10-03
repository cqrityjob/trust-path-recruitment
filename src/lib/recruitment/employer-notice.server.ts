// The employer's e-mail on a NEW application, driven by the server.
//
// The database half is supabase/migrations/20270205090000_employer_new_
// application_notices.sql: WHO may be written to (rec_employer_notice_recipients,
// service_role only, the address from auth.users), an outbox with one row per
// (application, recipient, kind), and the claim / settle pair that lets exactly
// one worker send each row and records what the provider answered. This file is
// the only caller, and the only place that sends:
//
//   enqueue   rec_enqueue_employer_new_application_notices(application) -- the
//             application id and nothing else. Who is written to is the
//             database's decision, never the request's, never a candidate's.
//             Set-once per application: a replay creates no second set.
//   claim     rec_claim_employer_notices hands over ONE attempt per row with the
//             recipient's address (read from auth.users at that moment, after
//             eligibility was decided again), the provider key
//             `employer-new-application:<row id>` and what the mail needs --
//             nothing about the candidate.
//   send      sendEmployerApplicationNoticeEmail: the shared transport, the
//             provider key on EVERY attempt (the provider deduplicates for 24 h),
//             a bounded call. Inert without the transport (not_configured).
//   settle    rec_settle_employer_notice records the provider's HTTP status for
//             THAT attempt. A late answer for an earlier attempt is stale.
//   sweep     the same claim without an application: what is due anywhere --
//             never started, lease expired, a retryable failure past its
//             backoff -- bounded, one worker per row. After its claim loop the
//             sweep deletes the notices settled more than 90 days ago
//             (rec_purge_employer_notices; never a pending, claimed or retryable
//             row).
//
// ── THE APPLY REQUEST COMES FIRST ──────────────────────────────────────────
//
// notifyEmployerOfNewApplication is called by submitJobApplication AFTER the
// application committed and after the candidate's receipt. It never throws and
// it is bounded: enqueue and the first send attempts share ONE budget of at most
// three seconds (EMPLOYER_NOTICE_BUDGET_MS). Whatever has not completed when it
// ends stays pending / claimed in the outbox, and the sweep (the receipts sweep
// endpoint, same token, same schedule) takes it from there: a claim whose
// worker is gone is handed out again when its lease expires, under the same
// provider key, so the provider -- not luck -- prevents a second mail.
//
// ── BEFORE THE MIGRATION, AND AFTER A ROLLBACK ─────────────────────────────
//
// A missing function or table (PostgREST PGRST202 / PGRST205, Postgres 42883 /
// 42P01) is a logged no-op: nothing is queued, nothing is sent, nothing fails,
// and the sweep says `available: false`. The application change is therefore
// safe to publish before the migration is applied.
//
// ── HONESTY ────────────────────────────────────────────────────────────────
//
// "sent" is recorded only when the provider accepted the mail. A refusal is
// 'failed' with its status; no answer (timeout, network, 5xx, 409) is 'failed'
// with status 0 / the status and is retried inside the provider's window; a
// transport that is not configured is 'not_configured'. Nothing here is ever
// shown to the candidate. Only statuses are logged: never an address.

import {
  EMPLOYER_NOTICE_EMAIL_KINDS,
  type EmployerNoticeKind,
} from "@/lib/email/send-employer-application-notice-email.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** Everything enqueue + the first send attempts may take inside the apply
 *  request. A hard ceiling: callers may ask for less, never for more. */
export const EMPLOYER_NOTICE_BUDGET_MS = 3000;
/** The notice kinds this worker can render: the keys of the one table in the
 *  sender. The claim hands over nothing else, so an older worker is never given
 *  a kind a newer migration added. */
const KINDS: string[] = Object.keys(EMPLOYER_NOTICE_EMAIL_KINDS);
/** How long a settled notice is kept. The database refuses anything under a day. */
export const EMPLOYER_NOTICE_RETENTION = "90 days";

type RpcAnswer = { data: unknown; error: { code?: string; message?: string } | null };
export type EmployerNoticeRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcAnswer>;

/** Test seams. In production all three are the defaults. */
export type EmployerNoticeDeps = {
  rpc?: EmployerNoticeRpc;
  fetchImpl?: typeof fetch;
  siteOrigin?: string;
};

async function defaultRpc(fn: string, args: Record<string, unknown>): Promise<RpcAnswer> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (await (supabaseAdmin as Loose).rpc(fn, args)) as RpcAnswer;
}

/** The function or table is not there: the migration is not applied (or was
 *  rolled back). PostgREST says PGRST202 for a function and PGRST205 for a
 *  table it does not know; Postgres itself says 42883 / 42P01. */
export function isMissingNoticeObject(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(String(error.code ?? ""))) return true;
  return /could not find the function|schema cache|does not exist/i.test(
    String(error.message ?? ""),
  );
}

function rpcOf(deps: EmployerNoticeDeps): EmployerNoticeRpc {
  return deps.rpc ?? defaultRpc;
}

async function originOf(deps: EmployerNoticeDeps): Promise<string> {
  if (deps.siteOrigin) return deps.siteOrigin;
  const { serverSiteOrigin } = await import("@/lib/site-origin");
  return serverSiteOrigin(process.env.PUBLIC_SITE_URL);
}

// ── enqueue ───────────────────────────────────────────────────────────────

export type EnqueueOutcome =
  | { state: "queued"; count: number }
  /** The migration is not applied: nothing queued, by design. */
  | { state: "unavailable" }
  | { state: "failed" };

/** Queue the notices of one committed application. Never throws. Set-once in
 *  the database, so calling it again (a replay, a retry) creates nothing. */
export async function enqueueEmployerNotices(
  applicationId: string,
  deps: EmployerNoticeDeps = {},
): Promise<EnqueueOutcome> {
  try {
    const { data, error } = await rpcOf(deps)("rec_enqueue_employer_new_application_notices", {
      _application_id: applicationId,
    });
    if (error) {
      if (isMissingNoticeObject(error)) {
        console.warn(
          "[employer-notice] not available (the notice migration is not applied): nothing queued",
        );
        return { state: "unavailable" };
      }
      console.error("[employer-notice] enqueue failed", error.code ?? "unknown");
      return { state: "failed" };
    }
    return { state: "queued", count: typeof data === "number" ? data : 0 };
  } catch (e) {
    console.error("[employer-notice] enqueue failed", e instanceof Error ? e.name : "unknown");
    return { state: "failed" };
  }
}

// ── claim, send, settle ───────────────────────────────────────────────────

type Claim = {
  notice_id: string;
  attempt_id: string;
  provider_key: string | null;
  kind: string;
  application_id: string;
  recipient_email: string | null;
  via: string | null;
  language: string | null;
  employer_name: string | null;
  employer_slug: string | null;
  job_title: string | null;
  attempts: number;
};

export type NoticeSendOutcome = "sent" | "failed" | "not_configured" | "unsettled";

/** Send one claimed attempt and settle it. Never throws. */
async function sendClaimedNotice(
  claim: Claim,
  timeoutMs: number,
  deps: EmployerNoticeDeps,
): Promise<NoticeSendOutcome> {
  let result: "sent" | "failed" | "not_configured";
  let status: number | null = null;
  if (!Object.prototype.hasOwnProperty.call(EMPLOYER_NOTICE_EMAIL_KINDS, claim.kind)) {
    // Not a kind this worker can render (the claim should never hand one over).
    // Nothing is sent and nothing is settled: the lease runs out and a worker
    // that knows the kind takes it.
    console.error("[employer-notice] a claimed notice of a kind this worker cannot render");
    return "unsettled";
  }
  try {
    const { sendEmployerApplicationNoticeEmail } =
      await import("@/lib/email/send-employer-application-notice-email.server");
    const origin = await originOf(deps);
    const answer =
      claim.recipient_email && claim.application_id
        ? await sendEmployerApplicationNoticeEmail({
            noticeKind: claim.kind as EmployerNoticeKind,
            recipientEmail: claim.recipient_email,
            language: claim.language === "en" ? "en" : "sv",
            via: String(claim.via ?? ""),
            employerName: String(claim.employer_name ?? ""),
            employerSlug: String(claim.employer_slug ?? ""),
            jobTitle: String(claim.job_title ?? ""),
            applicationId: claim.application_id,
            siteOrigin: origin,
            idempotencyKey: claim.provider_key ?? `employer-new-application:${claim.notice_id}`,
            timeoutMs,
            fetchImpl: deps.fetchImpl,
          })
        : ({ result: "failed", status: 0 } as const);
    if (answer.result === "not_configured") {
      result = "not_configured";
    } else if (answer.result === "sent") {
      result = "sent";
      status = answer.status;
    } else {
      // "failed" (a refusal) and "unknown" (no answer, 5xx, 409) are both an
      // attempt that did not succeed; the database retries exactly the ones
      // that can still succeed, from the status.
      result = "failed";
      status = answer.status;
    }
  } catch (e) {
    // The sender never throws; if something did, nothing is known about the
    // provider, which is "no answer".
    console.error("[employer-notice] send failed", e instanceof Error ? e.name : "unknown");
    result = "failed";
    status = 0;
  }
  try {
    const { error } = await rpcOf(deps)("rec_settle_employer_notice", {
      _attempt_id: claim.attempt_id,
      _result: result,
      _http_status: status,
    });
    if (error) {
      // The answer could not be recorded: the row stays claimed, its lease runs
      // out, and the sweep tries again under the same provider key. Said, not
      // hidden.
      console.error("[employer-notice] settle failed", error.code ?? "unknown");
      return "unsettled";
    }
  } catch (e) {
    console.error("[employer-notice] settle failed", e instanceof Error ? e.name : "unknown");
    return "unsettled";
  }
  return result;
}

export type DispatchSummary = {
  /** false: the migration is not applied; nothing was claimed. */
  available: boolean;
  claimed: number;
  sent: number;
  failed: number;
  notConfigured: number;
  /** Sent or refused, but the answer could not be recorded. */
  unsettled: number;
};

function emptySummary(available = true): DispatchSummary {
  return { available, claimed: 0, sent: 0, failed: 0, notConfigured: 0, unsettled: 0 };
}

function tally(summary: DispatchSummary, outcome: NoticeSendOutcome): void {
  if (outcome === "sent") summary.sent += 1;
  else if (outcome === "failed") summary.failed += 1;
  else if (outcome === "not_configured") summary.notConfigured += 1;
  else summary.unsettled += 1;
}

async function claimNotices(
  args: { application: string | null; limit: number },
  deps: EmployerNoticeDeps,
): Promise<{ state: "ok"; claims: Claim[] } | { state: "unavailable" } | { state: "failed" }> {
  try {
    const { data, error } = await rpcOf(deps)("rec_claim_employer_notices", {
      _application_id: args.application,
      _limit: args.limit,
      _kinds: KINDS,
    });
    if (error) {
      if (isMissingNoticeObject(error)) return { state: "unavailable" };
      console.error("[employer-notice] claim failed", error.code ?? "unknown");
      return { state: "failed" };
    }
    return { state: "ok", claims: Array.isArray(data) ? (data as Claim[]) : [] };
  } catch (e) {
    console.error("[employer-notice] claim failed", e instanceof Error ? e.name : "unknown");
    return { state: "failed" };
  }
}

/** Claim and send the due notices of ONE application, inside a deadline.
 *  Whatever the deadline leaves is claimed or pending in the outbox, and the
 *  sweep sends it. Never throws. */
export async function dispatchEmployerNotices(
  applicationId: string,
  opts: { deadline: number },
  deps: EmployerNoticeDeps = {},
): Promise<DispatchSummary> {
  const summary = emptySummary();
  const claimed = await claimNotices({ application: applicationId, limit: 10 }, deps);
  if (claimed.state === "unavailable") return emptySummary(false);
  if (claimed.state === "failed") return summary;
  for (const claim of claimed.claims) {
    summary.claimed += 1;
    const remaining = opts.deadline - Date.now();
    // Out of time: this claim keeps its lease, expires, and goes to the sweep.
    if (remaining < 300) continue;
    tally(summary, await sendClaimedNotice(claim, Math.min(remaining, 3000), deps));
  }
  return summary;
}

// ── the apply request ─────────────────────────────────────────────────────

export type NotifyOutcome = {
  enqueue: EnqueueOutcome["state"] | "deadline";
  dispatch: DispatchSummary | null;
};

/**
 * Called by submitJobApplication once the application is committed (and again,
 * with `dispatch: false`, when a replay answers a retry). Never throws, and
 * never takes more than EMPLOYER_NOTICE_BUDGET_MS in total.
 *
 *   enqueue   always (set-once: a replay creates no second set)
 *   dispatch  by default: claim and send what is due, inside the same budget
 */
export async function notifyEmployerOfNewApplication(
  applicationId: string,
  opts: { dispatch?: boolean; budgetMs?: number } = {},
  deps: EmployerNoticeDeps = {},
): Promise<NotifyOutcome> {
  const budget = Math.max(
    0,
    Math.min(
      Number.isFinite(opts.budgetMs) ? Number(opts.budgetMs) : EMPLOYER_NOTICE_BUDGET_MS,
      EMPLOYER_NOTICE_BUDGET_MS,
    ),
  );
  const deadline = Date.now() + budget;
  const outcome: NotifyOutcome = { enqueue: "deadline", dispatch: null };

  const work = (async () => {
    const queued = await enqueueEmployerNotices(applicationId, deps);
    outcome.enqueue = queued.state;
    if (queued.state === "unavailable" || opts.dispatch === false) return;
    outcome.dispatch = await dispatchEmployerNotices(applicationId, { deadline }, deps);
  })().catch((e) => {
    console.error("[employer-notice] notify failed", e instanceof Error ? e.name : "unknown");
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budget);
  });
  try {
    await Promise.race([work, expired]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return outcome;
}

// ── retention ─────────────────────────────────────────────────────────────

/** Delete the notices that were settled more than 90 days ago (sent, skipped, and
 *  failed ones that will not be tried again -- never a pending, claimed or
 *  retryable one; the database decides, at most 1000 per call). Called by the
 *  sweep after its claim loop. Never throws; returns the number deleted.
 *
 *  A purged row can no longer stop enqueue from queueing its application again.
 *  That cannot send a second mail: enqueue is called when an application is
 *  CREATED (and when a replay of that same request arrives), and the database
 *  refuses any application older than an hour, while a purged row is at least a
 *  day old (the database refuses a shorter window). */
export async function purgeEmployerNotices(deps: EmployerNoticeDeps = {}): Promise<number> {
  try {
    const { data, error } = await rpcOf(deps)("rec_purge_employer_notices", {
      _older_than: EMPLOYER_NOTICE_RETENTION,
    });
    if (error) {
      if (!isMissingNoticeObject(error)) {
        console.error("[employer-notice] purge failed", error.code ?? "unknown");
      }
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (e) {
    console.error("[employer-notice] purge failed", e instanceof Error ? e.name : "unknown");
    return 0;
  }
}

// ── the sweep ─────────────────────────────────────────────────────────────

export type SweepSummary = DispatchSummary & {
  /** Settled notices deleted by the retention, after the claim loop. */
  purged: number;
};

/** The recovery: take what is due anywhere and send it, one attempt per row,
 *  then apply the retention. Claims in small batches so that no claim waits long
 *  for its send, stops at `limit` rows or after `budgetMs`, and never throws. The
 *  database bounds the attempts per row and never hands a row to two workers. */
export async function sweepEmployerNotices(
  opts: { limit?: number; budgetMs?: number } = {},
  deps: EmployerNoticeDeps = {},
): Promise<SweepSummary> {
  const summary: SweepSummary = { ...emptySummary(), purged: 0 };
  const limit = Math.max(1, Math.min(Math.floor(opts.limit ?? 20), 200));
  const deadline = Date.now() + (opts.budgetMs ?? 90_000);
  try {
    while (summary.claimed < limit && Date.now() < deadline) {
      const batch = Math.min(5, limit - summary.claimed);
      const claimed = await claimNotices({ application: null, limit: batch }, deps);
      if (claimed.state === "unavailable") return { ...emptySummary(false), purged: 0 };
      if (claimed.state === "failed") break;
      for (const claim of claimed.claims) {
        summary.claimed += 1;
        tally(summary, await sendClaimedNotice(claim, 10_000, deps));
      }
      // Nothing was handed over: nothing more is due. (Fewer than asked for is
      // not the end: rows the database skipped as no longer eligible count
      // against the batch.)
      if (claimed.claims.length === 0) break;
    }
  } catch (e) {
    console.error("[employer-notice] sweep failed", e instanceof Error ? e.name : "unknown");
  }
  summary.purged = await purgeEmployerNotices(deps);
  return summary;
}
