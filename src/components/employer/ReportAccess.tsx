// The employer UI's honest answer to "may I see results here?".
//
// The database decides (employer_reports_readable and everything that asks it);
// an ordinary member of an organisation reads no rows and no counts. Without
// this, such a member would meet an empty candidate list that reads as "no
// candidates", or a report page that fails with a generic error. This reads the
// caller's own facts once (employer_report_access, cached) and lets a screen
// say what is true: you are a member of this organisation, and results are not
// yours to see -- ask an owner or an administrator.
//
// Nothing here is the permission check, and a screen that does not use it is no
// less safe. Before the migration is applied the facts are unknown and every
// screen renders exactly as before. See src/lib/security-competency/report-access.ts.

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { getMyReportAccess } from "@/lib/security-competency/report-access.functions";
import {
  reportAccessStateFor,
  type ReportAccessFacts,
  type ReportAccessInput,
  type ReportAccessState,
  type ReportNeed,
} from "@/lib/security-competency/report-access";

/** One cached read per organisation, shared by every screen and tab that asks. */
export function useReportAccess(employerId: string | null | undefined, enabled = true) {
  const fn = useServerFn(getMyReportAccess);
  const query = useQuery({
    queryKey: ["employer", employerId, "report-access"],
    queryFn: () => fn({ data: { employerId: employerId as string } }),
    enabled: enabled && Boolean(employerId),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const input: ReportAccessInput = query.isError
    ? { status: "error" }
    : query.data
      ? { status: "success", known: query.data.known, facts: query.data.facts }
      : enabled && employerId
        ? { status: "pending" }
        : { status: "error" };

  const facts: ReportAccessFacts | null = query.data?.facts ?? null;
  return {
    facts,
    /** The decision for a screen with this need. `unknown` means: show what the database returns. */
    stateFor: (need: ReportNeed): ReportAccessState => reportAccessStateFor(input, need),
  };
}

const TITLE: Record<ReportNeed, TranslationKey> = {
  reports: "reportAccess.results.title",
  recruitment: "reportAccess.results.title",
  workforce: "reportAccess.workforce.title",
  interviews: "reportAccess.interviews.title",
};
const BODY: Record<ReportNeed, TranslationKey> = {
  reports: "reportAccess.results.body",
  recruitment: "reportAccess.results.body",
  workforce: "reportAccess.workforce.body",
  interviews: "reportAccess.interviews.body",
};

/** What an ordinary member sees in place of a list or a report they may not read. */
export function ReportAccessNotice({ need }: { need: ReportNeed }) {
  const { t } = useT();
  return (
    <section
      role="status"
      data-testid="report-access-none"
      data-need={need}
      className="mx-auto max-w-2xl rounded-[12px] border border-border bg-card p-6"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t(TITLE[need])}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(BODY[need])}</p>
      <p className="mt-3 text-sm font-medium text-foreground">{t("reportAccess.ask")}</p>
    </section>
  );
}

/**
 * Renders `children` unless the database has CONFIRMED that the caller, an
 * active member, has no basis to read what this screen shows -- then the notice.
 * While the answer is on its way, a status line; when it cannot be known
 * (migration not applied, call failed), the screen as it always was.
 */
export function ReportsRequired({
  employerId,
  need = "reports",
  children,
}: {
  employerId: string;
  need?: ReportNeed;
  children: ReactNode;
}) {
  const { t } = useT();
  const access = useReportAccess(employerId);
  const state = access.stateFor(need);
  if (state === "loading") {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {t("employer.loading")}
      </p>
    );
  }
  if (state === "none") return <ReportAccessNotice need={need} />;
  return <>{children}</>;
}
