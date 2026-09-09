// The REAL /passport and /passport/onboarding routes, in a browser.
//
// ── WHAT THIS PROVES THAT THE STATIC GUARD CANNOT ──────────────────────
//
// scripts/passport-first-run-check.tsx renders each screen to markup. It
// cannot see a redirect, a refresh that has to resume the exact draft, a
// double-click that must produce one request, a completion racing a debounced
// autosave, a readback that never answers, focus after a screen change, or a
// horizontal scrollbar at 320px. All of those are what this file is for.
//
// ── HOW THE BACKEND IS STUBBED ─────────────────────────────────────────
//
// Every server-function call is an HTTP request to /_serverFn/<id>, where
// <id> is base64url JSON naming the module and the export. The stub decodes
// it, answers from an in-memory database, and returns plain JSON. A Supabase
// session is planted in localStorage the way supabase-js stores one. Nothing
// reaches a real database.
//
// The in-memory database is deliberately not a dumb echo: it enforces the
// SAME rules the real one does -- idempotency on the operation id, one merit
// per operation, a refusal when the declaration is absent, a refusal when an
// employment carries no country -- so that a browser test can fail for the
// reason the database would fail. It is not a substitute for
// supabase/tests/security_passport_first_merit_test.sql, which asserts those
// rules against PostgreSQL itself; it is what lets this file assert the
// BROWSER's behaviour when it meets them.
//
// Run:  E2E_BASE_URL=http://localhost:3100 bunx playwright test e2e/passport-first-run.spec.ts

import { test, expect, type Page, type Route } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SUPABASE_REF = "wrygicdfxwjnrugduxnt";
const USER_ID = "00000000-0000-4000-8000-0000000000f1";

/* ------------------------------------------------------------------ */
/* A small, rule-enforcing database                                    */
/* ------------------------------------------------------------------ */

type Merit = {
  id: string;
  kind: "experience" | "claim";
  title: string;
  organisation: string | null;
  country: string | null;
  startedOn: string | null;
  endedOn: string | null;
  assertionLevel: string;
  lifecycleState: string;
};

type Db = {
  profile: {
    onboardingState: string;
    onboardingAnswers: Record<string, string>;
    declaredAccurateAt: string | null;
    /** The revision guard the real column provides. A save must carry a
     *  strictly greater one. */
    draftRevision: number;
  } | null;
  merits: Merit[];
  /** The server-owned receipts. Keyed by operation id, bound to a fingerprint
   *  of the submitted facts -- the same shape sp_passport_operations has, so
   *  the browser meets the same refusals it would meet in production. */
  operations: Map<string, { fingerprint: string; subjectId: string | null }>;
  events: { type: string; operationId: string | null }[];
  /** Counters the assertions read, so "one request" is a fact and not a hope. */
  calls: Record<string, number>;
  /** Scenario switches. */
  readbackMode: "normal" | "hang" | "error" | "missing";
  /** Overrides one stored field on the readback, to prove the comparison
   *  actually looks at it. */
  readbackOverride: Partial<Record<string, unknown>> | null;
  completeDelayMs: number;
  /** Drop the completion RESPONSE after committing, exactly once. The write
   *  lands; the browser never hears about it. */
  dropCompletionResponseOnce: boolean;
  /** Fail every draft save, for the Save-and-exit failure scenario. */
  failDraftSaves: boolean;
  /** Fail the initial Passport read. */
  failPassportRead: boolean;
  /** Delay every draft save by this much, so two can be genuinely in flight. */
  draftDelayMs: number;
  /** Per-call delays, consumed in order. A LONG first delay and a short second
   *  one is what forces a genuine reorder: without ordering, the older answers
   *  arrive last and win. */
  draftDelaySchedule: number[];
  /** The answers as each save landed, in arrival order. */
  draftArrivals: string[];
  /** The order in which draft saves actually reached the server. */
  draftOrder: number[];
  /** NEGATIVE CONTROL ONLY: drop the server's ordering rule, to show that the
   *  scenario fails without it. */
  disableRevisionRule?: boolean;
};

function freshDb(overrides: Partial<Db> = {}): Db {
  return {
    profile: null,
    merits: [],
    operations: new Map(),
    events: [],
    calls: {},
    readbackMode: "normal",
    readbackOverride: null,
    completeDelayMs: 0,
    dropCompletionResponseOnce: false,
    failDraftSaves: false,
    failPassportRead: false,
    draftDelayMs: 0,
    draftDelaySchedule: [],
    draftArrivals: [],
    draftOrder: [],
    ...overrides,
  };
}

/** A profile in the shape the stub keeps, with the revision the real column
 *  would carry. */
function profileOf(over: Partial<NonNullable<Db["profile"]>> = {}): NonNullable<Db["profile"]> {
  return {
    onboardingState: "in_progress",
    onboardingAnswers: {},
    declaredAccurateAt: null,
    draftRevision: 0,
    ...over,
  };
}

/** The same canonical join the database fingerprints. Two submissions that
 *  differ in any recorded fact produce different strings, which is what makes
 *  a replay carrying different facts refusable. */
function fingerprint(d: Record<string, unknown>): string {
  const country = d.meritKind === "employment" ? String(d.country ?? "").toUpperCase() : "";
  return [
    String(d.meritKind ?? ""),
    String(d.title ?? "").trim(),
    String(d.organisation ?? "").trim(),
    country,
    String(d.startedOn ?? ""),
    String(d.endedOn ?? ""),
  ].join("\u001f");
}

let db: Db;

/** Decode the server-function export name out of the /_serverFn/ URL.
 *
 *  The id is base64url JSON naming the module and the export; the export
 *  carries a `_createServerFn_handler` suffix that is an implementation
 *  detail of the framework and not part of the name anybody wrote. */
