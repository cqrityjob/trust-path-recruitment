// Writes only the synthetic RI-P1-100-v1 population on an isolated loopback
// stack. Local Auth/Storage substitutes are disclosed separately from real
// SQL/RLS/API/UI proof. Mobile is Chromium device emulation, not a phone.
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test.use({ actionTimeout: 15_000 });
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
const EMAIL = process.env.E2E_RI_OWNER_EMAIL ?? "ri-p1-owner@synthetic.invalid";
const PASSWORD = process.env.E2E_RI_PASSWORD ?? "LocalJourney!2026";
const SLUG = "ri-p1-synthetic";
const EMPLOYER = "ee100000-1111-4000-8000-000000000001";
const JOB = "ee100000-2222-4000-8000-000000000001";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function sessionToken(page: Page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith("sb-") || !key.endsWith("auth-token")) continue;
      const value = JSON.parse(localStorage.getItem(key)!);
      if (value.access_token) return value.access_token as string;
    }
    throw new Error("No synthetic browser session token");
  });
}
const ordered = [
  ...Array.from({ length: 40 }, (_, i) => 40 - i),
  ...Array.from({ length: 25 }, (_, i) => 65 - i),
  ...Array.from({ length: 35 }, (_, i) => 100 - i),
].map(uuid);
test.skip(
  process.env.E2E_LOCAL_STACK !== "1" ||
    !/^https?:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(BASE) ||
    !/^https?:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API),
  "Requires the isolated loopback 100-application fixture; never a hosted project.",
);

async function signIn(page: Page, lang: "sv" | "en") {
  await page.goto("/login");
  await page.evaluate((value) => localStorage.setItem("cqrityjob.lang", value), lang);
  await page.reload();
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
}
async function capture(page: Page, name: string) {
  const dir = process.env.E2E_RI_EVIDENCE_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}
const visibleRows = (page: Page) =>
  page.locator(
    '[data-testid="candidate-table"] tr[data-application-id]:visible, [data-testid="candidate-table"] li[data-application-id]:visible',
  );
async function ids(page: Page) {
  return visibleRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-application-id")),
  );
}

/** The historical statistics are folded by default (the queue and the list
 *  are the work); a number inside is clicked or read after opening the fold. */
async function openStatistics(page: Page) {
  const fold = page.locator("[data-testid='counts-history']");
  if (
    (await fold.count()) > 0 &&
    !(await fold.first().evaluate((d) => (d as HTMLDetailsElement).open))
  )
    await fold.first().locator(":scope > summary").click();
}
async function counters(page: Page, reviewed = 27) {
  await openStatistics(page);
  const counts = page.getByTestId("recruiter-counts");
  for (const [field, count] of Object.entries({
    received: 100,
    reviewed,
    remaining: 100 - reviewed,
    green: 40,
    yellow: 25,
    gray: 35,
    not_established: 0,
  }))
    await expect(counts.getByTestId(`count-${field}`).locator("strong")).toHaveText(String(count));
}
async function draft(page: Page, text: string) {
  const panel = page.getByTestId("requirement-review");
  await expect(panel).toBeVisible();
  for (const input of await panel.getByTestId("criterion-note").all()) await input.fill(text);
  await panel
    .getByTestId("review-next-action")
    .fill("Request the document validity date; no message sent");
}
async function saveDraft(page: Page) {
  const panel = page.getByTestId("requirement-review");
  const before = await panel.getAttribute("data-revision");
  await panel.getByTestId("review-save-draft").click();
  await expect(panel).not.toHaveAttribute("data-revision", before!);
}

