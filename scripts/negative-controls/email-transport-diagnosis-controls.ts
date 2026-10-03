/**
 * Negative controls for the e-mail transport diagnosis.
 *
 * The diagnosis exists so that an HTTP 401 from the `transactional-email`
 * function is never reported as "the Resend secret is missing". Each way that
 * could quietly stop being true is planted: 401 collapsing into the
 * missing-secret reason, 404 reported as a rejected key, any 503 treated as a
 * missing secret, the reason not being logged for the operator, and the
 * answer no longer being cached.
 *
 * Run: bun run negative-controls:email-transport-diagnosis
 */
import { runControls, type Mutation } from "./runner";

const FILE = "src/lib/email/transport.server.ts";
const GUARD = "email-transport-diagnosis:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "ET-NC-401-IS-MISSING-SECRET",
    defect: "a 401 from the function is reported as a missing Resend secret",
    file: FILE,
    find: 'answer = { ready: false, reason: "key_rejected", status };',
    replace: 'answer = { ready: false, reason: "provider_key_missing", status };',
    guard: GUARD,
    expect: "401 is key_rejected",
  },
  {
    id: "ET-NC-404-IS-KEY-REJECTED",
    defect: "an undeployed function is reported as a rejected key",
    file: FILE,
    find: 'answer = { ready: false, reason: "function_not_deployed", status };',
    replace: 'answer = { ready: false, reason: "key_rejected", status };',
    guard: GUARD,
    expect: "404 is function_not_deployed",
  },
  {
    id: "ET-NC-ANY-503-IS-MISSING-SECRET",
    defect: "any 503 is reported as a missing Resend secret, not only not_configured",
    file: FILE,
    find: 'else if (status === 503 && outcome === "not_configured") {',
    replace: "else if (status === 503) {",
    guard: GUARD,
    expect: "any other 503 is unexpected",
  },
  {
    id: "ET-NC-REASON-NOT-LOGGED",
    defect: "the reason is no longer written to the server log",
    file: FILE,
    find: "if (!answer.ready && readiness?.answer.reason !== answer.reason) {",
    replace: "if (false) {",
    guard: GUARD,
    expect: "the reason and HTTP status are logged once",
  },
  {
    id: "ET-NC-NOT-CACHED",
    defect: "the readiness answer is asked for again on every call",
    file: FILE,
    find: "if (readiness && now - readiness.at < READINESS_TTL_MS) return readiness.answer;",
    replace: "",
    guard: GUARD,
    expect: "the answer is cached for the window",
  },
];

runControls("email-transport-diagnosis", MUTATIONS);
