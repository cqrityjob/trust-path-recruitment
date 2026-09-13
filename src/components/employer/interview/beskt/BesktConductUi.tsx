// The BESKT conduct surface's shared vocabulary.
//
// Everything a BESKT screen can SAY about a state lives here, so the same
// state cannot be worded two ways on two screens — and so a source guard can
// read one file to check that nothing here carries a score, a rank, a verdict
// or a truth judgement.
//
// The tone rules are Interview Intelligence's own, and two of them matter
// especially here:
//
//   Colour never carries meaning alone. Every state renders as words too.
//   There is no red/green pair, because a red mark beside a candidate's
//   skipped question is a verdict — and a skipped question is not a finding.
//
// That is why an omitted answer and a discuss-orally answer are NEUTRAL here:
// no warning tone, no negative icon, no "risk". They are the candidate's own
// choices, offered to them by the method on purpose.

import type { ReactNode } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Chip } from "@/components/employer/interview/InterviewUi";
import type {
  BesktResolutionKind,
  BesktSensitivityClass,
  BesktTopicReason,
  BesktVerificationState,
} from "@/lib/beskt/interview-conduct.functions";

/** The candidate's three explicit response states, worded neutrally. */
export const RESPONSE_STATE_LABEL: Record<string, TranslationKey> = {
  answered: "beskt.conduct.snapshot.state.answered",
  omitted: "beskt.conduct.snapshot.state.omitted",
  discuss_orally: "beskt.conduct.snapshot.state.discuss_orally",
};

/**
 * The candidate's state, as a chip.
 *
 * All three tones are deliberately the same family — neutral and work — and
 * never `attention` or `governance`. An omitted answer is not unresolved work
 * for the candidate and not a governance error; it is an answer of a kind the
 * method offers. Giving it amber would tell a recruiter it needs chasing, and
 * giving it red would tell them it is a problem. Both would be a meaning the
 * database never recorded.
 */
export function ResponseStateChip({ state }: { state: string }) {
  const { t } = useT();
  const key = RESPONSE_STATE_LABEL[state];
  return (
    <Chip
      tone={state === "answered" ? "work" : "neutral"}
      srPrefix={t("beskt.conduct.snapshot.purpose")}
    >
      {key ? t(key) : state}
    </Chip>
  );
}

export const TOPIC_REASON_LABEL: Record<BesktTopicReason, TranslationKey> = {
  omitted: "beskt.conduct.themes.reason.omitted",
  discuss_orally: "beskt.conduct.themes.reason.discuss_orally",
};

export const VERIFICATION_LABEL: Record<BesktVerificationState, TranslationKey> = {
  not_required: "beskt.conduct.verification.not_required",
  requested: "beskt.conduct.verification.requested",
  in_progress: "beskt.conduct.verification.in_progress",
  verified: "beskt.conduct.verification.verified",
  not_verified: "beskt.conduct.verification.not_verified",
  inconclusive: "beskt.conduct.verification.inconclusive",
};

/**
 * A verification state as a chip.
 *
 * `verified` is teal because teal means CONFIRMED EVIDENCE in this product —
 * it describes the record, not the person. The three open states are amber
 * because they are unresolved work waiting on a human, which is exactly what
 * they are. `not_verified` and `inconclusive` are NEUTRAL and never red: a
 * check that could not be completed is not a governance error and is
 * emphatically not a statement that the candidate was untruthful.
 */
export function VerificationChip({ state }: { state: BesktVerificationState }) {
  const { t } = useT();
  const tone =
    state === "verified"
      ? "confirmed"
      : state === "requested" || state === "in_progress"
        ? "attention"
        : "neutral";
  return (
    <Chip tone={tone} srPrefix={t("beskt.conduct.entry.verificationState")}>
      {t(VERIFICATION_LABEL[state])}
    </Chip>
  );
}

export const SENSITIVITY_LABEL: Record<BesktSensitivityClass, TranslationKey> = {
  ordinary: "beskt.conduct.sensitivity.ordinary",
  sensitive: "beskt.conduct.sensitivity.sensitive",
  special_category: "beskt.conduct.sensitivity.special_category",
};

export const RESOLUTION_KIND_LABEL: Record<BesktResolutionKind, TranslationKey> = {
  agreed: "beskt.conduct.panel.resolution.kind.agreed",
  disagreed: "beskt.conduct.panel.resolution.kind.disagreed",
};

export const POSITION_ROLE_LABEL: Record<string, TranslationKey> = {
  assessor: "beskt.conduct.role.assessor",
  responsible_owner: "beskt.conduct.role.responsible_owner",
};

export const POSITION_STATE_LABEL: Record<string, TranslationKey> = {
  open: "beskt.conduct.position.state.open",
  locked: "beskt.conduct.position.state.locked",
};

export const PANEL_STATE_LABEL: Record<string, TranslationKey> = {
  open: "beskt.conduct.panel.state.open",
  revealed: "beskt.conduct.panel.state.revealed",
  concluded: "beskt.conduct.panel.state.concluded",
};

export const METHOD_MODE_LABEL: Record<string, TranslationKey> = {
  recruitment_support: "beskt.conduct.method.mode.recruitment_support",
  security_vetting_support: "beskt.conduct.method.mode.security_vetting_support",
};

export const RELEASE_SCOPE_LABEL: Record<string, TranslationKey> = {
  synthetic_internal_only: "beskt.conduct.method.releaseScope.synthetic_internal_only",
};

/** Pick the governed wording for the reader's own language. */
export function governedText(
  lang: string,
  sv: string | null | undefined,
  en: string | null | undefined,
): string {
  const primary = lang === "en" ? en : sv;
  return (primary ?? sv ?? en ?? "").trim();
}

/** One labelled fact. A definition list row, so the pairing is in the markup. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * A digest, rendered so it can be read aloud and copied.
 *
 * `break-all` rather than truncation: an abbreviated hash is not a hash, and
 * the whole reason it is on the screen is that somebody can check it.
 */
export function Digest({ value }: { value: string }) {
  return <code className="block break-all font-mono text-xs text-muted-foreground">{value}</code>;
}

/**
 * A touch target that meets the project's 44px minimum on every viewport.
 *
 * The Interview Intelligence BUTTON constants are sized for a mouse. Inside
 * BESKT the same controls are used one-handed on a phone in the middle of a
 * conversation, so they get a floor rather than a preference.
 */
export const TOUCH = "min-h-[44px] min-w-[44px]";

/** The save status of one governed mutation, in words and with a live region. */
export function SaveStatus({ state }: { state: "idle" | "saving" | "saved" | "failed" }) {
  const { t } = useT();
  if (state === "idle") return null;
  const key: TranslationKey =
    state === "saving"
      ? "beskt.conduct.save.saving"
      : state === "saved"
        ? "beskt.conduct.save.saved"
        : "beskt.conduct.save.failed";
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        state === "failed"
          ? "text-sm font-medium text-destructive"
          : "text-sm text-muted-foreground"
      }
    >
      {t(key)}
    </p>
  );
}
