// The lifecycle of one governed BESKT method version.
//
// ── THE FIVE GATES ARE PARALLEL, NOT A LADDER ───────────────────────────
//
// Personnel security, senior HR, recruitment, employment and privacy law,
// and data protection each decide independently, and recording an approval
// does not move the revision — so the five are collected at once without
// invalidating each other. This screen therefore shows five rows with five
// states, never a progress bar: a bar would imply an order that does not
// exist and a "percentage approved" that is meaningless when the fifth
// reviewer can refuse.
//
// ── WHY AN APPROVAL CAN GO STALE WITHOUT ANYONE REJECTING IT ────────────
//
// An approval counts only at the CURRENT content hash, the CURRENT revision
// and in the CURRENT review cycle. Any governed content touch moves the
// revision — including an edit that restores byte-identical content — and a
// rejection ends the cycle, so a resubmission needs five fresh approvals
// even if not one byte changed. That is deliberate, and it is the single
// thing about this screen a governance user is most likely to misread, so
// each row says which of the three it is out of date on rather than simply
// greying out.
//
// ── WHAT THIS SCREEN NEVER DOES ─────────────────────────────────────────
//
// Offer a "publish anyway", a gate override, or a way to record a decision
// on somebody else's behalf. The database refuses all three; the screen does
// not present them, because an action that is always refused is not a
// safeguard, it is a trap.

import { useState } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { NoticePanel, StateBadge } from "@/components/admin/interview/PackGovernanceUi";
import { besktErrorKey } from "@/lib/beskt/errors";
import { besktGateState, type BesktGateState } from "./governance-logic";
import {
  BESKT_GATES,
  type BesktGate,
  type BesktMethodEvent,
  type BesktReviewRecord,
  type BesktValidationFinding,
  type BesktVersionWorkspace,
} from "@/lib/beskt/governance.functions";

const BUTTON =
  "inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-md border border-transparent bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
const INPUT =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function BesktStatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const tone =
    status === "published"
      ? "confirmed"
      : status === "in_review"
        ? "attention"
        : status === "suspended"
          ? "governance"
          : "neutral";
  return (
    <StateBadge tone={tone} srPrefix={t("beskt.admin.status.label")}>
      {t(`beskt.admin.status.${status}` as TranslationKey)}
    </StateBadge>
  );
}

