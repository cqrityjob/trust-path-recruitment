// The request chain of listRecruitmentCandidatesPage (src/lib/recruitment/recruitment.functions.ts),
// replayed over HTTP against REAL GoTrue + PostgREST on loopback, as the signed-in owner.
//   1 requireSupabaseAuth -> getClaims (HS256 => GoTrue /user, the session check)
//   2 requireMember       -> employer_memberships + employers!inner(status)
//   3 Phase 1 (parallel)  -> rpc rec_ri_candidate_view + recruitment_questions
//   4 Phase 2 (parallel)  -> answers, comments, messages for the page ids + rpc scp_employer_team
// usage: node api-chain.mjs RUNS EMAIL
const API = "http://127.0.0.1:54421";
const { ANON_KEY, SERVICE_ROLE_KEY } = process.env;
const [runs = "15", email = "anna.agare@nordvakt.test"] = process.argv.slice(2);
const EMP = "11111111-aaaa-4000-8000-000000000001", JOB = "55555555-eeee-4000-8000-000000000005";
const j = async (r) => { const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null; };
async function token() {
  const link = await j(await fetch(`${API}/auth/v1/admin/generate_link`, { method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }) }));
  const s = await j(await fetch(`${API}/auth/v1/verify`, { method: "POST", headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: link.email_otp ?? link.properties?.email_otp }) }));
  return s.access_token;
}
const tok = await token();
const H = { apikey: ANON_KEY, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
const get = (p) => fetch(`${API}/rest/v1/${p}`, { headers: H }).then(j);
const rpc = (f, b) => fetch(`${API}/rest/v1/rpc/${f}`, { method: "POST", headers: H, body: JSON.stringify(b) }).then(j);
const filters = { stage: "open", owner: null, q: null, job: null, status: null, requirement: null, review: null, analysis: null, assessment: null, answers: [] };
async function once() {
  const t0 = performance.now();
  const u = await fetch(`${API}/auth/v1/user`, { headers: H }).then(j);
  await get(`employer_memberships?select=role,employers!inner(status)&user_id=eq.${u.id}&employer_id=eq.${EMP}&status=eq.active`);
  const t1 = performance.now();
  const [page] = await Promise.all([
    rpc("rec_ri_candidate_view", { _employer_id: EMP, _job_id: JOB, _filters: filters, _sort: "requirements", _dir: null, _page: 1, _size: 25, _around: null }),
    get(`recruitment_questions?select=id,prompt_sv,prompt_en,answer_kind,position&job_id=eq.${JOB}&answer_kind=eq.yes_no&order=position`),
  ]);
  const t2 = performance.now();
  const ids = page.rows.map((r) => r.id).join(",");
  await Promise.all([
    get(`job_application_answers?select=application_id,question_id,answer_kind,answer_bool,recruitment_questions(requirement_id,recruitment_requirements(kind))&application_id=in.(${ids})`),
    get(`recruitment_comments?select=application_id&application_id=in.(${ids})`),
    get(`recruitment_messages?select=application_id&application_id=in.(${ids})&status=eq.sent`),
    rpc("scp_employer_team", { _employer_id: EMP }),
  ]);
  const t3 = performance.now();
  if (page.total !== 5050 || page.rows.length !== 25) throw new Error(`unexpected page ${page.total}/${page.rows.length}`);
  return { total: t3 - t0, auth: t1 - t0, phase1: t2 - t1, phase2: t3 - t2 };
}
await once(); // warm
const out = [];
for (let i = 0; i < Number(runs); i++) out.push(await once());
for (const r of out) console.log([r.total, r.auth, r.phase1, r.phase2].map((x) => x.toFixed(1)).join("\t"));
