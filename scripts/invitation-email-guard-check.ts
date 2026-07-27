// MVP stabilization — assessment invitation email defect. Focused
// regression checks matching the established scripts/*-check.ts pattern
// (plain source-text + schema assertions, no test runner configured in
// this project). createAssessmentAssignment cannot be invoked outside
// the TanStack Start server runtime, so this exercises the pure send
// function directly and asserts the call-site wiring by source text.

import { readFileSync } from "node:fs";
import path from "node:path";
import { sendInvitationEmail } from "../src/lib/email/send-invitation-email.server";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
function read(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf8");
}

// -----------------------------------------------------------------------
// 1. With no RESEND_API_KEY/RESEND_FROM_EMAIL in the environment, sending
//    must be a pure no-op: no network call, a clean "skipped" result.
//    This is the exact guarantee that keeps today's copy-link-only
//    behaviour unchanged for every environment that hasn't configured a
//    provider yet.
// -----------------------------------------------------------------------
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM_EMAIL;

const result = await sendInvitationEmail({
  recipientEmail: "candidate.test@example.invalid",
  language: "sv",
  assessmentNameSv: "Testnamn",
  assessmentNameEn: "Test name",
  invitationUrl: "https://example.invalid/invite/faketoken",
  expiresAt: new Date().toISOString(),
  employerMessage: null,
});

expect(
  result.ok === false && "skipped" in result && result.skipped === true,
  "sendInvitationEmail() must return a clean skipped result with no RESEND_API_KEY configured -- never attempt a network call",
);

// -----------------------------------------------------------------------
// 2. The send function must never throw -- a provider outage or a bad
//    key must never take down assignment creation itself.
// -----------------------------------------------------------------------
let threw = false;
try {
  await sendInvitationEmail({
    recipientEmail: "candidate.test@example.invalid",
    language: "en",
    assessmentNameSv: "x",
    assessmentNameEn: "x",
    invitationUrl: "https://example.invalid/invite/faketoken",
    expiresAt: new Date().toISOString(),
    employerMessage: null,
  });
} catch {
  threw = true;
}
expect(
  !threw,
  "sendInvitationEmail() must never throw -- callers rely on a typed result, not a try/catch",
);

// -----------------------------------------------------------------------
// 3. createAssessmentAssignment must call the send function, must persist
//    a real delivery outcome (never leave it silently ambiguous), and
//    must never let a failed send fail the assignment itself.
// -----------------------------------------------------------------------
const assignmentFns = read("src/lib/job-intelligence/assessment-assignments.functions.ts");
expect(
  assignmentFns.includes("sendInvitationEmail(") &&
    assignmentFns.includes('import("@/lib/email/send-invitation-email.server")'),
  "createAssessmentAssignment must call sendInvitationEmail()",
);
expect(
  assignmentFns.includes('email_delivery_status: "sent"') &&
    assignmentFns.includes('email_delivery_status: "failed"'),
  "createAssessmentAssignment must persist a real email_delivery_status outcome (sent/failed), not leave the row at the default silently",
);
expect(
  assignmentFns.includes("emailDeliveryStatus") &&
    assignmentFns.includes("return {") &&
    assignmentFns.includes("invitationToken: token"),
  "createAssessmentAssignment must return emailDeliveryStatus to the caller so the UI can show the real outcome",
);

// -----------------------------------------------------------------------
// 4. The send function must never log or leak the API key itself --
//    only its own error text (which never contains the key).
// -----------------------------------------------------------------------
const sendFn = read("src/lib/email/send-invitation-email.server.ts");
expect(
  !/console\.(log|error|warn)\([^)]*apiKey/i.test(sendFn),
  "send-invitation-email.server.ts must never log the API key variable",
);
expect(
  sendFn.includes("Authorization: `Bearer ${apiKey}`"),
  "send-invitation-email.server.ts must send the key only as the Authorization header to the provider, nowhere else",
);

// -----------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`invitation-email-guard:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("invitation-email-guard:check OK");