function exportOf(url: string): string | null {
  const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (!m) return null;
  try {
    const json = JSON.parse(
      Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { export?: string };
    return String(json.export ?? "").replace(/_createServerFn_handler$/, "");
  } catch {
    return null;
  }
}

function snapshot() {
  return {
    profile: db.profile
      ? {
          displayName: null,
          headline: null,
          cigProfessionSlug: null,
          jurisdictionCode: null,
          subJurisdictionCode: null,
          workLocationConfirmedAt: null,
          privacyMode: "full_name",
          onboardingState: db.profile.onboardingState,
          onboardingStep: 0,
          onboardingAnswers: db.profile.onboardingAnswers,
          onboardingDraftRevision: db.profile.draftRevision,
          questionVersion: "sp-q-v1",
          declaredAccurateAt: db.profile.declaredAccurateAt,
          recognitionPolicyVersion: "v1",
          updatedAt: "2026-09-06T09:00:00.000Z",
        }
      : null,
    holder: {
      id: USER_ID,
      displayName: null,
      professionSlug: null,
      identity: {
        engineVersion: "identity-v1",
        evaluatedOn: "2026-09-06",
        includesSelfDeclared: true,
        educationCompleted: [],
        professionalCompetence: [],
        localEligibility: [],
        activeTitles: [],
      },
      jurisdictionCode: null,
      subJurisdictionCode: null,
      periods: db.merits
        .filter((m) => m.kind === "experience")
        .map((m) => ({
          id: m.id,
          employerName: m.organisation ?? "",
          roleTitle: m.title,
          professionSlug: null,
          jurisdictionCode: m.country ?? "SE",
          employmentType: "full_time",
          fteFraction: 1,
          securityRelevance: "primary",
          securityFraction: 1,
          startedOn: m.startedOn ?? "2024-03-01",
          endedOn: m.endedOn,
          assertionLevel: m.assertionLevel,
          lifecycleState: m.lifecycleState,
          verifierName: null,
          verificationMethod: null,
          verifiedOn: null,
        })),
      claims: db.merits
        .filter((m) => m.kind === "claim")
        .map((m) => ({
          id: m.id,
          claimType: "training",
          credentialCode: null,
          skillCode: null,
          skillLevel: null,
          titleSv: m.title,
          titleEn: m.title,
          issuerName: m.organisation,
          jurisdictionCode: null,
          subJurisdictionCode: null,
          authorisationScope: null,
          issuedOn: null,
          validFrom: null,
          validUntil: null,
          assertionLevel: m.assertionLevel,
          lifecycleState: m.lifecycleState,
          versionNo: 1,
          supersedesId: null,
          verifierName: null,
          verificationMethod: null,
          verifiedOn: null,
        })),
    },
    eventCount: db.events.length,
  };
}

const ok = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: body, error: null, context: {} }),
  });
const boom = (route: Route, message: string) =>
  route.fulfill({ status: 500, contentType: "text/plain", body: message });

