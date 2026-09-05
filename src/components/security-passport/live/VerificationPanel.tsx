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
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BadgeCheck, Building2, Clock, MessageSquare, RotateCw } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { formatDate, verifierAttributionKey } from "@/lib/security-passport/format";
import {
  CQRITYJOB_DECIDER_ORGANISATION,
  isLegacyUnsupportedProvenance,
} from "@/lib/security-passport/provenance";
import { methodLabelKey } from "@/lib/security-passport/trust-presentation";
import type { Validity } from "@/lib/security-passport/validity";
import { mayRenew } from "@/lib/security-passport/validity";
import type {
  MyVerificationRequest,
  VerificationDecisionRecord,
} from "@/lib/security-passport/verification.functions";
import { EmployerConfirmationPicker, type EmployerSearchState } from "./EmployerConfirmationPicker";

export interface VerificationPanelProps {
  readonly assertionLevel: string;
  readonly validity: Validity;
  /** The open request for this entry, if any — `pending` or
   *  `clarification_requested`. */
  readonly openRequest: MyVerificationRequest | null;
  /** The most recent request for this entry when it was REJECTED and nothing
   *  has been asked since.
   *
   *  This prop exists because a rejection used to have nowhere to appear. A
   *  rejected request is not open, the panel rendered its status block only
   *  for an open one, and so the entire outcome — the state, the date, and
   *  the reviewer's message to the holder — vanished the moment the decision
   *  was made, leaving the holder looking at the same "Request verification"
   *  button they had pressed. Nothing had happened, as far as the interface
   *  was concerned.
   *
   *  Kept separate from `openRequest` rather than widening it: an open
   *  request blocks submitting another one and blocks withdrawing evidence,
   *  and a rejected request does neither. Folding a decided request into the
   *  "open" concept would have changed the state machine to fix a rendering
   *  problem. */
  readonly rejectedRequest: MyVerificationRequest | null;
  /** Every request ever made about this entry, newest first. */
  readonly requests: readonly MyVerificationRequest[];
  readonly decisions: readonly VerificationDecisionRecord[];
  readonly hasEvidence: boolean;
  /** Employment entries can be attested by an employer; a qualification
   *  cannot, so the option is absent rather than disabled. */
  readonly canAskEmployer: boolean;
  /** The result of the employer search, owned by the caller because the
   *  search is a server round trip. The panel renders it; it does not decide
   *  what is in it. */
  readonly employerSearch: EmployerSearchState;
  /** Run the employer search for this text. */
  readonly onEmployerSearch: (query: string) => void;
  /** The organisation an OPEN employer request is addressed to, resolved by
   *  the caller from the request's own `targetEmployerId`.
   *
   *  Null is a real answer and is rendered as one: an organisation that has
   *  since stopped being visible to this holder leaves a request the product
   *  can honestly describe as "waiting for the employer" and cannot honestly
   *  name. Guessing at the name from `employerName` on the period would be
   *  the same mistake `toPeriod` refuses to make -- the company a period
   *  NAMES and the company being ASKED are different facts. */
  readonly openRequestEmployerName: string | null;
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

/** True only for an employer confirmation the EMPLOYER gave. A legacy row in
 *  which CQrityjob recorded `employer_confirmation` about itself is a CQrityjob
 *  review and must not borrow the employer's sentence. */
function employerGaveConfirmation(d: VerificationDecisionRecord | null): boolean {
  return (
    d !== null &&
    d.method === "employer_confirmation" &&
    !isLegacyUnsupportedProvenance(d.method, d.organisation)
  );
}

export function VerificationPanel({
  assertionLevel,
  validity,
  openRequest,
  rejectedRequest,
  requests,
  decisions,
  hasEvidence,
  canAskEmployer,
  employerSearch,
  onEmployerSearch,
  openRequestEmployerName,
  onSubmit,
  onWithdrawRequest,
  onDispute,
}: VerificationPanelProps) {
  const { pt, lang } = usePassportCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const latestApproval = decisions.find((d) => d.decision === "approved") ?? null;
  const latestRevocation = decisions.find((d) => d.decision === "revoked") ?? null;
  const renewable = mayRenew(assertionLevel, validity);

  // ── WHO IS BEING WAITED ON, AND WHO ANSWERED ──────────────────────────
  //
  // Everything below distinguishes an EMPLOYER CONFIRMATION from a CQrityjob
  // document review, because they are different acts and the candidate has
  // different things to do about each. The distinction is read from the
  // request's own `kind` and from the DECISION RECORD's organisation -- never
  // from the employer name the candidate typed onto the period, and never
  // from a flag this component computes for itself.
  //
  // `decider_organisation` is the authority for a decided request: it is the
  // name recorded, by the database, at the moment the decision was made. The
  // organisation is looked up by id only for a request nobody has answered
  // yet, because there is no decision record to read.
  const isEmployerRequest = (r: MyVerificationRequest | null): boolean =>
    r !== null && r.kind === "employer_attestation";

  /** The organisation on the most recent decision for one request. Null when
   *  the decision record has no organisation, which is not a case to paper
   *  over -- the panel says "the employer" rather than inventing a name. */
  const deciderFor = (requestId: string): string | null =>
    decisions.find((d) => d.requestId === requestId)?.organisation ?? null;

  /** `<key> <organisation>`, or the key with a neutral noun when there is no
   *  name to use. The same composition `formatVerifierAttribution` makes, for
   *  the same reason: the sentence is translated and the company is not. */
  const named = (key: PassportCopyKey, organisation: string | null): string =>
    `${pt(key)} ${organisation ?? pt("ver.employer.unknownOrg")}`;

  const employerOpen = isEmployerRequest(openRequest);
  const employerRejected = isEmployerRequest(rejectedRequest);

  /** An employer has already confirmed this, and it still stands. Read from
   *  the CURRENT assertion level as well as from the decision record, for the
   *  reason `toPeriod` gates attribution the same way: a confirmation that was
   *  later revoked is real history and stays in the log, but it is not a
   *  present fact and must not suppress a fresh request. */
  const employerConfirmed =
    assertionLevel === "verified" && employerGaveConfirmation(latestApproval);

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

      {/* ── The decision, when there is one ──────────────────────────────
          The headline sentence for an employer confirmation is written out in
          full -- "Anställningen är bekräftad av Bevakning AB" -- because
          "Verifierad av: Bevakning AB" in a definition list is the sentence
          this product must not say. A company confirming that somebody worked
          for them has done something real and something quite unlike CQrityjob
          reading a certificate, and the trust ladder only survives if the two
          do not share a word.

          Which sentence appears is decided by the recorded verification
          METHOD, not by anything the page assumes. */}
      {latestApproval && employerGaveConfirmation(latestApproval) ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-4 text-sm font-medium text-foreground">
          <Building2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="block">
              {named("ver.employer.confirmedBy", latestApproval.organisation)}
            </span>
            {/* Whose statement this is, said next to it. A candidate showing
                this to a third party must not be able to present it as
                CQrityjob's finding, and the third party must not read it as
                one. */}
            <span className="mt-1 block text-sm font-normal text-muted-foreground">
              {pt("ver.employer.notCqrityjob")}
            </span>
          </span>
        </p>
      ) : null}

