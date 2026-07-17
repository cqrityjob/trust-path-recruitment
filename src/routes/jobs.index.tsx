import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { listPublicJobs } from "@/lib/job-intelligence/public-queries";
import { JobResults } from "@/components/jobs/JobResults";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { professionFamilies } from "@/lib/career-center/profession-families";
import { useState, useEffect } from "react";

type JobSearch = {
  q: string;
  location: string;
  family: string;
  employment: string;
  workplace: string;
  experience: string;
  country: string;
};

function coerceString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export const Route = createFileRoute("/jobs/")({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): JobSearch => ({
    q: coerceString(raw.q),
    location: coerceString(raw.location),
    family: coerceString(raw.family),
    employment: coerceString(raw.employment),
    workplace: coerceString(raw.workplace),
    experience: coerceString(raw.experience),
    country: coerceString(raw.country),
  }),
  component: JobsDiscoveryPage,
});

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "temporary", "internship"];
const WORKPLACE_TYPES = ["onsite", "hybrid", "remote"];
const EXPERIENCE_LEVELS = ["entry", "mid", "senior", "lead"];

function JobsDiscoveryPage() {
  const { t, lang } = useT();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [qInput, setQInput] = useState(search.q);
  const [locInput, setLocInput] = useState(search.location);

  useEffect(() => {
    setQInput(search.q);
    setLocInput(search.location);
  }, [search.q, search.location]);

  const jobsQuery = useQuery({
    queryKey: ["public-jobs", search],
    queryFn: () =>
      listPublicJobs({
        q: search.q || undefined,
        location: search.location || undefined,
        familyId: search.family || undefined,
        employmentType: search.employment || undefined,
        workplaceType: search.workplace || undefined,
        experienceLevel: search.experience || undefined,
        country: search.country || undefined,
      }),
  });

  const setParam = (key: keyof typeof search, value: string) =>
    navigate({
      search: (prev: JobSearch) => ({ ...prev, [key]: value }),
      replace: true,
    });

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      search: (prev: JobSearch) => ({ ...prev, q: qInput.trim(), location: locInput.trim() }),
      replace: true,
    });
  };

  const reset = () =>
    navigate({
      search: () => ({
        q: "",
        location: "",
        family: "",
        employment: "",
        workplace: "",
        experience: "",
        country: "",
      }),
      replace: true,
    });

  const hasFilters =
    !!search.q ||
    !!search.location ||
    !!search.family ||
    !!search.employment ||
    !!search.workplace ||
    !!search.experience ||
    !!search.country;

  return (
    <SiteLayout>
      <Section>
        <header className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("jobs.discover.title")}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {t("jobs.discover.lead")}
          </p>
        </header>

        <form
          onSubmit={submitSearch}
          className="mt-8 rounded-lg border border-border bg-background p-4"
          role="search"
          aria-label={t("jobs.discover.title")}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={t("jobs.search.keyword_placeholder")}
              aria-label={t("jobs.search.keyword_placeholder")}
            />
            <Input
              value={locInput}
              onChange={(e) => setLocInput(e.target.value)}
              placeholder={t("jobs.search.location_placeholder")}
              aria-label={t("jobs.search.location_placeholder")}
            />
            <Button type="submit">{t("jobs.search.submit")}</Button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label={t("jobs.filter.family")}
              value={search.family}
              onChange={(v) => setParam("family", v)}
              options={professionFamilies.map((f) => ({ value: f.id, label: f.name[lang] }))}
              anyLabel={t("jobs.filter.any")}
            />
            <FilterSelect
              label={t("jobs.filter.employment_type")}
              value={search.employment}
              onChange={(v) => setParam("employment", v)}
              options={EMPLOYMENT_TYPES.map((v) => ({ value: v, label: v.replace("_", " ") }))}
              anyLabel={t("jobs.filter.any")}
            />
            <FilterSelect
              label={t("jobs.filter.workplace_type")}
              value={search.workplace}
              onChange={(v) => setParam("workplace", v)}
              options={WORKPLACE_TYPES.map((v) => ({ value: v, label: v }))}
              anyLabel={t("jobs.filter.any")}
            />
            <FilterSelect
              label={t("jobs.filter.experience_level")}
              value={search.experience}
              onChange={(v) => setParam("experience", v)}
              options={EXPERIENCE_LEVELS.map((v) => ({ value: v, label: v }))}
              anyLabel={t("jobs.filter.any")}
            />
            <FilterSelect
              label={t("jobs.filter.country")}
              value={search.country}
              onChange={(v) => setParam("country", v)}
              options={[
                { value: "SE", label: "Sverige / Sweden" },
                { value: "NO", label: "Norge / Norway" },
                { value: "DK", label: "Danmark / Denmark" },
                { value: "FI", label: "Suomi / Finland" },
              ]}
              anyLabel={t("jobs.filter.any")}
            />
          </div>

          {hasFilters && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={reset}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                {t("jobs.search.reset")}
              </button>
            </div>
          )}
        </form>

        <JobResults
          jobs={jobsQuery.data}
          isLoading={jobsQuery.isLoading}
          isError={jobsQuery.isError}
          lang={lang}
        />

        <section className="mt-16 border-t border-border pt-10">
          <h2 className="text-2xl font-semibold">{t("jobs.browse.families.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("jobs.browse.families.subtitle")}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {professionFamilies.map((f) => (
              <Link
                key={f.id}
                to="/jobs/family/$familyId"
                params={{ familyId: f.id }}
                className="rounded-lg border border-border bg-background p-4 transition hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <h3 className="font-medium">{f.name[lang]}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {f.description[lang]}
                </p>
              </Link>
            ))}
          </div>
        </section>
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
  options: Array<{ value: string; label: string }>;
  anyLabel: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value || "__any__"} onValueChange={(v) => onChange(v === "__any__" ? "" : v)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__any__">{anyLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="capitalize">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}