// The personal preview image, asked of the BUILT application running in workerd.
//
// Run: bun run scripts/og-worker-evidence.ts <app base url> <stub base url>
//
// Proves, against the Cloudflare Worker runtime and not Node: a valid 1200×630
// PNG on the first and on later requests (sequential and parallel), byte-equal
// to what the controlled model draws, nothing taken from the query, a long list
// and an undrawable name handled, and that an unknown id, a revoked share, an
// expired one and a failed read each answer correctly on the very next request
// (every request re-reads the share, so withdrawal cannot be served from memory).

import { unzlibSync } from "fflate";
import { renderShareImage } from "../src/lib/security-passport/og-image/render";
import { parsePublicSocialShare } from "../src/lib/security-passport/social-share-public";
import { ACTIVE_ID, ARABIC_ID, LONG_ID, payloadFor } from "./og-worker-fixture";

const [app, stub] = process.argv.slice(2);
if (!app || !stub) throw new Error("usage: og-worker-evidence.ts <app url> <stub url>");

let assertions = 0;
const errors: string[] = [];
const report: Record<string, unknown> = {};
function expect(ok: boolean, message: string): void {
  assertions += 1;
  if (!ok) errors.push(message);
}

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i += 1) {
    c ^= b[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Signature, chunk CRCs, inflates to exactly height × (1 + 3·width). */
function validPng(png: Uint8Array): { ok: boolean; width: number; height: number } {
  const bad = { ok: false, width: 0, height: 0 };
  if ([137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => png[i] !== v)) return bad;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  let end = false;
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (crc32(png.subarray(o + 4, o + 8 + len)) !== dv.getUint32(o + 8 + len)) return bad;
    const body = png.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = new DataView(body.buffer, body.byteOffset).getUint32(0);
      height = new DataView(body.buffer, body.byteOffset).getUint32(4);
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") end = true;
    o += 12 + len;
  }
  if (!end) return bad;
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of idat) {
    joined.set(c, p);
    p += c.length;
  }
  return { ok: unzlibSync(joined).length === height * (1 + 3 * width), width, height };
}

const get = (path: string, init: RequestInit = {}) =>
  fetch(`${app}${path}`, { redirect: "manual", ...init });
const setState = (id: string, state: string) =>
  fetch(`${stub}/__state`, { method: "POST", body: JSON.stringify({ id, state }) });
const rpcCalls = async () => ((await (await fetch(`${stub}/__calls`)).json()) as string[]).length;

function drawnInNode(id: string): Uint8Array {
  const share = parsePublicSocialShare(payloadFor(id), new Date().toISOString());
  if (share.status !== "active") throw new Error("fixture not active");
  return renderShareImage(share, new Date().toISOString().slice(0, 10))!;
}
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

