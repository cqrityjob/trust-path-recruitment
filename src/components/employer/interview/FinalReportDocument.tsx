// The employer final report, as a DOCUMENT -- driven by the server's payload
// and nothing else.
//
// ── WHY ONE COMPONENT ───────────────────────────────────────────────────
//
// The same markup renders three things: the exact preview an owner reads
// before finalising, the current finalised report, and an earlier version
// opened from the history. If those were three renderers, they would drift,
// and "the preview equals what was finalised" would be a sentence rather than
// a property. They are one renderer over one parsed payload.
//
// ── WHY NOTHING LIVE IS READ HERE ───────────────────────────────────────
//
// A locked report is what was finalised, not what the case looks like now.
// This component receives a ReportPayload parsed from the server row and
// nothing from the live case: no live notes, no live competencies, no live
// session. Where the payload carries only Swedish -- the Väktare pack is
// authored in Swedish -- the English reader sees Swedish, marked as such,
// rather than text invented on the way to the screen.
//
// ── WHAT IT NEVER SHOWS ─────────────────────────────────────────────────
//
// No total, no ranking, no verdict, no recommendation. Every assessor's
// judgement, every one of them labelled as a human interpretation, and the
// panel's concluded prose where there is one. Disagreement is stated.

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  actorLabel,
  type EvidenceClassification,
  type FinalReportReadback,
  type ReportPayload,
  type ReportPreview,
  type ReportQuestion,
} from "@/lib/interview-intelligence/final-report";

export type DocumentMode =
  /** A preview: not finalised, exactly what would be. */
  | { readonly kind: "preview"; readonly preview: ReportPreview }
  /** The current finalised version, verified by the readback. */
  | { readonly kind: "final"; readonly readback: FinalReportReadback }
  /** An earlier, superseded version, verified by the readback. */
  | { readonly kind: "history"; readonly readback: FinalReportReadback };

