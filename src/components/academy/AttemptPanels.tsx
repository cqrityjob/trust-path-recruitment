// The three things the participant's run says about ITSELF, rather than about
// a question: where an answer is, what is still missing, and what happens now
// that the answers are in.
//
// ── WHY THESE ARE NOT IN THE ROUTE ────────────────────────────────────
//
// All three are states nobody reaches by hand. A save only reports a failure
// when the network drops; the missing-answers panel only appears when somebody
// submits an unfinished run; the recruitment ending only appears to a
// candidate, of whom there are none in a development pilot. States like that
// go wrong quietly and stay wrong, because the only way to see them is to
// break something on purpose first.
//
// Out here they are ordinary components that render from their props, and
// scripts/assessment-panels-render-check.tsx renders every one of them and
// reads the markup. That is the whole reason for the file.
//
// Nothing here decides anything. They are given a state and they draw it.

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/context";

/** Where one answer stands on its way to the server.
 *
 *  `saved` is set from the server's REPLY, never from the click that caused
 *  it. That is the save contract: the run may not tell somebody their answer
 *  is saved on the strength of having sent it, because those are different
 *  facts and only one of them survives a closed laptop. */
export type SaveState = "saving" | "saved" | "failed";

/** Where this answer is, said under the answer itself.
 *
 *  Silent until something has been sent this sitting. "Saved" would otherwise
 *  appear against every question of a resumed run the moment it was drawn,
 *  which is a claim about a request that was never made. */
export function SaveStatus({ state, onRetry }: { state?: SaveState; onRetry: () => void }) {
  const { t } = useT();
  if (!state) return null;
  if (state === "failed") {
    return (
      <p
        role="alert"
        className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-foreground"
      >
        <AlertTriangle className="h-4 w-4 text-accent" aria-hidden="true" />
        {t("academy.save.failed")}
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[8px] border border-border bg-card px-2.5 py-1 font-semibold underline-offset-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("academy.save.retry")}
        </button>
      </p>
    );
  }
  return (
    // Polite, not assertive: this is a progress note, and interrupting a
    // screen reader mid-question to announce it would be worse than useless.
    <p aria-live="polite" className="mt-5 text-xs font-medium text-muted-foreground">
      {t(state === "saving" ? "academy.save.saving" : "academy.save.saved")}
    </p>
  );
}

/** One unanswered question, as this panel needs to name it. */
export type MissingAnswer = {
  itemVersionId: string;
  /** Its position in the whole run, 1-based. The participant counts questions,
   *  not item versions. */
  position: number;
  prompt: string;
};

/** How many of them are listed before the list stops being information. */
const MISSING_SHOWN = 8;

/** Answers are missing, so the run cannot be handed in yet.
 *
 *  ── WHY THERE IS NO "SUBMIT AGAIN" HERE ──────────────────────────────
 *
 *  This replaced a panel whose only control was "Submit again", offered in
 *  response to SCP_INCOMPLETE_ATTEMPT — that is, offered in response to a
 *  refusal that would be repeated identically, for the same reason, every
 *  time it was pressed. Nothing had failed and nothing was lost; the run was
 *  simply not finished, and the participant was given the one action that
 *  could not help and no way to find out which answers were missing.
 *
 *  So: the count, the questions by their number in the run, and a route to
 *  one of them. A retry control would be a lie about what is wrong. */
export function MissingAnswersPanel({
  missing,
  onGoTo,
  onBack,
}: {
  missing: MissingAnswer[];
  onGoTo: (item: MissingAnswer) => void;
  onBack: () => void;
}) {
  const { t, tp } = useT();
  const first = missing[0];
  return (
    <>
      <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <AlertTriangle className="h-5 w-5 text-accent" aria-hidden="true" />
        {t("academy.incomplete.title")}
      </h1>
      <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{missing.length}</span>{" "}
        {tp("academy.incomplete.count", missing.length)}
      </p>
      <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
        {t("academy.incomplete.note")}
      </p>
      {/* The questions themselves, by their position in the run, so the
          participant can see whether this is one stray answer or a section
          they skipped. Capped, because a list of forty is not information. */}
      <ol className="mt-6 space-y-2">
        {missing.slice(0, MISSING_SHOWN).map((m) => (
          <li key={m.itemVersionId} className="text-[14px] leading-relaxed">
            <button
              type="button"
              onClick={() => onGoTo(m)}
              className="text-left underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="font-medium text-foreground">
                {t("academy.incomplete.question")} {m.position}
              </span>
              <span className="text-muted-foreground">{" · "}</span>
              <span className="text-muted-foreground">{m.prompt}</span>
            </button>
          </li>
        ))}
      </ol>
      {missing.length > MISSING_SHOWN && (
        <p className="mt-3 text-xs text-muted-foreground">{t("academy.incomplete.andMore")}</p>
      )}
      <div className="mt-7 flex flex-wrap gap-3">
        {first && (
          <button
            type="button"
            onClick={() => onGoTo(first)}
            className="inline-flex h-12 items-center justify-center rounded-[10px] bg-accent px-7 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.incomplete.goToFirst")}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-12 items-center justify-center rounded-[10px] border border-border px-6 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("academy.submitFailed.review")}
        </button>
      </div>
    </>
  );
}

/** The answers are in.
 *
 *  ── WHY THE WORDS DEPEND ON WHY THEY WERE ASKED ──────────────────────
 *
 *  These three sentences used to promise everybody a "development report".
 *  Said to an applicant that is wrong twice over: nobody is developing them,
 *  and what was produced goes to the organisation deciding about them. The
 *  INTRO screen was corrected for this; this one — the screen every single
 *  participant reaches, and the last thing they read — was not.
 *
 *  `closedStatus` is set when the run was already in before this visit, so the
 *  screen can say "this is already in" rather than "thank you, just received".
 *  `reviewsOpened` says a person still has to read an answer, because a result
 *  that is not final must not look final. */
export function SubmittedNotice({
  recruitment,
  closedStatus,
  reviewsOpened,
}: {
  recruitment: boolean;
  closedStatus: "in_progress" | "submitted" | "scored" | "released" | "abandoned" | null;
  reviewsOpened: number;
}) {
  const { t } = useT();
  const bodyKey =
    closedStatus === "released"
      ? recruitment
        ? "academy.done.releasedBodyRecruitment"
        : "academy.done.releasedBody"
      : closedStatus
        ? recruitment
          ? "academy.done.alreadyBodyRecruitment"
          : "academy.done.alreadyBody"
        : recruitment
          ? "academy.done.bodyRecruitment"
          : "academy.done.body";
  return (
    <>
      <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden="true" />
        {t(closedStatus ? "academy.done.alreadyTitle" : "academy.done.title")}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>
      {/* Said plainly, because a result that is not final yet must not look
          final. */}
      {reviewsOpened > 0 && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("academy.done.reviewPending")}
        </p>
      )}
    </>
  );
}
