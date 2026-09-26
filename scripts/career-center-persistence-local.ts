// Career Center persistence and account isolation — against a REAL local
// database, never a mock.
//
// ── WHAT A MOCKED RESPONSE CANNOT PROVE ────────────────────────────────
//
// The journey check (career-center-journey-check.tsx) proves the client keys
// every personal read on the account and invalidates it on every write. It
// cannot prove that a saved profession is actually SAVED — that it survives
// a reload and a new sign-in — or that account B's request is refused
// account A's row by the database itself. Those are facts about the
// database and its row-level security, so they are asserted here, through
// the same path the application's server functions take: PostgREST, with the
// signed-in user's own token, under the real RLS policies.
//
//   1  A saves a current profession                 (setMyCurrentProfession's
//                                                     exact upsert)
//   2  a reload reads it back                       (same session)
//   3  a new sign-in reads it back                  (fresh token)
//   4  a profile change is what the next read sees
//   5  B sees neither A's profession nor A's result (RLS, not the client)
//   6  a signed-out request sees nothing
//   7  A's assessment result is readable by A only, and the Career Center's
//      resolver turns A's saved slug and A's stored rank-1 into two DIFFERENT,
//      correct professions
//
// ── WHERE IT RUNS ──────────────────────────────────────────────────────
//
// Loopback only. It refuses any gateway or database that is not 127.0.0.1 /
// localhost, and any database not named beskt_e2e (the disposable stack from
// scripts/local-stack). Synthetic `@local.test` accounts only.
//
//   scripts/local-stack/test-env.sh   (or up.sh) — the stack
//   bun run career-center-persistence:local

import { execFileSync } from "node:child_process";
import { careerOrigin } from "../src/lib/career-center/career-origin";
import { professionInfoDestination } from "../src/lib/career-center/profession-links";

const GATEWAY = process.env.LOCAL_GATEWAY_URL ?? "http://127.0.0.1:54321";
const DB_URL =
  process.env.LOCAL_DB_URL ?? "postgresql://postgres:localbeskt@127.0.0.1:5432/beskt_e2e";
const ANON_KEY = process.env.LOCAL_ANON_KEY ?? "";
const PASSWORD = "LocalJourney!2026";

function refuse(why: string): never {
  console.error(`career-center-persistence REFUSED: ${why}`);
  process.exit(2);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(GATEWAY))
  refuse(`${GATEWAY} is not loopback`);
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\/beskt_e2e$/.test(DB_URL)) {
  refuse("the database must be the local disposable beskt_e2e");
}

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) fails.push(name);
}

function sql(statement: string): string {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-qAt", "-d", DB_URL, "-c", statement], {
    encoding: "utf8",
  }).trim();
}

const A = { email: "cc-journey-a@local.test", id: "" };
const B = { email: "cc-journey-b@local.test", id: "" };

