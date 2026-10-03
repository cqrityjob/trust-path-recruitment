import { restoreJobListPosition } from "@/lib/job-intelligence/job-list-position";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, Search, MapPin, X, ArrowRight, BriefcaseBusiness } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { JobCard } from "@/components/jobs/JobCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import {
  employmentTypeLabel,
  workplaceTypeLabel,
  experienceLevelLabel,
  EMPLOYMENT_TYPE_VALUES,
  WORKPLACE_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
} from "@/lib/job-intelligence/enum-labels";
import { useState, useEffect } from "react";
import {
  jobSearchToFrom,
  validateJobSearch,
  type JobSearch,
} from "@/lib/job-intelligence/job-search";
import { siteUrl } from "@/lib/site-origin";

const SV = dictionaries.sv;
export const Route = createFileRoute("/jobs/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: SV["meta.jobs.title"] },
      { name: "description", content: SV["jobs.discover.lead"] },
      { property: "og:title", content: SV["meta.jobs.title"] },
      { property: "og:description", content: SV["jobs.discover.lead"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: siteUrl("/jobs") },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: siteUrl("/jobs") }],
  }),
  validateSearch: validateJobSearch,
  component: JobsDiscoveryPage,
});

// ── THE JOBS PAGE (owner review, 2026-09-30) ───────────────────────────
//
// List first. Every card opens the advert on its own page, /jobs/$slug —
// the page that owns applying (internal and external), sign-in continuity,
// "Mina ansökningar" and the way back to exactly these results. The desktop
// detail panel that repeated the selected advert beside the list is gone:
// it showed one advert twice and pushed the list into a narrow column.
//
// `?selected=` is still ACCEPTED, so a link shared while the panel existed
// keeps working: it forwards (replacing the history entry) to that advert's
// own page, with the rest of the search as its way back.

