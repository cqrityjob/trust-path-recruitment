import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Building2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { PublicEmployer, PublicJobCard } from "@/lib/job-intelligence/public-queries";

/** Broken remote images use the same deliberate fallback as missing images. */
export function EmployerLogo({
  name,
  logoUrl,
  className,
}: {
  name?: string | null;
  logoUrl?: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      className={cn(
        "grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-secondary text-primary",
        className,
      )}
      aria-hidden="true"
    >
      {logoUrl && failedUrl !== logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          className="h-full w-full bg-white object-contain p-1.5"
          onError={() => setFailedUrl(logoUrl)}
        />
      ) : name ? (
        <span className="text-base font-semibold tracking-tight">
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toLocaleUpperCase()}
        </span>
      ) : (
        <Building2 className="h-5 w-5" />
      )}
    </span>
  );
}

export function EmployerPresentation({
  employer,
  jobs = [],
  from,
}: {
  employer: PublicEmployer;
  jobs?: PublicJobCard[];
  from?: string;
}) {
  const { lang, t } = useT();
  const description =
    (lang === "sv"
      ? employer.description_sv || employer.description_en
      : employer.description_en || employer.description_sv) ?? "";
  // Organisation URLs are employer content, never executable navigation.
  let website: URL | null = null;
  try {
    const url = new URL(employer.website ?? "");
    if (["https:", "http:"].includes(url.protocol)) website = url;
  } catch {
    /* missing or malformed website */
  }
  return (
    <section className="border-t border-border pt-7">
      <h2 className="text-lg font-semibold">{t("jobs.detail.employer.title")}</h2>
      <div className="mt-4 flex min-w-0 items-center gap-3">
        <EmployerLogo name={employer.name} logoUrl={employer.logo_url} />
        <div className="min-w-0">
          <p className="wrap-break-word font-semibold">{employer.name}</p>
          {employer.country && (
            <p className="mt-0.5 text-sm text-muted-foreground">{employer.country}</p>
          )}
        </div>
      </div>
      <p className="mt-4 whitespace-pre-line wrap-break-word text-sm leading-7 text-muted-foreground">
        {description ||
          (lang === "sv"
            ? "Arbetsgivaren har ännu inte lagt till en företagspresentation."
            : "This employer has not added a company introduction yet.")}
      </p>
      {website && (
        <a
          href={website.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {lang === "sv" ? "Besök företagets webbplats" : "Visit company website"}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">
            {lang === "sv" ? "(öppnas i en ny flik)" : "(opens in a new tab)"}
          </span>
        </a>
      )}
      {jobs.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">
            {lang === "sv" ? "Fler jobb hos arbetsgivaren" : "More jobs at this company"}
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  to="/jobs/$slug"
                  params={{ slug: job.slug }}
                  search={from ? { from } : {}}
                  className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0 wrap-break-word">
                    {(lang === "sv"
                      ? job.title_sv || job.title_en
                      : job.title_en || job.title_sv) || t("jobs.card.untitled")}
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
