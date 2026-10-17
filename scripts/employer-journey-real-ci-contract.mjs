// Fixed facts of the employer journey real-services run; tested by
// scripts/employer-journey-real-ci.test.ts.
//
// Built on the talent discovery run's contract rather than beside it: the
// same CLI version, password, excluded services, CV bucket, mail allow-list,
// registry-throttle rule, runner guard and browser-count rule. What differs
// is stated here and nowhere else:
//   - its own project id and ports, so the two stacks can never address
//     each other (or run into each other on one machine);
//   - sign-up is OPEN ([auth] enable_signup = true, confirmations off),
//     because the journey's employer registers through /signup;
//   - its own people (no employer, no job: the journey makes those);
//   - its own scenario count.
import * as td from "./talent-discovery-real-ci-contract.mjs";

export const PROJECT = "cqj-ej-real-20261017";
export const API = "http://127.0.0.1:55890";
export const DB_PORT = "55891";
export const APP = "http://127.0.0.1:3160";
export const { CLI_VERSION, PASSWORD, EXCLUDED, CV_BUCKET, MAIL_ALLOWLIST, isRegistryThrottle } =
  td;
/** Scenarios in e2e/employer-journey-local.spec.ts; all must pass, none skipped. */
export const SCENARIOS = 7;

/** The synthetic people of scripts/fixtures/employer-journey-fixture.sql. */
export const PEOPLE = Object.freeze([
  {
    id: "7e000000-0000-4000-8000-0000000000b1",
    email: "ej-cand-b@local.test",
    name: "Bo Kandidat",
  },
  {
    id: "7e000000-0000-4000-8000-0000000000c1",
    email: "ej-cand-c@local.test",
    name: "Petra Privat",
  },
  {
    id: "7e000000-0000-4000-8000-0000000000f1",
    email: "ej-reviewer@local.test",
    name: "Rita Granskare",
  },
  {
    id: "7e000000-0000-4000-8000-0000000000d1",
    email: "ej-admin@local.test",
    name: "Ada Administratör",
  },
]);

/** The employer the browser registers through /signup. Never created here. */
export const NEW_OWNER_EMAIL = "ej-owner@local.test";

/** The talent run's error codes, renamed for this run. */
function rebrand(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      throw Error(String(error?.message ?? error).replace(/^TD_REAL_/, "EJ_REAL_"));
    }
  };
}

/** Disposable GitHub-hosted runner only, no inherited provider credential:
 * the talent run's guard, on this run's own variables. */
export const requireRunner = (env) =>
  rebrand(td.requireRunner)({
    ...env,
    TD_REAL_DISPOSABLE: env.EJ_REAL_DISPOSABLE,
    TD_REAL_EVIDENCE_SHA: env.EJ_REAL_EVIDENCE_SHA,
  });

export const requireBrowserCounts = rebrand(td.requireBrowserCounts);

const role = (jwt) =>
  JSON.parse(Buffer.from(String(jwt).split(".")[1] ?? "", "base64url").toString()).role;

export function requireStatus(status) {
  const db = new URL(status.DB_URL);
  if (
    status.API_URL !== API ||
    db.hostname !== "127.0.0.1" ||
    db.port !== DB_PORT ||
    db.pathname !== "/postgres"
  )
    throw Error("EJ_REAL_SERVICE_TARGET_MISMATCH");
  try {
    if (role(status.ANON_KEY) !== "anon" || role(status.SERVICE_ROLE_KEY) !== "service_role")
      throw Error("roles");
  } catch {
    throw Error("EJ_REAL_KEY_ROLES_REQUIRED");
  }
  return status;
}

/** The talent run's app environment, pointed at this stack. */
export function appEnvironment(status, source) {
  return {
    ...td.appEnvironment(status, source),
    SUPABASE_URL: API,
    VITE_SUPABASE_URL: API,
    SUPABASE_PROJECT_ID: PROJECT,
    VITE_SUPABASE_PROJECT_ID: PROJECT,
    PUBLIC_SITE_URL: APP,
  };
}

/** Each [from, to, times]: `from` must occur exactly `times` times. */
export function deriveConfig(base, replacements) {
  let out = base;
  for (const [from, to, times] of replacements) {
    const found = out.split(from).length - 1;
    if (found !== times) throw Error(`EJ_REAL_CONFIG_DERIVATION_${found}_OF_${times}`);
    out = out.split(from).join(to);
  }
  return out;
}

/** The talent run's CLI config with this run's project, ports and open
 * sign-up. Email confirmations stay off, so /signup returns a session. */
export const CONFIG = deriveConfig(td.CONFIG, [
  [`project_id = "${td.PROJECT}"`, `project_id = "${PROJECT}"`, 1],
  ["port = 55790\n", "port = 55890\n", 1],
  ["port = 55791\n", `port = ${DB_PORT}\n`, 1],
  ["shadow_port = 55789\n", "shadow_port = 55889\n", 1],
  [td.APP, APP, 2],
  [
    "enable_signup = false\nenable_anonymous_sign_ins = false",
    "enable_signup = true\nenable_anonymous_sign_ins = false",
    1,
  ],
]);