function GateRow({
  gate,
  state,
  canDecide,
  busy,
  onDecide,
}: {
  gate: BesktGate;
  state: BesktGateState;
  canDecide: boolean;
  busy: boolean;
  onDecide: (decision: "approved" | "rejected", rationale: string) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [rationale, setRationale] = useState("");

  const tone =
    state.kind === "approved"
      ? "confirmed"
      : state.kind === "rejected"
        ? "governance"
        : state.kind === "stale"
          ? "attention"
          : "neutral";

  return (
    <li data-testid={`beskt-gate-${gate}`} className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t(`beskt.admin.gate.${gate}` as TranslationKey)}
          </p>
          <p className="mt-0.5 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
            {t(`beskt.admin.gateLede.${gate}` as TranslationKey)}
          </p>
        </div>
        <StateBadge tone={tone} srPrefix={t("beskt.admin.gate.stateLabel")}>
          {t(`beskt.admin.gateState.${state.kind}` as TranslationKey)}
        </StateBadge>
      </div>

      {state.kind === "stale" && (
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
          {t(`beskt.admin.gateStale.${state.reason}` as TranslationKey)}
        </p>
      )}

      {"review" in state && (
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">{t("beskt.admin.gate.rationale")}: </span>
          {state.review.rationale}
        </p>
      )}

      {canDecide && !open && (
        <button type="button" className={`${BUTTON} mt-3`} onClick={() => setOpen(true)}>
          {t("beskt.admin.gate.decide")}
        </button>
      )}

      {canDecide && open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onDecide(decision, rationale);
          }}
        >
          <div>
            <label
              htmlFor={`beskt-gate-decision-${gate}`}
              className="text-sm font-medium text-foreground"
            >
              {t("beskt.admin.gate.decision")}
            </label>
            <select
              id={`beskt-gate-decision-${gate}`}
              className={INPUT}
              value={decision}
              onChange={(e) => setDecision(e.target.value as "approved" | "rejected")}
            >
              <option value="approved">{t("beskt.admin.gate.approve")}</option>
              <option value="rejected">{t("beskt.admin.gate.reject")}</option>
            </select>
          </div>
          <div>
            <label
              htmlFor={`beskt-gate-rationale-${gate}`}
              className="text-sm font-medium text-foreground"
            >
              {t("beskt.admin.gate.rationale")}
              <span className="text-destructive"> *</span>
            </label>
            <textarea
              id={`beskt-gate-rationale-${gate}`}
              className={INPUT}
              rows={3}
              required
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.gate.rationaleHelp")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={busy || rationale.trim() === ""}>
              {busy ? t("beskt.admin.gate.recording") : t("beskt.admin.gate.record")}
            </button>
            <button type="button" className={BUTTON} onClick={() => setOpen(false)}>
              {t("beskt.admin.family.cancel")}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/** The validator's findings, as a checklist a person can act on. */
function Findings({
  findings,
  heading,
  lede,
  testId,
}: {
  findings: readonly BesktValidationFinding[];
  heading: string;
  lede: string;
  testId: string;
}) {
  const { t } = useT();
  return (
    <div data-testid={testId}>
      <h4 className="text-sm font-semibold text-foreground">{heading}</h4>
      <p className="mt-1 max-w-[80ch] text-xs leading-relaxed text-muted-foreground">{lede}</p>
      {findings.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("beskt.admin.validate.clear")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {findings.map((f, i) => (
            <li key={`${f.code}-${i}`} className="text-sm">
              <code className="font-mono text-xs text-muted-foreground">{f.code}</code>{" "}
              <span className="text-foreground">{f.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventLog({ events }: { events: readonly BesktMethodEvent[] }) {
  const { t } = useT();
  return (
    <section
      data-testid="beskt-event-log"
      className="rounded-lg border border-border p-4"
      aria-labelledby="beskt-events-h"
    >
      <h3 id="beskt-events-h" className="text-base font-semibold text-foreground">
        {t("beskt.admin.events.heading")}
      </h3>
      <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.admin.events.lede")}
      </p>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.admin.events.empty")}</p>
      ) : (
        <ol className="mt-3 space-y-1">
          {events.map((e) => (
            <li key={e.seq} className="text-xs text-muted-foreground">
              {e.at.slice(0, 16).replace("T", " ")} ·{" "}
              <span className="text-foreground">
                {t(`beskt.admin.event.${e.event}` as TranslationKey)}
              </span>
              {e.previousStatus && e.newStatus ? ` · ${e.previousStatus} → ${e.newStatus}` : ""}
              {e.revision !== null ? ` · r${e.revision}` : ""}
              {e.reason ? ` · ${e.reason}` : ""}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export interface BesktLifecycleActions {
  readonly busy: boolean;
  readonly error: unknown;
  readonly submit: () => void;
  readonly recordReview: (
    gate: BesktGate,
    decision: "approved" | "rejected",
    rationale: string,
  ) => void;
  readonly publish: (reason: string | null) => void;
  readonly suspend: (reason: string) => void;
  readonly retire: (reason: string) => void;
}

/** A transition that needs a reason, behind a short form rather than a prompt. */
function ReasonAction({
  id,
  label,
  help,
  busy,
  required,
  onRun,
}: {
  id: string;
  label: string;
  help: string;
  busy: boolean;
  required: boolean;
  onRun: (reason: string) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button type="button" className={BUTTON} disabled={busy} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <form
      className="w-full space-y-2 rounded-md border border-border bg-muted/20 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onRun(reason);
      }}
    >
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      <p className="max-w-[72ch] text-xs leading-relaxed text-muted-foreground">{help}</p>
      <textarea
        id={id}
        className={INPUT}
        rows={2}
        required={required}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={PRIMARY}
          disabled={busy || (required && reason.trim() === "")}
        >
          {busy ? t("beskt.admin.lifecycle.working") : t("beskt.admin.lifecycle.confirm")}
        </button>
        <button type="button" className={BUTTON} onClick={() => setOpen(false)}>
          {t("beskt.admin.family.cancel")}
        </button>
      </div>
    </form>
  );
}

export function BesktLifecyclePanel({
  workspace,
  contentFindings,
  publishFindings,
  actions,
}: {
  workspace: BesktVersionWorkspace;
  /** `beskt_method_validate(version, false)` — completeness alone. */
  contentFindings: readonly BesktValidationFinding[];
  /** `beskt_method_validate(version, true)` — completeness plus the five gates. */
  publishFindings: readonly BesktValidationFinding[];
  actions: BesktLifecycleActions;
}) {
  const { t } = useT();
  const v = workspace.version;
  const isDraft = v.contentStatus === "draft";
  const inReview = v.contentStatus === "in_review";
  const isPublished = v.contentStatus === "published";

  return (
    <div className="space-y-4">
      <section
        data-testid="beskt-lifecycle"
        className="rounded-lg border border-border p-4"
        aria-labelledby="beskt-lifecycle-h"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="beskt-lifecycle-h" className="text-base font-semibold text-foreground">
            {t("beskt.admin.lifecycle.heading")}
          </h3>
          <BesktStatusBadge status={v.contentStatus} />
        </div>
        <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
          {t("beskt.admin.lifecycle.lede")}
        </p>

        {actions.error != null && (
          <div className="mt-3">
            <NoticePanel tone="governance" role="alert" title={t("beskt.admin.actionRefused")}>
              <p>{t(besktErrorKey(actions.error))}</p>
            </NoticePanel>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <Findings
            findings={contentFindings}
            heading={t("beskt.admin.validate.contentHeading")}
            lede={t("beskt.admin.validate.contentLede")}
            testId="beskt-findings-content"
          />
          {(inReview || isDraft) && (
            <Findings
              findings={publishFindings}
              heading={t("beskt.admin.validate.publishHeading")}
              lede={t("beskt.admin.validate.publishLede")}
              testId="beskt-findings-publish"
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-2">
          {isDraft && (
            <button
              type="button"
              className={PRIMARY}
              data-testid="beskt-submit-for-review"
              disabled={actions.busy}
              onClick={actions.submit}
            >
              {actions.busy
                ? t("beskt.admin.lifecycle.working")
                : t("beskt.admin.lifecycle.submit")}
            </button>
          )}

          {inReview && (
            <ReasonAction
              id="beskt-publish-reason"
              label={t("beskt.admin.lifecycle.publish")}
              help={t("beskt.admin.lifecycle.publishHelp")}
              busy={actions.busy}
              required={false}
              onRun={(reason) => actions.publish(reason.trim() === "" ? null : reason)}
            />
          )}

          {isPublished && (
            <ReasonAction
              id="beskt-suspend-reason"
              label={t("beskt.admin.lifecycle.suspend")}
              help={t("beskt.admin.lifecycle.suspendHelp")}
              busy={actions.busy}
              required
              onRun={actions.suspend}
            />
          )}

          {(isPublished || v.contentStatus === "suspended") && (
            <ReasonAction
              id="beskt-retire-reason"
              label={t("beskt.admin.lifecycle.retire")}
              help={t("beskt.admin.lifecycle.retireHelp")}
              busy={actions.busy}
              required
              onRun={actions.retire}
            />
          )}
        </div>

        {isDraft && (
          <p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-muted-foreground">
            {t("beskt.admin.lifecycle.submitOpensCycle")}
          </p>
        )}
      </section>

      <section
        data-testid="beskt-gates"
        className="rounded-lg border border-border p-4"
        aria-labelledby="beskt-gates-h"
      >
        <h3 id="beskt-gates-h" className="text-base font-semibold text-foreground">
          {t("beskt.admin.gates.heading")}
        </h3>
        <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
          {t("beskt.admin.gates.lede")}
        </p>
        <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-muted-foreground">
          {t("beskt.admin.gates.mandateNote")}
        </p>
        <ul className="mt-3 space-y-2">
          {BESKT_GATES.map((gate) => (
            <GateRow
              key={gate}
              gate={gate}
              state={besktGateState(gate, workspace.reviews, v)}
              canDecide={inReview}
              busy={actions.busy}
              onDecide={(decision, rationale) => actions.recordReview(gate, decision, rationale)}
            />
          ))}
        </ul>
        {!inReview && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("beskt.admin.gates.onlyInReview")}
          </p>
        )}
      </section>

      <EventLog events={workspace.events} />
    </div>
  );
}