async function main(): Promise<void> {
  await fetch(`${stub}/__reset`, { method: "POST" });

  // ── first request (cold: parses the three faces) and later ones ────────
  const timings: number[] = [];
  let first: Uint8Array | null = null;
  for (let i = 0; i < 6; i += 1) {
    const t = performance.now();
    const res = await get(`/og/share/${ACTIVE_ID}`);
    const body = new Uint8Array(await res.arrayBuffer());
    timings.push(Math.round(performance.now() - t));
    expect(res.status === 200, `request ${i + 1}: 200`);
    expect(res.headers.get("content-type") === "image/png", `request ${i + 1}: image/png`);
    expect(res.headers.get("cache-control") === "no-store", `request ${i + 1}: never cacheable`);
    const v = validPng(body);
    expect(v.ok && v.width === 1200 && v.height === 630, `request ${i + 1}: valid 1200×630 PNG`);
    if (i === 0) first = body;
    else expect(same(first!, body), `request ${i + 1}: identical to the first`);
  }
  report.sequentialMs = timings;
  expect(
    same(first!, drawnInNode(ACTIVE_ID)),
    "the Worker draws byte-for-byte what Node draws from the same payload",
  );

  // ── concurrent requests ────────────────────────────────────────────────
  const t0 = performance.now();
  const burst = await Promise.all(
    Array.from({ length: 20 }, async () => {
      const r = await get(`/og/share/${ACTIVE_ID}`);
      return { status: r.status, body: new Uint8Array(await r.arrayBuffer()) };
    }),
  );
  report.burstOf20Ms = Math.round(performance.now() - t0);
  expect(
    burst.every((b) => b.status === 200 && same(first!, b.body)),
    "20 parallel requests all give the same valid image",
  );

  // ── nothing from the client ────────────────────────────────────────────
  const tampered = await get(`/og/share/${ACTIVE_ID}?v=9&title=Evil&holder=Evil&image=x`);
  expect(same(first!, new Uint8Array(await tampered.arrayBuffer())), "the query selects nothing");

  // ── a long list and an undrawable name ─────────────────────────────────
  const long = await get(`/og/share/${LONG_ID}`);
  const longBody = new Uint8Array(await long.arrayBuffer());
  expect(
    long.status === 200 && validPng(longBody).ok,
    "forty credentials still give one valid image",
  );
  expect(same(longBody, drawnInNode(LONG_ID)), "and it is the controlled model's image");
  const arabic = await get(`/og/share/${ARABIC_ID}`);
  expect(
    arabic.status === 302 &&
      (arabic.headers.get("location") ?? "").endsWith("/og-security-passport.png"),
    "a name the faces cannot draw falls back to the branded image, not boxes",
  );

  // ── unknown and malformed ids ──────────────────────────────────────────
  for (const id of ["A".repeat(24), "not-an-id", "x".repeat(200)]) {
    const r = await get(`/og/share/${id}`);
    expect(
      r.status === 404 && r.headers.get("cache-control") === "no-store",
      `${id.slice(0, 12)}: 404, not cacheable`,
    );
  }

  // ── withdrawal takes effect on the very next request ───────────────────
  const before = await rpcCalls();
  await get(`/og/share/${ACTIVE_ID}`);
  expect(
    (await rpcCalls()) === before + 1,
    "every request re-reads the share (nothing is served from memory)",
  );
  for (const state of ["revoked", "expired"] as const) {
    await setState(ACTIVE_ID, state);
    const r = await get(`/og/share/${ACTIVE_ID}`);
    expect(r.status === 404 && r.headers.get("cache-control") === "no-store", `${state}: no image`);
    const page = await (await get(`/s/${ACTIVE_ID}`)).text();
    expect(
      !page.includes("Selma Dahlberg") && !page.includes(`/og/share/${ACTIVE_ID}`),
      `${state}: the page carries neither the name nor the personal image`,
    );
    expect(
      /og-security-passport\.png/.test(page),
      `${state}: the page's preview is the generic image`,
    );
  }
  await setState(ACTIVE_ID, "error");
  const failed = await get(`/og/share/${ACTIVE_ID}`);
  expect(
    failed.status === 503 && failed.headers.get("retry-after") === "60",
    "a failed read asks the crawler to retry (503), it is not 'gone'",
  );
  await setState(ACTIVE_ID, "active");
  const back = await get(`/og/share/${ACTIVE_ID}`);
  expect(
    back.status === 200 && same(first!, new Uint8Array(await back.arrayBuffer())),
    "and an active share serves again, unchanged",
  );

  // ── the page a crawler reads ───────────────────────────────────────────
  const html = await (await get(`/s/${ACTIVE_ID}`)).text();
  const og = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html)?.[1] ?? "";
  expect(
    new URL(og).pathname === `/og/share/${ACTIVE_ID}` && /^\?v=\d+$/.test(new URL(og).search),
    "an active share's og:image is its own personal image",
  );
  expect(
    /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/.test(html),
    "the page is noindex",
  );
  expect(
    !/"user_id"|@example|holder_user_id/.test(html),
    "the raw page carries no private identifier",
  );

  report.assertions = assertions;
  console.log(JSON.stringify(report));
}

await main();
if (errors.length > 0) {
  console.error(`og-worker-evidence FAILED (${errors.length} of ${assertions}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`og-worker-evidence: ${assertions} assertions passed`);
