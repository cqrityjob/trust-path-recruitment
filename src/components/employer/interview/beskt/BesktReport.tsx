// The BESKT interview report.
//
// ── WHAT THIS DOCUMENT IS ───────────────────────────────────────────────
//
// A frozen rendering of what humans recorded, bound by hash to the method
// version they used, the answers the candidate submitted and the notice the
// candidate read. It is professional decision support. The accountable human
// remains the decision-maker, and the document says so on its own face
// rather than leaving it to a policy page.
//
// ── THE FOUR KINDS OF CLAIM, KEPT APART ─────────────────────────────────
//
// The whole point of the method is that these are different things, so they
// are different sections with different headings and never merged into a
// narrative:
//
//   what the candidate stated       — their own frozen words, before the interview
//   what an interviewer observed    — per assessor, never averaged
//   what verification established   — including what it did NOT establish
//   what the panel resolved         — its reasoning, not merely its outcome
//
// ── WHAT IS FORBIDDEN HERE, STRUCTURALLY ────────────────────────────────
//
// No score, credibility percentage, truthfulness rating, suitability verdict,
// pass/fail, risk ranking or automatic recommendation. There is nowhere in
// the payload to store one and nothing in this file computes one: the only
// derived values it renders are the LIMITATIONS — the themes nobody
// documented, the verification still open, the differences the panel has not
// spoken to. Those report what is not known. A score would compress it.
//
// ── PRINTING ────────────────────────────────────────────────────────────
//
// The document prints from the browser. `print:` utilities drop the chrome
// and force the ink to black on white, because a report that is read on
// paper in a decision meeting must be legible on paper.

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { BUTTON, Chip, Panel, PRIMARY_BUTTON } from "@/components/employer/interview/InterviewUi";
import { Digest, Fact, TOUCH, VerificationChip, governedText } from "./BesktConductUi";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  besktReportLimitations,
  readBesktReportPayload,
  type BesktReportDocumentData,
  type BesktReportEntry,
  type BesktReportPosition,
} from "@/lib/beskt/report-payload";
import type {
  BesktReportBlocker,
  BesktReportPreview,
  BesktFinalisedReport,
  BesktReportVersion,
  BesktVerificationState,
} from "@/lib/beskt/interview-conduct.functions";

/**
 * Every blocker the database can raise, with OUR sentence for it.
 *
 * The database's own message names counts and is written for an operator.
 * Showing it would put schema vocabulary in front of a recruiter, which is
 * the rule this domain already follows everywhere else.
 */
const BLOCKER_LABEL: Record<string, TranslationKey> = {
  BCP_CONDUCT_NO_POSITION: "beskt.error.reportNoPosition",
  BCP_CONDUCT_POSITION_OPEN: "beskt.error.reportPositionOpen",
  BCP_CONDUCT_NOTHING_DOCUMENTED: "beskt.error.reportNothingDocumented",
  BCP_CONDUCT_PANEL_REQUIRED: "beskt.error.reportPanelRequired",
  BCP_CONDUCT_PANEL_NOT_REVEALED: "beskt.error.conductPanelNotRevealed",
  BCP_CONDUCT_RESOLUTION_MISSING: "beskt.error.reportResolutionMissing",
  BCP_CONDUCT_SESSION_NOT_FOUND: "beskt.error.conductSessionNotFound",
  BCP_CONDUCT_STANCE_MISSING: "beskt.error.reportStanceMissing",
};

const RESPONSE_STATE_LABEL: Record<string, TranslationKey> = {
  answered: "beskt.conduct.snapshot.state.answered",
  omitted: "beskt.conduct.snapshot.state.omitted",
  discuss_orally: "beskt.conduct.snapshot.state.discuss_orally",
};

const POSITION_ROLE_LABEL: Record<string, TranslationKey> = {
  assessor: "beskt.conduct.role.assessor",
  responsible_owner: "beskt.conduct.role.responsible_owner",
};

