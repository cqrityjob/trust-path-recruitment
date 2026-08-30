// Interview Intelligence — the employer-facing visual vocabulary.
//
// The UX blueprint gives every signal a governed meaning:
//
//   Steel blue    hierarchy and work state
//   Evidence teal CONFIRMED — something a human has stood behind
//   Amber         unresolved work waiting on a person
//   Red           a governance error or a serious process risk, and nothing else
//
// Two rules run through all of it:
//
//   1. Colour never carries meaning alone. Every state renders as words.
//   2. There is no red/green pair anywhere, because a green tick next to a
//      candidate's name is a verdict — and this product does not render
//      verdicts. Confirmed evidence is teal, and it describes the EVIDENCE,
//      not the person.

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "work" | "confirmed" | "attention" | "governance" | "ai";

const TONE: Record<Tone, string> = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  work: "border-sky-700/30 bg-sky-700/10 text-sky-900 dark:text-sky-200",
  confirmed: "border-teal-700/30 bg-teal-700/10 text-teal-900 dark:text-teal-200",
  attention: "border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  governance: "border-destructive/40 bg-destructive/10 text-destructive",
  // AI output gets its own restrained tone so a reader can tell at a glance
  // what a machine proposed and what a person confirmed.
  ai: "border-violet-700/30 bg-violet-700/10 text-violet-900 dark:text-violet-200",
};

export function Chip({
  tone = "neutral",
  children,
  srPrefix,
}: {
  tone?: Tone;
  children: ReactNode;
  srPrefix?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[tone],
      )}
    >
      {srPrefix && <span className="sr-only">{srPrefix}: </span>}
      {children}
    </span>
  );
}

export function Panel({
  tone = "neutral",
  title,
  children,
  role,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={cn("rounded-lg border p-4 text-sm", TONE[tone])}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1.5 space-y-1 leading-relaxed">{children}</div>}
    </div>
  );
}

/**
 * Every async state this feature can be in, in one place, so no screen can
 * ship without one.
 *
 * "aiUnavailable" and "aiInvalid" are separate states on purpose: one means the
 * engine could not be reached, the other means it returned something the
 * product refused. A person needs to be told which, because only one of them
 * is worth retrying.
 */
export function State({
  kind,
  message,
  children,
}: {
  kind:
    | "loading"
    | "empty"
    | "error"
    | "denied"
    | "aiRunning"
    | "aiUnavailable"
    | "aiInvalid"
    | "aiAbstained";
  message?: string;
  children?: ReactNode;
}) {
  const { t } = useT();
  if (kind === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("iiu.loading")}
      </p>
    );
  }
  if (kind === "aiRunning") {
    return (
      <Panel tone="ai" role="status" title={t("iiu.ai.running.title")}>
        <p>{t("iiu.ai.running.body")}</p>
      </Panel>
    );
  }
  if (kind === "aiUnavailable") {
    return (
      <Panel tone="attention" role="alert" title={t("iiu.ai.unavailable.title")}>
        <p>{message ?? t("iiu.ai.unavailable.body")}</p>
      </Panel>
    );
  }
  if (kind === "aiInvalid") {
    return (
      <Panel tone="governance" role="alert" title={t("iiu.ai.invalid.title")}>
        <p>{message ?? t("iiu.ai.invalid.body")}</p>
      </Panel>
    );
  }
  if (kind === "aiAbstained") {
    return (
      <Panel tone="attention" role="status" title={t("iiu.ai.abstained.title")}>
        <p>{message ?? t("iiu.ai.abstained.body")}</p>
      </Panel>
    );
  }
  if (kind === "denied") {
    return (
      <Panel tone="governance" role="alert" title={t("iiu.denied.title")}>
        <p>{t("iiu.denied.body")}</p>
      </Panel>
    );
  }
  if (kind === "error") {
    return (
      <Panel tone="governance" role="alert" title={t("iiu.error.title")}>
        <p>{message ?? t("iiu.error.body")}</p>
      </Panel>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
      {children ?? t("iiu.empty")}
    </div>
  );
}

const STATUS_LABEL: Record<string, TranslationKey> = {
  draft: "iiu.status.draft",
  sources_ready: "iiu.status.sources_ready",
  prep_generated: "iiu.status.prep_generated",
  prep_approved: "iiu.status.prep_approved",
  interview_in_progress: "iiu.status.interview_in_progress",
  interview_complete: "iiu.status.interview_complete",
  evidence_review: "iiu.status.evidence_review",
  assessed: "iiu.status.assessed",
  reported: "iiu.status.reported",
  cancelled: "iiu.status.cancelled",
};

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  sources_ready: "work",
  prep_generated: "attention",
  prep_approved: "work",
  interview_in_progress: "work",
  interview_complete: "work",
  evidence_review: "attention",
  assessed: "work",
  reported: "confirmed",
  cancelled: "governance",
};

