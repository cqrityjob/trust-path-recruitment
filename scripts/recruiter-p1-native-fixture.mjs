// Reuse the canonical fixture's inputs, not its synthetic Auth/Storage writes
// or SQL impersonation. All observed review outcomes use genuine HTTP sessions.
import {
  ACTORS,
  EMPLOYER,
  JOB,
  sha256,
  API,
  PDF_BYTES,
  appId,
} from "./recruiter-p1-native-contract.mjs";

export const SQL_HASH = "c47c13c3f11a44bfd2a883dc80391230581e2b0e1e7786c9aed691283bebad7e";
export const API_HASH = "b650ce6987192c88404cc65bca63bad4f23983fd711e2af7c89cb3327ae4b3a4";
export const BROWSER_HASH = "dc1e4e02f97e3116c553dc287d97360a99363f55e02fb0da7962a4c26acf72c4";
function pinned(source, expected) {
  if (sha256(source) !== expected) throw Error("P1_NATIVE_CANONICAL_SOURCE_CHANGED");
}
function span(source, from, to) {
  if (source.split(from).length !== 2 || source.split(to).length !== 2)
    throw Error("P1_NATIVE_CANONICAL_ANCHOR_CHANGED");
  return source.slice(source.indexOf(from), source.indexOf(to));
}
export function appFixtureSql(source, namespace, reset = false) {
  pinned(source, SQL_HASH);
  if (!/^ri-p1-[a-f0-9]{12}$/.test(namespace)) throw Error("P1_NATIVE_NAMESPACE_REQUIRED");
  let sql = span(
    source,
    "CREATE TEMP TABLE fixture AS SELECT",
    "CREATE TEMP TABLE rules AS SELECT",
  );
  const auth = span(sql, "INSERT INTO auth.users", "INSERT INTO public.user_roles");
  sql = sql.replace(auth, "");
  const storage = span(sql, "INSERT INTO storage.buckets", "-- Boolean originals:");
  sql = sql.replace(storage, "");
  // Native local fixture DML runs as its disposable database owner. These
  // setup writes are never claimed as authorization/session evidence.
  sql = sql.replace(/^SET LOCAL (?:ROLE|request\.jwt\.claim\.sub).*;\n|^RESET ROLE;\n/gm, "");
  // Without fabricated JWTs the setup has no platform-admin timestamp
  // privilege. Let the existing publication trigger stamp now().
  const publication =
    "UPDATE public.jobs SET status='published',published_at=now()-interval '1 day',expires_at=now()+interval '30 days'";
  if (sql.split(publication).length !== 2)
    throw Error("P1_NATIVE_CANONICAL_PUBLICATION_ANCHOR_CHANGED");
  sql = sql.replace(
    publication,
    "UPDATE public.jobs SET status='published',expires_at=now()+interval '30 days'",
  );
  const receipt = `INSERT INTO public.recruitment_settings(job_id,employer_id,responsible_user_id,receipt_enabled)
 SELECT job,employer,owner,false FROM fixture UNION ALL SELECT empty_job,employer,owner,false FROM fixture;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.recruitment_settings WHERE employer_id='${EMPLOYER}' AND receipt_enabled)
 THEN RAISE EXCEPTION 'P1_NATIVE_RECEIPTS_MUST_BE_OFF'; END IF; END $$;
`;
  sql = sql.replace(
    "INSERT INTO public.job_applications(",
    receipt + "INSERT INTO public.job_applications(",
  );
  if (reset) {
    const organisation = span(sql, "INSERT INTO public.user_roles", "INSERT INTO public.jobs(");
    sql = sql.replace(organisation, "");
  }
  const guard = `DO $$ BEGIN
 IF current_database()<>'postgres' OR NOT EXISTS(SELECT 1 FROM ri_p1_native_test.marker WHERE namespace='${namespace}')
 OR (SELECT count(*) FROM auth.users)<>104
 OR (SELECT count(*) FROM auth.users WHERE email LIKE '${namespace}-%@synthetic.invalid' AND email_confirmed_at IS NOT NULL)<>104
 THEN RAISE EXCEPTION 'P1_NATIVE_FIXTURE_SCOPE_REQUIRED'; END IF;
END $$;
`;
  const resetSql = reset
    ? `-- Only the two owned fixture jobs; no Auth/Storage/case/report deletion.
DO $$ BEGIN IF (SELECT count(*) FROM public.jobs WHERE employer_id='${EMPLOYER}')<>2
 OR (SELECT slug FROM public.employers WHERE id='${EMPLOYER}') IS DISTINCT FROM 'ri-p1-synthetic'
 THEN RAISE EXCEPTION 'P1_NATIVE_RESET_SCOPE_REQUIRED'; END IF; END $$;
DELETE FROM public.jobs WHERE employer_id='${EMPLOYER}' AND id IN('${JOB}','ee100000-2222-4000-8000-000000000002');
`
    : "";
  const result = `\\set ON_ERROR_STOP on\nBEGIN;\n${guard}${resetSql}${sql}COMMIT;\n`;
  if (
    /\b(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE)\s+(?:auth|storage)\./i.test(result) ||
    /SET LOCAL ROLE|request\.jwt/.test(result)
  )
    throw Error("P1_NATIVE_PRIVILEGED_SCHEMA_WRITE_REFUSED");
  return result;
}
export function profileRulesSql(source) {
  pinned(source, SQL_HASH);
  return span(source, "CREATE TEMP TABLE rules AS SELECT", "GRANT SELECT ON rules TO PUBLIC;")
    .replace("CREATE TEMP TABLE rules AS ", "")
    .replace(",fixture f WHERE r.job_id=f.job", ` WHERE r.job_id='${JOB}'`);
}
export function decisions(n, review) {
  return review.criteria.map((c) => {
    const pos = c.position;
    let state = c.state;
    let validUntil = null;
    let source;
    if (pos === 2) {
      source = review.availableSources.find((s) => s.kind === "application_cv");
      validUntil =
        n >= 31 && n <= 40 ? "2026-11-15" : n >= 61 && n <= 65 ? "2026-10-15" : "2027-11-01";
      state =
        !source || (n >= 76 && n <= 80) ? "clarify" : validUntil < "2026-11-01" ? "not_met" : "met";
      if (!source) validUntil = null;
    } else
      source = review.availableSources.find(
        (s) => s.kind === "application_answer" && s.reference === c.questionId,
      );
    if (pos === 3 && n >= 81 && n <= 85) state = "clarify";
    return {
      requirementId: c.requirementId,
      state,
      sourceKind: source?.kind ?? null,
      sourceReference: source?.reference ?? null,
      sourceVersion: source?.version ?? null,
      sourceLabel: source?.label ?? null,
      validUntil,
      note: `Synthetic human check A${n} R${pos}`,
      neutralQuestion: state === "clarify" ? `Vilket underlag kan klargöra R${pos}?` : null,
    };
  });
}
export async function createActors(admin, namespace, saveIntent) {
  if (!/^ri-p1-[a-f0-9]{12}$/.test(namespace)) throw Error("P1_NATIVE_NAMESPACE_REQUIRED");
  const state = {};
  for (const plan of ACTORS) {
    const actor = {
      ...plan,
      email: `${namespace}-${plan.alias}@synthetic.invalid`,
      password: `R!${(await import("node:crypto")).randomBytes(20).toString("hex")}`,
      status: "creation_intent",
    };
    state[plan.alias] = actor;
    saveIntent(state); // Unknown result means stop; never silently create a duplicate.
    let result;
    try {
      result = await admin.auth.admin.createUser({
        id: actor.id,
        email: actor.email,
        password: actor.password,
        email_confirm: true,
        user_metadata: { display_name: actor.displayName },
      });
    } catch {
      actor.status = "unknown_outcome";
      saveIntent(state);
      throw Error("P1_NATIVE_AUTH_CREATE_UNKNOWN");
    }
    if (
      result.error ||
      result.data.user?.id !== actor.id ||
      result.data.user.email !== actor.email ||
      !result.data.user.email_confirmed_at
    ) {
      actor.status = "unknown_outcome";
      saveIntent(state);
      throw Error("P1_NATIVE_AUTH_CREATE_IDENTITY_REFUSED");
    }
    actor.status = "created";
    saveIntent(state);
  }
  return state;
}

