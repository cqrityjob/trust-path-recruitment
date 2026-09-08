/**
 * Are the Career Center's sources real, reachable, and recently read?
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * Two of the sources this catalogue shipped were 404s. Both were polisen.se
 * URLs that had been correct when somebody wrote them down and had since
 * moved; both rendered as a confident external link under a heading reading
 * "Källor". A dead source is worse than no source, because it looks like
 * diligence.
 *
 * A separate finding in the same review: a guide was citing lagen (1980:578)
 * om ordningsvakter — an Act repealed in 2023 — as the current requirement.
 * That one is not detectable by fetching a URL: riksdagen.se serves repealed
 * legislation happily, with a 200. It is detectable by REVIEW DATES, which is
 * why this script enforces a freshness policy as well as reachability.
 *
 * ── TWO MODES, BECAUSE CI MUST NOT DEPEND ON THE INTERNET ──────────────
 *
 *   default    OFFLINE. Structural rules — every source URL is HTTPS, on an
 *              allowlisted publisher domain, and covered by the committed
 *              snapshot below with a recorded status. Plus the freshness
 *              policy over every review date in the catalogue. This runs in
 *              CI and cannot be made flaky by somebody else's outage.
 *
 *   --online   Actually fetches every URL and REWRITES the snapshot. Run by
 *              hand when sources are added or reviewed. Network content is
 *              never executable here: a fetch produces a status code and a
 *              date, nothing more.
 *
 * The snapshot is evidence somebody read once and committed, and the offline
 * mode says how old it is — a stale snapshot answers confidently about a web
 * that has moved on. This mirrors the pattern `deploy-plan-check.ts` uses for
 * the hosted migration ledger.
 *
 * Run: bun run career-center:sources
 *      bun run career-center:sources -- --online
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const SNAPSHOT = path.join(root, "docs/career-center/source-snapshot.json");
const ONLINE = process.argv.includes("--online");

/**
 * How old a review date may be.
 *
 * Two years, matching TRANSITION_REVIEW_MAX_AGE_DAYS. These are claims about
 * law, and law moves: the repealed-Act defect is precisely what an unbounded
 * review date lets through.
 */
const MAX_REVIEW_AGE_DAYS = 730;

/**
 * Publishers a Career Center source may come from.
 *
 * An allowlist rather than a format check. "It is a valid HTTPS URL" is not
 * the property that matters — the property that matters is that a legal claim
 * cites the body that made the law, the authority that administers it, or the
 * standards organisation that published the standard. A source pointing at a
 * training company's marketing page would pass every syntactic test and be
 * exactly the thing this catalogue must not do.
 */
const ALLOWED_HOSTS: readonly string[] = [
  "www.riksdagen.se", // Svensk författningssamling — the statutes themselves
  "polisen.se", // Polismyndigheten — regulations and administration
  "www.msb.se", // MSB — civil contingencies, continuity and preparedness
  "www.fi.se", // Finansinspektionen — the AML supervisor
  "www.iso.org", // ISO — the standards, and what ISO does and does not certify
  "www.asisonline.org", // ASIS International — its own credentials
  "www.acams.org", // ACAMS — its own credential
  "sbsc.se", // Svensk Brand- och Säkerhetscertifiering
];

interface SnapshotEntry {
  readonly url: string;
  readonly status: number | "unreachable";
  readonly checkedOn: string;
}
interface Snapshot {
  readonly $comment: string;
  readonly checkedOn: string;
  readonly entries: readonly SnapshotEntry[];
}

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const today = new Date();
const isoToday = today.toISOString().slice(0, 10);

function ageDays(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const at = Date.parse(iso + "T00:00:00Z");
  if (Number.isNaN(at)) return null;
  return (today.getTime() - at) / 86_400_000;
}

// ---------------------------------------------------------------------------
// Collect every source the Career Center can render
// ---------------------------------------------------------------------------

