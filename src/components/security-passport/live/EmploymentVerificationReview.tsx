// Security Passport — one employment confirmation, as the employer meets it.
//
// ── WHY THIS IS A COMPONENT AND NOT TWO PAGES ──────────────────────────
//
// The employer reaches a request from a dashboard row and from a workspace
// list. Both land here. Written twice, the two would have drifted within a
// release, and the half that drifted would be the half stating what a
// confirmation does NOT mean — which is the sentence that keeps this from
// becoming a reference check.
//
// ── WHAT IS ON THE PAGE IS WHAT IS IN THE PAYLOAD ──────────────────────
//
// One employment period and a name. `sp_employer_attestation_queue` returns
// those fields and cannot be asked for others, so nothing here is hidden in
// the browser: the qualifications, the documents, the other employers and
// the rest of the Passport are absent from the response, not merely unshown.
//
// ── THE MESSAGE IS REQUIRED WHEN THE OUTCOME REQUIRES IT ───────────────
//
// PR 4 made `holder_message` mandatory for a refusal and for a correction
// request, in `sp_verifier_decide`. This page previously labelled the field
// "optional" for all three outcomes, so an employer who pressed "cannot
// confirm" with an empty box got a generic failure from a control the
// product had told them was complete. The label, the help text, the
// `required` attribute and `aria-required` now all follow the selected
// outcome, and the local check refuses before a round trip.
//
// It is not the boundary. `sp_verifier_decide` is, and it stays. This exists
// so the employer is answered where they are standing.
//
// ── THE DECISION IS NOT A COLOUR ───────────────────────────────────────
//
// Three radio options in a named fieldset, each with its own consequence
// spelled out, then one submit. Not three buttons: three buttons make the
// destructive option a click away from the safe one and give assistive
// technology no way to hear that they are alternatives to one question.
//
// The confirmation step is inline rather than `window.confirm`, which cannot
// be styled, cannot be translated by this module, and is dismissed by a
// keyboard user before they have read it.

import { useId, useState } from "react";
import { AlertTriangle, Check, HelpCircle, ShieldAlert, X } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatPeriodRange } from "@/lib/security-passport/format";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { EmployerAttestationItem } from "@/lib/security-passport/verification.functions";

export type EmployerDecision = "approved" | "rejected" | "clarification_requested";

export interface EmploymentVerificationReviewProps {
  readonly item: EmployerAttestationItem;
  readonly busy: boolean;
  /** Already resolved to reader-facing copy by the caller, which owns the
   *  `DecisionErrorCode` mapping. Null when nothing has failed. */
  readonly error: string | null;
  readonly onDecide: (decision: EmployerDecision, holderMessage: string | null) => Promise<void>;
}

const EMPLOYMENT_KEY: Readonly<Record<string, PassportCopyKey>> = {
  full_time: "timeline.employmentType.full_time",
  part_time: "timeline.employmentType.part_time",
  hourly: "timeline.employmentType.hourly",
  temporary: "timeline.employmentType.temporary",
};

const RELEVANCE_KEY: Readonly<Record<string, PassportCopyKey>> = {
  primary: "entry.emp.relevance.primary",
  partial: "entry.emp.relevance.partial",
  none: "entry.emp.relevance.none",
};

const ANSWERED_KEY: Readonly<Record<string, PassportCopyKey>> = {
  approved: "empv.answered.approved",
  rejected: "empv.answered.rejected",
  clarification_requested: "empv.answered.clarification_requested",
  withdrawn: "empv.answered.withdrawn",
};

