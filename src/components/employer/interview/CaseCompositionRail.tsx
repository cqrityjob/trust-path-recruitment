// What the CASE follows: its pinned composition version, never the
// recruitment's current one. A short panel with a link to where the setup
// is edited; absent when the slot is not installed.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { getCaseComposition } from "@/lib/recruitment/lifecycle-v03.functions";
import { RailPanel } from "./InterviewLayout";

export function CaseCompositionRail({
  caseId,
  jobId,
  employerSlug,
}: {
  caseId: string;
  jobId: string | null;
  employerSlug: string;
}) {
  const { t } = useT();
  const read = useServerFn(getCaseComposition);
  const query = useQuery({
    queryKey: ["ii", "composition", caseId],
    queryFn: () => read({ data: { caseId } }),
  });
  if (!query.data || !query.data.installed) return null;
  const c = query.data;
  return (
    <RailPanel id="s-composition" title={t("rec.composition.case.heading")}>
      <div data-testid="case-composition" data-version={c.version} className="text-sm">
        <p>
          {c.version > 0
            ? t("rec.composition.case.pinned").replace("{v}", String(c.version))
            : t("rec.composition.case.none")}
        </p>
        {c.version > 0 && c.currentVersion > c.version && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("rec.composition.case.newer").replace("{v}", String(c.currentVersion))}
          </p>
        )}
        {jobId && (
          <Link
            to="/employer/$employerSlug/jobs/$jobId"
            params={{ employerSlug, jobId }}
            search={{ step: "requirements" as const }}
            hash="interview-composition"
            className="mt-2 inline-flex min-h-[44px] items-center text-xs font-medium text-accent underline-offset-2 hover:underline"
          >
            {t("rec.composition.case.open")}
          </Link>
        )}
      </div>
    </RailPanel>
  );
}
