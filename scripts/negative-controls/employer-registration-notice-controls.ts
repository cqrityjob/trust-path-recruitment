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
];

await runControls("employer-registration-notice", MUTATIONS);
