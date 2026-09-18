/** The add-credential wizard against REAL GoTrue + PostgREST, one journey per
 *  FORM CONTRACT. No response is substituted anywhere: a "saved" here is a row
 *  that survives a reload and that the database hands back.
 *
 *    1. international certification   — found by ABBREVIATION, no country
 *    2. Swedish training (VU1)         — issuer stated on the certificate
 *    3. regulated authorisation (SV)   — REQUIRED scope
 *    4. UK licence (pilot)             — region filter keeps the GB-wide licence
 *    5. scoped Dubai card (pilot)      — region + REQUIRED company
 *
 *  ROUTE A (owner decision 2026-09-18): NOTHING is approved here, temporarily or
 *  otherwise. A GB or Dubai definition is reached exactly as a real pilot tester
 *  reaches it — through a valid membership of the definition's own pilot market —
 *  and every one of them keeps is_active = false, which afterAll asserts.
 *  Run scripts/passport-live-local-check.mjs first; opt in with
 *  PASSPORT_LIVE_LOCAL=1 and E2E_BASE_URL=https://127.0.0.1:3120.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

test.skip(
  process.env.PASSPORT_LIVE_LOCAL !== "1",
  "Explicit disposable local-stack opt-in required",
);
test.use({ ignoreHTTPSErrors: true, actionTimeout: 15_000 });
test.describe.configure({ mode: "serial" });

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const sql = (text: string) =>
  execFileSync("psql", [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", text], {
    encoding: "utf8",
  }).trim();

function env() {
  const values = Object.fromEntries(
    readFileSync("/private/tmp/passport-phase2-status.env", "utf8")
      .split("\n")
      .filter((v) => v.includes("="))
      .map((v) => {
        const i = v.indexOf("=");
        return [v.slice(0, i), JSON.parse(v.slice(i + 1)) as string];
      }),
  );
  if (values.API_URL !== "http://127.0.0.1:55421") throw new Error("LOCAL_ISOLATION");
  return values as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
}

interface Holder {
  id: string;
  session: Session;
  db: SupabaseClient;
}

async function holder(
  tag: string,
  country: string,
  region: string | null,
  pilot: string | null,
): Promise<Holder> {
  const e = env();
  const admin = createClient(e.API_URL, e.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = `passport-catalogue-${tag}-${Date.now()}@fixture.invalid`;
  const password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("user: " + created.error?.message);
  const db = createClient(e.API_URL, e.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await db.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error("sign-in: " + signed.error?.message);
  const profile = await db.from("sp_passport_profiles").insert({
    holder_user_id: created.data.user.id,
    jurisdiction_code: country,
    sub_jurisdiction_code: region,
    work_location_confirmed_at: new Date().toISOString(),
  });
  if (profile.error) throw new Error("profile: " + profile.error.message);
  if (pilot)
    sql(
      `insert into public.sp_pilot_members (user_id, market_pack_code, note) values ('${created.data.user.id}', '${pilot}', 'catalogue browser journey') on conflict do nothing`,
    );
  return { id: created.data.user.id, session: signed.data.session, db };
}

async function openWizard(page: Page, who: Holder) {
  const base = process.env.E2E_BASE_URL;
  expect(base).toBe("https://127.0.0.1:3120");
  await page.addInitScript((session) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    localStorage.setItem("cqrityjob.lang", "en");
  }, who.session);
  // Reject unexpected external transport; never substitute a response.
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") return route.abort();
    return route.continue();
  });
  await page.goto(`${base}/passport/credentials/new`);
  await expect(page.locator("[data-international-credential-form]")).toBeVisible({
    timeout: 30_000,
  });
}

const next = (page: Page) => page.getByRole("button", { name: "Continue", exact: true }).click();

/** Save, land on the entry, RELOAD, and return the claim id from the URL. */
async function saveAndReload(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await page.waitForURL(/\/passport\/entry\/claim\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const id = page.url().match(/claim\/([0-9a-f-]{36})/)![1];
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  return id;
}

const activePilotDefinitions = () =>
  sql(
    "select count(*) from public.sp_credential_types where market_pack_code in ('GB','GB-NI','AE-DU','AE-AZ') and is_active",
  );
test.beforeAll(() => {
  expect(activePilotDefinitions()).toBe("0");
});
test.afterAll(() => {
  expect(activePilotDefinitions()).toBe("0");
});

test("1 · international: found by abbreviation, saved with no country, survives reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const who = await holder("intl", "SE", null, null);
  await openWizard(page, who);
  await next(page); // scope: international is the default
  await expect(page.locator("[data-filter-count]")).toContainText("of 14 credentials");
  // No optional filter is pre-selected.
  for (const f of ["domain", "category", "organisation"])
    await expect(page.locator(`[data-filter="${f}"]`)).toHaveValue("");
  await expect(page.locator('[data-filter="region"]')).toHaveCount(0);
  await next(page);
  await page.locator('[data-filter="search"]').fill("cpp");
  await expect(page.locator("[data-filter-count]").last()).toContainText("Showing 1 of 14");
  await page.getByLabel("Approved credential").selectOption("INTL_ASIS_CPP");
  await next(page);
  await expect(page.locator("[data-credential-territory]")).toContainText("no country");
  await expect(page.locator('[data-field="authorisation-scope"]')).toHaveCount(0);
  await expect(page.locator('[data-field="issuer-name"]')).toHaveCount(0);
  await next(page);
  const id = await saveAndReload(page);
  const row = await who.db.from("sp_claims").select("*").eq("id", id).single();
  expect(row.data?.credential_code).toBe("INTL_ASIS_CPP");
  expect(row.data?.jurisdiction_code).toBeNull(); // did NOT inherit the holder's Sweden
  expect(row.data?.claimed_issuer_name).toBe("ASIS International");
  await expect(page.locator("main")).toContainText("Certified Protection Professional");
});