function JobsDiscoveryPage() {
  const { t, lang } = useT();
  const sv = lang === "sv";
  useLocalizedHead("meta.jobs.title", "jobs.discover.lead");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [qInput, setQInput] = useState(search.q ?? "");
  const [locInput, setLocInput] = useState(search.location ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    setQInput(search.q ?? "");
    setLocInput(search.location ?? "");
  }, [search.q, search.location]);

  const { selected: legacySelected, ...querySearch } = search;
  const from = jobSearchToFrom(querySearch);
  useEffect(() => {
    if (!legacySelected) return;
    void navigate({
      to: "/jobs/$slug",
      params: { slug: legacySelected },
      search: from ? { from } : {},
      replace: true,
    });
  }, [legacySelected, from, navigate]);

  const page = Number(search.page ?? 1);
  const jobsQuery = useQuery({
    queryKey: ["public-jobs", querySearch],
    retry: false,
    enabled: !legacySelected,
    queryFn: () =>
      listPublicJobs({
        q: search.q,
        location: search.location,
        familyId: search.family,
        employmentType: search.employment,
        workplaceType: search.workplace,
        experienceLevel: search.experience,
        country: search.country,
        sort: search.sort === "deadline" ? "deadline" : "newest",
        limit: 21,
        offset: (page - 1) * 20,
      }),
  });
  const jobs = jobsQuery.data?.slice(0, 20);
  useEffect(() => {
    if (jobsQuery.isSuccess) return restoreJobListPosition(from);
  }, [jobsQuery.isSuccess, from]);
  const setParam = (key: Exclude<keyof JobSearch, "selected">, value: string) =>
    navigate({
      search: (prev: JobSearch) => ({
        ...prev,
        [key]: value || undefined,
        selected: undefined,
        ...(key !== "page" ? { page: undefined } : {}),
      }),
      resetScroll: false,
    });
  const reset = () => navigate({ search: {}, resetScroll: false });
  const filterOptions = [
    {
      key: "family",
      label: t("jobs.filter.family"),
      options: careerAreaLabels.map((f) => ({ value: f.id, label: f.name[lang] })),
    },
    {
      key: "employment",
      label: t("jobs.filter.employment_type"),
      options: EMPLOYMENT_TYPE_VALUES.map((v) => ({
        value: v,
        label: employmentTypeLabel(v, lang),
      })),
    },
    {
      key: "workplace",
      label: t("jobs.filter.workplace_type"),
      options: WORKPLACE_TYPE_VALUES.map((v) => ({ value: v, label: workplaceTypeLabel(v, lang) })),
    },
    {
      key: "experience",
      label: t("jobs.filter.experience_level"),
      options: EXPERIENCE_LEVEL_VALUES.map((v) => ({
        value: v,
        label: experienceLevelLabel(v, lang),
      })),
    },
    {
      key: "country",
      label: t("jobs.filter.country"),
      options: ["SE", "NO", "DK", "FI"].map((value) => ({
        value,
        label: new Intl.DisplayNames([sv ? "sv" : "en"], { type: "region" }).of(value) ?? value,
      })),
    },
  ] as const;
  const active = [
    ...(search.q ? [{ key: "q", label: search.q }] : []),
    ...(search.location ? [{ key: "location", label: search.location }] : []),
    ...filterOptions.flatMap((f) =>
      search[f.key]
        ? [
            {
              key: f.key,
              label: `${f.label}: ${f.options.find((o) => o.value === search[f.key])?.label ?? search[f.key]}`,
            },
          ]
        : [],
    ),
  ];
  const filterCount = active.filter((a) => !["q", "location"].includes(a.key)).length;
  const count = jobs?.length ?? 0;

  return (
    <SiteLayout>
      <Section className="py-7 md:py-9" containerClassName="max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <h1
              className="text-3xl font-semibold tracking-tight md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("jobs.discover.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {t("jobs.discover.lead")}
            </p>
          </div>
          <Link
            to="/my-career/applications"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
            {t("jobs.myApplications")}
          </Link>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({
              search: (prev) => ({
                ...prev,
                q: qInput.trim() || undefined,
                location: locInput.trim() || undefined,
                selected: undefined,
                page: undefined,
              }),
              resetScroll: false,
            });
          }}
          className="mt-6 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4"
          role="search"
          aria-label={t("jobs.discover.title")}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
            <label className="col-span-2 block min-w-0 sm:col-span-1">
              <span className="mb-1.5 block text-xs font-semibold">
                {t("jobs.search.keywordLabel")}
              </span>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="h-11 pl-9"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder={t("jobs.search.keywordPlaceholder")}
                />
              </span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold">
                {t("jobs.search.locationLabel")}
              </span>
              <span className="relative block">
                <MapPin
                  className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="h-11 pl-9"
                  value={locInput}
                  onChange={(e) => setLocInput(e.target.value)}
                  placeholder={t("jobs.search.locationPlaceholder")}
                />
              </span>
            </label>
            <Button type="submit" className="h-11 self-end px-4 sm:px-7">
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("jobs.search.button")}
            </Button>
          </div>
        </form>
        {/* Said once, quietly, where a visitor wonders — not as a headline. */}
        <p data-jobs-public-note className="mt-2 text-xs text-muted-foreground">
          {t("jobs.discover.publicNote")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            aria-expanded={filtersOpen}
            aria-controls="job-filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("jobs.filter.toggle")}
            {filterCount > 0 ? ` (${filterCount})` : ""}
          </Button>
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => void setParam(f.key as Exclude<keyof JobSearch, "selected">, "")}
              aria-label={`${t("jobs.filter.remove")}: ${f.label}`}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-secondary px-3 text-sm text-secondary-foreground hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="break-words">{f.label}</span>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          ))}
          {!!active.length && (
            <Button variant="ghost" className="min-h-11" onClick={() => void reset()}>
              {t("jobs.filter.clearAll")}
            </Button>
          )}
        </div>
        {filtersOpen && (
          <div
            id="job-filters"
            className="mt-3 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            {filterOptions.map((f) => (
              <FilterSelect
                key={f.key}
                label={f.label}
                value={search[f.key] ?? ""}
                onChange={(v) => void setParam(f.key, v)}
                options={f.options}
                anyLabel={t("jobs.filter.any")}
              />
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <p role="status" className="text-sm font-medium">
            {jobsQuery.isLoading || legacySelected
              ? t("jobs.results.loading")
              : jobsQuery.isError
                ? t("jobs.results.loadFailed")
                : jobsQuery.data && jobsQuery.data.length > 20
                  ? t("jobs.results.range")
                      .replace("{from}", String((page - 1) * 20 + 1))
                      .replace("{to}", String(page * 20))
                  : `${(count === 1 ? t("jobs.results.count_one") : t("jobs.results.count_other")).replace("{n}", String(count))}${page > 1 ? ` · ${t("jobs.results.pageSuffix").replace("{n}", String(page))}` : ""}`}
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("jobs.sort.label")}</span>
            <select
              className="min-h-11 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              value={search.sort ?? "newest"}
              onChange={(e) => void setParam("sort", e.target.value)}
            >
              <option value="newest">{t("jobs.sort.newest")}</option>
              <option value="deadline">{t("jobs.sort.deadline")}</option>
            </select>
          </label>
        </div>
        {jobsQuery.isLoading || legacySelected ? (
          <div
            className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-busy="true"
            aria-label={t("jobs.results.loading")}
          >
            <div className="h-56 rounded-xl bg-muted" />
            <div className="hidden h-56 rounded-xl bg-muted md:block" />
            <div className="hidden h-56 rounded-xl bg-muted xl:block" />
          </div>
        ) : jobsQuery.isError ? (
          <div role="alert" className="mt-5 rounded-xl border border-border p-8">
            <h2 className="text-lg font-semibold">{t("jobs.results.error.title")}</h2>
            <p className="mt-2 text-muted-foreground">{t("jobs.results.error.body")}</p>
            <Button className="mt-4" onClick={() => void jobsQuery.refetch()}>
              {t("jobs.action.retry")}
            </Button>
          </div>
        ) : !jobs?.length ? (
          <div className="mt-5 rounded-xl border border-border bg-card px-6 py-12 text-center">
            <Search className="mx-auto mb-4 h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold">
              {page > 1
                ? t("jobs.empty.pageTitle")
                : active.length
                  ? t("jobs.results.empty.title")
                  : t("jobs.empty.noneTitle")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              {page > 1
                ? t("jobs.empty.pageBody")
                : active.length
                  ? t("jobs.empty.filteredBody")
                  : t("jobs.empty.noneBody")}
            </p>
            {page > 1 ? (
              <Button className="mt-5" onClick={() => void setParam("page", "")}>
                {t("jobs.empty.pageAction")}
              </Button>
            ) : active.length ? (
              <Button className="mt-5" onClick={() => void reset()}>
                {t("jobs.filter.clearAll")}
              </Button>
            ) : (
              <Link
                to="/career-center"
                className="mt-5 inline-flex min-h-11 items-center font-semibold text-accent underline"
              >
                {t("jobs.empty.noneAction")}
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <ul
              aria-label={t("jobs.list.label")}
              data-jobs-list
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {jobs.map((job) => (
                <li key={job.id} className="flex min-w-0">
                  <JobCard job={job} lang={lang} from={from} />
                </li>
              ))}
            </ul>
            {(page > 1 || (jobsQuery.data?.length ?? 0) > 20) && (
              <nav
                aria-label={t("jobs.pagination.label")}
                className="mt-6 flex justify-between gap-3"
              >
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => void setParam("page", String(page - 1))}
                >
                  {t("jobs.pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  disabled={(jobsQuery.data?.length ?? 0) <= 20}
                  onClick={() => void setParam("page", String(page + 1))}
                >
                  {t("jobs.pagination.next")}
                </Button>
              </nav>
            )}
          </div>
        )}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
          <Link
            to="/career-center"
            className="inline-flex min-h-11 items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {t("jobs.footer.careers")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/employers"
            className="inline-flex min-h-11 items-center hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {t("jobs.footer.employers")}
          </Link>
        </div>
      </Section>
    </SiteLayout>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  anyLabel: string;
}) {
  return (
    <label className="block min-w-0 text-xs font-medium">
      <span className="mb-1.5 block">{label}</span>
      <select
        className="min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
