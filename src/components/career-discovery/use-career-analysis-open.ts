// Is the career analysis open to THIS reader right now?
//
// ── THE SAME TWO QUESTIONS THE DOOR ASKS ───────────────────────────────
//
// The canonical route asks getV31Availability before it shows its first
// question, and a run started while signed in also has to pass the tester
// gate (v31-public.functions.ts). A page that offers the analysis asks the
// same questions, so it never advertises a door the product will refuse —
// the rule RetakeAnalysisLink and the personal overview already follow.
//
// Three answers, and the third one matters:
//
//   true       open: offer the action
//   false      definitely not open: say so, in the words the page sets
//   undefined  not answered yet, or the read failed. A caller keeps its
//              action: the canonical route asks again and shows its own
//              honest "not open yet" state, so the link is never a dead end,
//              and a failed read is not a closed analysis.
//
// Read-only. It decides nothing and grants nothing.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getV31Availability,
  getV31TesterStatus,
} from "@/lib/career-discovery/v31-public.functions";

export function useCareerAnalysisOpen(signedIn: boolean | null): boolean | undefined {
  const checkAvailability = useServerFn(getV31Availability);
  const checkTesterStatus = useServerFn(getV31TesterStatus);
  const openQ = useQuery({
    queryKey: ["career-discovery", "analysis-open", signedIn === true],
    queryFn: async () => {
      const availability = await checkAvailability({});
      if (!availability.available) return false;
      if (signedIn !== true) return true;
      const status = await checkTesterStatus({});
      return status.allowed;
    },
    // Not before the session is known: a signed-in reader's answer needs the
    // tester gate, and asking twice would flash the wrong state.
    enabled: signedIn !== null,
    staleTime: 60_000,
    retry: false,
  });
  return openQ.data;
}
