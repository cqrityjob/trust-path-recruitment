import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { listRecruitmentCandidatesPage } from "@/lib/recruitment/recruitment.functions";
import { compactView } from "@/lib/recruitment/definitions";
import { RecruiterCounts } from "./RecruiterStatus";

export function RecruiterOverviewCounts({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { lang, t } = useT();
  const read = useServerFn(listRecruitmentCandidatesPage);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["employer", employerId, "candidates", "overview"],
    queryFn: () => read({ data: { employerId, jobId: null, view: { stage: "received" } } }),
  });
  // The work that can be done now: OPEN applications (not archived, no
  // decision) without a confirmed review. A second, narrower read of the same
  // list, so the number is the length of exactly the list its button opens --
  // the historical "remaining" above it also counts the archived and decided
  // applications a person can no longer review.
  const queueView = { stage: "open", review: "remaining" } as const;
  const queue = useQuery({
    queryKey: ["employer", employerId, "candidates", "overview-queue"],
    queryFn: () => read({ data: { employerId, jobId: null, view: queueView } }),
  });
  if (query.isPending)
    return (
      <p className="my-4 text-sm">
        {lang === "sv"
          ? "Läser ansökningarnas kravstatus…"
          : "Loading application requirement status…"}
      </p>
    );
  if (query.isError || !query.data.intelligenceCounts)
    return (
      <div role="alert" className="my-4 rounded border border-border p-3 text-sm">
        {lang === "sv"
          ? "Ansökningsantal kunde inte läsas."
          : "Application counts could not be loaded."}
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="ml-2 min-h-11 underline"
        >
          {lang === "sv" ? "Försök igen" : "Retry"}
        </button>
      </div>
    );
  return (
    <div className="mt-5">
      <RecruiterCounts
        counts={query.data.intelligenceCounts}
        collapsible
        title={t("rec.overview.counts.title")}
        intro={t("rec.overview.counts.intro")}
        queue={{
          count: queue.isSuccess ? queue.data.total : queue.isError ? "failed" : null,
          view: queueView,
          retry: () => void queue.refetch(),
        }}
        scopeLabel={
          lang === "sv"
            ? "Organisationens samtliga mottagna ansökningar"
            : "All applications received by the organisation"
        }
        onView={(search) => {
          // The same short URL the flow strip links to (`?review=remaining`,
          // the default stage left out), so the two ways into the queue are
          // one address.
          void navigate({
            to: "/employer/$employerSlug/applications",
            params: { employerSlug },
            search: compactView(search),
          });
        }}
      />
    </div>
  );
}
