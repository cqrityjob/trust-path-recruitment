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
const SUPABASE_REF = process.env.E2E_SUPABASE_REF ?? "wrygicdfxwjnrugduxnt";
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
      case "getInternationalPassportMetadata":
        return ok(route, {
          definitions: [],
          details: [],
          verificationEvents: [],
          jurisdictions: [],
          issuers: [],
        });
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

  await page.route(/^https?:\/\/[^/]+\/(?:auth|rest)\/v1\//, async (route) => {
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

  await page.route(/^https?:\/\/[^/]+\/(?:auth|rest)\/v1\//, async (route) => {
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
async function fillCertification(page: Page, title = "Väktarutbildning VU1", provider = "BYA") {
  await page.getByLabel("Certifieringens namn").fill(title);
  await page.getByLabel("Utfärdare").fill(provider);
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

test.describe("Security Passport — closed catalogue first run", () => {
  test("new account reaches Passport creation", async ({ page }) => {
    await mount(page, "/passport");
    await waitForScreen(page, "create");
    await expect(page).toHaveURL(/\/passport\/onboarding$/);
    await expect(page.locator('[data-cta="create-passport"]')).toBeVisible();
  });
  test("double click creates one Passport and opens governed catalogue", async ({ page }) => {
    await mount(page, "/passport/onboarding");
    await waitForScreen(page, "create");
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-cta="create-passport"]');
      button?.click();
      button?.click();
    });
    await expect(page).toHaveURL(/\/passport\/credentials\/new$/);
    expect(db.calls.ensureFirstRunPassport).toBe(1);
    expect(db.events.filter((e) => e.type === "passport_created")).toHaveLength(1);
    expect(db.merits).toHaveLength(0);
    await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
    await page.getByRole("button", { name: "Fortsätt", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Godkänt yrkesbevis" })).toBeVisible();
    expect(db.calls.completeFirstMerit ?? 0).toBe(0);
  });
  test("existing profile with legacy draft cannot resume free-text capture", async ({ page }) => {
    db.profile = profileOf({
      onboardingAnswers: {
        "firstMerit.title": "Custom certificate",
        "firstMerit.kind": "certification",
      },
    });
    await mount(page, "/passport/onboarding", "en");
    await expect(page.getByRole("link", { name: "Open catalogue" })).toBeVisible();
    await expect(page.locator("input,textarea")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Custom certificate");
    expect(db.calls.completeFirstMerit ?? 0).toBe(0);
  });
  test("failed Passport read offers retry and cannot create another", async ({ page }) => {
    db.failPassportRead = true;
    await mount(page, "/passport/onboarding", "en");
    await expect(page.locator('[data-cta="create-passport"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
    db.failPassportRead = false;
    await page.getByRole("button", { name: /try again/i }).click();
    await waitForScreen(page, "create");
    expect(db.calls.ensureFirstRunPassport ?? 0).toBe(0);
  });
  test("unavailable catalogue offers no custom claim escape", async ({ page }) => {
    db.profile = profileOf();
    await mount(page, "/passport/credentials/new", "en");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Your credential is not currently available in CQrityjob Security Passport.",
    );
    await expect(page.getByRole("button", { name: "Save as self-reported" })).toHaveCount(0);
    await expect(page.getByLabel("Original credential name", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Issuer (self-reported)", { exact: true })).toHaveCount(0);
    expect(db.merits).toHaveLength(0);
  });
});
