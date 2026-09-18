// The method's own interviewer wordings.
//
// ── WHERE EVERY WORD ON THIS SCREEN COMES FROM ──────────────────────────
//
// `bcp_conduct_topic_prompts`, and nowhere else. The database narrows to the
// method version the session froze, the exposure profile the assignment
// pinned, the topics PR 4 derived, published recruitment-support content and
// an access class an interviewer actually holds — all inside a SECURITY
// DEFINER function a caller cannot reach past.
//
// This file therefore renders wordings; it does not choose, order, merge,
// shorten, rephrase or supplement them. There is no prompt literal in this
// file and no model anywhere in this path. The only strings it owns are
// LABELS for the governed vocabularies — the PEACE stage a prompt belongs to,
// who it is addressed to, what a probe may be grounded in — because those are
// our words about the method's structure, not the method's words to a person.
//
// ── WHY "UNAVAILABLE" IS A FIRST-CLASS STATE ────────────────────────────
//
// A published version can be suspended or retired while a conversation is in
// progress. When that happens the wordings stop being answered, and the
// honest thing to show is that they are unavailable AND why — not a stale
// copy, not an invention, and not a silent empty list that reads as "this
// method has no prompts". The three reasons are the database's own.
//
// ── THE ONE CLAIM THIS SCREEN MUST NOT MAKE ─────────────────────────────
//
// That a prompt is a script to be read out, or that following it produces an
// answer that can be scored. A prompt is a governed way of asking. The
// interviewer decides what to ask; the record they keep is a record of what
// was said, not a result.

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Chip, Panel } from "@/components/employer/interview/InterviewUi";
import { governedText } from "./BesktConductUi";
import type {
  BesktPeaceStage,
  BesktPrompt,
  BesktPromptsUnavailableReason,
} from "@/lib/beskt/interview-conduct.functions";

/** Our word for each PEACE stage. The stage itself is the method's. */
const STAGE_LABEL: Record<BesktPeaceStage, TranslationKey> = {
  planning: "beskt.conduct.prompts.stage.planning",
  engage_explain: "beskt.conduct.prompts.stage.engage_explain",
  account: "beskt.conduct.prompts.stage.account",
  closure: "beskt.conduct.prompts.stage.closure",
  evaluation: "beskt.conduct.prompts.stage.evaluation",
};

/** Who a wording is addressed to. Planning and Evaluation never reach a candidate. */
const ADDRESSEE_LABEL: Record<string, TranslationKey> = {
  candidate: "beskt.conduct.prompts.addressee.candidate",
  interviewer: "beskt.conduct.prompts.addressee.interviewer",
};

/**
 * What a probe may be grounded in.
 *
 * The four values are the whole closed vocabulary. There is deliberately no
 * value for tone, hesitation, gaze, expression or body language, so a probe
 * grounded in a behavioural "cue" is not representable — and this legend is
 * where a reader can see that for themselves.
 */
const PROBE_BASIS_LABEL: Record<string, TranslationKey> = {
  submitted_answer: "beskt.conduct.prompts.basis.submitted_answer",
  documented_role_requirement: "beskt.conduct.prompts.basis.documented_role_requirement",
  candidate_supplied_document: "beskt.conduct.prompts.basis.candidate_supplied_document",
  candidate_correction: "beskt.conduct.prompts.basis.candidate_correction",
};

const UNAVAILABLE_LABEL: Record<BesktPromptsUnavailableReason, TranslationKey> = {
  version_not_found: "beskt.conduct.prompts.unavailable.versionNotFound",
  version_not_published: "beskt.conduct.prompts.unavailable.versionNotPublished",
  mode_not_permitted: "beskt.conduct.prompts.unavailable.modeNotPermitted",
};

