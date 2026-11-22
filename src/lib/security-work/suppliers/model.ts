/**
 * The supplier cycle's pure rules: what happens next on a request, how long
 * each party took, supplier follow-up figures and the work queue. Shared by
 * the server, the pages and the tests. Nothing here decides on its own: the
 * database enforces every transition (20270330090000); this explains them.
 *
 * Figures never pretend: a measure without its data is "missing", never zero
 * and never green.
 */
export type RequestStatus =
  | "draft"
  | "ready_to_send"
  | "awaiting_response"
  | "in_progress"
  | "awaiting_verification"
  | "needs_revision"
  | "accepted"
  | "withdrawn";
export type BasisKind = "information" | "contract_obligation" | "deviation" | "change_order";
export type ResponseKind = "acknowledged" | "plan" | "question" | "objection" | "done";
export type DecisionKind =
  | "investigate"
  | "remediate"
  | "defer"
  | "accept_risk"
  | "no_action"
  | "scope_cost"
  | "temporary_protection"
  | "close_with_deviation";
export const APPROVER_DECISIONS: readonly DecisionKind[] = [
  "accept_risk",
  "scope_cost",
  "close_with_deviation",
];

export interface RequestLike {
  id: string;
  status: string;
  requested_due: string;
  agreed_due: string | null;
  supplier_proposed_due: string | null;
  share_stale: boolean;
  share_version: number | null;
  cycle: number;
  internal_owner_id: string;
  created_by: string;
  requires_separate_verifier: boolean;
}
export interface EventLike {
  request_id: string;
  event: string;
  created_at: string;
  details: unknown;
  cycle: number;
}
export interface ResponseLike {
  id: string;
  request_id: string;
  kind: string;
  received_at: string;
  claimed_done_at: string | null;
  recorded_by: string;
  cycle: number;
  seq: number;
}
export interface VerificationLike {
  request_id: string;
  response_id: string;
  outcome: string;
  verified_at: string;
  cycle: number;
}

export const OPEN_STATUSES: readonly RequestStatus[] = [
  "draft",
  "ready_to_send",
  "awaiting_response",
  "in_progress",
  "awaiting_verification",
  "needs_revision",
];
export const isOpen = (status: string) => OPEN_STATUSES.includes(status as RequestStatus);

/** The date the supplier is held to: the agreed one if any, else the requested one. */
export const dueDate = (r: Pick<RequestLike, "agreed_due" | "requested_due">) =>
  r.agreed_due ?? r.requested_due;

/** Waiting on the supplier past the date it is held to. Verification wait is ours, not theirs. */
export function supplierOverdue(r: RequestLike, today: string): boolean {
  return (
    ["awaiting_response", "in_progress", "needs_revision"].includes(r.status) && dueDate(r) < today
  );
}

export type NextStep =
  | { step: "complete_draft"; who: "editor" }
  | { step: "approve_share"; who: "sharer" }
  | { step: "reapprove_share"; who: "sharer" }
  | { step: "record_dispatch"; who: "editor" }
  | { step: "await_supplier"; who: "supplier"; overdue: boolean }
  | { step: "verify"; who: "verifier"; separate: boolean }
  | { step: "await_revision"; who: "supplier"; overdue: boolean }
  | { step: "done"; who: null }
  | { step: "withdrawn"; who: null };

/** What the request needs now, and from whom. */
export function nextStep(r: RequestLike, today: string): NextStep {
  if (r.status === "accepted") return { step: "done", who: null };
  if (r.status === "withdrawn") return { step: "withdrawn", who: null };
  if (r.share_stale) return { step: "reapprove_share", who: "sharer" };
  if (r.status === "draft") return { step: "approve_share", who: "sharer" };
  if (r.status === "ready_to_send") return { step: "record_dispatch", who: "editor" };
  if (r.status === "awaiting_verification")
    return { step: "verify", who: "verifier", separate: r.requires_separate_verifier };
  if (r.status === "needs_revision")
    return { step: "await_revision", who: "supplier", overdue: supplierOverdue(r, today) };
  return { step: "await_supplier", who: "supplier", overdue: supplierOverdue(r, today) };
}

/** May this person verify the latest response of this request? */
export function mayVerify(
  r: RequestLike,
  latestDone: ResponseLike | null,
  person: { id: string; canApprove: boolean },
) {
  if (!person.canApprove || r.status !== "awaiting_verification" || !latestDone) return false;
  if (!r.requires_separate_verifier) return true;
  return (
    person.id !== r.internal_owner_id &&
    person.id !== r.created_by &&
    person.id !== latestDone.recorded_by
  );
}

const hours = (from: string, to: string) =>
  Math.round(((Date.parse(to) - Date.parse(from)) / 36e5) * 10) / 10;

