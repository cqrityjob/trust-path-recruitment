// Real PostgREST/JWT/RLS. Synthetic JWTs, not a GoTrue password-login test.
import crypto from "node:crypto";
import fs from "node:fs";
const origin = process.env.SECURITY_AUDIT_API_URL || "http://127.0.0.1:57634";
const url = new URL(origin);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== "http:") {
  throw new Error("Only the isolated loopback API is permitted");
}
const secret = "synthetic-security-audit-jwt-secret-at-least-32-chars";
const id = (n) => "a9280000-0000-4000-8000-" + String(n).padStart(12, "0");
function token(n) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ role: "authenticated", sub: id(n), exp: Math.floor(Date.now() / 1000) + 600 }),
  ).toString("base64url");
  return (
    header +
    "." +
    body +
    "." +
    crypto
      .createHmac("sha256", secret)
      .update(header + "." + body)
      .digest("base64url")
  );
}
let assertions = 0;
function ok(value, label) {
  if (!value) throw new Error(label);
  assertions++;
  console.log("PASS HTTP " + label);
}
async function request(path, n, method = "GET", body) {
  const headers = { "Content-Type": "application/json", Prefer: "return=representation" };
  if (n) headers.Authorization = "Bearer " + token(n);
  const r = await fetch(origin + "/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const meta = JSON.parse(
  fs.readFileSync("docs/security/2026-09-27/production-metadata.json", "utf8"),
);
for (const p of meta.policies.filter((p) => p.cmd === "SELECT" && p.qual === "true")) {
  for (const n of [0, 1, 3, 4]) {
    const r = await request(p.tablename + "?limit=1", n);
    const readable = n !== 0 || p.roles.includes("anon");
    ok(
      readable
        ? r.status === 200
        : r.status === 401 || r.status === 403 || (r.status === 200 && r.body.length === 0),
      p.tablename + " catalogue visibility for " + (n || "anon"),
    );
  }
}
for (const n of [0, 2, 3, 4]) {
  for (const method of ["GET", "PATCH", "DELETE"]) {
    const r = await request(
      "candidate_current_location?user_id=eq." + id(1),
      n,
      method,
      method === "PATCH" ? { locality: "Attack" } : undefined,
    );
    ok(
      r.status === 401 || r.status === 403 || (r.status === 200 && r.body.length === 0),
      "private location " + method + " blocked for " + (n || "anon"),
    );
  }
}
let r = await request("candidate_current_location?user_id=eq." + id(1), 1);
ok(
  r.status === 200 && r.body.length === 1 && r.body[0].locality === "Synthetic location",
  "owner reads original after hostile writes",
);
r = await request("candidate_current_location?user_id=eq." + id(1), 1, "PATCH", {
  locality: "Synthetic update",
});
ok(
  r.status === 200 && r.body[0].locality === "Synthetic update",
  "owner updates own private record",
);
r = await request("candidate_current_location?user_id=eq." + id(1), 1, "PATCH", { user_id: id(2) });
ok(r.status === 403, "owner cannot transfer private record to another user");
r = await request("candidate_current_location", 2, "POST", { user_id: id(1), country_code: "GB" });
ok(r.status === 403, "foreign owner spoof in INSERT rejected");
for (const n of [0, 1, 4]) {
  for (const method of ["GET", "PATCH"]) {
    r = await request(
      "employees?id=eq." + id(21),
      n,
      method,
      method === "PATCH" ? { first_name: "Attack" } : undefined,
    );
    ok(
      r.status === 401 || r.status === 403 || (r.status === 200 && r.body.length === 0),
      "tenant A employee " + method + " blocked for " + (n || "anon"),
    );
  }
}
r = await request("employees?id=eq." + id(21), 3, "PATCH", { first_name: "Synthetic update" });
ok(r.status === 200 && r.body.length === 1, "tenant A owner updates own employee");
r = await request("employees", 4, "POST", {
  employer_id: id(11),
  first_name: "Attack",
  last_name: "Synthetic",
  created_by: id(4),
});
ok(r.status === 403, "tenant B cannot insert into tenant A");
r = await request("employees", 3, "POST", {
  employer_id: id(11),
  first_name: "Synthetic new",
  last_name: "Person",
  created_by: id(3),
});
ok(r.status === 201, "tenant A owner creates employee");
for (const n of [0, 1, 3, 4]) {
  r = await request("sp_certification_issuers?issuer_code=neq.nonexistent", n, "PATCH", {
    display_name: "Attack",
  });
  ok(
    r.status === 401 || r.status === 403,
    "catalogue mutation denied over HTTP for " + (n || "anon"),
  );
}
console.log("PASS HTTP total " + assertions + " assertions");
