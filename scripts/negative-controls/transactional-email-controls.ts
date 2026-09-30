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