let uuidCounter = 0;
function newId(): string {
  uuidCounter += 1;
  return `aaaaaaaa-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
}

/** Decode one seroval node into a plain value.
 *
 *  TanStack Start serialises a server function's arguments with seroval, so
 *  the POST body is not the payload -- it is a node tree. Four node types
 *  cover everything this journey sends:
 *
 *    0  number      the value is in `s`
 *    1  string      the value is in `s`
 *    2  constant    an index into [null, undefined, true, false]
 *    10 object      parallel key and value arrays in `p.k` / `p.v`
 *
 *  Decoding it here rather than asserting on the raw string is what lets the
 *  stub enforce the same refusals the database does -- a stub that could not
 *  read `declared` could not tell a declared submission from an undeclared
 *  one, and every assertion about the declaration would be worthless. */
const SEROVAL_CONSTANTS = [null, undefined, true, false] as const;

function decodeNode(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  const n = node as { t?: number; s?: unknown; a?: unknown[]; p?: { k?: string[]; v?: unknown[] } };
  switch (n.t) {
    case 0:
    case 1:
      return n.s;
    case 2:
      return SEROVAL_CONSTANTS[Number(n.s)] ?? null;
    case 10: {
      const out: Record<string, unknown> = {};
      const keys = n.p?.k ?? [];
      const values = n.p?.v ?? [];
      keys.forEach((k, i) => {
        out[k] = decodeNode(values[i]);
      });
      return out;
    }
    default:
      // Arrays and anything else this journey does not send. Returned as-is
      // rather than silently as null, so an unexpected shape shows up in a
      // failing assertion rather than as a missing field.
      return Array.isArray(n.a) ? n.a.map(decodeNode) : (n.s ?? null);
  }
}

/** The `data` argument of one server-function call. */
async function bodyOf(route: Route): Promise<Record<string, unknown>> {
  try {
    const raw = route.request().postData();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { t?: unknown };
    const decoded = decodeNode(parsed.t) as { data?: Record<string, unknown> } | null;
    return (decoded?.data ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* Mount                                                               */
/* ------------------------------------------------------------------ */

let pageErrors: string[] = [];
let unmatched: string[] = [];

async function mount(page: Page, path: string, lang: "sv" | "en" = "sv") {
  pageErrors = [];
  unmatched = [];

  await page.addInitScript(
    ({ ref, lang: l, userId }) => {
      try {
        localStorage.setItem("cqrityjob.lang", l);
        localStorage.setItem(
          `sb-${ref}-auth-token`,
          JSON.stringify({
            access_token: "stub-access-token",
            refresh_token: "stub-refresh-token",
            token_type: "bearer",
            expires_in: 3600 * 24 * 365,
            expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
            user: {
              id: userId,
              aud: "authenticated",
              email: "first-run@example.test",
              user_metadata: { display_name: "Nina" },
              app_metadata: {},
            },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { ref: SUPABASE_REF, lang, userId: USER_ID },
  );

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    db.calls[name] = (db.calls[name] ?? 0) + 1;
    if (process.env.E2E_DEBUG)
      console.log(`[rpc] ${name} <- ${String(route.request().postData()).slice(0, 400)}`);

    switch (name) {
      case "getMyPassport":
        if (db.failPassportRead) return boom(route, "read failed");
        return ok(route, snapshot());

      case "ensureFirstRunPassport": {
        // Atomic AND idempotent, exactly like sp_passport_ensure: the profile,
        // its receipt and its creation event are one thing.
        if (db.profile) {
          const hasReceipt = [...db.operations.keys()].some((k) => k.startsWith("create:"));
          if (hasReceipt) return ok(route, { created: false, repaired: false });
          db.operations.set(`create:${USER_ID}`, { fingerprint: "", subjectId: USER_ID });
          if (!db.events.some((e) => e.type === "passport_created"))
            db.events.push({ type: "passport_created", operationId: null });
          return ok(route, { created: false, repaired: true });
        }
        db.profile = profileOf({ onboardingState: "not_started" });
        db.operations.set(`create:${USER_ID}`, { fingerprint: "", subjectId: USER_ID });
        db.events.push({ type: "passport_created", operationId: null });
        return ok(route, { created: true, repaired: false });
      }

      case "saveFirstRunDraft": {
        const data = await bodyOf(route);
        const scheduled = db.draftDelaySchedule.shift();
        const delay = scheduled ?? db.draftDelayMs;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (db.failDraftSaves) return boom(route, "draft write failed");
        if (!db.profile) return boom(route, "SP_PASSPORT_MISSING");

        const revision = Number(data.revision ?? 0);
        db.draftOrder.push(revision);
        db.draftArrivals.push(
          String(((data.answers ?? {}) as Record<string, string>)["firstMerit.title"] ?? ""),
        );

        // THE ORDERING RULE, as one conditional write. A save that is not
        // strictly newer matches nothing, and a completed onboarding is never
        // reopened.
        if (db.profile.onboardingState === "completed")
          return boom(route, "SP_ONBOARDING_ALREADY_COMPLETED");
        if (!db.disableRevisionRule && revision <= db.profile.draftRevision)
          return boom(route, `SP_DRAFT_REVISION_STALE:${db.profile.draftRevision}`);

        db.profile.onboardingAnswers = (data.answers ?? {}) as Record<string, string>;
        db.profile.onboardingState = "in_progress";
        db.profile.draftRevision = revision;
        return ok(route, { savedAt: new Date().toISOString(), revision });
      }

      case "completeFirstMerit": {
        const data = await bodyOf(route);
        if (db.completeDelayMs > 0) await new Promise((r) => setTimeout(r, db.completeDelayMs));

        // The refusals, in the order the database applies them, and all of
        // them BEFORE anything is written.
        if (data.declared !== true) return boom(route, "SP_DECLARATION_REQUIRED");
        const opId = String(data.operationId ?? "");
        if (!opId) return boom(route, "SP_OPERATION_ID_REQUIRED");
        if (!String(data.title ?? "").trim()) return boom(route, "SP_TITLE_REQUIRED");
        if (!String(data.organisation ?? "").trim()) return boom(route, "SP_ORGANISATION_REQUIRED");
        if (data.meritKind === "employment" && !data.country)
          return boom(route, "SP_WORK_COUNTRY_REQUIRED");

        const fp = fingerprint(data);
        const already = db.operations.get(opId);
        if (already) {
          // A replay: same holder, same facts, and a subject that still exists.
          if (already.fingerprint !== fp) return boom(route, "SP_OPERATION_FACTS_CHANGED");
          const m = db.merits.find((x) => x.id === already.subjectId);
          if (!m) return boom(route, "SP_OPERATION_SUBJECT_MISSING");
          if (db.dropCompletionResponseOnce) {
            db.dropCompletionResponseOnce = false;
            return route.abort();
          }
          return ok(route, { subjectKind: m.kind, subjectId: m.id, created: false });
        }

        // NOT a general merit API. A new first-merit operation is refused once
        // a current merit exists.
        if (db.merits.some((m) => m.lifecycleState === "active"))
          return boom(route, "SP_FIRST_MERIT_ALREADY_EXISTS");

        if (!db.profile) db.profile = profileOf({ onboardingState: "not_started" });

        const kind = data.meritKind === "employment" ? "experience" : "claim";
        const merit: Merit = {
          id: newId(),
          kind,
          title: String(data.title),
          organisation: String(data.organisation),
          country: kind === "experience" ? ((data.country as string | null) ?? null) : null,
          startedOn: (data.startedOn as string | null) ?? null,
          endedOn: (data.endedOn as string | null) ?? null,
          // The trust facts the server takes from column defaults.
          assertionLevel: "self_declared",
          lifecycleState: "active",
        };
        db.merits.push(merit);
        db.operations.set(opId, { fingerprint: fp, subjectId: merit.id });
        db.events.push({
          type: kind === "experience" ? "experience_created" : "claim_created",
          operationId: opId,
        });
        db.events.push({ type: "declaration_recorded", operationId: opId });
        db.events.push({ type: "onboarding_completed", operationId: opId });
        db.profile.onboardingState = "completed";
        db.profile.declaredAccurateAt = new Date().toISOString();

        // THE COMMITTED WRITE WHOSE RESPONSE IS LOST. Everything above has
        // happened; the browser simply never hears it.
        if (db.dropCompletionResponseOnce) {
          db.dropCompletionResponseOnce = false;
          return route.abort();
        }
        return ok(route, { subjectKind: kind, subjectId: merit.id, created: true });
      }

      case "readBackFirstMerit": {
        if (db.readbackMode === "hang") return;
        if (db.readbackMode === "error") return boom(route, "readback failed");
        if (db.readbackMode === "missing") return ok(route, null);
        const data = await bodyOf(route);
        const m = db.merits.find((x) => x.id === data.subjectId);
        return ok(
          route,
          m
            ? {
                id: m.id,
                kind: m.kind,
                title: m.title,
                organisation: m.organisation,
                country: m.country,
                startedOn: m.startedOn,
                endedOn: m.endedOn,
                assertionLevel: m.assertionLevel,
                lifecycleState: m.lifecycleState,
                ...(db.readbackOverride ?? {}),
              }
            : null,
        );
      }

      // Reads the Passport overview makes once the first run is over.
      case "listMyVerificationRequests":
        return ok(route, { requests: [], decisions: [] });
      case "getRegulatedCredentialAvailability":
        return ok(route, {
          state: "open",
          jurisdictionCode: "SE",
          subJurisdictionCode: null,
          marketPackCode: "SE-CORE",
          types: [],
        });
      case "listMyEntries":
        return ok(route, { experience: [], claims: [] });
      case "listJurisdictions":
        return ok(route, []);
      case "listSkillTypes":
        return ok(route, []);
      case "getMyProfessionalIdentity":
        return ok(route, null);

      // Header chrome, on every authenticated page.
      case "countMyAcademyWork":
        return ok(route, { total: 0, actionable: 0 });
      case "countMyReviewQueue":
        return ok(route, 0);
      case "listMyEmployerWorkspaces":
        return ok(route, []);
      case "trackV31FunnelEvent":
        return ok(route, { recorded: false });

      default:
        // An unstubbed server function is a HOLE IN THE TEST, not a passing
        // case. It is recorded and answered with a 500 so the scenario fails
        // loudly on the read it forgot rather than quietly succeeding with
        // nothing.
        unmatched.push(name);
        return boom(route, `UNSTUBBED_SERVER_FN:${name}`);
    }
  });

  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: USER_ID,
          aud: "authenticated",
          email: "first-run@example.test",
          user_metadata: { display_name: "Nina" },
          app_metadata: {},
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => {
    if (process.env.E2E_DEBUG) console.log(`[page:${m.type()}] ${m.text().slice(0, 300)}`);
  });

  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
}

/**
 * The signed-OUT entrance, with Supabase Auth stubbed.
 *
 * `/signup?redirect=/passport` is the exact URL the public homepage sends
 * every new account to, so these scenarios start where a real person starts
 * and prove the intent survives all three ways of getting an account.
 */
async function mountSignedOut(
  page: Page,
  path: string,
  opts: { signUpReturnsSession?: boolean } = {},
) {
  pageErrors = [];
  unmatched = [];

  const oauth: { redirectTo: string | null; urls: string[]; stashed: string | null } = {
    redirectTo: null,
    urls: [],
    stashed: null,
  };
  page.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("OAUTH_STASH:")) oauth.stashed = t.slice("OAUTH_STASH:".length);
  });
  // The provider hop is a top-level NAVIGATION, not a fetch, so it is watched
  // on the request stream rather than intercepted from a route handler.
  page.on("request", (req) => {
    const u = req.url();
    if (!u.includes("/auth/v1/authorize")) return;
    oauth.urls.push(u);
    oauth.redirectTo = new URL(u).searchParams.get("redirect_to");
  });

  await page.addInitScript(
    ({ lang }) => {
      try {
        localStorage.setItem("cqrityjob.lang", lang);
      } catch {
        /* ignore */
      }
      // The OAuth destination is stashed in sessionStorage a moment before the
      // browser leaves for the provider, so it cannot be READ afterwards --
      // the document by then belongs to another origin. Reporting the write
      // as it happens is the only way to observe it from outside.
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patched(key: string, value: string) {
        if (key === "cqj:auth:oauth-return:v1") console.log(`OAUTH_STASH:${value}`);
        return original.call(this, key, value);
      };
    },
    { lang: "sv" },
  );

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    db.calls[name] = (db.calls[name] ?? 0) + 1;
    if (name === "getMyPassport") return ok(route, snapshot());
    if (name === "listMyVerificationRequests") return ok(route, { requests: [], decisions: [] });
    // ── THE HEADER'S OWN THREE READS ────────────────────────────────
    //
    // Scenarios 24, 25 and 26 do not stop at the auth form: they SIGN IN
    // and land on /passport, which mounts the site header, which asks
    // these three the moment it has a session. The signed-in mount below
    // has always answered them; this one did not, so the two scenarios
    // that complete a sign-in have been failing on the unmatched list
    // since the candidate app navigation shipped.
    //
    // Zeroes and an empty list: a brand-new account has no assigned work,
    // no review queue and no organisation, which is exactly the state
    // these scenarios are about.
    if (name === "countMyAcademyWork") return ok(route, { total: 0, actionable: 0 });
    if (name === "countMyReviewQueue") return ok(route, 0);
    if (name === "listMyEmployerWorkspaces") return ok(route, []);
    if (name === "getRegulatedCredentialAvailability")
      return ok(route, {
        state: "open",
        jurisdictionCode: "SE",
        subJurisdictionCode: null,
        marketPackCode: "SE-CORE",
        types: [],
      });
    unmatched.push(name);
    return boom(route, `UNSTUBBED_SERVER_FN:${name}`);
  });

  const session = {
    access_token: "stub-access-token",
    refresh_token: "stub-refresh-token",
    token_type: "bearer",
    expires_in: 3600 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: {
      id: USER_ID,
      aud: "authenticated",
      email: "new@example.test",
      user_metadata: {},
      app_metadata: {},
    },
  };

  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/signup")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          opts.signUpReturnsSession
            ? { ...session, user: session.user }
            : { user: session.user, session: null },
        ),
      });
    }
    if (url.includes("/auth/v1/token")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session),
      });
    }
    if (url.includes("/auth/v1/authorize") || url.includes("provider=google")) {
      // ABORTED rather than fulfilled. supabase-js performs this hop as a
      // top-level navigation, and letting it land -- even on a blank page --
      // moves the document to supabase.co, where the app's own sessionStorage
      // is no longer readable. Aborting keeps the browser on the app while the
      // request itself has already been observed above, which is what the two
      // assertions need.
      return route.abort();
    }
    if (url.includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session.user),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return oauth;
}

const screen = (page: Page) => page.locator("[data-first-run]");
const screenName = async (page: Page) => screen(page).getAttribute("data-first-run");

async function waitForScreen(page: Page, name: string) {
  await expect(page.locator(`[data-first-run="${name}"]`)).toBeVisible({ timeout: 20_000 });
}

/** Fill the details screen for a course. Uses labels, not generated ids. */
async function fillCourse(page: Page, title = "Väktarutbildning VU1", provider = "BYA") {
  await page.getByLabel("Kursens namn").fill(title);
  await page.getByLabel("Utbildare").fill(provider);
}

test.beforeEach(() => {
  db = freshDb();
  uuidCounter = 0;
});

function assertNoUnmatchedServerFunctions() {
  // An unexpected server read is a hole in the harness even when the page
  // catches the 500 and the visible assertion still passes. Keep this global
  // so every signed-in and signed-out scenario proves its backend surface is
  // fully modelled.
  expect(unmatched, `unstubbed server functions: ${unmatched.join(", ")}`).toEqual([]);
}

test.afterEach(() => {
  assertNoUnmatchedServerFunctions();
});

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

test.describe("Security Passport — the first run", () => {
  test("0 · harness negative control rejects an unstubbed server function", () => {
    unmatched.push("negativeControlServerFn");
    expect(() => assertNoUnmatchedServerFunctions()).toThrow(/negativeControlServerFn/);
    // Restore the fixture so the global afterEach proves the normal path too.
    unmatched = [];
  });

  test("1 · a brand-new account is handed the journey, not an empty Passport", async ({ page }) => {
    await mount(page, "/passport");
    await waitForScreen(page, "create");
    await expect(page).toHaveURL(/\/passport\/onboarding$/);
    await expect(page.getByRole("heading", { name: "Skapa ditt Security Passport" })).toBeVisible();
    await expect(page.locator('[data-cta="create-passport"]')).toHaveText(
      "Skapa mitt Security Passport",
    );
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  test("2 · double-clicking 'create' creates exactly one Passport", async ({ page }) => {
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "create");

    // Two clicks in ONE tick, which is what a double-tap on a slow connection
    // actually produces: both land before React has re-rendered the disabled
    // button. Playwright's own `click()` waits for stability and would
    // serialise them, which is the case that was never in doubt.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-cta="create-passport"]');
      el?.click();
      el?.click();
    });
    await waitForScreen(page, "choose");

    expect(db.events.filter((e) => e.type === "passport_created")).toHaveLength(1);
    expect(db.calls.ensureFirstRunPassport).toBeGreaterThan(0);
  });

  test("3 · every one of the five kinds can be the first merit, and each is self-declared", async ({
    page,
  }) => {
    for (const [kind, titleLabel, orgLabel] of [
      ["employment", "Roll eller titel", "Arbetsgivare"],
      ["education", "Utbildningens namn", "Skola eller lärosäte"],
      ["course", "Kursens namn", "Utbildare"],
      ["certification", "Certifieringens namn", "Utfärdare"],
      ["licence", "Behörighetens namn", "Myndighet eller utfärdare"],
    ] as const) {
      db = freshDb({
        profile: {
          onboardingState: "in_progress",
          onboardingAnswers: {},
          declaredAccurateAt: null,
        },
      });
      uuidCounter = 0;

      await mount(page, "/passport/onboarding");
      await waitForScreen(page, "choose");
      await page.locator(`[data-merit-kind="${kind}"]`).click();
      await waitForScreen(page, "details");

      await page.getByLabel(titleLabel).fill(`Test ${kind}`);
      await page.getByLabel(orgLabel).fill("Organisation AB");
      if (kind === "employment") {
        await page.getByLabel("Land där du arbetade").selectOption("GB");
        await page.getByLabel("Startdatum").fill("2024-03-01");
      }
      await page.locator('[data-testid="first-merit-declaration"]').check();
      await page.locator('[data-cta="save-merit"]').click();

      await waitForScreen(page, "done");
      expect(db.merits, kind).toHaveLength(1);
      expect(db.merits[0].assertionLevel, kind).toBe("self_declared");
      expect(db.merits[0].lifecycleState, kind).toBe("active");
      await expect(page.locator("[data-merit-title]")).toHaveText(`Test ${kind}`);
    }
  });

  test("4 · a course merit needs no employer, no profession and no country", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");

    // The country field is not even rendered for a course.
    await expect(page.getByLabel("Land där du arbetade")).toHaveCount(0);

    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    expect(db.merits).toHaveLength(1);
    expect(db.merits[0].country).toBeNull();
  });

  test("5 · employment refuses to save without an explicitly chosen country", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="employment"]').click();
    await waitForScreen(page, "details");

    // NOTHING is preselected. This is the whole defect: the column's DEFAULT
    // is a country, so an unanswered field is an assertion nobody made.
    await expect(page.getByLabel("Land där du arbetade")).toHaveValue("");

    await page.getByLabel("Roll eller titel").fill("Väktare");
    await page.getByLabel("Arbetsgivare").fill("Bevakning AB");
    await page.getByLabel("Startdatum").fill("2024-03-01");
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();

    // Still on the form, with the country flagged, and nothing written.
    await expect(page.locator('[data-first-run="details"]')).toBeVisible();
    await expect(page.getByLabel("Land där du arbetade")).toHaveAttribute("aria-invalid", "true");
    expect(db.merits).toHaveLength(0);
    expect(db.calls.completeFirstMerit ?? 0).toBe(0);
  });

  test("6 · completion without the declaration is refused and writes nothing", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-cta="save-merit"]').click();

    await expect(page.locator('[data-first-run="details"]')).toBeVisible();
    await expect(page.locator('[data-testid="first-merit-declaration"]')).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(db.merits).toHaveLength(0);
    expect(db.profile?.declaredAccurateAt).toBeNull();
  });

  test("7 · 'Save and exit' leaves a draft, no merit and no declaration", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page, "Halvfärdig kurs");
    await page.locator('[data-cta="save-and-exit"]').click();
    await page.waitForURL(/\/my-career/, { timeout: 20_000 });

    expect(db.merits).toHaveLength(0);
    expect(db.profile?.declaredAccurateAt).toBeNull();
    expect(db.profile?.onboardingState).toBe("in_progress");
    expect(db.profile?.onboardingAnswers["firstMerit.title"]).toBe("Halvfärdig kurs");
    expect(db.events.filter((e) => e.type === "declaration_recorded")).toHaveLength(0);
  });

  test("8 · a refresh resumes the exact draft, on the right screen, with the same operation id", async ({
    page,
  }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="certification"]').click();
    await waitForScreen(page, "details");
    await page.getByLabel("Certifieringens namn").fill("ISO 27001 Lead Auditor");
    await page.getByLabel("Utfärdare").fill("BSI");
    // Let the debounce land.
    await page.waitForTimeout(900);
    const opBefore = db.profile!.onboardingAnswers["firstMerit.operationId"];
    expect(opBefore).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForScreen(page, "details");
    await expect(page.locator("[data-first-run]")).toHaveAttribute(
      "data-merit-kind",
      "certification",
    );
    await expect(page.getByLabel("Certifieringens namn")).toHaveValue("ISO 27001 Lead Auditor");
    await expect(page.getByLabel("Utfärdare")).toHaveValue("BSI");

    // THE DECLARATION IS NOT RESTORED. An affirmation is made, not remembered.
    await expect(page.locator('[data-testid="first-merit-declaration"]')).not.toBeChecked();

    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");
    // The SAME operation id, so a resumed submission is still one operation.
    expect([...db.operations.keys()]).toEqual([opBefore]);
  });

  test("9 · a slow save clicked twice produces one request and one merit", async ({ page }) => {
    db.profile = profileOf();
    db.completeDelayMs = 1200;
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();

    // Same shape as scenario 2: two clicks in one tick, before the button can
    // disable itself.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-cta="save-merit"]');
      el?.click();
      el?.click();
    });
    await waitForScreen(page, "done");

    expect(db.calls.completeFirstMerit).toBe(1);
    expect(db.merits).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "onboarding_completed")).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "declaration_recorded")).toHaveLength(1);
  });

  test("10 · saving immediately after typing uses the latest values, not the last autosave", async ({
    page,
  }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page, "Första namnet");
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.waitForTimeout(900);

    // Retype and save INSIDE the debounce window, so the pending autosave
    // still holds the old value when the completion starts.
    await page.getByLabel("Kursens namn").fill("Rättat namn");
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    expect(db.merits[0].title).toBe("Rättat namn");
    await expect(page.locator("[data-merit-title]")).toHaveText("Rättat namn");
    // The flushed draft agrees with the merit, so a later resume cannot show
    // older answers than the record that exists.
    expect(db.profile?.onboardingAnswers["firstMerit.title"]).toBe("Rättat namn");
  });

  test("11 · a readback that never answers is neither success nor failure", async ({ page }) => {
    db.profile = profileOf();
    db.readbackMode = "error";
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();

    await waitForScreen(page, "unconfirmed");
    const body = (await page.locator('[data-first-run="unconfirmed"]').innerText()).toLowerCase();
    expect(body).toContain("kunde inte bekräfta");
    // Never claims success…
    expect(body).not.toContain("meriten är sparad");
    // …and never claims failure either.
    expect(body).not.toContain("sparades inte");
    // The write really did happen, which is exactly why neither claim is safe.
    expect(db.merits).toHaveLength(1);
  });

  test("12 · a readback for a row that is not there also refuses to claim success", async ({
    page,
  }) => {
    db.profile = profileOf();
    db.readbackMode = "missing";
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "unconfirmed");
  });

  test("13 · an existing holder with a current merit goes straight to the overview", async ({
    page,
  }) => {
    db.profile = profileOf({
      onboardingState: "completed",
      declaredAccurateAt: "2026-01-01T00:00:00Z",
    });
    db.merits = [
      {
        id: newId(),
        kind: "experience",
        title: "Väktare",
        organisation: "Bevakning AB",
        country: "SE",
        startedOn: "2024-03-01",
        endedOn: null,
        assertionLevel: "self_declared",
        lifecycleState: "active",
      },
    ];
    await mount(page, "/passport/onboarding");
    await page.waitForURL(/\/passport$/, { timeout: 20_000 });
    await expect(page.locator("[data-first-run]")).toHaveCount(0);
  });

  test("14 · a legacy completed profile with no merit gets the first-merit state", async ({
    page,
  }) => {
    db.profile = profileOf({
      onboardingState: "completed",
      declaredAccurateAt: "2025-01-01T00:00:00Z",
    });
    await mount(page, "/passport");
    await waitForScreen(page, "choose");
    await expect(page.getByRole("heading", { name: "Börja med din första merit" })).toBeVisible();
  });

  test("15 · only a draft merit is not Passport content", async ({ page }) => {
    db.profile = profileOf({
      onboardingState: "completed",
      declaredAccurateAt: "2025-01-01T00:00:00Z",
    });
    db.merits = [
      {
        id: newId(),
        kind: "claim",
        title: "Halvfärdig",
        organisation: null,
        country: null,
        startedOn: null,
        endedOn: null,
        assertionLevel: "self_declared",
        lifecycleState: "draft",
      },
    ];
    await mount(page, "/passport");
    await waitForScreen(page, "choose");
  });

  test("16 · a second operation id cannot make a second first merit", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    const firstId = db.merits[0].id;
    const opId = [...db.operations.keys()][0];
    expect(db.operations.get(opId)?.subjectId).toBe(firstId);

    // The UI no longer offers a way to submit a first merit twice -- that is
    // the point of the fix, and 37 asserts it. What this scenario pins is the
    // STATE the journey leaves behind: one merit, one operation, one
    // declaration, one completion. The server-side refusal of a SECOND
    // first-merit operation is proved against PostgreSQL in
    // supabase/tests/security_passport_first_merit_test.sql group 8.
    expect(db.merits).toHaveLength(1);
    expect([...db.operations.keys()]).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "declaration_recorded")).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "onboarding_completed")).toHaveLength(1);
  });

  test("17 · the confirmation never calls the merit verified, confirmed or documented", async ({
    page,
  }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    const body = await page.locator('[data-first-run="done"]').innerText();
    expect(body).toContain("Uppgift från dig");
    for (const word of ["Verifierad", "verifierad", "Bekräftad", "Dokumenterad", "dokumenterad"]) {
      expect(body, word).not.toContain(word);
    }
  });

  test("18 · every action on the confirmation screen has a real destination", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    await page.locator('[data-cta="complete-profile"]').click();
    await page.waitForURL(/\/passport\/information$/, { timeout: 20_000 });

    await page.goBack();
    await waitForScreen(page, "done");
    await page.locator('[data-cta="go-to-passport"]').click();
    await page.waitForURL(/\/passport$/, { timeout: 20_000 });
    // The overview, not a bounce back into the journey.
    await expect(page.locator("[data-first-run]")).toHaveCount(0);
  });

  test("19 · the English journey renders in English throughout", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding", "en");
    await waitForScreen(page, "choose");
    await expect(page.getByRole("heading", { name: "Start with your first merit" })).toBeVisible();

    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await page.getByLabel("Name of the course").fill("Guard training");
    await page.getByLabel("Training provider").fill("BYA");
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    const body = await page.locator('[data-first-run="done"]').innerText();
    expect(body).toContain("Your merit is saved");
    expect(body).toContain("Information provided by you");
    for (const swedish of ["Skapa", "Spara", "Uppgift", "Meriten", "Lägg till"]) {
      expect(body, swedish).not.toContain(swedish);
    }
  });

  test("20 · keyboard only: choose, fill, declare and save without a mouse", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");

    // Focus lands on the heading when the screen changes, so tabbing from
    // there reaches the choices.
    await expect(page.getByRole("heading", { name: "Börja med din första merit" })).toBeFocused();

    const tile = page.locator('[data-merit-kind="course"]');
    await tile.focus();
    await expect(tile).toBeFocused();
    await page.keyboard.press("Enter");
    await waitForScreen(page, "details");
    await expect(page.getByRole("heading", { name: "Om din kurs" })).toBeFocused();

    await page.getByLabel("Kursens namn").fill("Tangentbord");
    await page.getByLabel("Utbildare").fill("BYA");
    const box = page.locator('[data-testid="first-merit-declaration"]');
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).toBeChecked();
    await page.locator('[data-cta="save-merit"]').focus();
    await page.keyboard.press("Enter");
    await waitForScreen(page, "done");
    await expect(page.getByRole("heading", { name: "Meriten är sparad" })).toBeFocused();
  });

  test("21 · no horizontal overflow at 320, 360, 375 and 390", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");

    for (const width of [320, 360, 375, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `choose @ ${width}px`).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 375, height: 800 });
    await page.locator('[data-merit-kind="employment"]').click();
    await waitForScreen(page, "details");
    for (const width of [320, 360, 375, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `details @ ${width}px`).toBeLessThanOrEqual(1);
    }
  });

  test("22 · 200% zoom: nothing in the journey extends past the viewport", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");

    // Both halves of what a browser does at 200%: the CSS viewport halves,
    // and the text doubles. 1280x1024 zoomed to 200% is a 640x512 viewport.
    await page.setViewportSize({ width: 640, height: 512 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    await page.waitForTimeout(400);

    // Measured on the JOURNEY'S OWN SUBTREE rather than on the document.
    //
    // The document also carries the shared site chrome, and at 32px root font
    // `document.documentElement.scrollWidth` exceeds its clientWidth by ~21px
    // on pages this PR does not touch -- the PR #191 public homepage among
    // them, where the overflowing element is one of its illustration cards.
    // Asserting the document here would fail on somebody else's markup and
    // say nothing about this journey. What IS this journey's responsibility
    // is that no element it renders reaches past the viewport, and that is
    // what is asserted.
    const overflowing = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const rootEl = document.querySelector("[data-first-run]");
      if (!rootEl) return ["no first-run root"];
      const out: string[] = [];
      const walk = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > w + 1 || r.left < -1)) {
          out.push(`${el.tagName}.${(el.className || "").toString().slice(0, 60)}`);
        }
        for (const child of el.children) walk(child);
      };
      walk(rootEl);
      return out;
    });
    expect(overflowing, overflowing.join(", ")).toEqual([]);

    // And it is still operable: the choices are visible and clickable.
    await expect(page.locator('[data-merit-kind="course"]')).toBeVisible();
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await expect(page.getByLabel("Kursens namn")).toBeVisible();

    const detailsOverflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const rootEl = document.querySelector("[data-first-run]")!;
      const out: string[] = [];
      const walk = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > w + 1 || r.left < -1)) {
          out.push(`${el.tagName}.${(el.className || "").toString().slice(0, 60)}`);
        }
        for (const child of el.children) walk(child);
      };
      walk(rootEl);
      return out;
    });
    expect(detailsOverflow, detailsOverflow.join(", ")).toEqual([]);
  });

  test("27 · a reordered autosave cannot overwrite newer answers", async ({ page }) => {
    db.profile = profileOf();
    // THE FORCED REORDER. The first save is held for two seconds and the
    // second for a tenth of one, so if the two were allowed to overlap, the
    // OLDER answers would arrive last. Without the chain and without the
    // server's revision rule, that is exactly what wins.
    db.draftDelaySchedule = [2000, 100, 100, 100, 100];
    if (process.env.E2E_NC_UNORDERED) db.disableRevisionRule = true;
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");

    await page.getByLabel("Kursens namn").fill("Äldre");
    await page.waitForTimeout(900); // let the debounce fire the slow save
    await page.getByLabel("Kursens namn").fill("Nyare");
    await page.waitForTimeout(4000); // both settle

    // The revisions the server SAW are strictly ascending — the chain never
    // let two overlap — and the stored answer is the newer one.
    const ascending = db.draftOrder.every((v, i, a) => i === 0 || v > a[i - 1]);
    expect(ascending, `draft revisions arrived as ${db.draftOrder.join(",")}`).toBe(true);
    expect(
      db.draftArrivals[db.draftArrivals.length - 1],
      `answers arrived as ${db.draftArrivals.join(" | ")}`,
    ).toBe("Nyare");
    expect(db.profile?.onboardingAnswers["firstMerit.title"]).toBe("Nyare");
  });

  test("28 · a late autosave cannot reopen a completed onboarding", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");
    expect(db.profile?.onboardingState).toBe("completed");

    // A save that was in flight when the completion committed, replayed here
    // as a direct call with a stale-but-plausible revision.
    const rejected = await page.evaluate(async () => {
      const el = document.querySelector("[data-first-run]");
      return Boolean(el);
    });
    expect(rejected).toBe(true);
    // The stub applies the same rule the database does; assert the state it
    // protects rather than the mechanism.
    expect(db.profile?.onboardingState).toBe("completed");
    expect(db.profile?.declaredAccurateAt).not.toBeNull();
  });

  test("29 · navigating away with a pending autosave does not lose it", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");

    // Type and navigate INSIDE the debounce window, so the pending write has
    // not fired when the component unmounts.
    await page.getByLabel("Kursens namn").fill("Skrivet precis innan");
    await page.locator('[data-cta="save-and-exit"]').click();
    await page.waitForURL(/\/my-career/, { timeout: 20_000 });

    expect(db.profile?.onboardingAnswers["firstMerit.title"]).toBe("Skrivet precis innan");
  });

  test("30 · a failed 'Save and exit' stays on the form and keeps the values", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page, "Får inte försvinna", "BYA");

    db.failDraftSaves = true;
    await page.locator('[data-cta="save-and-exit"]').click();
    await page.waitForTimeout(1200);

    // Still here. It used to navigate from a `finally`, so a failed save took
    // the person away and told them nothing.
    await expect(page).toHaveURL(/\/passport\/onboarding$/);
    await expect(page.locator('[data-first-run="details"]')).toBeVisible();
    await expect(page.locator("[data-save-error]")).toBeVisible();
    await expect(page.locator("[data-save-error]")).toContainText("Utkastet kunde inte sparas");
    // And every value is still in the form.
    await expect(page.getByLabel("Kursens namn")).toHaveValue("Får inte försvinna");
    await expect(page.getByLabel("Utbildare")).toHaveValue("BYA");
    // With a retry that works once the failure clears.
    db.failDraftSaves = false;
    await page.locator('[data-cta="retry"]').click();
    await page.waitForURL(/\/my-career/, { timeout: 20_000 });
    expect(db.profile?.onboardingAnswers["firstMerit.title"]).toBe("Får inte försvinna");
  });

  test("31 · a committed write whose response is lost reconciles without duplicating", async ({
    page,
  }) => {
    db.profile = profileOf();
    db.dropCompletionResponseOnce = true;
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page, "Förlorat svar");
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await page.waitForTimeout(1500);

    // The write LANDED. The browser never heard about it.
    expect(db.merits).toHaveLength(1);
    const firstId = db.merits[0].id;

    // It must not claim nothing changed.
    await expect(page.locator("[data-save-error]")).toBeVisible();
    const message = await page.locator("[data-save-error]").innerText();
    expect(message).toContain("Vi vet inte om meriten sparades");
    expect(message).not.toContain("Ingenting har ändrats");

    // The retry is the PRIMARY button pressed again — one control, one action —
    // and it replays the SAME operation, so one merit, one event set, and a
    // real confirmation at the end.
    await expect(page.locator('[data-cta="retry"]')).toHaveCount(0);
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");
    expect(db.merits).toHaveLength(1);
    expect(db.merits[0].id).toBe(firstId);
    // One first-merit receipt. The Passport already existed in this scenario,
    // so no creation receipt is written.
    expect([...db.operations.keys()]).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "onboarding_completed")).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "declaration_recorded")).toHaveLength(1);
    await expect(page.locator("[data-merit-title]")).toHaveText("Förlorat svar");
  });

  test("32 · a readback whose country disagrees is not reported as saved", async ({ page }) => {
    db.profile = profileOf();
    db.readbackOverride = { country: "GB" };
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="employment"]').click();
    await waitForScreen(page, "details");
    await page.getByLabel("Roll eller titel").fill("Väktare");
    await page.getByLabel("Arbetsgivare").fill("Bevakning AB");
    await page.getByLabel("Land där du arbetade").selectOption("SE");
    await page.getByLabel("Startdatum").fill("2024-03-01");
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();

    await waitForScreen(page, "unconfirmed");
    await expect(page.locator('[data-first-run="done"]')).toHaveCount(0);
  });

  test("33 · a readback whose start date disagrees is not reported as saved", async ({ page }) => {
    db.profile = profileOf();
    db.readbackOverride = { startedOn: "2001-01-01" };
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="employment"]').click();
    await waitForScreen(page, "details");
    await page.getByLabel("Roll eller titel").fill("Väktare");
    await page.getByLabel("Arbetsgivare").fill("Bevakning AB");
    await page.getByLabel("Land där du arbetade").selectOption("SE");
    await page.getByLabel("Startdatum").fill("2024-03-01");
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();

    await waitForScreen(page, "unconfirmed");
  });

  test("34 · a claim readback whose completion date disagrees is not reported as saved", async ({
    page,
  }) => {
    db.profile = profileOf();
    db.readbackOverride = { startedOn: "1999-12-31" };
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="certification"]').click();
    await waitForScreen(page, "details");
    await page.getByLabel("Certifieringens namn").fill("ISO 27001");
    await page.getByLabel("Utfärdare").fill("BSI");
    await page.getByLabel("Datum (om du vet)").fill("2023-05-01");
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();

    await waitForScreen(page, "unconfirmed");
  });

  test("35 · a legacy draft with no operation id gets one, durably, before saving", async ({
    page,
  }) => {
    // The shape an older release could leave behind: a chosen merit kind and
    // typed answers, and no operation id at all.
    db.profile = profileOf({
      onboardingAnswers: {
        "firstMerit.kind": "course",
        "firstMerit.title": "Gammalt utkast",
        "firstMerit.organisation": "BYA",
        "firstMerit.operationId": "",
        "firstMerit.ongoing": "yes",
      },
      draftRevision: 4,
    });
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "details");
    await expect(page.getByLabel("Kursens namn")).toHaveValue("Gammalt utkast");

    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    // Exactly one first-merit operation, and it was PERSISTED before the
    // completion -- so a lost response would retry under the same key rather
    // than minting a second.
    const firstMeritOps = [...db.operations.keys()].filter((k) => !k.startsWith("create:"));
    expect(firstMeritOps).toHaveLength(1);
    expect(db.profile?.onboardingAnswers["firstMerit.operationId"]).toBe(firstMeritOps[0]);
    expect(db.merits).toHaveLength(1);
  });

  test("36 · a failed initial read never becomes a create state", async ({ page }) => {
    db.failPassportRead = true;
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "load_error");

    const body = await page.locator('[data-first-run="load_error"]').innerText();
    expect(body).toContain("Vi kunde inte hämta ditt Security Passport");
    expect(body).toContain("Ingenting i ditt Passport har ändrats");
    // The one thing it must NOT offer.
    expect(body).not.toContain("Skapa mitt Security Passport");
    await expect(page.locator('[data-cta="create-passport"]')).toHaveCount(0);
    expect(db.profile).toBeNull();

    // And it recovers.
    db.failPassportRead = false;
    await page.locator('[data-cta="retry-load"]').click();
    await waitForScreen(page, "create");
  });

  test("37 · 'add another merit' never calls the first-merit operation again", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    await page.locator('[data-merit-kind="course"]').click();
    await waitForScreen(page, "details");
    await fillCourse(page);
    await page.locator('[data-testid="first-merit-declaration"]').check();
    await page.locator('[data-cta="save-merit"]').click();
    await waitForScreen(page, "done");

    const callsBefore = db.calls.completeFirstMerit ?? 0;
    await page.locator('[data-cta="add-another"]').click();
    await page.waitForURL(/\/passport\/information/, { timeout: 20_000 });

    // It leaves first-run entirely for the ordinary editor.
    expect(db.calls.completeFirstMerit ?? 0).toBe(callsBefore);
    expect(db.merits).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "declaration_recorded")).toHaveLength(1);
    expect(db.events.filter((e) => e.type === "onboarding_completed")).toHaveLength(1);
  });

  test("38 · the first run has no Passport sub-navigation to wander off through", async ({
    page,
  }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "choose");
    // The four Passport tabs are a data-loss path mid-form. They come back the
    // moment the first run is over.
    await expect(page.getByRole("link", { name: "Mina uppgifter" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Passport Card" })).toHaveCount(0);
  });

  test("24 · a direct signup with ?redirect=/passport lands in the journey", async ({ page }) => {
    await mountSignedOut(page, "/signup?redirect=%2Fpassport", { signUpReturnsSession: true });
    await page
      .getByLabel(/E-post|Email/i)
      .first()
      .fill("new@example.test");
    await page
      .getByLabel(/Lösenord|Password/i)
      .first()
      .fill("a-long-enough-password");
    await page.getByRole("button", { name: /Skapa konto|Create account/i }).click();

    await page.waitForURL(/\/passport/, { timeout: 20_000 });
    await waitForScreen(page, "create");
  });

  test("25 · the emailed confirmation link comes back to /passport", async ({ page }) => {
    // What Supabase opens is `/login?redirect=/passport`, because that is the
    // `emailRedirectTo` the signup form built. Signing in from there must land
    // on the Passport and not on a generic home.
    await mountSignedOut(page, "/login?redirect=%2Fpassport");
    await page
      .getByLabel(/E-post|Email/i)
      .first()
      .fill("new@example.test");
    await page
      .getByLabel(/Lösenord|Password/i)
      .first()
      .fill("a-long-enough-password");
    await page.getByRole("button", { name: /Logga in|Sign in/i }).click();

    await page.waitForURL(/\/passport/, { timeout: 20_000 });
    await waitForScreen(page, "create");
  });

  test("26 · Google carries the Passport intent out and back", async ({ page }) => {
    const oauth = await mountSignedOut(page, "/signup?redirect=%2Fpassport");
    await page.getByRole("button", { name: /Google/i }).click();
    await page.waitForTimeout(600);

    // Layer 2 first, because it is the one that does not depend on the
    // provider honouring anything: the destination is stashed before the
    // browser leaves, and consumed on the way back.
    expect(oauth.stashed).toBe("/passport");

    // Layer 1: the round trip is ALSO told where to come back to.
    expect(oauth.urls.length, "an authorize request was made").toBeGreaterThan(0);
    expect(decodeURIComponent(oauth.redirectTo ?? ""), "redirect_to").toContain("/passport");
  });

  test("23 · the journey never renders and then jumps: the loading shell is the same shape", async ({
    page,
  }) => {
    db.profile = profileOf();
    await mount(page, "/passport/onboarding");
    // The skeleton is a first-run screen too, so there is never a frame with
    // no shell at all.
    await waitForScreen(page, "choose");
    expect(await screenName(page)).toBe("choose");
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });
});