export function CaseStatusChip({ status }: { status: string }) {
  const { t } = useT();
  return (
    <Chip tone={STATUS_TONE[status] ?? "neutral"} srPrefix={t("iiu.chip.status")}>
      {uiLabel(STATUS_LABEL, status, t)}
    </Chip>
  );
}

/**
 * The scientific-status label, kept visually apart from workflow state. A pack
 * can be perfectly usable and still be an unvalidated hypothesis, and a reader
 * must never have to infer one from the other.
 */
export function ValidationChip({ label }: { label: string | null }) {
  const { t } = useT();
  if (!label) return null;
  return (
    <Chip
      tone={label === "pilot_hypothesis" ? "attention" : "confirmed"}
      srPrefix={t("iiu.chip.validation")}
    >
      {t(
        label === "pilot_hypothesis" ? "iiu.label.pilot_hypothesis" : "iiu.label.content_validated",
      )}
    </Chip>
  );
}

/**
 * Database enum values, rendered as Swedish.
 *
 * These were reaching the screen raw — a recruiter preparing an interview saw
 * a chip reading "job_description" and another reading
 * "self_evaluation_question". The product should read like an interview
 * workspace, and an internal identifier on the page says the opposite: that the
 * customer is looking at a database.
 *
 * Unknown values fall through to the raw string rather than to an empty chip,
 * so a value added in a migration before it is added here is visible and ugly
 * rather than invisible.
 */
export const SOURCE_KIND_LABEL: Record<string, TranslationKey> = {
  job_description: "iiu.source.job_description_short",
  employer_requirements: "iiu.source.employer_requirements",
  candidate_cv: "iiu.source.candidate_cv_short",
  application_answers: "iiu.source.application_answers",
  interviewer_notes: "iiu.source.interviewer_notes",
  transcript: "iiu.source.transcript_short",
  passport_disclosure: "iiu.source.passport_disclosure",
};

export const PURPOSE_LABEL: Record<string, TranslationKey> = {
  recruitment_interview: "iiu.purpose.recruitment_interview",
};

export const PRACTICE_KIND_LABEL: Record<string, TranslationKey> = {
  checklist_item: "iiu.practice.checklist_item",
  opening_script: "iiu.practice.opening_script",
  engagement_guidance: "iiu.practice.engagement_guidance",
  listening_prompt: "iiu.practice.listening_prompt",
  probing_guidance: "iiu.practice.probing_guidance",
  closure_step: "iiu.practice.closure_step",
  self_evaluation_question: "iiu.practice.self_evaluation_question",
  warning: "iiu.practice.warning",
};

/** Look up a label, falling back to the raw value rather than to nothing.
 *
 *  The maps hold TRANSLATION KEYS, not Swedish: a screen resolves them through
 *  its own `t()` so the same enum reads correctly in either language. An
 *  unmapped value still falls through to the raw string, so a value added in a
 *  migration before it is added here is visible and ugly rather than invisible. */
export function uiLabel(
  map: Record<string, TranslationKey>,
  value: string,
  t: (key: TranslationKey) => string,
): string {
  const key = map[value];
  return key ? t(key) : value;
}

export const PEACE_LABEL: Record<string, TranslationKey> = {
  planning: "iiu.peace.planning",
  engage_explain: "iiu.practice.engage_explain",
  account: "iiu.practice.account",
  closure: "iiu.practice.closure",
  evaluation: "iiu.practice.evaluation",
};

/**
 * The level-0 rule, rendered once and reused, because it is the single easiest
 * thing in this product to get wrong on screen.
 */
export function LevelZeroNote() {
  const { t } = useT();
  return (
    <p className="text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
      {t("iiu.level0.note")}
    </p>
  );
}

/**
 * Turn a database error into something a recruiter can act on.
 *
 * The guards in this domain raise deliberately specific messages, and they are
 * written for whoever is reading the SQL: "SCP_IV_PANEL_INCOMPLETE: you have
 * assessed 0 of 8 questions...". Useful in a log, wrong on a Swedish screen —
 * the same defect the report blockers had, where a transition guard's raw
 * output reached the user.
 *
 * The mapping is by CODE, not by matching prose, so a reworded guard keeps its
 * translation. Anything unrecognised falls through to the raw message rather
 * than to a generic apology: an unhelpful specific error beats a helpful-
 * sounding vague one, and it makes the gap visible enough to fix.
 */
