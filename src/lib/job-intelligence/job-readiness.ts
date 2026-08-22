// Deterministic pre-publication check for a job advertisement.
//
// ── WHY A SHARED MODULE ─────────────────────────────────────────────────
//
// Three places already decide, independently, whether an advertisement is
// finished: submitEmployerJob()'s `missing` gate on the server,
// EmployerJobForm's validateForSubmit() in the form, and
// jobs_validate_before_write() in the database. They agree today because
// somebody kept them in step by hand. The recruitment hub is a fourth reader
// -- it has to tell an employer what is still outstanding on a draft BEFORE
// they press anything -- and adding a fourth hand-kept copy is how the four
// start disagreeing.
//
// So the rule is written once, here, as a pure function over a job row. The
// server gate and the database trigger stay exactly where they are: this is a
// mirror for the interface to read, never the authority. A check that passes
// here and is refused by the trigger is a bug in this file, not permission.
//
// ── BLOCKING VERSUS ADVISORY ────────────────────────────────────────────
//
// BLOCKING is precisely what submitEmployerJob() already refuses on, field for
// field. Nothing was added: inventing a new requirement here would produce a
// checklist an employer could satisfy and still be refused, or satisfy
// needlessly.
//
// ADVISORY is the seam the brief asks for. These are things that make an
// advertisement better and are not conditions of publishing -- a location, a
// second language, a description with enough in it to be worth reading. They
// are computed the same deterministic way, carry no score, and block nothing.
// If a later phase adds an assistant that suggests clearer wording or flags
// possibly discriminatory phrasing, its suggestions join this list as more
// advisory entries and the blocking set is untouched. That is deliberate: an
// advisory that can stop a publication is no longer an advisory, and no
// employer should ever wait on a language model to post a job.

import type { TranslationKey } from "@/i18n/dictionaries";

/** The subset of a job row this module reads. Deliberately structural rather
 *  than the generated row type: getEmployerJob() returns `select("*")` as
 *  `any`, and the public job shape differs again. */
export interface JobReadinessInput {
  title_sv?: string | null;
  title_en?: string | null;
  description_sv?: string | null;
  description_en?: string | null;
  application_method?: string | null;
  application_url?: string | null;
  application_email?: string | null;
  expires_at?: string | null;
  location_text?: string | null;
  city?: string | null;
}

export type JobReadinessCheckId =
  | "title"
  | "description"
  | "applicationMethod"
  | "applicationTarget"
  | "expiresAt"
  | "location"
  | "bothLanguages"
  | "descriptionDepth";

export interface JobReadinessCheck {
  id: JobReadinessCheckId;
  ok: boolean;
  /** BLOCKING entries are the server's own submission gate. ADVISORY entries
   *  never affect `ready`. */
  blocking: boolean;
  labelKey: TranslationKey;
}

export interface JobReadiness {
  checks: JobReadinessCheck[];
  /** Every blocking check passes -- the advertisement may be submitted. */
  ready: boolean;
  blockingMissing: JobReadinessCheckId[];
  advisoryMissing: JobReadinessCheckId[];
}

const LABEL_KEY: Record<JobReadinessCheckId, TranslationKey> = {
  title: "employer.jobs.readiness.title",
  description: "employer.jobs.readiness.description",
  applicationMethod: "employer.jobs.readiness.applicationMethod",
  applicationTarget: "employer.jobs.readiness.applicationTarget",
  expiresAt: "employer.jobs.readiness.expiresAt",
  location: "employer.jobs.readiness.location",
  bothLanguages: "employer.jobs.readiness.bothLanguages",
  descriptionDepth: "employer.jobs.readiness.descriptionDepth",
};

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** A description long enough to tell a candidate something. Advisory only, and
 *  a low bar on purpose: this is a nudge, not an editorial standard. */
const MIN_USEFUL_DESCRIPTION = 160;

export function checkJobReadiness(job: JobReadinessInput): JobReadiness {
  const method = job.application_method ?? "unavailable";

  // The application target is only a requirement for the methods that have
  // one. `internal` (apply through CQrityjob) needs nothing further, which is
  // exactly what submitEmployerJob() does.
  const targetRequired = method === "external" || method === "email";
  const targetPresent =
    method === "external"
      ? filled(job.application_url)
      : method === "email"
        ? filled(job.application_email)
        : true;

  const description = (job.description_sv ?? "") + (job.description_en ?? "");

  const checks: JobReadinessCheck[] = [
    {
      id: "title",
      ok: filled(job.title_sv) || filled(job.title_en),
      blocking: true,
      labelKey: LABEL_KEY.title,
    },
    {
      id: "description",
      ok: filled(job.description_sv) || filled(job.description_en),
      blocking: true,
      labelKey: LABEL_KEY.description,
    },
    {
      id: "applicationMethod",
      ok: method !== "unavailable",
      blocking: true,
      labelKey: LABEL_KEY.applicationMethod,
    },
    // Only offered when the chosen method actually has a target, so an
    // employer applying through CQrityjob is not shown a requirement that
    // does not apply to them.
    ...(targetRequired
      ? [
          {
            id: "applicationTarget" as const,
            ok: targetPresent,
            blocking: true,
            labelKey: LABEL_KEY.applicationTarget,
          },
        ]
      : []),
    {
      id: "expiresAt",
      ok: filled(job.expires_at),
      blocking: true,
      labelKey: LABEL_KEY.expiresAt,
    },
    {
      id: "location",
      ok: filled(job.location_text) || filled(job.city),
      blocking: false,
      labelKey: LABEL_KEY.location,
    },
    {
      id: "bothLanguages",
      ok:
        filled(job.title_sv) &&
        filled(job.title_en) &&
        filled(job.description_sv) &&
        filled(job.description_en),
      blocking: false,
      labelKey: LABEL_KEY.bothLanguages,
    },
    {
      id: "descriptionDepth",
      ok: description.trim().length >= MIN_USEFUL_DESCRIPTION,
      blocking: false,
      labelKey: LABEL_KEY.descriptionDepth,
    },
  ];

  return {
    checks,
    ready: checks.every((c) => !c.blocking || c.ok),
    blockingMissing: checks.filter((c) => c.blocking && !c.ok).map((c) => c.id),
    advisoryMissing: checks.filter((c) => !c.blocking && !c.ok).map((c) => c.id),
  };
}