export interface RequestTimes {
  /** Dispatch to the supplier's first reaction (supplier time). */
  firstResponseHours: number | null;
  /** Latest "done" received to its verification (our time), or still waiting. */
  verificationWaitHours: number | null;
  verificationPending: boolean;
  /** Did the supplier report done by the date it was held to? */
  doneOnTime: boolean | null;
  /** Accepted at the first verification of the first cycle. */
  acceptedFirstTime: boolean | null;
  revisions: number;
  reopenings: number;
}

/** Each party's time, measured separately; null when the data does not exist. */
export function requestTimes(
  r: RequestLike,
  events: readonly EventLike[],
  responses: readonly ResponseLike[],
  verifications: readonly VerificationLike[],
  now: string,
): RequestTimes {
  const mine = <T extends { request_id: string }>(rows: readonly T[]) =>
    rows.filter((row) => row.request_id === r.id);
  const ev = mine(events).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const resp = mine(responses).sort((a, b) => a.received_at.localeCompare(b.received_at));
  const ver = mine(verifications).sort((a, b) => a.verified_at.localeCompare(b.verified_at));
  const dispatch = ev.find((e) => e.event === "dispatched");
  // When it was sent (as recorded by the person), not when it was recorded.
  const sentAt = dispatch
    ? String((dispatch.details as { sentAt?: unknown } | null)?.sentAt ?? dispatch.created_at)
    : null;
  const first = sentAt
    ? resp.find((x) => Date.parse(x.received_at) >= Date.parse(sentAt))
    : undefined;
  const dones = resp.filter((x) => x.kind === "done");
  const lastDone = dones.at(-1) ?? null;
  const lastVerification = lastDone ? ver.find((v) => v.response_id === lastDone.id) : undefined;
  const firstDone = dones[0];
  const held = dueDate(r);
  const firstVerification = ver[0];
  return {
    firstResponseHours: sentAt && first ? hours(sentAt, first.received_at) : null,
    verificationWaitHours: lastDone
      ? hours(lastDone.received_at, lastVerification?.verified_at ?? now)
      : null,
    verificationPending: Boolean(lastDone && !lastVerification),
    doneOnTime: firstDone
      ? (firstDone.claimed_done_at ?? firstDone.received_at).slice(0, 10) <= held
      : null,
    acceptedFirstTime: firstVerification ? firstVerification.outcome === "accepted" : null,
    revisions: ver.filter((v) => v.outcome === "needs_revision").length,
    reopenings: ev.filter((e) => e.event === "reopened").length,
  };
}

export interface Ratio {
  numerator: number;
  denominator: number;
}
export interface SupplierFigures {
  period: { from: string; to: string };
  requests: number;
  /** null = the data for this measure is missing in the period. */
  respondedOnTime: Ratio | null;
  doneOnTime: Ratio | null;
  acceptedFirstTime: Ratio | null;
  revisions: number;
  reopenings: number;
  overdueNow: number;
  awaitingOurVerification: number;
  medianFirstResponseHours: number | null;
  medianVerificationWaitHours: number | null;
}

const ratio = (values: (boolean | null)[]): Ratio | null => {
  const known = values.filter((v): v is boolean => v !== null);
  return known.length
    ? { numerator: known.filter(Boolean).length, denominator: known.length }
    : null;
};
const median = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/**
 * Figures for the requests created in the period. "Responded on time" uses
 * the obligation's response days where the request names one; without that
 * rule it is missing, not assumed. Calendar days only: no business calendar
 * or contractual pause rule is applied, so nothing here is a breach.
 */
export function supplierFigures(
  requests: readonly (RequestLike & { created_at: string; responseDays: number | null })[],
  events: readonly EventLike[],
  responses: readonly ResponseLike[],
  verifications: readonly VerificationLike[],
  period: { from: string; to: string },
  now: string,
): SupplierFigures {
  const inPeriod = requests.filter(
    (r) => r.created_at.slice(0, 10) >= period.from && r.created_at.slice(0, 10) <= period.to,
  );
  const times = inPeriod.map((r) => ({
    r,
    t: requestTimes(r, events, responses, verifications, now),
  }));
  const today = now.slice(0, 10);
  return {
    period,
    requests: inPeriod.length,
    respondedOnTime: ratio(
      times.map(({ r, t }) =>
        r.responseDays === null || t.firstResponseHours === null
          ? null
          : t.firstResponseHours <= r.responseDays * 24,
      ),
    ),
    doneOnTime: ratio(times.map(({ t }) => t.doneOnTime)),
    acceptedFirstTime: ratio(times.map(({ t }) => t.acceptedFirstTime)),
    revisions: times.reduce((s, { t }) => s + t.revisions, 0),
    reopenings: times.reduce((s, { t }) => s + t.reopenings, 0),
    overdueNow: requests.filter((r) => supplierOverdue(r, today)).length,
    awaitingOurVerification: requests.filter((r) => r.status === "awaiting_verification").length,
    medianFirstResponseHours: median(times.map(({ t }) => t.firstResponseHours)),
    medianVerificationWaitHours: median(times.map(({ t }) => t.verificationWaitHours)),
  };
}

