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

import { fieldsFor, type CredentialType } from "@/lib/security-passport/credentials";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { publicShareUrl } from "@/lib/security-passport/public-origin";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import {
  getEvidenceViewUrl,
  listMyEvidence,
  uploadEvidence,
  withdrawEvidence,
  type EvidenceRecord,
} from "@/lib/security-passport/evidence.functions";
import {
  listMyVerificationRequests,
  raiseDispute,
  searchAttestableEmployers,
  submitForVerification,
  withdrawVerificationRequest,
  type MyVerificationRequest,
  type VerificationDecisionRecord,
} from "@/lib/security-passport/verification.functions";
import { validityOf } from "@/lib/security-passport/validity";
import { formatExpiry, formatPeriodRange } from "@/lib/security-passport/format";
import { credentialPresentationOf } from "@/lib/security-passport/trust-presentation";
import { correctClaim } from "@/lib/security-passport/passport.functions";
import {
  getCredentialPrivateFields,
  listClaimVersions,
  archiveCredential,
  listCredentialTypes,
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
import { CredentialShareActions } from "@/components/security-passport/live/CredentialShareActions";
import { createCredentialDisclosure } from "@/lib/security-passport/disclosure.functions";
import { VerificationPanel } from "@/components/security-passport/live/VerificationPanel";
import type { EmployerSearchState } from "@/components/security-passport/live/EmployerConfirmationPicker";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

/** The lifecycle states `sp_archive_claim` accepts. Mirrored here so the
 *  control is absent rather than present-and-refused; the database remains the
 *  authority, and `disputed` is deliberately NOT in the set — a disputed entry
 *  is resolved by a reviewer, not archived out from under one. */
const ARCHIVABLE: ReadonlySet<string> = new Set(["active", "expired", "draft"]);

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
  const searchEmployers = useServerFn(searchAttestableEmployers);
  const doUpload = useServerFn(uploadEvidence);
  const doOpen = useServerFn(getEvidenceViewUrl);
  const doWithdrawEvidence = useServerFn(withdrawEvidence);
  const doSubmit = useServerFn(submitForVerification);
  const doWithdrawRequest = useServerFn(withdrawVerificationRequest);
  const doDispute = useServerFn(raiseDispute);
  const doArchive = useServerFn(archiveCredential);
  const doShareCredential = useServerFn(createCredentialDisclosure);
  const doCorrect = useServerFn(correctClaim);
  const loadVersions = useServerFn(listClaimVersions);
  const loadCredentialTypes = useServerFn(listCredentialTypes);
  const loadPrivateFields = useServerFn(getCredentialPrivateFields);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [evidence, setEvidence] = useState<readonly EvidenceRecord[]>([]);
  const [requests, setRequests] = useState<readonly MyVerificationRequest[]>([]);
  const [decisions, setDecisions] = useState<readonly VerificationDecisionRecord[]>([]);
  const [credentialTypes, setCredentialTypes] = useState<readonly CredentialType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [credentialShareUrl, setCredentialShareUrl] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [versions, setVersions] = useState<readonly ClaimVersion[]>([]);
  const [correcting, setCorrecting] = useState(false);
  const [correctionPrefill, setCorrectionPrefill] = useState<{
    credentialReference: string | null;
    holderNote: string | null;
  } | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Cleared here, on the way in. Without it the read-failure branch is an
    // early return and the retry button below it could never repaint the page
    // — a control that runs the right query and then shows the stale error
    // anyway, which is worse than no retry at all.
    setError(null);
    try {
      const [snap, ev, reqs, types] = await Promise.all([
        loadPassport({ data: undefined }),
        loadEvidence({ data: undefined }),
        loadRequests({ data: undefined }),
        // Needed to know whether this credential is scoped. Read from the
        // taxonomy rather than a list here, so a credential that becomes
        // scoped later asks for it without a code change.
        loadCredentialTypes({ data: undefined }),
      ]);
      setSnapshot(snap);
      setEvidence(ev);
      setRequests(reqs.requests);
      setDecisions(reqs.decisions);
      setCredentialTypes(types);
    } catch (err) {
      // Same reachability change as the Passport index: getMyPassport and
      // listMyVerificationRequests both fail loudly now instead of returning a
      // plausible empty answer, so this branch is what a holder actually meets
      // when a read is refused. It says which thing failed and that nothing of
      // theirs moved, rather than "something went wrong".
      console.error("[passport] entry load failed", err);
      setError(pt("live.readError"));
    }
  }, [loadPassport, loadEvidence, loadRequests, loadCredentialTypes, pt]);

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

  // ── THE REJECTION THE PAGE USED TO SWALLOW ──────────────────────────
  //
  // `entryRequests` is newest-first (the server orders by `submitted_at`
  // descending), so element zero is the CURRENT state of this entry's
  // relationship with review. When that is a rejection, it is the outcome the
  // holder is living with and the panel must say so.
  //
  // Deliberately the latest request and not "any rejection ever": a holder who
  // was rejected in March, corrected the document and was approved in June has
  // not been rejected — they have a rejection in their history, which is what
  // the history list is for. Reading `find(status === "rejected")` over the
  // whole list would resurrect a settled decision on top of a verified
  // credential.
  //
  // An open request always wins, because a rejection followed by a fresh
  // submission is a review in progress; that case cannot arise from index zero
  // anyway, and the extra guard states the precedence rather than relying on
  // ordering to imply it.
  const latestRequest = entryRequests[0] ?? null;
  const rejectedRequest =
    openRequest === null && latestRequest?.status === "rejected" ? latestRequest : null;

  const entryDecisions = useMemo(() => {
    const ids = new Set(entryRequests.map((r) => r.id));
    return decisions.filter((d) => ids.has(d.requestId));
  }, [decisions, entryRequests]);

  // ── FINDING THE EMPLOYER WHO CAN CONFIRM THIS EMPLOYMENT ────────────
  //
  // The search lives HERE rather than inside the picker for one reason: the
  // same result is what lets the panel NAME the organisation an already-open
  // request went to, and at that moment the picker is not on screen. One
  // fetch, two readers.
  //
  // The old page instead loaded every employer it could see, once, alongside
  // the Passport itself, and resolved the open request's name out of that
  // list. That list is what this replaces; see `searchAttestableEmployers`.

  /** The organisation this employment has already been addressed to, if any.
   *
   *  Read from the most recent EMPLOYER request for this entry — including a
   *  decided one, which is the case that matters: a candidate whose request
   *  came back "we need more detail" and who is asking again should find that
   *  company at the top rather than hunting for it a second time.
   *
   *  It is a RANKING signal and an id to look a name up by. Nothing here
   *  re-sends anything, and nothing binds a new request to it: the candidate
   *  still chooses, and still confirms. */
  const linkedEmployerId =
    entryRequests.find((r) => r.kind === "employer_attestation" && r.targetEmployerId !== null)
      ?.targetEmployerId ?? null;

  const [employerSearch, setEmployerSearch] = useState<EmployerSearchState>({
    suggestions: [],
    truncated: false,
    loading: false,
    failed: false,
  });
  const [linkedEmployerName, setLinkedEmployerName] = useState<string | null>(null);

  // Two guards on one async read, and they close different holes.
  //
  //   `seq`   the candidate types "nord", then "nordv". If the first query is
  //           slower than the second, its result arrives last and repaints the
  //           list for a search nobody is looking at any more. Only the newest
  //           sequence number may write.
  //
  //   `timer` one keystroke is up to four `ilike` queries. Without a delay,
  //           typing a company name is a query storm and every intermediate
  //           result is discarded by the guard above anyway.
  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runEmployerSearch = useCallback(
    (query: string, immediate = false) => {
      if (isClaim || !period) return;
      const seq = ++searchSeq.current;
      setEmployerSearch((prev) => ({ ...prev, loading: true, failed: false }));

      const fire = () => {
        void searchEmployers({
          data: {
            employerName: period.employerName,
            country: period.jurisdictionCode,
            query,
            linkedEmployerId,
          },
        })
          .then((r) => {
            if (searchSeq.current !== seq) return;
            setEmployerSearch({
              suggestions: r.suggestions,
              truncated: r.truncated,
              loading: false,
              failed: false,
            });
            setLinkedEmployerName(r.linkedEmployer?.name ?? null);
          })
          .catch((err: unknown) => {
            if (searchSeq.current !== seq) return;
            // A refused search is reported as a refused search. This branch is
            // exactly what `if (error) return []` in the old server function
            // hid, and what made a broken query read to a candidate as "your
            // employer is not here".
            console.error("[passport] employer search failed", err);
            setEmployerSearch({
              suggestions: [],
              truncated: false,
              loading: false,
              failed: true,
            });
          });
      };

      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      if (immediate) fire();
      else searchTimer.current = setTimeout(fire, 250);
    },
    [isClaim, period, linkedEmployerId, searchEmployers],
  );

  // The first search runs with an empty query, which returns the name and
  // country signals from the employment itself: what a candidate should be
  // looking at before they have typed anything.
  useEffect(() => {
    runEmployerSearch("", true);
    return () => {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    };
  }, [runEmployerSearch]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <p role="alert" className="text-sm font-medium text-foreground">
          {error}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {pt("live.readErrorBody")}
        </p>
        {/* A real retry, not a decorative one: `refresh` re-runs every read
            this page needs and clears the error on success. */}
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("live.retry")}
        </button>
      </div>
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

  // Whether this credential is scoped, straight from the taxonomy row via
  // `fieldsFor` — the same function the create path uses, so the two can never
  // disagree about which credentials ask for a scope.
  const correctionRequiresScope = claim?.credentialCode
    ? (fieldsFor(
        credentialTypes.find((t) => t.code === claim.credentialCode) ?? {
          code: "",
          category: "qualification",
          claimType: "",
          nameSv: "",
          nameEn: "",
          symbolLabel: "",
          requiresValidUntil: false,
          requiresIssuer: false,
          requiresScope: false,
          narrowResultOnly: false,
          titleIsHolderWritten: false,
          jurisdictionCode: null,
          subJurisdictionCode: null,
        },
      ).scope ?? false)
    : false;

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
          // Both were omitted, and omitting the scope is what froze every
          // legacy Skyddsvakt claim: sp_correct_claim coalesces an absent
          // value with the superseded row's, and for a pre-column row that is
          // NULL — which the write guard then refused. The holder supplies it
          // here; the sub-jurisdiction carries forward unchanged.
          authorisationScope: values.authorisationScope.trim() || null,
          subJurisdictionCode: claim.subJurisdictionCode,
          // Carried unchanged for the same reason as the credential code: the
          // correction form does not offer the level, so it must not blank it.
          skillCode: claim.skillCode,
          skillLevel: claim.skillLevel,
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
              state={credentialPresentationOf(claim, validity.effectiveState)}
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
              {/* The holder could TYPE a scope during a correction and then
                  never see it again: it was stored, disclosed to employers,
                  and absent from their own record. A field somebody owns and
                  cannot read is one they cannot check. */}
              {claim.authorisationScope ? (
                <div data-testid="sp-holder-scope">
                  <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {pt("cred.field.scope")}
                  </dt>
                  <dd className="mt-0.5 text-sm text-foreground">{claim.authorisationScope}</dd>
                </div>
              ) : null}
              {claim.subJurisdictionCode ? (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {pt("rec.subJurisdiction")}
                  </dt>
                  <dd className="mt-0.5 text-sm text-foreground">{claim.subJurisdictionCode}</dd>
                </div>
              ) : null}
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
            <AssertionChip
              level={subject.assertionLevel}
              provenance={{ ...subject, subjectKind: isClaim ? "credential" : "employment" }}
            />
            <LifecycleChip state={validity.effectiveState} />
          </div>
          <LifecycleNote state={validity.effectiveState} />
        </div>
      </header>

      <EvidencePanel
        evidence={entryEvidence}
        // A clarification asks the holder for a document and then has to let
        // them attach one. Adding is allowed whenever the database allows it,
        // which is always; removing is barred while any request is open,
        // because `sp_withdraw_evidence` refuses it and the reviewer is
        // relying on what is there.
        canAdd={true}
        canRemove={openRequest === null}
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

      {/* A verified, current credential can be shared on its own — the
          holder should not have to disclose their whole Passport to prove
          one qualification. Shown for claims only: an employment period is
          not a credential somebody puts on LinkedIn. */}
      {claim ? (
        <CredentialShareActions
          subject={{
            title,
            issuer: claim.issuerName === "—" ? null : claim.issuerName,
            issuedOn: claim.issuedOn,
            validUntil: claim.validUntil,
            shareable: claim.assertionLevel === "verified" && validity.effectiveState === "active",
          }}
          shareUrl={credentialShareUrl}
          busy={sharingBusy}
          onCreateLink={() => {
            setSharingBusy(true);
            setError(null);
            void doShareCredential({
              data: {
                claimId: entryId,
                expiresDays: 30,
                purpose: null,
                recipientHint: null,
              },
            })
              .then((r) => {
                setCredentialShareUrl(publicShareUrl(r.token));
              })
              .catch((err: unknown) => {
                console.error("[passport] credential share failed", err);
                setError(pt("common.error"));
              })
              .finally(() => setSharingBusy(false));
          }}
        />
      ) : null}

      <VerificationPanel
        assertionLevel={subject.assertionLevel}
        subjectKind={isClaim ? "credential" : "employment"}
        validity={validity}
        openRequest={openRequest}
        rejectedRequest={rejectedRequest}
        requests={entryRequests}
        decisions={entryDecisions}
        hasEvidence={entryEvidence.length > 0}
        canAskEmployer={!isClaim}
        employerSearch={employerSearch}
        onEmployerSearch={(q) => runEmployerSearch(q)}
        // The organisation an OPEN employer request went to, looked up BY ID
        // rather than found in a list. Null when the lookup could not name it
        // -- said as "the employer" rather than substituted with the company
        // name typed onto the period, which is a different fact and would read
        // as an attestation nobody made. The id equality is not belt and
        // braces: `linkedEmployerName` is the name of whatever
        // `linkedEmployerId` resolved to, and printing it beside a DIFFERENT
        // open request would be naming the wrong company. A DECIDED request
        // does not use this at all: the panel reads its organisation from the
        // decision record, which is what the database wrote at the moment the
        // decision was made.
        openRequestEmployerName={
          openRequest?.targetEmployerId &&
          openRequest.targetEmployerId === linkedEmployerId &&
          linkedEmployerName !== null
            ? linkedEmployerName
            : null
        }
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

      {/* ── Disputed: what happens next, said to the holder ─────────────
          The tester pressed "Anmäl att uppgiften är fel", watched the chip
          change to Bestridd and had no idea whether anything would come of it.
          It now says: somebody is going to look at this. */}
      {subject.lifecycleState === "disputed" ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
        >
          {pt("claim.dispute.pending")}
        </p>
      ) : null}

      {/* ── Remove from the active Passport ─────────────────────────────
          "How do I remove an appointment?" had no answer for anything that was
          not a draft: the holder's UPDATE policy refuses every write to a
          verified claim, correctly, and that took the archive with it.

          Deliberately placed AFTER the dispute control and worded against it.
          These are two different statements — "this is wrong" goes to a
          reviewer, "I do not want this shown" is the holder's own decision —
          and a product that offers only the first teaches holders to dispute
          things they do not actually contest. */}
      {claim && ARCHIVABLE.has(subject.lifecycleState) ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {pt("claim.archive.title")}
          </h3>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {pt("claim.archive.lead")}
          </p>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {pt("claim.archive.notDispute")}
          </p>

          {openRequest !== null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {pt("claim.archive.blockedReview")}
            </p>
          ) : (
            <button
              type="button"
              disabled={archiveBusy}
              onClick={() => {
                if (!window.confirm(pt("claim.archive.confirm"))) return;
                setArchiveBusy(true);
                setArchiveError(null);
                void doArchive({ data: { claimId: entryId, reason: "" } })
                  .then(() => navigate({ to: "/passport" }))
                  .catch((err: unknown) => {
                    console.error("[passport] archive failed", err);
                    // Its own error state, never the page-wide one: a failed
                    // archive must not blank an unrelated panel, and an
                    // unrelated failure must not accuse this one.
                    setArchiveError(pt("common.error"));
                  })
                  .finally(() => setArchiveBusy(false));
              }}
              className="mt-4 inline-flex h-11 items-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {archiveBusy ? pt("claim.archive.working") : pt("claim.archive.action")}
            </button>
          )}

          {archiveError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* A disputed entry is in front of a reviewer, so the holder cannot take
          its subject away — said here rather than left as a missing button. */}
      {claim && subject.lifecycleState === "disputed" ? (
        <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-muted-foreground">
          {pt("claim.archive.blockedDisputed")}
        </p>
      ) : null}

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
                requiresScope={correctionRequiresScope}
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
