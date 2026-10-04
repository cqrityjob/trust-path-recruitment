// Launch (owner, 2026-10-04): version 1 does not measure how people use the
// product. This proves the optional first-party funnel is off, in the browser
// and on the server, and that nothing else in the product has taken its place.
//
// Run via `bun run funnel-measurement:check`.
// Planted controls: `bun run negative-controls:funnel-measurement`.
//
// What is held:
//
//   BROWSER   The India helper is called for every event it knows, with a fake
//             window whose sessionStorage and fetch record everything. It must
//             touch neither: no request and no "once per session" marker.
//   SERVER    The funnel write is handed a recording database client. It must
//             return without calling the database.
//   SOURCE    Every file that calls the funnel server function checks the
//             switch; the marker key and the database call each exist in one
//             place only; and the set of browser-storage keys the product uses
//             is exactly the reviewed one, all of it login, sharing, language,
//             return-to and unfinished-work state, so a new statistics marker
//             cannot arrive unnoticed. No third-party analytics library, script
//             host or beacon exists.
//
// Not held here: the privacy policy's wording about measurement, which is
// launch-legal:check's, and the 339 rows already stored, which are an owner
// decision (docs/release/2026-10-04-funnel-measurement-off.md).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { FUNNEL_MEASUREMENT_ENABLED } from "../src/lib/analytics/funnel-measurement";
import { INDIA_FUNNEL_EVENTS, trackFunnelOnce } from "../src/lib/india-entry/analytics";
import { recordFunnelEvent } from "../src/lib/career-discovery/v31-feedback.functions";

const root = process.cwd();
const fails: string[] = [];
let checks = 0;
function ck(label: string, cond: boolean, detail = ""): void {
  checks += 1;
  if (cond) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    fails.push(label);
  }
}

console.log("funnel-measurement-check\n");

/* ------------------------------------------------------------------ */
/* 1 · The switch                                                      */
/* ------------------------------------------------------------------ */

console.log("1 · the switch");
ck("measurement is a constant, and it is off", FUNNEL_MEASUREMENT_ENABLED === false);

/* ------------------------------------------------------------------ */
/* 2 · Browser: no request, no sessionStorage marker                   */
/* ------------------------------------------------------------------ */

