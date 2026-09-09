// The /my-career real-route harness — one definition, several specs.
//
// Lifted verbatim out of my-career-home.spec.ts when a second spec needed
// it (the PR #211 hub evidence run). It is the same stub table, the same
// planted session and the same fixtures; nothing about how a scenario is
// driven changed, so a screenshot taken through this module and an
// assertion made through it are looking at the same page.
//
// ── WHY A MODULE RATHER THAN A COPY ────────────────────────────────────
//
// A second copy of `repliesFor` would drift the moment a route gained a
// read: one spec would answer it and the other would fail with
// UNSTUBBED_SERVER_FN, and the cheapest way out of that is to answer the
// hole with `null` — which is precisely the silent-success trap the
// unmatched list exists to prevent.
//
// See my-career-home.spec.ts for the reasoning behind the stub protocol
// (base64url /_serverFn ids, `{ result, error, context }` envelopes, the
// planted supabase-js session and the deliberate `hang` state).

import type { Page, Route } from "@playwright/test";
import {
  FIXTURES,
  fixtureById,
  work,
  history,
  type HomeFixture,
} from "../../src/lib/professional-identity/fixtures/career-home-fixtures";
import type { HomePresentationInput } from "../../src/lib/professional-identity/home-presentation";
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
export const SUPABASE_REF = "wrygicdfxwjnrugduxnt";
export const USER_ID = "00000000-0000-4000-8000-000000000001";

// ── THREE IDENTIFIER DOMAINS, THREE VISIBLY DIFFERENT UUIDS ───────────
//
// The defect this pins: `claimAssessmentAssignment` returns an
// `assessment_runs` id (created by save_career_report), and it was being
// routed to /academy/$attemptId — an `scp_attempts` id. Ids that looked
// alike made the two indistinguishable in a test. These cannot be
// confused by eye, and every assertion names which domain it expects.
export const ASSIGNMENT_ID = "aaaaaaaa-0000-4000-8000-00000000a551"; // assessment_assignments
export const LINKED_RUN_ID = "bbbbbbbb-0000-4000-8000-0000000000ce"; // assessment_runs
export const ATTEMPT_ID = "cccccccc-0000-4000-8000-00000000a11e"; // scp_attempts
export const FAILING_ASSIGNMENT_ID = "dddddddd-0000-4000-8000-00000000fa11";

/** The minimum PassportSnapshot the Passport index needs to reach its ready
 *  branch, so a navigation scenario lands on a real page. */
export function passportSnapshot(f: HomeFixture) {
  const id = f.input.identity;
  const claims = id.state === "ready" ? id.identity.claims : [];
  const periods = id.state === "ready" ? id.identity.employment : [];
  return {
    profile: {
      displayName: "Amina Karlsson",
      headline: "Väktare",
      cigProfessionSlug: "vaktare",
      jurisdictionCode: "SE",
      subJurisdictionCode: null,
      workLocationConfirmedAt: "2026-01-01T00:00:00Z",
      privacyMode: "private",
      onboardingState: "complete",
      onboardingStep: 0,
      onboardingAnswers: {},
    },
    holder: {
      id: USER_ID,
      displayName: "Amina Karlsson",
      professionSlug: "vaktare",
      identity: {
        engineVersion: "identity-v1",
        evaluatedOn: "2026-09-05",
        includesSelfDeclared: true,
        educationCompleted: [],
        professionalCompetence: [],
        localEligibility: [],
        activeTitles: [],
      },
      jurisdictionCode: "SE",
      subJurisdictionCode: null,
      periods: periods.map((p) => ({
        id: p.id,
        employerName: p.employerName,
        roleTitle: p.roleTitle,
        cigProfessionSlug: null,
        jurisdictionCode: p.jurisdictionCode,
        employmentType: p.employmentType,
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: null,
        startedOn: p.startedOn,
        endedOn: p.endedOn,
        assertionLevel: p.assertionLevel,
        lifecycleState: "active",
      })),
      claims: claims.map((c) => ({
        id: c.id,
        claimType: c.claimType,
        credentialCode: null,
        skillCode: null,
        skillLevel: c.skillLevel,
        title: c.title,
        claimedIssuerName: c.issuerName,
        jurisdictionCode: "SE",
        subJurisdictionCode: null,
        authorisationScope: null,
        issuedOn: c.issuedOn,
        validFrom: null,
        validUntil: c.validUntil,
        assertionLevel: c.assertionLevel,
        lifecycleState: c.lifecycleState,
        versionNo: 1,
        supersedesId: null,
      })),
      hasCareerDiscoveryResult: false,
    },
    eventCount: 0,
  };
}
/* ------------------------------------------------------------------ */
/* Stubbing                                                            */
/* ------------------------------------------------------------------ */

