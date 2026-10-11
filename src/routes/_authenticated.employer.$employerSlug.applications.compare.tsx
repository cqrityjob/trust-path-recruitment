// Compare two or three candidates of ONE recruitment, side by side, against
// the SAME requirement profile version.
//
// What the page is: the server's own criteria for each application
// (rec_ri_compare_applications -> rec_ri_get_review per application), one row
// per requirement, one column per candidate, every cell source-bound: the
// state, the evidence behind it, who confirmed it and when -- or that nobody
// has. The server refuses to compare against a profile version that is no
// longer the latest (RI_SOURCE_STALE); the page then re-reads the profile and
// compares against the new version, and says so.
//
// What the page is NOT: a ranking. Nothing is ordered by merit, no total is
// computed, merits never compensate for a mandatory requirement, and a review
// that concerns an older profile version is shown as exactly that -- never as
// a confirmation of the current requirements.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { RecruitmentPage } from "@/components/academy/AcademyWorkspace";
import {
  RequirementStatusBadge,
  ReviewStatusBadge,
} from "@/components/recruitment/RecruiterStatus";
import { getRequirementProfile } from "@/lib/recruitment/requirement-intelligence.functions";
import {
  compareApplications,
  type ComparedApplication,
} from "@/lib/recruitment/requirement-workspace.functions";
import type { RequirementCriterion } from "@/lib/recruitment/requirement-intelligence";
import { getRecruitmentTeam } from "@/lib/recruitment/recruitment.functions";
import { sourceLabels } from "@/lib/recruitment/requirement-presentation";
import { formatStamp } from "@/lib/recruitment/format";