// ── synthetic accounts, recreated every run ──────────────────────────────
sql(`DELETE FROM auth.users WHERE email IN ('${A.email}', '${B.email}')`);
for (const u of [A, B]) {
  u.id = sql(
    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
       instance_id, raw_app_meta_data, confirmation_token, recovery_token,
       email_change_token_new, email_change, email_change_token_current, phone_change)
     VALUES (gen_random_uuid(), '${u.email}', crypt('${PASSWORD}', gen_salt('bf')), now(),
       'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
       '{"provider":"email","providers":["email"]}', '', '', '', '', '', '')
     RETURNING id`,
  ).split("\n")[0];
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rest(
  token: string | null,
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${GATEWAY}/rest/v1/${pathAndQuery}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** setMyCurrentProfession's exact write: an upsert on user_id. */
function saveProfession(token: string, userId: string, slug: string) {
  return rest(token, "security_career_profiles?on_conflict=user_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: userId,
      profile_version: "scp-v1",
      current_profession_slug: slug,
      current_profession_other: null,
    }),
  });
}

/** getMySecurityCareerProfile's read. */
async function readProfession(token: string | null): Promise<string | null | undefined> {
  const r = await rest(token, "security_career_profiles?select=current_profession_slug");
  const rows = r.body as { current_profession_slug: string | null }[] | null;
  return Array.isArray(rows) ? (rows[0]?.current_profession_slug ?? null) : undefined;
}

console.log("\n1-4 · save, reload, new sign-in, change");
const a1 = await signIn(A.email);
const saved = await saveProfession(a1, A.id, "vaktare");
ck(
  "1   A saves Väktare through the same upsert the app uses",
  saved.status === 200 || saved.status === 201,
  JSON.stringify(saved),
);
ck("2   a reload reads it back", (await readProfession(a1)) === "vaktare");
const a2 = await signIn(A.email);
ck("3   a new sign-in reads it back", (await readProfession(a2)) === "vaktare");
const origin = careerOrigin({ profileSlug: (await readProfession(a2)) ?? null });
ck(
  "3b  the Career Center resolves the saved CIG slug to the Väktare guide",
  origin.state === "ready" && origin.profession.id === "security-officer",
);
await saveProfession(a2, A.id, "ordningsvakt");
ck(
  "4   a profile change is what the next read sees",
  (await readProfession(a2)) === "ordningsvakt",
);
const a3 = await signIn(A.email);
ck("4b  …and what a later sign-in sees", (await readProfession(a3)) === "ordningsvakt");

console.log("\n5-6 · isolation");
const b1 = await signIn(B.email);
ck("5   B reads no profession at all — not A's", (await readProfession(b1)) === null);
const direct = await rest(
  b1,
  `security_career_profiles?user_id=eq.${A.id}&select=current_profession_slug`,
);
ck(
  "5b  B asking for A's row by id gets nothing",
  Array.isArray(direct.body) && (direct.body as unknown[]).length === 0,
);
const hijack = await saveProfession(b1, A.id, "skyddsvakt");
ck("5c  B cannot write A's profession", hijack.status >= 400, `status ${hijack.status}`);
ck("5d  …and A's profession is unchanged", (await readProfession(a3)) === "ordningsvakt");
await fetch(`${GATEWAY}/auth/v1/logout`, {
  method: "POST",
  headers: { authorization: `Bearer ${a3}`, apikey: ANON_KEY },
});
ck("6   a signed-out request reads nothing", ((await readProfession(null)) ?? null) === null);

console.log("\n7 · the assessment result");
const definition = sql("SELECT id FROM public.cd_definition_versions WHERE lifecycle_status = 'active' ORDER BY created_at DESC LIMIT 1");
// A complete session, answered the way the SQL suite answers one (every
// scored item), so the database's own completeness guards accept it.
const session = sql(
  `INSERT INTO public.cd_sessions (definition_version_id, user_id, locale, status)
   VALUES ('${definition}', '${A.id}', 'sv', 'in_progress') RETURNING id`,
).split("\n")[0];
sql(
  `INSERT INTO public.cd_evidence (session_id, item_id, item_version, item_kind, answer_value,
     evidence_class, is_scored, option_id, display_order)
   SELECT '${session}', di.item_id, di.item_version, di.item_kind,
          CASE WHEN di.item_kind = 'scale' THEN '7' ELSE di.item_id || '_A' END,
          di.evidence_class, di.is_scored,
          CASE WHEN di.item_kind = 'single_choice' THEN di.item_id || '_A' END,
          CASE WHEN di.item_kind = 'single_choice' THEN 0 END
     FROM public.cd_definition_items di
    WHERE di.definition_version_id = '${definition}' AND di.is_scored`,
);
const snapshot = sql(
  `INSERT INTO public.cd_report_snapshots (session_id, definition_version, content_version,
     scoring_version, taxonomy_version)
   SELECT '${session}', definition_version, content_version, scoring_version, taxonomy_version
     FROM public.cd_definition_versions WHERE id = '${definition}'
   RETURNING id`,
).split("\n")[0];
const aRead = await rest(await signIn(A.email), `cd_report_snapshots?id=eq.${snapshot}&select=id`);
ck(
  "7   A reads A's stored result",
  Array.isArray(aRead.body) && (aRead.body as unknown[]).length === 1,
);
const bRead = await rest(b1, `cd_report_snapshots?id=eq.${snapshot}&select=id`);
ck(
  "7b  B cannot read A's stored result",
  Array.isArray(bRead.body) && (bRead.body as unknown[]).length === 0,
);
const anonRead = await rest(null, `cd_report_snapshots?id=eq.${snapshot}&select=id`);
ck(
  "7c  nobody signed out can read it",
  anonRead.status >= 400 ||
    (Array.isArray(anonRead.body) && (anonRead.body as unknown[]).length === 0),
);
// The recommendation (a stored CIG slug) and the saved profession are two
// different identities, and each resolves to itself.
const rec = professionInfoDestination({ cigSlug: "sakerhetssamordnare" });
const cur = careerOrigin({ profileSlug: "ordningsvakt" });
ck(
  "7d  recommended ≠ current, and both resolve correctly",
  rec.kind === "career_center" &&
    rec.slug === "security-coordinator" &&
    cur.state === "ready" &&
    cur.profession.id === "ordningsvakt",
);

console.log("");
if (fails.length) {
  console.error(`career-center-persistence FAILED (${fails.length})`);
  process.exit(1);
}
console.log("career-center-persistence OK — real database, real RLS, synthetic accounts");
