// Disposable local Supabase integration. Never reads repository production bindings.
// Requires repository interview-journey fixture for the employer tenant. Logs assertions only.
import fs from "node:fs";
import crypto from "node:crypto";
import cp from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const env = JSON.parse(
  fs.readFileSync("/private/tmp/cqrity-platform-ux-20261015/status.json", "utf8"),
);
if (!/^http:\/\/127\.0\.0\.1:57721$/.test(env.API_URL)) throw Error("LOCAL_ISOLATION");
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log("PASS " + name);
  } catch (e) {
    results.push({
      name,
      pass: false,
      error: String(e.message).replace(/eyJ[^ ]+/g, "[redacted]"),
    });
    console.log("FAIL " + name + ": " + e.message);
  }
  fs.writeFileSync("/private/tmp/platform-ux-live-results.json", JSON.stringify(results, null, 2));
}
function ok(x, m) {
  if (!x) throw Error(m);
}
function good(r) {
  if (r.error) throw Error(r.error.message);
  return r.data;
}
const roleClients = {};
const userSessions = {};
function sql(text) {
  if (env.DB_URL !== "postgresql://postgres:postgres@127.0.0.1:57722/postgres")
    throw Error("LOCAL_DATABASE_ONLY");
  return cp
    .execFileSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", text], {
      encoding: "utf8",
    })
    .trim();
}
async function main() {
  for (const role of ["owner", "other", "employer"]) {
    const email = "platform-ux-" + role + "-" + Date.now() + "@fixture.invalid",
      password = crypto.randomBytes(24).toString("base64url");
    const u = good(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    ).user;
    const c = createClient(env.API_URL, env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = good(await c.auth.signInWithPassword({ email, password }));
    roleClients[role] = c;
    userSessions[role] = { id: u.id, email, password, session: login.session };
  }
  fs.writeFileSync("/private/tmp/platform-ux-users.json", JSON.stringify(userSessions), {
    mode: 0o600,
  });
  const { owner, other, employer } = roleClients;
  const uid = userSessions.owner.id;
  good(await other.from("sp_passport_profiles").insert({ holder_user_id: userSessions.other.id }));
  await check("Real GoTrue identities and sessions", async () =>
    ok(
      Object.values(userSessions).every((x) => x.session.access_token && x.session.refresh_token),
      "sessions missing",
    ),
  );
  await check("Owner creates Passport profile through RLS", async () =>
    good(await owner.from("sp_passport_profiles").insert({ holder_user_id: uid })),
  );
  const data = {
    definition_code: "INTL_ASIS_CPP",
    market_country: "",
    market_region: "",
    identifier: "OPTIONAL-PRIVATE-123",
    issued_on: "2026-01-01",
    valid_until: "2028-01-01",
    no_expiry: false,
  };
  let cid, second;
  await check("Owner creates two credentials over real RPC", async () => {
    cid = good(await owner.rpc("sp_save_international_credential", { _input: data }));
    second = good(
      await owner.rpc("sp_save_international_credential", {
        _input: { ...data, definition_code: "INTL_ASIS_PSP" },
      }),
    );
    ok(cid && second, "missing claims");
  });
  await check("Closed catalogue rejects custom and unknown definitions over RPC", async () => {
    for (const input of [
      { title: "Unlisted", issuer: "Fake", class: "certification" },
      { definition_code: "UNKNOWN" },
    ])
      ok(
        (await owner.rpc("sp_save_international_credential", { _input: input })).error,
        "custom definition accepted",
      );
  });
  await check("Governed metadata cannot be injected through RPC", async () => {
    for (const field of [
      "title",
      "issuer",
      "country",
      "issuing_jurisdiction",
      "validity_jurisdiction",
      "class",
      "language",
    ])
      ok(
        (
          await owner.rpc("sp_save_international_credential", {
            _input: { ...data, [field]: "forged" },
          })
        ).error,
        "metadata accepted: " + field,
      );
  });
  await check("Wrong-market definition and unapproved no-expiry fail closed", async () => {
    for (const patch of [{ market_country: "SE" }, { market_region: "AE-DU" }, { no_expiry: true }])
      ok(
        (await owner.rpc("sp_save_international_credential", { _input: { ...data, ...patch } }))
          .error,
        "ineligible selection accepted",
      );
  });
  await check("Candidate cannot write governed catalogue or issuers over REST", async () => {
    for (const table of [
      "sp_credential_types",
      "sp_certification_definitions",
      "sp_certification_issuers",
      "sp_authorities",
      "sp_credential_definition_metadata",
    ])
      ok((await owner.from(table).insert({})).error, "catalogue insert accepted: " + table);
    ok(
      (
        await owner
          .from("sp_certification_issuers")
          .update({ display_name: "Forged" })
          .eq("issuer_code", "ASIS")
      ).error,
      "issuer update accepted",
    );
  });
  await check("Direct claim REST cannot alter governed identity or territory", async () => {
    for (const patch of [
      { title: "Forged" },
      { claimed_issuer_name: "Forged" },
      { jurisdiction_code: "SE" },
      { authorisation_scope: "global" },
      { credential_code: null },
    ])
      ok(
        (await owner.from("sp_claims").update(patch).eq("id", cid)).error,
        "direct metadata update accepted",
      );
  });
  await check("Inactive and deprecated definitions are unavailable over real RPC", async () => {
    sql("UPDATE public.sp_credential_types SET is_active=false WHERE code='INTL_ASIS_CPP'");
    try {
      ok(
        (await owner.rpc("sp_save_international_credential", { _input: data })).error,
        "inactive definition accepted",
      );
    } finally {
      sql("UPDATE public.sp_credential_types SET is_active=true WHERE code='INTL_ASIS_CPP'");
    }
    sql(
      "UPDATE public.sp_certification_definitions SET retired_on=current_date WHERE credential_code='INTL_ASIS_CPP'",
    );
    try {
      ok(
        (await owner.rpc("sp_save_international_credential", { _input: data })).error,
        "retired definition accepted",
      );
    } finally {
      sql(
        "UPDATE public.sp_certification_definitions SET retired_on=NULL WHERE credential_code='INTL_ASIS_CPP'",
      );
    }
  });
  await check("ASIS selection retains exactly the existing definitions and issuer", async () => {
    const rows = good(
      await owner
        .from("sp_approved_credential_catalogue")
        .select("code,issuer_id")
        .in("code", ["INTL_ASIS_CPP", "INTL_ASIS_PSP", "INTL_ASIS_PCI"]),
    );
    ok(
      rows.length === 3 && new Set(rows.map((r) => r.issuer_id)).size === 1,
      "ASIS catalogue duplicated",
    );
  });
  await check("Other candidate cannot read claims or metadata", async () => {
    for (const t of ["sp_claims", "sp_credential_details"])
      ok(good(await other.from(t).select("*")).length === 0, "cross-owner data exposed");
  });
  await check("Employer has a real local tenant membership", async () => {
    const id = userSessions.employer.id;
    ok(/^[0-9a-f-]{36}$/.test(id), "bad fixture id");
    sql(
      "INSERT INTO public.employer_memberships (employer_id,user_id,role,status) SELECT id,'" +
        id +
        "','member','active' FROM public.employers WHERE slug='journey-ab'",
    );
    ok(
      good(await employer.from("employer_memberships").select("user_id")).some(
        (x) => x.user_id === id,
      ),
      "no employer membership",
    );
  });
  await check("Employer cannot read private Passport", async () =>
    ok(good(await employer.from("sp_claims").select("*")).length === 0, "employer data exposed"),
  );
  await check("Other candidate cannot correct owner claim", async () =>
    ok(
      (
        await other.rpc("sp_save_international_credential", {
          _input: { ...data, claim_id: cid, version: 1 },
        })
      ).error,
      "cross-owner correction accepted",
    ),
  );
  await check("Candidate cannot promote verification through RPC", async () =>
    ok(
      (await owner.rpc("sp_save_international_credential", { _input: { ...data, verified: true } }))
        .error,
      "self-verification accepted",
    ),
  );
  await check("Candidate cannot promote verification through REST", async () => {
    const r = await owner
      .from("sp_claims")
      .update({ assertion_level: "issuer_verified" })
      .eq("id", cid);
    ok(r.error, "status promotion accepted");
  });
  await check("Profile and CV remain independent canonical records", async () => {
    good(
      await owner.from("profiles").update({ display_name: "Local Passport Owner" }).eq("id", uid),
    );
    good(
      await owner
        .from("security_career_profiles")
        .upsert({ user_id: uid, current_profession_other: "Local Profile Title" }),
    );
    good(
      await owner
        .from("sp_claims")
        .insert({ holder_user_id: uid, claim_type: "education", title: "PRIVATE CV ONLY" }),
    );
  });
  const objectPath = uid + "/" + crypto.randomUUID() + ".pdf",
    bytes = Buffer.from("%PDF-1.4\nPassport disposable evidence\n%%EOF");
  await check("Private evidence bucket and owner-path upload", async () => {
    const b = good(await admin.storage.getBucket("passport-evidence"));
    ok(!b.public, "bucket public");
    good(
      await owner.storage
        .from("passport-evidence")
        .upload(objectPath, bytes, { contentType: "application/pdf" }),
    );
  });
  await check("Owner attaches real Storage evidence", async () =>
    good(
      await owner.rpc("sp_attach_evidence", {
        _claim_id: cid,
        _period_id: null,
        _storage_path: objectPath,
        _file_name: "disposable.pdf",
        _mime_type: "application/pdf",
        _size_bytes: bytes.length,
        _sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      }),
    ),
  );
  await check("Another user cannot list or download evidence", async () => {
    ok(
      good(await other.storage.from("passport-evidence").list(uid)).length === 0,
      "evidence listed",
    );
    ok(
      (await other.storage.from("passport-evidence").download(objectPath)).error,
      "evidence downloaded",
    );
  });
  await check("Altered owner path denied on upload", async () =>
    ok(
      (
        await other.storage
          .from("passport-evidence")
          .upload(uid + "/" + crypto.randomUUID() + ".pdf", bytes, {
            contentType: "application/pdf",
          })
      ).error,
      "foreign upload accepted",
    ),
  );

  process.exitCode = results.some((x) => !x.pass) ? 1 : 0;
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
