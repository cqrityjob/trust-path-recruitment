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
// ── EXACTLY ONCE, AND THEN A BOUNDED CATCH-UP ──────────────────────────
//
// The announcement is bound to the call that CREATES the organisation, and
// that call happens exactly once per organisation, ever:
// `create_my_employer_company` creates the row and the owner membership in one
// transaction with its own duplicate detection, and
// `ensureMyEmployerCompanyFromSignup` refuses a caller who already holds any
// membership. A double-click, a reload, two tabs and a retry all converge on
// `already_member` or `duplicate` and never reach that branch.
//
// Both halves — the write and the send — happen inside THAT ONE SERVER
// REQUEST, so nothing here depends on a later call from a browser. Somebody
// who closes the tab the instant the row is saved does not lose the
// notification: the handler is already running on the server and finishes.
//
// What that does not cover is the request itself not finishing: a redeploy
// between the commit and the send, a provider outage, or a setting that was
// absent then and configured since. For those there is `outstandingNoticeChannels`
// and a catch-up, which is deliberately narrow — it sends only a channel that
// has NEVER succeeded, only while the organisation is still `pending`, and at
// most MAX_AUTOMATIC_ATTEMPTS times. A successful notification is never sent
// twice, by anything.
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

/** The two independent recipients. */
export type NoticeChannel = "applicant" | "admin";
export const NOTICE_CHANNELS: readonly NoticeChannel[] = ["applicant", "admin"] as const;

/** After this many recorded attempts a channel stops being retried
 *  automatically. A permanently undeliverable address must not become a
 *  provider call on every page load — the same bound, and the same reason, as
 *  `notify_attempts < N` on job_application_status_events. An administrator
 *  can still resend by hand. */
export const MAX_AUTOMATIC_ATTEMPTS = 5;

export type EmployerRegistrationNotice = {
  /** The confirmation to the person who registered the company. */
  readonly applicant: EmailChannelOutcome;
  /** The notification to the configured administrator address. */
  readonly admin: EmailChannelOutcome;
};

/** What an automatic catch-up is allowed to do, and for which channels.
 *
 *  Absent, both channels are sent — which is right exactly once, at creation,
 *  when by construction neither has been sent before. Every other caller
 *  passes the channels it has established are still outstanding, so a
 *  successful notification is never sent twice. */
export type AnnounceOptions = { readonly only?: ReadonlySet<NoticeChannel> };

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
 * Which channels have never succeeded for this registration, and may still be
 * attempted automatically.
 *
 * ── WHY THIS IS READ AND NOT COUNTED IN MEMORY ─────────────────────────
 *
 * The announcement is bound to the call that CREATED the organisation, and
 * that call happens exactly once. Everything after it is a catch-up for the
 * case that call did not finish its second half — a redeployment between the
 * commit and the send, a provider outage, an absent setting since corrected.
 * So the question "has this already been delivered" can only be answered by
 * the durable trail, never by anything this process remembers.
 *
 * ── AND WHY "UNKNOWN" MEANS "SEND NOTHING" ─────────────────────────────
 *
 * When the trail cannot be read — no service-role key, a failed query — the
 * answer is an empty set rather than both channels. A catch-up runs on an
 * ordinary page load, so guessing "probably not sent" would put a duplicate
 * in somebody's inbox every time they opened the product. An administrator
 * pressing Resend is a deliberate act and is told the difference.
 *
 * Returns an empty set for anything that is not a pending registration: an
 * organisation that has been approved, rejected or suspended is no longer
 * waiting to be announced, and "we have received your registration" arriving
 * after a decision would be worse than never arriving.
 */
export async function outstandingNoticeChannels(
  employerId: string,
): Promise<ReadonlySet<NoticeChannel>> {
  const none = new Set<NoticeChannel>();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: employer, error: employerError } = await supabaseAdmin
      .from("employers")
      .select("status")
      .eq("id", employerId)
      .maybeSingle();
    if (employerError) throw employerError;
    if (!employer || employer.status !== "pending") return none;

    const { data: rows, error } = await supabaseAdmin
      .from("audit_logs")
      .select("metadata")
      .eq("action", EMPLOYER_REGISTRATION_NOTICE_ACTION)
      .eq("subject_id", employerId)
      .limit(200);
    if (error) throw error;

    const attempts = new Map<NoticeChannel, number>();
    const succeeded = new Set<NoticeChannel>();
    for (const row of (rows ?? []) as { metadata: Record<string, unknown> | null }[]) {
      const meta = row.metadata ?? {};
      const channel = meta.channel as NoticeChannel;
      if (channel !== "applicant" && channel !== "admin") continue;
      attempts.set(channel, (attempts.get(channel) ?? 0) + 1);
      if (meta.status === "sent") succeeded.add(channel);
    }

    return new Set(
      NOTICE_CHANNELS.filter(
        (c) => !succeeded.has(c) && (attempts.get(c) ?? 0) < MAX_AUTOMATIC_ATTEMPTS,
      ),
    );
  } catch (err) {
    // Unknown is not "not sent". See the note above.
    console.error("[employer-registration-notice] could not read the delivery trail", err);
    return none;
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
  options: AnnounceOptions = {},
): Promise<EmployerRegistrationNotice> {
  const siteOrigin = await resolveSiteOrigin();
  const wants = (channel: NoticeChannel) => options.only === undefined || options.only.has(channel);

  /** A channel that was deliberately not attempted. Reported as its own
   *  outcome so nothing downstream can read "we skipped this because it
   *  already succeeded" as "this failed". */
  const skipped: EmailChannelOutcome = { status: "already_sent" };

  const [applicant, admin] = await Promise.all([
    !wants("applicant")
      ? Promise.resolve(skipped)
      : sendEmployerRegistrationReceivedEmail({
          recipientEmail: params.contactEmail,
          language: params.language,
          companyName: params.companyName,
          contactName: params.contactName,
          siteOrigin,
        }).catch((err): EmailChannelOutcome => {
          console.error("[employer-registration-notice] applicant channel threw", err);
          return { status: "failed", error: "UNEXPECTED_ERROR" };
        }),
    !wants("admin")
      ? Promise.resolve(skipped)
      : sendEmployerRegistrationAdminEmail({
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

  // A channel that was not attempted writes no row. The trail records
  // attempts, and recording one that never happened would make the attempt
  // bound above count sends that were never sent.
  await Promise.all([
    applicant.status === "already_sent"
      ? Promise.resolve()
      : recordOutcome(params, "applicant", applicant),
    admin.status === "already_sent" ? Promise.resolve() : recordOutcome(params, "admin", admin),
  ]);

  return { applicant, admin };
}