test("2 · Swedish training: filters work together, the provider on the certificate is required", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const who = await holder("se-training", "SE", null, null);
  await openWizard(page, who);
  await page.getByText("National or regional").click();
  await next(page);
  const country = page.locator('[data-filter="country"]');
  await country.selectOption("SE");
  await expect(page.locator("[data-filter-count]")).toContainText("Showing 8 of 8");
  // Sweden has no regional credential: the region control is not offered.
  await expect(page.locator('[data-filter="region"]')).toHaveCount(0);
  // An organisation narrows, with a count, and can be cleared again.
  const organisation = page.locator('[data-filter="organisation"]');
  await organisation.selectOption({ label: "Länsstyrelsen (2)" });
  await expect(page.locator("[data-filter-count]")).toContainText("Showing 2 of 8");
  await page.locator("[data-clear-filters]").click();
  await expect(organisation).toHaveValue("");
  await expect(page.locator("[data-filter-count]")).toContainText("Showing 8 of 8");
  // A stale organisation cannot survive a change of country: Sweden's
  // Länsstyrelsen does not exist in the international catalogue.
  await organisation.selectOption({ label: "Länsstyrelsen (2)" });
  await next(page);
  await page.locator('[data-filter="search"]').fill("vu1");
  await expect(page.locator("[data-filter-count]").last()).toContainText("Showing 0 of 8");
  await page.locator("[data-clear-filters]").last().click();
  await page.locator('[data-filter="search"]').fill("vu1");
  await expect(page.locator("[data-filter-count]").last()).toContainText("Showing 1 of 8");
  await page.getByLabel("Approved credential").selectOption("VU1");
  await next(page);
  // The regulator is named as the regulator, and nobody as the trainer.
  const roles = page.locator("[data-credential-roles]");
  await expect(roles).toContainText("Regulator");
  await expect(roles).toContainText("Polismyndigheten");
  await expect(roles).toContainText("stated on the certificate");
  const issuer = page.locator('[data-field="issuer-name"]');
  await expect(issuer).toBeVisible();
  await expect(page.locator('[data-field="authorisation-scope"]')).toHaveCount(0);
  await issuer.fill("Fiktiv Väktarskola AB");
  await next(page);
  await expect(page.locator("main")).toContainText("Fiktiv Väktarskola AB");
  const id = await saveAndReload(page);
  const row = await who.db.from("sp_claims").select("*").eq("id", id).single();
  expect(row.data?.credential_code).toBe("VU1");
  expect(row.data?.claimed_issuer_name).toBe("Fiktiv Väktarskola AB");
  expect(row.data?.jurisdiction_code).toBe("SE");
  expect(row.data?.authorisation_scope).toBeNull();
  await expect(page.locator("main")).toContainText("Fiktiv Väktarskola AB");
});