console.log("\n2 · the browser");
{
  const touched: string[] = [];
  const storage = {
    getItem: (k: string) => (touched.push(`get ${k}`), null),
    setItem: (k: string) => void touched.push(`set ${k}`),
    removeItem: (k: string) => void touched.push(`remove ${k}`),
    key: () => (touched.push("key"), null),
    clear: () => void touched.push("clear"),
    get length() {
      touched.push("length");
      return 0;
    },
  };
  const requests: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requests.push(String(input));
    throw new Error("recorder: no request may leave");
  }) as typeof fetch;
  const g = globalThis as unknown as { window?: unknown };
  const hadWindow = "window" in g;
  g.window = { sessionStorage: storage, localStorage: storage };
  try {
    for (const event of INDIA_FUNNEL_EVENTS) trackFunnelOnce(event);
    // The helper is fire-and-forget; give anything it started a turn to run.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    globalThis.fetch = realFetch;
    if (!hadWindow) delete g.window;
  }
  ck(
    `all ${INDIA_FUNNEL_EVENTS.length} India events: sessionStorage is not touched`,
    touched.length === 0,
    touched.join(", "),
  );
  ck(
    `all ${INDIA_FUNNEL_EVENTS.length} India events: no request is made`,
    requests.length === 0,
    requests.join(", "),
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Server: the database is not called                              */
/* ------------------------------------------------------------------ */

console.log("\n3 · the server");
{
  const calls: string[] = [];
  const client = {
    rpc(fn: string) {
      calls.push(fn);
      return Promise.resolve({ error: null });
    },
  };
  const result = await recordFunnelEvent(client, {
    eventName: "assessment_started",
    detail: { surface: "check" },
  });
  ck("a stale browser's event is answered with recorded: false", result.recorded === false);
  ck("and the database is not called", calls.length === 0, calls.join(", "));
}

/* ------------------------------------------------------------------ */
/* 4 · Source                                                          */
/* ------------------------------------------------------------------ */

console.log("\n4 · source");
{
  const files = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(path.join(root, dir))) {
      const rel = path.join(dir, entry);
      if (statSync(path.join(root, rel)).isDirectory()) {
        if (entry === "node_modules") continue;
        out.push(...files(rel));
      } else if (/\.(ts|tsx|html)$/.test(entry)) out.push(rel);
    }
    return out;
  };
  const src = files("src");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
  const strip = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const DEFINITION = "src/lib/career-discovery/v31-feedback.functions.ts";

  // Every caller of the funnel server function checks the switch first.
  const callers = src.filter((f) => f !== DEFINITION && /trackV31FunnelEvent/.test(strip(read(f))));
  ck(
    "the files that call the funnel server function are the known four",
    JSON.stringify([...callers].sort()) ===
      JSON.stringify(
        [
          "src/components/career-discovery/v31/PublicAssessmentFlow.tsx",
          "src/lib/career-center/analytics.ts",
          "src/lib/india-entry/analytics.ts",
          "src/lib/professional-identity/next-action-analytics.ts",
        ].sort(),
      ),
    callers.join(", "),
  );
  for (const file of callers) {
    const text = strip(read(file));
    const first = text.indexOf("if (!FUNNEL_MEASUREMENT_ENABLED");
    const send = text.search(/void (?:trackEventFn|track|trackV31FunnelEvent)\(/);
    ck(
      `${file}: checks the switch before it sends`,
      first > -1 &&
        /import \{ FUNNEL_MEASUREMENT_ENABLED \}/.test(text) &&
        (send === -1 || first < send),
    );
  }

  // The marker is written by one helper, behind the switch.
  const markerFiles = src.filter((f) => /cqj:funnel/.test(read(f)));
  ck(
    "the statistics marker key exists in one file only",
    JSON.stringify(markerFiles) === JSON.stringify(["src/lib/india-entry/analytics.ts"]),
    markerFiles.join(", "),
  );
  const india = strip(read("src/lib/india-entry/analytics.ts"));
  ck(
    "and that file returns before it reads or writes sessionStorage",
    india.indexOf("if (!FUNNEL_MEASUREMENT_ENABLED) return;") > -1 &&
      india.indexOf("if (!FUNNEL_MEASUREMENT_ENABLED) return;") < india.indexOf("sessionStorage"),
  );

  // The write itself.
  // (The generated database types name every function; they call nothing.)
  const rpcFiles = [...src, ...files("supabase/functions")]
    .filter((f) => f !== "src/integrations/supabase/types.ts")
    .filter((f) => /cd_record_funnel_event/.test(strip(read(f))));
  ck(
    "the funnel's database call exists in one place, and the server function checks the switch first",
    JSON.stringify(rpcFiles) === JSON.stringify([DEFINITION]) &&
      strip(read(DEFINITION)).indexOf(
        "if (!FUNNEL_MEASUREMENT_ENABLED) return { recorded: false };",
      ) > -1 &&
      strip(read(DEFINITION)).indexOf(
        "if (!FUNNEL_MEASUREMENT_ENABLED) return { recorded: false };",
      ) < strip(read(DEFINITION)).indexOf('client.rpc("cd_record_funnel_event"'),
    rpcFiles.join(", "),
  );

  // Browser storage: the reviewed set of keys, nothing else.
  //
  // Each is login, sharing, language, return-to or unfinished-work state:
  //   cqrityjob.lang                         the language the person chose
  //   cqrityjob.lastEmployerSlug             which employer's page to return to
  //   cqrityjob.career-center.return         where to return in the Career Center
  //   cqj:auth:oauth-return:v1, :oauth-org-intent:v1, :pending-confirmation:v1
  //                                          the sign-in round trip
  //   cq.termsAccepted                       the terms box ticked before signup
  //   cqj:discovery:v31:public-buffer:v1, :pending-claim:v1, :claimed-result:v1,
  //   :career-context:v1, cqj:career-discovery:v31:claim-session:
  //                                          an unfinished assessment and its result
  //   cqj.recruitment.list., cqj.recruitment.list-last
  //                                          the employer's list position
  //   cqj.job-draft.new                      an unsaved job ad
  //   cqj:sp:proto:v1                        the Passport prototype's local state
  //   cqj:funnel:once:                       the statistics marker (off; see above)
  const REVIEWED_KEYS = [
    "cq.termsAccepted",
    "cqj.job-draft.new",
    "cqj.recruitment.list-last",
    "cqj.recruitment.list.",
    "cqj:auth:oauth-org-intent:v1",
    "cqj:auth:oauth-return:v1",
    "cqj:auth:pending-confirmation:v1",
    "cqj:career-discovery:v31:claim-session:",
    "cqj:discovery:v31:career-context:v1",
    "cqj:discovery:v31:claimed-result:v1",
    "cqj:discovery:v31:pending-claim:v1",
    "cqj:discovery:v31:public-buffer:v1",
    "cqj:funnel:once:",
    "cqj:sp:proto:v1",
    "cqrityjob.career-center.return",
    "cqrityjob.lang",
    "cqrityjob.lastEmployerSlug",
  ];
  const found = new Set<string>();
  for (const file of src) {
    for (const m of strip(read(file)).matchAll(
      /["'`]((?:cqj|cq|cqrityjob)[.:][A-Za-z0-9_.:-]*)["'`]/g,
    )) {
      if (m[1] !== "cqrityjob.com") found.add(m[1]);
    }
  }
  const unreviewed = [...found].filter((k) => !REVIEWED_KEYS.includes(k));
  ck(
    "every browser-storage key the product names is a reviewed one",
    unreviewed.length === 0,
    `new: ${unreviewed.join(", ")}`,
  );
  const forbidden = [...found].filter((k) =>
    /funnel|analytic|track|metric|impression|visit|experiment|utm|stat(?:s|istic)|beacon/i.test(k),
  );
  ck(
    "no key is a statistics marker, except the one that is switched off",
    forbidden.every((k) => k === "cqj:funnel:once:"),
    forbidden.join(", "),
  );

  // No analytics library, host or beacon.
  const HOSTS = [
    "googletagmanager.com",
    "google-analytics.com",
    "plausible.io",
    "posthog.com",
    "segment.com",
    "mixpanel.com",
    "hotjar.com",
    "clarity.ms",
    "matomo",
    "fullstory.com",
    "amplitude.com",
    "sentry.io",
    "vercel-insights",
    "facebook.net",
    "doubleclick.net",
    "linkedin.com/px",
    "hs-scripts.com",
    "intercom.io",
    "heap-analytics",
  ];
  const hostHits = [...src, "index.html"].filter((f) => {
    try {
      return HOSTS.some((h) => read(f).includes(h));
    } catch {
      return false;
    }
  });
  ck(
    "no analytics or tracking host is named in the application",
    hostHits.length === 0,
    hostHits.join(", "),
  );
  const beacons = src.filter((f) => /sendBeacon\(/.test(strip(read(f))));
  ck("no beacon is sent", beacons.length === 0, beacons.join(", "));
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const libs = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) =>
    /analytics|posthog|mixpanel|segment|amplitude|hotjar|gtag|react-ga|@sentry|plausible|matomo|clarity|fullstory|rudder|heap/i.test(
      d,
    ),
  );
  ck("no analytics library is a dependency", libs.length === 0, libs.join(", "));
}

console.log("");
if (fails.length) {
  console.error(`funnel-measurement: ${fails.length} failure(s) of ${checks} checks`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`funnel-measurement: all ${checks} checks passed`);
