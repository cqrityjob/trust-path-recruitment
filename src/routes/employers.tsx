import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, ClipboardCheck, TrendingUp, ShieldCheck, ArrowRight, Info } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: "For Employers — CQrityjob" },
      {
        name: "description",
        content:
          "Recruit, assess and develop security personnel with structured decision support — built for the reality of the security industry.",
      },
      { property: "og:title", content: "For Employers — CQrityjob" },
      {
        property: "og:description",
        content:
          "Recruitment, candidate assessment, workforce development and competence verification for security industry employers.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/employers" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/employers" }],
  }),
  component: EmployersPage,
});

function EmployersPage() {
  const { t } = useT();
  const offers = [
    {
      icon: Users,
      title: t("employers.offer.recruit.title"),
      body: t("employers.offer.recruit.body"),
    },
    {
      icon: ClipboardCheck,
      title: t("employers.offer.assess.title"),
      body: t("employers.offer.assess.body"),
    },
    {
      icon: TrendingUp,
      title: t("employers.offer.develop.title"),
      body: t("employers.offer.develop.body"),
    },
    {
      icon: ShieldCheck,
      title: t("employers.offer.verify.title"),
      body: t("employers.offer.verify.body"),
    },
  ];
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-3xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("employers.title")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t("employers.lead")}
          </p>
          {/* ── WHAT AN EMPLOYER IS ACTUALLY HERE TO DO ──────────────────
              This page used to offer one action, "Prata med oss", pointing
              at /contact -- a form that calls preventDefault and sends
              nothing, and says so in its own preview notice. So the two
              people this page exists for had nowhere to go: the existing
              customer looking for the way back into their workspace, and
              the new employer ready to start. Both had to already know
              that /login and /signup were the answer.

              They are the two actions now, in that order, and they are the
              SAME unified auth routes every other visitor uses -- carrying
              /employer as a validated `?redirect=`. Neither grants
              anything: /employer resolves real organisation membership
              server-side on arrival and sends a person with none to
              onboarding, one with a pending organisation to the review
              state. Signing up "as an employer" is an intent, never a role.

              Contact stays, demoted to a text link. It is a real page with
              an honest notice on it, so it is worth keeping for somebody
              who wants to talk first -- but it is no longer the front door
              to the employer product, which is what made this page a dead
              end. Gated with the entrances for the same reason the header
              is: a door onto "coming soon" is worse than no door. */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {employerPortalEnabled() ? (
              <>
                <PrimaryLink to="/login" search={{ redirect: "/employer" }}>
                  {t("employers.cta.login")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </PrimaryLink>
                <PrimaryLink to="/signup" search={{ redirect: "/employer" }} variant="ghost">
                  {t("employers.cta.createAccount")}
                </PrimaryLink>
                <Link
                  to="/contact"
                  className="inline-flex h-11 items-center rounded-md px-2 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {t("cta.talk")}
                </Link>
              </>
            ) : (
              <PrimaryLink to="/contact">
                {t("cta.talk")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </PrimaryLink>
            )}
          </div>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {offers.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-background p-6">
              <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
              <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex items-start gap-3 rounded-md border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
          <p>{t("employers.disclaimer")}</p>
        </div>
      </Section>
    </SiteLayout>
  );
}
