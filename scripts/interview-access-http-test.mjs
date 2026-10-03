// Real local PostgREST/JWT/RLS; synthetic principals. Not a GoTrue login test.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
const origin = process.env.INTERVIEW_ACCESS_API_URL || "http://127.0.0.1:59133";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname))
  throw Error("Local API only");
const fixture = JSON.parse(
  fs.readFileSync(
    process.env.INTERVIEW_ACCESS_FIXTURE || "/tmp/interview-access-evidence/api-fixture.json",
    "utf8",
  ),
);
const { actors: a, cases: c, author, attempt } = fixture;
const contract = process.env.INTERVIEW_ACCESS_STAGE === "contract";
export function token(uid) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const b = Buffer.from(
    JSON.stringify({ role: "authenticated", sub: uid, exp: Math.floor(Date.now() / 1000) + 600 }),
  ).toString("base64url");
  return (
    h +
    "." +
    b +
    "." +
    crypto
      .createHmac("sha256", "synthetic-interview-access-jwt-secret-at-least-32-chars")
      .update(h + "." + b)
      .digest("base64url")
  );
}
let n = 0;
function ok(v, label) {
  assert(v, label);
  n++;
  console.log("PASS HTTP " + label);
}
async function request(path, uid, method = "GET", body) {
  const headers = { "Content-Type": "application/json", Prefer: "return=representation" };
  if (uid) headers.Authorization = "Bearer " + token(uid);
  const r = await fetch(origin + "/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
const denied = (r) =>
  [401, 403].includes(r.status) ||
  (r.status === 200 && Array.isArray(r.body) && r.body.length === 0);
for (const [name, uid] of Object.entries({
  anon: null,
  candidate: a.c1,
  reviewer: a.gr,
  colleague: a.pm,
  removed: a.rv,
  suspended: a.su,
  companyB: a.xo,
  admin: a.pa,
  author,
})) {
  let r = await request("scp_scenario_versions?select=*", uid);
  ok(
    ["admin", "author"].includes(name) ? r.status === 200 && r.body.length === 4 : denied(r),
    "raw scenarios " + name,
  );
  r = await request("scp_scenario_versions?select=*&content_status=eq.published", uid);
  ok(
    ["admin", "author"].includes(name) ? r.status === 200 && r.body.length === 2 : denied(r),
    "published scenarios " + name,
  );
  r = await request("scp_interview_ai_config?select=*", uid);
  ok(
    contract
      ? name === "admin"
        ? r.status === 200 && r.body[0].updated_by === a.pa
        : denied(r)
      : uid
        ? r.status === 200 && r.body.length === 1
        : denied(r),
    "configuration " + name + " " + (contract ? "contract" : "expand"),
  );
  r = await request("rpc/scp_iv_case_capabilities", uid, "POST", { _case_id: c.case_a });
  ok(
    name === "reviewer"
      ? r.status === 200 &&
          JSON.stringify(r.body) === '[{"ai_enabled":true,"transcript_enabled":true}]'
      : denied(r),
    "case capability " + name + " " + JSON.stringify(r),
  );
  r = await request("scp_interview_ai_config?id=eq.true", uid, "PATCH", {
    ai_enabled: false,
    updated_by: uid,
  });
  ok(denied(r), "configuration write denied " + name);
  r = await request("scp_scenario_versions?version_number=eq.1", uid, "PATCH", {
    situation_en: "Hostile write",
  });
  // Content authors are controlled by both grants and the author policy. This
  // fixture holds no client write grant; nobody gains one from our migrations.
  ok(denied(r), "scenario mutation denied " + name);
}
for (const uid of [a.ow, a.gr, a.cr, a.pn, a.r1]) {
  const r = await request("rpc/scp_iv_case_capabilities", uid, "POST", { _case_id: c.case_a });
  ok(
    r.status === 200 &&
      Object.keys(r.body[0]).sort().join(",") === "ai_enabled,transcript_enabled" &&
      r.body[0].ai_enabled === true,
    "authorised case reader gets only flags " + uid.slice(-2),
  );
}
for (const id of [null, "00000000-0000-4000-8000-000000000001"]) {
  const r = await request("rpc/scp_iv_case_capabilities", a.ow, "POST", { _case_id: id });
  ok(denied(r), "missing case denied");
}
for (const name of [
  "scp_item_options",
  "scp_item_texts",
  "scp_rubric_versions",
  "scp_rubric_dimensions",
]) {
  const r = await request(name + "?select=*&limit=1", a.c1);
  ok(denied(r), "candidate raw assessment bank denied " + name);
}
let r = await request("rpc/scp_get_attempt_items", a.c1, "POST", {
  _attempt_id: attempt,
  _language: "sv-SE",
});
ok(r.status === 200 && r.body.length > 0, "candidate intended test delivery");
for (const item of r.body)
  for (const option of item.options || [])
    ok(
      Object.keys(option).sort().join(",") === "label,option_id",
      "delivery excludes option key, score and rationale",
    );
for (const uid of [null, a.pm, a.xo, a.c2]) {
  r = await request("rpc/scp_get_attempt_items", uid, "POST", {
    _attempt_id: attempt,
    _language: "sv-SE",
  });
  ok(denied(r), "foreign attempt delivery denied");
}
console.log(`interview-access-http: ${n} assertions passed (${contract ? "contract" : "expand"})`);