/** The two outcomes the database refuses without a candidate-facing reason. */
function messageRequiredFor(decision: EmployerDecision): boolean {
  return decision === "rejected" || decision === "clarification_requested";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function EmploymentVerificationReview({
  item,
  busy,
  error,
  onDecide,
}: EmploymentVerificationReviewProps) {
  const { pt, lang } = usePassportCopy();
  const baseId = useId();
  const [decision, setDecision] = useState<EmployerDecision | null>(null);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const open = item.status === "pending" || item.status === "clarification_requested";
  const needsMessage = decision !== null && messageRequiredFor(decision);
  const messageId = `${baseId}-message`;
  const messageHelpId = `${baseId}-message-help`;
  const errorId = `${baseId}-error`;

  function attempt() {
    setLocalError(null);
    if (decision === null) return;
    if (needsMessage && message.trim() === "") {
      setLocalError(pt("empv.messageMissing"));
      return;
    }
    setConfirming(true);
  }

  async function send() {
    if (decision === null) return;
    setConfirming(false);
    // Whitespace is not a reason. Trimmed to null so an all-space box reaches
    // the server as the absence it is, and is refused there too.
    await onDecide(decision, message.trim() === "" ? null : message.trim());
  }

  return (
    <div className="space-y-5">
      {/* ── The facts, and only the facts ──────────────────────────── */}
      <section
        aria-labelledby={`${baseId}-facts`}
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2
          id={`${baseId}-facts`}
          className="text-base font-semibold tracking-tight text-foreground"
        >
          {pt("empv.factsTitle")}
        </h2>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Fact label={pt("emp.person")} value={item.holderName || pt("common.notStated")} />
          <Fact
            label={pt("empv.organisation")}
            value={item.employerName || pt("common.notStated")}
          />
          <Fact label={pt("emp.role")} value={item.roleTitle || pt("common.notStated")} />
          <Fact
            label={pt("emp.period")}
            value={formatPeriodRange(item.startedOn, item.endedOn, lang)}
          />
          <Fact
            label={pt("emp.employmentType")}
            value={pt(EMPLOYMENT_KEY[item.employmentType] ?? "common.notStated")}
          />
          <Fact
            label={pt("empv.securityRelevance")}
            value={pt(RELEVANCE_KEY[item.securityRelevance] ?? "common.notStated")}
          />
          <Fact label={pt("empv.submitted")} value={item.submittedAt.slice(0, 10)} />
        </dl>
      </section>

      {/* ── The refusal, stated before it is met ────────────────────────
          A candidate may also own the company. `sp_verifier_decide` refuses
          their decision on their own request, and this says so instead of
          offering a control that cannot work. The flag comes from the
          database, not from a comparison made here. */}
      {item.isSelf ? (
        <section
          role="note"
          className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5"
          aria-labelledby={`${baseId}-self`}
        >
          <h2
            id={`${baseId}-self`}
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
          >
            <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            {pt("empv.selfTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{pt("empv.selfBody")}</p>
        </section>
      ) : null}

      {/* ── The answer ─────────────────────────────────────────────── */}
      {open && !item.isSelf ? (
        <section
          aria-labelledby={`${baseId}-response`}
          className="rounded-xl border border-border bg-card p-5"
        >
          <h2
            id={`${baseId}-response`}
            className="text-base font-semibold tracking-tight text-foreground"
          >
            {pt("empv.responseTitle")}
          </h2>

          {/* What a confirmation is, and — the half that matters — what it
              is not. Above the control, because after it is too late. */}
          <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-4">
            <p className="text-sm font-medium text-foreground">{pt("empv.meaningTitle")}</p>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
              <li>{pt("empv.meaning1")}</li>
              <li>{pt("empv.meaning2")}</li>
              <li>{pt("empv.meaning3")}</li>
            </ul>
          </div>

          <fieldset className="mt-4 border-0 p-0">
            <legend className="text-sm font-medium text-foreground">{pt("emp.question")}</legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  ["approved", "empv.confirmAction", Check],
                  ["clarification_requested", "empv.correctionAction", HelpCircle],
                  ["rejected", "empv.rejectAction", X],
                ] as const
              ).map(([value, labelKey, Icon]) => (
                <label
                  key={value}
                  htmlFor={`${baseId}-${value}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 text-sm text-foreground has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
                >
                  <input
                    type="radio"
                    id={`${baseId}-${value}`}
                    name={`${baseId}-decision`}
                    value={value}
                    checked={decision === value}
                    disabled={busy}
                    onChange={() => {
                      setDecision(value);
                      setConfirming(false);
                      setLocalError(null);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="flex items-center gap-2">
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{pt(labelKey)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* The correction rule, next to the option that triggers it: the
              employer asks, the candidate edits. An employer never writes
              into somebody else's Passport, and the database has no path
              that would let them. */}
          {decision === "clarification_requested" ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {pt("empv.correctionNote")}
            </p>
          ) : null}

          <label htmlFor={messageId} className="mt-4 block text-sm font-medium text-foreground">
            {needsMessage ? pt("empv.messageRequired") : pt("empv.messageOptional")}
          </label>
          <textarea
            id={messageId}
            rows={3}
            value={message}
            required={needsMessage}
            aria-required={needsMessage}
            aria-describedby={messageHelpId}
            aria-invalid={localError !== null}
            disabled={busy}
            onChange={(e) => {
              setMessage(e.target.value);
              setConfirming(false);
              setLocalError(null);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <p id={messageHelpId} className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {decision === "rejected"
              ? pt("empv.messageHelpReject")
              : decision === "clarification_requested"
                ? pt("empv.messageHelpCorrection")
                : pt("emp.confirmBody")}
          </p>

          {localError ? (
            <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-destructive">
              {localError}
            </p>
          ) : null}

          {confirming ? (
            <div role="status" className="mt-4 rounded-lg border border-border bg-secondary/40 p-4">
              <p className="text-sm font-medium text-foreground">{pt("emp.confirmTitle")}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pt("vq.immutableNote")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send()}
                  className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {busy ? pt("ver.submitting") : pt("common.confirm")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="inline-flex h-11 items-center rounded-md px-4 text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {pt("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || decision === null}
              onClick={attempt}
              className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("empv.send")}
            </button>
          )}

          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Already answered ───────────────────────────────────────── */}
      {!open ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            {pt(ANSWERED_KEY[item.status] ?? "emp.decided")}
          </h2>
          {item.decidedAt ? (
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {pt("emp.decided")} {item.decidedAt.slice(0, 10)}
            </p>
          ) : null}
          {item.holderMessage ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pt("empv.yourMessage")}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {item.holderMessage}
              </p>
            </div>
          ) : null}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {pt("vq.immutableNote")}
          </p>
        </section>
      ) : null}
    </div>
  );
}
