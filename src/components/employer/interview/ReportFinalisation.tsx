// The end of a candidate interview: who may lock the report, and what the
// person who may not is told instead.
//
// ── WHY THIS IS ITS OWN COMPONENT ───────────────────────────────────────
//
// It was six lines inside a thousand-line route, and it was wrong in a way
// nothing could see: the screen offered an active "Slutför rapporten" button
// to every interviewer, and the database refused everyone who was not an owner
// or admin. The refusal was correct. The offer was a lie, and the only way to
// discover it was to click.
//
// A conditional buried in a route is a conditional nobody renders in a test.
// Lifted out, both branches can be drawn and read — which is what the guard
// beside it does, in both languages.
//
// ── THE TWO CLAIMS, KEPT APART ──────────────────────────────────────────
//
// "The material is complete" is a fact about the interview: every question
// assessed, every AI proposal reviewed by a person. It is drawn by the caller,
// above this component, and is true for everyone looking at the page.
//
// "You may conclude this" is a fact about the reader. It is drawn here.
//
// The old copy — "Inget hindrar rapporten", nothing is blocking the report —
// asserted both at once, which is why the button felt earned.

import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { PRIMARY_BUTTON } from "./InterviewUi";
import { Surface } from "./InterviewLayout";

export function ReportFinalisation({
  /** From the caller's own active membership of this employer — the same row
   *  and the same two roles scp_iv_finalise_report checks.
   *
   *  A courtesy, never the boundary. The database refuses a member whether or
   *  not this is true, and a crafted request still fails. */
  canFinalise,
  onFinalise,
  isPending,
  employerSlug,
  caseId,
}: {
  canFinalise: boolean;
  onFinalise: () => void;
  isPending: boolean;
  employerSlug: string;
  caseId: string;
}) {
  const { t } = useT();

  if (canFinalise) {
    return (
      <div className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-4">
        <p className="text-sm font-semibold text-foreground">{t("iiu.rp.confirm")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("iiu.rp.confirm.body")}</p>
        <button
          type="button"
          className={`${PRIMARY_BUTTON} mt-3`}
          onClick={onFinalise}
          disabled={isPending}
        >
          {isPending ? t("iiu.rp.finalising") : t("iiu.rp.finalise")}
        </button>
      </div>
    );
  }

  // Waiting on somebody else is a NEUTRAL state, not an error.
  //
  // Deliberately not the amber treatment used above for an irreversible action
  // and below for blockers: this interviewer has done everything the product
  // asked and finished their part, and colouring the end of their work as a
  // problem would tell them they had not.
  //
  // No disabled button either. A greyed-out control still says "this was yours
  // to do, and something is wrong" — which is the same false claim as before,
  // in a quieter voice. The sentence says who acts next instead.
  return (
    <Surface muted>
      <h3 className="text-sm font-semibold text-foreground">{t("iiu.rp.await.title")}</h3>
      <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
        {t("iiu.rp.await.body")}
      </p>
      {/* Somewhere to go next rather than a dead end. */}
      <Link
        to="/employer/$employerSlug/interview-intelligence/$caseId"
        params={{ employerSlug, caseId }}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
      >
        {t("iiu.rp.await.back")}
      </Link>
    </Surface>
  );
}