const { professions } = await import("../src/lib/career-center/professions");
const { publishedProfessions } = await import("../src/lib/career-center/publishability");
const { education } = await import("../src/lib/career-center/education");
const { certifications } = await import("../src/lib/career-center/certifications");
const { careerPaths } = await import("../src/lib/career-center/career-paths");
const { PROFESSION_EDUCATION_LINKS } = await import("../src/lib/career-center/education-links");

interface CollectedSource {
  readonly where: string;
  readonly url?: string;
  readonly publisher?: string;
  readonly reviewedOn?: string;
}

const collected: CollectedSource[] = [];

for (const p of publishedProfessions) {
  for (const s of p.sources ?? []) {
    collected.push({
      where: `profession ${p.id}`,
      url: s.url,
      publisher: s.publisher,
      reviewedOn: p.lastVerified,
    });
  }
}
for (const e of education) {
  if (e.status === "placeholder") continue;
  if (e.officialSource) {
    collected.push({
      where: `education ${e.id}`,
      url: e.officialSource.url,
      publisher: e.officialSource.publisher,
      reviewedOn: e.lastVerified,
    });
  }
}
for (const c of certifications) {
  if (c.status === "placeholder") continue;
  if (c.officialSource) {
    collected.push({
      where: `certification ${c.id}`,
      url: c.officialSource.url,
      publisher: c.officialSource.publisher,
      reviewedOn: c.lastVerified,
    });
  }
}
for (const edge of careerPaths) {
  for (const s of edge.sources ?? []) {
    collected.push({
      where: `transition ${edge.from} -> ${edge.to}`,
      url: s.url,
      publisher: s.publisher,
      reviewedOn: edge.lastVerified,
    });
  }
}
for (const link of PROFESSION_EDUCATION_LINKS) {
  if (!link.authority) continue;
  collected.push({
    where: `education link ${link.professionId}/${link.offerId}`,
    url: link.authority.url,
    publisher: link.authority.publisher,
    reviewedOn: link.lastVerified,
  });
}

// ---------------------------------------------------------------------------
// Structural rules
// ---------------------------------------------------------------------------

for (const s of collected) {
  expect(Boolean(s.url || s.publisher), `${s.where}: a source must carry a URL or a publisher`);
  if (!s.url) continue;
  expect(s.url.startsWith("https://"), `${s.where}: source URL must be HTTPS — ${s.url}`);
  let host = "";
  try {
    host = new URL(s.url).host;
  } catch {
    errors.push(`${s.where}: source URL does not parse — ${s.url}`);
    continue;
  }
  expect(
    ALLOWED_HOSTS.includes(host),
    `${s.where}: "${host}" is not an allowlisted source publisher. A career guide cites the body that made the rule, not whoever ranks well for it.`,
  );
}

// ---------------------------------------------------------------------------
// Freshness policy — over every review date the catalogue renders
// ---------------------------------------------------------------------------

const reviewDates: { readonly where: string; readonly iso: string | undefined }[] = [
  ...publishedProfessions.map((p) => ({ where: `profession ${p.id}`, iso: p.lastVerified })),
  ...education
    .filter((e) => e.status !== "placeholder")
    .map((e) => ({ where: `education ${e.id}`, iso: e.lastVerified })),
  ...certifications
    .filter((c) => c.status !== "placeholder")
    .map((c) => ({ where: `certification ${c.id}`, iso: c.lastVerified })),
  ...careerPaths
    .filter((e) => e.status !== "placeholder")
    .map((e) => ({ where: `transition ${e.from} -> ${e.to}`, iso: e.lastVerified })),
  ...PROFESSION_EDUCATION_LINKS.map((l) => ({
    where: `education link ${l.professionId}/${l.offerId}`,
    iso: l.lastVerified,
  })),
];

for (const r of reviewDates) {
  if (!r.iso) {
    errors.push(`${r.where}: published content must carry a review date`);
    continue;
  }
  const age = ageDays(r.iso);
  if (age === null) {
    errors.push(`${r.where}: review date "${r.iso}" is not a valid ISO date`);
    continue;
  }
  expect(age >= 0, `${r.where}: review date "${r.iso}" is in the future`);
  expect(
    age <= MAX_REVIEW_AGE_DAYS,
    `${r.where}: reviewed ${Math.round(age)} days ago, over the ${MAX_REVIEW_AGE_DAYS}-day policy — re-read the source and update the date, or withdraw the claim`,
  );
}

