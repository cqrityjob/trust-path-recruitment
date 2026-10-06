/** Real assigned officer/manager journeys. Synthetic loopback fixture only.
 * Each project starts from a fresh beskt_e2e snapshot + role fixture.
 * Answers, reviews and report release use the governed product interfaces;
 * SQL only reads the resulting state. No score/key is read or fabricated.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { Database } from "../src/integrations/supabase/database";
const BASE = process.env.E2E_BASE_URL ?? "",
  DB = process.env.JOURNEY_DATABASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "",
  KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const local = (v: string) => /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(v);
test.skip(
  process.env.E2E_LOCAL_STACK !== "1" ||
    !local(BASE) ||
    !local(API) ||
    !KEY ||
    !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/beskt_e2e$/.test(DB),
  "Synthetic loopback only",
);
test.describe.configure({ mode: "serial", timeout: 600000 });
const OUT = process.env.ROLE_EVIDENCE_DIR ?? "artifacts/role-assessment-journey";
const ORG = "beskt-journey-ab",
  ORG_ID = "b4000000-0000-4000-8000-00000000ee01";
type Functions = Database["public"]["Functions"];
async function rpc<N extends keyof Functions>(
  token: string,
  name: N,
  args: Functions[N]["Args"],
): Promise<Functions[N]["Returns"]> {
  const r = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  expect(r.ok, `${name}: ${await r.clone().text()}`).toBe(true);
  return r.json();
}
function sql(q: string) {
  return execFileSync("psql", [DB, "-tAq", "-v", "ON_ERROR_STOP=1", "-c", q], {
    encoding: "utf8",
  }).trim();
}
async function account(ctx: BrowserContext, email: string, lang: string) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "LocalJourney!2026" }),
  });
  expect(r.ok).toBe(true);
  const auth = await r.json();
  await ctx.addInitScript(
    ({ auth, lang }) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(auth));
      localStorage.setItem("cqrityjob.lang", lang);
    },
    { auth, lang },
  );
  return auth.access_token as string;
}
async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const [idx, role, lang] of [
  [1, "officer", "sv"],
  [2, "officer", "en"],
  [3, "manager", "sv"],
  [4, "manager", "en"],
] as const) {
  test(`${role} ${lang}: dispatch, section progress, saved reload, filled reports and denial`, async ({
    browser,
  }, info) => {
    const contexts: BrowserContext[] = [];
    const create = async () => {
      const c = await browser.newContext({ ...info.project.use });
      contexts.push(c);
      return c;
    };
    try {
      const ownerCtx = await create(),
        ownerToken = await account(ownerCtx, "beskt-recruiter@local.test", lang),
        owner = await ownerCtx.newPage();
      const app = `e6300000-0000-4000-8000-${String(idx).padStart(12, "0")}`,
        job = `e6200000-0000-4000-8000-${String(idx).padStart(12, "0")}`;
      await owner.goto(`${BASE}/employer/${ORG}/assessments/library`);
      const card = owner.locator("article").filter({
        has: owner.getByRole("heading", {
          name:
            role === "officer" ? /Väktare|Security officer/i : /Säkerhetschef|Security manager/i,
        }),
      });
      await expect(card).toHaveCount(1, { timeout: 60000 });
      await card.getByTestId("send-test-entry").click();
      await owner.getByRole("dialog").getByRole("combobox").selectOption(job);
      await owner.getByRole("checkbox").check();
      await owner.getByRole("button", { name: /Välj test|Choose test/ }).click();
      await owner.locator(`input[name$='-language'][value='${lang}']`).check();
      await owner.getByTestId("send-test-submit").click();
      await expect(owner.getByTestId("send-test-confirmation")).toBeVisible();
      await owner.getByTestId("send-test-submit").click();
      await expect(owner.getByTestId("send-test-sent")).toBeVisible({ timeout: 60000 });
      await shot(owner, `${role}-${lang}-sent`);
      const row = sql(
        `SELECT t.id||'|'||d.slug||'|'||a.language FROM scp_attempts t JOIN assessment_assignments a ON a.id=t.assignment_id JOIN scp_assessment_versions v ON v.id=t.assessment_version_id JOIN scp_assessment_definitions d ON d.id=v.definition_id WHERE a.application_id='${app}' AND a.cancelled_at IS NULL`,
      );
      const [attempt, slug, language] = row.split("|");
      expect(slug).toBe(`security-${role}-recruitment`);
      expect(language).toMatch(new RegExp(`^${lang}`));
      const count = Number(
        sql(
          `SELECT count(*) FROM scp_form_items f JOIN scp_attempts t ON t.form_id=f.form_id WHERE t.id='${attempt}'`,
        ),
      );
      expect(count).toBeGreaterThan(10);
      const candidateCtx = await create(),
        candidateToken = await account(candidateCtx, `role-${idx}@local.test`, lang),
        candidate = await candidateCtx.newPage();
      await candidate.goto(`${BASE}/academy/${attempt}`);
      await candidate
        .getByRole("button", {
          name: /^Starta testet$|^Fortsätt testet$|^Start the test$|^Continue the test$/,
        })
        .first()
        .click();
      let answered = 0,
        sectionAnswered = 0,
        previousMax = 0,
        sections = 0;
      for (let guard = 0; guard < 200; guard++) {
        const cont = candidate.getByRole("button", { name: /^Fortsätt$|^Continue$/ }),
          next = candidate.getByRole("button", { name: /^Nästa$|^Next$/ }),
          submit = candidate.getByRole("button", { name: /^Lämna in testet$|^Submit the test$/ });
        await expect(cont.or(next).or(submit).first()).toBeVisible({ timeout: 60000 });
        if (await cont.isVisible()) {
          await cont.click();
          sectionAnswered = 0;
          sections++;
          continue;
        }
        const progress = candidate.getByRole("progressbar");
        await expect(progress).toHaveAttribute("aria-valuenow", String(sectionAnswered));
        const max = Number(await progress.getAttribute("aria-valuemax"));
        expect(max).toBeGreaterThan(0);
        previousMax = max;
        const text = candidate.locator("textarea[id^='cr-']");
        if (await text.isVisible()) {
          await text.fill(
            `SYNTETISKT svar ${answered + 1}: säkra platsen, kontrollera uppgifterna, kontakta ansvarig och dokumentera beslutet.`,
          );
          await text.blur();
        } else {
          const groups = candidate.locator("main fieldset");
          for (let g = 0; g < (await groups.count()); g++)
            await groups
              .nth(g)
              .locator("label")
              .nth(g === 1 ? 1 : 0)
              .click();
        }
        await expect(candidate.getByText(/Sparat|Saved/).first()).toBeVisible({ timeout: 30000 });
        answered++;
        sectionAnswered++;
        await expect(progress).toHaveAttribute("aria-valuenow", String(sectionAnswered));
        expect(sectionAnswered).toBeLessThanOrEqual(max);
        await expect(progress).toHaveAttribute(
          "aria-valuetext",
          `${sectionAnswered} ${lang === "sv" ? "av" : "of"} ${max}`,
        );
        if (answered === 1) {
          await candidate.reload();
          await expect(
            candidate.getByRole("button", {
              name: /^Fortsätt testet$|^Continue the test$/,
            }),
          ).toBeVisible({ timeout: 60000 });
          await candidate
            .getByRole("button", {
              name: /^Fortsätt testet$|^Continue the test$/,
            })
            .click();
          // The saved position and one accepted response survive the reload.
          if (await cont.isVisible()) await cont.click();
          expect(
            sql(`SELECT count(*) FROM scp_candidate_responses WHERE attempt_id='${attempt}'`),
          ).toBe("1");
          await expect(candidate.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
          await next.click();
          continue;
        }
        if (await submit.isVisible()) {
          await submit.click();
          break;
        }
        await next.click();
      }
      expect(answered).toBe(count);
      expect(sections).toBeGreaterThan(1);
      expect(previousMax).toBeGreaterThan(0);
      await expect(candidate.getByText(/inlämnad|Tack|submitted|Thank/i).first()).toBeVisible({
        timeout: 60000,
      });
      await shot(candidate, `${role}-${lang}-submitted`);
      expect(
        sql(`SELECT count(*) FROM scp_candidate_responses WHERE attempt_id='${attempt}'`),
      ).toBe(String(count));
      const before = await rpc(candidateToken, "scp_participant_report", { _attempt_id: attempt });
      expect(before).toEqual([]);
      await rpc(ownerToken, "scp_grant_employer_reviewer", {
        _employer_id: ORG_ID,
        _user_id: "b5000000-0000-4000-8000-0000000000d6",
        _use_cases: ["recruitment"],
      });
      const reviewerCtx = await create(),
        reviewer = await account(reviewerCtx, "beskt-assessor@local.test", lang);
      const queue = (
        await rpc(reviewer, "scp_review_queue", { _language: lang === "sv" ? "sv-SE" : "en-GB" })
      ).filter((r) => r.attempt_id === attempt);
      expect(queue.length).toBeGreaterThan(0);
      for (const r of queue) {
        const rubric = r.rubric;
        const levels: Record<string, number> = {};
        if (Array.isArray(rubric))
          for (const dim of rubric) {
            if (
              dim &&
              typeof dim === "object" &&
              !Array.isArray(dim) &&
              typeof dim.dimension_key === "string"
            )
              levels[dim.dimension_key] = 2;
          }
        await rpc(reviewer, "scp_complete_human_review", {
          _review_id: r.review_id,
          _outcome: "upheld",
          _rationale: "SYNTETISK granskning av lokalt testsvar.",
          ...(r.finding_required ? { _safety_finding: "no_concern" } : {}),
          ...(Object.keys(levels).length ? { _rubric_levels: levels } : {}),
        });
      }
      expect(sql(`SELECT status FROM scp_attempts WHERE id='${attempt}'`)).toBe("scored");
      await rpc(ownerToken, "scp_release_attempt_report", { _attempt_id: attempt });
      const report = await rpc(candidateToken, "scp_participant_report", { _attempt_id: attempt });
      expect(report).toHaveLength(1);
      expect(Array.isArray(report[0].payload) && report[0].payload.length > 0).toBe(true);
      const employerReport = await rpc(ownerToken, "scp_employer_report", { _attempt_id: attempt });
      expect(employerReport).toHaveLength(1);
      expect(Array.isArray(employerReport[0].payload) && employerReport[0].payload.length > 0).toBe(
        true,
      );
      expect(await rpc(candidateToken, "scp_employer_report", { _attempt_id: attempt })).toEqual(
        [],
      );
      expect(
        sql(
          `SELECT count(*) FROM scp_competency_evidence e JOIN scp_candidate_responses r ON e.source_ref=r.id WHERE r.attempt_id='${attempt}'`,
        ),
      ).not.toBe("0");
      await candidate.goto(`${BASE}/academy/report/${attempt}`);
      await expect(candidate.getByRole("heading", { level: 1 })).toContainText(
        /Min bedömningsrapport|My assessment report/,
        { timeout: 60000 },
      );
      await shot(candidate, `${role}-${lang}-candidate-report`);
      await candidate.reload();
      await expect(candidate.getByRole("heading", { level: 1 })).toContainText(
        /Min bedömningsrapport|My assessment report/,
        { timeout: 60000 },
      );
      await candidate.locator('main a[href="/academy"]').first().focus();
      await candidate.locator('main a[href="/academy"]').first().press("Enter");
      await expect(candidate).toHaveURL(new RegExp("/academy$"));
      await owner.goto(`${BASE}/employer/${ORG}/assessments/results/${attempt}?application=${app}`);
      await expect(owner.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60000 });
      await expect(owner.locator("main")).toContainText(
        /underlag|evidence|observations|observationer/i,
      );
      await shot(owner, `${role}-${lang}-employer-report`);
      const outsiderCtx = await create(),
        outsiderToken = await account(outsiderCtx, "beskt-outsider@local.test", lang),
        outsider = await outsiderCtx.newPage();
      expect(await rpc(outsiderToken, "scp_participant_report", { _attempt_id: attempt })).toEqual(
        [],
      );
      expect(await rpc(outsiderToken, "scp_employer_report", { _attempt_id: attempt })).toEqual([]);
      await outsider.goto(`${BASE}/academy/report/${attempt}`);
      await expect(
        outsider.getByText(/Rapporten är inte tillgänglig|Report unavailable/),
      ).toBeVisible({ timeout: 60000 });
      await shot(outsider, `${role}-${lang}-denied`);
    } finally {
      for (const c of contexts) await c.close();
    }
  });
}
