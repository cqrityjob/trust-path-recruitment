import { Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, IdCard } from "lucide-react";
import { useT } from "@/i18n/context";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { jobsProfessionSlug, type Profession } from "@/lib/career-center";

// "Relaterade lediga jobb" and "Ditt nästa steg".
//
// ── WHY THE JOBS LINK CAN BE ABSENT ────────────────────────────────────
//
// `jobs.profession_slug` is a foreign key onto `cig_professions.slug`, so a
// job can only be found through a profession that HAS a canonical CIG node.
// Four published guides do not have one (see ENRICHMENT_UNAVAILABLE in the
// career-intelligence-engine bridge: a data-centre security specialist is not
// an airport screener, and pointing the link at the nearest row would be the
// proxy mapping that bridge exists to forbid).
//
// For those four, a jobs link would query a slug no job can carry and always
// render "no openings" — which a reader reads as "nobody is hiring in this
// field", not as "we cannot ask that question yet". So the section says which
// of the two it is, and offers two live routes onward rather than a dead end.
//
// ── WHY THE PASSPORT IS LINKED AND NOT READ ────────────────────────────
//
// This is a public, indexed, cacheable page about a PROFESSION. Reading the
// visitor's Passport here would put trust-bearing personal data on it in
// order to display something the reader can see in full on their own Passport
// — and any such display invites the inference this product must never make:
// that holding merits means being qualified for a role, or that a merit we
// cannot see is a merit the person lacks.
//
// So the boundary is a link plus one sentence that states the rule
// explicitly: a merit that is not shown is NOT REGISTERED, which is not the
// same statement as "missing", and CQrityjob does not check eligibility at
// all. That sentence is on the page for every reader, signed in or not.

export function ProfessionNextSteps({
  profession,
  signedIn,
}: {
  profession: Profession;
  /** Only used to send the reader to the right Passport entry point. Nothing
   *  on this page changes what it CLAIMS based on who is reading. */
  signedIn: boolean | null;
}) {
  const { t } = useT();
  const jobsSlug = jobsProfessionSlug(profession);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* ── RELATED OPEN JOBS ─────────────────────────────────────────── */}
      <section
        data-related-jobs
        data-jobs-available={jobsSlug ? "true" : "false"}
        className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-xs md:p-8"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-accent">
          <Briefcase className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
          {jobsSlug ? t("cc.p.jobs.title") : t("cc.p.jobs.unavailable.title")}
        </h3>
        <p className="mt-2 flex-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          {jobsSlug ? t("cc.p.jobs.body") : t("cc.p.jobs.unavailable.body")}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {jobsSlug ? (
            <Link
              to="/jobs/profession/$professionSlug"
              params={{ professionSlug: jobsSlug }}
              data-jobs-link={jobsSlug}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cc.p.jobs.cta")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <>
              <Link
                to="/jobs"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)]"
              >
                {t("cc.p.jobs.alt.all")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              <a
                href="#relaterade-yrken"
                className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("cc.p.jobs.alt.related")}
              </a>
            </>
          )}
        </div>
      </section>

      {/* ── PASSPORT ──────────────────────────────────────────────────── */}
      <section
        data-passport-boundary
        className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-xs md:p-8"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-accent">
          <IdCard className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
          {t("cc.p.act.passport.title")}
        </h3>
        <p className="mt-2 flex-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          {t("cc.p.act.passport.body")}
        </p>
        {/* A signed-out reader goes to signup carrying the intent, which is
            the mechanism SiteHeader already uses: "?redirect=/passport"
            survives account creation, so the Passport is where they land
            rather than a generic home. */}
        <div className="mt-6">
          {signedIn === true ? (
            <PrimaryLink to="/passport/credentials/new" variant="ghost">
              {t("cc.p.act.passport.cta")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
          ) : (
            <PrimaryLink to="/signup" search={{ redirect: "/passport" }} variant="ghost">
              {t("cc.p.act.passport.ctaSignedOut")}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </PrimaryLink>
          )}
        </div>
      </section>
    </div>
  );
}