test("3 · regulated authorisation (SV): the scope is required, saved and shown to its holder", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const who = await holder("se-sv", "SE", null, null);
  await openWizard(page, who);
  await page.getByText("National or regional").click();
  await next(page);
  await page.locator('[data-filter="country"]').selectOption("SE");
  await next(page);
  await page.locator('[data-filter="search"]').fill("skyddsvakt");
  await page.getByLabel("Approved credential").selectOption("SV");
  await next(page);
  const scope = page.locator('[data-field="authorisation-scope"]');
  await expect(scope).toBeVisible();
  await expect(scope).toHaveAttribute("required", "");
  await expect(page.locator('[data-field="issuer-name"]')).toHaveCount(0);
  await scope.fill("Skyddsobjekt: Fiktiva hamnen");
  await page.getByLabel("Valid until").fill("2029-12-31");
  await next(page);
  const id = await saveAndReload(page);
  const row = await who.db.from("sp_claims").select("*").eq("id", id).single();
  expect(row.data?.credential_code).toBe("SV");
  expect(row.data?.authorisation_scope).toBe("Skyddsobjekt: Fiktiva hamnen");
  expect(row.data?.claimed_issuer_name).toBe("Länsstyrelsen");
  await expect(page.locator("main")).toContainText("Skyddsobjekt: Fiktiva hamnen");
  // The database itself refuses the same credential without its scope.
  const bare = await who.db.rpc("sp_save_international_credential", {
    _input: {
      definition_code: "SV",
      market_country: "SE",
      market_region: "",
      identifier: "",
      issued_on: "2024-05-01",
      valid_until: "2029-12-31",
      no_expiry: false,
    },
  });
  expect(bare.error?.message ?? "").toContain("SP_CREDENTIAL_REQUIRES_SCOPE");
});

test("4 · UK licence (pilot): the Northern Ireland filter keeps the GB-wide licence", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const who = await holder("gb", "GB", null, "GB");
  // A GB member is not a GB-NI member: they see the GB-wide licence only.
  await openWizard(page, who);
  await page.getByText("National or regional").click();
  await next(page);
  await page.locator('[data-filter="country"]').selectOption("GB");
  // All 13 GB pilot definitions, none of them approved for the public; the one
  // Northern Ireland licence belongs to its own pack and is not offered here.
  await expect(page.locator("[data-filter-count]")).toContainText("Showing 13 of 13");
  await expect(page.locator('[data-filter="region"]')).toHaveCount(0);
  await next(page);
  await page.getByLabel("Approved credential").selectOption("UK_SIA_LICENCE_DS");
  await next(page);
  await expect(page.locator("[data-credential-territory]")).toContainText("United Kingdom");
  await page.getByLabel("Valid until").fill("2028-06-30");
  await next(page);
  const id = await saveAndReload(page);
  const row = await who.db.from("sp_claims").select("*").eq("id", id).single();
  expect(row.data?.credential_code).toBe("UK_SIA_LICENCE_DS");
  expect(row.data?.jurisdiction_code).toBe("GB");
  expect(row.data?.sub_jurisdiction_code).toBeNull();
  expect(row.data?.claimed_issuer_name).toBe("Security Industry Authority");
  // A holder with NO entitlement is offered nothing in Great Britain.
  const outsider = await holder("gb-outsider", "SE", null, null);
  const seen = await outsider.db
    .from("sp_approved_credential_catalogue")
    .select("code")
    .eq("country", "GB");
  expect(seen.data?.length).toBe(0);
});

