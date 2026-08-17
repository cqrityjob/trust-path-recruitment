// Security Passport — one entry, and everything that can happen to it.
//
// A qualification and an employment period share this page because they
// share a life: they are declared, documented, submitted, reviewed, decided,
// they expire, they are renewed, corrected, disputed or revoked. Two nearly
// identical pages would have drifted within a release.
//
// ── WHAT THE HOLDER READS FIRST ────────────────────────────────────────
//
// The trust state, in words, at the top: how well the entry is backed and
// where it is in its life. Those are the two axes, and they are shown as two
// separate facts because a verified licence that has expired is the normal
// case, not an edge case.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import {
  getEvidenceViewUrl,
  listMyEvidence,
  uploadEvidence,
  withdrawEvidence,
  type EvidenceRecord,
} from "@/lib/security-passport/evidence.functions";
import {
  listAttestableEmployers,
  listMyVerificationRequests,
  raiseDispute,
  submitForVerification,
  withdrawVerificationRequest,
  type MyVerificationRequest,
  type VerificationDecisionRecord,
} from "@/lib/security-passport/verification.functions";
import { validityOf } from "@/lib/security-passport/validity";
import { formatExpiry, formatPeriodRange } from "@/lib/security-passport/format";
import { credentialPresentation } from "@/lib/security-passport/design/credential-symbols";
import { correctClaim } from "@/lib/security-passport/passport.functions";
import {
  getCredentialPrivateFields,
  listClaimVersions,
  type ClaimVersion,
} from "@/lib/security-passport/credentials.functions";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { CredentialSymbol } from "@/components/security-passport/CredentialSymbol";
import {
  CredentialCorrectionForm,
  type CorrectionValues,
} from "@/components/security-passport/CredentialCorrectionForm";
import { CredentialVersionHistory } from "@/components/security-passport/CredentialVersionHistory";
import { LifecycleChip, LifecycleNote } from "@/components/security-passport/LifecycleChip";
import { EvidencePanel } from "@/components/security-passport/live/EvidencePanel";
import { VerificationPanel } from "@/components/security-passport/live/VerificationPanel";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export const Route = createFileRoute("/_authenticated/passport/entry/$kind/$entryId")({
  ssr: false,
  component: PassportEntryRoute,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function PassportEntryRoute() {
  const { pt, lang } = usePassportCopy();
  const navigate = useNavigate();
  const { kind, entryId } = useParams({ from: "/_authenticated/passport/entry/$kind/$entryId" });
  const isClaim = kind === "claim";

  const loadPassport = useServerFn(getMyPassport);
  const loadEvidence = useServerFn(listMyEvidence);
  const loadRequests = useServerFn(listMyVerificationRequests);
  const loadEmployers = useServerFn(listAttestableEmployers);
  const doUpload = useServerFn(uploadEvidence);
  const doOpen = useServerFn(getEvidenceViewUrl);
  const doWithdrawEvidence = useServerFn(withdrawEvidence);
  const doSubmit = useServerFn(submitForVerification);
  const doWithdrawRequest = useServerFn(withdrawVerificationRequest);
  const doDispute = useServerFn(raiseDispute);
  const doCorrect = useServerFn(correctClaim);
  const loadVersions = useServerFn(listClaimVersions);
  const loadPrivateFields = useServerFn(getCredentialPrivateFields);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [evidence, setEvidence] = useState<readonly EvidenceRecord[]>([]);
  const [requests, setRequests] = useState<readonly MyVerificationRequest[]>([]);
  const [decisions, setDecisions] = useState<readonly VerificationDecisionRecord[]>([]);
  const [employers, setEmployers] = useState<readonly { id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<readonly ClaimVersion[]>([]);
  const [correcting, setCorrecting] = useState(false);
  const [correctionPrefill, setCorrectionPrefill] = useState<{
    credentialReference: string | null;
    holderNote: string | null;
  } | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [snap, ev, reqs, emps] = await Promise.all([
        loadPassport({ data: undefined }),
        loadEvidence({ data: undefined }),
        loadRequests({ data: undefined }),
        loadEmployers({ data: undefined }),
      ]);
      setSnapshot(snap);
      setEvidence(ev);
      setRequests(reqs.requests);
      setDecisions(reqs.decisions);
      setEmployers(emps);
    } catch (err) {
      console.error("[passport] entry load failed", err);
      setError(pt("common.error"));
    }
  }, [loadPassport, loadEvidence, loadRequests, loadEmployers, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The version chain is claim-only and loaded separately: it is history,
  // and a failure to load it must not take down the entry itself.
  useEffect(() => {
    if (!isClaim) return;
    let alive = true;
    void loadVersions({ data: { claimId: entryId } })
      .then((v) => {
        if (alive) setVersions(v);
      })
      .catch((err: unknown) => {
        console.error("[passport] version history load failed", err);
      });
    return () => {
      alive = false;
    };
  }, [isClaim, entryId, loadVersions]);

  const claim = useMemo(
    () => (isClaim ? (snapshot?.holder.claims.find((c) => c.id === entryId) ?? null) : null),
    [isClaim, snapshot, entryId],
  );
  const period = useMemo(
    () => (!isClaim ? (snapshot?.holder.periods.find((p) => p.id === entryId) ?? null) : null),
    [isClaim, snapshot, entryId],
  );

  const entryEvidence = useMemo(
    () => evidence.filter((e) => (isClaim ? e.claimId === entryId : e.periodId === entryId)),
    [evidence, isClaim, entryId],
  );

  const entryRequests = useMemo(
    () => requests.filter((r) => (isClaim ? r.claimId === entryId : r.periodId === entryId)),
    [requests, isClaim, entryId],
  );

  const openRequest =
    entryRequests.find((r) => r.status === "pending" || r.status === "clarification_requested") ??
    null;

  const entryDecisions = useMemo(() => {
    const ids = new Set(entryRequests.map((r) => r.id));
    return decisions.filter((d) => ids.has(d.requestId));
  }, [decisions, entryRequests]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!snapshot) return <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>;

  const subject = claim ?? period;
  if (!subject) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted-foreground">{pt("claim.notFound")}</p>
        <Link
          to="/passport"
          className="mt-4 inline-flex h-11 items-center text-sm font-medium text-accent hover:underline"
        >
          {pt("claim.back")}
        </Link>
      </div>
    );
  }

  const title = claim ? (lang === "en" ? claim.titleEn : claim.titleSv) : period!.roleTitle;
  const validity = validityOf(subject.lifecycleState, claim ? claim.validUntil : null, today());

  const mayCorrect =
    claim !== null &&
    (validity.effectiveState === "active" || validity.effectiveState === "expired");

  async function openCorrection() {
    setCorrectionError(null);
    try {
      const prefill = await loadPrivateFields({ data: { claimId: entryId } });
      setCorrectionPrefill(prefill);
      setCorrecting(true);
    } catch (err) {
      console.error("[passport] correction prefill failed", err);
      setCorrectionError(pt("common.error"));
    }
  }

  async function submitCorrection(values: CorrectionValues) {
    if (!claim) return;
    setCorrectionBusy(true);
    setCorrectionError(null);
    try {
      const { id } = await doCorrect({
        data: {
          claimId: entryId,
          title: values.title,
          claimedIssuerName: values.issuerName.trim() || null,
          jurisdictionCode: values.jurisdictionCode.trim() || null,
          issuedOn: values.issuedOn,
          validUntil: values.validUntil,
          reason: values.reason,
          // The code travels unchanged: a correction fixes a detail, it
          // does not turn a VU1 into something else.
          credentialCode: claim.credentialCode,
          credentialReference: values.credentialReference.trim() || null,
          holderNote: values.holderNote.trim() || null,
        },
      });
      setCorrecting(false);
      setCorrectionPrefill(null);
      // The correction IS a new claim; its page is the current record.
      void navigate({
        to: "/passport/entry/$kind/$entryId",
        params: { kind: "claim", entryId: id },
      });
    } catch (err) {
      console.error("[passport] correction failed", err);
      setCorrectionError(pt("common.error"));
    } finally {
      setCorrectionBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Link
        to="/passport"
        className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {pt("claim.back")}
      </Link>

      <header className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          {/* The credential's mark, in the state derived today — the header
              repeats it in words just below. */}
          {claim?.credentialCode ? (
            <CredentialSymbol
              code={claim.credentialCode}
              state={credentialPresentation(claim.assertionLevel, validity.effectiveState)}
              name={title}
              size={56}
              decorative
              className="mt-1 shrink-0"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {claim
                ? pt(`claims.type.${claim.claimType}` as PassportCopyKey)
                : pt("claim.experienceTitle")}
            </p>
            <h2
              className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {title}
            </h2>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {claim ? (
            <>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {pt("claims.issuer")}
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">{claim.issuerName}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {pt("claims.validUntil")}
                </dt>
                <dd className="mt-0.5 text-sm tabular-nums text-foreground">
                  {formatExpiry(claim.validUntil, lang)}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {pt("emp.role")}
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">{period!.employerName}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {pt("emp.period")}
                </dt>
                <dd className="mt-0.5 text-sm tabular-nums text-foreground">
                  {formatPeriodRange(period!.startedOn, period!.endedOn, lang)}
                </dd>
              </div>
            </>
          )}
        </dl>

        {/* The two axes, side by side and separately labelled. */}
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {pt("claim.trustState")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <AssertionChip level={subject.assertionLevel} />
            <LifecycleChip state={validity.effectiveState} />
          </div>
          <LifecycleNote state={validity.effectiveState} />
        </div>
      </header>

      <EvidencePanel
        evidence={entryEvidence}
        canModify={openRequest === null}
        onUpload={async (file) => {
          await doUpload({
            data: {
              claimId: isClaim ? entryId : null,
              periodId: isClaim ? null : entryId,
              fileName: file.fileName,
              mimeType: file.mimeType,
              contentBase64: file.contentBase64,
            },
          });
          await refresh();
        }}
        onOpen={async (evidenceId) => {
          const { url } = await doOpen({ data: { evidenceId } });
          // noopener/noreferrer: the signed URL must not leak through the
          // opener reference or a Referer header.
          window.open(url, "_blank", "noopener,noreferrer");
        }}
        onWithdraw={async (evidenceId) => {
          await doWithdrawEvidence({ data: { evidenceId } });
          await refresh();
        }}
      />

      <VerificationPanel
        assertionLevel={subject.assertionLevel}
        validity={validity}
        openRequest={openRequest}
        requests={entryRequests}
        decisions={entryDecisions}
        hasEvidence={entryEvidence.length > 0}
        canAskEmployer={!isClaim}
        employers={employers}
        onSubmit={async (requestKind, employerId) => {
          await doSubmit({
            data: {
              claimId: isClaim ? entryId : null,
              periodId: isClaim ? null : entryId,
              kind: requestKind,
              employerId,
            },
          });
          await refresh();
        }}
        onWithdrawRequest={async (requestId) => {
          await doWithdrawRequest({ data: { requestId } });
          await refresh();
        }}
        onDispute={async (reason) => {
          await doDispute({
            data: {
              claimId: isClaim ? entryId : null,
              periodId: isClaim ? null : entryId,
              reason,
            },
          });
          await navigate({ to: "/passport" });
        }}
      />

      {/* Documentation ≠ approval, beside the panels where both happen. */}
      <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
        {pt("cred.docsNotApproval")}
      </p>

      {/* ── Correction ──────────────────────────────────────────────── */}
      {mayCorrect ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {pt("cred.correct.title")}
          </h3>
          {correcting && correctionPrefill && claim ? (
            <div className="mt-3">
              <CredentialCorrectionForm
                claim={claim}
                privateFields={correctionPrefill}
                busy={correctionBusy}
                serverError={correctionError}
                onSubmit={(values) => void submitCorrection(values)}
                onCancel={() => {
                  setCorrecting(false);
                  setCorrectionPrefill(null);
                }}
              />
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pt("cred.correct.trustNote")}
              </p>
              {correctionError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {correctionError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void openCorrection()}
                className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("cred.action.correct")}
              </button>
            </>
          )}
        </section>
      ) : null}

      {/* ── Every version, oldest preserved ─────────────────────────── */}
      {isClaim ? <CredentialVersionHistory versions={versions} currentId={entryId} /> : null}
    </div>
  );
}