/** Ordered by the method's own display order, which the database already applied. */
function PromptRow({ prompt }: { prompt: BesktPrompt }) {
  const { t, lang } = useT();
  const wording = governedText(lang, prompt.wordingSv, prompt.wordingEn);
  const addressee = ADDRESSEE_LABEL[prompt.addressee];

  return (
    <li
      data-testid={`beskt-prompt-${prompt.promptKey}`}
      className="rounded-md border border-border bg-background p-3"
    >
      <p className="max-w-[72ch] text-sm leading-relaxed text-foreground">
        {wording === "" ? (
          <span className="text-muted-foreground">{t("beskt.conduct.prompts.wordingMissing")}</span>
        ) : (
          wording
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Chip tone="neutral" srPrefix={t("beskt.conduct.prompts.stageLabel")}>
          {t(STAGE_LABEL[prompt.peaceStage])}
        </Chip>
        {addressee && (
          <Chip tone="neutral" srPrefix={t("beskt.conduct.prompts.addresseeLabel")}>
            {t(addressee)}
          </Chip>
        )}
      </div>

      {prompt.permittedProbeBases.length > 0 && (
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium">{t("beskt.conduct.prompts.basisLabel")}: </span>
          {prompt.permittedProbeBases
            .map((b) => (PROBE_BASIS_LABEL[b] ? t(PROBE_BASIS_LABEL[b]) : b))
            .join(" · ")}
        </p>
      )}
    </li>
  );
}

/**
 * The wordings that belong to ONE governed item, rendered inside its theme.
 *
 * Renders nothing at all when the method has no prompt for that item: a
 * heading over an empty list would suggest something is missing, and nothing
 * is. The method simply did not word a probe for it.
 */
export function BesktThemePrompts({ prompts }: { prompts: readonly BesktPrompt[] }) {
  const { t } = useT();
  if (prompts.length === 0) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <h4 className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.prompts.themeHeading")}
      </h4>
      <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.conduct.prompts.themeLede")}
      </p>
      <ul className="mt-2 space-y-2">
        {prompts.map((p) => (
          <PromptRow key={p.promptKey} prompt={p} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The method's own structure for the conversation: the wordings that belong
 * to no single item — planning, engage and explain, closure, and the
 * interviewer's own Evaluation step.
 *
 * Grouped by PEACE stage in the method's stage order, because the stages are
 * the method's own sequencing and a flat list would lose it.
 */
export function BesktStagePrompts({ prompts }: { prompts: readonly BesktPrompt[] }) {
  const { t } = useT();
  if (prompts.length === 0) return null;

  const stages: BesktPeaceStage[] = [
    "planning",
    "engage_explain",
    "account",
    "closure",
    "evaluation",
  ];

  return (
    <section
      data-testid="beskt-stage-prompts"
      className="rounded-lg border border-border p-4"
      aria-labelledby="beskt-stage-prompts-h"
    >
      <h2 id="beskt-stage-prompts-h" className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.prompts.stageHeading")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.conduct.prompts.stageLede")}
      </p>
      <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.conduct.prompts.notAScript")}
      </p>

      {stages.map((stage) => {
        const inStage = prompts.filter((p) => p.peaceStage === stage);
        if (inStage.length === 0) return null;
        return (
          <div key={stage} className="mt-4">
            <h3 className="text-sm font-medium text-foreground">{t(STAGE_LABEL[stage])}</h3>
            <p className="mt-0.5 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t(
                stage === "evaluation"
                  ? "beskt.conduct.prompts.evaluationNote"
                  : "beskt.conduct.prompts.stageNote",
              )}
            </p>
            <ul className="mt-2 space-y-2">
              {inStage.map((p) => (
                <PromptRow key={p.promptKey} prompt={p} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Why there are no wordings, when there are none.
 *
 * Rendered only in the unavailable case, and never beside a list: the two
 * states are mutually exclusive, and showing an explanation next to content
 * would make a reader doubt content that is perfectly good.
 */
export function BesktPromptsUnavailable({
  reason,
}: {
  reason: BesktPromptsUnavailableReason | null;
}) {
  const { t } = useT();
  return (
    <Panel tone="neutral" title={t("beskt.conduct.prompts.unavailable.title")}>
      <p>
        {reason ? t(UNAVAILABLE_LABEL[reason]) : t("beskt.conduct.prompts.unavailable.generic")}
      </p>
      <p className="mt-2">{t("beskt.conduct.prompts.unavailable.whatStillWorks")}</p>
    </Panel>
  );
}
