// What a person sees when their only standing with an organisation is a removed
// or suspended membership.
//
// ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────
//
// An employer who is removed (or suspended) simply stops having a workspace.
// listMyEmployerWorkspaces() returns active memberships only, so the picker saw
// "no workspace" and sent them to /employer/onboarding -- "Kom igång som
// arbetsgivare", a form for creating a company, with no word about the
// organisation they had just lost access to. Offboarding a leaver was therefore
// indistinguishable, to the leaver, from never having had an account, and the
// invitation to register a second organisation was the only thing on the page.
//
// ── WHAT IT SAYS, AND WHAT IT DOES NOT ──────────────────────────────────
//
// That the access has ended or is paused, what stays (what the person did), and
// who to write to. It does not name the organisation (a person without an active
// membership may not read it; employers_member_select requires one), does not say
// WHY (the database records a status, not a reason, and the page will not invent
// one), and does not promise that access will return.
//
// It is not a security boundary: the boundary is that the memberships it reads
// from grant nothing. It only makes sure the person is told.

import { Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { useT } from "@/i18n/context";
import { ContactMailto } from "@/components/employer/ContactMailto";
import type { AccessEndedKind } from "@/lib/job-intelligence/employer-access-state";

export function EmployerAccessEnded({ kind }: { kind: AccessEndedKind }) {
  const { t } = useT();
  return (
    <div data-testid="employer-access-ended" data-access-ended={kind}>
      <span
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <ShieldX className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">
        {t(
          kind === "removed"
            ? "employer.accessEnded.removed.heading"
            : "employer.accessEnded.suspended.heading",
        )}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {t(
          kind === "removed"
            ? "employer.accessEnded.removed.body"
            : "employer.accessEnded.suspended.body",
        )}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t("employer.accessEnded.next")}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {t("employer.contact.writeTo")} <ContactMailto />.
      </p>
      <div className="mt-6">
        <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
          {t("sca.report.backToMyCareer")}
        </Link>
      </div>
    </div>
  );
}