const ERROR_KEY: Record<string, TranslationKey> = {
  SCP_IV_PANEL_INCOMPLETE: "iiu.err.panel_incomplete",
  SCP_IV_PANEL_NOT_ALL_SUBMITTED: "iiu.err.panel_not_all_submitted",
  SCP_IV_PANEL_NOT_A_MEMBER: "iiu.err.panel_not_a_member",
  SCP_IV_PANEL_TOO_SMALL: "iiu.err.panel_too_small",
  SCP_IV_PANEL_MEMBER_NOT_EMPLOYER: "iiu.err.panel_member_not_employer",
  SCP_IV_PANEL_CONCLUSION_REQUIRED: "iiu.err.panel_conclusion_required",
  SCP_IV_PANEL_NOT_REVEALED: "iiu.err.panel_not_revealed",
  SCP_IV_NOT_CASE_MEMBER: "iiu.err.not_case_member",
  SCP_IV_ILLEGAL_TRANSITION: "iiu.err.illegal_transition",
  SCP_IV_ASSESSMENT_EDITED_IN_PLACE: "iiu.err.assessment_edited",
  SCP_IV_PACK_NOT_USABLE: "iiu.err.pack_not_usable",
  SCP_IV_EMPLOYER_NOT_ACTIVE: "iiu.err.employer_not_active",
  // Owner UAT: these three reached the screen as raw ENGLISH sentences in
  // Swedish mode, because they were never mapped. The rules they express are
  // right; the way the interviewer met them was not.
  SCP_IV_NO_CONFIRMED_EVIDENCE: "iiu.err.no_confirmed_evidence",
  SCP_IV_RATIONALE_REQUIRED: "iiu.err.rationale_required",
  SCP_IV_NO_ANCHOR: "iiu.err.no_anchor",
  SCP_IV_SOURCES_NOT_READY: "iiu.err.sources_not_ready",
};

export function interviewErrorMessage(error: unknown, t: (key: TranslationKey) => string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  // A dropped connection surfaces as the browser's own "Failed to fetch",
  // which tells a recruiter nothing and looks like the product broke. It is
  // also the case where saying what happened matters most: the save did not
  // happen, nothing was half-written, and trying again is the right move.
  if (/failed to fetch|networkerror|load failed|err_network|fetch failed/i.test(raw)) {
    return t("iiu.err.network");
  }

  const code = /\b(SCP_[A-Z0-9_]+)\b/.exec(raw)?.[1];
  const key = code ? ERROR_KEY[code] : undefined;
  if (key) return t(key);
  // Strip the code prefix even when there is no translation: the sentence after
  // it is usually readable, and the identifier never is.
  return raw.replace(/^SCP_[A-Z0-9_]+:\s*/, "");
}

/**
 * How confident the knowledge graph is, and — more importantly — WHAT KIND of
 * confidence it is.
 *
 * The graph used one word, `verified`, for two unrelated things: an edge that
 * restates a foreign key, and an edge that rests on a research finding. 228 of
 * 271 edges were the first kind, so any screen reporting "verified: 228" would
 * have invited precisely the conclusion the research registry exists to
 * prevent — that this product rests on 228 confirmed empirical results. It
 * rests on three sources somebody has read.
 *
 * These labels are deliberately long. A one-word chip is what created the
 * problem.
 */
export const ASSURANCE_LABEL: Record<string, TranslationKey> = {
  structurally_derived: "iiu.assurance.structurally_derived",
  source_read: "iiu.assurance.source_read",
  source_verified: "iiu.assurance.source_verified",
  expert_reviewed: "iiu.assurance.expert_reviewed",
  provisional: "iiu.assurance.provisional",
  hypothesis: "iiu.assurance.hypothesis",
  pending_source_verification: "iiu.assurance.pending_source_verification",
};

/**
 * The levels that represent an actual claim about the world, as opposed to a
 * fact about how this product is built. Only these may ever be summarised as
 * research.
 */
export const EMPIRICAL_ASSURANCE: readonly string[] = [
  "source_read",
  "source_verified",
  "expert_reviewed",
];

export function AssuranceChip({ assurance }: { assurance: string }) {
  const { t } = useT();
  const empirical = EMPIRICAL_ASSURANCE.includes(assurance);
  return (
    <Chip tone={empirical ? "confirmed" : "neutral"} srPrefix={t("iiu.assurance.srprefix")}>
      {uiLabel(ASSURANCE_LABEL, assurance, t)}
    </Chip>
  );
}

