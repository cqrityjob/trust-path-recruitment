/**
 * Negative controls for transactional-email:check.
 *
 * Each mutation plants one real defect in the e-mail function or the app
 * transport; the guard must fail on every one. Run: bun run
 * negative-controls:transactional-email
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "transactional-email:check";
const FN = "supabase/functions/transactional-email/index.ts";

const MUTATIONS: Mutation[] = [
  {
    id: "TE-NC-NO-CALLER-CHECK",
    defect: "the function stops checking who calls it, so anyone could send as CQrityjob",
    file: FN,
    find: '  if (!callerIsServer(req)) return json(401, { outcome: "unauthorized" });',
    replace: "  void callerIsServer;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-REQUEST-CHOOSES-FROM",
    defect: "the request may choose the From address",
    file: FN,
    find: "        from: FROM,",
    replace: '        from: typeof input.from === "string" ? input.from : FROM,',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-REQUEST-CHOOSES-ADMIN-RECIPIENT",
    defect: "a contact enquiry goes wherever the request says instead of to info@",
    file: FN,
    find: '  const to = policy.to === "admin" ? ADMIN_INBOX : (callerTo as string);',
    replace:
      '  const to = policy.to === "admin" ? (address(input.to) ?? ADMIN_INBOX) : (callerTo as string);',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-PROVIDER-BODY-READ",
    defect: "the provider response body is read, and with it possibly the recipient address",
    file: FN,
    find: "    await res.body?.cancel().catch(() => {});\n    console.log",
    replace: "    await res.text();\n    console.log",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-RECIPIENT-LOGGED",
    defect: "the function logs the recipient address",
    file: FN,
    find: "    console.log(`[transactional-email] ${kind} ${res.status}`);",
    replace: "    console.log(`[transactional-email] ${kind} ${res.status} ${to}`);",
    guard: GUARD,
    expect: "FAILED",
  },
  // The employer's e-mail on a new application (employer_new_application): the
  // recipient comes from the request (chosen by the database, validated here),
  // there is no Reply-To, and the From is CQrityjob's own.
  {
    id: "TE-NC-EMPLOYER-NOTICE-REPLY-TO",
    defect:
      "the employer's new-application mail gets a Reply-To, so the employer could answer into an inbox nobody reads for it",
    file: FN,
    find: 'employer_new_application: { to: "caller", replyTo: "none" },',
    replace: 'employer_new_application: { to: "caller", replyTo: "admin" },',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-EMPLOYER-NOTICE-ORGANISATION-SENDER",
    defect:
      "the employer's new-application mail may carry an organisation's name as the sender, though it is CQrityjob writing",
    file: FN,
    find: '  "academy_invitation",\n]);',
    replace: '  "academy_invitation",\n  "employer_new_application",\n]);',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-EMPLOYER-NOTICE-TO-ADMIN-INBOX",
    defect:
      "the employer's new-application mail goes to the admin inbox instead of the person the database chose",
    file: FN,
    find: 'employer_new_application: { to: "caller", replyTo: "none" },',
    replace: 'employer_new_application: { to: "admin", replyTo: "none" },',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-EMPLOYER-NOTICE-KIND-MISSING",
    defect:
      "the new-application kind is not accepted, so the notice would be refused as an unknown kind",
    file: FN,
    find: '  employer_new_application: { to: "caller", replyTo: "none" }, // CQrityjob to an organisation\'s own people; no Reply-To, no organisation name\n',
    replace: "",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-EMPLOYER-NOTICE-KIND-NOT-IN-TRANSPORT",
    defect: "the app's transport does not know the kind, so a sender cannot name it",
    file: "src/lib/email/transport.server.ts",
    find: '  | "academy_invitation"\n  | "employer_new_application";',
    replace: '  | "academy_invitation";',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-APP-CALLS-RESEND-DIRECTLY",
    defect: "an app sender calls Resend directly again, which needs a key in the app host",
    file: "src/lib/email/send-invitation-email.server.ts",
    find: "  try {\n    const res = await sendTransactionalEmail({",
    replace:
      '  void fetch("https://api.resend.com/emails");\n  try {\n    const res = await sendTransactionalEmail({',
    guard: GUARD,
    expect: "FAILED",
  },
];

runControls("transactional-email", MUTATIONS);