// Nothing unpublished may claim a review date it has not earned.
for (const p of professions) {
  if (publishedProfessions.some((x) => x.id === p.id)) continue;
  expect(
    p.status === "placeholder",
    `${p.id} is not published but is not marked placeholder either`,
  );
}

// ---------------------------------------------------------------------------
// Reachability — snapshot offline, fetch with --online
// ---------------------------------------------------------------------------

const urls = Array.from(
  new Set(collected.map((s) => s.url).filter((u): u is string => Boolean(u))),
).sort();

if (ONLINE) {
  const entries: SnapshotEntry[] = [];
  for (const url of urls) {
    let status: number | "unreachable" = "unreachable";
    try {
      const res = await fetch(url, {
        redirect: "follow",
        // Some publishers refuse a bare programmatic agent. A 403 from a bot
        // wall is not a dead link, and the reporting below distinguishes the
        // two rather than pretending either way.
        headers: { "user-agent": "Mozilla/5.0 (compatible; CQrityjob source check)" },
        signal: AbortSignal.timeout(25_000),
      });
      status = res.status;
    } catch {
      status = "unreachable";
    }
    entries.push({ url, status, checkedOn: isoToday });
    console.log(`  ${String(status).padEnd(12)} ${url}`);
  }
  const snapshot: Snapshot = {
    $comment:
      "Reachability of every external source the Career Center renders. Written by `career-center:sources -- --online`; read offline by the same script in CI. A 403 is a bot wall, not a dead link, and is recorded as itself.",
    checkedOn: isoToday,
    entries,
  };
  writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\nwrote ${path.relative(root, SNAPSHOT)} (${entries.length} URL(s))`);
}

if (!existsSync(SNAPSHOT)) {
  errors.push(
    "no source snapshot committed — run `bun run career-center:sources -- --online` and commit the result",
  );
} else {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;
  const byUrl = new Map(snapshot.entries.map((e) => [e.url, e]));
  const snapshotAge = ageDays(snapshot.checkedOn);

  expect(
    snapshotAge !== null && snapshotAge <= MAX_REVIEW_AGE_DAYS,
    `the source snapshot was taken on ${snapshot.checkedOn} and is past the freshness policy — re-run with --online`,
  );

  for (const url of urls) {
    const entry = byUrl.get(url);
    if (!entry) {
      errors.push(`${url} is rendered but is not in the source snapshot — re-run with --online`);
      continue;
    }
    if (entry.status === "unreachable") {
      errors.push(`${url} was unreachable when last checked (${entry.checkedOn})`);
      continue;
    }
    // 2xx is alive. 403 is a bot wall on a real page — iso.org refuses
    // programmatic agents — and is accepted with its status recorded, because
    // failing on it would push the catalogue away from primary sources and
    // towards whoever happens to allow scrapers. Everything else is a defect:
    // 404 is the exact failure that shipped.
    expect(
      (entry.status >= 200 && entry.status < 300) || entry.status === 403,
      `${url} answered ${entry.status} on ${entry.checkedOn} — a dead source is worse than no source`,
    );
  }

  for (const entry of snapshot.entries) {
    expect(
      urls.includes(entry.url),
      `the snapshot carries ${entry.url}, which nothing renders any more — re-run with --online`,
    );
  }

  if (!ONLINE) {
    console.log(
      `source snapshot: ${snapshot.entries.length} URL(s), read ${snapshot.checkedOn} (${Math.round(snapshotAge ?? 0)}d old)`,
    );
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`\ncareer-center:sources FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `career-center:sources OK — ${urls.length} external source(s), ${reviewDates.length} review date(s) within ${MAX_REVIEW_AGE_DAYS} days`,
);
