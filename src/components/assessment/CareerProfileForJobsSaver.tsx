// Client-only side-effect that persists the full Career Intelligence
// Report (Phase 2) for the current signed-in user after they complete the
// CIE assessment. Also keeps result_summary.careerProfileForJobs populated
// in its original shape (job relevance guidance), since saveMyCareerReport
// writes both atomically. Renders nothing.
//
// Anonymous users are silently ignored — their answers stay in session
// state and drive the results page normally. Saved reports and job
// relevance guidance both require a saved profile, so the user is invited
// to sign in from the jobs surfaces if they want that layer.
//
// `completionId` is the idempotency key for this one assessment-completion
// attempt (see AssessmentApp in security-career-assessment.tsx) — passed
// straight through to saveMyCareerReport so a double-fire of this effect
// (StrictMode, a re-render) never creates a duplicate report.

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { AnswerMap } from "@/lib/career-assessment/types";
import { saveMyCareerReport } from "@/lib/career-intelligence-engine/report.functions";

export function CareerProfileForJobsSaver({
  answers,
  lang,
  completionId,
}: {
  answers: AnswerMap;
  lang: "sv" | "en";
  completionId: string;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const saved = useRef(false);
  const save = useServerFn(saveMyCareerReport);
  const queryClient = useQueryClient();

  const mut = useMutation({
    mutationFn: () => save({ data: { completionId, answers, locale: lang } }),
    retry: 2,
    onSuccess: (result) => {
      if (!result.saved) return;
      void queryClient.invalidateQueries({ queryKey: ["my-career", "runs"] });
      void queryClient.invalidateQueries({
        queryKey: ["my-career", "report", result.runId],
      });
    },
    onError: () => {
      saved.current = false;
    },
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  useEffect(() => {
    if (signedIn !== true || saved.current) return;
    saved.current = true;
    mut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Phase 2 final pass, section 8 — accessible, unobtrusive inline save
  // status. Anonymous users see nothing (signedIn === false). Internal
  // error text is never surfaced; the same completionId prevents duplicate
  // rows server-side, so a manual retry is safe.
  if (signedIn !== true) return null;

  const isSaving = mut.isPending;
  const isSaved = mut.isSuccess && (mut.data as any)?.saved;
  const isFailed = mut.isError || (mut.isSuccess && !(mut.data as any)?.saved);

  const savingLbl = lang === "sv" ? "Sparar din rapport…" : "Saving your report…";
  const savedLbl =
    lang === "sv"
      ? "Rapporten har sparats i Min karriär."
      : "Your report has been saved to My career.";
  const failedLbl =
    lang === "sv"
      ? "Resultatet visas, men rapporten kunde inte sparas."
      : "Your result is shown, but the report could not be saved.";
  const retryLbl = lang === "sv" ? "Försök igen" : "Try again";

  return (
    <div
      role="status"
      aria-live="polite"
      className="print:hidden mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground"
    >
      {isSaving && <span>{savingLbl}</span>}
      {isSaved && <span className="text-foreground">{savedLbl}</span>}
      {isFailed && !isSaving && (
        <>
          <span>{failedLbl}</span>
          <button
            type="button"
            onClick={() => mut.mutate()}
            className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {retryLbl}
          </button>
        </>
      )}
    </div>
  );
}
