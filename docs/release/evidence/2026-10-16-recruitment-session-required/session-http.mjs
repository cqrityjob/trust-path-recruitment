// The PostgREST half of the e2e session test, against REAL GoTrue + PostgREST
// on loopback (the app half needs the dev server, which CI runs).
// usage: ANON_KEY=.. SERVICE_ROLE_KEY=.. node session-http.mjs  -> exit 0 = every assertion held
import { execFileSync } from "node:child_process";
const API = "http://127.0.0.1:54421";
const { ANON_KEY: ANON, SERVICE_ROLE_KEY: SRK } = process.env;
const EMP = "11111111-aaaa-4000-8000-000000000001", JOB = "44444444-dddd-4000-8000-000000000004";
const BIG = "55555555-eeee-4000-8000-000000000005";
const sql = (q) => execFileSync("psql", ["-X", "-d", "rec_stack", "-v", "ON_ERROR_STOP=1", "-At", "-c", q], { encoding: "utf8" }).trim();
const leaks = /a[67]000000-0000-4000-8000-/;
let failures = 0, passed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`ok   ${label}`); } else { failures++; console.log(`FAIL ${label}`); } };
const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const rpc = (t, n, b) => fetch(`${API}/rest/v1/rpc/${n}`, { method: "POST", headers: H(t), body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, text: await r.text() }));
const view = (t) => rpc(t, "rec_ri_candidate_view", { _employer_id: EMP, _job_id: JOB, _filters: { stage: "received" }, _sort: "requirements", _dir: null, _page: 1, _size: 25, _around: null });
const rows = (t) => fetch(`${API}/rest/v1/job_applications?select=id&job_id=eq.${JOB}`, { headers: H(t) }).then(async (r) => ({ status: r.status, rows: await r.json() }));
async function tokenFor(email) {
  const link = await fetch(`${API}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) }).then((r) => r.json());
  const s = await fetch(`${API}/auth/v1/verify`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email, token: link.email_otp ?? link.properties?.email_otp }) }).then((r) => r.json());
  return s.access_token;
}
const logout = (t, scope) => fetch(`${API}/auth/v1/logout?scope=${scope}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${t}` } }).then((r) => r.status);
const target = sql(`SELECT a.id FROM public.job_applications a LEFT JOIN public.recruitment_application_meta m ON m.application_id = a.id WHERE a.job_id = '${BIG}' AND m.first_viewed_at IS NULL ORDER BY a.id DESC LIMIT 1`);
const metaBefore = sql(`SELECT count(*) FROM public.recruitment_application_meta WHERE application_id = '${target}'`);
const firstViewed = () => sql(`SELECT coalesce(first_viewed_at::text, 'never') FROM public.recruitment_application_meta WHERE application_id = '${target}'`) || "never";
const email = `sara.session.${Date.now()}@nordvakt.test`;
const created = await fetch(`${API}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, email_confirm: true }) }).then((r) => r.json());
const sara = created.id;
sql(`INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES ('${EMP}', '${sara}', 'member', 'active')`);
const marker = `session-proof-${Date.now()}`;
const comments = () => sql(`SELECT count(*) FROM public.recruitment_comments WHERE body = '${marker}'`);
async function works(t, why) {
  const v = await view(t); check(v.status === 200 && leaks.test(v.text), `${why}: PostgREST rec_ri_candidate_view answers`);
  const r = await rows(t); check(r.status === 200 && r.rows.length === 32, `${why}: PostgREST job_applications 32 rows`);
}
async function refused(t, why) {
  const v = await view(t); check(v.status >= 400 && !leaks.test(v.text), `${why}: PostgREST rec_ri_candidate_view refused (${v.status})`);
  const r = await rows(t); check(Array.isArray(r.rows) && r.rows.length === 0, `${why}: PostgREST job_applications no row (${r.rows.length})`);
  const c = await rpc(t, "rec_add_comment", { _application_id: target, _body: marker }); check(c.status >= 400, `${why}: rec_add_comment refused (${c.status})`);
  const m = await rpc(t, "rec_mark_application_viewed", { _application_id: target }); check(m.status >= 400, `${why}: rec_mark_application_viewed refused (${m.status})`);
  check(comments() === "0", `${why}: no comment written`);
  check(firstViewed() === "never", `${why}: receipt not written`);
}
try {
  const first = await tokenFor(email), second = await tokenFor(email);
  await works(first, "active session"); await works(second, "second session");
  check((await logout(first, "local")) < 300, "local sign-out accepted");
  const u = await fetch(`${API}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${first}` } });
  check(u.status >= 400, `Auth /user refuses the signed-out token (${u.status})`);
  await refused(first, "after local sign-out");
  await works(second, "other session after local sign-out");
  const third = await tokenFor(email); await works(third, "third session");
  check((await logout(second, "global")) < 300, "global sign-out accepted");
  await refused(second, "after global sign-out (signing-out session)");
  await refused(third, "after global sign-out (other session)");
  const fresh = await tokenFor(email); await works(fresh, "new sign-in after global sign-out");
  await refused(first, "first token after the new sign-in");
  const m = await rpc(fresh, "rec_mark_application_viewed", { _application_id: target });
  check(m.status === 200 && firstViewed() !== "never", "live session: the same write goes through");
} finally {
  sql(`UPDATE public.employer_memberships SET status = 'removed' WHERE user_id = '${sara}'`);
  if (metaBefore === "0") sql(`DELETE FROM public.recruitment_application_meta WHERE application_id = '${target}' AND first_viewed_by = '${sara}'`);
}
console.log(`${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
