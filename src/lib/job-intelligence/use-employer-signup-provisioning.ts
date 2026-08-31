// Turning a registration into a reviewable organisation, without being asked.
//
// ── THE DEFECT THIS EXISTS TO CLOSE ────────────────────────────────────
//
// Somebody told CQrityjob "I am creating this account for an organisation"
// and typed a company name. Everything after that point worked: the
// database creates the organisation as `pending`, the moderation queue
// reads `employers` and would have shown it, the approval RPC would have
// activated it, and the workspace behind it was already built.
//
// None of it ran, because the one call that turns the registration into a
// row — `ensureMyEmployerCompanyFromSignup` — was a side effect of
// RENDERING `/employer`, and nothing took the registrant there. The
// destination was carried in a `?redirect=` parameter minted at the moment
// of signup, and that parameter does not survive:
//
//   * a signup that returns a session immediately (no email confirmation),
//     where the form never navigated at all;
//   * any later sign-in, which resolves to the personal home;
//   * a Google round trip, which leaves the app entirely.
//
// So the organisation existed only for a registrant who guessed the URL.
// An independent pilot audit found exactly that: sign up as an employer,
// land on the candidate home, and the administrator's queue stays empty
// until the person types `/employer` by hand.
//
// ── THE EVENT THIS BINDS TO INSTEAD ────────────────────────────────────
//
// The first authenticated render of ANY route inside `_authenticated`.
// That is the earliest moment at which all three preconditions hold:
// the identity is known and verified, the signup intent is readable, and a
// call can be made under the person's own session. It does not matter
// which page they landed on, so no route is load-bearing any more.
//
// ── WHY THIS IS NOT A COST ON EVERY PAGE LOAD ──────────────────────────
//
// The gate is read from the session that `_authenticated` has already
// fetched — `user_metadata` travels inside the token, so deciding "this
// person has no organisation intent" costs no network at all, and that is
// the answer for every candidate, every administrator and every employer
// who has already been provisioned once. Only a registrant carrying an
// unspent intent reaches the server call, and `staleTime: Infinity` keeps
// it to one call per mount of the authenticated shell. There is no poll.
//
// ── AND WHY IT CANNOT PRODUCE TWO ORGANISATIONS ────────────────────────
//
// It never decides anything itself. `ensureMyEmployerCompanyFromSignup`
// refuses if the caller already holds any employer membership, and
// `create_my_employer_company` creates the organisation and the owner
// membership in one transaction with its own duplicate detection. Two
// tabs, a double submit and a reload all converge on `already_member`.
// This hook adds no client-side "if not exists then insert" of its own —
// that is the pattern it exists to avoid.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { hasEmployerSignupIntent } from "@/lib/job-intelligence/employer-signup-intent";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";
import {
  ensureMyEmployerCompanyFromSignup,
  type EnsureEmployerCompanyResult,
} from "@/lib/job-intelligence/employer-onboarding.functions";

/** The shared react-query key, so a component that also wants the answer
 *  reads this one rather than issuing a second POST. */
export const EMPLOYER_SIGNUP_PROVISION_KEY = ["employer", "ensure-company-from-signup"] as const;

export type EmployerSignupProvisioning = {
  /** True while the intent is being read or the call is in flight. */
  readonly pending: boolean;
  /** The organisation was created by THIS call. True once, ever. */
  readonly created: boolean;
  /** Provisioning was attempted and failed. Never rendered as "you have no
   *  organisation" — see the callers, and §25 of the brief. */
  readonly failed: boolean;
  readonly result: EnsureEmployerCompanyResult | undefined;
  /** Re-runs the provisioning call after a failure. Offered to the person
   *  instead of an automatic retry loop, and safe to press repeatedly for
   *  the same reason the first call is safe: the server function refuses a
   *  caller who already holds a membership. */
  readonly retry: () => Promise<unknown>;
};

/**
 * Reads the signed-in user's organisation intent from the session.
 *
 * `undefined` while unknown, so a caller can tell "not asked yet" from
 * "asked, and there is none" — the distinction that keeps a slow session
 * read from being reported as "this person is not an employer".
 */
function useHasSignupIntent(): boolean | undefined {
  const [intent, setIntent] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    // getSession() reads the locally stored, already-validated session; the
    // metadata rides inside it, so this resolves without a network call.
    const read = () =>
      void supabase.auth.getSession().then(({ data }) => {
        if (!alive) return;
        const user = data.session?.user;
        if (!user) {
          setIntent(false);
          return;
        }
        setIntent(hasEmployerSignupIntent(user.user_metadata as Record<string, unknown> | null));
      });

    read();

    // A sign-in that happens while the shell is already mounted — and the
    // metadata write that carries a Google registrant's intent across the
    // provider round trip — both arrive as auth state changes rather than as
    // a remount. Without this, an intent that appeared after the first read
    // would wait for a full page load to be noticed.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      const user = session?.user;
      setIntent(
        user
          ? hasEmployerSignupIntent(user.user_metadata as Record<string, unknown> | null)
          : false,
      );
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return intent;
}

/**
 * Provisions the organisation a registration promised, once, from wherever
 * the person actually landed.
 *
 * Returns the state rather than navigating, so the decision about where
 * somebody goes stays in the shell that owns routing.
 */
export function useEmployerSignupProvisioning(): EmployerSignupProvisioning {
  const hasIntent = useHasSignupIntent();
  const ensureCompany = useServerFn(ensureMyEmployerCompanyFromSignup);

  const query = useQuery({
    queryKey: EMPLOYER_SIGNUP_PROVISION_KEY,
    queryFn: () => ensureCompany(),
    // The whole point of the gate: no intent, no request. The portal flag is
    // honoured for the same reason the rest of the employer surface honours
    // it — while it is off, this build has no employer product to provision
    // into.
    enabled: hasIntent === true && employerPortalEnabled(),
    // Provisioning is not idempotent-by-retry in any useful sense: the
    // server function is idempotent, but a failure here is a real failure
    // the person must be told about rather than one to paper over.
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return {
    pending: hasIntent === undefined || (hasIntent === true && query.isPending && query.isFetching),
    created: query.data?.created === true,
    failed: query.isError,
    result: query.data,
    retry: query.refetch,
  };
}
