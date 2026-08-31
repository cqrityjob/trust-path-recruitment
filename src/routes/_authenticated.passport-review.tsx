// Security Passport -- the review workspace, reachable WITHOUT being an admin.
//
// This route exists because of a least-privilege defect, not because the
// queue needed a second home. `sp_is_verifier` used to be defined as,
// literally, `is_platform_admin`, and the only page rendering the queue was
// nested under `_authenticated/admin` -- so the sole way to let somebody
// review a guard licence was to make them a platform admin, which also hands
// them user administration, employer administration and account deletion.
//
// Migration 20261016090000 separated the capability. This route is the other
// half: a reviewer holding `passport_verifier` and nothing else can reach the
// queue here, in a workspace that shows only Passport review.
//
// ── THE GATE HERE IS NOT THE AUTHORITY ─────────────────────────────────
//
// `passportVerifierWhoAmI()` asks the database (`sp_is_verifier`) rather than
// inferring anything client-side, but it only decides what to RENDER. Every
// action on the page re-checks capability in the database: sp_verifier_queue,
// sp_verifier_request_detail, sp_verifier_decide and sp_verifier_revoke each
// refuse a non-verifier independently, so a candidate who calls them directly
// is refused whether or not this page ever drew them a link.
//
// ── NO ADMIN CHROME ────────────────────────────────────────────────────
//
// Deliberately not wrapped in AdminShellChrome: that renders navigation to
// employers, jobs, applications, assessments and audit, all of which refuse a
// reviewer. Showing a reviewer a shelf of tools they are not allowed to open
// would be a worse experience than not showing it, and would misrepresent
// what the role is. Platform admins keep the full admin chrome on their own
// route, which renders this same workspace.

import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileText, Inbox, ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatWorkLocation } from "@/lib/security-passport/format";
import {
  decideVerification,
  getVerifierRequestDetail,
  listDisputeQueue,
  listVerifierQueue,
  passportVerifierWhoAmI,
  resolveDispute,
  type DisputeQueueItem,
  type VerifierQueueItem,
  type VerifierRequestDetail,
} from "@/lib/security-passport/verification.functions";
import { getEvidenceViewUrl } from "@/lib/security-passport/evidence.functions";
import { SiteLayout } from "@/components/site/SiteLayout";
import {
  CLAIM_TYPE_KEY,
  codeLabel,
  ReviewClaimFacts,
  ReviewPeriodFacts,
} from "@/components/security-passport/live/ReviewSubjectFacts";
import {
  decisionErrorCodeFrom,
  type DecisionErrorCode,
} from "@/lib/security-passport/decision-errors";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export const Route = createFileRoute("/_authenticated/passport-review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Passport Review — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PassportReviewRoute,
});

function PassportReviewRoute() {
  const { pt } = usePassportCopy();
  const whoAmI = useServerFn(passportVerifierWhoAmI);
  const q = useQuery({
    queryKey: ["passport", "verifier", "whoami"],
    queryFn: () => whoAmI(),
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
        </div>
      </SiteLayout>
    );
  }

  // A signed-in non-reviewer is told plainly, and told nothing about the
  // queue itself -- not how many entries wait, not whose they are.
  if (q.isError || !q.data?.isVerifier) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground">{pt("vq.denied.heading")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{pt("vq.denied.body")}</p>
          <div className="mt-6">
            <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
              {pt("vq.denied.back")}
            </Link>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="border-b border-border bg-secondary/30">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-4">
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-accent" />
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {pt("vq.workspace.title")}
          </h1>
        </div>
      </div>
      <PassportReviewWorkspace />
    </SiteLayout>
  );
}

/** One line of copy per refusal the database can give. Kept as a total map so
 *  adding a code without adding its sentence fails the type check rather than
 *  silently falling back to "try again". */
const DECLINE_KEY: Record<DecisionErrorCode, PassportCopyKey> = {
  self_verification: "vq.decline.self_verification",
  not_authorised: "vq.decline.not_authorised",
  already_decided: "vq.decline.already_decided",
  not_found: "vq.decline.not_found",
  method_required: "vq.decline.method_required",
  holder_message_required: "vq.decline.holder_message_required",
  invalid_validity: "vq.decline.invalid_validity",
  issuer_required: "vq.decline.issuer_required",
  entry_not_active: "vq.decline.entry_not_active",
  unknown: "vq.decline.unknown",
};