/** Which professional view an asset belongs to. Views filter; they never grant. */
export type RoleView = "all" | "security" | "cyber";
export function viewsOf(category: string | null | undefined): ("security" | "cyber")[] {
  if (category === "systems" || category === "information") return ["cyber"];
  if (["people", "facilities", "operations", "reputation"].includes(category ?? ""))
    return ["security"];
  return ["security", "cyber"];
}
export const inView = (view: RoleView, categories: readonly (string | null)[]) =>
  view === "all" ||
  categories.length === 0 ||
  categories.some((category) => viewsOf(category).includes(view));

export type QueueKind =
  | "needs_assessment"
  | "awaiting_decision"
  | "supplier_response_missing"
  | "needs_verification"
  | "overdue_action"
  | "coverage_gap";
/** The order of the overview queue, from the plan: assess, decide, chase, verify, overdue, gaps. */
export const QUEUE_ORDER: readonly QueueKind[] = [
  "needs_assessment",
  "awaiting_decision",
  "supplier_response_missing",
  "needs_verification",
  "overdue_action",
  "coverage_gap",
];
export interface QueueItem {
  kind: QueueKind;
  id: string;
  title: string;
  /** Path below /security-work/$workspaceId that opens the right step. */
  to: string;
  due: string | null;
  owner: string | null;
  categories: (string | null)[];
}
export function sortQueue(items: readonly QueueItem[]): QueueItem[] {
  return [...items].sort(
    (a, b) =>
      QUEUE_ORDER.indexOf(a.kind) - QUEUE_ORDER.indexOf(b.kind) ||
      (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
      a.title.localeCompare(b.title),
  );
}

export interface ShareContent {
  reference: string;
  title: string;
  task: string;
  expectedResult: string;
  responseInstruction: string;
  requestedDue: string;
  basisKind: BasisKind;
  contract: { title: string; version: number; clause: string } | null;
  supplier: string | null;
}

/** The approved external version, exactly as approved, as Markdown. */
export function shareToMarkdown(
  content: ShareContent,
  meta: { shareVersion: number; recipient: string; approvedAt: string },
  lang: "sv" | "en",
): string {
  const l = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const basis: Record<BasisKind, string> = {
    information: l("Informationsbegäran", "Request for information"),
    contract_obligation: l("Befintlig avtalsförpliktelse", "Existing contractual obligation"),
    deviation: l("Avvikelse mot specificerat krav", "Deviation from a specified requirement"),
    change_order: l("Beställning enligt separat beslut", "Order under a separate decision"),
  };
  const lines: (string | null)[] = [
    `# ${content.title}`,
    "",
    `${l("Referens", "Reference")}: ${content.reference}`,
    content.supplier ? `${l("Till", "To")}: ${content.supplier} (${meta.recipient})` : null,
    `${l("Grund", "Basis")}: ${basis[content.basisKind]}`,
    content.contract
      ? `${l("Avtal", "Contract")}: ${content.contract.title}, ${l("version", "version")} ${content.contract.version}, ${l("punkt", "clause")} ${content.contract.clause}`
      : null,
    `${l("Önskat svar senast", "Requested by")}: ${content.requestedDue}`,
    "",
    `## ${l("Uppgift", "Task")}`,
    content.task,
    "",
    `## ${l("Förväntat resultat", "Expected result")}`,
    content.expectedResult,
  ];
  if (content.responseInstruction)
    lines.push("", `## ${l("Så svarar ni", "How to respond")}`, content.responseInstruction);
  lines.push(
    "",
    "---",
    l(
      `Godkänd extern version ${meta.shareVersion}, ${meta.approvedAt.slice(0, 10)}. Ange referensen i ert svar.`,
      `Approved external version ${meta.shareVersion}, ${meta.approvedAt.slice(0, 10)}. Quote the reference in your reply.`,
    ),
  );
  return lines.filter((line): line is string => line !== null).join("\n") + "\n";
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * The external print document: a complete, standalone HTML page built ONLY
 * from the approved share version (the same fields as the Markdown export).
 * It is printed from its own frame, never from the request page, so nothing
 * internal on that page - decisions, criteria, history, impacts - can reach
 * the printout. No script, no external resource.
 */
export function shareToPrintHtml(
  content: ShareContent,
  meta: { shareVersion: number; recipient: string; approvedAt: string },
  lang: "sv" | "en",
): string {
  const markdown = shareToMarkdown(content, meta, lang);
  const lines = markdown.trimEnd().split("\n");
  const body = lines
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line === "---") return "<hr>";
      if (line === "") return "";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(content.reference)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.5rem}p{margin:.25rem 0;white-space:pre-wrap}hr{margin:2rem 0}</style>
</head><body data-print="supplier-share">
${body}
</body></html>
`;
}