const searchSchema = z.object({
  job: z.string().uuid().optional().catch(undefined),
  /** The two or three application ids to compare, comma-separated. */
  compare: z.string().max(120).optional().catch(undefined),
  list: z.string().max(20).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/applications/compare")(
  {
    ssr: false,
    component: CompareRoute,
    validateSearch: (search) => searchSchema.parse(search),
  },
);

function CompareRoute() {
  const { employerSlug } = Route.useParams();
  const search = Route.useSearch();
  return (
    <RecruitmentPage employerSlug={employerSlug}>
      {(ws) => (
        <ComparePage
          employerId={ws.employerId}
          employerSlug={employerSlug}
          jobId={search.job ?? null}
          ids={(search.compare ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => /^[0-9a-f-]{36}$/i.test(s))}
          listKey={search.list ?? null}
        />
      )}
    </RecruitmentPage>
  );
}

const btn =
  "inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function ComparePage({
  employerId,
  employerSlug,
  jobId,
  ids,
  listKey,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string | null;
  ids: string[];
  listKey: string | null;
}) {
  const { t, lang } = useT();
  const readProfile = useServerFn(getRequirementProfile);
  const compare = useServerFn(compareApplications);
  const readTeam = useServerFn(getRecruitmentTeam);
  const valid =
    jobId !== null && ids.length >= 2 && ids.length <= 3 && new Set(ids).size === ids.length;
  // The profile first: the comparison is bound to its LATEST version, and the
  // same query key the requirement step edits keeps the two in step.
  const profile = useQuery({
    queryKey: ["employer", employerId, "requirement-profile", jobId],
    queryFn: () => readProfile({ data: { employerId, jobId: jobId! } }),
    enabled: valid,
  });
  const profileId = profile.data?.profileId ?? null;
  const comparison = useQuery({
    queryKey: ["employer", employerId, "compare", jobId, profileId, ids.join(",")],
    queryFn: () =>
      compare({ data: { employerId, jobId: jobId!, profileId: profileId!, applicationIds: ids } }),
    enabled: valid && profileId !== null,
    retry: false,
  });
  const team = useQuery({
    queryKey: ["employer", employerId, "team"],
    queryFn: () => readTeam({ data: { employerId } }),
  });
  // Stale: the profile moved on between the list and this page. Re-read the
  // profile; the comparison then re-runs against the new version.
  const stale = comparison.isError && (comparison.error as Error).message === "RI_SOURCE_STALE";
  useEffect(() => {
    if (stale) void profile.refetch();
  }, [stale, profile]);

  const backTo = jobId
    ? {
        to: "/employer/$employerSlug/jobs/$jobId" as const,
        params: { employerSlug, jobId },
        search: { step: "applications" as const },
      }
    : { to: "/employer/$employerSlug/applications" as const, params: { employerSlug }, search: {} };
  const back = (
    <Link {...backTo} className={btn} data-testid="compare-back">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("rec.compare.back")}
    </Link>
  );
  const reviewerName = (id: string | null) =>
    id ? (team.data?.find((m) => m.userId === id)?.name ?? "—") : "—";
  const label = (c: RequirementCriterion) =>
    (lang === "sv" ? c.labelSv || c.labelEn : c.labelEn || c.labelSv) ??
    (lang === "sv" ? c.instructionSv : c.instructionEn || c.instructionSv);

  if (!valid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6" data-testid="compare-page" data-state="invalid">
        <h1 className="text-2xl font-semibold text-foreground">{t("rec.compare.title")}</h1>
        <p role="alert" className="mt-3 text-sm">
          {t("rec.compare.invalid")}
        </p>
        <div className="mt-4">{back}</div>
      </div>
    );
  }
  if (profile.isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6" data-testid="compare-page" data-state="error">
        <Problem text={t("rec.compare.unavailable")} onRetry={() => void profile.refetch()} />
        <div className="mt-4">{back}</div>
      </div>
    );
  }
  if (profile.isPending) {
    return (
      <p
        className="px-4 py-6 text-sm text-muted-foreground"
        data-testid="compare-page"
        data-state="loading"
      >
        {t("rec.compare.loading")}
      </p>
    );
  }
  if (!profileId) {
    return (
      <div
        className="mx-auto max-w-5xl px-4 py-6"
        data-testid="compare-page"
        data-state="no-profile"
      >
        <h1 className="text-2xl font-semibold text-foreground">{t("rec.compare.title")}</h1>
        <p className="mt-3 text-sm">
          {t("rec.compare.noProfile")}{" "}
          <Link
            to="/employer/$employerSlug/jobs/$jobId"
            params={{ employerSlug, jobId: jobId! }}
            search={{ step: "requirements" as const }}
            className="font-medium text-accent hover:underline"
          >
            {t("rec.compare.openProfile")}
          </Link>
        </p>
        <div className="mt-4">{back}</div>
      </div>
    );
  }

  const rows: ComparedApplication[] = comparison.data ?? [];
  // Rows are the profile's rules in their order; the server's criteria are
  // looked up per candidate so a requirement is one row across the columns.
  const requirements = profile.data.rules.slice().sort((a, b) => a.position - b.position);

  return (
    <div
      className="mx-auto max-w-6xl px-4 py-6"
      data-testid="compare-page"
      data-state={comparison.isPending ? "loading" : comparison.isError ? "error" : "ready"}
      data-profile-version={profile.data.version}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("rec.compare.title")}</h1>
          <p className="mt-1 max-w-[72ch] text-sm text-muted-foreground">{t("rec.compare.lede")}</p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="compare-profile-version">
            {t("rec.compare.profile").replace("{v}", String(profile.data.version))}
          </p>
        </div>
        {back}
      </div>
      {stale && (
        <p
          role="status"
          className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          data-testid="compare-stale"
        >
          {t("rec.compare.stale")}
        </p>
      )}
      {comparison.isError && !stale && (
        <div className="mt-3">
          <Problem
            text={t(
              (comparison.error as Error).message === "RI_COMPARISON_INVALID"
                ? "rec.compare.invalid"
                : "rec.compare.unavailable",
            )}
            onRetry={() => void comparison.refetch()}
          />
        </div>
      )}
      {comparison.isPending && (
        <p className="mt-3 text-sm text-muted-foreground">{t("rec.compare.loading")}</p>
      )}
      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table
            className="w-full min-w-[40rem] border-collapse text-sm"
            data-testid="compare-table"
          >
            <thead>
              <tr className="border-b border-border text-left align-top">
                <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">
                  {t("rec.compare.requirement")}
                </th>
                {rows.map((r) => (
                  <th
                    key={r.review.applicationId}
                    scope="col"
                    className="py-2 pr-3"
                    data-testid="compare-candidate"
                    data-application-id={r.review.applicationId}
                    data-status={r.review.requirementStatus}
                    data-review={r.review.reviewState}
                  >
                    <Link
                      to="/employer/$employerSlug/applications/$applicationId"
                      params={{ employerSlug, applicationId: r.review.applicationId }}
                      search={listKey ? { list: listKey } : {}}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {r.name ?? "—"}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <RequirementStatusBadge status={r.review.requirementStatus} />
                      <ReviewStatusBadge status={r.review.reviewState} />
                    </div>
                    {r.review.reviewState === "stale" && (
                      <p className="mt-1 text-xs font-normal text-muted-foreground">
                        {t("rec.compare.staleReview")}
                      </p>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requirements.map((rule) => (
                <tr
                  key={rule.requirementId}
                  className="border-b border-border/70 align-top"
                  data-testid="compare-row"
                  data-requirement-id={rule.requirementId}
                >
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {(lang === "sv"
                      ? rule.labelSv || rule.labelEn
                      : rule.labelEn || rule.labelSv) ?? rule.instructionSv}
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {rule.kind === "mandatory"
                        ? lang === "sv"
                          ? "Skallkrav"
                          : "Mandatory"
                        : t("rec.compare.merit")}
                    </span>
                  </th>
                  {rows.map((r) => {
                    const c = r.review.criteria.find((x) => x.requirementId === rule.requirementId);
                    return (
                      <td
                        key={r.review.applicationId}
                        className="py-2 pr-3"
                        data-testid="compare-cell"
                        data-state={c?.state ?? "missing"}
                      >
                        {c ? (
                          <Cell
                            c={c}
                            label={label}
                            reviewerName={reviewerName}
                            stale={r.review.reviewState === "stale"}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cell({
  c,
  reviewerName,
  stale,
}: {
  c: RequirementCriterion;
  label: (c: RequirementCriterion) => string;
  reviewerName: (id: string | null) => string;
  stale: boolean;
}) {
  const { t, lang } = useT();
  const human = c.reviewedAt !== null || c.reviewedBy !== null;
  const stateKey = `rec.summary.state.${c.state}` as TranslationKey;
  return (
    <div className="text-sm">
      <p className="font-medium">
        {c.kind === "mandatory" ? t(stateKey) : t("rec.summary.detail.merit")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("rec.compare.source")}:{" "}
        {c.source
          ? `${sourceLabels[lang][c.source.kind as keyof (typeof sourceLabels)["sv"]]} – ${c.source.label}${
              c.sourceCurrent ? "" : ` (${t("rec.compare.sourceChanged")})`
            }`
          : t("rec.compare.noSource")}
      </p>
      <p className="text-xs text-muted-foreground">
        {human
          ? stale
            ? t("rec.compare.staleReview")
            : t("rec.compare.reviewed")
                .replace("{name}", reviewerName(c.reviewedBy))
                .replace("{date}", c.reviewedAt ? formatStamp(c.reviewedAt, lang) : "—")
          : c.state === "clarify" && !c.source
            ? t("rec.compare.unreviewed")
            : t("rec.compare.preliminary")}
      </p>
    </div>
  );
}

function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { t } = useT();
  return (
    <p
      role="alert"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      {text}{" "}
      <button type="button" className="font-medium underline" onClick={onRetry}>
        {t("continuity.next.retry")}
      </button>
    </p>
  );
}