const RESOLUTION_LABEL: Record<string, TranslationKey> = {
  agreed: "beskt.conduct.panel.resolution.kind.agreed",
  disagreed: "beskt.conduct.panel.resolution.kind.disagreed",
};

/** A short, stable rendering of an actor id. Never a name we do not hold. */
function ActorId({ id }: { id: string | null }) {
  const { t } = useT();
  if (id === null) return <>{t("beskt.report.unknownActor")}</>;
  return <code className="font-mono text-xs">{id}</code>;
}

function Stamp({ iso }: { iso: string | null }) {
  if (iso === null) return <>—</>;
  return <>{iso.slice(0, 16).replace("T", " ")}</>;
}

/** One labelled paragraph. Renders nothing when the field was left empty. */
function Claim({ label, value }: { label: string; value: string | null }) {
  if (value === null || value.trim() === "") return null;
  return (
    <div className="mt-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The document itself.
// ---------------------------------------------------------------------------

function CandidateStatements({ d }: { d: BesktReportDocumentData }) {
  const { t, lang } = useT();
  return (
    <section className="mt-6" aria-labelledby="beskt-report-candidate-h">
      <h3 id="beskt-report-candidate-h" className="text-base font-semibold text-foreground">
        {t("beskt.report.candidate.heading")}
      </h3>
      <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.report.candidate.lede")}
      </p>
      {d.candidatePreparation.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.report.candidate.empty")}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {d.candidatePreparation.map((a) => {
            const stateKey = a.responseState ? RESPONSE_STATE_LABEL[a.responseState] : undefined;
            return (
              <li
                key={a.itemKey}
                data-testid={`beskt-report-answer-${a.itemKey}`}
                className="rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 max-w-[72ch] text-sm font-medium text-foreground">
                    {governedText(lang, a.wordingSv, a.wordingEn)}
                  </p>
                  <Chip tone="neutral" srPrefix={t("beskt.report.candidate.stateLabel")}>
                    {stateKey ? t(stateKey) : (a.responseState ?? "—")}
                  </Chip>
                </div>
                <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
                  {governedText(lang, a.purposeSv, a.purposeEn)}
                </p>
                {a.responseState === "answered" && (
                  <dl>
                    <Claim
                      label={t("beskt.report.candidate.answer")}
                      value={
                        a.valueText ??
                        a.valueDate ??
                        (a.valueBoolean === null
                          ? a.selectedOptionKeys.join(", ") || null
                          : a.valueBoolean
                            ? t("beskt.report.candidate.yes")
                            : t("beskt.report.candidate.no"))
                      }
                    />
                  </dl>
                )}
                {a.responseState !== "answered" && (
                  <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
                    {t("beskt.report.candidate.notAnAdverseFinding")}
                  </p>
                )}
                <p className="mt-2 font-mono text-xs text-muted-foreground">{a.itemKey}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function EntryBlock({ entry }: { entry: BesktReportEntry }) {
  const { t } = useT();
  return (
    <li
      data-testid={`beskt-report-entry-${entry.itemKey}`}
      className="rounded-md border border-border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-foreground">{entry.itemKey}</span>
        <VerificationChip
          state={(entry.verificationState ?? "not_required") as BesktVerificationState}
        />
        <span className="text-xs text-muted-foreground">
          {t("beskt.conduct.entry.version")} {entry.entryVersion ?? "—"}
        </span>
        <span className="text-xs text-muted-foreground">
          <Stamp iso={entry.recordedAt} />
        </span>
      </div>

      <dl>
        <Claim label={t("beskt.conduct.entry.observableFact")} value={entry.observableFact} />
        <Claim
          label={t("beskt.conduct.entry.candidateExplanation")}
          value={entry.candidateExplanation}
        />
        <Claim
          label={t("beskt.conduct.entry.interviewerInterpretation")}
          value={entry.interviewerInterpretation}
        />
        <Claim
          label={t("beskt.conduct.entry.alternativeExplanation")}
          value={entry.alternativeExplanation}
        />
        <Claim label={t("beskt.conduct.entry.protectiveFactor")} value={entry.protectiveFactor} />
        <Claim label={t("beskt.fakta.eventTiming")} value={entry.eventTiming} />
        <Claim label={t("beskt.fakta.consequence")} value={entry.consequence} />
        <Claim label={t("beskt.fakta.supportingInformation")} value={entry.supportingInformation} />
        <Claim
          label={t("beskt.fakta.contradictingInformation")}
          value={entry.contradictingInformation}
        />
        <Claim label={t("beskt.fakta.measuresTaken")} value={entry.measuresTaken} />
        <Claim label={t("beskt.fakta.roleLink")} value={entry.roleLink} />
        <Claim label={t("beskt.fakta.informationGap")} value={entry.informationGap} />
        <Claim label={t("beskt.fakta.candidateResponse")} value={entry.candidateResponse} />
        <Claim label={t("beskt.conduct.entry.verificationNeed")} value={entry.verificationNeed} />
        <Claim
          label={t("beskt.conduct.entry.verificationSource")}
          value={entry.verificationSource}
        />
      </dl>

      {entry.verificationState === "not_verified" && (
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
          {t("beskt.conduct.verification.notVerifiedMeaning")}
        </p>
      )}

      {entry.verifications.length > 0 && (
        <div className="mt-3">
          <h5 className="text-xs font-medium text-muted-foreground">
            {t("beskt.report.verification.trail")}
          </h5>
          <ol className="mt-1 space-y-1">
            {entry.verifications.map((v) => (
              <li key={`${entry.entryId}-${v.seq}`} className="text-xs text-muted-foreground">
                <Stamp iso={v.recordedAt} /> · {v.previousState ?? "—"} → {v.newState ?? "—"}
                {v.source ? ` · ${v.source}` : ""}
                {v.note ? ` · ${v.note}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}

      {entry.corrections.length > 0 && (
        <div className="mt-3">
          <h5 className="text-xs font-medium text-muted-foreground">
            {t("beskt.report.corrections.heading")}
          </h5>
          <p className="mt-0.5 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
            {t("beskt.report.corrections.lede")}
          </p>
          <ol className="mt-1 space-y-2">
            {entry.corrections.map((c) => (
              <li key={c.entryId ?? `${entry.itemKey}-${c.entryVersion}`} className="text-xs">
                <p className="text-muted-foreground">
                  {t("beskt.conduct.entry.version")} {c.entryVersion ?? "—"} ·{" "}
                  <Stamp iso={c.recordedAt} />
                  {c.correctionReason ? ` · ${c.correctionReason}` : ""}
                </p>
                {c.observableFact && (
                  <p className="mt-0.5 whitespace-pre-wrap text-foreground">{c.observableFact}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function PositionBlock({ position }: { position: BesktReportPosition }) {
  const { t } = useT();
  const roleKey = position.positionRole ? POSITION_ROLE_LABEL[position.positionRole] : undefined;
  return (
    <section
      data-testid={`beskt-report-position-${position.positionId ?? "unknown"}`}
      className="mt-4 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          {roleKey ? t(roleKey) : t("beskt.report.position.heading")}
        </h4>
        <Chip tone="neutral" srPrefix={t("beskt.report.position.assessor")}>
          <ActorId id={position.assessorId} />
        </Chip>
        <span className="text-xs text-muted-foreground">
          {t("beskt.report.position.lockedAt")}: <Stamp iso={position.lockedAt} />
        </span>
        {(position.reopenCount ?? 0) > 0 && (
          <Chip tone="neutral" srPrefix={t("beskt.report.position.reopened")}>
            {t("beskt.report.position.reopened")}: {position.reopenCount}
          </Chip>
        )}
      </div>

      {position.entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("beskt.report.position.empty")}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {position.entries.map((e) => (
            <EntryBlock key={e.entryId ?? e.itemKey} entry={e} />
          ))}
        </ol>
      )}

      {position.informationGaps.length > 0 && (
        <div className="mt-3">
          <h5 className="text-xs font-medium text-muted-foreground">
            {t("beskt.report.position.gaps")}
          </h5>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {position.informationGaps.join(" · ")}
          </p>
        </div>
      )}
    </section>
  );
}

function PanelBlock({ d }: { d: BesktReportDocumentData }) {
  const { t } = useT();
  return (
    <section className="mt-6" aria-labelledby="beskt-report-panel-h">
      <h3 id="beskt-report-panel-h" className="text-base font-semibold text-foreground">
        {t("beskt.report.panel.heading")}
      </h3>
      <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.report.panel.lede")}
      </p>

      {d.panel === null ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.report.panel.none")}</p>
      ) : d.panel.resolutions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("beskt.report.panel.nothingRecorded")}
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {d.panel.resolutions.map((r, i) => {
            const kindKey = r.resolutionKind ? RESOLUTION_LABEL[r.resolutionKind] : undefined;
            return (
              <li
                key={`${r.itemKey}-${i}`}
                data-testid={`beskt-report-resolution-${r.itemKey}`}
                className="rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{r.itemKey}</span>
                  <Chip tone="neutral" srPrefix={t("beskt.conduct.panel.resolution.kind")}>
                    {kindKey ? t(kindKey) : (r.resolutionKind ?? "—")}
                  </Chip>
                  <span className="text-xs text-muted-foreground">
                    <Stamp iso={r.recordedAt} />
                  </span>
                </div>
                <dl>
                  <Claim label={t("beskt.report.panel.agreed")} value={r.agreedStatement} />
                  <Claim label={t("beskt.report.panel.divergent")} value={r.divergentStatement} />
                  <Claim label={t("beskt.report.panel.rationale")} value={r.rationale} />
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * What the document does not establish.
 *
 * Placed BEFORE the evidence, not after it, because a limitation a reader
 * meets at the bottom of a long document is a limitation they have already
 * formed a view without.
 */
function LimitationsBlock({ d }: { d: BesktReportDocumentData }) {
  const { t } = useT();
  const l = besktReportLimitations(d);
  const allRows: Array<{ key: string; label: TranslationKey; items: readonly string[] }> = [
    { key: "undocumented", label: "beskt.report.limits.undocumented", items: l.undocumentedThemes },
    { key: "awaiting", label: "beskt.report.limits.awaiting", items: l.awaitingVerification },
    { key: "unresolved", label: "beskt.report.limits.unresolved", items: l.unresolvedVerification },
    {
      key: "differences",
      label: "beskt.report.limits.differences",
      items: l.unresolvedDifferences,
    },
  ];
  const rows = allRows.filter((r) => r.items.length > 0);

  return (
    <section
      data-testid="beskt-report-limitations"
      className="mt-6 rounded-lg border border-border bg-muted/20 p-4 print:bg-transparent"
      aria-labelledby="beskt-report-limits-h"
    >
      <h3 id="beskt-report-limits-h" className="text-base font-semibold text-foreground">
        {t("beskt.report.limits.heading")}
      </h3>
      <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.report.limits.lede")}
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.report.limits.none")}</p>
      ) : (
        <dl className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.key}>
              <dt className="text-xs font-medium text-muted-foreground">{t(r.label)}</dt>
              <dd className="mt-0.5 font-mono text-xs text-foreground">{r.items.join(" · ")}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** The provenance block: what this document rests on, in hashes. */
function ProvenanceBlock({
  d,
  contentHash,
  basisHash,
}: {
  d: BesktReportDocumentData;
  contentHash: string | null;
  basisHash: string | null;
}) {
  const { t, lang } = useT();
  return (
    <section
      data-testid="beskt-report-provenance"
      className="mt-6 rounded-lg border border-border p-4"
      aria-labelledby="beskt-report-prov-h"
    >
      <h3 id="beskt-report-prov-h" className="text-base font-semibold text-foreground">
        {t("beskt.report.provenance.heading")}
      </h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Fact label={t("beskt.report.provenance.method")}>
          {governedText(lang, d.bound.methodNameSv, d.bound.methodNameEn) ||
            (d.bound.packSlug ?? "—")}
        </Fact>
        <Fact label={t("beskt.report.provenance.version")}>{d.bound.versionNumber ?? "—"}</Fact>
        <Fact label={t("beskt.report.provenance.mode")}>{d.bound.mode ?? "—"}</Fact>
        <Fact label={t("beskt.report.provenance.validationLabel")}>
          {d.bound.validationLabel ?? "—"}
        </Fact>
        <Fact label={t("beskt.report.provenance.noticeVersion")}>
          {d.bound.noticeVersion ?? "—"}
        </Fact>
        <Fact label={t("beskt.report.provenance.responseVersion")}>
          {d.bound.responseVersion ?? "—"}
        </Fact>
      </dl>
      <dl className="mt-3 space-y-3">
        <Fact label={t("beskt.report.provenance.methodHash")}>
          <Digest value={d.bound.contentHash ?? "—"} />
        </Fact>
        <Fact label={t("beskt.report.provenance.answersHash")}>
          <Digest value={d.bound.answersContentHash ?? "—"} />
        </Fact>
        {basisHash && (
          <Fact label={t("beskt.report.provenance.basisHash")}>
            <Digest value={basisHash} />
          </Fact>
        )}
        {contentHash && (
          <Fact label={t("beskt.report.provenance.documentHash")}>
            <Digest value={contentHash} />
          </Fact>
        )}
      </dl>
    </section>
  );
}

/** The whole document, used identically by the preview and by the readback. */
export function BesktReportDocument({
  payload,
  contentHash,
  basisHash,
  finalisedBy,
  finalisedAt,
  versionNumber,
  draft,
}: {
  payload: unknown;
  contentHash: string | null;
  basisHash: string | null;
  finalisedBy?: string | null;
  finalisedAt?: string | null;
  versionNumber?: number | null;
  /** A preview is watermarked as a draft so a printout cannot be mistaken. */
  draft: boolean;
}) {
  const { t, lang } = useT();
  const d = readBesktReportPayload(payload);

  return (
    <article
      data-testid="beskt-report-document"
      className="rounded-lg border border-border p-4 print:border-0 print:p-0"
      aria-labelledby="beskt-report-doc-h"
    >
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="beskt-report-doc-h" className="text-lg font-semibold text-foreground">
            {t("beskt.report.document.heading")}
          </h2>
          {draft ? (
            <Chip tone="attention">{t("beskt.report.document.draftChip")}</Chip>
          ) : (
            <Chip tone="confirmed">
              {t("beskt.report.document.finalChip")}
              {versionNumber ? ` · ${versionNumber}` : ""}
            </Chip>
          )}
        </div>
        <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
          {d.case.candidateDisplayName ?? t("beskt.report.unknownCandidate")}
          {d.case.title ? ` · ${d.case.title}` : ""}
        </p>
        {!draft && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("beskt.report.document.finalisedBy")}: <ActorId id={finalisedBy ?? null} /> ·{" "}
            <Stamp iso={finalisedAt ?? null} />
          </p>
        )}
      </header>

      {/* The claim the document makes about itself, before anything else. */}
      <div className="mt-4">
        <Panel tone="neutral" title={t("beskt.report.notADecision.title")}>
          <p>{t("beskt.report.notADecision.body")}</p>
          <p className="mt-2">{t("beskt.report.notADecision.noScore")}</p>
        </Panel>
      </div>

      <AssignmentBlock d={d} />
      <LimitationsBlock d={d} />
      <ProvenanceBlock d={d} contentHash={contentHash} basisHash={basisHash} />
      <CandidateStatements d={d} />

      <section className="mt-6" aria-labelledby="beskt-report-positions-h">
        <h3 id="beskt-report-positions-h" className="text-base font-semibold text-foreground">
          {t("beskt.report.positions.heading")}
        </h3>
        <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
          {t("beskt.report.positions.lede")}
        </p>
        {d.positions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("beskt.report.positions.empty")}</p>
        ) : (
          d.positions.map((p) => <PositionBlock key={p.positionId ?? ""} position={p} />)
        )}
      </section>

      <PanelBlock d={d} />
      <StanceBlock d={d} />

      <section className="mt-6" aria-labelledby="beskt-report-themes-h">
        <h3 id="beskt-report-themes-h" className="text-base font-semibold text-foreground">
          {t("beskt.report.themes.heading")}
        </h3>
        <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
          {t("beskt.report.themes.lede")}
        </p>
        {d.themes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("beskt.report.themes.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.themes.map((th) => (
              <li key={th.itemKey} className="rounded-md border border-border p-3">
                <p className="max-w-[72ch] text-sm text-foreground">
                  {governedText(lang, th.wordingSv, th.wordingEn)}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{th.itemKey}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-labelledby="beskt-report-audit-h">
        <h3 id="beskt-report-audit-h" className="text-base font-semibold text-foreground">
          {t("beskt.report.audit.heading")}
        </h3>
        <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
          {t("beskt.report.audit.lede")}
        </p>
        <ol className="mt-3 space-y-1">
          {d.auditEvents.map((e, i) => (
            <li key={`${e.event}-${i}`} className="text-xs text-muted-foreground">
              <Stamp iso={e.recordedAt} /> · {e.event ?? "—"} · <ActorId id={e.actorId} />
              {e.reason ? ` · ${e.reason}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

// ---------------------------------------------------------------------------
// §6 points 2-3 and 6-8: the assignment and its people, the candidate's own
// later corrections, the sufficiency of the basis, the responsible human's
// stance and the follow-up. All from the frozen basis; none of it computed.
// ---------------------------------------------------------------------------

function AssignmentBlock({ d }: { d: ReturnType<typeof readBesktReportPayload> }) {
  const { t, lang } = useT();
  const a = d.assignment;
  if (!a) return null;
  return (
    <section
      className="mt-6"
      aria-labelledby="beskt-report-assignment-h"
      data-testid="beskt-report-assignment"
    >
      <h3 id="beskt-report-assignment-h" className="text-base font-semibold text-foreground">
        {t("beskt.report.assignment.heading")}
      </h3>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("beskt.invitation.purpose")}</dt>
          <dd data-testid="beskt-report-purpose">
            {t(
              a.purpose === "security_vetting"
                ? "beskt.purpose.securityVetting"
                : "beskt.purpose.recruitment",
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("beskt.invitation.role")}</dt>
          <dd>{a.roleTitle ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {t("beskt.report.assignment.interviewer")}
          </dt>
          <dd>{a.responsibleInterviewer ?? "—"}</dd>
        </div>
        {a.securityOwner ? (
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("beskt.startDialog.securityOwner")}
            </dt>
            <dd>{a.securityOwner}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">{t("beskt.workspace.exposure")}</dt>
          <dd>
            {(lang === "sv" ? a.exposureDutiesSv : (a.exposureDutiesEn ?? a.exposureDutiesSv)) ??
              "—"}
          </dd>
        </div>
        {a.roleSecurityAttestation ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t("beskt.workspace.attestation")}</dt>
            <dd>{a.roleSecurityAttestation}</dd>
          </div>
        ) : null}
        {a.lawfulBasisStatement ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t("beskt.startDialog.lawfulBasis")}</dt>
            <dd>{a.lawfulBasisStatement}</dd>
          </div>
        ) : null}
      </dl>
      <h4 className="mt-4 text-sm font-semibold">{t("beskt.report.assignment.conduct")}</h4>
      <ul className="mt-1 space-y-0.5 text-sm" data-testid="beskt-report-participants">
        {d.participants.map((x, i) => (
          <li key={i}>
            {x.name ?? "—"} ·{" "}
            {t(
              x.positionRole === "responsible_owner"
                ? "beskt.report.assignment.owner"
                : "beskt.report.assignment.assessor",
            )}
            {x.lockedAt ? (
              <>
                {" "}
                · {t("beskt.report.assignment.locked")} <Stamp iso={x.lockedAt} />
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {d.supplements.length > 0 ? (
        <>
          <h4 className="mt-4 text-sm font-semibold">{t("beskt.supplement.employerHeading")}</h4>
          <ul className="mt-1 space-y-1 text-sm" data-testid="beskt-report-supplements">
            {d.supplements.map((x, i) => (
              <li key={i} className="rounded-md border border-border p-2">
                <span className="text-xs text-muted-foreground">
                  {t(
                    x.kind === "correction"
                      ? "beskt.supplement.correction"
                      : "beskt.supplement.addition",
                  )}
                  {x.itemKey ? ` · ${x.itemKey}` : ""} · <Stamp iso={x.submittedAt} />
                </span>
                <p className="mt-0.5 whitespace-pre-wrap">{x.body}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function StanceBlock({ d }: { d: ReturnType<typeof readBesktReportPayload> }) {
  const { t } = useT();
  return (
    <section
      className="mt-6"
      aria-labelledby="beskt-report-stance-h"
      data-testid="beskt-report-stance"
    >
      <h3 id="beskt-report-stance-h" className="text-base font-semibold text-foreground">
        {t("beskt.report.stance.heading")}
      </h3>
      {d.stance ? (
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t("beskt.decision.sufficiency")}</dt>
            <dd data-testid="beskt-report-sufficiency">
              {t(
                d.stance.sufficiency === "sufficient"
                  ? "beskt.decision.sufficient"
                  : "beskt.decision.moreInformation",
              )}{" "}
              — {d.stance.sufficiencyReason}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("beskt.decision.stance")}</dt>
            <dd className="whitespace-pre-wrap">{d.stance.stance}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("beskt.decision.rationale")}</dt>
            <dd className="whitespace-pre-wrap">{d.stance.rationale}</dd>
          </div>
          <p className="text-xs text-muted-foreground">
            {d.stance.decidedByName} · {d.stance.decidedRole} · <Stamp iso={d.stance.decidedAt} />
          </p>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("beskt.report.stance.none")}</p>
      )}
      <h4 className="mt-4 text-sm font-semibold">{t("beskt.decision.actions")}</h4>
      {d.actions.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("beskt.decision.noActions")}</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm" data-testid="beskt-report-actions">
          {d.actions.map((x, i) => (
            <li key={i} className="rounded-md border border-border p-2">
              <p>{x.description}</p>
              <p className="text-xs text-muted-foreground">
                {t("beskt.decision.responsible")}: {x.responsible} · {t("beskt.decision.due")}:{" "}
                {x.dueOn ?? "—"} · {t("beskt.decision.status")}:{" "}
                {x.status ? t(`beskt.decision.status.${x.status}` as TranslationKey) : "—"} ·{" "}
                {t("beskt.decision.review")}: {x.reviewOn ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The surface around the document: blockers, finalisation, history.
// ---------------------------------------------------------------------------

function Blockers({ blockers }: { blockers: readonly BesktReportBlocker[] }) {
  const { t } = useT();
  if (blockers.length === 0) return null;
  return (
    <Panel tone="attention" title={t("beskt.report.blockers.heading")}>
      <p>{t("beskt.report.blockers.lede")}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5" data-testid="beskt-report-blockers">
        {blockers.map((b) => (
          <li key={b.code}>
            {BLOCKER_LABEL[b.code] ? t(BLOCKER_LABEL[b.code]) : t("beskt.error.generic")}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function VersionHistory({ versions }: { versions: readonly BesktReportVersion[] }) {
  const { t } = useT();
  if (versions.length === 0) return null;
  return (
    <section
      data-testid="beskt-report-versions"
      className="rounded-lg border border-border p-4 print:hidden"
      aria-labelledby="beskt-report-versions-h"
    >
      <h3 id="beskt-report-versions-h" className="text-sm font-semibold text-foreground">
        {t("beskt.report.versions.heading")}
      </h3>
      <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.report.versions.lede")}
      </p>
      <ol className="mt-3 space-y-2">
        {versions.map((v) => (
          <li key={v.reportId} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {t("beskt.report.versions.version")} {v.versionNumber}
              </span>
              <Chip tone={v.status === "final" ? "confirmed" : "neutral"}>
                {t(
                  v.status === "final"
                    ? "beskt.report.versions.final"
                    : "beskt.report.versions.superseded",
                )}
              </Chip>
              <span className="text-xs text-muted-foreground">
                <Stamp iso={v.finalisedAt} /> · <ActorId id={v.finalisedBy} />
              </span>
            </div>
            <Digest value={v.contentHash} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface BesktReportActions {
  readonly canFinalise: boolean;
  readonly busy: boolean;
  readonly error: unknown;
  readonly finalise: (expectedBasisHash: string) => void;
}

/**
 * The report screen.
 *
 * A finalised report is shown as the document. The preview is shown beside it
 * only when the record has moved since — because that is the one case where a
 * reader needs to see both and decide whether to write a new version.
 */
export function BesktReportSection({
  preview,
  finalReport,
  versions,
  actions,
}: {
  preview: BesktReportPreview | null;
  finalReport: BesktFinalisedReport | null;
  versions: readonly BesktReportVersion[];
  actions: BesktReportActions;
}) {
  const { t } = useT();

  const finalised = finalReport?.finalised === true;
  const basisMoved =
    finalised && preview !== null && preview.basisHash !== (finalReport?.basisHash ?? null);

  return (
    <div className="space-y-4">
      <section
        className="rounded-lg border border-border p-4 print:hidden"
        aria-labelledby="beskt-report-h"
      >
        <h2 id="beskt-report-h" className="text-sm font-semibold text-foreground">
          {t("beskt.report.heading")}
        </h2>
        <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
          {t("beskt.report.lede")}
        </p>

        {preview !== null && (
          <div className="mt-3">
            <Blockers blockers={preview.blockers} />
          </div>
        )}

        {actions.error != null && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t(besktErrorKey(actions.error))}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${BUTTON} ${TOUCH}`}
            onClick={() => window.print()}
            data-testid="beskt-report-print"
          >
            {t("beskt.report.print")}
          </button>

          {preview !== null && preview.blockerCount === 0 && actions.canFinalise && (
            <button
              type="button"
              className={`${PRIMARY_BUTTON} ${TOUCH}`}
              data-testid="beskt-report-finalise"
              disabled={actions.busy}
              onClick={() => actions.finalise(preview.basisHash)}
            >
              {actions.busy
                ? t("beskt.report.finalise.working")
                : finalised
                  ? t("beskt.report.finalise.newVersion")
                  : t("beskt.report.finalise.action")}
            </button>
          )}
        </div>

        {preview !== null && preview.blockerCount === 0 && actions.canFinalise && (
          <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
            {t("beskt.report.finalise.whatSigningMeans")}
          </p>
        )}

        {!actions.canFinalise && (
          <p className="mt-3 max-w-[72ch] text-sm text-muted-foreground">
            {t("beskt.report.finalise.notPermitted")}
          </p>
        )}

        {basisMoved && (
          <div className="mt-3">
            <Panel tone="attention" title={t("beskt.report.basisMoved.title")}>
              <p>{t("beskt.report.basisMoved.body")}</p>
            </Panel>
          </div>
        )}
      </section>

      <VersionHistory versions={versions} />

      {finalised && finalReport !== null ? (
        <BesktReportDocument
          payload={finalReport.payload}
          contentHash={finalReport.contentHash}
          basisHash={finalReport.basisHash}
          finalisedBy={finalReport.finalisedBy}
          finalisedAt={finalReport.finalisedAt}
          versionNumber={finalReport.versionNumber}
          draft={false}
        />
      ) : preview !== null ? (
        <BesktReportDocument
          payload={preview.payload}
          contentHash={preview.contentHash}
          basisHash={preview.basisHash}
          draft
        />
      ) : null}
    </div>
  );
}
