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
    find: '  if (!(await callerIsServer(req))) return json(401, { outcome: "unauthorized" });',
    replace: "  void callerIsServer;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-PROJECT-CHECK-TRUSTS-ANY-ANSWER",
    defect: "the project check accepts any answer, so a user JWT becomes a server key",
    file: FN,
    find: "    if (res.status !== 200) return false;",
    replace: "    if (res.status >= 500) return false;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-PROJECT-ASKED-ABOUT-ANY-KEY",
    defect: "anon keys, user tokens and other projects' keys are sent to the project check",
    file: FN,
    find: "  if (!base || key.length < 20 || !couldBeServiceKey(key, base)) return false;",
    replace: "  if (!base || key.length < 20) return false;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-SHAPE-CHECK-IGNORES-ROLE",
    defect: "any JWT counts as service-key-shaped, whatever role it claims",
    file: FN,
    find: '    if (!payload || payload.role !== "service_role") return false;',
    replace: "    if (!payload) return false;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-PROJECT-CHECK-MIXED-HEADERS",
    defect: "a caller may pair a service apikey with its own bearer",
    file: FN,
    find: "  if (!presented || (bearer && apikey && !sameSecret(bearer, apikey))) return false;",
    replace: "  if (!presented) return false;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-REQUEST-CHOOSES-FROM",
    defect: "the request may choose the From address",
    file: FN,
    find: "        from: fromFor(kind, input.senderName),",
    replace:
      '        from: typeof input.from === "string" ? input.from : fromFor(kind, input.senderName),',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-SENDER-NAME-UNFILTERED",
    defect: "an organisation's sender name is used as given, so it can carry an address",
    file: FN,
    find: '    .replace(/[^\\p{L}\\p{N} .&\'\\u2019-]+/gu, " ")',
    replace: '    .replace(/[\\r\\n]+/g, " ")',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "TE-NC-SENDER-NAME-ON-EVERY-KIND",
    defect: "any kind may carry a sender name, so CQrityjob's own mail can wear another name",
    file: FN,
    find: "  const name = ORGANISATION_SENDER_KINDS.has(kind) ? senderDisplayName(senderName) : null;",
    replace: "  const name = senderDisplayName(senderName);",
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
