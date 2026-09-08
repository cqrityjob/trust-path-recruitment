// The fixture behind the signed-in CV specs.
//
// One planted Supabase session, one stateful model of the server contract,
// and one stub table that answers every `/_serverFn/` call the CV screens
// make. e2e/cv-flow.spec.ts asserts behaviour with it; e2e/cv-screens.spec.ts
// photographs the same journey. Both get the same fixture, so a screenshot
// cannot show a state the tests never exercised.
//
// ── HOW IT IS SIGNED IN ────────────────────────────────────────────────
//
// A Supabase session is planted in localStorage exactly as supabase-js stores
// one — the same fixture shape e2e/my-career-home.spec.ts already uses — and
// every `/_serverFn/<id>` call is answered here. It needs no database, no
// credentials and no network, so it is identical on a laptop and on a runner.
//
// ── AND WHY THE STUB IS NOT A HAND-WRITTEN FIXTURE ─────────────────────
//
// The replies are built by the PRODUCT'S OWN functions: `buildCvSourceBundle`
// derives the bundle from a `ProfessionalIdentityV1`, `buildSavedCvDocument`
// builds the document, `buildCvTrustAnnotations` derives the marks,
// `diffCvSourceBundles` computes the drift and `omittedFacts` computes the
// omissions — the same calls `prepareMyCv` and `getMyCv` make on the server.
// Only the TRANSPORT and the STORAGE are modelled here.
//
// A stub returning hand-typed JSON would drift from the contract the moment
// either side changed, and would let this suite keep passing over a document
// shape the product no longer produces. This one cannot: change the document
// builder and these tests render the new document.
//
// What it therefore does NOT prove: RLS, the controlled write functions, and
// what a fabricated payload does at the boundary. Those are proved by
// executing them — supabase/tests/cv_documents_controlled_writes_test.sql and
// the two-process concurrency proof in scripts/db-test.sh. The two halves
// meet at the refusal codes, which are modelled here exactly as the client
// observes them (`CV_CHANGED`, `CV_REQUEST_CONFLICT`), because the routes
// branch on those strings.
//
// The model is deliberately strict about the two things the contract turns
// on: an operation id replays instead of creating a second CV, and a stale
// revision is refused. A stub that answered "ok" to both would make the two
// most important scenarios here vacuous.
//
import { test, expect, type Page, type Route } from "@playwright/test";
import { fromJSON } from "seroval";
import type { ProfessionalIdentityV1 } from "../../src/lib/professional-identity/identity";
import {
  buildCvSourceBundle,
  type CvSourceBundle,
} from "../../src/lib/professional-identity/cv/source-bundle";
import {
  applyPersonEdit,
  buildSavedCvDocument,
  factualStoredPresentation,
  storedContactSchema,
  type StoredContact,
  type StoredPresentation,
} from "../../src/lib/professional-identity/cv/stored";
import { buildCvTrustAnnotations } from "../../src/lib/professional-identity/cv/trust-annotations";
import { diffCvSourceBundles } from "../../src/lib/professional-identity/cv/bundle-diff";
import { omittedFacts } from "../../src/lib/professional-identity/cv/selection";
import { computeCvReadiness } from "../../src/lib/professional-identity/cv/readiness";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
export const SUPABASE_REF = "wrygicdfxwjnrugduxnt";
export const USER_ID = "00000000-0000-4000-8000-0000000000c1";
export const ACCOUNT_EMAIL = "karin.wallin@example.test";

/** The day every expiry and trust mark below is judged against. Pinned, so an
 *  assertion cannot start failing because the calendar moved. */
const TODAY = "2026-09-08";

/* ------------------------------------------------------------------ */
/* The person                                                          */
/* ------------------------------------------------------------------ */

// Real uuids, because `cvSelectionSchema` requires them: an id this suite
// sends must be an id the server's own validator would accept.
export const EMP_NOW = "11111111-0000-4000-8000-000000000001";
export const EMP_PAST = "11111111-0000-4000-8000-000000000002";
export const CLAIM_VU1 = "22222222-0000-4000-8000-000000000001";
export const CLAIM_GY = "22222222-0000-4000-8000-000000000002";
export const CLAIM_EN = "22222222-0000-4000-8000-000000000003";
export const CV_ID = "33333333-0000-4000-8000-000000000001";

type Employment = ProfessionalIdentityV1["employment"][number];
type Claim = ProfessionalIdentityV1["claims"][number];