const FILTERS: readonly { value: string | null; labelKey: PassportCopyKey }[] = [
  { value: null, labelKey: "vq.filter.open" },
  { value: "pending", labelKey: "vq.filter.pending" },
  { value: "clarification_requested", labelKey: "vq.filter.clarification" },
  { value: "approved", labelKey: "vq.filter.approved" },
  { value: "rejected", labelKey: "vq.filter.rejected" },
];

const STATUS_KEY: Readonly<Record<string, PassportCopyKey>> = {
  pending: "ver.status.pending",
  approved: "ver.status.approved",
  rejected: "ver.status.rejected",
  clarification_requested: "ver.status.clarification_requested",
  withdrawn: "ver.status.withdrawn",
};

type Decision = "approved" | "rejected" | "clarification_requested";

export function PassportReviewWorkspace() {
  const { pt, lang } = usePassportCopy();

  const whoAmI = useServerFn(passportVerifierWhoAmI);
  const loadQueue = useServerFn(listVerifierQueue);
  const loadDetail = useServerFn(getVerifierRequestDetail);
  const decide = useServerFn(decideVerification);
  const viewEvidence = useServerFn(getEvidenceViewUrl);

  const [isVerifier, setIsVerifier] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [queue, setQueue] = useState<readonly VerifierQueueItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerifierRequestDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── ONE ERROR PER OPERATION, NOT ONE PER PAGE ────────────────────────
  //
  // These were a single `error` string written by four unrelated
  // operations — loading the queue, opening a review, opening a document
  // and saving a decision — and rendered once, above the filter. Any one
  // of them failing therefore painted a page-wide red banner over a queue
  // that was working perfectly, and because nothing ever cleared it on
  // success, it stayed until a hard reload. That is the state the
  // production report photographed: a complete, usable queue underneath a
  // generic "something went wrong".
  //
  // Each operation now owns its own message, renders it where the failure
  // happened, and clears it when it next succeeds.
  const [queueError, setQueueError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<{ id: string; message: string } | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [decision, setDecision] = useState<Decision>("approved");
  const [method, setMethod] = useState<string>("document_review");
  const [decisionNote, setDecisionNote] = useState("");
  const [holderMessage, setHolderMessage] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  /** Rejection and clarification are the two outcomes the holder has to act
   *  on, so both must carry a candidate-facing reason. Approval does not:
   *  what an approval owes the holder is the METHOD, which is required
   *  separately and rendered as attribution. */
  const holderMessageRequired = decision === "rejected" || decision === "clarification_requested";

  const refresh = useCallback(async () => {
    try {
      const rows = await loadQueue({ data: { status: filter } });
      setQueue(rows);
      // Cleared on success: a stale banner from an earlier transient
      // failure must not outlive the request that fixed it.
      setQueueError(null);
    } catch (err) {
      console.error("[passport] verifier queue failed", err);
      setQueueError(pt("vq.error.queue"));
    }
  }, [loadQueue, filter, pt]);

  useEffect(() => {
    void whoAmI({ data: undefined })
      .then((r) => setIsVerifier(r.isVerifier))
      .catch(() => setIsVerifier(false));
  }, [whoAmI]);

  useEffect(() => {
    if (isVerifier) void refresh();
  }, [isVerifier, refresh]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setDetailError(null);
    void loadDetail({ data: { requestId: selected } })
      .then((d) => {
        setDetail(d);
        setDetailError(null);
      })
      .catch((err: unknown) => {
        console.error("[passport] verifier detail failed", err);
        setDetail(null);
        setDetailError(pt("vq.error.detail"));
      });
  }, [selected, loadDetail, pt]);

  if (isVerifier === null) {
    return <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>;
  }

  if (!isVerifier) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-sm text-muted-foreground">{pt("vq.notVerifier")}</p>
      </div>
    );
  }

  async function submitDecision() {
    if (!selected) return;
    if (decision === "approved" && !method) {
      setDecisionError(pt(DECLINE_KEY.method_required));
      return;
    }
    // A refusal without a reason is not a decision the holder can act on.
    // Checked here for an immediate answer, in the server function, and in
    // `sp_verifier_decide` — which is the one that actually enforces it. A
    // disabled button is not a control.
    if (
      (decision === "rejected" || decision === "clarification_requested") &&
      holderMessage.trim() === ""
    ) {
      setDecisionError(pt(DECLINE_KEY.holder_message_required));
      return;
    }

    const confirmKey: PassportCopyKey =
      decision === "approved"
        ? "vq.confirmApprove"
        : decision === "rejected"
          ? "vq.confirmReject"
          : "vq.confirmClarify";
    if (!window.confirm(`${pt("vq.confirmTitle")}\n\n${pt(confirmKey)}`)) return;

    setBusy(true);
    setDecisionError(null);
    try {
      await decide({
        data: {
          requestId: selected,
          decision,
          method: decision === "approved" ? (method as never) : null,
          decisionNote: decisionNote.trim() || null,
          holderMessage: holderMessage.trim() || null,
          validFrom: validFrom || null,
          validUntil: validUntil || null,
        },
      });
      setNotice(pt("vq.decided"));
      setSelected(null);
      setDecisionNote("");
      setHolderMessage("");
      setValidFrom("");
      setValidUntil("");
      await refresh();
    } catch (err) {
      // Deliberately does NOT reset the form: the verifier has just typed a
      // decision note and a holder message, and throwing that away on a
      // transient failure would be worse than the failure.
      console.error("[passport] decision failed", err);
      setDecisionError(pt(DECLINE_KEY[decisionErrorCodeFrom(err)]));
    } finally {
      setBusy(false);
    }
  }

  const evidence = detail?.evidence ?? [];
  const priorDecisions = detail?.priorDecisions ?? [];
  const previousVersions = detail?.previousVersions ?? [];

  return (
    <div>
      <header>
        <h1
          className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          {pt("vq.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {pt("vq.lead")}
        </p>
      </header>

      {notice ? (
        <p role="status" className="mt-4 text-sm font-medium text-foreground">
          {notice}
        </p>
      ) : null}
      {queueError ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{queueError}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("vq.retry")}
          </button>
        </div>
      ) : null}

      <div className="mt-6">
        <label htmlFor="sp-vq-filter" className="block text-sm font-medium text-foreground">
          {pt("vq.filter")}
        </label>
        <select
          id="sp-vq-filter"
          value={filter ?? ""}
          onChange={(e) => {
            setFilter(e.target.value === "" ? null : e.target.value);
            setSelected(null);
          }}
          className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-72"
        >
          {FILTERS.map((f) => (
            <option key={String(f.value)} value={f.value ?? ""}>
              {pt(f.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {queue.length === 0 ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Inbox aria-hidden="true" className="h-4 w-4" />
          {pt("vq.empty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {queue.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-base font-semibold tracking-tight text-foreground">
                    {item.title ?? "—"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {pt("vq.holder")}: {item.holderName || "—"}
                    {item.issuer ? ` · ${item.issuer}` : ""}
                    {item.employer ? ` · ${item.employer}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      // Which market a case belongs to is often the whole
                      // question, and the queue printed nothing about it --
                      // through the canonical formatter, never the raw code.
                      item.jurisdiction ? formatWorkLocation(item.jurisdiction, null, lang) : null,
                      codeLabel(item.claimType, CLAIM_TYPE_KEY, pt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {pt("vq.submittedAt")} {item.submittedAt.slice(0, 10)} · {pt("vq.evidence")}:{" "}
                    {item.evidenceCount}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {item.isSelf ? (
                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-foreground">
                      {pt("vq.selfBadge")}
                    </span>
                  ) : null}
                  <span className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                    {pt(STATUS_KEY[item.status] ?? "ver.status.pending")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelected(selected === item.id ? null : item.id)}
                aria-expanded={selected === item.id}
                className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("vq.open")}
              </button>

              {selected === item.id && detailError ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p role="alert" className="text-sm text-destructive">
                    {detailError}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      // Re-trigger the detail effect for this same review.
                      setSelected(null);
                      window.setTimeout(() => setSelected(item.id), 0);
                    }}
                    className="mt-2 inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {pt("vq.retry")}
                  </button>
                </div>
              ) : null}

              {selected === item.id && !detailError ? (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {/* 1. THE CLAIM — what the candidate states, in their own
                      words, before any document is opened. The reviewer's eye
                      then runs claim -> evidence -> history -> decision down
                      one column, which is the comparison they are making. */}
                  {detail?.claim ? (
                    <ReviewClaimFacts
                      holderName={detail.holderName}
                      claim={detail.claim}
                      headingId={`sp-claim-${item.id}`}
                    />
                  ) : null}
                  {detail?.period ? (
                    <ReviewPeriodFacts
                      holderName={detail.holderName}
                      period={detail.period}
                      headingId={`sp-period-${item.id}`}
                    />
                  ) : null}

                  {/* 2. THE EVIDENCE — reachable only while this review is open. */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {pt("vq.evidence")}
                    </p>
                    {evidence.length === 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">{pt("vq.noEvidence")}</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {evidence.map((ev) => (
                          <li key={ev.id} className="flex flex-wrap items-center gap-3">
                            <FileText
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                            />
                            <span className="min-w-0 flex-1 break-all text-sm text-foreground">
                              {ev.fileName}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEvidenceError(null);
                                void viewEvidence({ data: { evidenceId: ev.id } })
                                  .then(({ url }) =>
                                    window.open(url, "_blank", "noopener,noreferrer"),
                                  )
                                  .catch((err: unknown) => {
                                    // Scoped to this row. A document that
                                    // cannot be opened says nothing about
                                    // the queue around it.
                                    console.error("[passport] evidence url failed", err);
                                    setEvidenceError({
                                      id: ev.id,
                                      message: pt("vq.error.evidence"),
                                    });
                                  });
                              }}
                              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {pt("ev.view")}
                            </button>
                            {evidenceError?.id === ev.id ? (
                              <p role="alert" className="w-full text-sm text-destructive">
                                {evidenceError.message}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* A document is what the claim is JUDGED AGAINST. It is
                        not itself a verification, and a reviewer who reads the
                        file list as the verification has skipped the only step
                        that matters. */}
                    <p className="mt-2 text-xs text-muted-foreground">{pt("vq.evidenceNote")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{pt("vq.accessNote")}</p>
                  </div>

                  {/* 3. PRIOR HISTORY.
                      Silence here used to be ambiguous: a first submission and
                      a claim rejected twice already rendered identically,
                      because both simply showed nothing. "First submission"
                      is a fact the reviewer needs stated, not inferred from an
                      absence. */}
                  {previousVersions.length === 0 && priorDecisions.length === 0 ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("vq.historyHeading")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {pt("vq.firstSubmission")}
                      </p>
                    </div>
                  ) : null}

                  {previousVersions.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("vq.previousVersions")}
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                        {previousVersions.map((v) => (
                          <li key={v.id}>
                            v{v.versionNo} · {v.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {priorDecisions.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("vq.priorDecisions")}
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                        {priorDecisions.map((d, i) => (
                          <li key={`${d.decidedAt}-${i}`} className="tabular-nums">
                            {[
                              d.decidedAt.slice(0, 10),
                              pt(STATUS_KEY[d.decision] ?? "ver.status.pending"),
                              d.organisation,
                              // How an earlier decision was reached changes
                              // what it is worth as precedent. A prior
                              // employer confirmation and a prior document
                              // review are not the same signal.
                              d.method ? pt(`ver.method.${d.method}` as PassportCopyKey) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* ── The decision ─────────────────────────────────── */}
                  {/* A reviewer may read their own submission — the evidence
                      and history above are theirs already. What they may not
                      do is decide it, so the form is not rendered at all
                      rather than rendered and rejected on submit. */}
                  {item.isSelf ? (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("vq.decision")}
                      </p>
                      <p role="note" className="mt-2 text-sm text-foreground">
                        {pt("vq.selfNotice")}
                      </p>
                    </div>
                  ) : (
                    <fieldset className="space-y-3">
                      <legend className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("vq.decision")}
                      </legend>

                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["approved", "vq.approve"],
                            ["rejected", "vq.reject"],
                            ["clarification_requested", "vq.requestClarification"],
                          ] as const
                        ).map(([value, labelKey]) => (
                          <label
                            key={value}
                            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground"
                          >
                            <input
                              type="radio"
                              name="sp-decision"
                              value={value}
                              checked={decision === value}
                              onChange={() => setDecision(value)}
                              className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            />
                            {pt(labelKey)}
                          </label>
                        ))}
                      </div>

                      {decision === "approved" ? (
                        <>
                          <div>
                            <label
                              htmlFor="sp-method"
                              className="block text-sm font-medium text-foreground"
                            >
                              {pt("vq.methodLabel")}
                            </label>
                            <select
                              id="sp-method"
                              value={method}
                              onChange={(e) => setMethod(e.target.value)}
                              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-72"
                            >
                              <option value="document_review">
                                {pt("ver.method.document_review")}
                              </option>
                              <option value="issuer_confirmation">
                                {pt("ver.method.issuer_confirmation")}
                              </option>
                              <option value="employer_confirmation">
                                {pt("ver.method.employer_confirmation")}
                              </option>
                            </select>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor="sp-valid-from"
                                className="block text-sm font-medium text-foreground"
                              >
                                {pt("vq.validFrom")}
                              </label>
                              <input
                                id="sp-valid-from"
                                type="date"
                                value={validFrom}
                                onChange={(e) => setValidFrom(e.target.value)}
                                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="sp-valid-until"
                                className="block text-sm font-medium text-foreground"
                              >
                                {pt("vq.validUntil")}
                              </label>
                              <input
                                id="sp-valid-until"
                                type="date"
                                value={validUntil}
                                onChange={(e) => setValidUntil(e.target.value)}
                                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              />
                            </div>
                          </div>
                        </>
                      ) : null}

                      <div>
                        <label
                          htmlFor="sp-internal"
                          className="block text-sm font-medium text-foreground"
                        >
                          {pt("vq.noteInternal")}
                        </label>
                        <textarea
                          id="sp-internal"
                          rows={3}
                          value={decisionNote}
                          aria-describedby="sp-internal-help"
                          onChange={(e) => setDecisionNote(e.target.value)}
                          className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />
                        <p id="sp-internal-help" className="mt-1 text-xs text-muted-foreground">
                          {pt("vq.noteInternalHelp")}
                        </p>
                      </div>

                      {/* The candidate-facing reason. Mandatory for a
                          rejection and for a clarification, because those are
                          the two outcomes the holder has to do something
                          about. Said in the label rather than only enforced on
                          submit, and marked with aria-required so the
                          obligation reaches a screen reader before the
                          refusal does. */}
                      <div>
                        <label
                          htmlFor="sp-holder-message"
                          className="block text-sm font-medium text-foreground"
                        >
                          {pt("vq.messageHolder")}
                          {holderMessageRequired ? (
                            <span className="ml-1 text-destructive">
                              {pt("vq.messageHolderRequiredMark")}
                            </span>
                          ) : null}
                        </label>
                        <textarea
                          id="sp-holder-message"
                          rows={3}
                          value={holderMessage}
                          required={holderMessageRequired}
                          aria-required={holderMessageRequired}
                          aria-describedby="sp-holder-help"
                          onChange={(e) => setHolderMessage(e.target.value)}
                          className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />
                        <p id="sp-holder-help" className="mt-1 text-xs text-muted-foreground">
                          {holderMessageRequired
                            ? pt("vq.messageHolderRequiredHelp")
                            : pt("vq.messageHolderHelp")}
                        </p>
                      </div>

                      <p className="text-xs text-muted-foreground">{pt("vq.immutableNote")}</p>

                      {decisionError ? (
                        <p role="alert" className="text-sm text-destructive">
                          {decisionError}
                        </p>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void submitDecision()}
                        disabled={busy}
                        className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {busy ? pt("vq.deciding") : pt("vq.confirmYes")}
                      </button>
                    </fieldset>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <DisputeQueue />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   THE DISPUTE QUEUE
   ══════════════════════════════════════════════════════════════════════

   The defect: a holder pressed "Anmäl att uppgiften är fel", the entry became
   Bestridd, and it appeared nowhere. `sp_raise_dispute` writes a lifecycle
   state and an audit event; `sp_verifier_queue` reads verification REQUESTS,
   of which a dispute creates none. The pilot tester went looking in admin for
   what they had just reported and was right that it was not there.

   It lives on this page rather than behind a route of its own because this is
   already the Passport reviewer's destination, it is already inside the
   platform-admin layout gate, and a dispute queue nobody can find is the
   defect being fixed, not a smaller version of it.

   ── WHAT A REVIEWER CAN DO HERE ─────────────────────────────────────────

   Exactly two things, both decisions by a person: restore the entry, or take
   it out of the holder's active Passport. Neither touches assertion_level — a
   dispute is not a route to verification, and `sp_resolve_dispute` has no
   parameter that could make it one. Nothing is resolved automatically.

   Own state, own error, own refresh: the verification queue above must not go
   red because a dispute failed to load, which is the exact failure mode this
   page was already repaired for once.
   ══════════════════════════════════════════════════════════════════════ */
function DisputeQueue() {
  const { pt, lang } = usePassportCopy();
  const loadDisputes = useServerFn(listDisputeQueue);
  const resolve = useServerFn(resolveDispute);

  const [rows, setRows] = useState<readonly DisputeQueueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Named for the operation, not for the page. The verification queue above
  // owns four separate error states for the same reason: one shared string is
  // how a working queue came to sit under a red banner about something else.
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Readonly<Record<string, string>>>({});

  const refresh = useCallback(async () => {
    try {
      setRows(await loadDisputes({ data: undefined }));
      setDisputeError(null);
    } catch (err) {
      console.error("[passport] dispute queue failed", err);
      setDisputeError(pt("vq.error.queue"));
    } finally {
      setLoaded(true);
    }
  }, [loadDisputes, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(item: DisputeQueueItem, outcome: "restored" | "withdrawn") {
    setBusy(item.subjectId);
    setDisputeError(null);
    setNotice(null);
    try {
      await resolve({
        data: {
          claimId: item.subjectType === "claim" ? item.subjectId : null,
          periodId: item.subjectType === "experience" ? item.subjectId : null,
          outcome,
          note: notes[item.subjectId] ?? "",
        },
      });
      setNotice(pt("vq.dispute.resolved"));
      await refresh();
    } catch (err) {
      console.error("[passport] dispute resolution failed", err);
      setDisputeError(pt("vq.error.queue"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-10 border-t border-border pt-8">
      <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
        <AlertTriangle aria-hidden="true" className="h-5 w-5" />
        {pt("vq.dispute.title")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {pt("vq.dispute.lead")}
      </p>

      {notice ? (
        <p role="status" className="mt-4 text-sm font-medium text-foreground">
          {notice}
        </p>
      ) : null}
      {disputeError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {disputeError}
        </p>
      ) : null}

      {!loaded ? (
        <p className="mt-4 text-sm text-muted-foreground">{pt("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{pt("vq.dispute.empty")}</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((item) => (
            <li key={item.subjectId} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium text-foreground">
                {item.title ?? item.credentialCode ?? item.skillCode ?? item.subjectId}
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="flex gap-1">
                  <dt>{pt("vq.dispute.holder")}:</dt>
                  <dd className="text-foreground">{item.holderName || "—"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>{pt("vq.dispute.reported")}:</dt>
                  <dd className="tabular-nums text-foreground">
                    {item.disputedAt ? item.disputedAt.slice(0, 10) : "—"}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>{pt("claim.trustState")}:</dt>
                  <dd className="text-foreground">
                    {item.assertion ?? "—"} · {item.lifecycle ?? "—"}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>{pt("cred.field.credentialCountry")}:</dt>
                  <dd className="text-foreground">
                    {formatWorkLocation(item.jurisdiction, item.subJurisdiction, lang)}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pt("vq.dispute.reason")}
              </p>
              <p className="mt-0.5 max-w-[70ch] text-sm leading-relaxed text-foreground">
                {item.reason && item.reason.trim() !== "" ? item.reason : pt("vq.dispute.noReason")}
              </p>

              <p className="mt-2 text-xs text-muted-foreground">
                {item.evidenceCount} {pt("vq.dispute.evidence")}
              </p>

              {/* Same bar as sp_verifier_decide, and answered by the database
                  from auth.uid() rather than inferred here: nobody rules on
                  their own dispute. */}
              {item.isSelf ? (
                <p className="mt-3 text-sm text-muted-foreground">{pt("vq.dispute.self")}</p>
              ) : (
                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor={`sp-dispute-note-${item.subjectId}`}
                      className="block text-sm font-medium text-foreground"
                    >
                      {pt("vq.dispute.note")}
                    </label>
                    <textarea
                      id={`sp-dispute-note-${item.subjectId}`}
                      rows={2}
                      maxLength={300}
                      value={notes[item.subjectId] ?? ""}
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [item.subjectId]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void decide(item, "restored")}
                      className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {busy === item.subjectId
                        ? pt("vq.dispute.resolving")
                        : pt("vq.dispute.restore")}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void decide(item, "withdrawn")}
                      className="inline-flex h-11 items-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pt("vq.dispute.withdraw")}
                    </button>
                  </div>

                  <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                    {pt("vq.dispute.restoreHelp")}
                  </p>
                  <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                    {pt("vq.dispute.withdrawHelp")}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
