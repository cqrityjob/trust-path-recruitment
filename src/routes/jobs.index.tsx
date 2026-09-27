import { restoreJobListPosition } from "@/lib/job-intelligence/job-list-position";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, Search, MapPin, X, ArrowRight, BriefcaseBusiness } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { listPublicJobs, getPublicJobBySlug } from "@/lib/job-intelligence/public-queries";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailContent } from "@/components/jobs/JobDetailContent";
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
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/jobs" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/jobs" }],
  }),
  validateSearch: validateJobSearch,
  component: JobsDiscoveryPage,
});

function JobsDiscoveryPage() {
  const { t, lang } = useT();
  const sv = lang === "sv";
  useLocalizedHead("meta.jobs.title", "jobs.discover.lead");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [qInput, setQInput] = useState(search.q ?? "");
  const [locInput, setLocInput] = useState(search.location ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setQInput(search.q ?? "");
    setLocInput(search.location ?? "");
  }, [search.q, search.location]);

  const { selected: _selected, ...querySearch } = search;
  const page = Number(search.page ?? 1);
  const jobsQuery = useQuery({
    queryKey: ["public-jobs", querySearch],
    retry: false,
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
    if (jobsQuery.isSuccess) return restoreJobListPosition(jobSearchToFrom(search));
  }, [jobsQuery.isSuccess, search]);
  const selected = search.selected ?? jobs?.[0]?.slug;
  const detail = useQuery({
    queryKey: ["public-job", selected],
    retry: false,
    queryFn: () => getPublicJobBySlug(selected!),
    enabled: desktop && !!selected,
  });
  const setParam = (key: keyof JobSearch, value: string) =>
    navigate({
      search: (prev: JobSearch) => ({
        ...prev,
        [key]: value || undefined,
        ...(key !== "selected"
          ? { selected: undefined, ...(key !== "page" ? { page: undefined } : {}) }
          : {}),
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
  const keywordLabel = sv ? "Roll, kompetens eller nyckelord" : "Role, skill or keyword";
  const locationLabel = sv ? "Plats" : "Location";

  return (
    <SiteLayout>
      <Section className="py-7 md:py-9" containerClassName="max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              className="text-3xl font-semibold tracking-tight md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("jobs.discover.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              {sv
                ? "Hitta din nästa roll. Läs och jämför säkerhetsjobb utan konto."
                : "Find your next role. Read and compare security jobs without an account."}
            </p>
          </div>
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
              <span className="mb-1.5 block text-xs font-semibold">{keywordLabel}</span>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="h-11 pl-9"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder={sv ? "Till exempel säkerhetschef" : "For example head of security"}
                />
              </span>
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold">{locationLabel}</span>
              <span className="relative block">
                <MapPin
                  className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="h-11 pl-9"
                  value={locInput}
                  onChange={(e) => setLocInput(e.target.value)}
                  placeholder={sv ? "Ort eller region" : "City or region"}
                />
              </span>
            </label>
            <Button type="submit" className="h-11 self-end px-4 sm:px-7">
              <Search className="mr-2 h-4 w-4" aria-hidden="true" />
              {sv ? "Sök jobb" : "Search jobs"}
            </Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            aria-expanded={filtersOpen}
            aria-controls="job-filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
            Filter
            {active.filter((a) => !["q", "location"].includes(a.key)).length > 0
              ? ` (${active.filter((a) => !["q", "location"].includes(a.key)).length})`
              : ""}
          </Button>
          <Link
            to="/my-career/applications"
            className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
            {sv ? "Mina ansökningar" : "My applications"}
          </Link>
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => void setParam(f.key as keyof JobSearch, "")}
              aria-label={`${sv ? "Ta bort filter" : "Remove filter"}: ${f.label}`}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-secondary px-3 text-sm text-secondary-foreground hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="break-words">{f.label}</span>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          ))}
          {!!active.length && (
            <Button variant="ghost" className="min-h-11" onClick={() => void reset()}>
              {sv ? "Rensa alla" : "Clear all"}
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
            {jobsQuery.isLoading
              ? t("jobs.results.loading")
              : jobsQuery.isError
                ? sv
                  ? "Jobben kunde inte hämtas"
                  : "Could not load jobs"
                : jobsQuery.data && jobsQuery.data.length > 20
                  ? sv
                    ? `Visar ${(page - 1) * 20 + 1}–${page * 20} jobb`
                    : `Showing ${(page - 1) * 20 + 1}–${page * 20} jobs`
                  : `${jobs?.length ?? 0} ${sv ? "jobb" : jobs?.length === 1 ? "job" : "jobs"}${page > 1 ? ` · ${sv ? "sida" : "page"} ${page}` : ""}`}
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span className="text-muted-foreground">{sv ? "Sortera" : "Sort by"}</span>
            <select
              className="min-h-11 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              value={search.sort ?? "newest"}
              onChange={(e) => void setParam("sort", e.target.value)}
            >
              <option value="newest">{sv ? "Senast publicerade" : "Newest first"}</option>
              <option value="deadline">{sv ? "Sista ansökningsdag" : "Closing soon"}</option>
            </select>
          </label>
        </div>
        {jobsQuery.isLoading ? (
          <div
            className="mt-5 grid gap-4 lg:grid-cols-[2fr_3fr]"
            aria-busy="true"
            aria-label={t("jobs.results.loading")}
          >
            <div className="h-72 rounded-xl bg-muted" />
            <div className="hidden h-96 rounded-xl bg-muted lg:block" />
          </div>
        ) : jobsQuery.isError ? (
          <div role="alert" className="mt-5 rounded-xl border border-border p-8">
            <h2 className="text-lg font-semibold">{t("jobs.results.error.title")}</h2>
            <p className="mt-2 text-muted-foreground">{t("jobs.results.error.body")}</p>
            <Button className="mt-4" onClick={() => void jobsQuery.refetch()}>
              {sv ? "Försök igen" : "Try again"}
            </Button>
          </div>
        ) : !jobs?.length ? (
          <div className="mt-5 rounded-xl border border-border bg-card px-6 py-12 text-center">
            <Search className="mx-auto mb-4 h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-semibold">
              {page > 1
                ? sv
                  ? "Inga fler jobb på den här sidan"
                  : "No more jobs on this page"
                : active.length
                  ? sv
                    ? "Inga jobb matchar din sökning"
                    : "No jobs match your search"
                  : sv
                    ? "Inga publicerade jobb just nu"
                    : "No published jobs right now"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              {page > 1
                ? sv
                  ? "Jobbutbudet kan ha ändrats. Gå tillbaka till första sidan med samma sökning."
                  : "The available jobs may have changed. Return to the first page with the same search."
                : active.length
                  ? sv
                    ? "Prova en annan roll, en större region eller färre filter."
                    : "Try another role, a wider area or fewer filters."
                  : sv
                    ? "Välkommen tillbaka. Under tiden kan du utforska yrken och karriärvägar inom säkerhet."
                    : "Check back soon. Meanwhile, explore security roles and career paths."}
            </p>
            {page > 1 ? (
              <Button className="mt-5" onClick={() => void setParam("page", "")}>
                {sv ? "Till första sidan" : "Back to first page"}
              </Button>
            ) : active.length ? (
              <Button className="mt-5" onClick={() => void reset()}>
                {sv ? "Rensa alla" : "Clear all"}
              </Button>
            ) : (
              <Link
                to="/career-center"
                className="mt-5 inline-flex min-h-11 items-center font-semibold text-accent underline"
              >
                {sv ? "Utforska karriärguider" : "Explore career guides"}
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="min-w-0">
              <div className="space-y-3" aria-label={sv ? "Jobblista" : "Job list"}>
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    lang={lang}
                    from={jobSearchToFrom({ ...search, selected: job.slug })}
                    selected={desktop && selected === job.slug}
                    onSelect={desktop ? () => void setParam("selected", job.slug) : undefined}
                  />
                ))}
              </div>
              {(page > 1 || (jobsQuery.data?.length ?? 0) > 20) && (
                <nav
                  aria-label={sv ? "Resultatsidor" : "Result pages"}
                  className="mt-4 flex justify-between gap-3"
                >
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => void setParam("page", String(page - 1))}
                  >
                    {sv ? "Föregående" : "Previous"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={(jobsQuery.data?.length ?? 0) <= 20}
                    onClick={() => void setParam("page", String(page + 1))}
                  >
                    {sv ? "Nästa" : "Next"}
                  </Button>
                </nav>
              )}
            </div>
            {desktop && (
              <div
                key={selected}
                className="sticky top-20 max-h-[calc(100dvh-6rem)] min-w-0 overflow-y-auto rounded-2xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
                tabIndex={0}
                role="region"
                aria-label={sv ? "Vald annons" : "Selected job"}
              >
                {detail.isLoading ? (
                  <p role="status" className="p-8">
                    {t("jobs.results.loading")}
                  </p>
                ) : detail.isError ? (
                  <div role="alert" className="p-8">
                    <p>{t("jobs.results.error.title")}</p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => void detail.refetch()}
                    >
                      {sv ? "Försök igen" : "Try again"}
                    </Button>
                  </div>
                ) : detail.data ? (
                  <JobDetailContent
                    key={detail.data.id}
                    job={detail.data}
                    from={jobSearchToFrom(search)}
                    embedded
                  />
                ) : (
                  <div className="p-8">
                    <h2 className="text-lg font-semibold">
                      {sv
                        ? "Annonsen är inte längre tillgänglig"
                        : "This job is no longer available"}
                    </h2>
                    <p className="mt-2 text-muted-foreground">
                      {sv
                        ? "Den kan ha stängts eller tagits bort. Välj ett annat jobb i listan."
                        : "It may have closed or been removed. Choose another job from the list."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
          <Link
            to="/career-center"
            className="inline-flex min-h-11 items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {sv ? "Utforska yrken i karriärguiderna" : "Explore roles in our career guides"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/employers"
            className="inline-flex min-h-11 items-center hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {sv ? "För arbetsgivare · Publicera jobb" : "For employers · Post a job"}
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