test("100 oracle: global status/counts/order, source-aware manual review, preserved URL and drafts in sv/en desktop and emulated mobile", async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== "chromium",
    "One controlled fixture run includes both explicit device contexts below.",
  );
  test.setTimeout(240_000);
  const contexts: BrowserContext[] = [];
  try {
    for (const lang of ["sv", "en"] as const)
      for (const mobile of [false, true]) {
        const context = await browser.newContext({
          baseURL: BASE,
          viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 1000 },
          isMobile: mobile,
          hasTouch: mobile,
        });
        contexts.push(context);
        const page = await context.newPage();
        await signIn(page, lang);
        const base = `/employer/${SLUG}/applications?stage=received`;
        for (let p = 1; p <= 4; p++) {
          await page.goto(`${base}&page=${p}`);
          await expect(visibleRows(page)).toHaveCount(25, { timeout: 25_000 });
          await counters(page);
          expect(await ids(page)).toEqual(ordered.slice((p - 1) * 25, p * 25));
        }
        // All groups retain reviewed/remaining counts over the complete filtered
        // set, including yellow and gray; page 2 must not re-sort only its rows.
        for (const [group, reviewed, remaining] of [
          ["yellow", 7, 18],
          ["gray", 10, 25],
        ] as const) {
          await page.goto(`${base}&requirement=${group}&review=reviewed`);
          await expect(visibleRows(page)).toHaveCount(reviewed);
          await expect(page.getByTestId("filtered-review-counts")).toContainText(
            lang === "sv"
              ? `${reviewed} granskade · 0 återstående`
              : `${reviewed} reviewed · 0 remaining`,
          );
          await page.goto(`${base}&requirement=${group}&review=remaining`);
          await expect(visibleRows(page)).toHaveCount(remaining);
          await expect(page.getByTestId("filtered-review-counts")).toContainText(
            lang === "sv"
              ? `0 granskade · ${remaining} återstående`
              : `0 reviewed · ${remaining} remaining`,
          );
        }
        await page.goto(`${base}&requirement=gray&page=2&sort=applied&dir=asc`);
        await expect(visibleRows(page)).toHaveCount(10);
        expect(await ids(page)).toEqual(Array.from({ length: 10 }, (_, i) => uuid(91 + i)));
        await page.reload();
        await expect(visibleRows(page)).toHaveCount(10);
        expect(new URL(page.url()).searchParams.get("page")).toBe("2");
        await visibleRows(page).first().locator('a[href*="/applications/"]').first().click();
        await expect(page.getByTestId("requirement-review")).toBeVisible();
        await page.goBack();
        await expect(visibleRows(page)).toHaveCount(10);
        expect(new URL(page.url()).searchParams.get("requirement")).toBe("gray");
        // Organisation cards state their global scope and reset a recruitment
        // filter. A number must open the full population it actually counts.
        await page
          .getByTestId("recruitment-filter")
          .selectOption("ee100000-2222-4000-8000-000000000002");
        await expect(page.getByTestId("filtered-review-counts")).toContainText(
          lang === "sv" ? "0 ansökningar" : "0 applications",
        );
        // Stage links keep the recruitment filter, so they may not display
        // organisation-wide counts such as New (50) on the empty job.
        const stageLabels = await page
          .getByTestId("stage-filter")
          .locator("option")
          .allTextContents();
        expect(stageLabels.every((label) => !/\(\d+\)/.test(label))).toBe(true);
        await openStatistics(page);
        await page.getByTestId("count-received").click();
        await expect(visibleRows(page)).toHaveCount(25);
        expect(new URL(page.url()).searchParams.has("job")).toBe(false);
        await expect(page.getByTestId("filtered-review-counts")).toContainText(
          lang === "sv" ? "100 ansökningar" : "100 applications",
        );
        // A dashboard count opens precisely its population through the same RPC.
        await page.goto(`/employer/${SLUG}`);
        await expect(page.getByTestId("recruiter-counts")).toBeVisible();
        await openStatistics(page);
        await page.getByTestId("count-remaining").click();
        await expect(page.getByTestId("filtered-review-counts")).toContainText(
          lang === "sv" ? "73 ansökningar" : "73 applications",
        );
        expect(new URL(page.url()).searchParams.get("review")).toBe("remaining");
        if (mobile)
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
        await capture(page, `${lang}-${mobile ? "emulated-375" : "desktop"}-remaining`);
      }
    const context = contexts[0]!;
    const page = await context.newPage();
    await page.goto(`/employer/${SLUG}/applications/${uuid(80)}`);
    const panel = page.getByTestId("requirement-review");
    await expect(panel.getByTestId("requirement-status")).toHaveAttribute("data-status", "gray");
    await expect(panel.getByTestId("human-review-status")).toHaveAttribute(
      "data-status",
      "pending",
    );
    // Opening and saving a draft cannot count as completed review or make a
    // missing/unreadable document fulfilled.
    await draft(
      page,
      "Synthetic reviewer checked available sources; unreadable document remains unclear",
    );
    await panel
      .getByTestId("criterion-neutral-question")
      .nth(1)
      .fill("Which document and validity date can you provide?");
    await saveDraft(page);
    await expect(panel.getByTestId("review-next-action")).toHaveValue(
      "Request the document validity date; no message sent",
    );
    await page.reload();
    await expect(panel.getByTestId("criterion-neutral-question").nth(1)).toHaveValue(
      "Which document and validity date can you provide?",
    );
    await expect(panel.getByTestId("human-review-status")).toHaveAttribute(
      "data-status",
      "pending",
    );
    await panel.getByTestId("review-confirm-ack").check();
    await panel.getByTestId("review-confirm").click();
    await expect(panel.getByTestId("human-review-status")).toHaveAttribute(
      "data-status",
      "reviewed",
    );
    await expect(panel.getByTestId("requirement-status")).toHaveAttribute("data-status", "gray");
    await capture(page, "sv-desktop-gray-human-reviewed");
    await page.goto(`/employer/${SLUG}/applications?stage=received`);
    await counters(page, 28);
    // Concurrent human drafts: another tab's saved text cannot be silently
    // overwritten. A rejected second write retains its draft until explicit reload.
    const other = await context.newPage();
    for (const p of [page, other]) {
      await p.goto(`/employer/${SLUG}/applications/${uuid(81)}`);
      await draft(p, p === page ? "First human draft" : "Second human draft retained");
    }
    await saveDraft(page);
    await expect(page.getByTestId("review-next-action")).toHaveValue(
      "Request the document validity date; no message sent",
    );
    await other.getByTestId("review-save-draft").click();
    await expect(other.getByRole("alert").filter({ hasText: "Utkastet finns kvar" })).toBeVisible();
    await expect(other.getByTestId("criterion-note").first()).toHaveValue(
      "Second human draft retained",
    );
    await other.getByRole("button", { name: "Läs in aktuell kravgranskning" }).click();
    await expect(other.getByTestId("criterion-note").first()).toHaveValue("First human draft");
    await capture(other, "sv-desktop-concurrent-explicit-reload");
    // An assignment change through the existing API has its own CAS token.
    // A stale review must not revert it, even if its old owner looked unchanged.
    await page.goto(`/employer/${SLUG}/applications/${uuid(82)}`);
    await draft(page, "Draft retained after another recruiter changed assignment");
    const headers = { Authorization: `Bearer ${await sessionToken(page)}` };
    const readReview = async () => {
      const response = await page.request.post(`${API}/rest/v1/rpc/rec_ri_get_review`, {
        headers,
        data: { _application_id: uuid(82) },
      });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const beforeAssignment = await readReview();
    const newOwner = "ee100000-0000-4000-8000-000000000003";
    const reassigned = await page.request.post(
      `${API}/rest/v1/rpc/rec_set_application_responsible`,
      {
        headers,
        data: {
          _application_id: uuid(82),
          _user_id: newOwner,
          _expected_version: beforeAssignment.assignmentVersion,
        },
      },
    );
    expect(reassigned.ok()).toBe(true);
    await page.getByTestId("review-save-draft").click();
    await expect(page.getByRole("alert").filter({ hasText: "Utkastet finns kvar" })).toBeVisible();
    await expect(page.getByTestId("criterion-note").first()).toHaveValue(
      "Draft retained after another recruiter changed assignment",
    );
    const afterAssignment = await readReview();
    expect(afterAssignment.responsibleUserId).toBe(newOwner);
    expect(afterAssignment.revision).toBe(beforeAssignment.revision);
    await page.getByRole("button", { name: "Läs in aktuell kravgranskning" }).click();
    await expect(page.getByTestId("review-owner")).toHaveValue(newOwner);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test("direct API reads the same 100 oracle before pagination and refuses anonymous access", async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== "chromium",
    "A single independent API verification is sufficient.",
  );
  const context = await browser.newContext({ baseURL: BASE });
  try {
    const page = await context.newPage();
    await signIn(page, "sv");
    const token = await sessionToken(page);
    const body = {
      _employer_id: EMPLOYER,
      _job_id: JOB,
      _filters: { stage: "received" },
      _sort: "requirements",
      _dir: "desc",
      _page: 4,
      _size: 25,
      _around: null,
    };
    const response = await page.request.post(`${API}/rest/v1/rpc/rec_ri_candidate_view`, {
      headers: { Authorization: `Bearer ${token}` },
      data: body,
    });
    expect(response.ok()).toBe(true);
    const value = await response.json();
    expect(value.intelligenceCounts).toMatchObject({
      received: 100,
      green: 40,
      yellow: 25,
      gray: 35,
      filtered: 100,
    });
    expect(value.rows.map((row: { id: string }) => row.id)).toEqual(ordered.slice(75));
    const anon = await page.request.post(`${API}/rest/v1/rpc/rec_ri_candidate_view`, {
      data: body,
    });
    expect(anon.ok()).toBe(false);
  } finally {
    await context.close();
  }
});

