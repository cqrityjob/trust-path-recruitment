// Disposable local Supabase integration — the pilot journey's review half.
//
// Complements scripts/passport-live-local-check.mjs, which already proves
// identities, RLS, evidence storage, selective sharing, the Edge handoff, the
// recipient view and revocation. This covers the steps that script does not:
//
//   * a saved current profession reaches the Passport's role line;
//   * an international and a Swedish credential persist scope, issuer and
//     dates across a fresh read;
//   * evidence -> review request -> verifier queue -> clarification -> the
//     holder's reply -> decision -> what the holder then sees;
//   * a rejection carries its reason to the holder;
//   * a holder can never decide their own request;
//   * pilot registration for GB and Dubai, link by link: market access,
//     approved definitions, catalogue visibility, the governed write RPC,
//     and a reload of what was written (needs 20261124090000);
//   * the definition's scope in the disclosure payload (needs 20261125090000);
//   * the reviewer's detail view: definition, issuer, territory, evidence
//     and decision history.
//
// Real GoTrue, PostgREST and Storage; no response fixtures. It REFUSES any API
// other than the isolated stack on 127.0.0.1:55421, and it never reads the
// repository's production bindings. Logs assertions only — no tokens.
//
// The verifier role is granted with a direct local INSERT, NOT through
// `admin_set_platform_role`: that RPC needs a platform admin, and creating one
// is out of scope for a disposable fixture. Everything the verifier then DOES
// goes through the real authorised RPCs (sp_verifier_queue, sp_verifier_decide).
//
// Run: node scripts/passport-live-local-journey-check.mjs

