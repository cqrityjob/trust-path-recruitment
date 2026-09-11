// The employer final report — the sequence, the boundary, and the readback.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────
//
// The employer final report is the CANONICAL output of this process. Before
// this panel existed the report page could tell a recruitment owner whether
// the report was final, but not:
//
//   * where they were in the work, or what the ONE next thing was;
//   * what finalising would and would not do — in particular that it shares
//     nothing with the candidate, which is the question a person about to
//     press an irreversible button actually has;
//   * whether the finalised report they are looking at is INTACT, or merely
//     a row that says it is;
//   * that a correction made a new version and left the previous one alone.
//
// ── WHY THE READBACK IS NOT A TABLE SELECT ──────────────────────────────
//
// scp_iv_final_report recomputes the digest from the stored basis and returns
// the verdict beside the stored hash. A report whose integrity nobody ever
// checks is a claim, not a proof. So `verified` is the ONLY state rendered as
// a finalised report; a mismatch gets its own alert and says plainly that it
// must not be used as decision support until somebody has looked.
//
// A refused read and a broken read are told apart and neither is rendered as
// "no report exists" — the failure mode this whole codebase keeps closing.

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  FINALISE_EFFECTS,
  FINALISE_NON_EFFECTS,
  REPORT_STEPS,
  reportSteps,
  type ReadbackOutcome,
  type ReportProgress,
  type ReportStep,
  type StepState,
} from "@/lib/interview-intelligence/final-report";
import type { ReportVersion } from "@/lib/interview-intelligence/runtime.functions";

const STEP_LABEL: Record<ReportStep, TranslationKey> = {
  reviewAssessmentMaterial: "iir.seq.reviewAssessmentMaterial",
  reviewEvidence: "iir.seq.reviewEvidence",
  resolveOutstanding: "iir.seq.resolveOutstanding",
  confirmBasis: "iir.seq.confirmBasis",
  previewReport: "iir.seq.previewReport",
  finalise: "iir.seq.finalise",
  readback: "iir.seq.readback",
};

const STATE_LABEL: Record<StepState, TranslationKey> = {
  done: "iir.seq.state.done",
  current: "iir.seq.state.current",
  ahead: "iir.seq.state.ahead",
  notPermitted: "iir.seq.state.notPermitted",
};

/**
 * The seven acts, with one current.
 *
 * Every step names its own state IN WORDS as well as by weight. A ladder whose
 * current rung is only a different shade is unusable to a colour-blind reader
 * and invisible to a screen reader.
 */
