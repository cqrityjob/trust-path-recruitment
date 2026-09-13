// /my-career/preparation/$assignmentId — the candidate's BESKT preparation.
//
// It lives under the My Career shell, which owns <SiteLayout> and the hub
// strip, so this route renders its own <Section> and nothing else. The shell's
// `_authenticated` gate is the sign-in boundary; the OWNERSHIP boundary is the
// database's (bcp_candidate_preparation refuses any assignment that is not
// the caller's), so a guessed assignment id in the URL reaches a refusal, not
// somebody else's preparation.

import { createFileRoute } from "@tanstack/react-router";

import { Section } from "@/components/site/Section";
import { CandidatePreparation } from "@/components/beskt/CandidatePreparation";

export const Route = createFileRoute("/_authenticated/my-career/preparation/$assignmentId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Interview preparation — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PreparationRoute,
});

function PreparationRoute() {
  const { assignmentId } = Route.useParams();
  return (
    <Section>
      <CandidatePreparation assignmentId={assignmentId} />
    </Section>
  );
}
