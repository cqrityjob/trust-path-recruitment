// Release B pure and controlled-transport checks. No network, no database:
// DNS answers and HTTP responses are supplied by the test.
import assert from "node:assert/strict";
import {
  EgressError,
  checkFeedUrl,
  checkResolved,
  isPrivateAddress,
} from "../src/lib/security-work/connectors/egress";
import { FeedError, parseFeed } from "../src/lib/security-work/connectors/feed";
import { fetchFeed, resolveAll } from "../src/lib/security-work/connectors/fetch.server";
import { briefToMarkdown } from "../src/lib/security-work/impact/export";
import type { BriefDetail } from "../src/lib/security-work/impact/services";
import { coverage } from "../src/lib/security-work/knowledge/coverage";
import { assessRelevance, isMaterial } from "../src/lib/security-work/knowledge/relevance";
import { emptyProfile } from "../src/lib/security-work/operating-context/schema";

let checks = 0;
const check = async (label: string, run: () => void | Promise<void>) => {
  try {
    await run();
    checks += 1;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const HOSTS = ["feeds.example.test"];
const egressCode = (run: () => unknown) => {
  try {
    run();
    return "ok";
  } catch (error) {
    return error instanceof EgressError ? error.code : String(error);
  }
};

await check("private, loopback, link-local, metadata and mapped addresses are refused", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1",
    "not-an-ip",
  ])
    assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["93.184.216.34", "2606:4700:4700::1111", "::ffff:93.184.216.34"])
    assert.equal(isPrivateAddress(ip), false, ip);
});
await check("only https on an approved host, default port, no credentials, no IP literal", () => {
  assert.equal(
    egressCode(() => checkFeedUrl("http://feeds.example.test/rss", HOSTS)),
    "egress_scheme",
  );
  assert.equal(
    egressCode(() => checkFeedUrl("https://user:pw@feeds.example.test/rss", HOSTS)),
    "egress_credentials",
  );
  assert.equal(
    egressCode(() => checkFeedUrl("https://feeds.example.test:8443/rss", HOSTS)),
    "egress_port",
  );
  assert.equal(
    egressCode(() => checkFeedUrl("https://169.254.169.254/latest", HOSTS)),
    "egress_ip_literal",
  );
  assert.equal(
    egressCode(() => checkFeedUrl("https://[::1]/rss", HOSTS)),
    "egress_ip_literal",
  );
  assert.equal(
    egressCode(() => checkFeedUrl("https://evil.example.test/rss", HOSTS)),
    "egress_host_not_approved",
  );
  assert.equal(
    egressCode(() => checkFeedUrl("https://FEEDS.example.test/rss", HOSTS)),
    "ok",
  );
  assert.equal(
    egressCode(() => checkResolved([])),
    "egress_unresolved",
  );
  assert.equal(
    egressCode(() => checkResolved(["93.184.216.34", "10.0.0.1"])),
    "egress_private_address",
  );
});

const rss = (items: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
await check("RSS items: CDATA, entities and markup become text; unknown dates stay unknown", () => {
  const items = parseFeed(
    rss(`<item><title>Road &amp; rail &#246;verview</title><link>https://feeds.example.test/a</link><guid>a-1</guid><pubDate>Thu, 20 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Closure <b>confirmed</b></p>]]></description></item>
         <item><title>No date</title><link>http://insecure.example.test/b</link><description>Text</description></item>`),
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Road & rail överview");
  assert.equal(items[0].text, "Closure confirmed");
  assert.equal(items[0].publishedAt, "2026-11-20T10:00:00.000Z");
  assert.equal(items[1].publishedAt, null, "no date is never 'now'");
  assert.equal(items[1].url, null, "a non-https link is dropped");
});
await check("Atom entries are read", () => {
  const items = parseFeed(
    `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>urn:1</id><title>Atom title</title><link rel="alternate" href="https://feeds.example.test/x"/><updated>2026-11-19T08:00:00Z</updated><summary>Atom text</summary></entry></feed>`,
  );
  assert.deepEqual(
    items.map((i) => [i.guid, i.url, i.text]),
    [["urn:1", "https://feeds.example.test/x", "Atom text"]],
  );
});
await check("a document with a DTD or entity declaration is refused (no XXE)", () => {
  assert.throws(
    () =>
      parseFeed(
        `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&x;</title></item></channel></rss>`,
      ),
    FeedError,
  );
  assert.throws(() => parseFeed("<html><body>not a feed</body></html>"), FeedError);
});

type Reply = { status: number; headers?: Record<string, string>; body?: string };
function transport(
  replies: Record<string, Reply>,
  seen: { url: string; headers: Record<string, string> }[],
) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const reply = replies[url];
    if (!reply) throw new Error(`unexpected request to ${url}`);
    return new Response(reply.body ?? null, { status: reply.status, headers: reply.headers });
  }) as typeof fetch;
}
const publicDns = async () => ["93.184.216.34"];
const feedBody = rss(
  `<item><title>Road closed</title><guid>g1</guid><link>https://feeds.example.test/g1</link><description>E6 closed</description></item>`,
);

