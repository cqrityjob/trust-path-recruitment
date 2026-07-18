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

  return null;
}
