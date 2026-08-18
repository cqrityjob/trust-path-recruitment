// Security Passport — the CQrityjob verification queue.
//
// Nested under the existing `_authenticated/admin` layout, so the platform-
// admin gate that protects every other admin surface protects this one too.
// It is not the real authority: `sp_verifier_decide` re-checks the caller's
// capability in the database and refuses regardless of what this page lets
// somebody click. The layout gate is there so a non-verifier never sees a
// queue they cannot act on.
//
// ── WHAT A REVIEWER CAN AND CANNOT DO ──────────────────────────────────
//
// Can: read the entry, open its documents while the review is open, see
// earlier versions and earlier decisions, and record one decision with a
// method, a validity period, internal reasoning and a message to the
// holder.
//
// Cannot: edit the holder's entry, edit their identity, set a trust level
// directly, or change a decision already made. There is no control for any
// of those, and the database refuses each one independently. A wrong
// decision is corrected with a NEW decision, which is why the confirmation
// step says the record is permanent.
//
// ── TWO NOTE FIELDS, DELIBERATELY ──────────────────────────────────────
//
// `decision_note` is internal reasoning and never leaves the review — not
// to the holder, not into a disclosure payload, not onto a card. The holder
// reads `holder_message`. One field would have meant choosing between
// reviewers writing nothing candid and holders reading something they were
// never meant to see.

import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Inbox, ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  decideVerification,
  getVerifierRequestDetail,
  listVerifierQueue,
  passportVerifierWhoAmI,
  type VerifierQueueItem,
  type VerifierRequestDetail,
} from "@/lib/security-passport/verification.functions";
import { getEvidenceViewUrl } from "@/lib/security-passport/evidence.functions";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";

export const Route = createFileRoute("/_authenticated/admin/passport-verification")({
  ssr: false,
  component: PassportVerificationQueueRoute,
});

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

/** The page, inside the shared admin chrome. Split from the queue body so
 *  every state — loading, not-a-verifier, error, empty and populated — is
 *  rendered in the same navigation, rather than a bare centred message on a
 *  blank page for the states that are not the happy path. */
function PassportVerificationQueueRoute() {
  return (
    <SiteLayout>
      <AdminShellChrome activeSection="passportVerification">
        <PassportVerificationQueue />
      </AdminShellChrome>
    </SiteLayout>
  );
}

function PassportVerificationQueue() {
  const { pt } = usePassportCopy();

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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [decision, setDecision] = useState<Decision>("approved");
  const [method, setMethod] = useState<string>("document_review");
  const [decisionNote, setDecisionNote] = useState("");
  const [holderMessage, setHolderMessage] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const refresh = useCallback(async () => {
    try {
      const rows = await loadQueue({ data: { status: filter } });
      setQueue(rows);
    } catch (err) {
      console.error("[passport] verifier queue failed", err);
      setError(pt("common.error"));
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
      return;
    }
    void loadDetail({ data: { requestId: selected } })
      .then(setDetail)
      .catch((err: unknown) => {
        console.error("[passport] verifier detail failed", err);
        setError(pt("common.error"));
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
      setError(pt("vq.methodRequired"));
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
    setError(null);
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
      console.error("[passport] decision failed", err);
      setError(pt("common.error"));
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
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
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
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {pt("vq.submittedAt")} {item.submittedAt.slice(0, 10)} · {pt("vq.evidence")}:{" "}
                    {item.evidenceCount}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                  {pt(STATUS_KEY[item.status] ?? "ver.status.pending")}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelected(selected === item.id ? null : item.id)}
                aria-expanded={selected === item.id}
                className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("vq.open")}
              </button>

              {selected === item.id ? (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {/* Documents — reachable only while this review is open. */}
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
                                void viewEvidence({ data: { evidenceId: ev.id } })
                                  .then(({ url }) =>
                                    window.open(url, "_blank", "noopener,noreferrer"),
                                  )
                                  .catch(() => setError(pt("common.error")));
                              }}
                              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {pt("ev.view")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">{pt("vq.accessNote")}</p>
                  </div>

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
                            {d.decidedAt.slice(0, 10)} · {d.decision} · {d.organisation ?? ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* ── The decision ─────────────────────────────────── */}
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

                    <div>
                      <label
                        htmlFor="sp-holder-message"
                        className="block text-sm font-medium text-foreground"
                      >
                        {pt("vq.messageHolder")}
                      </label>
                      <textarea
                        id="sp-holder-message"
                        rows={3}
                        value={holderMessage}
                        aria-describedby="sp-holder-help"
                        onChange={(e) => setHolderMessage(e.target.value)}
                        className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      <p id="sp-holder-help" className="mt-1 text-xs text-muted-foreground">
                        {pt("vq.messageHolderHelp")}
                      </p>
                    </div>

                    <p className="text-xs text-muted-foreground">{pt("vq.immutableNote")}</p>

                    <button
                      type="button"
                      onClick={() => void submitDecision()}
                      disabled={busy}
                      className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {busy ? pt("vq.deciding") : pt("vq.confirmYes")}
                    </button>
                  </fieldset>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