await check("a successful fetch sends conditional headers and hashes each item", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const result = await fetchFeed(
    {
      feedUrl: "https://feeds.example.test/rss",
      etag: '"v1"',
      lastModified: "Wed, 19 Nov 2026 00:00:00 GMT",
    },
    HOSTS,
    {
      resolve: publicDns,
      fetchImpl: transport(
        {
          "https://feeds.example.test/rss": {
            status: 200,
            headers: { etag: '"v2"' },
            body: feedBody,
          },
        },
        seen,
      ),
    },
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.etag, '"v2"');
  assert.match(result.items?.[0].contentHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(seen[0].headers["if-none-match"], '"v1"');
  assert.equal(seen[0].headers["if-modified-since"], "Wed, 19 Nov 2026 00:00:00 GMT");
});
await check("304 is not_modified; 503 is a failed run with its code", async () => {
  assert.equal(
    (
      await fetchFeed(
        { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
        HOSTS,
        {
          resolve: publicDns,
          fetchImpl: transport({ "https://feeds.example.test/rss": { status: 304 } }, []),
        },
      )
    ).status,
    "not_modified",
  );
  const failed = await fetchFeed(
    { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
    HOSTS,
    {
      resolve: publicDns,
      fetchImpl: transport({ "https://feeds.example.test/rss": { status: 503 } }, []),
    },
  );
  assert.deepEqual([failed.status, failed.errorCode], ["failed", "http_503"]);
});
await check("a host resolving to a private address is never requested", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const result = await fetchFeed(
    { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
    HOSTS,
    { resolve: async () => ["169.254.169.254"], fetchImpl: transport({}, seen) },
  );
  assert.deepEqual(
    [result.status, result.errorCode, seen.length],
    ["failed", "egress_private_address", 0],
  );
});
await check(
  "a redirect to an unapproved host or a private address is refused at the hop",
  async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const off = await fetchFeed(
      { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
      HOSTS,
      {
        resolve: publicDns,
        fetchImpl: transport(
          {
            "https://feeds.example.test/rss": {
              status: 302,
              headers: { location: "https://evil.example.test/rss" },
            },
          },
          seen,
        ),
      },
    );
    assert.deepEqual(
      [off.status, off.errorCode, seen.length],
      ["failed", "egress_host_not_approved", 1],
    );
    const toIp = await fetchFeed(
      { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
      HOSTS,
      {
        resolve: publicDns,
        fetchImpl: transport(
          {
            "https://feeds.example.test/rss": {
              status: 301,
              headers: { location: "https://169.254.169.254/" },
            },
          },
          [],
        ),
      },
    );
    assert.equal(toIp.errorCode, "egress_ip_literal");
    let calls = 0;
    const loop = await fetchFeed(
      { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
      HOSTS,
      {
        resolve: async (host) =>
          calls++ > 0 && host === "feeds.example.test" ? ["10.0.0.5"] : ["93.184.216.34"],
        fetchImpl: transport(
          {
            "https://feeds.example.test/rss": { status: 302, headers: { location: "/next" } },
            "https://feeds.example.test/next": { status: 200, body: feedBody },
          },
          [],
        ),
      },
    );
    assert.equal(
      loop.errorCode,
      "egress_private_address",
      "each hop is resolved and checked again",
    );
  },
);
await check("an oversized body and a stalled response fail as coverage facts", async () => {
  const big = await fetchFeed(
    { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
    HOSTS,
    {
      resolve: publicDns,
      fetchImpl: transport(
        {
          "https://feeds.example.test/rss": {
            status: 200,
            body: rss("x".repeat(2 * 1024 * 1024 + 10)),
          },
        },
        [],
      ),
    },
  );
  assert.equal(big.errorCode, "feed_too_large");
  const slow = await fetchFeed(
    { feedUrl: "https://feeds.example.test/rss", etag: null, lastModified: null },
    HOSTS,
    {
      resolve: publicDns,
      timeoutMs: 50,
      fetchImpl: ((_url: string, init?: RequestInit) =>
        new Promise((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        )) as typeof fetch,
    },
  );
  assert.equal(slow.errorCode, "timeout");
});

await check("relevance is explainable, honours exclusions and a movable threshold", () => {
  const profile = {
    ...emptyProfile(),
    criticalServices: ["Terminal Gothenburg"],
    suppliers: ["NordFreight"],
    countries: ["SE"],
    monitoring: {
      topics: ["closure"],
      places: ["E6"],
      exclusions: ["football"],
      coverageExpectation: "",
    },
  };
  const relevant = assessRelevance(
    { title: "E6 closure near Terminal Gothenburg", text: "Sweden road authority" },
    { profile },
  );
  assert.deepEqual(relevant.matches.map((m) => m.kind).sort(), [
    "country",
    "critical_service",
    "location",
    "topic",
  ]);
  assert.equal(relevant.score, 7);
  assert.equal(isMaterial(relevant), true);
  assert.equal(isMaterial(relevant, 8), false, "the person moves the threshold");
  const excluded = assessRelevance({ title: "Football crowd on the E6", text: "" }, { profile });
  assert.deepEqual([excluded.score, excluded.excludedBy], [0, "football"]);
  assert.equal(
    assessRelevance({ title: "Anything", text: "" }, { profile: null }).score,
    0,
    "no profile, no invented relevance",
  );
});
await check("coverage says what is missing instead of 'nothing happened'", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const base = {
    id: "s",
    name: "Feed",
    source_type: "official_feed",
    active: true,
    poll_target_minutes: 60,
    last_failure_at: null,
    last_failure: null,
  };
  assert.equal(coverage([], now).state, "no_connected_source");
  assert.equal(
    coverage(
      [{ ...base, source_type: "manual", last_checked_at: null, last_success_at: null }],
      now,
    ).state,
    "no_connected_source",
    "manual sources are not monitoring",
  );
  assert.equal(
    coverage([{ ...base, last_checked_at: null, last_success_at: null }], now).state,
    "never_checked",
  );
  assert.equal(
    coverage(
      [
        {
          ...base,
          last_checked_at: "2026-11-21T11:30:00Z",
          last_success_at: "2026-11-21T11:30:00Z",
        },
      ],
      now,
    ).state,
    "current",
  );
  assert.equal(
    coverage(
      [
        {
          ...base,
          last_checked_at: "2026-11-21T08:00:00Z",
          last_success_at: "2026-11-21T08:00:00Z",
        },
      ],
      now,
    ).state,
    "stale",
  );
  const failing = coverage(
    [
      {
        ...base,
        last_checked_at: "2026-11-21T11:50:00Z",
        last_success_at: "2026-11-21T11:00:00Z",
        last_failure_at: "2026-11-21T11:50:00Z",
        last_failure: "http_503",
      },
    ],
    now,
  );
  assert.deepEqual(
    [failing.state, failing.sources[0].failure, failing.sources[0].minutesSinceSuccess],
    ["failing", "http_503", 60],
  );
});

await check(
  "an exported draft says it is unreviewed; an approved one carries its follow-up and sources",
  () => {
    const brief = {
      title: "E6 closure",
      status: "draft",
      version: 2,
      operating_profile_version: 3,
      approved_at: null,
      what_changed: "Closed near the terminal.",
      known: "",
      why_it_matters: "Departures depend on it.",
      uncertain: "Duration.",
      proposed_actions: [{ title: "Re-route" }],
      evidence: [
        {
          sourceItemId: "i1",
          publisher: "Road Authority",
          title: "E6 closed",
          url: "https://feeds.example.test/g1",
          publishedAt: "2026-11-20T10:00:00Z",
          retrievedAt: "2026-11-21T08:00:00Z",
        },
      ],
    } as unknown as BriefDetail["brief"];
    const draft = briefToMarkdown(
      { brief, followUp: { risk: null, actions: [] }, flags: [] },
      "sv",
    );
    assert.match(draft, /Utkast – inte granskat/);
    assert.match(draft, /verksamhetsprofil.*v3/i);
    assert.match(
      draft,
      /1\. Road Authority: E6 closed <https:\/\/feeds\.example\.test\/g1> \(publicerad 2026-11-20, hämtad 2026-11-21\)/,
    );
    assert.doesNotMatch(draft, /Uppföljning/);
    const approved = briefToMarkdown(
      {
        brief: { ...brief, status: "approved", approved_at: "2026-11-21T09:00:00Z" },
        followUp: {
          risk: { id: "r", title: "Transport disruption", status: "proposed" },
          actions: [
            {
              id: "a",
              title: "Re-route",
              status: "open",
              due_date: "2026-12-01",
              priority: "high",
            },
          ],
        },
        flags: [{ status: "open" } as BriefDetail["flags"][number]],
      },
      "en",
    );
    assert.match(approved, /Status: Approved/);
    assert.match(approved, /Approved: 2026-11-21/);
    assert.match(approved, /New information since approval: 1/);
    assert.match(approved, /Risk: Transport disruption \(proposed\)/);
    assert.match(approved, /Action: Re-route \(open, due 2026-12-01\)/);
    assert.match(approved, /covers only the sources that were connected/);
  },
);

await check(
  "DNS falls back to the fixed DoH resolver only when lookup is unavailable",
  async () => {
    const asked: string[] = [];
    const doh = (async (url: string) => {
      asked.push(url);
      const type = new URL(url).searchParams.get("type");
      return Response.json(
        type === "A"
          ? {
              Status: 0,
              Answer: [
                { type: 1, data: "93.184.216.34" },
                { type: 5, data: "alias.example.test." },
              ],
            }
          : { Status: 0, Answer: [{ type: 28, data: "2606:2800:220:1::248" }] },
      );
    }) as unknown as typeof fetch;
    const unsupported = (async () => {
      throw Object.assign(new Error("not implemented"), { code: "ENOTIMP" });
    }) as never;
    assert.deepEqual(
      await resolveAll("feeds.example.test", { lookupImpl: unsupported, fetchImpl: doh }),
      ["93.184.216.34", "2606:2800:220:1::248"],
    );
    assert.ok(
      asked.every((url) =>
        url.startsWith("https://cloudflare-dns.com/dns-query?name=feeds.example.test&type="),
      ),
    );
    // A real DNS failure is not retried elsewhere.
    asked.length = 0;
    const missing = (async () => {
      throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    }) as never;
    await assert.rejects(
      resolveAll("nowhere.example.test", { lookupImpl: missing, fetchImpl: doh }),
    );
    assert.equal(asked.length, 0);
    // NXDOMAIN over DoH is no address, which the egress rule refuses; a private answer is refused too.
    const nx = (async () => Response.json({ Status: 3 })) as unknown as typeof fetch;
    const none = await resolveAll("nowhere.example.test", {
      lookupImpl: unsupported,
      fetchImpl: nx,
    });
    assert.equal(
      egressCode(() => checkResolved(none)),
      "egress_unresolved",
    );
    const internal = (async () =>
      Response.json({
        Status: 0,
        Answer: [{ type: 1, data: "10.0.0.5" }],
      })) as unknown as typeof fetch;
    const priv = await resolveAll("feeds.example.test", {
      lookupImpl: unsupported,
      fetchImpl: internal,
    });
    assert.equal(
      egressCode(() => checkResolved(priv)),
      "egress_private_address",
    );
  },
);

console.log(`Security Work Release B: ${checks} checks passed; no network or database.`);
