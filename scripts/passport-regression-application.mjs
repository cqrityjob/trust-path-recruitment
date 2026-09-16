// Synthetic local regression fixtures only. Fixed loopback API/DB ports prevent hosted execution.
// Prerequisites and evidence paths: docs/passport/regression-migration-evidence/README.md.
import fs from "node:fs";
import cp from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const e = Object.fromEntries(
  fs
    .readFileSync("/private/tmp/passport-phase2-status.env", "utf8")
    .split("\n")
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), JSON.parse(x.slice(i + 1))];
    }),
);
if (e.API_URL !== "http://127.0.0.1:55421") throw Error("LOCAL ONLY");
const admin = createClient(e.API_URL, e.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
function good(r) {
  if (r.error) throw Error(r.error.message);
  return r.data;
}
(async () => {
  const bucket = await admin.storage.getBucket("job-application-cvs");
  if (bucket.error)
    good(
      await admin.storage.createBucket("job-application-cvs", {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ["application/pdf"],
      }),
    );
  for (const project of ["chromium", "mobile-375", "mobile-390"]) {
    const stamp = Date.now().toString(36),
      email = "passport-application-" + stamp + "@fixture.invalid",
      password = crypto.randomBytes(24).toString("base64url");
    const user = good(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Regression Applicant" },
      }),
    ).user;
    const c = createClient(e.API_URL, e.ANON_KEY, { auth: { persistSession: false } });
    good(await c.auth.signInWithPassword({ email, password }));
    good(
      await c.from("profiles").update({ display_name: "Regression Applicant" }).eq("id", user.id),
    );
    good(
      await c
        .from("security_career_profiles")
        .upsert({ user_id: user.id, current_profession_other: "Security guard" }),
    );
    const experience = good(
      await c
        .from("sp_experience_periods")
        .insert({
          holder_user_id: user.id,
          employer_name: "Synthetic Security AB",
          role_title: "Security guard",
          started_on: "2020-01-01",
          employment_type: "full_time",
        })
        .select("id")
        .single(),
    );
    good(
      await c.rpc("cv_create", {
        _operation_id: crypto.randomUUID(),
        _title: "Regression CV",
        _locale: "en",
        _purpose: "general",
        _target_job_text: null,
        _include_career_insight: false,
        _included_ids: [experience.id],
        _contact: { email, phone: "", showEmail: true, showPhone: false },
        _presentation: {},
      }),
    );
    const slugs = [0, 1, 2].map((i) => "regression-application-" + stamp + "-" + i);
    const sql =
      "BEGIN; SELECT set_config('request.jwt.claim.sub','b4000000-0000-4000-8000-00000000ad01',true); " +
      slugs
        .map(
          (slug, i) =>
            "INSERT INTO public.jobs(id,employer_id,slug,short_id,title_sv,title_en,status,application_method,published_at,expires_at) VALUES('" +
            crypto.randomUUID() +
            "','9e000000-0000-4000-8000-00000000000a','" +
            slug +
            "','" +
            stamp.slice(-5) +
            i +
            "','Syntetisk väktare " +
            stamp +
            "-" +
            i +
            "','Synthetic guard " +
            stamp +
            "-" +
            i +
            "','published','internal',now(),now()+interval '30 days');",
        )
        .join("\n") +
      "COMMIT;";
    cp.execFileSync(
      "/opt/homebrew/opt/postgresql@16/bin/psql",
      [e.DB_URL, "-v", "ON_ERROR_STOP=1"],
      { input: sql, stdio: ["pipe", "ignore", "pipe"] },
    );
    const env = {
      ...process.env,
      E2E_BASE_URL: "http://127.0.0.1:3118",
      E2E_SUPABASE_REF: "127",
      E2E_RUN_LIVE: "1",
      E2E_CANDIDATE_EMAIL: email,
      E2E_CANDIDATE_PASSWORD: password,
      E2E_EMPLOYER_EMAIL: "journey@local.test",
      E2E_EMPLOYER_PASSWORD: "LocalJourney!2026",
      E2E_EMPLOYER_SLUG: "journey-ab",
      E2E_JOB_SLUG: slugs[0],
      E2E_JOB_SLUG_CV: slugs[1],
      E2E_JOB_SLUG_CV_PHONE: slugs[2],
      E2E_CANDIDATE_HAS_CQRITYJOB_CV: "1",
    };
    const r = cp.spawnSync(
      "node_modules/.bin/playwright",
      [
        "test",
        "e2e/candidate-to-employer-application.spec.ts",
        "--project=" + project,
        "--workers=1",
        "--trace=off",
        "--output=/private/tmp/passport-application-results-" + project,
      ],
      { env, encoding: "utf8", maxBuffer: 20e6 },
    );
    fs.writeFileSync(
      "/private/tmp/passport-regression-application-" + project + ".log",
      r.stdout + r.stderr,
    );
    console.log(project, r.status);
    if (r.status !== 0) throw Error(project + " browser suite failed");
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