function employment(over: Partial<Employment>): Employment {
  return {
    id: EMP_NOW,
    employerName: "Nordic Security AB",
    roleTitle: "Väktare",
    startedOn: "2022-03-01",
    endedOn: null,
    employmentType: "employed",
    jurisdictionCode: "SE",
    assertionLevel: "self_declared",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

function claim(over: Partial<Claim>): Claim {
  return {
    id: CLAIM_VU1,
    claimType: "certification",
    title: "Väktarutbildning VU1",
    issuerName: "BYA",
    issuedOn: "2019-04-01",
    validUntil: null,
    skillLevel: null,
    assertionLevel: "self_declared",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    ...over,
  };
}

/** Karin: one current employment, one ENDED one — professional history, not
 *  an archived merit — a live authorisation, an education and a language. */
export function karin(employerNameNow = "Nordic Security AB"): ProfessionalIdentityV1 {
  return {
    identityVersion: "professional-identity-v1",
    displayName: "Karin Wallin",
    accountCountry: "SE",
    locale: "sv",
    currentStatus: null,
    currentProfessionSlug: "vaktare",
    currentProfessionOther: null,
    currentProfessionTitleSv: "Väktare",
    currentProfessionTitleEn: "Security officer",
    yearsOfExperience: "6-10",
    hasPassport: true,
    headline: "Väktare med sex års erfarenhet",
    workCountry: "SE",
    workSubJurisdiction: null,
    employment: [
      employment({
        id: EMP_NOW,
        employerName: employerNameNow,
        assertionLevel: "verified",
        verifierName: "Nordic Security AB",
        verificationMethod: "employer_confirmation",
        verifiedOn: "2024-02-01",
      }),
      employment({
        id: EMP_PAST,
        employerName: "Stadsvakt i Malmö AB",
        roleTitle: "Ordningsvakt",
        startedOn: "2019-06-01",
        endedOn: "2022-02-28",
      }),
    ],
    claims: [
      claim({ id: CLAIM_VU1, validUntil: "2028-04-01" }),
      claim({
        id: CLAIM_GY,
        claimType: "education",
        title: "Gymnasieexamen",
        issuerName: "Malmö kommun",
        issuedOn: "2018-06-01",
      }),
      claim({
        id: CLAIM_EN,
        claimType: "language",
        title: "Engelska",
        issuerName: null,
        issuedOn: null,
        skillLevel: "B2",
      }),
    ],
    discovery: {
      hasCompletedReport: false,
      snapshotId: null,
      generatedAt: null,
      namesCareers: false,
    },
    workload: {
      applicationCount: 0,
      assessmentAssignmentCount: 0,
      releasedReportCount: 0,
      releasedReportAttemptId: null,
      assessmentAssignmentAttemptId: null,
      employerWorkspaceCount: 0,
      draftClaimCount: 0,
      draftClaimIds: [],
    },
    unavailable: [],
  };
}

/* ------------------------------------------------------------------ */
/* A stateful model of the server contract                             */
/* ------------------------------------------------------------------ */

interface StoredCv {
  cvId: string;
  title: string;
  locale: "sv" | "en";
  purpose: "general" | "targeted";
  includedIds: readonly string[];
  presentation: StoredPresentation;
  updatedAt: string;
  /** The bundle frozen at save time. Drift is computed against the live
   *  identity, exactly as `getMyCv` computes it. */
  frozen: CvSourceBundle;
}

export class ServerModel {
  readonly cvs = new Map<string, StoredCv>();
  /** operationId -> the cv it created and the request that made it. */
  readonly operations = new Map<string, { cvId: string; fingerprint: string }>();
  /** A scenario sets this to make the live profile disagree with a saved CV. */
  employerNameNow = "Nordic Security AB";
  /** So "the retry did not create a second CV" is checkable from both sides. */
  createCalls = 0;
  /** So "one confirmation performs exactly one refresh" is checkable too. */
  refreshCalls = 0;
  /** Set by a scenario to make the next refresh be refused by the server. */
  refuseRefresh: string | null = null;

  private clock = 0;
  private nextRevision(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 8, 8, 9, 0, this.clock)).toISOString();
  }

  identity(): ProfessionalIdentityV1 {
    return karin(this.employerNameNow);
  }

  /** What the server would derive right now for one selection. */
  bundle(includedIds: readonly string[] | undefined, locale: "sv" | "en"): CvSourceBundle {
    return buildCvSourceBundle({
      identity: this.identity(),
      locale,
      includeCareerInsight: false,
      targetJobText: null,
      includedIds,
    });
  }

  /**
   * The bundle AS THE DATABASE WOULD HAVE STORED IT.
   *
   * ── WHY THIS EXISTS, AND WHY ITS ABSENCE LET A DEFECT SHIP ───────────
   *
   * This fixture used to model the stored bundle with `buildCvSourceBundle`,
   * the same call it used for the fresh one. That makes both sides of every
   * drift comparison come from ONE implementation, so a disagreement between
   * the TypeScript builder and the SQL writer is invisible here by
   * construction -- and one shipped: the SQL stored the published profession
   * title, TypeScript produced the raw slug, and the "your profile has
   * changed" banner could never be cleared.
   *
   * A stub whose two sides cannot disagree cannot test whether they agree.
   * So the stored side is pinned to what `cv_source_bundle` actually writes:
   * the published catalogue title for the document's locale. If the
   * TypeScript builder ever drifts from that again, a freshly saved CV starts
   * reporting drift in these tests, exactly as it did to a person.
   */
  storedAsSql(includedIds: readonly string[] | undefined, locale: "sv" | "en"): CvSourceBundle {
    const built = this.bundle(includedIds, locale);
    return {
      ...built,
      identity: {
        ...built.identity,
        currentProfession: locale === "en" ? "Security officer" : "Väktare",
      },
    };
  }

  create(payload: Record<string, unknown>) {
    this.createCalls += 1;
    const operationId = String(payload.operationId ?? "");
    const includedIds = (payload.includedIds as string[]) ?? [];
    const locale = (payload.locale as "sv" | "en") ?? "sv";
    const contact = storedContactSchema.parse(payload.contact ?? {});
    const fingerprint = JSON.stringify({
      includedIds: [...includedIds].sort(),
      locale,
      title: String(payload.title ?? "").trim(),
      contact,
    });

    // THE REPLAY CONTRACT, as cv_create states it. The same id and the same
    // request returns the original; the same id and a different request is
    // refused and writes nothing.
    const seen = this.operations.get(operationId);
    if (seen) {
      if (seen.fingerprint !== fingerprint) throw new Error("CV_REQUEST_CONFLICT");
      const cv = this.cvs.get(seen.cvId)!;
      return { cvId: cv.cvId, savedAt: cv.updatedAt, replayed: true, violations: [] };
    }

    const frozen = this.storedAsSql(includedIds, locale);
    if (frozen.employment.length === 0 && frozen.education.length === 0) {
      throw new Error("CV_NOT_READY");
    }
    // One CV per scenario. A second would mean a test wrote twice without
    // saying so, and a silent second row is what this suite is looking for.
    if (this.cvs.size > 0) throw new Error("CV_UNEXPECTED_SECOND_CREATE");

    const cv: StoredCv = {
      cvId: CV_ID,
      title: String(payload.title ?? "").trim() || "Allmänt CV",
      locale,
      purpose: (payload.purpose as StoredCv["purpose"]) ?? "general",
      includedIds,
      presentation: factualStoredPresentation(frozen, { contact }),
      updatedAt: this.nextRevision(),
      frozen,
    };
    this.cvs.set(cv.cvId, cv);
    this.operations.set(operationId, { cvId: cv.cvId, fingerprint });
    return { cvId: cv.cvId, savedAt: cv.updatedAt, replayed: false, violations: [] };
  }

  save(payload: Record<string, unknown>) {
    const cv = this.mine(payload);
    // THE REVISION CHECK. A stale tab writes nothing at all.
    if (payload.expectedUpdatedAt !== cv.updatedAt) throw new Error("CV_CHANGED");

    if (Array.isArray(payload.includedIds)) {
      cv.includedIds = payload.includedIds as string[];
      cv.frozen = this.storedAsSql(cv.includedIds, cv.locale);
    }
    const title = String(payload.title ?? "").trim();
    if (title) cv.title = title;
    if (payload.locale === "sv" || payload.locale === "en") cv.locale = payload.locale;
    if (payload.contact !== undefined) {
      cv.presentation = {
        ...cv.presentation,
        contact: storedContactSchema.parse(payload.contact),
      };
    }
    // The person's own edit, folded onto the stored row by the product's own
    // rule — so authorship is not tested against a reimplementation of it.
    cv.presentation = applyPersonEdit(cv.presentation, {
      headline: payload.headline as string | undefined,
      summary: payload.summary as string | undefined,
      bullets: payload.bullets as { sourceId: string; bullets: string[] }[] | undefined,
    });
    cv.updatedAt = this.nextRevision();
    return { cvId: cv.cvId, savedAt: cv.updatedAt, replayed: false, violations: [] };
  }

  refresh(payload: Record<string, unknown>) {
    const cv = this.mine(payload);
    if (payload.expectedUpdatedAt !== cv.updatedAt) throw new Error("CV_CHANGED");
    if (this.refuseRefresh) throw new Error(this.refuseRefresh);
    // Re-derives current values for the facts this CV ALREADY carries, and
    // adds nothing — the rule refreshMyCvFromProfile states.
    this.refreshCalls += 1;
    cv.frozen = this.storedAsSql(cv.includedIds, cv.locale);
    cv.updatedAt = this.nextRevision();
    return { savedAt: cv.updatedAt };
  }

  remove(payload: Record<string, unknown>) {
    const cv = this.mine(payload);
    if (payload.expectedUpdatedAt !== cv.updatedAt) throw new Error("CV_CHANGED");
    this.cvs.delete(cv.cvId);
    return { deleted: true };
  }

  get(cvId: string) {
    const cv = this.cvs.get(cvId);
    if (!cv) throw new Error("CV_NOT_FOUND");
    const fresh = this.bundle(cv.includedIds, cv.locale);
    const full = this.bundle(undefined, cv.locale);
    return {
      cvId: cv.cvId,
      title: cv.title,
      purpose: cv.purpose,
      locale: cv.locale,
      // FACTS FROM THE SNAPSHOT, TRUST FROM TODAY — the rule getMyCv states,
      // built by the same three calls it makes.
      document: buildSavedCvDocument(
        cv.frozen,
        cv.presentation,
        buildCvTrustAnnotations(this.identity(), TODAY),
      ),
      bundle: cv.frozen,
      presentation: cv.presentation,
      providerMode: null,
      modelId: null,
      updatedAt: cv.updatedAt,
      profileDrift: diffCvSourceBundles(cv.frozen, fresh),
      omitted: omittedFacts(full, cv.frozen),
      accountEmail: ACCOUNT_EMAIL,
    };
  }

  list() {
    return [...this.cvs.values()].map((cv) => ({
      cvId: cv.cvId,
      title: cv.title,
      purpose: cv.purpose,
      locale: cv.locale,
      origin: "factual" as const,
      updatedAt: cv.updatedAt,
      createdAt: cv.updatedAt,
    }));
  }

  private mine(payload: Record<string, unknown>): StoredCv {
    const cv = this.cvs.get(String(payload.cvId ?? ""));
    if (!cv) throw new Error("CV_NOT_FOUND");
    return cv;
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

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

/**
 * The payload a server function was called with.
 *
 * TanStack Start serialises it with seroval's `toJSONAsync`, so this decodes
 * it with seroval's own `fromJSON` rather than pattern-matching the wire
 * format. Reading the real arguments is what lets the model enforce the
 * operation id and the revision instead of assuming them.
 */
function payloadOf(route: Route): Record<string, unknown> {
  const raw = route.request().postData();
  if (!raw) return {};
  const decoded = fromJSON(JSON.parse(raw)) as { data?: unknown };
  const data = decoded?.data ?? decoded;
  return (data ?? {}) as Record<string, unknown>;
}

export interface Options {
  lang?: "sv" | "en";
  /** Swallow the answer to `createMyCv` exactly once, AFTER the model has
   *  recorded the write. The lost-response case, reproduced. */
  dropFirstCreateResponse?: boolean;
}

/** Server functions this suite did not answer. An unstubbed one is a HOLE IN
 *  THE TEST, not a passing case, so it fails the scenario that provoked it. */
let unmatched: string[] = [];

/**
 * Registered by each spec's own hooks, rather than by a `test.beforeEach` in
 * this module.
 *
 * Playwright loads a module once, so a hook declared here would attach to
 * whichever spec file imported it FIRST and be silently missing from the
 * second. A pair of exported functions cannot go missing without somebody
 * deleting a visible line.
 */
export function resetStubTracking(): void {
  unmatched = [];
}

export function assertNoUnstubbedServerFns(): void {
  const seen = [...new Set(unmatched)];
  expect(seen, `unstubbed server functions: ${seen.join(", ")}`).toEqual([]);
}

export async function signedIn(page: Page, model: ServerModel, opts: Options = {}) {
  let dropped = false;

  await page.addInitScript(
    ({ ref, lang, userId, email }) => {
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
              email,
              user_metadata: { display_name: "Karin" },
              app_metadata: {},
            },
          }),
        );
      } catch {
        /* a browser that refuses storage simply arrives signed out */
      }
      // The export button calls window.print(). A headless browser blocks on
      // the dialog, so it is recorded instead — which is also the only way to
      // assert that the button does what its label says.
      (window as unknown as { __printCalls: number }).__printCalls = 0;
      window.print = () => {
        (window as unknown as { __printCalls: number }).__printCalls += 1;
      };
    },
    { ref: SUPABASE_REF, lang: opts.lang ?? "sv", userId: USER_ID, email: ACCOUNT_EMAIL },
  );

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    const send = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result, error: null, context: {} }),
      });
    // A refusal reaches the browser as the message the client throws, which is
    // the string the routes branch on. Same shape as CvWriteError's.
    const refuse = (message: string) =>
      route.fulfill({ status: 500, contentType: "text/plain", body: message });

    try {
      switch (name) {
        case "prepareMyCv": {
          return send({
            readiness: computeCvReadiness(model.identity()),
            bundle: model.bundle(undefined, opts.lang ?? "sv"),
            factualDocument: null,
            hasCareerInsight: false,
            accountEmail: ACCOUNT_EMAIL,
            defaultLocale: opts.lang ?? "sv",
          });
        }
        case "generateMyCv": {
          const p = payloadOf(route);
          const locale = (p.locale as "sv" | "en") ?? "sv";
          const contact: StoredContact = storedContactSchema.parse(p.contact ?? {});
          const bundle = model.bundle((p.includedIds as string[]) ?? [], locale);
          // No provider is configured in a test run, and that is a real
          // product state: the factual document, complete and savable.
          return send({
            status: "provider_unavailable",
            readiness: computeCvReadiness(model.identity()),
            presentation: null,
            document: buildSavedCvDocument(
              bundle,
              factualStoredPresentation(bundle, { contact }),
              buildCvTrustAnnotations(model.identity(), TODAY),
            ),
            providerMode: null,
            model: null,
            quarantinedPassages: [],
            failureReason: null,
            violationCount: 0,
          });
        }
        case "createMyCv": {
          const result = model.create(payloadOf(route));
          if (opts.dropFirstCreateResponse && !dropped) {
            // The write COMMITTED and the answer never arrived. Aborting after
            // the model has recorded it is exactly that shape, and it is the
            // only shape in which the retry means anything.
            dropped = true;
            return route.abort("connectionreset");
          }
          return send(result);
        }
        case "saveMyCv":
          return send(model.save(payloadOf(route)));
        case "refreshMyCvFromProfile":
          return send(model.refresh(payloadOf(route)));
        case "deleteMyCv":
          return send(model.remove(payloadOf(route)));
        case "getMyCv":
          return send(model.get(String(payloadOf(route).cvId ?? "")));
        case "listMyCvs":
          return send(model.list());
        // The signed-in header, on every page. Answered with the same empty
        // counts the other authenticated suites use: this suite is about the
        // CV, and a badge in the navigation must not decide whether it passes.
        case "countMyAcademyWork":
          return send({ total: 0, actionable: 0 });
        case "countMyReviewQueue":
          return send(0);
        case "listMyEmployerWorkspaces":
          return send([]);
        case "listMyApplicationCvOptions":
          return send(
            model.list().map((cv) => ({
              cvId: cv.cvId,
              title: cv.title,
              purpose: cv.purpose,
              locale: cv.locale,
              updatedAt: cv.updatedAt,
              block: null,
            })),
          );
        default:
          unmatched.push(name);
          return refuse(`UNSTUBBED_SERVER_FN:${name}`);
      }
    } catch (err) {
      return refuse(err instanceof Error ? err.message : String(err));
    }
  });

  // Nothing may reach the real project. Every request to it is answered here,
  // and the only one the client makes with a planted session is the user read.
  await page.route(`https://${SUPABASE_REF}.supabase.co/**`, async (route) => {
    if (route.request().url().includes("/auth/v1/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: USER_ID,
          aud: "authenticated",
          email: ACCOUNT_EMAIL,
          user_metadata: { display_name: "Karin" },
          app_metadata: {},
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

export const doc = (page: Page) => page.locator("article.cv-document");
export const savedUrl = new RegExp(`/my-career/cv/${CV_ID}`);

export async function gotoNew(page: Page, heading: RegExp) {
  await page.goto(`${BASE}/my-career/cv/new`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  // The checkboxes only exist once the profile has arrived and seeded them.
  await expect(page.getByRole("checkbox").first()).toBeChecked({ timeout: 30_000 });
}

/** Preview, then save, then land on the saved CV. Several scenarios start
 *  here and none of them is about getting here. */
export async function createAndSave(
  page: Page,
  preview = /Förhandsgranska CV/,
  save = /^Spara CV$/,
) {
  await page.getByRole("button", { name: preview }).click();
  await expect(doc(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: save }).click();
  await expect(page).toHaveURL(savedUrl, { timeout: 20_000 });
  await expect(doc(page)).toBeVisible({ timeout: 20_000 });
}
