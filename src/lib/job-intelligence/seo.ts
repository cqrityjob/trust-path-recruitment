// SEO helpers for public job pages (H2).
//
// Builds TanStack head() metadata (title, description, canonical, og:*)
// and Google-compliant `JobPosting` JSON-LD, using SSR loader data so
// the tags are present in the initial HTML response.

import type { PublicJobSsrDetail } from "./public-queries.functions";

// Public site canonical origin — matches the sitemap.xml BASE_URL.
const SITE_ORIGIN = "https://trust-path-recruitment.lovable.app";

function pickLocalized(sv: string | null, en: string | null): string {
  return sv || en || "";
}

/** Strip HTML and collapse whitespace to a plain sentence for meta description. */
function toPlainText(s: string, max = 300): string {
  const stripped = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1).trimEnd() + "…";
}

function employmentTypeToSchema(em: string | null): string | null {
  switch (em) {
    case "full_time":
      return "FULL_TIME";
    case "part_time":
      return "PART_TIME";
    case "contract":
      return "CONTRACTOR";
    case "temporary":
      return "TEMPORARY";
    case "internship":
      return "INTERN";
    default:
      return null;
  }
}

function salaryUnitText(period: string | null): string | null {
  switch (period) {
    case "hour":
      return "HOUR";
    case "month":
      return "MONTH";
    case "year":
      return "YEAR";
    default:
      return null;
  }
}

/** Build the JSON-LD JobPosting object. */
export function buildJobPostingJsonLd(
  slug: string,
  job: PublicJobSsrDetail,
): Record<string, unknown> {
  const url = `${SITE_ORIGIN}/jobs/${slug}`;
  const title = pickLocalized(job.title_sv, job.title_en) || "Security job";
  const description = pickLocalized(job.description_sv, job.description_en) || title;

  const jsonld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title,
    description,
    identifier: {
      "@type": "PropertyValue",
      name: "CQrityjob",
      value: job.id,
    },
    datePosted: job.published_at,
    // M2: expires_at is DB-mandatory at publish time — always present.
    validThrough: job.expires_at ?? undefined,
    url,
    directApply: false,
  };

  const et = employmentTypeToSchema(job.employment_type);
  if (et) jsonld.employmentType = et;

  const org: Record<string, unknown> = {
    "@type": "Organization",
    name: job.employer?.name ?? "Confidential employer",
  };
  if (job.employer?.website) org.sameAs = job.employer.website;
  if (job.employer?.logo_url) org.logo = job.employer.logo_url;
  jsonld.hiringOrganization = org;

  const addressLocality = job.city ?? undefined;
  const addressRegion = job.region ?? undefined;
  const addressCountry = job.country ?? undefined;
  if (addressLocality || addressRegion || addressCountry) {
    jsonld.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality,
        addressRegion,
        addressCountry,
      },
    };
  } else if (job.location_text) {
    jsonld.jobLocation = {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: job.location_text },
    };
  }

  if (job.workplace_type === "remote") {
    jsonld.jobLocationType = "TELECOMMUTE";
    if (job.country) {
      jsonld.applicantLocationRequirements = {
        "@type": "Country",
        name: job.country,
      };
    }
  }

  if (job.salary_min || job.salary_max) {
    const unit = salaryUnitText(job.salary_period);
    const value: Record<string, unknown> = {
      "@type": "QuantitativeValue",
      minValue: job.salary_min ?? undefined,
      maxValue: job.salary_max ?? undefined,
    };
    if (unit) value.unitText = unit;
    jsonld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary_currency ?? "SEK",
      value,
    };
  }

  return jsonld;
}

/**
 * Build the head() object for a job detail route. When the job cannot be
 * found (or is not currently active), emits noindex + generic metadata
 * so unlisted/expired URLs don't leak stale content into indexes.
 */
export function buildJobHeadMeta(
  slug: string,
  job: PublicJobSsrDetail | null,
): {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
  scripts: Array<{ type: string; children: string }>;
} {
  const url = `${SITE_ORIGIN}/jobs/${slug}`;

  if (!job) {
    return {
      meta: [
        { title: "Job unavailable — CQrityjob" },
        {
          name: "description",
          content: "This job listing is no longer available.",
        },
        { name: "robots", content: "noindex,follow" },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [],
    };
  }

  const title = pickLocalized(job.title_sv, job.title_en) || "Security job";
  const employer = job.employer?.name ? ` · ${job.employer.name}` : "";
  const location = [job.city, job.region, job.country].filter(Boolean).join(", ");
  const locSuffix = location ? ` — ${location}` : "";
  const fullTitle = `${title}${employer}${locSuffix} — CQrityjob`;
  const description = toPlainText(
    pickLocalized(job.description_sv, job.description_en) ||
      `${title}${employer ? " at" + employer : ""}. Apply on CQrityjob.`,
  );

  // Content language: prefer whichever localised text exists; default sv.
  const contentLanguage = job.title_sv || job.description_sv ? "sv" : "en";

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    { name: "content-language", content: contentLanguage },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: url },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
  ];
  if (job.employer?.logo_url) {
    meta.push({ property: "og:image", content: job.employer.logo_url });
    meta.push({ name: "twitter:image", content: job.employer.logo_url });
  }

  return {
    meta,
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(buildJobPostingJsonLd(slug, job)),
      },
    ],
  };
}