import { Link } from "@tanstack/react-router";
import { MapPin, Clock, Building2 } from "lucide-react";
import { useT } from "@/i18n/context";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";
import { employmentTypeLabel, workplaceTypeLabel } from "@/lib/job-intelligence/enum-labels";

function pickTitle(job: PublicJobCard, lang: "sv" | "en"): string {
  const primary = lang === "sv" ? job.title_sv : job.title_en;
  const fallback = lang === "sv" ? job.title_en : job.title_sv;
  return primary || fallback || "";
}

function locationLabel(job: PublicJobCard): string {
  if (job.location_text) return job.location_text;
  const parts = [job.city, job.region, job.country].filter(Boolean);
  return parts.join(", ");
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

export function JobCard({ job, lang }: { job: PublicJobCard; lang: "sv" | "en" }) {
  const { t } = useT();
  const title = pickTitle(job, lang) || t("jobs.card.untitled");
  const location = locationLabel(job);
  const days = daysSince(job.published_at);
  const area = job.family_id ? getCareerAreaLabel(job.family_id) : undefined;

  return (
    <Link
      to="/jobs/$slug"
      params={{ slug: job.slug }}
      className="group block rounded-lg border border-border bg-background p-5 transition hover:border-foreground/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">{title}</h3>
          {job.employer?.name && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{job.employer.name}</span>
            </p>
          )}
        </div>
        {days !== null && (
          <span
            className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            aria-label={t("jobs.card.posted_days_ago").replace("{n}", String(days))}
          >
            {days === 0 ? t("jobs.card.today") : `${days}d`}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{location}</span>
          </span>
        )}
        {job.employment_type && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{employmentTypeLabel(job.employment_type, lang)}</span>
          </span>
        )}
        {job.workplace_type && (
          <span>{workplaceTypeLabel(job.workplace_type, lang)}</span>
        )}
      </div>

      {area && (
        <p className="mt-3 text-xs text-muted-foreground">{area.name[lang]}</p>
      )}
    </Link>
  );
}