test("5 · scoped Dubai card (pilot): region filter, required company, Dubai kept after reload", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const who = await holder("du", "AE", "AE-DU", "AE-DU");
  await openWizard(page, who);
  await page.getByText("National or regional").click();
  await next(page);
  await page.locator('[data-filter="country"]').selectOption("AE");
  const region = page.locator('[data-filter="region"]');
  await expect(region).toBeVisible();
  await expect(region).toHaveValue(""); // an optional SEARCH filter, not pre-selected
  await region.selectOption("AE-DU");
  await expect(page.locator("[data-filter-count]")).toContainText("Showing 30 of 30");
  await next(page);
  await page.getByLabel("Approved credential").selectOption("AE_DU_SIRA_CARD_GUARD");
  await next(page);
  // The credential's OWN territory is fixed by the definition, not by the filter.
  await expect(page.locator("[data-credential-territory]")).toContainText("Dubai");
  const scope = page.locator('[data-field="authorisation-scope"]');
  await expect(scope).toBeVisible();
  await page.getByLabel("Valid until").fill("2028-01-31");
  // Without the company the form does not advance past the required field.
  await next(page);
  await expect(scope).toBeVisible();
  await scope.fill("Fiktivt Security LLC");
  await next(page);
  const id = await saveAndReload(page);
  const row = await who.db.from("sp_claims").select("*").eq("id", id).single();
  expect(row.data?.credential_code).toBe("AE_DU_SIRA_CARD_GUARD");
  expect(row.data?.jurisdiction_code).toBe("AE");
  expect(row.data?.sub_jurisdiction_code).toBe("AE-DU");
  expect(row.data?.authorisation_scope).toBe("Fiktivt Security LLC");
  expect(row.data?.claimed_issuer_name).toBe("Security Industry Regulatory Agency");
  await expect(page.locator("main")).toContainText("Fiktivt Security LLC");
});

test("6 · admin: the catalogue page says WHY each researched definition is or is not selectable", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const admin = await holder("admin", "SE", null, null);
  sql(
    `insert into public.user_roles (user_id, role) values ('${admin.id}', 'admin') on conflict do nothing`,
  );
  {
    const base = process.env.E2E_BASE_URL;
    await page.addInitScript((session) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
      localStorage.setItem("cqrityjob.lang", "en");
    }, admin.session);
    await page.goto(`${base}/admin/passport-catalogue`);
    const root = page.locator("[data-admin-passport-catalogue]");
    await expect(root.locator("[data-catalogue-counts]")).toBeVisible({ timeout: 30_000 });
    // 14 international + 8 Swedish are selectable by everyone; all 44 GB, NI and
    // Dubai definitions by their own market's pilot members; Abu Dhabi is closed.
    await expect(root.locator('[data-count="selectable"]')).toHaveText("22");
    await expect(root.locator('[data-count="selectable_pilot_members"]')).toHaveText("44");
    await expect(root.locator('[data-count="awaiting_definition_approval"]')).toHaveText("0");
    await expect(root.locator('[data-count="market_closed"]')).toHaveText("7");
    await expect(root.locator('[data-count="blocked"]')).toHaveText("0");
    const vu1 = root.locator('[data-catalogue-row="VU1"]');
    await expect(vu1).toContainText("Polismyndigheten");
    await expect(vu1).toContainText("stated on the certificate");
    await expect(vu1.locator("[data-availability]")).toHaveAttribute(
      "data-availability",
      "selectable",
    );
    const card = root.locator('[data-catalogue-row="AE_DU_SIRA_CARD_GUARD"]');
    await expect(card).toContainText("holder states the scope");
    await expect(card.locator("[data-availability]")).toHaveAttribute(
      "data-availability",
      "selectable_pilot_members",
    );
    await expect(card).toContainText("Authorised by the owner for the internal pilot");
    await expect(card).toContainText("not approved for the public");
    await expect(card).toContainText("named pilot members only");
    await expect(card).toContainText("sira.gov.ae");
    await expect(root.locator('[data-catalogue-row="AE_AZ_PSBD_LICENCE_GUARD"]')).toContainText(
      "neither active nor in internal pilot",
    );
  }
});

test("6b · a holder who is not an administrator cannot read the diagnosis", async ({ page }) => {
  test.setTimeout(90_000);
  const who = await holder("not-admin", "SE", null, null);
  const base = process.env.E2E_BASE_URL;
  await page.addInitScript((session) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  }, who.session);
  await page.goto(`${base}/admin/passport-catalogue`);
  await expect(page.locator("[data-catalogue-counts]")).toHaveCount(0);
  await page.waitForTimeout(3000);
  await expect(page.locator("[data-catalogue-row]")).toHaveCount(0);
});
