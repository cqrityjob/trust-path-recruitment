import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Building2,
  Calendar,
  Mail,
  Briefcase,
  Home as HomeIcon,
  Award,
  Globe,
  ShieldCheck,
  Clock as ClockIcon,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import {
  getPublicJobBySlug,
  listRelatedPublicJobs,
  isJobExpired,
  type PublicJobDetail,
  type PublicEmployer,
} from "@/lib/job-intelligence/public-queries";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";
import { getProfession } from "@/lib/career-center/professions";
import {
  employmentTypeLabel,
  workplaceTypeLabel,
  experienceLevelLabel,
} from "@/lib/job-intelligence/enum-labels";
import { Button } from "@/components/ui/button";
import { ExternalApplyDialog } from "@/components/jobs/ExternalApplyDialog";
import { JobCard } from "@/components/jobs/JobCard";
import { JobRelevancePanel } from "@/components/jobs/JobRelevancePanel";
import { AssessmentInvite } from "@/components/jobs/AssessmentInvite";
import { useCareerProfileForJobs } from "@/hooks/useCareerProfileForJobs";

export const Route = createFileRoute("/jobs/$slug")({
  ssr: false,
  head: ({ params }) => {
    const url = `https://trust-path-recruitment.lovable.app/jobs/${params.slug}`;
    return {
      meta: [
        { title: "Security job — CQrityjob" },
        {
          name: "description",
          content:
            "Role details, requirements and how to apply — from a vetted employer in the security industry.",
        },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: JobDetailPage,
  errorComponent: ({ error }) => <ErrorState message={error.message} />,
  notFoundComponent: () => <NotFoundState />,
});

function pickLocalized(sv: string | null, en: string | null, lang: "sv" | "en"): string {
  const primary = lang === "sv" ? sv : en;
  const fallback = lang === "sv" ? en : sv;
  return primary || fallback || "";
}

/** Requirements may arrive as either a legacy string[] or a structured
 * object with mandatory/preferred/formal/employer_specific keys. Both
 * shapes are accepted; we degrade gracefully. */
type ReqBuckets = {
  mandatory: string[];
  preferred: string[];
  formal: string[];
  employer: string[];
  legacy: string[];
};

function toStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

function normalizeRequirements(raw: unknown): ReqBuckets {
  const empty: ReqBuckets = {
    mandatory: [],
    preferred: [],
    formal: [],
    employer: [],
    legacy: [],
  };
  if (!raw) return empty;
  if (Array.isArray(raw)) return { ...empty, legacy: toStringList(raw) };
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return {
      mandatory: toStringList(o.mandatory ?? o.must ?? o.required),
      preferred: toStringList(o.preferred ?? o.nice_to_have ?? o.desired),
      formal: toStringList(o.formal ?? o.regulated),
      employer: toStringList(
        o.employer_specific ?? o.employer ?? o.company_specific,
      ),
      legacy: [],
    };
  }
  return empty;
}

function formatDate(iso: string | null, lang: "sv" | "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-foreground">
      {items.map((item, i) => (
        <li key={i} className="leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

function JobDetailPage() {
  const { slug } = Route.useParams();
  const { t, lang } = useT();

  const q = useQuery({
    queryKey: ["public-job", slug],
    queryFn: async () => {
      const job = await getPublicJobBySlug(slug);
      if (!job) throw notFound();
      return job;
    },
  });

  const profileState = useCareerProfileForJobs();

  const related = useQuery({
    queryKey: [
      "public-job-related",
      q.data?.id,
      q.data?.profession_slug,
      q.data?.family_id,
    ],
    enabled: !!q.data,
    queryFn: () =>
      listRelatedPublicJobs({
        excludeId: q.data!.id,
        professionSlug: q.data!.profession_slug,
        familyId: q.data!.family_id,
      }),
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <Section>
          <p className="text-sm text-muted-foreground">{t("jobs.results.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  if (!q.data) return <NotFoundState />;

  const job = q.data;
  const title =
    pickLocalized(job.title_sv, job.title_en, lang) || t("jobs.card.untitled");
  const description = pickLocalized(job.description_sv, job.description_en, lang);
  const area = job.family_id ? getCareerAreaLabel(job.family_id) : undefined;
  const profession = job.profession_slug ? getProfession(job.profession_slug) : undefined;
  const location = [job.location_text, job.city, job.region, job.country]
    .filter(Boolean)
    .join(", ");
  const expired = isJobExpired(job);
  const reqs = normalizeRequirements(job.requirements);
  const responsibilities = toStringList(job.responsibilities);
  const benefits = toStringList(job.benefits);
  const employer = job.employer ?? null;
  const employerDesc = employer
    ? pickLocalized(employer.description_sv, employer.description_en, lang)
    : "";

  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>

        <header className="mt-4">
          {expired && (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-3 py-0.5 text-xs font-medium text-destructive">
              {t("jobs.detail.expired.badge")}
            </span>
          )}
          <h1
            className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {employer?.name && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{employer.name}</span>
              </span>
            )}
            {location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{location}</span>
              </span>
            )}
            {job.published_at && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t("jobs.detail.published")}: {formatDate(job.published_at, lang)}
                </span>
              </span>
            )}
            {job.deadline_at && (
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {t("jobs.detail.deadline")}: {formatDate(job.deadline_at, lang)}
                </span>
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {job.employment_type && (
              <Chip icon={<Briefcase className="h-3 w-3" />}>
                {employmentTypeLabel(job.employment_type, lang)}
              </Chip>
            )}
            {job.workplace_type && (
              <Chip icon={<HomeIcon className="h-3 w-3" />}>
                {workplaceTypeLabel(job.workplace_type, lang)}
              </Chip>
            )}
            {job.experience_level && (
              <Chip icon={<Award className="h-3 w-3" />}>
                {experienceLevelLabel(job.experience_level, lang)}
              </Chip>
            )}
            {job.regulated && (
              <Chip icon={<ShieldCheck className="h-3 w-3" />}>
                {t("jobs.detail.badge.regulated")}
              </Chip>
            )}
            {job.security_vetting_mentioned && (
              <Chip>{t("jobs.detail.badge.vetting")}</Chip>
            )}
            {job.driving_licence_required && (
              <Chip>{t("jobs.detail.badge.driving")}</Chip>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="min-w-0 space-y-8">
            {description && (
              <section>
                <h2 className="text-xl font-semibold">
                  {t("jobs.detail.summary")}
                </h2>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground">
                  {description}
                </p>
              </section>
            )}

            {responsibilities.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold">
                  {t("jobs.detail.responsibilities")}
                </h2>
                <BulletList items={responsibilities} />
              </section>
            )}

            {(reqs.mandatory.length > 0 ||
              reqs.preferred.length > 0 ||
              reqs.formal.length > 0 ||
              reqs.employer.length > 0 ||
              reqs.legacy.length > 0) && (
              <section>
                <h2 className="text-xl font-semibold">
                  {t("jobs.detail.requirements")}
                </h2>
                {reqs.legacy.length > 0 ? (
                  <BulletList items={reqs.legacy} />
                ) : (
                  <div className="mt-3 space-y-5">
                    {reqs.mandatory.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("jobs.detail.requirements.mandatory")}
                        </h3>
                        <BulletList items={reqs.mandatory} />
                      </div>
                    )}
                    {reqs.preferred.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("jobs.detail.requirements.preferred")}
                        </h3>
                        <BulletList items={reqs.preferred} />
                      </div>
                    )}
                    {reqs.formal.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("jobs.detail.requirements.formal")}
                        </h3>
                        <BulletList items={reqs.formal} />
                      </div>
                    )}
                    {reqs.employer.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("jobs.detail.requirements.employer")}
                        </h3>
                        <BulletList items={reqs.employer} />
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {benefits.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold">
                  {t("jobs.detail.benefits")}
                </h2>
                <BulletList items={benefits} />
              </section>
            )}

            {employer && (employer.name || employerDesc || employer.website) && (
              <EmployerCard employer={employer} description={employerDesc} />
            )}

            {(area || profession) && (
              <CareerContext
                familyId={area?.id ?? null}
                familyName={area ? area.name[lang] : null}
                professionSlug={profession?.slug ?? null}
                professionName={
                  profession
                    ? lang === "sv"
                      ? profession.titleSv
                      : profession.titleEn
                    : null
                }
              />
            )}

            <RelatedJobs
              loading={related.isLoading}
              rows={related.data ?? []}
              lang={lang}
            />
          </article>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <ApplySidebar job={job} expired={expired} />
            {profileState.status === "ready" && (
              <JobRelevancePanel job={job} profile={profileState.data.profile} />
            )}
            {(profileState.status === "anonymous" ||
              profileState.status === "no_profile") && (
              <AssessmentInvite variant="sidebar" />
            )}
          </aside>
        </div>
      </Section>
    </SiteLayout>
  );
}

function Chip({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5">
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

function ApplySidebar({
  job,
  expired,
}: {
  job: PublicJobDetail;
  expired: boolean;
}) {
  const { t, lang } = useT();

  const applyBlock = () => {
    if (expired) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">
            {t("jobs.detail.expired.title")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("jobs.detail.expired.body")}
          </p>
        </div>
      );
    }
    if (job.application_method === "external" && job.application_url) {
      return (
        <ExternalApplyDialog
          url={job.application_url}
          employerName={job.employer?.name ?? null}
          label={t("jobs.detail.apply_external")}
        />
      );
    }
    if (job.application_method === "email" && job.application_email) {
      return (
        <Button asChild className="w-full">
          <a href={`mailto:${job.application_email}`}>
            {t("jobs.detail.apply_email")}
            <Mail className="ml-2 h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        {t("jobs.detail.apply_unavailable")}
      </p>
    );
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-5">
      {applyBlock()}

      {job.deadline_at && (
        <div className="border-t border-border pt-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("jobs.detail.deadline")}
          </p>
          <p className="mt-1 font-medium">{formatDate(job.deadline_at, lang)}</p>
        </div>
      )}

      {job.published_at && (
        <div className="text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("jobs.detail.published")}
          </p>
          <p className="mt-1 font-medium">{formatDate(job.published_at, lang)}</p>
        </div>
      )}
    </div>
  );
}

function EmployerCard({
  employer,
  description,
}: {
  employer: PublicEmployer;
  description: string;
}) {
  const { t } = useT();
  let host = "";
  if (employer.website) {
    try {
      host = new URL(employer.website).host;
    } catch {
      host = employer.website;
    }
  }
  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-xl font-semibold">{t("jobs.detail.employer.title")}</h2>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {employer.logo_url ? (
            <img
              src={employer.logo_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md border border-border bg-white object-contain"
              loading="lazy"
            />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{employer.name}</p>
            {employer.country && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {employer.country}
              </p>
            )}
          </div>
        </div>
      </div>
      {description && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground">
          {description}
        </p>
      )}
      {employer.website && (
        <a
          href={employer.website}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          {host || t("jobs.detail.employer.website")}
        </a>
      )}
    </section>
  );
}

function CareerContext({
  familyId,
  familyName,
  professionSlug,
  professionName,
}: {
  familyId: string | null;
  familyName: string | null;
  professionSlug: string | null;
  professionName: string | null;
}) {
  const { t } = useT();
  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <h2 className="text-xl font-semibold">{t("jobs.detail.career.title")}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {familyId && familyName && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("jobs.detail.career.family")}
            </dt>
            <dd className="mt-1">
              <Link
                to="/jobs/family/$familyId"
                params={{ familyId }}
                className="font-medium text-primary hover:underline"
              >
                {familyName}
              </Link>
            </dd>
          </div>
        )}
        {professionSlug && professionName && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("jobs.detail.career.profession")}
            </dt>
            <dd className="mt-1">
              <Link
                to="/jobs/profession/$professionSlug"
                params={{ professionSlug }}
                className="font-medium text-primary hover:underline"
              >
                {professionName}
              </Link>
            </dd>
          </div>
        )}
      </dl>
      {professionSlug && (
        <div className="mt-4 border-t border-border pt-4">
          <Link
            to="/career-center/$profession"
            params={{ profession: professionSlug }}
            className="text-sm text-primary hover:underline"
          >
            {t("jobs.detail.career.explore")}
          </Link>
        </div>
      )}
    </section>
  );
}

function RelatedJobs({
  loading,
  rows,
  lang,
}: {
  loading: boolean;
  rows: Array<import("@/lib/job-intelligence/public-queries").PublicJobCard>;
  lang: "sv" | "en";
}) {
  const { t } = useT();
  if (!loading && rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold">{t("jobs.detail.related.title")}</h2>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("jobs.results.loading")}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <JobCard key={r.id} job={r} lang={lang} />
          ))}
        </div>
      )}
    </section>
  );
}


function NotFoundState() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">
          {t("jobs.detail.not_found.title")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("jobs.detail.not_found.body")}
        </p>
      </Section>
    </SiteLayout>
  );
}

function ErrorState({ message }: { message: string }) {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <Link to="/jobs" className="text-sm text-primary hover:underline">
          {t("jobs.detail.back")}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">
          {t("jobs.results.error.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </Section>
    </SiteLayout>
  );
}