/**
 * Which engine produced this, said plainly.
 *
 * The four states are distinguished because they mean genuinely different
 * things to the person reading the output, and the difference is invisible
 * otherwise — the deterministic engine produces well-formed, plausible Swedish
 * that looks exactly like a model's. A recruiter who is not told cannot tell.
 *
 * Deliberately NOT colour-only: each carries its own words, and the synthetic
 * case is the one that gets the attention tone, because it is the one where
 * the output describes a rule rather than a reading of the candidate's
 * material.
 */
export function ProviderModeChip({ mode }: { mode: string }) {
  const { t } = useT();
  if (mode === "synthetic") {
    return (
      <Chip tone="attention" srPrefix={t("iiu.mode.srprefix")}>
        {t("iiu.mode.synthetic")}
      </Chip>
    );
  }
  if (mode === "development_model") {
    return (
      <Chip tone="ai" srPrefix={t("iiu.mode.srprefix")}>
        {t("iiu.mode.development")}
      </Chip>
    );
  }
  if (mode === "production_model") {
    return (
      <Chip tone="ai" srPrefix={t("iiu.mode.srprefix")}>
        {t("iiu.mode.production")}
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" srPrefix={t("iiu.mode.srprefix")}>
      {t("iiu.mode.unavailable")}
    </Chip>
  );
}

/**
 * The longer form, for the top of a document a recruiter may act on.
 *
 * A one-word chip is enough to tell two runs apart; it is not enough to stop
 * someone treating rule-based output as a model's judgement, which is why the
 * synthetic case says what it is in a full sentence.
 */
export function ProviderModeNote({ mode }: { mode: string }) {
  const { t } = useT();
  if (mode === "synthetic") {
    return (
      <Panel tone="attention" role="status" title={t("iiu.mode.note.title")}>
        <p>{t("iiu.mode.note.body")}</p>
      </Panel>
    );
  }
  return null;
}

/**
 * Source material the engine was not allowed to read.
 *
 * Shown, never merely logged. A paragraph gets withheld because it was
 * addressed to the system rather than describing the candidate — someone tried
 * to steer the assessment — and that is a fact about the application that a
 * recruiter is entitled to know and to judge for themselves. Withholding it
 * silently would leave them reading a summary built from part of a document,
 * believing it was built from all of it.
 *
 * The excerpt is shown so the decision is reviewable. It is deliberately not
 * presented as a finding about the candidate: a CV can be tampered with by
 * someone other than its subject, and the product does not know which happened.
 */
export function WithheldPanel({
  withheld,
}: {
  withheld: readonly {
    readonly passageId: string;
    readonly reason: string;
    readonly excerpt: string;
  }[];
}) {
  const { t } = useT();
  if (withheld.length === 0) return null;
  return (
    <Panel
      tone="attention"
      role="status"
      title={
        withheld.length === 1
          ? t("iiu.withheld.one")
          : `${withheld.length} ${t("iiu.withheld.many")}`
      }
    >
      <p>{t("iiu.withheld.body")}</p>
      <ul className="mt-2 space-y-2">
        {withheld.map((w) => (
          <li
            key={w.passageId}
            className="rounded-md border border-amber-600/30 bg-background/60 p-2"
          >
            <p className="text-xs font-medium">{w.reason}</p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-muted-foreground">
              {w.excerpt}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">{t("iiu.withheld.advice")}</p>
    </Panel>
  );
}

/** A form-level error summary whose entries link to the field that produced them. */
export function ErrorSummary({
  errors,
}: {
  errors: readonly { readonly fieldId: string; readonly message: string }[];
}) {
  const { t } = useT();
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <p className="font-semibold">{t("iiu.form.error.title")}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`} className="underline underline-offset-2">
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where this interview is in CQrity TRUST, in the recruiter's own language.
 *
 * TRUST is CQrityjob's governed synthesis of structured selection interviewing,
 * PEACE, ORBIT, the competency graph and the human decision boundary. It is a
 * research-grounded design hypothesis under controlled validation, not a
 * validated selection method, and this banner says so once rather than claiming
 * authority it does not have.
 *
 * It shows the stage, what it is for, what the human owes it, and what may not
 * be concluded there. It deliberately does NOT show the research rationale: a
 * recruiter mid-interview needs process support, not the argument about whether
 * ORBIT transfers from counter-terrorism interrogation to recruitment. That
 * argument lives in the admin surface, where the people who can act on it are.
 */
export function TrustStageBanner({
  stage,
  aiAvailable = true,
}: {
  /** Whether the governed configuration currently permits AI at all. The
   *  stage's own permission describes the METHOD; this describes the runtime.
   *  Saying "AI may prepare and suggest here" while AI is switched off is
   *  true about TRUST and misleading about the product. */
  aiAvailable?: boolean;
  stage: {
    readonly letter: string | null;
    readonly ordinal: number | null;
    readonly nameSv: string | null;
    readonly nameEn: string | null;
    readonly purposeSv: string | null;
    readonly purposeEn: string | null;
    readonly humanResponsibilitySv: string | null;
    readonly humanResponsibilityEn: string | null;
    readonly prohibitions: readonly string[];
    readonly prohibitionsEn: readonly string[];
    readonly permitsAi: boolean;
    readonly methodVersion: number | null;
  } | null;
}) {
  const { t, lang } = useT();
  if (!stage?.letter) return null;

  // The stage copy is governed CONTENT, held per language in the database
  // rather than in the dictionary. Swedish stays authoritative and is the
  // fallback, so a stage added without a translation reads as untranslated
  // Swedish rather than disappearing.
  const name = (lang === "en" ? stage.nameEn : stage.nameSv) ?? stage.nameSv;
  const purpose = (lang === "en" ? stage.purposeEn : stage.purposeSv) ?? stage.purposeSv;
  const responsibility =
    (lang === "en" ? stage.humanResponsibilityEn : stage.humanResponsibilitySv) ??
    stage.humanResponsibilitySv;
  const prohibitions =
    lang === "en" && stage.prohibitionsEn.length > 0 ? stage.prohibitionsEn : stage.prohibitions;

  // Hierarchy, deliberately: what the RECRUITER must do here, and whether AI
  // is on, stay visible. The method's identity, its stage numbering, its
  // purpose statement, its prohibitions and its validation disclaimer move
  // inside a disclosure.
  //
  // None of it is removed or softened -- it is governed content and it still
  // reads in both languages. But it used to occupy the first screenful of
  // every work surface, so a recruiter opening a candidate met "CQrity TRUST
  // v1 · step 5 of 5" and a note about scientific validation before they met
  // their own next task. Operational first, methodology second, audit third.
  return (
    <section aria-labelledby="trust-stage" className="rounded-lg border border-border p-4">
      <h2 id="trust-stage" className="sr-only">
        {t("iiu.trust.srstage")} {stage.ordinal} {t("iiu.trust.of5")}: {name}
      </h2>

      {responsibility && (
        <p className="max-w-[68ch] text-sm text-foreground">
          <span className="font-medium">{t("iiu.trust.responsibility")}</span>
          {responsibility}
        </p>
      )}

      <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">
        {!stage.permitsAi
          ? t("iiu.trust.noai")
          : aiAvailable
            ? t("iiu.trust.ai")
            : t("iiu.trust.ai.disabled")}
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          {t("iiu.trust.about")}
        </summary>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-700/40 bg-sky-700/10 font-mono text-sm font-semibold text-sky-900 dark:text-sky-200"
          >
            {stage.letter}
          </span>
          <span className="text-sm font-semibold text-foreground">{name}</span>
          <span className="text-xs text-muted-foreground">
            CQrity TRUST{stage.methodVersion ? ` v${stage.methodVersion}` : ""} ·{" "}
            {t("iiu.trust.step")} {stage.ordinal} {t("iiu.trust.of5")}
          </span>
        </div>

        {purpose && <p className="mt-2 max-w-[68ch] text-sm text-muted-foreground">{purpose}</p>}

        {prohibitions.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium text-foreground">
              {t("iiu.trust.prohibitions")}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {prohibitions.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-3 text-xs text-muted-foreground">{t("iiu.trust.disclaimer")}</p>
      </details>
    </section>
  );
}

/**
 * A report blocker, in the reader's language.
 *
 * scp_iv_report_blockers() returns a CODE and a Swedish message. The report
 * screen rendered the code in a monospace chip beside it, so the owner met
 * "ASSESSMENT_NOT_COMPLETE" and "QUESTION_NOT_ASSESSED" on a customer screen.
 * The code is an internal identifier; it belongs in a log, not on the page.
 *
 * QUESTION_NOT_ASSESSED carries the question code ("Q2 har ingen ...") which
 * is real information, so it is rebuilt rather than discarded.
 */
export function blockerMessage(
  code: string,
  message: string,
  t: (key: TranslationKey) => string,
): string {
  switch (code) {
    case "ASSESSMENT_NOT_COMPLETE":
      return t("iiu.rp.blk.assessment_not_complete");
    case "QUESTION_NOT_ASSESSED": {
      const q = /\b(Q\d+)\b/.exec(message)?.[1];
      return q
        ? `${q} ${t("iiu.rp.blk.question_not_assessed")}`
        : t("iiu.rp.blk.question_not_assessed");
    }
    case "PROPOSALS_AWAITING_REVIEW":
      return t("iiu.rp.blk.proposals_awaiting");
    case "NOT_PERMITTED":
      return t("iiu.rp.blk.not_permitted");
    case "CASE_NOT_FOUND":
      return t("iiu.rp.blk.case_not_found");
    default:
      // An unrecognised code keeps its server message rather than becoming a
      // vague apology -- but the code itself still never reaches the screen.
      return message || t("iiu.rp.blk.generic");
  }
}

/**
 * What happens next, said in one line.
 *
 * Owner UAT, finding F: each stage worked, but the product left the reader to
 * infer what to do next from which buttons happened to be on the page. The
 * journey rail shows WHERE you are; this says WHAT TO DO, which is the part a
 * first-time pilot user actually needs.
 */
export function NextStep({ status }: { status: string }) {
  const { t } = useT();
  const KEY: Record<string, TranslationKey> = {
    draft: "iiu.next.sources",
    sources_ready: "iiu.next.prep",
    prep_generated: "iiu.next.prep",
    prep_approved: "iiu.next.interview",
    interview_in_progress: "iiu.next.interview",
    interview_complete: "iiu.next.evidence",
    evidence_review: "iiu.next.evidence",
    assessed: "iiu.next.assessed",
    reported: "iiu.next.reported",
  };
  const key = KEY[status];
  if (!key) return null;
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{t("iiu.next.title")}: </span>
      {t(key)}
    </p>
  );
}

/** The journey, drawn as steps. Never as a percentage: this is not progress towards a verdict. */
export function CaseSteps({ current }: { current: string }) {
  const { t } = useT();
  const steps: Array<{ key: string; label: string }> = [
    { key: "draft", label: t("iiu.rail.sources") },
    { key: "prep_approved", label: t("iiu.rail.prep") },
    { key: "interview_in_progress", label: t("iiu.rail.interview") },
    { key: "evidence_review", label: t("iiu.rail.evidence") },
    { key: "assessed", label: t("iiu.rail.assessment") },
    { key: "reported", label: t("iiu.rail.report") },
  ];
  const order = [
    "draft",
    "sources_ready",
    "prep_generated",
    "prep_approved",
    "interview_in_progress",
    "interview_complete",
    "evidence_review",
    "assessed",
    "reported",
  ];
  const currentIdx = order.indexOf(current);

  return (
    <nav aria-label={t("iiu.rail.aria")} className="border-y border-border py-3">
      <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
        {steps.map((s, i) => {
          const reached = currentIdx >= order.indexOf(s.key);
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "tabular-nums",
                  reached ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {i + 1}. {s.label}
                {reached && <span className="sr-only">{t("iiu.rail.reached")}</span>}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const BUTTON =
  "inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export const PRIMARY_BUTTON =
  "inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export const FIELD =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** The 5E structure of one behavioural account.
 *
 *  Deliberately a DESCRIPTION, not a measurement. There is no count, no
 *  percentage, no "3 of 5", no bar and no colour scale over these fields,
 *  because every one of those would be read as a score the moment a recruiter
 *  saw two candidates side by side. A part that is missing is shown as missing
 *  and named as a gap to ask about — which is the only thing the absence
 *  actually tells you. */
export function FiveEPanel({
  value,
}: {
  value: {
    readonly e1Situation: string | null;
    readonly e2OwnRole: string | null;
    readonly e3ExactAction: string | null;
    readonly e4Effect: string | null;
    readonly e5Reflection: string | null;
  };
}) {
  const { t } = useT();
  const parts: ReadonlyArray<readonly [TranslationKey, string | null]> = [
    ["iiu.ev.5e.1", value.e1Situation],
    ["iiu.ev.5e.2", value.e2OwnRole],
    ["iiu.ev.5e.3", value.e3ExactAction],
    ["iiu.ev.5e.4", value.e4Effect],
    ["iiu.ev.5e.5", value.e5Reflection],
  ];
  if (parts.every(([, v]) => v === null)) return null;

  return (
    <div className="mt-3 rounded-md border border-border/70 p-3">
      <p className="text-xs font-semibold text-foreground">{t("iiu.ev.5e.title")}</p>
      <dl className="mt-2 space-y-1.5">
        {parts.map(([key, v]) => (
          <div key={key} className="text-xs">
            <dt className="font-medium text-foreground">{t(key)}</dt>
            <dd className={v ? "text-muted-foreground" : "italic text-muted-foreground/70"}>
              {v ?? t("iiu.ev.5e.missing")}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {t("iiu.ev.5e.note")}
      </p>
    </div>
  );
}

/** One governed guidance row, as the projection delivers it. */
export type GuidanceRow = {
  readonly id: string;
  readonly surface: string;
  readonly statementSv: string;
  readonly statementEn: string;
};

/**
 * Governed interviewer guidance, rendered as what it is.
 *
 * Every row on this panel is a database row pinned to the TRUST method
 * version. Nothing here is generated, and in the Understand stage nothing
 * could be: that stage permits zero AI tasks. The panel says so, because a
 * recruiter reading advice mid-interview is entitled to know whether a model
 * wrote it.
 *
 * `ordered` draws the list as a sequence. Use it only where the order is real
 * -- the conduct steps are a sequence, the prohibitions are a set, and
 * numbering a set implies a precedence that does not exist.
 */
export function GovernedGuidance({
  title,
  rows,
  ordered = false,
  note,
}: {
  title: string;
  rows: readonly GuidanceRow[];
  ordered?: boolean;
  note?: string;
}) {
  const { lang } = useT();
  if (rows.length === 0) return null;
  const text = (r: GuidanceRow) => (lang === "en" ? r.statementEn : r.statementSv) || r.statementSv;
  const items = rows.map((r) => (
    <li key={r.id} className="text-sm leading-relaxed text-foreground">
      {text(r)}
    </li>
  ));

  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {ordered ? (
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">{items}</ol>
      ) : (
        <ul className="mt-2 list-disc space-y-1.5 pl-5">{items}</ul>
      )}
      {note && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

/** The six kinds of material a recruiter handles, and the one thing that must
 *  never happen: two of them looking alike.
 *
 *  A candidate's statement, a note, an AI proposal, confirmed material, a
 *  verification item and a human assessment are six different claims about
 *  the world. Conflating any two of them is how a product ends up presenting
 *  something the candidate said as something the employer established.
 *
 *  Each therefore carries a GLYPH and a WORD, not a colour. Colour is used as
 *  reinforcement and never as the signal: a recruiter reading this in
 *  greyscale, with a screen reader, or with any of the common colour vision
 *  deficiencies gets exactly the same six distinctions. */
export type MaterialState = "candidate" | "note" | "ai" | "confirmed" | "verify" | "assessment";

const MATERIAL: Record<
  MaterialState,
  { glyph: string; label: TranslationKey; help: TranslationKey; cls: string }
> = {
  candidate: {
    glyph: "❝",
    label: "iiu.st.candidate",
    help: "iiu.st.candidate.help",
    cls: "border-slate-500/40 text-slate-700 dark:text-slate-300",
  },
  note: {
    glyph: "✎",
    label: "iiu.st.note",
    help: "iiu.st.note.help",
    cls: "border-sky-700/40 text-sky-900 dark:text-sky-200",
  },
  ai: {
    glyph: "◇",
    label: "iiu.st.ai",
    help: "iiu.st.ai.help",
    cls: "border-violet-700/40 text-violet-900 dark:text-violet-200",
  },
  confirmed: {
    glyph: "✓",
    label: "iiu.st.confirmed",
    help: "iiu.st.confirmed.help",
    cls: "border-teal-700/40 text-teal-900 dark:text-teal-200",
  },
  verify: {
    glyph: "!",
    label: "iiu.st.verify",
    help: "iiu.st.verify.help",
    cls: "border-amber-600/50 text-amber-800 dark:text-amber-200",
  },
  assessment: {
    glyph: "★",
    label: "iiu.st.assessment",
    help: "iiu.st.assessment.help",
    cls: "border-indigo-700/40 text-indigo-900 dark:text-indigo-200",
  },
};

export function MaterialBadge({ state }: { state: MaterialState }) {
  const { t } = useT();
  const m = MATERIAL[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        m.cls,
      )}
    >
      <span aria-hidden="true" className="font-mono">
        {m.glyph}
      </span>
      {t(m.label)}
    </span>
  );
}

/** The legend, shown once where the six first appear together. A distinction
 *  the product depends on is worth stating plainly rather than hoping it is
 *  inferred from styling. */
export function MaterialLegend() {
  const { t } = useT();
  const order: MaterialState[] = ["candidate", "note", "ai", "confirmed", "verify", "assessment"];
  return (
    <details className="mt-3 rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {t("iiu.st.legend")}
      </summary>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("iiu.st.legend.body")}</p>
      <dl className="mt-3 space-y-2">
        {order.map((k) => (
          <div key={k} className="flex flex-wrap items-baseline gap-2">
            <dt>
              <MaterialBadge state={k} />
            </dt>
            <dd className="text-sm text-muted-foreground">{t(MATERIAL[k].help)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** What the recruiter does next, given where the case is.
 *
 *  One source for the overview's primary button and the list's "Next step"
 *  column. They were derived separately at first, which meant a status could
 *  be told two different things about itself — the list saying review and the
 *  overview saying assess — and nothing would have caught it. */
export const NEXT_STEP_LABEL: Record<string, TranslationKey> = {
  draft: "iiu.ov.cta.prepare",
  sources_ready: "iiu.ov.cta.prepare",
  prep_generated: "iiu.ov.cta.prepare",
  prep_approved: "iiu.ov.cta.start",
  interview_in_progress: "iiu.ov.cta.continue",
  interview_complete: "iiu.ov.cta.review",
  evidence_review: "iiu.ov.cta.review",
  assessed: "iiu.ov.cta.summary",
  reported: "iiu.ov.cta.openreport",
};

/** A date a recruiter reads at a glance, in their own locale. */
export function ShortDate({ iso }: { iso: string | null }) {
  const { lang } = useT();
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="text-muted-foreground">—</span>;
  return (
    <time dateTime={iso} className="tabular-nums">
      {d.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
    </time>
  );
}

/* ------------------------------------------------------------------ */
/* The workflow shell                                                  */
/* ------------------------------------------------------------------ */

/** The seven steps of one interview, as the recruiter's own navigation.
 *
 *  This replaces a six-item read-only rail whose labels came from the case
 *  status vocabulary. Two things changed. The steps are now LINKS, so the
 *  workflow is something you move through rather than a progress indicator you
 *  read; and they are named for the work, not for the record — Review, not
 *  Evidence.
 *
 *  Workflow state only: done, current, not yet. Nothing here says anything
 *  about the candidate, and a step is never "passed" or "failed". */
const WORKFLOW = [
  { seg: "", label: "iiu.wf.overview" },
  { seg: "prepare", label: "iiu.wf.prepare" },
  { seg: "interview", label: "iiu.wf.interview" },
  { seg: "evidence", label: "iiu.wf.review" },
  { seg: "evidence", label: "iiu.wf.assess" },
  { seg: "summary", label: "iiu.wf.summary" },
  { seg: "report", label: "iiu.wf.report" },
] as const satisfies ReadonlyArray<{ seg: string; label: TranslationKey }>;

/** How far the case has actually got, as an index into WORKFLOW. */
const REACHED: Record<string, number> = {
  draft: 1,
  sources_ready: 1,
  prep_generated: 1,
  prep_approved: 2,
  interview_in_progress: 2,
  interview_complete: 3,
  evidence_review: 3,
  assessed: 5,
  reported: 6,
};

export function WorkflowNav({
  status,
  current,
  employerSlug,
  caseId,
}: {
  status: string;
  /** Which step this page IS, so it can mark itself rather than guess. */
  current: "overview" | "prepare" | "interview" | "review" | "assess" | "summary" | "report";
  employerSlug: string;
  caseId: string;
}) {
  const { t } = useT();
  const reached = REACHED[status] ?? 0;
  const currentIdx = [
    "overview",
    "prepare",
    "interview",
    "review",
    "assess",
    "summary",
    "report",
  ].indexOf(current);

  return (
    <nav aria-label={t("iiu.wf.aria")} className="border-b border-border">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        {WORKFLOW.map((step, i) => {
          const isCurrent = i === currentIdx;
          const isDone = i < reached;
          return (
            <li key={`${step.seg}-${step.label}`}>
              <Link
                to={
                  step.seg === ""
                    ? "/employer/$employerSlug/interview-intelligence/$caseId"
                    : (`/employer/$employerSlug/interview-intelligence/$caseId/${step.seg}` as never)
                }
                params={{ employerSlug, caseId }}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isCurrent
                    ? "border-accent font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {/* A tick for a completed step, not a score. The word is there
                    for anyone who cannot see the glyph. */}
                {isDone && !isCurrent && (
                  <span aria-hidden="true" className="text-xs">
                    ✓
                  </span>
                )}
                {t(step.label)}
                {isCurrent && <span className="sr-only"> ({t("iiu.wf.current")})</span>}
                {isDone && !isCurrent && <span className="sr-only"> ({t("iiu.wf.done")})</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The header every case screen shares: who, for what, where, and the one
 *  thing to do next. Composed once so the eight screens cannot drift apart. */
export function CaseHeader({
  candidate,
  role,
  status,
  action,
}: {
  candidate: string;
  role: string;
  status: string;
  /** The primary action for THIS screen, when it has one. */
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {candidate}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{role}</p>
        <div className="mt-2.5">
          <CaseStatusChip status={status} />
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
