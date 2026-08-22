// /employer/join?org=<uuid> — the colleague's half of joining an organisation.
//
// ── WHY THIS IS A LINK AND NOT A SEARCH ─────────────────────────────────
//
// A page exactly like this existed once and was deliberately removed. It let
// any signed-in person search the employer directory by name and file an
// access request against whatever they found -- see the note at the top of
// _authenticated.employer.onboarding.tsx. The objection was DISCOVERY: not
// that a stranger could become a member (they never could -- approval is the
// only path to a membership, and it is owner/admin only), but that the product
// handed out an organisation directory to anybody who asked.
//
// This page reinstates the request without reinstating the directory. There is
// no search field. The organisation arrives in the URL, from a link an owner
// chose to send, and the page can do precisely one thing with it: create a
// PENDING request. A pending request confers nothing at all -- no membership,
// no tenant access, no reviewer seat -- until an owner approves it in
// Organisation -> Team & behörigheter.
//
// ── WHY THE ORGANISATION IS NOT NAMED HERE ──────────────────────────────
//
// It cannot be, and that is the correct behaviour rather than a gap. The only
// SELECT policy on `employers` for a normal user is employers_member_select,
// so somebody who is not yet a member cannot read the row -- by design. Naming
// it would mean either a new public read path (a directory again, through a
// different door) or trusting a name passed in the URL, which is a name any
// sender could forge. So the page describes the act instead: you are asking to
// join the organisation whose link you were sent, and the person who sent it
// decides.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useState } from "react";
import { Building2, Check } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { requestAccessToEmployer } from "@/lib/job-intelligence/employer-onboarding.functions";

const searchSchema = z.object({
  org: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/employer/join")({
  ssr: false,
  component: JoinOrganisationPage,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

function JoinOrganisationPage() {
  const { t } = useT();
  const { org } = Route.useSearch();
  const requestFn = useServerFn(requestAccessToEmployer);
  const [message, setMessage] = useState("");

  const request = useMutation({
    mutationFn: () =>
      requestFn({ data: { employerId: org as string, message: message || undefined } }),
  });

  // A malformed or missing link is its own outcome, not an error state: the
  // person did nothing wrong and there is nothing for them to retry here.
  if (!org) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.join.noOrgHeading")}
        </h1>
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">
          {t("employer.join.noOrgBody")}
        </p>
      </Shell>
    );
  }

  if (request.isSuccess) {
    return (
      <Shell>
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent"
          aria-hidden="true"
        >
          <Check className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          {t("employer.join.sentHeading")}
        </h1>
        <p className="mt-3 max-w-[60ch] text-sm text-muted-foreground">
          {t("employer.join.sentBody")}
        </p>
        <Link
          to="/my-career"
          className="mt-6 inline-flex text-sm font-medium text-accent hover:underline"
        >
          {t("sca.report.backToMyCareer")}
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <Building2 className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">{t("employer.join.heading")}</h1>
      <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
        {t("employer.join.body")}
      </p>

      <form
        className="mt-6 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          request.mutate();
        }}
      >
        <label className="block text-sm">
          <span className="text-foreground">{t("employer.join.messageLabel")}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t("employer.join.messagePlaceholder")}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>

        {request.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t("employer.join.error")}
          </p>
        )}

        <button
          type="submit"
          disabled={request.isPending}
          className="mt-4 inline-flex min-h-[40px] items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {request.isPending ? t("employer.join.sending") : t("employer.join.submit")}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-16">{children}</div>;
}
