// "Annonsen är publicerad." — what an employer sees the moment their
// advertisement goes live.
//
// It exists because the previous flow ended by navigating silently back to
// the job list, which is the weakest possible answer to "did that work?".
// Now that publication is immediate and the employer's own act, the
// confirmation has to say so, and then offer the two things a person
// actually wants next: look at the live advert, or go back to their ads.
//
// Shared by the create and edit routes so both end the same way. The links
// use the existing route structure -- no new routes were added for this.

import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/context";

export function JobPublishedPanel({
  employerSlug,
  jobSlug,
}: {
  employerSlug: string;
  /** The published advertisement's public slug, read back from the row
   *  after the write rather than assumed, so the link cannot point at a
   *  slug the database did not actually store. */
  jobSlug: string;
}) {
  const { t } = useT();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-border bg-background p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {t("employer.jobs.published.heading")}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("employer.jobs.published.body")}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/jobs/$slug"
            params={{ slug: jobSlug }}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("employer.jobs.published.viewAd")}
          </Link>
          <Link
            to="/employer/$employerSlug/jobs"
            params={{ employerSlug }}
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            {t("employer.jobs.published.toMyAds")}
          </Link>
        </div>
      </div>
    </div>
  );
}