/** Keep every canonical assertion. Only replace the synthetic transport and
 * make the second concurrent reviewer the real, separate Bob admin session. */
export function nativeApiSource(source) {
  pinned(source, API_HASH);
  const tail = source.slice(source.indexOf("async function read("));
  if (!tail || tail.split('rpc("rec_ri_save_review", secondPayload)').length !== 2)
    throw Error("P1_NATIVE_API_TRANSPORT_ANCHOR_CHANGED");
  return (
    `import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
const connection = JSON.parse(fs.readFileSync(process.env.RI_P1_NATIVE_SESSIONS_FILE, "utf8"));
const base = ${JSON.stringify(API + "/rest/v1")};
const employer=${JSON.stringify(EMPLOYER)},job=${JSON.stringify(JOB)};
const owner=${JSON.stringify(ACTORS[0].id)},bob=${JSON.stringify(ACTORS[1].id)},member=${JSON.stringify(ACTORS[2].id)},stranger=${JSON.stringify(ACTORS[3].id)};
const app=(n)=>\`00000000-0000-4000-8000-\${String(n).padStart(12,"0")}\`;
function jwt(sub,role="authenticated") {
 const token=role==="anon"?connection.anonKey:connection.tokens[sub];
 if(!token)throw Error("P1_NATIVE_REAL_SESSION_REQUIRED"); return token;
}
async function rpc(name,data,sub=owner,role="authenticated") {
 const started=performance.now();
 const response=await fetch(\`\${base}/rpc/\${name}\`,{signal:AbortSignal.timeout(8000),method:"POST",
 headers:{apikey:connection.anonKey,Authorization:\`Bearer \${jwt(sub,role)}\`,"Content-Type":"application/json"},body:JSON.stringify(data)});
 return {status:response.status,body:await response.json(),elapsedMs:performance.now()-started};
}
` +
    tail
      .replace(
        'rpc("rec_ri_save_review", secondPayload)',
        'rpc("rec_ri_save_review", secondPayload, bob)',
      )
      .replace(
        'rpc("rec_ri_save_review", winningIndex === 0 ? payload : secondPayload)',
        'rpc("rec_ri_save_review", winningIndex === 0 ? payload : secondPayload, winningIndex === 0 ? owner : bob)',
      )
      .replace(
        "headers: { Authorization: `Bearer ${jwt(owner)}` },",
        "headers: { apikey: connection.anonKey, Authorization: `Bearer ${jwt(owner)}` },",
      )
      .replace('"executed-local-postgrest-api"', '"executed-native-gotrue-postgrest-api"')
  );
}
export function nativeBrowserSource(source) {
  pinned(source, BROWSER_HASH);
  // Its explicit browser.newContext calls bypass Playwright's use defaults;
  // add the public gateway key there, leaving every test/assertion unchanged.
  const adapted = source.replace(
    /browser\.newContext\(\{/g,
    "browser.newContext({ extraHTTPHeaders: { apikey: process.env.E2E_RI_NATIVE_ANON_KEY! },",
  );
  const anchor =
    '        await capture(page, `${lang}-${mobile ? "emulated-375" : "desktop"}-remaining`);';
  if (adapted.split(anchor).length !== 2) throw Error("P1_NATIVE_BROWSER_ORIGINAL_ANCHOR_CHANGED");
  // Four original-file opens through the actual application server signer,
  // one for each existing locale/viewport pair. No signed URL is published.
  return adapted.replace(
    anchor,
    anchor +
      `
        await page.goto(\`/employer/\${SLUG}/applications/${appId(1)}\`);
        await expect(page.getByTestId("requirement-review")).toBeVisible();
        const [original] = await Promise.all([
          context.waitForEvent("response", {
            predicate: (r) => r.url().startsWith(API + "/storage/v1/object/sign/job-application-cvs/") && r.status() === 200,
          }),
          page.getByTestId("requirement-review").getByRole("button", {
            name: lang === "sv" ? "Öppna inskickat originaldokument" : "Open submitted original document",
          }).click(),
        ]);
        const bytes = await page.request.get(original.url());
        expect(bytes.ok()).toBe(true);
        expect((await bytes.body()).toString("base64")).toBe(${JSON.stringify(PDF_BYTES.toString("base64"))});
`,
  );
}
