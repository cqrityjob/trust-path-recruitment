import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import {
  createMyEmployerCompany,
  listMyAccessRequests,
  type MyAccessRequest,
} from "@/lib/job-intelligence/employer-onboarding.functions";

// Type-safe lookup, not a template-literal cast -- avoids both `any` and a
// misleading fixed-literal assertion for what is genuinely a 3-way status.
const REQUEST_STATUS_KEY: Record<MyAccessRequest["status"], TranslationKey> = {
  pending: "employer.onboarding.requestStatus.pending",
  approved: "employer.onboarding.requestStatus.approved",
  denied: "employer.onboarding.requestStatus.denied",
};

// Phase H3.1 — /employer/onboarding: reached whenever an authenticated
// employer-intent user has zero employer workspaces (see the updated
// _authenticated.employer.index.tsx).
//
// Product-owner clarification (post-H3.1 review): public self-service
// "request access to an existing company" is NOT an active MVP user-facing
// action. An employer whose company already exists is directed to contact
// CQrityjob or their company administrator instead -- access to an
// existing workspace is granted only by an authorised employer admin/owner
// or a platform admin, via a verified employer_memberships record. This
// page therefore offers exactly one active action (create a company) plus
// static contact guidance -- never a searchable "pick a company and
// request to join it" flow.
//
// The secure backend foundation for a request/approval flow
// (employer_access_requests, its RLS, the partial-unique duplicate-request
// index, and the create_my_employer_company()/approve_access_request()
// SECURITY DEFINER functions, plus their TS wrappers in
// employer-onboarding.functions.ts) is intentionally KEPT, unused by this
// page, for a future colleague-invitation or admin-review flow to build on
// -- removing it now would be pure rework with no security benefit, since
// it was never reachable by an unauthorised actor in the first place (see
// tests/database/phase-h3-1/02_run_tests.sql, T16-T18, T24-T25). Only the
// public self-service UI action that exposed requestAccessToEmployer/
// findMatchingEmployers to any signed-in user is removed here.
//
// listMyAccessRequests() is still called and rendered (read-only) because
// a request record could still exist for a user via a future/manual path
// -- showing its status if one exists costs nothing and stays honest about
// account state; it is never the entry point for CREATING a new request
// from this page anymore.

export const Route = createFileRoute("/_authenticated/employer/onboarding")({
  ssr: false,
  component: OnboardingPage,
});

function OnboardingPage() {
  if (!employerPortalEnabled()) {
    return <ComingSoon />;
  }
  return <OnboardingFlow />;
}

function ComingSoon() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section containerClassName="max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </Section>
    </SiteLayout>
  );
}

type Choice = "create" | null;

function OnboardingFlow() {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Choice>(null);

  const listRequests = useServerFn(listMyAccessRequests);
  const requestsQuery = useQuery({
    queryKey: ["employer", "my-access-requests"],
    queryFn: () => listRequests(),
  });

  return (
    <SiteLayout>
      <Section containerClassName="max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.onboarding.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.onboarding.intro")}</p>

        {requestsQuery.data && requestsQuery.data.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("employer.onboarding.myRequests.heading")}
            </p>
            {requestsQuery.data.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3 text-sm"
              >
                <span className="text-foreground">{r.employerName}</span>
                <span className="text-xs text-muted-foreground">
                  {t(REQUEST_STATUS_KEY[r.status])}
                </span>
              </div>
            ))}
          </div>
        )}

        {choice === null && (
          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={() => setChoice("create")}
              className="w-full rounded-md border border-border bg-background p-5 text-left transition-colors hover:border-accent/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <p className="text-sm font-semibold text-foreground">
                {t("employer.onboarding.choice.create.title")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("employer.onboarding.choice.create.body")}
              </p>
            </button>

            <ContactGuidancePanel />
          </div>
        )}

        {choice === "create" && (
          <CreateCompanyForm
            onBack={() => setChoice(null)}
            onCreated={(slug) => {
              void queryClient.invalidateQueries({ queryKey: ["employer", "my-workspaces"] });
              navigate({ to: "/employer/$employerSlug", params: { employerSlug: slug } });
            }}
          />
        )}

        <div className="mt-8">
          <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
            {t("sca.report.backToMyCareer")}
          </Link>
        </div>
      </Section>
    </SiteLayout>
  );
}

// Static informational panel -- not an action that creates any record.
// Reused (identical copy) inside CreateCompanyForm's duplicate-detected
// state below, since both cases resolve to the same real-world next step:
// the user talks to a human, they never self-serve into an existing
// company.
function ContactGuidancePanel() {
  const { t } = useT();
  return (
    <div className="rounded-md border border-border bg-muted/30 p-5">
      <p className="text-sm font-semibold text-foreground">
        {t("employer.onboarding.contact.heading")}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t("employer.onboarding.contact.body")}</p>
      <Link
        to="/contact"
        className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
      >
        {t("employer.onboarding.contact.cta")}
      </Link>
    </div>
  );
}

function CreateCompanyForm(props: { onBack: () => void; onCreated: (slug: string) => void }) {
  const { t } = useT();
  const createCompany = useServerFn(createMyEmployerCompany);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicateNotice(false);
    if (!agreed) {
      setError(t("employer.onboarding.create.needConsent"));
      return;
    }
    setBusy(true);
    try {
      const result = await createCompany({
        data: {
          name,
          country,
          registrationNumber: registrationNumber || undefined,
          website: website || undefined,
          jobTitle: jobTitle || undefined,
        },
      });
      if (!result.ok) {
        setDuplicateNotice(true);
        return;
      }
      props.onCreated(result.employerSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("employer.onboarding.create.genericError"));
    } finally {
      setBusy(false);
    }
  }

  if (duplicateNotice) {
    return (
      <div className="mt-8 rounded-md border border-border bg-muted/30 p-5">
        <p className="text-sm font-medium text-foreground">
          {t("employer.onboarding.create.duplicateHeading")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("employer.onboarding.create.duplicateBody")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link to="/contact" className="text-sm font-medium text-accent hover:underline">
            {t("employer.onboarding.contact.cta")}
          </Link>
          <button
            type="button"
            onClick={() => setDuplicateNotice(false)}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            {t("employer.onboarding.create.duplicateEditDetails")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="block text-sm">
        <span className="text-foreground">{t("employer.onboarding.create.name")}</span>
        <input
          type="text"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground">{t("employer.onboarding.create.country")}</span>
        <input
          type="text"
          required
          maxLength={100}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground">
          {t("employer.onboarding.create.registrationNumber")}
        </span>
        <input
          type="text"
          maxLength={100}
          value={registrationNumber}
          onChange={(e) => setRegistrationNumber(e.target.value)}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          {t("employer.onboarding.create.registrationNumberHelp")}
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-foreground">{t("employer.onboarding.create.website")}</span>
        <input
          type="text"
          maxLength={300}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="block text-sm">
        <span className="text-foreground">{t("employer.onboarding.create.jobTitle")}</span>
        <input
          type="text"
          maxLength={150}
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5"
        />
        <span>{t("employer.onboarding.create.consent")}</span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {t("employer.onboarding.create.pendingNotice")}
      </p>

      <div className="flex gap-3">
        <PrimaryButton type="submit" disabled={busy}>
          {t("employer.onboarding.create.submit")}
        </PrimaryButton>
        <button
          type="button"
          onClick={props.onBack}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("employer.onboarding.back")}
        </button>
      </div>
    </form>
  );
}
