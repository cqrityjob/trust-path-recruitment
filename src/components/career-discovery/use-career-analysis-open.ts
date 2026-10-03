// Is the career analysis open to THIS reader right now?
//
// ── THE ONE CLIENT READER ──────────────────────────────────────────────
//
// Every surface that offers the career analysis — the career centre, a
// profession guide, My Career, the retake link, the history, the Academy
// pointer, the /assessment landing — reads THIS hook, and nothing else. It asks
// the same two server questions the canonical route asks (getV31Availability,
// getV31TesterStatus) and turns them into a decision through the one resolver
// (resolveAnalysisAccess in @/lib/career-discovery/analysis-access). A page
// that carried its own copy of that rule is the defect this replaced:
// scripts/career-analysis-availability-check.ts fails if one comes back.
//
// Three answers, and the third one matters:
//
//   true       open: offer the action
//   false      definitely not open: say so, in the words the page sets
//   undefined  not answered yet, or the read failed. A caller keeps its action:
//              the canonical route asks again and shows its own honest "not
//              open yet" state, so the link is never a dead end, and a failed
//              read is not a closed analysis.
//
// ── CACHED SANELY ──────────────────────────────────────────────────────
//
// The server reads the release control per request (no server cache, no HTTP
// cache). Here the answer is kept for thirty seconds and asked again when the
// tab regains focus, so a pause is visible on a surface within half a minute
// at the latest — and a stale "open" costs one click onto the route, which
// asks again and says the truth. Read-only. It decides nothing and grants
// nothing.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  analysisOpenFlag,
  mayStartFrom,
  resolveAnalysisAccess,
  type AnalysisAccess,
} from "@/lib/career-discovery/analysis-access";
import {
  getV31Availability,
  getV31TesterStatus,
} from "@/lib/career-discovery/v31-public.functions";

/** How long an answer is trusted. Short on purpose: see the header. */
export const ANALYSIS_ACCESS_STALE_MS = 30_000;

/** The full decision, with the reason when it is closed. */
export function useCareerAnalysisAccess(signedIn: boolean | null): AnalysisAccess | undefined {
  const checkAvailability = useServerFn(getV31Availability);
  const checkTesterStatus = useServerFn(getV31TesterStatus);
  const accessQ = useQuery({
    queryKey: ["career-discovery", "analysis-access", signedIn === true],
    queryFn: async (): Promise<AnalysisAccess> => {
      const availability = await checkAvailability({});
      // Asked only when the first answer leaves the question open: a closed
      // product or a signed-out reader needs no second read.
      let mayStart: boolean | null = null;
      if (signedIn === true && availability.available) {
        mayStart = mayStartFrom(await checkTesterStatus({}));
      }
      return resolveAnalysisAccess({ availability, signedIn: signedIn === true, mayStart });
    },
    // Not before the session is known: a signed-in reader's answer needs the
    // gate, and asking twice would flash the wrong state.
    enabled: signedIn !== null,
    staleTime: ANALYSIS_ACCESS_STALE_MS,
    retry: false,
  });
  return accessQ.data;
}

/** The three-valued flag every offer reads. */
export function useCareerAnalysisOpen(signedIn: boolean | null): boolean | undefined {
  return analysisOpenFlag(useCareerAnalysisAccess(signedIn));
}