test("explicit chosen clarification reaches the existing PEACE case once without changing role content or confirming evidence", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "chromium", "Single controlled synthetic handoff.");
  const context = await browser.newContext({ baseURL: BASE });
  try {
    const page = await context.newPage();
    await signIn(page, "sv");
    const headers = { Authorization: `Bearer ${await sessionToken(page)}` };
    const rpc = async (name: string, data: object) => {
      const response = await page.request.post(`${API}/rest/v1/rpc/${name}`, { headers, data });
      const body = await response.text();
      expect(response.ok(), `${name}: HTTP ${response.status()} ${body}`).toBe(true);
      return body ? JSON.parse(body) : null;
    };
    // Use the application's existing atomic start contract, preserving its
    // lifecycle and setup, rather than inserting a case through a test shortcut.
    // Full migration replay creates fresh UUIDs; bind the role by its actual
    // slug/version rather than an ID copied from an earlier test database.
    const packsResponse = await page.request.get(`${API}/rest/v1/scp_interview_packs`, {
      headers,
      params: { slug: "eq.vaktare-se", select: "id" },
    });
    expect(packsResponse.ok()).toBe(true);
    const packs = await packsResponse.json();
    expect(packs).toHaveLength(1);
    const versionsResponse = await page.request.get(`${API}/rest/v1/scp_interview_pack_versions`, {
      headers,
      params: { pack_id: `eq.${packs[0].id}`, version_number: "eq.1", select: "id,content_hash" },
    });
    expect(versionsResponse.ok()).toBe(true);
    const versions = await versionsResponse.json();
    expect(versions).toHaveLength(1);
    const start = await rpc("scp_iv_start_interview", {
      _employer_id: EMPLOYER,
      _application_id: uuid(80),
      _source_kind: "chosen_setup",
      _source_id: null,
      _method: "trust",
      _pack_version_id: versions[0].id,
      _role_group: null,
      _role_profile: null,
      _environment: null,
      _title: "RI P1 synthetic explicit handoff",
    });
    const caseId: string = start.case_id;
    expect(caseId).toMatch(/^[a-f0-9-]{36}$/);
    const frozenBefore = await rpc("scp_iv_case_frozen_content", { _case_id: caseId });
    expect(frozenBefore.manifest.content.questions).toHaveLength(8);
    expect(frozenBefore.manifest.content.competencies).toHaveLength(6);
    const sources = async () => {
      const response = await page.request.get(`${API}/rest/v1/scp_interview_case_sources`, {
        headers,
        params: { case_id: `eq.${caseId}`, select: "id,content_text,source_kind,label" },
      });
      expect(response.ok()).toBe(true);
      return response.json() as Promise<
        Array<{ id: string; content_text: string | null; source_kind: string; label: string }>
      >;
    };
    const beforeSources = await sources();
    await page.goto(`/employer/${SLUG}/applications/${uuid(80)}`);
    const handoff = page.getByTestId("requirement-handoff");
    await expect(handoff.getByTestId("handoff-case")).toBeVisible();
    const review = await rpc("rec_ri_get_review", { _application_id: uuid(80) });
    const available = review.criteria.filter(
      (c: { source: unknown; neutralQuestion: string | null }) => c.source || c.neutralQuestion,
    );
    const index = available.findIndex(
      (c: { neutralQuestion: string | null }) =>
        c.neutralQuestion === "Which document and validity date can you provide?",
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const isSelected = (s: { content_text: string | null }) => {
      if (!s.content_text?.startsWith("{")) return false;
      return JSON.parse(s.content_text).requirementId === available[index].requirementId;
    };
    const alreadyTransferred = beforeSources.filter(isSelected).length;
    expect(alreadyTransferred).toBeLessThanOrEqual(1);
    for (const choice of await handoff.getByTestId("handoff-requirement").all())
      await expect(choice).not.toBeChecked();
    await handoff.getByTestId("handoff-requirement").nth(index).check();
    await handoff.getByTestId("handoff-case").selectOption(caseId);
    const added = async () =>
      (await sources()).filter((s) => !beforeSources.some((old) => old.id === s.id));
    await handoff.getByTestId("handoff-submit").click();
    await expect.poll(async () => (await sources()).filter(isSelected).length).toBe(1);
    await expect(
      page.getByRole("status").filter({ hasText: "Valt underlag har kopplats" }),
    ).toBeVisible();
    const selected = (await sources()).filter(isSelected)[0]!;
    expect(await added()).toHaveLength(alreadyTransferred ? 0 : 1);
    expect(JSON.parse(selected.content_text!)).toMatchObject({
      requirementId: available[index].requirementId,
      neutralQuestion: "Which document and validity date can you provide?",
    });
    // A second explicit transfer is semantically idempotent, even when the UI
    // generates a fresh operation id; no duplicate registration is created.
    await handoff.getByTestId("handoff-submit").click();
    await expect(handoff.getByTestId("handoff-submit")).toBeEnabled();
    expect((await sources()).filter(isSelected)).toHaveLength(1);
    expect(await added()).toHaveLength(alreadyTransferred ? 0 : 1);
    const frozenAfter = await rpc("scp_iv_case_frozen_content", { _case_id: caseId });
    expect(frozenAfter).toEqual(frozenBefore);
    const evidence = await page.request.get(`${API}/rest/v1/scp_interview_evidence`, {
      headers,
      params: { case_id: `eq.${caseId}`, select: "id" },
    });
    expect(evidence.ok()).toBe(true);
    expect(await evidence.json()).toEqual([]);
    await page.getByRole("link", { name: "Öppna intervjuförberedelse" }).click();
    await expect(page).toHaveURL(new RegExp(`/interview-intelligence/${caseId}/prepare`));
    await expect(
      page.locator(`section[aria-labelledby="s-saved-sources"] li#source-${selected.id}`),
    ).toContainText(selected.label);
    const brief = page.locator('section[aria-labelledby="s-selected-requirements"]');
    await expect(brief).toContainText("Which document and validity date can you provide?");
    await expect(brief).toContainText("inte bekräftad intervjuevidens");
    await expect(brief.getByRole("link", { name: "Öppna ansökan" })).toHaveAttribute(
      "href",
      new RegExp(`/applications/${uuid(80)}`),
    );
    await expect(brief).not.toContainText('"requirementId"');
    await capture(page, "sv-desktop-explicit-peace-handoff");
  } finally {
    await context.close();
  }
});

