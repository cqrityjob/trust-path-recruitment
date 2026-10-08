// Disposable local/CI PostgreSQL only. Actual PostgREST14 transport, not an
// Auth simulator: signed fixture JWTs exercise ordinary RLS roles here. Real
// GoTrue/browser verification is recorded separately for the owned stack.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
const base = process.env.TEST_DB;
if (
  !base ||
  !/^[a-zA-Z0-9_]*ci_test[a-zA-Z0-9_]*$/.test(base) ||
  !["127.0.0.1", "localhost", "::1"].includes(process.env.PGHOST ?? "127.0.0.1")
)
  throw Error("DISPOSABLE_LOCAL_DB_REQUIRED");
const db = `${base}_domain_conflict`,
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ri-conflict-"));
const migration = "supabase/migrations/20270307100000_recruiter_domain_conflict_transport.sql";
const rollback =
  "supabase/rollback/20270307100000_recruiter_domain_conflict_transport_rollback.sql";
const env = { ...process.env, PGDATABASE: db };
const container = `ri-domain-conflict-${crypto.randomBytes(6).toString("hex")}`;
let dockerStarted = false;
const checks = [];
function ok(condition, label) {
  if (!condition) throw Error(`ASSERTION FAILED: ${label}`);
  checks.push(label);
  console.log(`    ok  CONFLICT ${label}`);
}
function sql(text, database = db) {
  return cp
    .execFileSync("psql", ["-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-d", database], {
      env,
      input: text,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    })
    .trim();
}
function fileSql(file) {
  return sql(fs.readFileSync(file, "utf8"));
}
function suite(text, needle, floor, name) {
  const file = path.join(tmp, name + ".sql");
  text = text.replaceAll("\\ir ../rollback/", "\\ir " + path.resolve("supabase/rollback") + "/");
  fs.writeFileSync(file, text, { mode: 0o600 });
  const p = cp.spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", file], {
    env,
    encoding: "utf8",
  });
  const out = p.stdout + p.stderr;
  fs.writeFileSync(path.join(tmp, name + ".log"), out, { mode: 0o600 });
  if (p.status !== 0) throw Error(`${name}: ${out.slice(-6000)}`);
  ok(out.split(needle).length - 1 >= floor, `${name} mandatory ${floor} assertions`);
}
function replaceExpected(text, count) {
  ok((text.match(/40001:/g) ?? []).length === count, `historical expectation count ${count}`);
  return text.replaceAll("40001:", "PT409:");
}
function catalog() {
  return sql(
    `SELECT jsonb_agg(jsonb_build_object('signature',b.signature,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl,'config',p.proconfig,'args',p.proargnames) ORDER BY b.signature) FROM scp_private.interview_conflict_prior_functions b JOIN pg_proc p ON p.oid=b.signature::regprocedure;`,
  );
}
function dataWitness() {
  return sql(
    `SELECT encode(sha256(convert_to(jsonb_build_object('reports',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.scp_interview_reports r),'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY case_id) FROM scp_private.interview_content_snapshots s),'locks',(SELECT jsonb_agg(to_jsonb(l) ORDER BY kind,content_id) FROM scp_private.interview_content_locks l))::text,'UTF8')),'hex');`,
  );
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function race(a, b, label, expectDeadlock = false) {
  const aFile = path.join(tmp, label + "-a.log"),
    bFile = path.join(tmp, label + "-b.log");
  const spawn = (text, file) => {
    const fd = fs.openSync(file, "w", 0o600);
    const child = cp.spawn("psql", ["-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-d", db], {
      env,
      stdio: ["pipe", fd, fd],
    });
    fs.closeSync(fd);
    child.stdin.end(text);
    return { child, done: new Promise((resolve) => child.on("exit", (code) => resolve(code))) };
  };
  const left = spawn(a, aFile);
  for (let n = 0; n < 120; n++) {
    if (fs.readFileSync(aFile, "utf8").includes("RI_RACE_READY")) break;
    if (n === 119) throw Error("RACE_READY_TIMEOUT");
    await sleep(25);
  }
  const right = spawn(b, bFile);
  const [ar, br] = await Promise.all([left.done, right.done]);
  const aa = fs.readFileSync(aFile, "utf8"),
    bb = fs.readFileSync(bFile, "utf8");
  if (expectDeadlock === "engine")
    ok(
      ar !== 0 && br === 0 && aa.includes("40001") && aa.includes("could not serialize"),
      label + " preserves genuine engine40001",
    );
  else if (expectDeadlock)
    ok(
      (aa + bb).includes("deadlock detected") &&
        (aa + bb).includes("40P01") &&
        (ar !== 0 || br !== 0),
      label + " reproduces exact prior deadlock",
    );
  else
    ok(
      ar === 0 && br !== 0 && bb.includes("PT409") && !(aa + bb).includes("deadlock detected"),
      label + " waits then returns finite stale conflict",
    );
}
try {
  sql(`CREATE DATABASE ${db} TEMPLATE ${base}`, "postgres");
  // Preserve the exact old-stage suites: reconstruct legacy cases before450,
  // reinstall450 and this forward patch, then run explicit PT409 expectations.
  fileSql(rollback);
  fileSql("supabase/rollback/20270307090000_interview_content_snapshot_lock_rollback.sql");
  fileSql("supabase/tests/interview_content_snapshot_legacy_fixture.sql");
  fileSql("supabase/migrations/20270307090000_interview_content_snapshot_lock.sql");
  fileSql(migration);
  suite(
    replaceExpected(
      fs.readFileSync(
        "supabase/tests/recruiter_intelligence_interview_foundation_test.sql",
        "utf8",
      ),
      3,
    ),
    "NOTICE:  ok  ",
    56,
    "current-foundation",
  );
  suite(
    replaceExpected(
      fs.readFileSync("supabase/tests/interview_content_snapshot_test.sql", "utf8"),
      1,
    ),
    "NOTICE:  ok  SNAP ",
    94,
    "current-snapshot",
  );
  suite(
    fs.readFileSync("supabase/tests/recruiter_domain_conflict_transport_test.sql", "utf8"),
    "NOTICE:  ok  CONFLICT ",
    31,
    "current-domain",
  );
  // A planted incorrect conflict must fail the real foundation assertion.
  const processSignature = "public.scp_iv_save_session_process(uuid,text,text,timestamptz)";
  const currentProcess = sql(`SELECT pg_get_functiondef('${processSignature}'::regprocedure)`);
  sql(currentProcess.replace("'PT409'", "'P0001'"));
  const negative = cp.spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db], {
    env,
    input: replaceExpected(
      fs.readFileSync(
        "supabase/tests/recruiter_intelligence_interview_foundation_test.sql",
        "utf8",
      ),
      3,
    ),
    encoding: "utf8",
  });
  ok(
    negative.status !== 0 && negative.stderr.includes("P0.32 stale process save refused"),
    "negative control wrong SQLSTATE is rejected",
  );
  sql(currentProcess);
  // Commit one case/session fixture in this disposable clone for actual races.
  const foundation = fs.readFileSync(
    "supabase/tests/recruiter_intelligence_interview_foundation_test.sql",
    "utf8",
  );
  const prefix = foundation
    .slice(0, foundation.indexOf("SELECT pg_temp.ok(NOT (SELECT ai_enabled"))
    .replaceAll("b6030000", "b7080000");
  sql(
    prefix +
      `\nSET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='b7080000-0000-4000-8000-000000000001';
 INSERT INTO fx SELECT 'point',finding_id FROM public.scp_iv_create_manual_finding((SELECT id FROM fx WHERE label='case'),'b7080000-4444-4000-8000-000000000001','unclear','Synthetic dates','What do the dates refer to?',NULL,NULL,'Synthetic application','Synthetic reviewer','Check dates',NULL);
 RESET ROLE; CREATE TABLE public.ri_conflict_test_ids AS SELECT * FROM fx; COMMIT;`,
  );
  // The legacy recruitment fixture is also real SQL, with mail disabled.
  const legacy = fs.readFileSync(
    "supabase/tests/recruiter_domain_conflict_transport_test.sql",
    "utf8",
  );
  sql(legacy.replace(/ROLLBACK;\s*$/, "COMMIT;"));
  const ids = JSON.parse(sql("SELECT jsonb_object_agg(label,id) FROM public.ri_conflict_test_ids"));
  const actor =
    "SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='b7080000-0000-4000-8000-000000000001';";
  const controls = catalog(),
    beforeData = dataWitness();
  const prior = JSON.parse(
    sql(
      `SELECT jsonb_object_agg(signature,definition) FROM scp_private.interview_conflict_prior_functions`,
    ),
  );
  fileSql(rollback);
  ok(
    sql(
      `SELECT bool_and(pg_get_functiondef(key::regprocedure)=value) FROM jsonb_each_text(${"'" + JSON.stringify(prior).replaceAll("'", "''") + "'"}::jsonb)`,
    ) === "t",
    "rollback restores all12 exact prior definitions",
  );
  ok(
    beforeData === dataWitness(),
    "rollback preserves immutable reports/snapshots/locks byte for byte",
  );
  fileSql(migration);
  ok(controls === catalog(), "reapply preserves function definitions/defaults/owners/ACL/config");
  // Test-only delay occurs after the row lock. In the old function the case
  // lock has not yet been acquired, reproducing the measured event-FK cycle.
  sql(`CREATE FUNCTION public.ri_conflict_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='paused' THEN RAISE NOTICE 'RI_RACE_READY';PERFORM pg_sleep(2);END IF;RETURN NEW;END $$;
 CREATE TRIGGER aa_ri_conflict_delay BEFORE UPDATE ON public.scp_interview_sessions FOR EACH ROW EXECUTE FUNCTION public.ri_conflict_delay();`);
  const stateSig = "public.scp_iv_set_session_state(uuid,text,text,text,text)";
  const currentState = sql(`SELECT pg_get_functiondef('${stateSig}'::regprocedure)`);
  const stamp = () =>
    sql(`SELECT updated_at FROM public.scp_interview_sessions WHERE id='${ids.session}'`);
  const pause = () =>
    `\\set VERBOSITY verbose\nBEGIN;SET LOCAL statement_timeout='8s';${actor} SELECT public.scp_iv_set_session_state('${ids.session}','paused');COMMIT;`;
  const processStatement = () =>
    `\\set VERBOSITY verbose\nBEGIN;SET LOCAL statement_timeout='8s';${actor} SELECT * FROM public.scp_iv_save_session_process('${ids.session}','Race process',NULL,'${stamp()}');COMMIT;`;
  sql(prior[stateSig]);
  sql(prior[processSignature]);
  await race(pause(), processStatement(), "prior-session-case", true);
  sql(currentState);
  sql(currentProcess);
  sql(
    `BEGIN;${actor}SELECT public.scp_iv_set_session_state('${ids.session}','in_progress');COMMIT;`,
  );
  await race(pause(), processStatement(), "forward-case-session");
  sql(
    "DROP TRIGGER aa_ri_conflict_delay ON public.scp_interview_sessions;DROP FUNCTION public.ri_conflict_delay()",
  );
  // Direct finding updates preserve the existing permission/stamp contract.
  sql(`CREATE FUNCTION public.ri_conflict_finding_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE NOTICE 'RI_RACE_READY';PERFORM pg_sleep(2);RETURN NEW;END $$;
 CREATE TRIGGER aa_ri_conflict_finding_delay BEFORE UPDATE ON public.scp_interview_findings FOR EACH ROW EXECUTE FUNCTION public.ri_conflict_finding_delay();`);
  await race(
    `\\set VERBOSITY verbose\nBEGIN;SET LOCAL statement_timeout='8s';${actor}UPDATE public.scp_interview_findings SET human_note='Direct review wins' WHERE id='${ids.point}';COMMIT;`,
    `\\set VERBOSITY verbose\nBEGIN;SET LOCAL statement_timeout='8s';${actor}SELECT * FROM public.scp_iv_review_manual_finding('${ids.point}',1,'needs_verification','RPC review',NULL,NULL,NULL);COMMIT;`,
    "direct-rpc-finding",
  );
  sql(
    "DROP TRIGGER aa_ri_conflict_finding_delay ON public.scp_interview_findings;DROP FUNCTION public.ri_conflict_finding_delay()",
  );
  sql(
    "CREATE TABLE public.ri_conflict_engine_witness(id integer PRIMARY KEY,value integer);INSERT INTO public.ri_conflict_engine_witness VALUES(1,0)",
  );
  await race(
    "\\set VERBOSITY verbose\nBEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL statement_timeout='8s';SELECT value FROM public.ri_conflict_engine_witness WHERE id=1;SELECT 'RI_RACE_READY';SELECT pg_sleep(2);UPDATE public.ri_conflict_engine_witness SET value=value+1 WHERE id=1;COMMIT;",
    "\\set VERBOSITY verbose\nBEGIN;SET LOCAL statement_timeout='8s';UPDATE public.ri_conflict_engine_witness SET value=value+1 WHERE id=1;COMMIT;",
    "engine-serialization",
    "engine",
  );
  // Actual PostgREST14.15: no mocks. Envfile0600 keeps credentials/JWT secret
  // out of process arguments, output and evidence. The fixture JWT is local.
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const secret = crypto.randomBytes(48).toString("hex");
  //00_bootstrap uses the older claims GUC. Bridge only a verified fixture sub
  //in this disposable CI database; the real GoTrue stack uses no such helper.
  sql(
    `CREATE FUNCTION public.ri_conflict_request() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub',coalesce(current_setting('request.jwt.claims',true)::jsonb->>'sub',''),true) $$;`,
  );
  const password = encodeURIComponent(process.env.PGPASSWORD ?? "");
  const user = encodeURIComponent(process.env.PGUSER ?? "postgres");
  const envfile = path.join(tmp, "postgrest.env");
  fs.writeFileSync(
    envfile,
    `PGRST_DB_URI=postgresql://${user}:${password}@host.docker.internal:${process.env.PGPORT ?? 5432}/${db}\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_DB_PRE_REQUEST=public.ri_conflict_request\nPGRST_JWT_SECRET=${secret}\nPGRST_SERVER_PORT=3000\nPGRST_LOG_LEVEL=error\n`,
    { mode: 0o600 },
  );
  cp.execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      container,
      "--env-file",
      envfile,
      "--add-host",
      "host.docker.internal:host-gateway",
      "-p",
      `127.0.0.1:${port}:3000`,
      "public.ecr.aws/supabase/postgrest:v14.15",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  dockerStarted = true;
  const origin = `http://127.0.0.1:${port}`;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin)).status === 200) break;
    } catch {}
    if (n === 99) throw Error("ACTUAL_POSTGREST14_START_TIMEOUT");
    await sleep(100);
  }
  function token(uid) {
    const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const body =
      enc({ alg: "HS256", typ: "JWT" }) +
      "." +
      enc({ sub: uid, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 300 });
    return body + "." + crypto.createHmac("sha256", secret).update(body).digest("base64url");
  }
  async function conflict(name, args, message, uid = "b7080000-0000-4000-8000-000000000011") {
    const started = Date.now();
    const response = await fetch(origin + "/rpc/" + name, {
      method: "POST",
      headers: { Authorization: "Bearer " + token(uid), "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (response.status !== 409 || body.code !== "PT409")
      throw Error(`ACTUAL14 ${name}: HTTP${response.status} ${JSON.stringify(body)}`);
    ok(
      response.status === 409 &&
        body.code === "PT409" &&
        body.message === message &&
        Date.now() - started < 5000,
      "actual14 " + name + " finite409 unchanged message",
    );
  }
  const job = "b7080000-2222-4000-8000-000000000011",
    app = "b7080000-3333-4000-8000-000000000011";
  const booking = sql(
    `SELECT id FROM public.recruitment_interview_bookings WHERE application_id='${app}' LIMIT1`.replace(
      "LIMIT1",
      "LIMIT 1",
    ),
  );
  await conflict(
    "rec_set_recruitment_responsible",
    { _job_id: job, _user_id: null, _expected_version: -1 },
    "STALE_VERSION",
  );
  await conflict(
    "rec_complete_recruitment",
    { _job_id: job, _state: "completed", _note: null, _expected_version: -1 },
    "STALE_VERSION",
  );
  await conflict(
    "rec_set_application_responsible",
    { _application_id: app, _user_id: null, _expected_version: -1 },
    "STALE_VERSION",
  );
  await conflict(
    "rec_set_application_stage",
    { _application_id: app, _expected_status: "reviewing", _new_status: "interview", _note: null },
    "STALE_APPLICATION_STAGE",
  );
  await conflict(
    "rec_save_booking",
    {
      _booking_id: booking,
      _application_id: app,
      _starts_at: new Date(Date.now() + 86400000).toISOString(),
      _duration_minutes: 45,
      _timezone: "Europe/Stockholm",
      _location_kind: "phone",
      _location_text: null,
      _meeting_url: null,
      _interviewer_names: "Synthetic",
      _expected_version: -1,
    },
    "STALE_VERSION",
  );
  await conflict(
    "rec_set_booking_status",
    { _booking_id: booking, _status: "cancelled", _reason: null, _expected_version: -1 },
    "STALE_VERSION",
  );
  await conflict(
    "rec_set_receipt_settings",
    { _job_id: job, _enabled: false, _expected_version: -1 },
    "STALE_VERSION",
  );
  await conflict(
    "scp_iv_save_session_process",
    {
      _session_id: ids.session,
      _reflection: "Stale HTTP write",
      _deviations: null,
      _expected_updated_at: "2000-01-01T00:00:00Z",
    },
    "SCP_IV_SESSION_PROCESS_STALE",
    "b7080000-0000-4000-8000-000000000001",
  );
  await conflict(
    "scp_iv_review_manual_finding",
    {
      _finding_id: ids.point,
      _expected_revision: 1,
      _resolution_state: "needs_verification",
      _human_note: "Stale review",
      _responsible_label: null,
      _next_action: null,
      _due_on: null,
    },
    "SCP_IV_FINDING_STALE",
    "b7080000-0000-4000-8000-000000000001",
  );
  const legacyCase = sql("SELECT id FROM public.ri_snapshot_test_cases WHERE label='legacy'");
  await conflict(
    "scp_iv_acknowledge_observed_content",
    { _case_id: legacyCase, _expected_manifest_hash: "wrong", _note: "Synthetic" },
    "SCP_IV_CONTENT_STALE",
    "b7070000-0000-4000-8000-000000000001",
  );
  // Overlap the same two actual HTTP RPCs that caused the original event-FK
  // deadlock. The test-only trigger delays status UPDATE after acquiring locks.
  sql(`BEGIN;${actor}SELECT public.scp_iv_set_session_state('${ids.session}','in_progress');COMMIT;
 CREATE FUNCTION public.ri_conflict_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='paused' THEN PERFORM pg_sleep(2);END IF;RETURN NEW;END $$;
 CREATE TRIGGER aa_ri_conflict_delay BEFORE UPDATE ON public.scp_interview_sessions FOR EACH ROW EXECUTE FUNCTION public.ri_conflict_delay();`);
  const staleStamp = stamp(),
    raceToken = token("b7080000-0000-4000-8000-000000000001");
  const headers = { Authorization: "Bearer " + raceToken, "Content-Type": "application/json" };
  const stateRequest = fetch(origin + "/rpc/scp_iv_set_session_state", {
    method: "POST",
    headers,
    body: JSON.stringify({ _session_id: ids.session, _status: "paused" }),
    signal: AbortSignal.timeout(7000),
  });
  for (let n = 0; n < 80; n++) {
    await sleep(25);
    if (
      sql(
        `SELECT count(*) FROM pg_stat_activity WHERE datname='${db}' AND wait_event='PgSleep' AND query LIKE '%scp_iv_set_session_state%'`,
      ) !== "0"
    )
      break;
    if (n === 79) throw Error("HTTP_RACE_READY_TIMEOUT");
  }
  const raceStart = Date.now();
  const processRequest = fetch(origin + "/rpc/scp_iv_save_session_process", {
    method: "POST",
    headers,
    body: JSON.stringify({
      _session_id: ids.session,
      _reflection: "Must not overwrite pause",
      _deviations: null,
      _expected_updated_at: staleStamp,
    }),
    signal: AbortSignal.timeout(7000),
  });
  const [stateResponse, processResponse] = await Promise.all([stateRequest, processRequest]);
  const processError = await processResponse.json();
  ok(
    stateResponse.status === 200 &&
      processResponse.status === 409 &&
      processError.code === "PT409" &&
      processError.message === "SCP_IV_SESSION_PROCESS_STALE" &&
      Date.now() - raceStart < 6000,
    "actual14 overlapping state/process waits then finite409 without deadlock",
  );
  ok(
    sql(
      `SELECT status='paused' AND process_reflection IS DISTINCT FROM 'Must not overwrite pause' FROM public.scp_interview_sessions WHERE id='${ids.session}'`,
    ) === "t",
    "actual14 winning pause and existing reflection preserved",
  );
  sql(
    "DROP TRIGGER aa_ri_conflict_delay ON public.scp_interview_sessions;DROP FUNCTION public.ri_conflict_delay()",
  );
  ok(
    sql(
      `SELECT count(*) FROM pg_stat_activity WHERE datname='${db}' AND pid<>pg_backend_pid() AND state='active' AND query LIKE '%scp_iv_save_session_process%'`,
    ) === "0",
    "actual14 no continuing stale request",
  );
  // Export only catalog metadata from the current schema, before historical
  // rollback removes the patch. No fixture data, tokens or temporary logs.
  if (process.env.RI_CONFLICT_ARTIFACT_DIR) {
    const dir = path.resolve(process.env.RI_CONFLICT_ARTIFACT_DIR);
    if (!dir.startsWith(path.resolve("artifacts") + path.sep))
      throw Error("CONFLICT_ARTIFACT_PATH_REFUSED");
    fs.mkdirSync(dir, { recursive: true });
    const selector = fs.readFileSync(
      "supabase/tests/recruiter_domain_conflict_catalog.sql",
      "utf8",
    );
    const catalogText = sql(selector);
    fs.writeFileSync(path.join(dir, "current-catalog.txt"), catalogText + "\n");
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(
        {
          sourceCommit: cp.execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
          postgresVersion: sql("SHOW server_version"),
          postgrestImage: "postgrest/postgrest:v14.15",
          migrationSha256: crypto
            .createHash("sha256")
            .update(fs.readFileSync(migration))
            .digest("hex"),
          catalogSha256: crypto
            .createHash("sha256")
            .update(catalogText + "\n")
            .digest("hex"),
          checks,
          scope: "ephemeral PostgreSQL/PostgREST transport; fixture JWT, not GoTrue",
        },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(
    `    ok  CONFLICT ${checks.length} bounded runner assertions; original historical tests remain unchanged`,
  );
} finally {
  if (dockerStarted) cp.spawnSync("docker", ["stop", container], { stdio: "ignore" });
  try {
    sql(`DROP DATABASE IF EXISTS ${db}`, "postgres");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
