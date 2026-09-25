/**
 * Calls the receipt recovery endpoint once and reports what it did.
 *
 *   RECRUITMENT_SWEEP_URL    https://<the deployed app>/api/recruitment/receipts-sweep
 *   RECRUITMENT_SWEEP_TOKEN  the same value the app server holds in
 *                            RECRUITMENT_SWEEP_TOKEN (≥ 16 characters)
 *   RECRUITMENT_SWEEP_LIMIT  optional, default 20, at most 200
 *
 * Run by .github/workflows/recruitment-receipts-sweep.yml on a schedule, or
 * by hand. Prints counts only -- never an address, never the token. Exits
 * non-zero when the endpoint could not be reached or refused the call, so a
 * scheduled run that silently did nothing cannot look like a run that did.
 */

const url = process.env.RECRUITMENT_SWEEP_URL ?? "";
const token = process.env.RECRUITMENT_SWEEP_TOKEN ?? "";
const limit = Number(process.env.RECRUITMENT_SWEEP_LIMIT ?? "20");

if (!url || !token) {
  console.error("receipts-sweep: RECRUITMENT_SWEEP_URL and RECRUITMENT_SWEEP_TOKEN are required.");
  process.exit(2);
}
if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("receipts-sweep: the URL must be https, or loopback for a local check.");
  process.exit(2);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 120_000);
try {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: Number.isFinite(limit) ? limit : 20 }),
    signal: controller.signal,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`receipts-sweep: the endpoint answered ${res.status}.`);
    process.exit(1);
  }
  const summary = JSON.parse(text) as Record<string, unknown>;
  console.log(
    `receipts-sweep: claimed ${summary.claimed} · sent ${summary.sent} · failed ${summary.failed} · not configured ${summary.notConfigured} · unknown ${summary.unknown} (${summary.at})`,
  );
} catch (e) {
  console.error(
    "receipts-sweep: the endpoint could not be reached.",
    e instanceof Error ? e.message : e,
  );
  process.exit(1);
} finally {
  clearTimeout(timer);
}