export type Reply = { body: unknown } | { error: string } | { hang: true };

export function exportOf(url: string): string | null {
  const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (!m) return null;
  try {
    const json = JSON.parse(
      Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return String(json.export ?? "").replace(/_createServerFn_handler$/, "");
  } catch {
    return null;
  }
}

export const ok = (body: unknown): Reply => ({ body });
export const fail = (error = "stubbed failure"): Reply => ({ error });
export const HANG: Reply = { hang: true };

export const src = <T>(s: { state: string; rows?: readonly T[] }): Reply =>
  s.state === "ready" ? ok(s.rows ?? []) : s.state === "error" ? fail() : HANG;

/**
 * The last mount's bookkeeping, asserted after every test.
 *
 * A per-test call would have to be remembered; an `afterEach` cannot be
 * forgotten, and it covers scenarios added later too. Each spec registers
 * its own `afterEach` and reads this through `takeMountBookkeeping`,
 * which CLEARS it — so a test that never mounted cannot inherit the
 * previous test's console errors and pass or fail on them.
 */
let current: { errors: string[]; unmatched: string[] } | null = null;

export function takeMountBookkeeping(): { errors: string[]; unmatched: string[] } | null {
  const c = current;
  current = null;
  return c;
}

export function repliesFor(f: HomeFixture): Record<string, Reply> {
  const i: HomePresentationInput = f.input;
  const identity =
    i.identity.state === "ready"
      ? ok(i.identity.identity)
      : i.identity.state === "error"
        ? fail("identity failed")
        : HANG;
  const profile =
    i.jobFilter.state === "family"
      ? ok({
          hasProfile: true,
          profile: {
            profileVersion: "career-profile-for-jobs-v1",
            familyScores: { [i.jobFilter.familyId]: { currentFit: 0.8, potential: 0.9 } },
          },
          runId: "run-cd-1",
          completedAt: "2026-08-20T09:00:00Z",
        })
      : i.jobFilter.state === "none"
        ? ok({ hasProfile: false })
        : HANG;
  return {
    getMyProfessionalIdentity: identity,
    // ── A REAL CvSummary, NOT A BAG OF IDS ──────────────────────────
    //
    // This used to answer with `{ id }` objects, which was enough while
    // the home read nothing but `length`. The hub's CV module names the
    // most recent document and says when it changed, so a stub that
    // omitted `title` and `updatedAt` would have rendered an empty name
    // and no date and the test would have passed anyway. A fixture that
    // supplies its own list overrides this.
    listMyCvs:
      i.savedCvs && i.savedCvs.state !== "loading"
        ? src(i.savedCvs)
        : ok(
            Array.from({ length: i.savedCvCount ?? 0 }, (_, n) => ({
              cvId: `cv-${n}`,
              title: n === 0 ? "Väktare – Nordvakt AB" : `CV ${n + 1}`,
              purpose: "general",
              locale: "sv",
              origin: "factual",
              updatedAt: `2026-08-${String(20 - n).padStart(2, "0")}T09:00:00Z`,
              createdAt: "2026-07-01T09:00:00Z",
            })),
          ),
    // Absent means the holder has created no link — which is what almost
    // every fixture is. A fixture that has shares declares them.
    listMyShares: src(i.shares ?? { state: "ready", rows: [] }),
    getV31Availability: ok({ available: i.careerDiscoveryOpen === true }),
    getV31TesterStatus: ok({ allowed: i.careerDiscoveryOpen === true }),
    getActiveCareerReport: i.activeReportError
      ? fail()
      : i.activeReport
        ? ok(i.activeReport)
        : HANG,
    getStoredDiscoveryReport: i.storedReportError
      ? fail()
      : i.storedReport
        ? ok(i.storedReport)
        : HANG,
    listAssessmentRuns: src(i.legacyRuns),
    listMyDiscoveryReports:
      i.discoveryReports.state === "ready"
        ? ok({ reports: i.discoveryReports.rows })
        : i.discoveryReports.state === "error"
          ? fail()
          : HANG,
    listAcademyWork: src(i.academyWork),
    claimAssessmentInvitations: ok({ bound: 0, expired: 0 }),
    getMyAssessmentHistory: src(i.assessmentHistory),
    getMyLinkableAssignments: ok([]),
    listMyApplications: src(i.applications),
    listMyInterviews: src(i.interviews),
    listMyVerificationRequests:
      f.requests === "error"
        ? fail("verification read failed")
        : f.requests
          ? ok({ requests: f.requests, decisions: [] })
          : HANG,
    getMyCareerProfileForJobs: profile,
    // ── DESTINATIONS ────────────────────────────────────────────────
    // The two routes a scenario navigates to. Stubbed in the base table so
    // a click-through cannot leave an unstubbed read behind.
    getMySavedReport: ok({
      run: { id: LINKED_RUN_ID, completedAt: "2026-07-01T09:00:00Z", status: "completed" },
      // A run with no stored report renders the route's "legacy empty"
      // state — a real destination state that proves the route resolved
      // THIS run id, without inventing an engine result.
      report: null,
    }),
    getMyPassport: ok(passportSnapshot(f)),
    ensureMyPassport: ok({ created: false }),
    getRegulatedCredentialAvailability: ok({
      state: "open",
      jurisdictionCode: "SE",
      subJurisdictionCode: null,
      marketPackCode: "SE-CORE",
      types: [],
    }),
    // header chrome
    countMyAcademyWork: ok({ total: 0, actionable: 0 }),
    countMyReviewQueue: ok(0),
    listMyEmployerWorkspaces: ok([]),
    trackV31FunnelEvent: ok({ recorded: false }),
  };
}

export async function mount(
  page: Page,
  fixtureId: string,
  opts: {
    lang?: "sv" | "en";
    overrides?: Record<string, Reply | ((route: Route) => Promise<void>)>;
    jobs?: unknown[];
    /** Where the mount lands. Defaults to the career home; the hub's other
     *  sections are the same stub table on a different route, which is the
     *  whole point of them being canonical destinations. */
    path?: string;
    /** What proves the landing rendered. Defaults to the career home's
     *  header. A wait on an element the destination never draws would
     *  otherwise time out for twenty seconds and report as a page defect. */
    ready?: string;
  } = {},
) {
  const f = fixtureById(fixtureId);
  if (!f) throw new Error(`unknown fixture ${fixtureId}`);
  const replies = { ...repliesFor(f), ...(opts.overrides ?? {}) };
  const unmatched: string[] = [];

  await page.addInitScript(
    ({ ref, lang, userId }) => {
      try {
        localStorage.setItem("cqrityjob.lang", lang);
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
              email: "amina@example.test",
              user_metadata: { display_name: "Amina" },
              app_metadata: {},
            },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { ref: SUPABASE_REF, lang: opts.lang ?? "sv", userId: USER_ID },
  );

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    const reply = replies[name];
    if (process.env.E2E_DEBUG)
      console.log(
        `[rpc] ${name} -> ${reply ? ("hang" in reply ? "hang" : "error" in reply ? "500" : "200") : "UNMATCHED"}`,
      );
    if (!reply) {
      // An unstubbed server function is a HOLE IN THE TEST, not a passing
      // case: answering it with `null` let a query silently succeed with
      // nothing and hid whichever read the scenario forgot. It fails loudly,
      // and every scenario asserts the list stayed empty.
      unmatched.push(name);
      return route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: `UNSTUBBED_SERVER_FN:${name}`,
      });
    }
    if (typeof reply === "function") return reply(route);
    if ("hang" in reply) return; // never answers: the query stays pending
    if ("error" in reply)
      return route.fulfill({ status: 500, contentType: "text/plain", body: reply.error });
    // The client unwraps `{ result, error, context }` from every server
    // function response; a bare value would read as `undefined`.
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: reply.body, error: null, context: {} }),
    });
  });

  // Supabase: the auth "who am I" call, and the two direct REST reads.
  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: USER_ID,
          aud: "authenticated",
          email: "amina@example.test",
          user_metadata: { display_name: "Amina" },
          app_metadata: {},
        }),
      });
    }
    if (url.includes("/rest/v1/jobs")) {
      const rows = f.input.jobs.state === "ready" ? (opts.jobs ?? f.input.jobs.rows) : null;
      if (f.input.jobs.state === "error")
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "stubbed" }),
        });
      if (rows === null) return; // hang
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
    }
    if (url.includes("/rest/v1/employers")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (process.env.E2E_DEBUG) console.log(`[page:${m.type()}] ${m.text().slice(0, 300)}`);
    // A 500 from a stub IS the scenario ("this read failed"); the browser's
    // own "Failed to load resource" line for it is not a page defect.
    if (m.type() === "error" && !/favicon|funnel event|Failed to load resource/i.test(m.text()))
      errors.push(m.text());
  });

  await page.goto(`${BASE}${opts.path ?? "/my-career"}`, { waitUntil: "domcontentloaded" });
  await page.locator(opts.ready ?? "[data-career-header]").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  current = { errors, unmatched };
  return { f, errors, unmatched };
}
