// Open roles — at most three, from the filter this product actually has.
//
// ── WHAT IS AND IS NOT PROMISED ────────────────────────────────────────
//
// There is no personal job-matching algorithm in this product, and this
// section does not imply one. The list is the SAME profile-driven career
// family filter the jobs surface uses, and the section says so in one line:
// the selection is based on the professional area you stated. "Recommended
// for you" would be a claim about a computation nobody has written.
//
// ── AN EMPTY LIST IS A REAL ANSWER, AND GETS A REAL STATE ──────────────
//
// A person with four live applications and no roles in their stated family
// is not a contradiction — the family filter is narrow, their applications
// may be in another family, and a vacancy they applied to may have closed.
// The old empty state said only "we have no relevant roles", which read as
// a fault. The compact state now says what happened and offers the two
// things that change it: see everything, or complete the details the filter
// reads.

import { Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, MapPin } from "lucide-react";
import { useT } from "@/i18n/context";
import type { JobsModel } from "@/lib/professional-identity/home-presentation";
import { SECTION_DESTINATIONS } from "@/lib/professional-identity/profile-destinations";
import { L, type Lang } from "./copy";
import { JOBS } from "./home-copy";

export function JobRecommendations({ jobs, className }: { jobs: JobsModel; className?: string }) {
  const { lang } = useT();
  const l = lang as Lang;

  return (
    <section aria-labelledby="jobs-heading" data-job-recommendations className={className}>
      <div className="rounded-xl border border-border bg-card p-6">
        <h2
          id="jobs-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <span className="text-accent" aria-hidden="true">
            <Briefcase className="h-5 w-5" />
          </span>
          {L(JOBS.heading, l)}
        </h2>

        {jobs.state === "unavailable" ? (
          <p role="status" className="mt-3 text-sm italic text-muted-foreground">
            {L(JOBS.unavailable, l)}
          </p>
        ) : jobs.recommended.length > 0 ? (
          <>
            <p className="mt-1 max-w-[60ch] text-xs text-muted-foreground">{L(JOBS.basis, l)}</p>
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {jobs.recommended.map((j) => {
                const title = (l === "sv" ? j.titleSv : j.titleEn) || j.titleEn || j.titleSv || "";
                return (
                  <li key={j.id}>
                    <Link
                      to="/jobs/$slug"
                      params={{ slug: j.slug }}
                      data-job-row
                      className="group flex min-h-11 flex-col justify-center py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-sm font-medium text-balance text-foreground group-hover:underline">
                        {title}
                      </span>
                      {(j.employerName || j.location) && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {j.location && <MapPin className="h-3 w-3" aria-hidden="true" />}
                          {[j.employerName, j.location].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link
              to="/jobs"
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {L(JOBS.all, l)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <div data-jobs-empty>
            <p className="mt-3 text-base font-semibold text-balance text-foreground">
              {L(JOBS.emptyTitle, l)}
            </p>
            <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
              {L(JOBS.emptyBody, l)}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                to="/jobs"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {L(JOBS.all, l)}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                to={SECTION_DESTINATIONS.profession.href}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {L(JOBS.completeProfile, l)}
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
