// The job advertisement as a candidate sees it — extracted verbatim from
// src/routes/jobs.$slug.tsx so there is exactly ONE implementation of
// "what a job ad looks like".
//
// Why this exists: the employer create/edit flow gained a
// "Förhandsgranska annons" step. Rendering a second, employer-only copy
// of the ad would guarantee drift — the preview would slowly stop
// matching the published page. Instead both the public route and the
// employer preview render these two components. The public route keeps
// its own page chrome (SiteLayout, Section, employer card, career
// context, related jobs, apply sidebar, relevance panel); only the ad
// body itself is shared.
//
// Purely presentational. No queries, no auth, no route coupling — it
// takes a plain object, which is what lets an unsaved draft render
// through the same code path as a published row.

import type { ReactNode } from "react";
import {
  MapPin,
  Building2,
  Calendar,
  Briefcase,
  Home as HomeIcon,
  Award,
  ShieldCheck,
  Clock as ClockIcon,
} from "lucide-react";
import { useT } from "@/i18n/context";
import {
  employmentTypeLabel,
  workplaceTypeLabel,
  experienceLevelLabel,
} from "@/lib/job-intelligence/enum-labels";

/** The subset of a job row this presentation needs. A published
 *  `PublicJobDetail` satisfies it structurally, and so does a draft
 *  mapped out of the employer form — which is the whole point. */
export type JobAdContentJob = {
  title_sv: string | null;
  title_en: string | null;
  description_sv: string | null;
  description_en: string | null;
  location_text: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  experience_level: string | null;
  published_at?: string | null;
  deadline_at: string | null;
  responsibilities?: unknown;
  requirements?: unknown;
  benefits?: unknown;
  regulated?: boolean;
  security_vetting_mentioned?: boolean;
  driving_licence_required?: boolean;
};

export function pickLocalized(sv: string | null, en: string | null, lang: "sv" | "en"): string {
  const primary = lang === "sv" ? sv : en;
  const fallback = lang === "sv" ? en : sv;
  return primary || fallback || "";
}

/** Requirements may arrive as either a legacy string[] or a structured
 * object with mandatory/preferred/formal/employer_specific keys. Both
 * shapes are accepted; we degrade gracefully. */
export type ReqBuckets = {
  mandatory: string[];
  preferred: string[];
  formal: string[];
  employer: string[];
  legacy: string[];
};

export function toStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

export function normalizeRequirements(raw: unknown): ReqBuckets {
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
      employer: toStringList(o.employer_specific ?? o.employer ?? o.company_specific),
      legacy: [],
    };
  }
  return empty;
}

export function formatJobDate(iso: string | null | undefined, lang: "sv" | "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BulletList({ items }: { items: string[] }) {
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

export function Chip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5">
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

/** Title, employer, location, dates and the attribute chips. */
export function JobAdHeading({
  job,
  employerName,
  expired,
  headingLevel = "h1",
}: {
  job: JobAdContentJob;
  employerName?: string | null;
  expired?: boolean;
  /** The preview renders inside a page that already owns the <h1>. */
  headingLevel?: "h1" | "h2";
}) {
  const { t, lang } = useT();
  const title = pickLocalized(job.title_sv, job.title_en, lang) || t("jobs.card.untitled");
  const location = [job.location_text, job.city, job.region, job.country]
    .filter(Boolean)
    .join(", ");
  const Heading = headingLevel;

  return (
    <header>
      {expired && (
        <span className="inline-flex items-center rounded-full bg-destructive/10 px-3 py-0.5 text-xs font-medium text-destructive">
          {t("jobs.detail.expired.badge")}
        </span>
      )}
      <Heading
        className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </Heading>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {employerName && (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{employerName}</span>
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
              {t("jobs.detail.published")}: {formatJobDate(job.published_at, lang)}
            </span>
          </span>
        )}
        {job.deadline_at && (
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {t("jobs.detail.deadline")}: {formatJobDate(job.deadline_at, lang)}
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
          <Chip icon={<ShieldCheck className="h-3 w-3" />}>{t("jobs.detail.badge.regulated")}</Chip>
        )}
        {job.security_vetting_mentioned && <Chip>{t("jobs.detail.badge.vetting")}</Chip>}
        {job.driving_licence_required && <Chip>{t("jobs.detail.badge.driving")}</Chip>}
      </div>
    </header>
  );
}

/** Description, responsibilities, requirements, benefits. */
export function JobAdSections({ job }: { job: JobAdContentJob }) {
  const { t, lang } = useT();
  const description = pickLocalized(job.description_sv, job.description_en, lang);
  const reqs = normalizeRequirements(job.requirements);
  const responsibilities = toStringList(job.responsibilities);
  const benefits = toStringList(job.benefits);

  return (
    <>
      {description && (
        <section>
          <h2 className="text-xl font-semibold">{t("jobs.detail.summary")}</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground">{description}</p>
        </section>
      )}

      {responsibilities.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold">{t("jobs.detail.responsibilities")}</h2>
          <BulletList items={responsibilities} />
        </section>
      )}

      {(reqs.mandatory.length > 0 ||
        reqs.preferred.length > 0 ||
        reqs.formal.length > 0 ||
        reqs.employer.length > 0 ||
        reqs.legacy.length > 0) && (
        <section>
          <h2 className="text-xl font-semibold">{t("jobs.detail.requirements")}</h2>
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
          <h2 className="text-xl font-semibold">{t("jobs.detail.benefits")}</h2>
          <BulletList items={benefits} />
        </section>
      )}
    </>
  );
}
