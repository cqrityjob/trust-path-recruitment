// The one step that turns a saved company registration into something
// somebody knows about.
//
// ── WHY IT IS A MODULE AND NOT TWO COPIES ──────────────────────────────
//
// A company registration reaches the database down exactly two paths, and
// both of them end in `create_my_employer_company`:
//
//   ensureMyEmployerCompanyFromSignup   the registration form's company name,
//                                       spent on the first authenticated
//                                       render after the address is verified;
//   createMyEmployerCompany             the /employer/onboarding form, for
//                                       somebody who registered without one.
//
// The registration is identical either way, so the announcement has to be
// identical too. Written twice it would drift — which is precisely the
// lesson employer-signup-intent.ts records about a predicate written twice.
//
// ── EXACTLY ONCE, WITHOUT A LOCK ───────────────────────────────────────
//
// Nothing here counts, claims or deduplicates, because it does not have to.
// `create_my_employer_company` creates the organisation and the owner
// membership in one transaction with its own duplicate detection, and
// `ensureMyEmployerCompanyFromSignup` refuses a caller who already holds any
// membership. So "the call that created the row" happens exactly once per
// organisation, ever — a double-click, a reload, two tabs and a retry all
// converge on `already_member` or `duplicate` and never reach this function.
//
// This announcement is bound to THAT call and to no other event. There is no
// polling job that could send a second time, and no "if not already sent"
// check whose staleness could send a second time either.
//
// ── A FAILED SEND IS A RESULT, NOT AN EXCEPTION ────────────────────────
//
// By the time this runs the registration is saved and irrevocable. Throwing
// would roll nothing back; it would only replace a stored application and a
// delivery problem with a screen saying the registration failed, and invite
// the one recovery this flow must never produce — a second registration.
//
// So every outcome is a value. The caller returns it to the browser, which
// states it (never "check your inbox" for a message that was not sent), and
// it is written to `audit_logs` so an administrator can see what happened
// and send it again from /admin/employers/<id>.
//
// ── WHY audit_logs AND NOT A NEW TABLE ─────────────────────────────────
//
// The same argument 20260909093000 makes about candidate notifications: the
// event row already exists. `create_my_employer_company` writes a
// `company_created` row into audit_logs for every registration, audit_logs is
// already admin-only (it grants `authenticated` nothing at all), and the
// admin overview already reads it. A notification table would duplicate its
// keys, its policies and its lifecycle for two extra columns.
//
// The write is best-effort and deliberately so: it needs the service-role
// client, and an environment without one must still register companies and
// still send their confirmation. When it cannot be written the outcome is
// still returned to the caller and still logged to the server console.

import {
  sendEmployerRegistrationAdminEmail,
  sendEmployerRegistrationReceivedEmail,
  type EmailChannelOutcome,
} from "@/lib/email/send-employer-registration-email.server";

/** The audit action both channels are recorded under. Exported so the guard
 *  script asserts against the same literal the reader queries. */
export const EMPLOYER_REGISTRATION_NOTICE_ACTION = "employer_registration_notified";

export type EmployerRegistrationNotice = {
  /** The confirmation to the person who registered the company. */
  readonly applicant: EmailChannelOutcome;
  /** The notification to the configured administrator address. */
  readonly admin: EmailChannelOutcome;
};

export type AnnounceEmployerRegistrationParams = {
  readonly employerId: string;
  readonly companyName: string;
  readonly companyCountry: string | null;
  readonly contactUserId: string;
  readonly contactEmail: string;
  readonly contactName: string | null;
  readonly language: "sv" | "en";
};

/** The site's own origin, from configuration where the deployment sets one.
 *  Never a hard-coded address in this file — the same resolution every other
 *  sender in this codebase performs. */
async function resolveSiteOrigin(): Promise<string> {
  const { SITE_ORIGIN } = await import("@/lib/job-intelligence/seo");
  return process.env.PUBLIC_SITE_URL || SITE_ORIGIN;
}

/**
 * Record what happened to one channel.
 *
 * Stores the outcome and, for a failure, the provider status — never a
 * provider response body, which can carry the recipient address, and never
 * the recipient address itself: the applicant's address belongs to the auth
 * record and the administrator's belongs to the environment, and copying
 * either into an audit row would be a second, unjustified home for it.
 */
async function recordOutcome(
  params: AnnounceEmployerRegistrationParams,
  channel: "applicant" | "admin",
  outcome: EmailChannelOutcome,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: params.contactUserId,
      actor_role: "employer_owner",
      action: EMPLOYER_REGISTRATION_NOTICE_ACTION,
      subject_type: "employer",
      subject_id: params.employerId,
      org_id: params.employerId,
      metadata: {
        channel,
        status: outcome.status,
        ...(outcome.status === "failed" ? { error: outcome.error } : {}),
        ...(outcome.status === "not_configured" ? { missing: outcome.missing } : {}),
      } as never,
    });
  } catch (err) {
    // An unwritten audit row must not cost a sent email. The outcome is
    // returned to the caller regardless, and this is the console record.
    console.error("[employer-registration-notice] could not record outcome", channel, err);
  }
}

/**
 * Tell the company we have their registration, and tell the administrator
 * they have one to review.
 *
 * Both channels are attempted even if the first fails: they are independent
 * messages to independent recipients, and letting a bad applicant address
 * silence the administrator would hide the registration from the only person
 * who can act on it.
 *
 * Never throws.
 */
export async function announceEmployerRegistration(
  params: AnnounceEmployerRegistrationParams,
): Promise<EmployerRegistrationNotice> {
  const siteOrigin = await resolveSiteOrigin();

  const [applicant, admin] = await Promise.all([
    sendEmployerRegistrationReceivedEmail({
      recipientEmail: params.contactEmail,
      language: params.language,
      companyName: params.companyName,
      contactName: params.contactName,
      siteOrigin,
    }).catch((err): EmailChannelOutcome => {
      console.error("[employer-registration-notice] applicant channel threw", err);
      return { status: "failed", error: "UNEXPECTED_ERROR" };
    }),
    sendEmployerRegistrationAdminEmail({
      companyName: params.companyName,
      companyCountry: params.companyCountry,
      contactName: params.contactName,
      contactEmail: params.contactEmail,
      employerId: params.employerId,
      siteOrigin,
    }).catch((err): EmailChannelOutcome => {
      console.error("[employer-registration-notice] admin channel threw", err);
      return { status: "failed", error: "UNEXPECTED_ERROR" };
    }),
  ]);

  await Promise.all([
    recordOutcome(params, "applicant", applicant),
    recordOutcome(params, "admin", admin),
  ]);

  return { applicant, admin };
}
