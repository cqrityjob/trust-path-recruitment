/**
 * Planted defects for employer-registration-notice:check.
 *
 * Every mutation here is one of the three real defects that produced "the
 * company heard nothing and the administrator was never told", or a defect
 * of exactly the same shape. If the guard passes with one of them applied,
 * the guard is decoration and this control says so.
 *
 * The third mutation is the one worth naming. The approval check is a
 * SENTENCE-level test rather than a word search, because the message
 * legitimately contains the word "approved" twice — in a denial and in a
 * condition. A word search would have had to be loosened until it caught
 * nothing, and a check that catches nothing still prints "ok". So the
 * control plants the actual bad sentence and requires the guard to find it.
 *
 * Run: bun run negative-controls:employer-registration-notice
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "employer-registration-notice:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "ERN-NC-ENTRANCE-BLIND",
    defect:
      "the employer entrance stops pre-selecting organisation registration — the original defect: 'register your company' produces a candidate account and no application",
    file: "src/lib/auth/organisation-entrance.ts",
    find: '  return path === "/employer" || path.startsWith("/employer/");',
    replace: "  return false;",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-JOIN-PRE-TICKED",
    defect:
      "an invitation to an EXISTING organisation pre-selects 'create an organisation', inviting a colleague to register a duplicate company",
    file: "src/lib/auth/organisation-entrance.ts",
    find: '  if (path === "/employer/join" || path.startsWith("/employer/join/")) return false;',
    replace: "  // exclusion removed",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-APPROVAL-CLAIMED",
    defect:
      "the confirmation email tells the company it has been approved, which is the confusion the whole flow exists to prevent",
    file: "src/lib/email/send-employer-registration-email.server.ts",
    find: '      "Registreringen är ännu inte godkänd. Det här mejlet bekräftar bara att vi har tagit emot den.",',
    replace: '      "Företaget är godkänt och kontot är aktiverat.",',
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-SIGNUP-PATH-SILENT",
    defect:
      "a registration completed after email verification announces nothing — neither the company nor the administrator hears about it",
    file: "src/lib/job-intelligence/employer-onboarding.functions.ts",
    find: `    const notice = await announceRegistration(ctx, {
      id: row.employer_id,
      name,
      country,
    });`,
    replace: `    const notice = {
      applicant: { status: "failed" as const, error: "MUTATED" },
      admin: { status: "failed" as const, error: "MUTATED" },
    };`,
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-SEND-FAILURE-THROWS",
    defect:
      "a failed announcement throws, so a SAVED registration is reported to the registrant as a failed one — and the recovery they are invited to is a second registration",
    file: "src/lib/job-intelligence/employer-onboarding.functions.ts",
    find: `  } catch (err) {
    console.error("[employer-onboarding] announcement failed", err);
    return {
      applicant: { status: "failed", error: "UNEXPECTED_ERROR" },
      admin: { status: "failed", error: "UNEXPECTED_ERROR" },
    };
  }`,
    replace: `  } catch (err) {
    throw err;
  }`,
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-UNCONFIGURED-REPORTED-AS-SENT",
    defect:
      "an absent mail provider is reported as a successful send, which is the one thing a delivery report may never do",
    file: "src/lib/email/send-employer-registration-email.server.ts",
    find: `  const missing = missingTransportEnv();
  if (missing.length > 0) return { status: "not_configured", missing };`,
    replace: `  const missing = missingTransportEnv();
  if (missing.length > 0) return { status: "sent" };`,
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-ADMIN-LINK-DROPPED",
    defect:
      "the administrator notification stops linking to the registration, so it names a company but not the row to open",
    file: "src/lib/email/send-employer-registration-email.server.ts",
    find: "  const url = `${params.siteOrigin}/admin/employers/${params.employerId}`;",
    replace: "  const url = `${params.siteOrigin}/employer`;",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-PENDING-PAGE-ALWAYS-CLAIMS-SENT",
    defect:
      "the review page says a confirmation was sent regardless of what happened — a failed send hidden behind a claim that mail went out",
    file: "src/routes/_authenticated.employer.pending.tsx",
    find: `                {t(
                  notice.applicant.status === "sent"
                    ? "employer.pending.email.sent"
                    : "employer.pending.email.notSent",
                )}`,
    replace: `                {t("employer.pending.email.sent")}`,
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  // ── THE RELIABILITY HALF ────────────────────────────────────────────
  //
  // "The user closed the page" and "do not resend what already worked" are
  // the two properties that are invisible until they are wrong in
  // production, so both of them are planted here.
  {
    id: "ERN-NC-PROVISION-DEFERRED-TO-A-LATER-PAGE",
    defect:
      "the signup stops provisioning in the request the person is waiting on, so closing the tab immediately leaves an account with no application and nothing for an administrator to see",
    file: "src/components/auth/UnifiedAuthPanel.tsx",
    find: "              const provisioned = await ensureCompany();",
    replace: "              const provisioned = { created: false } as never;",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-NO-CATCH-UP",
    defect:
      "a registration whose request died between the commit and the send is never announced, and nobody ever finds out",
    file: "src/lib/job-intelligence/employer-onboarding.functions.ts",
    find: "      await catchUpOutstandingNotice(ctx, (existing ?? [])[0]?.employer_id as string | undefined);",
    replace: "      // catch-up removed",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-UNREADABLE-TRAIL-RESENDS",
    defect:
      "an unreadable delivery trail is treated as 'probably not sent', so every page load puts another copy in the company's inbox",
    file: "src/lib/job-intelligence/employer-registration-notice.server.ts",
    find: `    console.error("[employer-registration-notice] could not read the delivery trail", err);
    return none;`,
    replace: `    console.error("[employer-registration-notice] could not read the delivery trail", err);
    return new Set(NOTICE_CHANNELS);`,
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-APPROVED-ORG-ANNOUNCED-AGAIN",
    defect:
      "an organisation that has already been decided is announced again, so 'we have received your registration' arrives after the approval",
    file: "src/lib/job-intelligence/employer-registration-notice.server.ts",
    find: '    if (!employer || employer.status !== "pending") return none;',
    replace: "    if (!employer) return none;",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-RESEND-REPEATS-A-SUCCESS",
    defect:
      "the administrator's resend sends both channels regardless, so fixing a failed admin notification puts a second confirmation in the company's inbox",
    file: "src/lib/job-intelligence/admin-employer-moderation.functions.ts",
    find: "    if (only.size === 0) return before;",
    replace: "    // outstanding check removed",
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-SKIPPED-CHANNEL-REPORTED-AS-SENT",
    defect:
      "a channel that was deliberately skipped is reported as sent, so a catch-up that did nothing reads as a delivery",
    file: "src/lib/job-intelligence/employer-registration-notice.server.ts",
    find: '  const skipped: EmailChannelOutcome = { status: "already_sent" };',
    replace: '  const skipped: EmailChannelOutcome = { status: "sent" };',
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  // ── THE SERVER-ONLY BOUNDARY ────────────────────────────────────────
  //
  // Both of these would put the mail provider -- and the environment variable
  // that authenticates to it -- inside the browser bundle.
  {
    id: "ERN-NC-SENDER-STATICALLY-IMPORTED",
    defect:
      "a client-reachable module imports the announcer as a value instead of as a type, pulling the server-only sender and the service-role client into the browser bundle",
    file: "src/lib/job-intelligence/registration-notice-cache.ts",
    find: 'import type { EmployerRegistrationNotice } from "@/lib/job-intelligence/employer-registration-notice.server";',
    replace:
      'import { type EmployerRegistrationNotice, EMPLOYER_REGISTRATION_NOTICE_ACTION } from "@/lib/job-intelligence/employer-registration-notice.server";\nvoid EMPLOYER_REGISTRATION_NOTICE_ACTION;',
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
  {
    id: "ERN-NC-PROVIDER-ENDPOINT-OUTSIDE-SERVER",
    defect:
      "the provider endpoint appears in a module that is not server-only, which is a call the browser could be made to perform",
    file: "src/lib/auth/organisation-entrance.ts",
    find: 'import { safeReturnPath } from "./safe-redirect";',
    replace:
      'import { safeReturnPath } from "./safe-redirect";\nconst ENDPOINT = "https://api.resend.com/emails";\nvoid ENDPOINT;',
    guard: GUARD,
    expect: "SELF-TEST FAILED",
  },
];

await runControls("employer-registration-notice", MUTATIONS);
