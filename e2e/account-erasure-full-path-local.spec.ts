/**
 * Account erasure, the WHOLE call path, on the disposable local stack:
 *
 *   the browser (admin console, real UI)
 *     -> the application's server function (adminDeleteUser, real)
 *       -> PostgREST (real) -> admin_delete_user_if_safe (real, migration 20270208090000)
 *         -> the candidate's rows, in the database
 *       -> the storage erasure sweep (the application's code, real)
 *
 * with a SYNTHETIC candidate whose Security Passport holds what #416 had to
 * learn to erase: a credential's details and a reading of an uploaded document.
 *
 * What is substituted, and said so: GoTrue (scripts/local-stack/auth-gateway.mjs
 * signs the JWT; this spec writes the auth.sessions row real GoTrue would have
 * written at sign-in) and Supabase Storage (the stack has none, so the sweep's
 * HTTP call to delete the uploaded file cannot succeed here and the object stays
 * QUEUED, which is the documented behaviour). The Storage leg is therefore NOT
 * verified by this spec; it is the first step of the owner's production test.
 *
 * Opt-in only: ERASURE_FULL_PATH_LOCAL=1, a loopback E2E_BASE_URL, and a
 * database named beskt_e2e. Load the fixture first:
 *   psql -d beskt_e2e -f scripts/local-stack/erasure-fixture.sql
 */
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.ERASURE_FULL_PATH_LOCAL !== "1",
  "Explicit disposable local-stack opt-in required (ERASURE_FULL_PATH_LOCAL=1)",
);

const ADMIN = "erasure-admin@local.test";
const ADMIN_ID = "e5a00000-0000-4000-8000-0000000000aa";
const HOLDER = "erasure-holder@local.test";
const HOLDER_ID = "e5a00000-0000-4000-8000-000000000001";
const PASSWORD = "LocalJourney!2026";

function sql(query: string): string {
  const url = process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/beskt_e2e";
  if (
    !/^postgresql:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(url) ||
    !url.endsWith("/beskt_e2e")
  ) {
    throw new Error("REFUSED: the database is not the disposable local beskt_e2e on loopback");
  }
  return execFileSync("psql", [url, "-Atq", "-c", query], { encoding: "utf8" }).trim();
}

async function signInAsAdmin(page: Page, destination: string): Promise<void> {
  await page.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  const field = page.getByLabel(/^e-?post$|^email$/i);
  await field.waitFor({ state: "visible", timeout: 120_000 });
  await field.fill(ADMIN);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

/** Real GoTrue writes the session row at sign-in; the local gateway only signs the JWT. */
async function recordSession(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) ?? "";
      if (/^sb-.*-auth-token$/.test(key)) {
        return (
          (JSON.parse(localStorage.getItem(key) ?? "{}") as { access_token?: string })
            .access_token ?? ""
        );
      }
    }
    return "";
  });
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
    sub: string;
    session_id: string;
  };
  expect(claims.sub).toBe(ADMIN_ID);
  sql(
    `insert into auth.sessions (id, user_id) values ('${claims.session_id}', '${ADMIN_ID}') on conflict (id) do nothing`,
  );
  return claims.session_id;
}

test("a superadmin erases a candidate with credential details and a document reading, through the real UI", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const base = process.env.E2E_BASE_URL ?? "";
  expect(base).toMatch(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/);

  // ── the state before ────────────────────────────────────────────────────
  const before = sql(`select
      (select count(*) from auth.users where id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.sp_claims where holder_user_id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.sp_credential_details d join public.sp_claims c on c.id = d.claim_id where c.holder_user_id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.sp_evidence where holder_user_id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.sp_evidence_extractions x join public.sp_evidence e on e.id = x.evidence_id where e.holder_user_id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.beta_feedback where user_id = '${HOLDER_ID}')`);
  expect(before, "account,claims,details,evidence,readings,feedback — load the fixture first").toBe(
    "1,1,1,1,1,1",
  );

  // ── the browser: sign in as the superadmin and open the candidate ───────
  await signInAsAdmin(page, `/admin/users/${HOLDER_ID}`);
  await recordSession(page);
  await page.goto(`/admin/users/${HOLDER_ID}`);
  const open = page.getByRole("button", { name: "Delete this account permanently" });
  await expect(open).toBeEnabled({ timeout: 60_000 });
  await open.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The impact preview is the database's own answer about what goes.
  await expect(dialog).toContainText(/Impact/);
  await dialog
    .locator("#danger-reason")
    .fill("Full-path evidence: synthetic candidate with Passport documents");
  await dialog.locator("#danger-confirm").fill(HOLDER);
  await dialog.getByRole("button", { name: "Confirm" }).click();

  // The page leaves the person and returns to the list. With no Storage service
  // on this stack, the uploaded file is owed and the list says so.
  await page.waitForURL((u) => u.pathname === "/admin/users", { timeout: 60_000 });
  const owed = new URL(page.url()).searchParams.get("storageOwed");

  // ── the state after ─────────────────────────────────────────────────────
  // A candidate with history is erased to a TOMBSTONE: the Auth row survives so that
  // retained records keep their foreign keys, but it holds no address, no identity
  // and no profile (the "erasure" form of admin_delete_user_if_safe).
  const after = sql(`select
      (select email from auth.users where id = '${HOLDER_ID}')
    || ',' || (select count(*) from auth.identities where user_id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.profiles where id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.sp_claims where holder_user_id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.sp_credential_details where claim_id = 'e5a0c000-0000-4000-8000-000000000001')
    || ',' || (select count(*) from public.sp_evidence where holder_user_id = '${HOLDER_ID}')
    || ',' || (select count(*) from public.sp_evidence_extractions where evidence_id = 'e5a0e000-0000-4000-8000-000000000001')
    || ',' || (select count(*) from public.deleted_accounts where user_id = '${HOLDER_ID}')`);
  expect(
    after,
    "tombstone address, identities, profile, claims, credential details, evidence, document readings, tombstone record",
  ).toBe(`raderad+${HOLDER_ID}@removed.invalid,0,0,0,0,0,0,1`);

  // The feedback survives, linked only to the identity-free tombstone, and follows its own 12-month row.
  expect(
    sql(
      `select count(*) from public.beta_feedback where id = 'e5a0f000-0000-4000-8000-000000000001'`,
    ),
  ).toBe("1");

  // The audit trail names the administrator and the reason. FINDING: it also keeps
  // the erased person's e-mail address in its metadata (user_deleted), which is why
  // the retention of audit logs is the owner's decision and the policy must say it.
  const audit = sql(
    `select count(*) || '|' || coalesce(bool_or(metadata ->> 'email' = '${HOLDER}')::text, 'false')
       from public.audit_logs
      where actor_id = '${ADMIN_ID}' and action = 'user_deleted' and subject_id = '${HOLDER_ID}'
        and metadata ->> 'reason' like 'Full-path evidence%'`,
  );
  console.log(`audit rows | the erased e-mail address is kept in the audit row: ${audit}`);
  expect(Number(audit.split("|")[0]), "an audit row for the erasure").toBe(1);

  // The owed Storage object: queued, not lost.
  const queued = sql(
    `select count(*) from public.storage_erasure_queue where subject_user_id = '${HOLDER_ID}'`,
  );
  console.log(
    `storage objects queued: ${queued}; owed after the sweep (list banner): ${owed ?? "0"}`,
  );
  expect(Number(queued)).toBeGreaterThanOrEqual(1);
});
