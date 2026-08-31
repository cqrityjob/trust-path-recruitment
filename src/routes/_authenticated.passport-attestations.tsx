// Security Passport — employment confirmation, as reached by an old link.
//
// ── WHAT THIS PAGE USED TO BE, AND WHY IT IS NOT THAT ANY MORE ─────────
//
// It was the ONLY employer-facing employment confirmation surface: a flat
// list across every organisation the reader represents, with the decision
// controls inline. Two things were wrong with it, and neither was fixable
// where it stood.
//
//   * NOBODY COULD FIND IT. Its own header comment said the representative
//     "reaches it by the link that accompanies the request" -- and no such
//     link was ever sent. There was no email, no task, no dashboard row. A
//     candidate could ask an employer to confirm their employment and the
//     employer would simply never learn they had been asked.
//
//   * THE MESSAGE FIELD WAS LABELLED OPTIONAL. `sp_verifier_decide` has
//     required a candidate-facing `holder_message` for a refusal and for a
//     correction request since PR 4. So "Nej, det stämmer inte" with an empty
//     box was a control the product presented as complete and the database
//     refused, and what the employer got back was a generic error.
//
// The work now lives in the employer's own workspace, at
// /employer/$employerSlug/employment-verifications, reached from a row on
// their overview that appears exactly when somebody is waiting on them.
//
// ── WHY THIS ROUTE STILL EXISTS ────────────────────────────────────────
//
// A bookmark should resolve to something honest rather than to a 404, and
// somebody who represents several organisations needs to be told which one
// the request belongs to. So it is a signpost: the organisations this person
// may answer for, how much is waiting in each, and a way in.
//
// It is deliberately NOT a second place to decide. One decision surface means
// the rule about the mandatory message, the self-confirmation notice and the
// wording of what a confirmation does not mean cannot drift into two versions
// of themselves.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Building2 } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerVerificationCounts } from "@/lib/security-passport/verification.functions";

export const Route = createFileRoute("/_authenticated/passport-attestations")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Passport — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PassportAttestationsRoute,
});

function PassportAttestationsRoute() {
  const { pt } = usePassportCopy();
  const loadWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const loadCounts = useServerFn(employerVerificationCounts);

  const workspaces = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => loadWorkspaces(),
  });

  // Only owners and admins may answer. The database enforces it -- the queue
  // function refuses everybody else -- and filtering here just avoids sending
  // somebody to a workspace that will turn them away.
  const eligible = (workspaces.data ?? []).filter((w) => w.role === "owner" || w.role === "admin");

  // Same cache key as the overview card, so the number here and the number
  // there are one fetch and cannot disagree.
  const counts = useQueries({
    queries: eligible.map((w) => ({
      queryKey: ["passport", "employment-verification-counts", w.employerId],
      queryFn: () => loadCounts({ data: { employerId: w.employerId } }),
    })),
  });

  return (
    <SiteLayout>
      <Section>
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <header>
            <h1
              className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <Building2 aria-hidden="true" className="h-6 w-6" />
              {pt("empv.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {pt("empv.workspaceLead")}
            </p>
          </header>

          {workspaces.isLoading ? (
            <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
          ) : eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{pt("empv.workspaceNone")}</p>
          ) : (
            <>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {pt("empv.workspaceTitle")}
              </h2>
              <ul className="space-y-2">
                {eligible.map((w, i) => {
                  const open = counts[i]?.data?.open ?? 0;
                  return (
                    <li key={w.employerId}>
                      <Link
                        to="/employer/$employerSlug/employment-verifications"
                        params={{ employerSlug: w.employerSlug }}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">
                            {w.employerName}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {open > 0 ? (
                              <>
                                <span className="tabular-nums">{open}</span>{" "}
                                {pt("empv.workspaceOpen")}
                              </>
                            ) : (
                              pt("empv.workspaceNoneOpen")
                            )}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                          {pt("empv.open")}
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* Scope, stated here too. Somebody arriving from an old link should
              learn what they are and are not being shown before they open a
              request, not after. */}
          <section className="rounded-xl border border-border bg-secondary/40 p-5">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {pt("emp.scopeTitle")}
            </h2>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
              <li>{pt("emp.scope1")}</li>
              <li>{pt("emp.scope2")}</li>
              <li>{pt("emp.scope3")}</li>
            </ul>
          </section>
        </div>
      </Section>
    </SiteLayout>
  );
}
