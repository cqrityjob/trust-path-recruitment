// Phase E — client-only side-effect that persists a slim Career Profile
// snapshot for the current signed-in user after they complete the CIE
// assessment. Renders nothing.
//
// Anonymous users are silently ignored — their answers stay in session
// state and drive the results page normally. Job relevance guidance
// requires a saved profile, so the user is invited to sign in from the
// jobs surfaces if they want that layer.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { AnswerMap } from "@/lib/career-assessment/types";
import { buildCareerProfileForJobs } from "@/lib/career-intelligence-engine/profile-for-jobs";
import { saveMyCareerProfileForJobs } from "@/lib/job-intelligence/relevance.functions";

export function CareerProfileForJobsSaver({
  answers,
  lang,
}: {
  answers: AnswerMap;
  lang: "sv" | "en";
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const saved = useRef(false);
  const save = useServerFn(saveMyCareerProfileForJobs);

  const profile = useMemo(() => buildCareerProfileForJobs(answers), [answers]);

  const mut = useMutation({
    mutationFn: () => save({ data: { locale: lang, profile } }),
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