test("cached recruitment navigation resets the profile target and unsaved drafts even at equal version numbers", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "chromium", "One controlled cached-route transition.");
  const context = await browser.newContext({ baseURL: BASE });
  try {
    const page = await context.newPage();
    await signIn(page, "sv");
    const headers = { Authorization: `Bearer ${await sessionToken(page)}` };
    const rpc = async (name: string, data: object) => {
      const response = await page.request.post(`${API}/rest/v1/rpc/${name}`, { headers, data });
      const body = await response.text();
      expect(response.ok(), `${name}: HTTP ${response.status()} ${body}`).toBe(true);
      return body ? JSON.parse(body) : null;
    };
    const jobB = "ee100000-2222-4000-8000-000000000002";
    // Create the second profile through the existing authorised structure
    // and confirmation contracts. There remain exactly 100 applications.
    await rpc("rec_save_vacancy_structure", {
      _job_id: jobB,
      _requirements: [
        {
          key: "B1",
          kind: "mandatory",
          label_sv: "Syntetiskt B-krav",
          label_en: "Synthetic B criterion",
        },
      ],
      _questions: [
        {
          requirement_key: "B1",
          prompt_sv: "Har du B1?",
          prompt_en: "Do you hold B1?",
          answer_kind: "yes_no",
          is_required: false,
        },
      ],
    });
    const b = await rpc("rec_ri_get_profile", { _job_id: jobB });
    await rpc("rec_ri_confirm_profile", {
      _job_id: jobB,
      _expected_version: 0,
      _operation_id: "ee100000-3333-4000-8000-000000000099",
      _start_date: "2027-02-01",
      _rules: [
        {
          requirementId: b.requirements[0].id,
          kind: "mandatory",
          acceptedSources: ["application_answer"],
          decisionRule: "boolean_yes",
          questionId: b.questions[0].id,
          instructionSv: "Kontrollera B-originalet",
          instructionEn: "Check B original",
        },
      ],
    });
    await page.goto(`/employer/${SLUG}/jobs/${JOB}?step=requirements`);
    const profile = page.getByTestId("requirement-profile");
    await expect(profile).toHaveAttribute("data-job-id", JOB);
    await expect(profile.getByTestId("profile-start-date")).toHaveValue("2026-11-01");
    await profile.getByTestId("profile-start-date").fill("2040-01-01");
    // Dispatch the native history event to change only route parameters,
    // retaining this document and the React Query cache (no full reload).
    const navigateSameDocument = async (job: string) => {
      await page.evaluate((path) => {
        const current = history.state ?? {};
        history.pushState(current, "", path);
        window.dispatchEvent(new PopStateEvent("popstate", { state: current }));
      }, `/employer/${SLUG}/jobs/${job}?step=requirements`);
      await expect(profile).toHaveAttribute("data-job-id", job);
    };
    await navigateSameDocument(jobB);
    await expect(profile.getByTestId("profile-start-date")).toHaveValue("2027-02-01");
    await expect(profile).toContainText("Syntetiskt B-krav");
    await profile.getByTestId("profile-start-date").fill("2041-01-01");
    await navigateSameDocument(JOB);
    await expect(profile.getByTestId("profile-start-date")).toHaveValue("2026-11-01");
    await expect(profile).toContainText("Krav R1");
    await navigateSameDocument(jobB);
    await expect(profile.getByTestId("profile-start-date")).toHaveValue("2027-02-01");
    expect((await rpc("rec_ri_get_profile", { _job_id: JOB })).version).toBe(1);
    expect((await rpc("rec_ri_get_profile", { _job_id: jobB })).version).toBe(1);
    await capture(page, "sv-desktop-cached-job-profile-target");
  } finally {
    await context.close();
  }
});

