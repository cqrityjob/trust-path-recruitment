// Security Passport — the holder's verification panel.
//
// Everything the holder can legitimately do about verification lives here:
// ask for it, watch it, answer a clarification, withdraw the question, read
// the decision with its attribution, renew a lapsed one, and dispute an
// entry that is wrong.
//
// ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────
//
// Any control that decides. There is no approve button behind a role check,
// no "mark as verified", no optimistic state. The holder's side of this
// product is a request, and a request is all this component can express —
// which is the same guarantee the database makes, said in the interface so
// a holder can see it rather than take it on trust.
//
// ── ATTRIBUTION IS SHOWN IN FULL OR NOT AT ALL ─────────────────────────
//
// "Verified" on its own is an unfalsifiable claim. Where this panel says
// verified it also says by whom, by what method, when, and until when. If
// the payload lacked any of those the word would be wrong, so the block
// renders from the decision record rather than from the claim's level.

import { useState } from "react";
import { AlertTriangle, BadgeCheck, Clock, MessageSquare, RotateCw } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { formatDate } from "@/lib/security-passport/format";
import type { Validity } from "@/lib/security-passport/validity";
import { mayRenew } from "@/lib/security-passport/validity";
import type {
  MyVerificationRequest,
  VerificationDecisionRecord,
} from "@/lib/security-passport/verification.functions";

export interface EmployerOption {
  readonly id: string;
  readonly name: string;
}

export interface VerificationPanelProps {
  readonly assertionLevel: string;
  readonly validity: Validity;
  /** The open request for this entry, if any. */
  readonly openRequest: MyVerificationRequest | null;
  /** Every request ever made about this entry, newest first. */
  readonly requests: readonly MyVerificationRequest[];
  readonly decisions: readonly VerificationDecisionRecord[];
  readonly hasEvidence: boolean;
  /** Employment entries can be attested by an employer; a qualification
   *  cannot, so the option is absent rather than disabled. */
  readonly canAskEmployer: boolean;
  readonly employers: readonly EmployerOption[];
  readonly onSubmit: (
    kind: "cqrityjob_review" | "employer_attestation",
    employerId: string | null,
  ) => Promise<void>;
  readonly onWithdrawRequest: (requestId: string) => Promise<void>;
  readonly onDispute: (reason: string) => Promise<void>;
}

const STATUS_KEY: Readonly<Record<string, PassportCopyKey>> = {
  pending: "ver.status.pending",
  approved: "ver.status.approved",
  rejected: "ver.status.rejected",
  clarification_requested: "ver.status.clarification_requested",
  withdrawn: "ver.status.withdrawn",
};

const METHOD_KEY: Readonly<Record<string, PassportCopyKey>> = {
  document_review: "ver.method.document_review",
  employer_confirmation: "ver.method.employer_confirmation",
  issuer_confirmation: "ver.method.issuer_confirmation",
};

