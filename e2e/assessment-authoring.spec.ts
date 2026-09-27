/** Local-only proof using ordinary seeded users, real Auth/RLS and transport.
 * Failure injection removes one synthetic recipient's email, then restores it.
 * No production calls, mocked permissions, assigned-version rewrites or email provider.
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
const BASE = process.env.E2E_BASE_URL ?? "",
  DB = process.env.JOURNEY_DATABASE_URL ?? "";
test.skip(
  process.env.E2E_LOCAL_STACK !== "1" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE) ||
    !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/beskt_e2e$/.test(DB),
  "Isolated loopback stack only",
);
test.describe.configure({ mode: "serial", timeout: 120000 });
const ORG = "nordvakt-sakerhet",
  PREFIX = `/employer/${ORG}`;
const APP = "a6000000-0000-4000-8000-000000000001",
  APP2 = "a6000000-0000-4000-8000-000000000002";
const JOB = "44444444-dddd-4000-8000-000000000004";
function sql(q: string) {
  return execFileSync("psql", [DB, "-tAq", "-v", "ON_ERROR_STOP=1", "-c", q], {
    encoding: "utf8",
  }).trim();
}
async function login(page: Page, email: string, destination: string, lang = "sv") {
  await page.addInitScript((v) => localStorage.setItem("cqrityjob.lang", v), lang);
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill("LocalJourney!2026");
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `artifacts/assessment-authoring/${name}.png`, fullPage: true });
}
test("author previews, edits composition and creates a held version", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "one authoring mutation run");
  sql(`INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
   SELECT instance_id,'ad500000-0000-4000-8000-000000000001',aud,role,'assessment-author@local.test',encrypted_password,now(),raw_app_meta_data,'{}',now(),now(),'','','','','','','','' FROM auth.users WHERE email='beskt-recruiter@local.test' ON CONFLICT(id) DO NOTHING;
   INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) VALUES ('ad500000-0000-4000-8000-000000000001','ad500000-0000-4000-8000-000000000001','{"sub":"ad500000-0000-4000-8000-000000000001","email":"assessment-author@local.test","email_verified":true}','email',now(),now()) ON CONFLICT(provider,provider_id) DO NOTHING;
   INSERT INTO public.user_roles(user_id,role) VALUES('ad500000-0000-4000-8000-000000000001','admin') ON CONFLICT DO NOTHING;`);
  await login(page, "assessment-author@local.test", "/admin/assessments");
  const editor = page.getByTestId("recruitment-test-editor");
  const version = sql(
    "SELECT v.id FROM scp_assessment_versions v JOIN scp_assessment_definitions d ON d.id=v.definition_id WHERE d.slug='security-officer-recruitment' AND v.version_number=1",
  );
  await editor.getByRole("combobox").selectOption(version);
  await expect(editor.getByRole("checkbox")).toHaveCount(51);
  await editor.getByRole("checkbox").nth(1).uncheck();
  await editor
    .getByRole("textbox", { name: "Versionsanteckning" })
    .fill("Synthetic composition review: omit first question; retain original assigned version.");
  await editor.getByRole("button", { name: "Spara som ny utkastversion" }).click();
  await expect(editor.getByRole("status")).toContainText("Ny utkastversion sparad");
  await shot(page, "author-new-draft");
  expect(
    sql(
      "SELECT authoring_release_required FROM scp_assessment_versions WHERE notes LIKE 'Synthetic composition review:%' ORDER BY version_number DESC LIMIT 1",
    ),
  ).toBe("t");
});
