import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { listRecruitmentCandidatesPage } from "@/lib/recruitment/recruitment.functions";
import { RecruiterCounts } from "./RecruiterStatus";

export function RecruiterOverviewCounts({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { lang } = useT();
  const read = useServerFn(listRecruitmentCandidatesPage);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["employer", employerId, "candidates", "overview"],
    queryFn: () => read({ data: { employerId, jobId: null, view: { stage: "received" } } }),
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
        scopeLabel={
          lang === "sv"
            ? "Organisationens samtliga mottagna ansökningar"
            : "All applications received by the organisation"
        }
        onView={(search) => {
          void navigate({
            to: "/employer/$employerSlug/applications",
            params: { employerSlug },
            search,
          });
        }}
      />
    </div>
  );
}