test("archive-only recruitment still exposes all received applications and its archive filter", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "chromium", "One controlled archive-only synthetic population.");
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  try {
    const context = await browser.newContext({ baseURL: BASE });
    contexts.push(context);
    const page = await context.newPage();
    await signIn(page, "sv");
    const headers = { Authorization: `Bearer ${await sessionToken(page)}` };
    const rpc = async (name: string, data: object) => {
      const response = await page.request.post(`${API}/rest/v1/rpc/${name}`, { headers, data });
      const body = await response.text();
      expect(response.ok(), `${name}: HTTP ${response.status()} ${body}`).toBe(true);
      return body ? JSON.parse(body) : null;
    };
    const args = {
      _employer_id: EMPLOYER,
      _job_id: JOB,
      _filters: { stage: "received" },
      _sort: "requirements",
      _dir: "desc",
      _page: 1,
      _size: 100,
      _around: null,
    };
    const baseline = await rpc("rec_ri_candidate_view", args);
    expect(baseline.rows).toHaveLength(100);
    for (const row of baseline.rows) {
      await rpc("rec_set_application_stage", {
        _application_id: row.id,
        _expected_status: row.status,
        _new_status: "rejected",
        _note: "Explicit synthetic local archive regression; no candidate notification",
      });
      await rpc("rec_archive_material", { _job_id: JOB, _application_id: row.id, _archive: true });
    }
    const archived = await rpc("rec_ri_candidate_view", args);
    expect(archived.intelligenceCounts).toMatchObject({ received: 100, archived: 100 });
    expect(archived.counts.total).toBe(0);
    for (const [lang, mobile] of [
      ["sv", false],
      ["en", true],
    ] as const) {
      const view = mobile
        ? await browser.newContext({
            baseURL: BASE,
            viewport: { width: 375, height: 812 },
            isMobile: true,
            hasTouch: true,
          })
        : context;
      if (mobile) contexts.push(view);
      const target = mobile ? await view.newPage() : page;
      if (mobile) await signIn(target, lang);
      await target.goto(`/employer/${SLUG}/jobs/${JOB}?step=applications&stage=open`);
      await expect(target.getByTestId("candidate-empty")).toContainText(
        lang === "sv" ? "Inga kandidater matchar filtren." : "No candidates match the filters.",
      );
      await expect(target.getByTestId("candidate-empty")).not.toContainText(
        lang === "sv" ? "Inga ansökningar ännu." : "No applications yet.",
      );
      await target.getByTestId("candidate-empty").getByRole("button").click();
      await expect(visibleRows(target)).toHaveCount(25);
      expect(new URL(target.url()).searchParams.get("stage")).toBe("received");
      await openStatistics(target);
      await expect(target.getByTestId("count-received").locator("strong")).toHaveText("100");
      await target.getByTestId("count-received").click();
      for (let p = 1; p <= 4; p++) {
        if (p > 1)
          await target.goto(
            `/employer/${SLUG}/jobs/${JOB}?step=applications&stage=received&page=${p}`,
          );
        await expect(visibleRows(target)).toHaveCount(25);
        await expect(target.getByTestId("active-population-reset")).toHaveCount(0);
        expect(await ids(target)).toEqual(ordered.slice((p - 1) * 25, p * 25));
      }
      // The stage select sits behind the "more filters" fold since the list
      // views (Aktiva / Avgjorda / Avslutade / Alla) took its place up front.
      const fold = target.getByTestId("more-filters");
      if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open)))
        await fold.locator(":scope > summary").click();
      await target.getByTestId("stage-filter").selectOption("archived");
      await expect(visibleRows(target)).toHaveCount(25);
      await expect(target.getByTestId("filtered-review-counts")).toContainText(
        lang === "sv" ? "100 ansökningar" : "100 applications",
      );
      await capture(target, `${lang}-${mobile ? "emulated-375" : "desktop"}-archive-only-received`);
    }
  } finally {
    for (const context of contexts) await context.close();
  }
});
