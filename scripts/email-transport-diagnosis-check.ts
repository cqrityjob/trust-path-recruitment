/**
 * Guard: the product-mail transport says WHY it is not ready.
 *
 * /contact and the admin page used to read "the transport is not ready" as
 * "the Resend key is missing". The function can also be undeployed, or
 * answer 401 because it does not accept the key this server holds. Those
 * three need three different fixes, and the third is invisible from the
 * page: the owner stores a key that is already there and nothing changes.
 *
 * This runs emailTransportDiagnosis() against stubbed answers and asserts
 * the reason for each, that a reason carries no value of any setting, and
 * that the page-level boolean still means exactly "ready".
 *
 * Run: bun run email-transport-diagnosis:check
 */
import {
  emailTransportDiagnosis,
  emailTransportReady,
  resetEmailTransportReadinessForTests,
} from "../src/lib/email/transport.server";

let failures = 0;
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${String(detail)}`}`,
  );
  if (!ok) failures += 1;
}

const URL_VALUE = "https://project-ref.example";
const KEY_VALUE = "service-role-guard-value-0123456789abcdef";
process.env.SUPABASE_URL = URL_VALUE;
process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_VALUE;

function answering(status: number, body?: unknown): typeof fetch {
  return (async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

const errors: string[] = [];
const realError = console.error;
console.error = (...args: unknown[]) => {
  errors.push(args.map(String).join(" "));
};

async function diagnose(fetchImpl: typeof fetch) {
  resetEmailTransportReadinessForTests();
  return emailTransportDiagnosis(fetchImpl);
}

console.log("emailTransportDiagnosis");
{
  const ready = await diagnose(answering(200, { outcome: "ready" }));
  ck("200 is ready", ready.ready === true && ready.reason === "ready");

  const rejected401 = await diagnose(answering(401, { outcome: "unauthorized" }));
  ck(
    "401 is key_rejected — NOT a missing Resend secret",
    !rejected401.ready && rejected401.reason === "key_rejected" && rejected401.status === 401,
    JSON.stringify(rejected401),
  );

  const rejected403 = await diagnose(answering(403));
  ck("403 is key_rejected", !rejected403.ready && rejected403.reason === "key_rejected");

  const missing = await diagnose(answering(404));
  ck("404 is function_not_deployed", !missing.ready && missing.reason === "function_not_deployed");

  const noSecret = await diagnose(answering(503, { outcome: "not_configured" }));
  ck(
    "503 not_configured is provider_key_missing",
    !noSecret.ready && noSecret.reason === "provider_key_missing",
  );

  const other503 = await diagnose(answering(503, { outcome: "overloaded" }));
  ck(
    "any other 503 is unexpected, not a missing secret",
    !other503.ready && other503.reason === "unexpected",
  );

  const boom = await diagnose(answering(500));
  ck("500 is unexpected", !boom.ready && boom.reason === "unexpected" && boom.status === 500);

  const unreachable = await diagnose((async () => {
    throw new Error("network down");
  }) as typeof fetch);
  ck(
    "a network failure is unreachable",
    !unreachable.ready && unreachable.reason === "unreachable",
  );
}

console.log("settings, caching and logging");
{
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetEmailTransportReadinessForTests();
  const noSettings = await emailTransportDiagnosis(answering(200));
  ck(
    "absent app settings are settings_missing",
    !noSettings.ready && noSettings.reason === "settings_missing",
  );
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;

  resetEmailTransportReadinessForTests();
  let calls = 0;
  const counting = (async () => {
    calls += 1;
    return new Response(null, { status: 401 });
  }) as typeof fetch;
  await emailTransportDiagnosis(counting);
  await emailTransportDiagnosis(counting);
  ck("the answer is cached for the window (one call for two questions)", calls === 1, calls);

  errors.length = 0;
  resetEmailTransportReadinessForTests();
  await emailTransportDiagnosis(answering(401));
  ck(
    "the reason and HTTP status are logged once for the server operator",
    errors.length === 1 && errors[0] === "[email-transport] not ready: key_rejected (HTTP 401)",
    errors.join(" | "),
  );
  ck(
    "the log line carries no setting value",
    !errors.join("\n").includes(URL_VALUE) && !errors.join("\n").includes(KEY_VALUE),
  );

  resetEmailTransportReadinessForTests();
  ck(
    "emailTransportReady is true exactly when ready",
    (await emailTransportReady(answering(200))) === true,
  );
  resetEmailTransportReadinessForTests();
  ck("emailTransportReady is false for 401", (await emailTransportReady(answering(401))) === false);
}

console.error = realError;
if (failures > 0) {
  console.error(`\nemail-transport-diagnosis:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nemail-transport-diagnosis:check — ok");