export function VerificationPanel({
  assertionLevel,
  validity,
  openRequest,
  requests,
  decisions,
  hasEvidence,
  canAskEmployer,
  employers,
  onSubmit,
  onWithdrawRequest,
  onDispute,
}: VerificationPanelProps) {
  const { pt, lang } = usePassportCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employerId, setEmployerId] = useState<string>(employers[0]?.id ?? "");
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const latestApproval = decisions.find((d) => d.decision === "approved") ?? null;
  const latestRevocation = decisions.find((d) => d.decision === "revoked") ?? null;
  const renewable = mayRenew(assertionLevel, validity);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error("[passport] verification action failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <BadgeCheck aria-hidden="true" className="h-4 w-4" />
        {pt("ver.title")}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt("ver.lead")}</p>

      {/* ── The decision, when there is one ─────────────────────────── */}
      {latestApproval ? (
        <dl className="mt-4 grid gap-3 rounded-lg border border-border bg-secondary/40 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("ver.decidedBy")}
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {latestApproval.organisation ?? pt("common.notStated")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("ver.method")}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {latestApproval.method
                ? pt(METHOD_KEY[latestApproval.method] ?? "common.notStated")
                : pt("common.notStated")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("ver.decidedAt")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">
              {latestApproval.decidedAt.slice(0, 10)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("ver.validUntil")}
            </dt>
            <dd className="mt-0.5 text-sm tabular-nums text-foreground">
              {formatDate(latestApproval.validUntil, lang)}
            </dd>
          </div>
        </dl>
      ) : null}

      {latestRevocation ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {pt("ver.revokedNotice")}
        </p>
      ) : null}

      {validity.hasExpired ? (
        <p className="mt-3 text-sm font-medium text-foreground">{pt("ver.expiredNotice")}</p>
      ) : validity.expiresSoon ? (
        <p className="mt-3 text-sm font-medium text-foreground">{pt("ver.expiringSoon")}</p>
      ) : null}

      {/* ── The open request ─────────────────────────────────────────── */}
      {openRequest ? (
        <div className="mt-4 rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock aria-hidden="true" className="h-4 w-4" />
            {pt(STATUS_KEY[openRequest.status] ?? "ver.status.pending")}
          </p>

          {openRequest.holderMessage ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pt("ver.messageToYou")}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {openRequest.holderMessage}
              </p>
            </div>
          ) : null}

          {openRequest.status === "clarification_requested" ? (
            <p className="mt-3 text-sm text-muted-foreground">{pt("ver.clarificationCta")}</p>
          ) : (
            <ol className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li>1. {pt("ver.progress1")}</li>
              <li>2. {pt("ver.progress2")}</li>
              <li>3. {pt("ver.progress3")}</li>
            </ol>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(pt("ver.withdrawRequestConfirm"))) return;
              void run(() => onWithdrawRequest(openRequest.id));
            }}
            className="mt-4 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("ver.withdrawRequest")}
          </button>
        </div>
      ) : null}

      {/* ── Asking for verification ──────────────────────────────────── */}
      {!openRequest ? (
        <div className="mt-4 space-y-3">
          {renewable ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{pt("ver.renewBody")}</p>
          ) : null}

          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">{pt("ver.requestCq")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{pt("ver.requestCqHelp")}</p>
            <button
              type="button"
              disabled={busy || !hasEvidence}
              onClick={() => void run(() => onSubmit("cqrityjob_review", null))}
              className="mt-3 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {busy ? pt("ver.submitting") : renewable ? pt("ver.renew") : pt("ver.request")}
            </button>
            {/* A document review with no document is not a review. Saying so
                is more useful than a disabled button with no explanation. */}
            {!hasEvidence ? (
              <p className="mt-2 text-sm text-muted-foreground">{pt("ev.none")}</p>
            ) : null}
          </div>

          {canAskEmployer ? (
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-foreground">{pt("ver.requestEmployer")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{pt("ver.requestEmployerHelp")}</p>

              {employers.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{pt("ver.noEmployers")}</p>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label htmlFor="sp-employer" className="sr-only">
                    {pt("ver.chooseEmployer")}
                  </label>
                  <select
                    id="sp-employer"
                    value={employerId}
                    onChange={(e) => setEmployerId(e.target.value)}
                    className="h-11 min-w-[12rem] rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {employers.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !employerId}
                    onClick={() => void run(() => onSubmit("employer_attestation", employerId))}
                    className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {busy ? pt("ver.submitting") : pt("ver.request")}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Dispute ──────────────────────────────────────────────────── */}
      <div className="mt-4 border-t border-border pt-4">
        {disputing ? (
          <div className="space-y-2">
            <label htmlFor="sp-dispute" className="block text-sm font-medium text-foreground">
              {pt("ver.disputeReason")}
            </label>
            <textarea
              id="sp-dispute"
              rows={3}
              value={disputeReason}
              aria-describedby="sp-dispute-help"
              onChange={(e) => setDisputeReason(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <p id="sp-dispute-help" className="text-xs text-muted-foreground">
              {pt("ver.disputeBody")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || disputeReason.trim().length === 0}
                onClick={() =>
                  void run(async () => {
                    await onDispute(disputeReason.trim());
                    setDisputing(false);
                    setDisputeReason("");
                  })
                }
                className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("ver.disputeSubmit")}
              </button>
              <button
                type="button"
                onClick={() => setDisputing(false)}
                className="inline-flex h-11 items-center rounded-md px-4 text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDisputing(true)}
            className="inline-flex h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <MessageSquare aria-hidden="true" className="h-4 w-4" />
            {pt("ver.dispute")}
          </button>
        )}
      </div>

      {/* ── History ──────────────────────────────────────────────────── */}
      <div className="mt-4 border-t border-border pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("ver.historyTitle")}
        </h4>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{pt("ver.historyEmpty")}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="tabular-nums text-muted-foreground">
                  {r.submittedAt.slice(0, 10)}
                </span>
                <span className="text-foreground">
                  {pt(STATUS_KEY[r.status] ?? "ver.status.pending")}
                </span>
                {r.method ? (
                  <span className="text-muted-foreground">
                    · {pt(METHOD_KEY[r.method] ?? "common.notStated")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {renewable && !openRequest ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
          {pt("ver.renewBody")}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
