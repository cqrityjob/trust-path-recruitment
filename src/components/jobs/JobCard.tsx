import { Link } from "@tanstack/react-router";
import { MapPin, ArrowUpRight } from "lucide-react";
import { useT } from "@/i18n/context";
import type { PublicJobCard } from "@/lib/job-intelligence/public-queries";
import { employmentTypeLabel, workplaceTypeLabel } from "@/lib/job-intelligence/enum-labels";
import type { RelevanceForJob } from "@/lib/job-intelligence/personal-relevance";
import { JobRelevanceBadge } from "./JobRelevanceBadge";
import { EmployerLogo } from "./EmployerPresentation";
import { pickLocalized, formatJobDate, cleanAdText } from "./JobAdContent";
import { rememberJobListPosition } from "@/lib/job-intelligence/job-list-position";
import { cn } from "@/lib/utils";

export function JobCard({
  job,
  lang,
  from,
  selected,
  onSelect,
  relevance,
}: {
  job: PublicJobCard;
  lang: "sv" | "en";
  relevance?: RelevanceForJob;
  from?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { t } = useT();
  const sv = lang === "sv";
  const title = pickLocalized(job.title_sv, job.title_en, lang) || t("jobs.card.untitled");
  const location = job.location_text || [job.city, job.region].filter(Boolean).join(", ");
  const country = job.country
    ? new Intl.DisplayNames([sv ? "sv" : "en"], { type: "region" }).of(
        /^[a-z]{2}$/i.test(job.country) ? job.country.toUpperCase() : "ZZ",
      )
    : null;
  const summary = cleanAdText(
    pickLocalized(job.description_sv ?? null, job.description_en ?? null, lang),
    t("jobs.detail.summary"),
  );
  const date = formatJobDate(job.deadline_at || job.published_at, lang);
  return (
    <Link
      to="/jobs/$slug"
      params={{ slug: job.slug }}
      search={from ? { from } : {}}
      id={`job-card-${job.slug}`}
      aria-label={title}
      aria-current={selected ? "true" : undefined}
      preload={false}
      onClick={(event) => {
        if (
          onSelect &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0
        ) {
          event.preventDefault();
          onSelect();
        } else if (!onSelect && window.location.pathname.replace(/\/$/, "") === "/jobs")
          rememberJobListPosition(from);
      }}
      className={cn(
        "group block min-w-0 rounded-xl border bg-card p-5 text-left transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        selected
          ? "border-accent bg-accent/5 shadow-[inset_3px_0_0_var(--accent)]"
          : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <EmployerLogo
          name={job.employer?.name}
          logoUrl={job.employer?.logo_url}
          className="h-11 w-11 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-semibold leading-snug tracking-tight text-foreground group-hover:text-accent">
            {title}
          </h3>
          {job.employer?.name && (
            <p className="mt-1 break-words text-sm text-muted-foreground">{job.employer.name}</p>
          )}
        </div>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {(location || country) && (
        <p className="mt-4 flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{[location, country].filter(Boolean).join(", ")}</span>
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        {[
          job.employment_type ? employmentTypeLabel(job.employment_type, lang) : null,
          job.workplace_type ? workplaceTypeLabel(job.workplace_type, lang) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {summary && (
        <p className="mt-3 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">
          {summary}
        </p>
      )}
      {date && (
        <p className="mt-4 border-t border-border/70 pt-3 text-xs leading-relaxed text-muted-foreground">
          {job.deadline_at
            ? sv
              ? "Sista ansökningsdag"
              : "Apply by"
            : sv
              ? "Publicerad"
              : "Published"}{" "}
          <time dateTime={job.deadline_at || job.published_at || undefined}>{date}</time>
        </p>
      )}
      {relevance && relevance.band !== "none" && (
        <div className="mt-3">
          <JobRelevanceBadge band={relevance.band} basis={relevance.basis} />
        </div>
      )}
    </Link>
  );
}