const CLS_LABEL: Record<EvidenceClassification, TranslationKey> = {
  interviewer_observation: "iir.doc.cls.interviewer_observation",
  candidate_statement: "iir.doc.cls.candidate_statement",
  candidate_supplied_document: "iir.doc.cls.candidate_supplied_document",
  passport_disclosure: "iir.doc.cls.passport_disclosure",
  employer_supplied_material: "iir.doc.cls.employer_supplied_material",
  unclassified: "iir.doc.cls.unclassified",
  unattributed: "iir.doc.cls.unattributed",
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function FinalReportDocument({
  payload,
  mode,
}: {
  readonly payload: ReportPayload;
  readonly mode: DocumentMode;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";
  const pick = (svText: string | null, enText: string | null) =>
    sv ? (svText ?? enText) : (enText ?? svText);

  const role = pick(payload.advertisedRoleSv, payload.advertisedRoleEn);
  const packName = pick(payload.packNameSv, payload.packNameEn);
  const readback = mode.kind === "preview" ? null : mode.readback;
  const actor = readback ? actorLabel(readback) : null;

  // Grouped under the requirement each question is FOR, from the payload's
  // own requirement field -- never from a live competency list.
  const groups = new Map<string, { code: string; name: string; questions: ReportQuestion[] }>();
  const ungrouped: ReportQuestion[] = [];
  for (const q of payload.questions) {
    if (!q.requirement) {
      ungrouped.push(q);
      continue;
    }
    const key = q.requirement.code;
    const g = groups.get(key) ?? {
      code: key,
      name: pick(q.requirement.nameSv, q.requirement.nameEn) ?? key,
      questions: [],
    };
    g.questions.push(q);
    groups.set(key, g);
  }

  return (
    <article
      aria-labelledby="fr-title"
      data-report-mode={mode.kind}
      className="rounded-xl border border-border bg-card px-5 py-7 sm:px-9 sm:py-10"
    >
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(
            mode.kind === "preview"
              ? "iir.doc.preview.badge"
              : mode.kind === "final"
                ? "iir.doc.final.badge"
                : "iir.doc.history.badge",
          )}
        </p>
        <h2
          id="fr-title"
          className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {payload.candidate}
        </h2>
        {mode.kind === "preview" && (
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("iir.doc.preview.lede")}
          </p>
        )}
        {mode.kind === "history" && (
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("iir.doc.history.lede")}
          </p>
        )}

        {/* ---- Identity: version, date, actor. The digests that prove this
             is the version finalised live under the audit details at the
             foot of the document -- an integrity fact for an auditor, not
             report content a hiring manager reads. ---- */}
        {readback && (
          <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="sr-only">{t("iir.versions.title")}</dt>
              <dd className="font-medium text-foreground">
                {t("iir.doc.identity.version").replace("{n}", String(readback.versionNumber))}
              </dd>
            </div>
            <div>
              <dd className="text-muted-foreground">
                {t("iir.doc.identity.finalisedAt").replace("{date}", day(readback.finalisedAt))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dd className="text-muted-foreground" data-testid="fr-actor">
                {actor
                  ? t("iir.doc.identity.by").replace("{who}", actor)
                  : t("iir.doc.identity.byUnknown")}
              </dd>
            </div>
          </dl>
        )}
      </header>

      {/* ---- 1 · Recruitment ---- */}
      <Section ordinal={1} id="fr-recruitment" title={t("iir.doc.s.recruitment")}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label={t("iir.doc.recruitment.role")}>
            {role ?? (
              <span className="text-muted-foreground">{t("iir.doc.recruitment.noRole")}</span>
            )}
          </Field>
          <Field label={t("iir.doc.recruitment.internalTitle")}>
            {payload.internalTitle || "—"}
          </Field>
          <Field label={t("iir.doc.recruitment.application")}>
            <code className="font-mono text-[11px] break-all">{payload.applicationId ?? "—"}</code>
          </Field>
          <Field label={t("iir.doc.recruitment.method")}>
            {packName ?? "—"}
            {payload.packVersionNumber != null ? ` · v${payload.packVersionNumber}` : ""}
          </Field>
          <Field label={t("iir.doc.recruitment.interview")} wide>
            {payload.interview.length === 0 ? (
              <span className="text-muted-foreground">{t("iir.doc.recruitment.noInterview")}</span>
            ) : (
              <ul className="space-y-0.5">
                {payload.interview.map((s, i) => (
                  <li key={i}>
                    {day(s.completedAt ?? s.startedAt)}
                    {s.interviewerNames
                      ? ` · ${t("iir.doc.recruitment.interviewers")}: ${s.interviewerNames}`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </dl>
      </Section>

      {/* ---- 2 · Assessment material, with the bound result ---- */}
      <Section ordinal={2} id="fr-assessment" title={t("iir.doc.s.assessmentMaterial")}>
        {payload.assessmentMaterial.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("iir.doc.assessment.none")}</p>
        ) : (
          <ul className="space-y-4">
            {payload.assessmentMaterial.map((m) => (
              <li
                key={m.attemptId}
                className="rounded-lg border border-border bg-muted/20 p-3.5 text-sm"
              >
                <p className="font-medium text-foreground">
                  {t("iir.doc.assessment.attempt")}{" "}
                  <code className="font-mono text-[11px]">{m.attemptId}</code> · {m.attemptStatus}
                </p>
                {m.employerReport === null ? (
                  <p className="mt-1.5 text-muted-foreground">
                    {t("iir.doc.assessment.notReleased")}
                  </p>
                ) : (
                  <div className="mt-2 space-y-2.5">
                    <p className="text-muted-foreground">
                      {t("iir.doc.assessment.bound")
                        .replace("{id}", m.employerReport.snapshotId)
                        .replace("{date}", day(m.employerReport.releasedAt))}
                    </p>
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th scope="col" className="pr-4 font-medium">
                            {t("iir.doc.assessment.competency")}
                          </th>
                          <th scope="col" className="font-medium">
                            {t("iir.doc.assessment.maturity")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.employerReport.competencies.map((c) => (
                          <tr key={c.competencyCode}>
                            <td className="pr-4 align-top">{c.competencyCode}</td>
                            <td className="align-top">{c.maturityLevel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {m.employerReport.findings.length > 0 && (
                      <div>
                        <p className="font-medium text-foreground">
                          {t("iir.doc.assessment.findings")}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {m.employerReport.findings.map((f, i) => (
                            <li key={i} className="text-foreground">
                              {f.finding}
                              {f.observedAt ? ` (${day(f.observedAt)})` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(sv ? m.employerReport.limitationsSv : m.employerReport.limitationsEn).length >
                      0 && (
                      <div>
                        <p className="font-medium text-foreground">
                          {t("iir.doc.assessment.limitations")}
                        </p>
                        <ul className="mt-1 space-y-1 text-muted-foreground">
                          {(sv
                            ? m.employerReport.limitationsSv
                            : m.employerReport.limitationsEn
                          ).map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---- 3 · Confirmed evidence per requirement ---- */}
      <Section ordinal={3} id="fr-evidence" title={t("iir.doc.s.evidence")}>
        <div className="space-y-6">
          {[...groups.values()].map((g) => (
            <section key={g.code} aria-label={g.name}>
              <h4 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                  {g.code}
                </span>
                {g.name}
              </h4>
              <ol className="mt-2 space-y-4">
                {g.questions.map((q) => (
                  <li key={q.id}>
                    <QuestionEvidence q={q} pick={pick} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {ungrouped.length > 0 && (
            <ol className="space-y-4">
              {ungrouped.map((q) => (
                <li key={q.id}>
                  <QuestionEvidence q={q} pick={pick} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>

      {/* ---- 4 · Every assessor, per requirement ---- */}
      <Section
        ordinal={4}
        id="fr-assessments"
        title={t("iir.doc.s.assessments")}
        body={t("iir.doc.assessments.body")}
      >
        <div className="space-y-5">
          {payload.questions.map((q) => (
            <div key={q.id} className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{q.code}</span>
                <span className="font-medium text-foreground">
                  {q.requirement
                    ? (pick(q.requirement.nameSv, q.requirement.nameEn) ?? q.requirement.code)
                    : ""}
                </span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("iir.doc.assessment.assessors").replace("{n}", String(q.assessorCount))}
                </span>
                {q.assessorCount > 1 && (
                  <span
                    data-testid={q.levelsAgree ? "fr-agree" : "fr-disagree"}
                    className={
                      q.levelsAgree
                        ? "text-xs uppercase tracking-wide text-muted-foreground"
                        : "rounded border border-amber-600/50 px-1.5 text-xs font-medium uppercase tracking-wide text-foreground"
                    }
                  >
                    {t(q.levelsAgree ? "iir.doc.assessment.agree" : "iir.doc.assessment.disagree")}
                  </span>
                )}
              </div>
              {q.assessments.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("iir.doc.assessment.none.q")}
                </p>
              ) : (
                <ul className="mt-2.5 space-y-3">
                  {q.assessments.map((a) => (
                    <li key={a.id} className="border-l-2 border-border pl-3 text-sm">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-foreground">
                          {t("iiu.ev.level")} {a.level}
                          {pick(a.levelMeaningSv, a.levelMeaningEn)
                            ? ` — ${pick(a.levelMeaningSv, a.levelMeaningEn)}`
                            : ""}
                        </span>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {t("iir.doc.assessment.interpretation")}
                        </span>
                      </p>
                      <p className="mt-1 leading-relaxed text-foreground">{a.rationale}</p>
                      {a.uncertainty && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          <span className="font-medium">{t("iiu.ev.uncertainty")}</span>{" "}
                          {a.uncertainty}
                        </p>
                      )}
                      {pick(a.anchorSv, a.anchorEn) && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          <span className="font-medium">{t("iiu.ev.ankare")}</span>{" "}
                          {pick(a.anchorSv, a.anchorEn)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-border p-3.5 text-sm">
          <p className="font-medium text-foreground">{t("iir.doc.panel.title")}</p>
          {payload.panel === null ? (
            <p className="mt-1 text-muted-foreground">{t("iir.doc.panel.none")}</p>
          ) : payload.panel.state !== "concluded" || !payload.panel.conclusion ? (
            <p className="mt-1 text-muted-foreground">{t("iir.doc.panel.notConcluded")}</p>
          ) : (
            <p className="mt-1 whitespace-pre-line leading-relaxed text-foreground">
              {payload.panel.conclusion}
            </p>
          )}
        </div>
      </Section>

      {/* ---- 5 · Missing or contradictory ---- */}
      <Section ordinal={5} id="fr-unresolved" title={t("iir.doc.s.unresolved")}>
        {payload.unresolved.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("iir.doc.unresolved.none")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {payload.unresolved.map((u) => (
              <li key={u.id} className="leading-relaxed">
                <span className="mr-2 rounded border border-border px-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                  {u.kind}
                </span>
                <span className="text-foreground">{u.statement}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---- The boundary, and the AI's role ----
           The employment decision is a stated boundary, never a control. */}
      <section aria-labelledby="d-decision" className="mt-9 border-t border-border pt-6">
        <h3 id="d-decision" className="text-base font-semibold text-foreground">
          {t("iiu.rp.s.decision")}
        </h3>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-foreground">
          {t("iiu.rp.decision.boundary")}
        </p>
        {payload.decisionBoundary && (
          <p className="mt-2 max-w-[70ch] border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
            {payload.decisionBoundary}
          </p>
        )}
      </section>
      <section aria-labelledby="d-ai" className="mt-7 border-t border-border pt-6">
        <h3 id="d-ai" className="text-base font-semibold text-foreground">
          {t("iir.doc.s.ai")}
        </h3>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          {payload.aiStatement ?? ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("iir.doc.ai.runs").replace("{n}", String(payload.aiRuns))}
        </p>
      </section>

      {/* ---- Audit: the digests ----
           Everything above is what an employer reads. Nothing is deleted
           here; the checksums that prove WHICH version was finalised, and
           that its content and its basis are the ones recorded, sit where an
           auditor looks for them. */}
      <details className="mt-7 border-t border-border pt-5" data-testid="fr-audit">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          {t("iir.doc.audit.title")}
        </summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("iir.doc.identity.basis")}</dt>
            <dd
              className="break-all font-mono text-[11px] text-foreground"
              data-testid="fr-basis-hash"
            >
              {mode.kind === "preview" ? mode.preview.basisHash : (readback?.basisHash ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("iir.doc.identity.content").replace(
                "{algo}",
                mode.kind === "preview" ? "sha256" : (readback?.contentHashAlgorithm ?? "sha256"),
              )}
            </dt>
            <dd
              className="break-all font-mono text-[11px] text-foreground"
              data-testid="fr-content-hash"
            >
              {mode.kind === "preview" ? mode.preview.contentHash : (readback?.contentHash ?? "—")}
            </dd>
          </div>
          {payload.assessmentMaterial
            .filter((m) => m.employerReport !== null)
            .map((m) => (
              <div key={m.attemptId}>
                <dt className="text-muted-foreground">
                  {t("iir.doc.assessment.hash")} ·{" "}
                  <code className="font-mono text-[11px]">{m.attemptId}</code>
                </dt>
                <dd className="break-all font-mono text-[11px] text-foreground">
                  {m.employerReport?.snapshotHash}
                </dd>
              </div>
            ))}
        </dl>
      </details>
    </article>
  );
}

function QuestionEvidence({
  q,
  pick,
}: {
  q: ReportQuestion;
  pick: (a: string | null, b: string | null) => string | null;
}) {
  const { t } = useT();
  return (
    <>
      <p className="text-sm font-medium leading-relaxed text-foreground">
        <span className="mr-2 font-mono text-xs text-muted-foreground">{q.code}</span>
        {pick(q.promptSv, q.promptEn)}
      </p>
      {q.evidence.length === 0 ? (
        <p className="mt-1.5 text-sm italic text-muted-foreground">{t("iir.doc.evidence.none")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {q.evidence.map((e) => (
            <li
              key={e.id}
              className="border-l-2 border-teal-700/40 pl-4 text-sm leading-relaxed text-foreground"
            >
              <span
                data-testid={`fr-cls-${e.classification}`}
                className="mr-2 rounded border border-border px-1.5 text-xs uppercase tracking-wide text-muted-foreground"
              >
                {t(CLS_LABEL[e.classification])}
              </span>
              {e.excerpt}
              {e.wasCorrected && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("iir.doc.evidence.corrected")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Section({
  ordinal,
  id,
  title,
  body,
  children,
}: {
  ordinal: number;
  id: string;
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-9 border-t border-border pt-6 first:border-t-0">
      <h3 id={id} className="flex items-baseline gap-2.5 text-base font-semibold text-foreground">
        <span aria-hidden="true" className="text-sm tabular-nums text-muted-foreground">
          {ordinal}.
        </span>
        {title}
      </h3>
      {body && (
        <p className="mt-1.5 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
