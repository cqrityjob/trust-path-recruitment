// Phase E — small hook that exposes the current user's saved
// `CareerProfileForJobsV1` (if any) to the public jobs UI.
//
// The underlying server function is authenticated. To keep the /jobs
// route publicly cacheable we ONLY invoke it once we have observed a
// live Supabase session on the client. Anonymous users get
// `{ status: 'anonymous' }` and the UI renders the assessment invite.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyCareerProfileForJobs,
  type CareerProfileForJobsResponse,
} from "@/lib/job-intelligence/relevance.functions";

export type CareerProfileForJobsState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "no_profile" }
  | {
      status: "ready";
      data: Extract<CareerProfileForJobsResponse, { hasProfile: true }>;
    };

export function useCareerProfileForJobs(): CareerProfileForJobsState {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const fetchProfile = useServerFn(getMyCareerProfileForJobs);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setSignedIn(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const q = useQuery({
    queryKey: ["career-profile-for-jobs", signedIn],
    queryFn: () => fetchProfile(),
    enabled: signedIn === true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (signedIn === null || (signedIn === true && q.isLoading)) {
    return { status: "loading" };
  }
  if (signedIn === false) return { status: "anonymous" };
  if (!q.data || q.data.hasProfile === false) return { status: "no_profile" };
  return { status: "ready", data: q.data };
}