export function ReportSequence({ progress }: { readonly progress: ReportProgress }) {
  const { t } = useT();
  const views = reportSteps(progress);
  return (
    <section aria-labelledby="iir-seq" className="rounded-lg border border-border bg-card p-4">
      <h3 id="iir-seq" className="text-base font-semibold text-foreground">
        {t("iir.seq.title")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("iir.seq.lede")}</p>
      <ol className="mt-3 space-y-1.5">
        {views.map((v, i) => (
          <li
            key={v.step}
            aria-current={v.state === "current" ? "step" : undefined}
            className={
              v.state === "current"
                ? "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-sm font-medium text-foreground"
                : "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2.5 py-1 text-sm text-muted-foreground"
            }
          >
            <span className="tabular-nums">{i + 1}.</span>
            <span>{t(STEP_LABEL[v.step])}</span>
            <span className="text-xs uppercase tracking-wide">— {t(STATE_LABEL[v.state])}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * What the irreversible act does, and what it does not.
 *
 * Both halves, at the point of decision. The withheld half names the candidate
 * explicitly: a recruitment owner left to infer whether finalising sends
 * anything to the person they just interviewed will guess, and half of them
 * will guess wrong.
 */
export function FinaliseBoundary() {
  const { t } = useT();
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-border bg-card p-3">
        <h4 className="text-sm font-semibold text-foreground">{t("iir.effects.title")}</h4>
        <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
          {FINALISE_EFFECTS.map((e) => (
            <li key={e}>{t(`iir.effects.${e}` as TranslationKey)}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <h4 className="text-sm font-semibold text-foreground">{t("iir.noneffects.title")}</h4>
        <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
          {FINALISE_NON_EFFECTS.map((e) => (
            <li key={e}>{t(`iir.noneffects.${e}` as TranslationKey)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The finalised report, read back through its own contract.
 *
 * Six states, five of which are not "here is your report". The one that is —
 * `verified` — is reached only when the server recomputed the digest and it
 * matched. Everything else says what is true instead.
 */
export function FinalReportReadbackPanel({
  outcome,
  onRetry,
}: {
  readonly outcome: ReadbackOutcome;
  readonly onRetry: () => void;
}) {
  const { t } = useT();

  if (outcome.kind === "idle" || outcome.kind === "loading") {
    return (
      <section
        aria-labelledby="iir-rb"
        className="mt-4 rounded-lg border border-border bg-card p-4"
      >
        <h3 id="iir-rb" className="text-base font-semibold text-foreground">
          {t("iir.readback.title")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("iir.readback.loading")}</p>
      </section>
    );
  }

  // A refusal and a breakage are DIFFERENT, and neither one is "none".
  if (outcome.kind === "refused" || outcome.kind === "failed") {
    const refused = outcome.kind === "refused";
    return (
      <section
        aria-labelledby="iir-rb"
        role="alert"
        className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      >
        <h3 id="iir-rb" className="text-base font-semibold text-foreground">
          {t(refused ? "iir.readback.refusedTitle" : "iir.readback.failedTitle")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(refused ? "iir.readback.refused" : "iir.readback.failed")}
        </p>
        {!refused && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("iir.readback.retry")}
          </button>
        )}
      </section>
    );
  }

  if (outcome.kind === "none") {
    return (
      <section
        aria-labelledby="iir-rb"
        className="mt-4 rounded-lg border border-border bg-card p-4"
      >
        <h3 id="iir-rb" className="text-base font-semibold text-foreground">
          {t("iir.readback.title")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("iir.readback.none")}</p>
      </section>
    );
  }

  const r = outcome.report;
  const verified = outcome.kind === "verified";

  return (
    <section
      aria-labelledby="iir-rb"
      className={
        verified
          ? "mt-4 rounded-lg border border-border bg-card p-4"
          : "mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      }
    >
      <h3 id="iir-rb" className="text-base font-semibold text-foreground">
        {verified ? t("iir.readback.title") : t("iir.readback.notVerifiedTitle")}
      </h3>

      {!verified && (
        <p role="alert" className="mt-1 text-sm text-foreground">
          {t("iir.readback.notVerified")}
        </p>
      )}

      <dl className="mt-2.5 space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">
            {t("iir.readback.version").replace("{n}", String(r.versionNumber))}
          </dt>
        </div>
        {r.finalisedAt && (
          <div className="flex flex-wrap gap-x-2">
            <dd className="text-muted-foreground">
              {t("iir.readback.finalisedAt").replace("{date}", r.finalisedAt.slice(0, 10))}
            </dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-2">
          <dd className="text-muted-foreground" data-testid="rb-actor">
            {r.finalisedByName?.trim() || r.finalisedByEmail?.trim()
              ? t("iir.readback.actor").replace(
                  "{who}",
                  (r.finalisedByName?.trim() || r.finalisedByEmail?.trim()) as string,
                )
              : t("iir.readback.actorUnknown")}
          </dd>
        </div>
        <div className="mt-1.5">
          <dt className="text-muted-foreground">
            {t("iir.readback.hash").replace("{algo}", r.contentHashAlgorithm)}
          </dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{r.contentHash}</dd>
        </div>
      </dl>

      {verified && (
        <p className="mt-2 text-sm text-muted-foreground">{t("iir.readback.verified")}</p>
      )}
      {r.contentHashAlgorithm === "md5" && (
        <p className="mt-1.5 text-sm text-muted-foreground">{t("iir.readback.legacyAlgo")}</p>
      )}
    </section>
  );
}

/**
 * Every finalised version, newest first.
 *
 * The point of showing it at all: a correction created version N+1 and left
 * version N exactly as it was. A reader who cannot see the previous version
 * has only this page's word for that.
 */
export function ReportVersionList({
  versions,
  showing,
  onOpen,
}: {
  readonly versions: readonly ReportVersion[];
  /** The version currently rendered, so the list can say so in words. */
  readonly showing: number | null;
  /** Open an earlier version, by report id; null returns to the current one. */
  readonly onOpen: (reportId: string | null) => void;
}) {
  const { t } = useT();
  if (versions.length === 0) return null;
  return (
    <section
      aria-labelledby="iir-vers"
      className="mt-4 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="iir-vers" className="text-base font-semibold text-foreground">
        {t("iir.versions.title")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("iir.versions.lede")}</p>
      <ul className="mt-2.5 space-y-1 text-sm">
        {versions.map((v) => (
          <li key={v.reportId} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-foreground">
              {t("iir.readback.version").replace("{n}", String(v.versionNumber))}
            </span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t(v.status === "final" ? "iir.versions.current" : "iir.versions.superseded")}
            </span>
            {v.finalisedAt && (
              <span className="text-muted-foreground">{v.finalisedAt.slice(0, 10)}</span>
            )}
            {(v.finalisedByName?.trim() || v.finalisedByEmail?.trim()) && (
              <span className="text-muted-foreground">
                · {v.finalisedByName?.trim() || v.finalisedByEmail?.trim()}
              </span>
            )}
            {showing === v.versionNumber ? (
              <span
                className="text-xs uppercase tracking-wide text-muted-foreground"
                aria-current="true"
              >
                {t("iir.versions.showing").replace("{n}", String(v.versionNumber))}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(v.status === "final" ? null : v.reportId)}
                className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("iir.versions.open").replace("{n}", String(v.versionNumber))}
              </button>
            )}
          </li>
        ))}
      </ul>
      {versions.length === 1 && (
        <p className="mt-1.5 text-sm text-muted-foreground">{t("iir.versions.only")}</p>
      )}
    </section>
  );
}
