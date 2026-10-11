// "Nästa ogranskade": the one application a reviewer should open next, as the
// server picks it (rec_ri_next_unreviewed, installed slot 20270310100000):
// the oldest OPEN application without a confirmed review, with how many
// remain and how many historical ones (decided, archived, withdrawn) stand
// outside the queue -- those never read as confirmations of anything.
//
// Rendered inside the review-queue box on the overview and under the
// pipeline on a recruitment's candidate step. No ranking: "next" is the
// oldest, nothing else.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import { getNextUnreviewed } from "@/lib/recruitment/requirement-workspace.functions";

function nextUnreviewedQueryKey(employerId: string, jobId: string | null) {
  return ["employer", employerId, "next-unreviewed", jobId ?? "all"] as const;
}

export function NextUnreviewed({
  employerId,
  employerSlug,
  jobId,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string | null;
}) {
  const { t } = useT();
  const read = useServerFn(getNextUnreviewed);
  const query = useQuery({
    queryKey: nextUnreviewedQueryKey(employerId, jobId),
    queryFn: () => read({ data: { employerId, jobId } }),
  });
  if (query.isPending)
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="next-unreviewed"
        data-state="loading"
      >
        …
      </p>
    );
  if (query.isError)
    return (
      <p role="alert" className="text-xs" data-testid="next-unreviewed" data-state="error">
        {t("rec.queue.unavailable")}{" "}
        <button type="button" className="underline" onClick={() => void query.refetch()}>
          {t("continuity.next.retry")}
        </button>
      </p>
    );
  const d = query.data;
  return (
    <div
      className="text-sm"
      data-testid="next-unreviewed"
      data-state={d.next ? "next" : "done"}
      data-remaining={d.remaining}
      data-historical={d.historicalExcluded}
    >
      {d.next ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("rec.queue.next")}
          </span>
          <Link
            to="/employer/$employerSlug/applications/$applicationId"
            params={{ employerSlug, applicationId: d.next.applicationId }}
            search={{}}
            data-testid="next-unreviewed-open"
            className="inline-flex min-h-9 items-center gap-1 font-medium text-accent hover:underline"
          >
            {d.next.name ?? t("employer.applications.anonymousCandidate")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <span className="text-xs text-muted-foreground">
            {t("rec.queue.remaining").replace("{n}", String(d.remaining))}
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("rec.queue.done")}</p>
      )}
      {d.historicalExcluded > 0 && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("rec.queue.historical").replace("{n}", String(d.historicalExcluded))}
        </p>
      )}
    </div>
  );
}