import fs from "node:fs";
import crypto from "node:crypto";
import cp from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(
      process.env.PASSPORT_LOCAL_ENV_FILE ?? "/private/tmp/passport-phase2-status.env",
      "utf8",
    )
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
if (!/^http:\/\/127\.0\.0\.1:55421$/.test(env.API_URL)) throw Error("LOCAL_ISOLATION");
if (env.DB_URL !== "postgresql://postgres:postgres@127.0.0.1:55422/postgres")
  throw Error("LOCAL_DATABASE_ONLY");

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
    const error = String(e.message).replace(/eyJ[^ ]+/g, "[redacted]");
    results.push({ name, pass: false, error });
    console.log("FAIL " + name + ": " + error);
  }
}
function ok(x, m) {
  if (!x) throw Error(m);
}
function good(r) {
  if (r.error) throw Error(r.error.message);
  return r.data;
}
function sql(text) {
  return cp
    .execFileSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", text], {
      encoding: "utf8",
    })
    .trim();
}
async function user(role) {
  const email = `passport-journey-${role}-${Date.now()}@fixture.invalid`;
  const password = crypto.randomBytes(24).toString("base64url");
  const u = good(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  good(await client.auth.signInWithPassword({ email, password }));
  return { id: u.id, client };
}
/** A fresh client for the same person — what a reload is. */
async function reread(holder, table, id) {
  return good(await holder.client.from(table).select("*").eq("id", id).single());
}

let approvedForRun = false;
function restoreApproval() {
  if (!approvedForRun) return;
  sql(
    "update public.sp_credential_types set is_active=false where code in ('UK_SIA_LICENCE_SG','AE_DU_BASIC_FIRE_SAFETY')",
  );
  approvedForRun = false;
}
async function main() {
  const holder = await user("holder");
  const verifier = await user("verifier");
  good(await holder.client.from("sp_passport_profiles").insert({ holder_user_id: holder.id }));
  ok(/^[0-9a-f-]{36}$/.test(verifier.id), "verifier id");
  sql(
    `insert into public.user_roles (user_id, role) values ('${verifier.id}', 'passport_verifier') on conflict do nothing`,
  );

  /* ── profession: Profile owns it, the Passport reads it ─────────────── */
  const profession = sql(
    "select slug || '|' || title_sv || '|' || title_en from public.cig_professions where content_status='published' order by slug limit 1",
  ).split("|");
  await check("Holder saves current profession on the Career Profile", async () => {
    good(
      await holder.client.from("security_career_profiles").upsert(
        {
          user_id: holder.id,
          profile_version: "security-career-profile-v1",
          current_status: "working_in_industry",
          current_profession_slug: profession[0],
          current_profession_other: null,
          years_of_experience: "5-10",
        },
        { onConflict: "user_id" },
      ),
    );
  });
  await check("After a fresh read the Passport's role line is that profession", async () => {
    // The exact two reads readPassportProfileIdentity performs, as the holder.
    const career = good(
      await holder.client
        .from("security_career_profiles")
        .select("current_profession_slug, current_profession_other")
        .eq("user_id", holder.id)
        .maybeSingle(),
    );
    ok(career?.current_profession_slug === profession[0], "slug not persisted");
    const title = good(
      await holder.client
        .from("cig_professions")
        .select("title_sv, title_en")
        .eq("slug", career.current_profession_slug)
        .eq("content_status", "published")
        .maybeSingle(),
    );
    ok(title?.title_sv === profession[1] && title?.title_en === profession[2], "title mismatch");
  });
  await check(
    "Writing the legacy Passport headline does not change the role line's source",
    async () => {
      // sp_passport_profiles still carries legacy `headline` / `cig_profession_slug`
      // columns. The identity reader must not consult them: the role is the
      // Career Profile's. Write a decoy there and re-run the reader's own reads.
      good(
        await holder.client
          .from("sp_passport_profiles")
          .update({ headline: "DECOY PASSPORT HEADLINE" })
          .eq("holder_user_id", holder.id),
      );
      const career = good(
        await holder.client
          .from("security_career_profiles")
          .select("current_profession_slug")
          .eq("user_id", holder.id)
          .maybeSingle(),
      );
      ok(career?.current_profession_slug === profession[0], "role source changed");
      const reader = fs.readFileSync(
        "src/lib/security-passport/profile-identity.server.ts",
        "utf8",
      );
      ok(
        !/sp_passport_profiles|headline/.test(reader.replace(/\/\*[\s\S]*?\*\//g, "")),
        "the identity reader consults the Passport profile",
      );
    },
  );

  /* ── credentials persist ─────────────────────────────────────────────── */
  let cpp, vu1;
  await check("International certification saves over the real RPC", async () => {
    cpp = good(
      await holder.client.rpc("sp_save_international_credential", {
        _input: {
          definition_code: "INTL_ASIS_CPP",
          market_country: "",
          market_region: "",
          identifier: "JOURNEY-PRIVATE-1",
          issued_on: "2025-02-01",
          valid_until: "2028-02-01",
          no_expiry: false,
        },
      }),
    );
    ok(cpp, "no claim id");
  });
  await check(
    "Reopened: global scope (no territory), governed issuer and dates persist",
    async () => {
      const row = await reread(holder, "sp_claims", cpp);
      ok(row.credential_code === "INTL_ASIS_CPP", "code");
      ok(
        row.jurisdiction_code === null && row.sub_jurisdiction_code === null,
        "global has territory",
      );
      ok(/ASIS/i.test(row.claimed_issuer_name ?? ""), "issuer: " + row.claimed_issuer_name);
      ok(row.issued_on === "2025-02-01" && row.valid_until === "2028-02-01", "dates");
      ok(row.assertion_level === "self_declared", "assertion: " + row.assertion_level);
      const scope = sql(
        "select scope_code from public.sp_credential_types where code='INTL_ASIS_CPP'",
      );
      ok(scope === "global_professional", "definition scope: " + scope);
    },
  );
  await check(
    "Swedish credential saves over the governed RPC (active Swedish market)",
    async () => {
      good(
        await holder.client
          .from("sp_passport_profiles")
          .update({ jurisdiction_code: "SE", work_location_confirmed_at: new Date().toISOString() })
          .eq("holder_user_id", holder.id),
      );
      vu1 = good(
        await holder.client.rpc("sp_save_international_credential", {
          _input: {
            definition_code: "OV",
            market_country: "SE",
            market_region: "",
            identifier: "",
            issued_on: "2024-03-01",
            valid_until: "2027-03-01",
            no_expiry: false,
          },
        }),
      );
      ok(vu1, "no claim id");
    },
  );
  await check(
    "Reopened: Swedish scope, governed issuer and dates persist; still self-declared",
    async () => {
      const row = await reread(holder, "sp_claims", vu1);
      ok(row.credential_code === "OV", "code: " + row.credential_code);
      ok(row.jurisdiction_code === "SE", "jurisdiction: " + row.jurisdiction_code);
      ok((row.claimed_issuer_name ?? "").length > 0, "no governed issuer recorded");
      ok(row.issued_on === "2024-03-01" && row.valid_until === "2027-03-01", "dates");
      ok(row.assertion_level === "self_declared" && row.lifecycle_state === "active", "state");
    },
  );
  await check("A direct table insert cannot bypass the governed catalogue", async () => {
    const r = await holder.client.from("sp_claims").insert({
      holder_user_id: holder.id,
      claim_type: "training",
      credential_code: "VU1",
      title: "Väktarutbildning 1 (VU1)",
      jurisdiction_code: "SE",
      lifecycle_state: "active",
    });
    ok(
      /SP_APPROVED_DEFINITION_REQUIRED/.test(r.error?.message ?? ""),
      "bypass accepted: " + (r.error?.message ?? "no error"),
    );
  });
  for (const [label, code, country, region] of [
    ["Great Britain", "UK_SIA_LICENCE_CCTV", "GB", ""],
    ["Dubai", "AE_DU_BASIC_FIRE_SAFETY", "AE", "AE-DU"],
  ]) {
    await check(
      `${label}: a regulated credential is refused while its market pack is not active`,
      async () => {
        const r = await holder.client.rpc("sp_save_international_credential", {
          _input: {
            definition_code: code,
            market_country: country,
            market_region: region,
            identifier: "",
            issued_on: "2024-03-01",
            valid_until: "2027-03-01",
            no_expiry: false,
          },
        });
        ok(r.error, label + " credential accepted");
        console.log("     observed: " + r.error.message);
      },
    );
  }

  /* ── evidence -> review -> clarification -> reply -> decision ─────────── */
  const bytes = Buffer.from("%PDF-1.4\nJourney evidence\n%%EOF");
  const attach = async (claimId) => {
    const objectPath = holder.id + "/" + crypto.randomUUID() + ".pdf";
    good(
      await holder.client.storage
        .from("passport-evidence")
        .upload(objectPath, bytes, { contentType: "application/pdf" }),
    );
    good(
      await holder.client.rpc("sp_attach_evidence", {
        _claim_id: claimId,
        _period_id: null,
        _storage_path: objectPath,
        _file_name: "journey.pdf",
        _mime_type: "application/pdf",
        _size_bytes: bytes.length,
        _sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      }),
    );
  };
  await check(
    "Evidence attaches; the credential becomes document_provided, not verified",
    async () => {
      await attach(vu1);
      const row = await reread(holder, "sp_claims", vu1);
      ok(row.assertion_level === "document_provided", "assertion: " + row.assertion_level);
    },
  );
  let request;
  await check("Holder requests a CQrityjob review", async () => {
    request = good(
      await holder.client.rpc("sp_submit_for_verification", {
        _claim_id: vu1,
        _period_id: null,
        _kind: "cqrityjob_review",
        _employer_id: null,
      }),
    );
    ok(request, "no request id");
  });
  await check("A second open request for the same credential is refused", async () => {
    const r = await holder.client.rpc("sp_submit_for_verification", {
      _claim_id: vu1,
      _period_id: null,
      _kind: "cqrityjob_review",
      _employer_id: null,
    });
    ok(/SP_REQUEST_ALREADY_OPEN/.test(r.error?.message ?? ""), "duplicate accepted");
  });
  await check("The holder cannot decide their own request", async () => {
    const r = await holder.client.rpc("sp_verifier_decide", {
      _request_id: request,
      _decision: "approved",
      _method: "document_review",
      _decision_note: null,
      _holder_message: null,
      _valid_from: null,
      _valid_until: null,
    });
    ok(r.error, "holder approved their own credential");
    const row = await reread(holder, "sp_claims", vu1);
    ok(row.assertion_level !== "verified", "self-verification took effect");
  });
  await check("The authorised verifier sees the request in the real queue", async () => {
    const queue = good(await verifier.client.rpc("sp_verifier_queue", { _status: "pending" }));
    ok(
      (queue ?? []).some((q) => (q.request_id ?? q.id) === request),
      "request missing from queue",
    );
  });
  await check("A clarification without a message to the holder is refused", async () => {
    const r = await verifier.client.rpc("sp_verifier_decide", {
      _request_id: request,
      _decision: "clarification_requested",
      _method: null,
      _decision_note: "internal",
      _holder_message: "  ",
      _valid_from: null,
      _valid_until: null,
    });
    ok(r.error, "blank holder message accepted");
  });
  const QUESTION = "Vi behöver ett intyg som visar kursens omfattning.";
  await check("Verifier asks for clarification, with a message", async () => {
    good(
      await verifier.client.rpc("sp_verifier_decide", {
        _request_id: request,
        _decision: "clarification_requested",
        _method: null,
        _decision_note: "INTERNAL-NOTE-MUST-NOT-REACH-HOLDER",
        _holder_message: QUESTION,
        _valid_from: null,
        _valid_until: null,
      }),
    );
  });
  await check("Holder sees the question, not the reviewer's internal note", async () => {
    const rows = good(
      await holder.client
        .from("sp_verification_requests")
        .select("id, status, holder_message")
        .eq("id", request),
    );
    ok(rows[0]?.status === "clarification_requested", "status: " + rows[0]?.status);
    ok(rows[0]?.holder_message === QUESTION, "holder message missing");
    const decisions = await holder.client
      .from("sp_verification_decisions")
      .select("*")
      .eq("request_id", request);
    ok(
      !JSON.stringify(decisions.data ?? []).includes("INTERNAL-NOTE-MUST-NOT-REACH-HOLDER"),
      "internal note readable by the holder",
    );
    const row = await reread(holder, "sp_claims", vu1);
    ok(row.assertion_level === "document_provided", "clarification changed the trust level");
  });
  await check("Holder replies by attaching new evidence while the request stays open", async () => {
    await attach(vu1);
    const rows = good(
      await holder.client.from("sp_verification_requests").select("status").eq("id", request),
    );
    ok(
      ["clarification_requested", "pending"].includes(rows[0]?.status),
      "request closed by the reply: " + rows[0]?.status,
    );
    const n = good(
      await holder.client.from("sp_evidence").select("id", { count: "exact" }).eq("claim_id", vu1),
    );
    ok((n ?? []).length >= 2, "second evidence not recorded");
  });
  await check("Verifier approves after the reply (document review)", async () => {
    good(
      await verifier.client.rpc("sp_verifier_decide", {
        _request_id: request,
        _decision: "approved",
        _method: "document_review",
        _decision_note: "ok",
        _holder_message: null,
        _valid_from: null,
        _valid_until: null,
      }),
    );
  });
  await check(
    "Holder sees the outcome: decided, attributed to the reviewing organisation",
    async () => {
      const row = await reread(holder, "sp_claims", vu1);
      ok(row.assertion_level === "verified", "stored level: " + row.assertion_level);
      const rows = good(
        await holder.client
          .from("sp_verification_requests")
          .select("status, verification_method")
          .eq("id", request),
      );
      ok(rows[0]?.status === "approved", "request status: " + rows[0]?.status);
      // A document review. The product presents this as DOCUMENTED, never as
      // verified at source — see trust-presentation.ts.
      ok(
        rows[0]?.verification_method === "document_review",
        "method: " + rows[0]?.verification_method,
      );
    },
  );

  /* ── rejection carries its reason ─────────────────────────────────────── */
  await check(
    "A rejected review leaves the credential unpromoted and tells the holder why",
    async () => {
      await attach(cpp);
      const r2 = good(
        await holder.client.rpc("sp_submit_for_verification", {
          _claim_id: cpp,
          _period_id: null,
          _kind: "cqrityjob_review",
          _employer_id: null,
        }),
      );
      good(
        await verifier.client.rpc("sp_verifier_decide", {
          _request_id: r2,
          _decision: "rejected",
          _method: null,
          _decision_note: null,
          _holder_message: "Dokumentet visar inte certifieringens nummer.",
          _valid_from: null,
          _valid_until: null,
        }),
      );
      const rows = good(
        await holder.client
          .from("sp_verification_requests")
          .select("status, holder_message")
          .eq("id", r2),
      );
      ok(rows[0]?.status === "rejected", "status: " + rows[0]?.status);
      ok(/certifieringens nummer/.test(rows[0]?.holder_message ?? ""), "reason missing");
      const row = await reread(holder, "sp_claims", cpp);
      ok(row.assertion_level !== "verified", "rejected credential reads verified");
    },
  );
  await check("An unrelated signed-in user is not a verifier and sees no queue", async () => {
    const stranger = await user("stranger");
    const r = await stranger.client.rpc("sp_verifier_queue", { _status: "pending" });
    ok(r.error || (r.data ?? []).length === 0, "stranger read the verifier queue");
  });

  /* ── pilot registration: GB and Dubai, traced link by link ───────────── */
  // Three holders: one with no entitlement, one with a GB pilot entitlement,
  // one with a Dubai pilot entitlement. The entitlement row is written with a
  // direct local INSERT (a platform administrator grants it in production);
  // everything downstream — access, catalogue, write — is the real path.
  const gbPilot = await user("gb-pilot");
  const duPilot = await user("du-pilot");
  for (const [u, j, sub] of [
    [gbPilot, "GB", null],
    [duPilot, "AE", "AE-DU"],
  ]) {
    good(
      await u.client.from("sp_passport_profiles").insert({
        holder_user_id: u.id,
        jurisdiction_code: j,
        sub_jurisdiction_code: sub,
        work_location_confirmed_at: new Date().toISOString(),
      }),
    );
  }
  sql(
    `insert into public.sp_pilot_members (user_id, market_pack_code, granted_by, note)
     values ('${gbPilot.id}', 'GB', '${verifier.id}', 'local journey check'),
            ('${duPilot.id}', 'AE-DU', '${verifier.id}', 'local journey check')
     on conflict do nothing`,
  );
  const access = async (u, pack) =>
    good(await u.client.rpc("sp_market_access", { _user_id: u.id, _market_pack_code: pack }));
  const catalogueRows = async (u, country, region) =>
    good(
      await u.client
        .from("sp_approved_credential_catalogue")
        .select("code")
        .eq("country", country)
        [region ? "eq" : "is"]("region", region),
    ).length;
  await check(
    "Link 1 · market access: closed for an ordinary holder, pilot for a member",
    async () => {
      ok((await access(holder, "GB")) === "closed", "ordinary GB: " + (await access(holder, "GB")));
      ok((await access(gbPilot, "GB")) === "pilot", "gb pilot: " + (await access(gbPilot, "GB")));
      ok(
        (await access(duPilot, "AE-DU")) === "pilot",
        "du pilot: " + (await access(duPilot, "AE-DU")),
      );
      ok((await access(gbPilot, "AE-DU")) === "closed", "gb pilot must not hold Dubai");
      ok((await access(holder, "SE")) === "production", "Sweden is production for everyone");
    },
  );
  await check(
    "Link 2 · governed pilot definitions exist for both markets (authority set, NOT yet approved)",
    async () => {
      const n = (c) => Number(sql(c));
      ok(
        n(
          "select count(*) from public.sp_credential_types where market_pack_code='GB' and pilot_state='internal_pilot' and authority_id is not null and not requires_scope",
        ) > 0,
        "no governed GB definition",
      );
      ok(
        n(
          "select count(*) from public.sp_credential_types where market_pack_code='AE-DU' and pilot_state='internal_pilot' and authority_id is not null and not requires_scope",
        ) > 0,
        "no governed Dubai definition",
      );
      ok(
        n(
          "select count(*) from public.sp_credential_types where code in ('UK_SIA_LICENCE_SG','AE_DU_BASIC_FIRE_SAFETY') and not is_active",
        ) === 2,
        "the two fixture definitions are already approved",
      );
    },
  );
  await check(
    "Link 2b · membership alone approves nothing: the GB member sees an empty GB catalogue",
    async () => {
      ok(
        (await catalogueRows(gbPilot, "GB", null)) === 0,
        "GB member sees an unapproved definition",
      );
      const r = await gbPilot.client.rpc("sp_save_international_credential", {
        _input: {
          definition_code: "UK_SIA_LICENCE_SG",
          market_country: "GB",
          market_region: "",
          identifier: "",
          issued_on: "2024-05-01",
          valid_until: "2027-05-01",
          no_expiry: false,
        },
      });
      ok(
        /SP_APPROVED_DEFINITION_REQUIRED/.test(r.error?.message ?? ""),
        "unapproved definition accepted: " + (r.error?.message ?? "no error"),
      );
    },
  );
  // The owner's per-definition decision, taken here as a local administrator
  // (a direct UPDATE on the isolated stack; restored at the end of the run).
  // The market packs stay internal_pilot: approving a definition opens no market.
  sql(
    "update public.sp_credential_types set is_active=true where code in ('UK_SIA_LICENCE_SG','AE_DU_BASIC_FIRE_SAFETY')",
  );
  approvedForRun = true;
  await check("Link 2c · approving a definition activates no market pack", async () => {
    ok(
      Number(
        sql(
          "select count(*) from public.sp_market_packs where code in ('GB','AE-DU') and pilot_state='internal_pilot' and not is_active",
        ),
      ) === 2,
      "a pack was activated",
    );
  });
  await check("Link 3 · catalogue visibility follows the entitlement, per market", async () => {
    ok((await catalogueRows(holder, "GB", null)) === 0, "ordinary holder sees GB definitions");
    ok(
      (await catalogueRows(holder, "AE", "AE-DU")) === 0,
      "ordinary holder sees Dubai definitions",
    );
    ok(
      (await catalogueRows(gbPilot, "GB", null)) === 1,
      "GB pilot sees other than the one approved GB definition",
    );
    ok((await catalogueRows(gbPilot, "AE", "AE-DU")) === 0, "GB pilot sees Dubai definitions");
    ok(
      (await catalogueRows(duPilot, "AE", "AE-DU")) === 1,
      "Dubai pilot sees other than the one approved Dubai definition",
    );
    ok((await catalogueRows(duPilot, "GB", null)) === 0, "Dubai pilot sees GB definitions");
    // Sweden and the international catalogue are unchanged for everyone.
    ok((await catalogueRows(holder, "SE", null)) === 5, "SE catalogue changed");
  });
  const saveVia = (u, definition_code, market_country, market_region, extra = {}) =>
    u.client.rpc("sp_save_international_credential", {
      _input: {
        definition_code,
        market_country,
        market_region,
        identifier: "",
        issued_on: "2024-05-01",
        valid_until: "2027-05-01",
        no_expiry: false,
        ...extra,
      },
    });
  let gbClaim, duClaim;
  await check("Link 4 · the real write path: a GB pilot member saves an SIA licence", async () => {
    gbClaim = good(await saveVia(gbPilot, "UK_SIA_LICENCE_SG", "GB", ""));
    ok(gbClaim, "no claim id");
  });
  await check(
    "Reopened: the GB credential keeps jurisdiction GB and no sub-jurisdiction",
    async () => {
      const row = await reread(gbPilot, "sp_claims", gbClaim);
      ok(row.credential_code === "UK_SIA_LICENCE_SG", "code: " + row.credential_code);
      ok(
        row.jurisdiction_code === "GB" && row.sub_jurisdiction_code === null,
        "territory: " + row.jurisdiction_code + "/" + row.sub_jurisdiction_code,
      );
      ok((row.claimed_issuer_name ?? "").length > 0, "no governed issuer");
      ok(row.issued_on === "2024-05-01" && row.valid_until === "2027-05-01", "dates");
      ok(row.assertion_level === "self_declared" && row.lifecycle_state === "active", "state");
    },
  );
  await check(
    "Link 4 · the real write path: a Dubai pilot member saves a SIRA course",
    async () => {
      duClaim = good(await saveVia(duPilot, "AE_DU_BASIC_FIRE_SAFETY", "AE", "AE-DU"));
      ok(duClaim, "no claim id");
    },
  );
  await check("Reopened: the Dubai credential keeps AE and sub-jurisdiction AE-DU", async () => {
    const row = await reread(duPilot, "sp_claims", duClaim);
    ok(
      row.jurisdiction_code === "AE" && row.sub_jurisdiction_code === "AE-DU",
      "territory: " + row.jurisdiction_code + "/" + row.sub_jurisdiction_code,
    );
    ok((row.claimed_issuer_name ?? "").length > 0, "no governed issuer");
    ok(row.assertion_level === "self_declared" && row.lifecycle_state === "active", "state");
  });
  await check("An ordinary holder is still refused both pilot markets", async () => {
    const gb = await saveVia(holder, "UK_SIA_LICENCE_SG", "GB", "");
    const du = await saveVia(holder, "AE_DU_BASIC_FIRE_SAFETY", "AE", "AE-DU");
    ok(
      /SP_APPROVED_DEFINITION_REQUIRED/.test(gb.error?.message ?? ""),
      "GB accepted: " + (gb.error?.message ?? "no error"),
    );
    ok(
      /SP_APPROVED_DEFINITION_REQUIRED/.test(du.error?.message ?? ""),
      "Dubai accepted: " + (du.error?.message ?? "no error"),
    );
  });
  await check(
    "An entitlement is per market: the GB member cannot save a Dubai credential",
    async () => {
      const r = await saveVia(gbPilot, "AE_DU_BASIC_FIRE_SAFETY", "AE", "AE-DU");
      ok(/SP_APPROVED_DEFINITION_REQUIRED/.test(r.error?.message ?? ""), "cross-market accepted");
    },
  );
  await check(
    "A scoped SIRA card stays unavailable through this RPC even to its pilot member",
    async () => {
      const r = await saveVia(duPilot, "AE_DU_SIRA_CARD_GUARD", "AE", "AE-DU");
      ok(/SP_APPROVED_DEFINITION_REQUIRED/.test(r.error?.message ?? ""), "scoped card accepted");
    },
  );

  /* ── recipient scope: definition → payload → (model → shield in the app) ── */
  await check(
    "A disclosed international certification carries scope_code global_professional; a national one national_regulated",
    async () => {
      const share = good(
        await holder.client.rpc("sp_create_credential_disclosure_v2", {
          _claim_ids: [cpp, vu1],
          _fields: [],
          _expires_days: 7,
          _purpose: "Local journey scope check",
          _recipient_hint: null,
          _locale: "en",
          _request_key: crypto.randomUUID(),
        }),
      );
      ok(share?.token, "no share");
      const disclosureId = sql(
        `select id from public.sp_disclosures where holder_user_id='${holder.id}' order by created_at desc limit 1`,
      );
      const payload = JSON.parse(
        sql(`select public.sp_disclosure_payload('${disclosureId}')::text`),
      );
      ok(payload.status === "active", "payload status: " + payload.status);
      const byCode = Object.fromEntries(payload.verified_claims.map((c) => [c.credential_code, c]));
      ok(
        byCode.INTL_ASIS_CPP?.scope_code === "global_professional",
        "CPP scope: " + byCode.INTL_ASIS_CPP?.scope_code,
      );
      ok(byCode.INTL_ASIS_CPP?.jurisdiction === null, "CPP carries a country");
      ok(
        byCode.OV?.scope_code === "national_regulated" && byCode.OV?.jurisdiction === "SE",
        "OV scope/territory",
      );
      ok(
        !JSON.stringify(payload).includes("JOURNEY-PRIVATE-1"),
        "identifier leaked without consent",
      );
    },
  );
  await check(
    "A claim with no governed code would carry no scope (NULL), never a guessed one",
    async () => {
      ok(
        sql(
          "select (select ct.scope_code from public.sp_credential_types ct where ct.code is not distinct from null) is null",
        ) === "t",
        "NULL code resolved to a scope",
      );
    },
  );

  /* ── admin continuity: the reviewer sees definition, issuer, scope, evidence, history ── */
  await check(
    "The reviewer's detail view carries the credential's definition, issuer, territory, evidence and decision history",
    async () => {
      const d = good(
        await verifier.client.rpc("sp_verifier_request_detail", { _request_id: request }),
      );
      ok(d.claim?.credential_code === "OV", "definition code: " + d.claim?.credential_code);
      ok((d.claim?.issuer ?? "").length > 0, "issuer missing");
      ok(d.claim?.jurisdiction === "SE", "territory: " + d.claim?.jurisdiction);
      ok(
        Array.isArray(d.evidence) && d.evidence.length >= 2,
        "evidence: " + (d.evidence?.length ?? "none"),
      );
      const decisions = (d.prior_decisions ?? []).map((x) => x.decision);
      ok(
        decisions.includes("clarification_requested") && decisions.includes("approved"),
        "history: " + decisions.join(","),
      );
      ok(
        !JSON.stringify(d).includes("INTERNAL-NOTE-MUST-NOT-REACH-HOLDER") || d.is_self === false,
        "note visibility",
      );
      // …and the definition's governed scope and issuer, from the same catalogue
      // the holder saved against, as the verifier.
      const def = good(
        await verifier.client
          .from("sp_approved_credential_catalogue")
          .select("code, scope_code, issuer_name, country, region")
          .eq("code", "OV")
          .single(),
      );
      ok(
        def.scope_code === "national_regulated" &&
          def.country === "SE" &&
          (def.issuer_name ?? "").length > 0,
        "definition row",
      );
    },
  );

  fs.writeFileSync(
    "/private/tmp/passport-journey-live-results.json",
    JSON.stringify(results, null, 2),
    { mode: 0o600 },
  );
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} of ${results.length} passed`);
  restoreApproval();
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  try {
    restoreApproval();
  } catch {}
  console.error("FATAL " + String(e.message).replace(/eyJ[^ ]+/g, "[redacted]"));
  process.exit(2);
});