      {latestApproval ? (
        <dl className="mt-4 grid gap-3 rounded-lg border border-border bg-secondary/40 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {/* Was always "Verifierad av", whatever the method. An employer
                  confirmation and a CQrityjob document review then read
                  identically, which is exactly the flattening the recorded
                  method exists to prevent. */}
              {pt(verifierAttributionKey(latestApproval.method, latestApproval.organisation))}
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {latestApproval.organisation ?? pt("common.notStated")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt(
                isLegacyUnsupportedProvenance(latestApproval.method, latestApproval.organisation)
                  ? "trust.reviewMethod"
                  : "ver.method",
              )}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">
              {latestApproval.method
                ? pt(
                    methodLabelKey(latestApproval.method, latestApproval.organisation) ??
                      "common.notStated",
                  )
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

      {/* A source method CQrityjob recorded about itself, before
          20261029090000. The holder keeps the history above -- who decided,
          when -- and reads why it presents as Dokumenterad. */}
      {latestApproval &&
      isLegacyUnsupportedProvenance(latestApproval.method, latestApproval.organisation) ? (
        <p
          data-legacy-provenance="note"
          className="mt-3 text-sm leading-relaxed text-muted-foreground"
        >
          {pt("trust.legacy.unsupported")}
        </p>
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

      {/* ── The rejection ────────────────────────────────────────────────
          The outcome that had no home. Rendered as a `role="status"` region
          with its own heading, so a screen reader reaches it as a landmark
          rather than as an unannounced paragraph, and so the state is carried
          by words rather than by the border colour alone.

          The wording is about the EVIDENCE, never about the person: "we could
          not verify this based on what was provided" is a statement about a
          document a reviewer read. "Rejected", said of a candidate, is not the
          decision that was made.

          `decision_note` is not available to this component and could not be
          rendered here if somebody tried: `listMyVerificationRequests` does
          not select it. Only `holder_message` — the field that exists to be
          read by the holder — appears. */}
      {rejectedRequest ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
        >
          {/* An employer who cannot find the employment in their records and a
              reviewer who read a document and was not satisfied by it have
              reached completely different conclusions, and the candidate's
              next step differs accordingly: one checks their dates, the other
              checks their paperwork. The generic "we could not verify this
              based on the documentation" was wrong for the first case in every
              particular -- there was no documentation and CQrityjob was not
              the "we". */}
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
            {employerRejected
              ? named("ver.employer.rejectedBy", deciderFor(rejectedRequest.id))
              : pt("ver.rejected.title")}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {employerRejected ? pt("ver.employer.rejectedBody") : pt("ver.rejected.body")}
          </p>

          {rejectedRequest.decidedAt ? (
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {pt("ver.decidedAt")}: {rejectedRequest.decidedAt.slice(0, 10)}
            </p>
          ) : null}

          {rejectedRequest.holderMessage ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {employerRejected ? pt("ver.employer.messageFrom") : pt("ver.rejected.reason")}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {rejectedRequest.holderMessage}
              </p>
            </div>
          ) : (
            // A reason is mandatory as of this change, in the reviewer form and
            // again in `sp_verifier_decide`. Rows decided before that exist and
            // cannot be invented a reason for after the fact, so the absence is
            // stated as an absence rather than papered over with a plausible
            // sentence nobody wrote.
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {employerRejected ? pt("ver.employer.noMessage") : pt("ver.rejected.noReason")}
            </p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-foreground">
            {employerRejected ? pt("ver.employer.rejectedNext") : pt("ver.rejected.next")}
          </p>

          {/* The candidate owns their own record. An employer may say the
              dates are wrong; only the holder may change them, and the
              database has no path that would let anybody else. */}
          {employerRejected ? (
            <Link
              to="/passport/information"
              className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("ver.employer.editEntry")}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* ── The open request ─────────────────────────────────────────── */}
      {openRequest ? (
        <div
          role={openRequest.status === "clarification_requested" ? "status" : undefined}
          className={
            openRequest.status === "clarification_requested"
              ? "mt-4 rounded-lg border border-border bg-secondary/40 p-4"
              : "mt-4 rounded-lg border border-border p-4"
          }
        >
          {openRequest.status === "clarification_requested" ? (
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare aria-hidden="true" className="h-4 w-4 shrink-0" />
              {/* Named, because "Komplettering begärd" does not tell a
                  candidate who is waiting for what. The name comes from the
                  DECISION record -- the organisation as the database wrote it
                  when the request for correction was made. */}
              {employerOpen
                ? named("ver.employer.clarificationFrom", deciderFor(openRequest.id))
                : pt("ver.clarification.title")}
            </h4>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Clock aria-hidden="true" className="h-4 w-4" />
              {/* "Under granskning" is true of a CQrityjob review and
                  misleading about an employer request: nobody at CQrityjob is
                  looking at it, and the candidate's own employer is. */}
              {employerOpen
                ? named("ver.employer.waitingFor", openRequestEmployerName)
                : pt(STATUS_KEY[openRequest.status] ?? "ver.status.pending")}
            </p>
          )}

          {employerOpen && openRequest.status === "clarification_requested" ? (
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {pt("ver.employer.clarificationBody")}
            </p>
          ) : null}

          {openRequest.holderMessage ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {employerOpen
                  ? pt("ver.employer.messageFrom")
                  : openRequest.status === "clarification_requested"
                    ? pt("ver.clarification.whatIsNeeded")
                    : pt("ver.messageToYou")}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {openRequest.holderMessage}
              </p>
            </div>
          ) : openRequest.status === "clarification_requested" ? (
            // "More information required" with nothing after it was the
            // reported defect. Where the reviewer left no message — only
            // possible for a request decided before this became mandatory —
            // say that the detail is missing instead of showing the demand
            // alone.
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {employerOpen ? pt("ver.employer.noMessage") : pt("ver.clarification.noMessage")}
            </p>
          ) : null}

          {openRequest.status === "clarification_requested" ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                {/* The correction is the CANDIDATE's to make. An employer
                    asks; they never write into somebody else's Passport, and
                    `sp_periods_self_update` gives them no way to. */}
                {employerOpen
                  ? pt("ver.employer.clarificationAction")
                  : pt("ver.clarification.action")}
              </p>
              {employerOpen ? (
                <Link
                  to="/passport/information"
                  className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {pt("ver.employer.editEntry")}
                </Link>
              ) : null}
            </>
          ) : employerOpen ? (
            // The three CQrityjob review steps describe a document being read
            // by a reviewer. None of that is happening here.
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {pt("ver.employer.waitingBody")}
            </p>
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

      {/* ── Asking for verification ──────────────────────────────────────
          After a rejection this block is deliberately NOT the same block. The
          bug being closed was not only that the rejection was invisible: it
          was that the panel came back reading exactly as it had before the
          holder ever submitted, which is an interface saying nothing happened.

          The state machine is unchanged — `sp_submit_for_verification` refuses
          only while a request is OPEN, so a new review after a rejection is a
          request the database already permits, and no new workflow state was
          invented to express it. What changes is the framing: the heading says
          this is a NEW review of corrected evidence, and it sits underneath the
          decision rather than in place of it. */}
      {!openRequest ? (
        <div className="mt-4 space-y-3">
          {renewable ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{pt("ver.renewBody")}</p>
          ) : null}

          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">
              {rejectedRequest ? pt("ver.resubmit.title") : pt("ver.requestCq")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {rejectedRequest ? pt("ver.resubmit.help") : pt("ver.requestCqHelp")}
            </p>
            <button
              type="button"
              disabled={busy || !hasEvidence}
              onClick={() => void run(() => onSubmit("cqrityjob_review", null))}
              className="mt-3 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {busy
                ? pt("ver.submitting")
                : rejectedRequest
                  ? pt("ver.resubmit.action")
                  : renewable
                    ? pt("ver.renew")
                    : pt("ver.request")}
            </button>
            {/* A document review with no document is not a review. Saying so
                is more useful than a disabled button with no explanation. */}
            {!hasEvidence ? (
              <p className="mt-2 text-sm text-muted-foreground">{pt("ev.none")}</p>
            ) : null}
          </div>

          {/* ── ASKING AGAIN, WHEN THERE IS SOMETHING TO ASK ──────────────
              An employer confirmation is a statement about a fixed historical
              fact: this person worked here, in this role, between these dates.
              Once Company X has confirmed it there is nothing to ask them a
              second time, and the entry cannot have changed underneath -- a
              verified period is refused by `sp_periods_self_update`, which is
              asserted in the database suite rather than assumed here.

              Left in place, the block came back reading exactly as it had
              before the candidate ever asked, directly beneath the sentence
              saying the employment was confirmed. That is an interface saying
              nothing happened, which is the same defect PR 4 closed for a
              rejection and is closed here for a confirmation. */}
          {canAskEmployer && !employerConfirmed ? (
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-foreground">{pt("ver.requestEmployer")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{pt("ver.requestEmployerHelp")}</p>
              {/* What is being ASKED, distinct from what is being SHARED. A
                  candidate who thinks they are requesting a reference will
                  read a factual confirmation as a lukewarm one, and an
                  employer asked for a reference would be being asked for
                  something this product has no right to hold. */}
              <p className="mt-1 text-sm text-muted-foreground">
                {pt("ver.employer.notReference")}
              </p>

              {/* ── CHOOSING THE ORGANISATION ────────────────────────
                  The picker owns the search, the ordering and the
                  confirmation step. What matters at THIS level is what it
                  hands back: an organisation id, and only after a person has
                  read the name and the country and pressed a control that
                  says it is sending a request. `onSubmit` is reached from
                  nowhere else on this path. */}
              <EmployerConfirmationPicker
                state={employerSearch}
                onSearch={onEmployerSearch}
                busy={busy}
                onConfirm={(id) => run(() => onSubmit("employer_attestation", id))}
              />
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
                    ·{" "}
                    {pt(
                      // A request row carries no decider; the kind says who
                      // decides it, and a CQrityjob review decided by CQrityjob
                      // is the shape the legacy rule is about.
                      methodLabelKey(
                        r.method,
                        r.kind === "cqrityjob_review" ? CQRITYJOB_DECIDER_ORGANISATION : null,
                      ) ?? "common.notStated",
                    )}
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
