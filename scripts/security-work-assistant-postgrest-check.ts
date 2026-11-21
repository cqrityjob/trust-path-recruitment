// Security Work assistant over a REAL database and REAL PostgREST 14.15.
//
// What is real: PostgreSQL with the full migration history (RLS, triggers,
// sw_reserve_assistant, the dispatch fence, the HMAC-verified completion, the
// suggestion provenance trigger, sw_decide_suggestion), PostgREST 14.15 with
// locally minted user JWTs, and the application's own server code
// (requestSuggestion / decideSuggestion) talking to it through postgrest-js.
// What is controlled: the provider. The network call is replaced by a stub
// that returns a fixed draft or an unknown outcome and counts every call; no
// provider is contacted and no credential exists. Synthetic data only.
//
// Usage: TEST_DB=<*ci_test database with the current schema> PGHOST/PGPORT/PGUSER
//        [DOCKER_HOST_GATEWAY=192.168.5.2 under colima] bun run <this file>
import assert from "node:assert/strict";
import cp from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PostgrestClient } from "@supabase/postgrest-js";
import { __setGenerativeAiLabOverride } from "../src/lib/ai/generative-ai-gate";
import {
  decideSuggestion,
  requestSuggestion,
} from "../src/lib/security-work/programme/assistant.server";
import type { dispatchProviderOnce } from "../src/lib/security-work/processing/ai.server";
import {
  SW_AI_OUTPUT_VERSION,
  SW_AI_POLICY_VERSION,
  SW_AI_PROMPT_VERSION,
  SW_AI_TASK_VERSION,
} from "../src/lib/security-work/processing/contracts";
import type { SecurityWorkCaller } from "../src/lib/security-work/services";
import { POSTGREST_14_IMAGE, ensurePinnedImage } from "./registry-image-retry.mjs";

const db = process.env.TEST_DB ?? "";
if (!/ci_test/.test(db)) throw new Error("TEST_DB must name a disposable *ci_test database");
if (!["127.0.0.1", "localhost", undefined].includes(process.env.PGHOST))
  throw new Error("REFUSING: local disposable database only");
// Lab only: the provider below is a stub; version 1 refuses every real provider call.
__setGenerativeAiLabOverride(true);

const ids = Array.from(
  { length: 20 },
  (_, i) => `58000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const [EDITOR, OTHER, VIEWER, ACTIVATION, MANDATE] = ids;
const secretWorker = crypto.randomBytes(32).toString("hex");
const env = {
  SW_AI_ENABLED: "true",
  SW_AI_PROVIDER: "anthropic",
  SW_AI_MODEL: "claude-synthetic-pinned-20260101",
  SW_AI_ENVIRONMENT: "internal_qa",
  SW_ANTHROPIC_API_KEY: "synthetic-never-sent",
  SW_WORKER_KEY_ID: "synthetic-postgrest-key",
  SW_WORKER_SECRET: secretWorker,
};
const psql = (sql: string) =>
  cp
    .execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-d", db, "-c", sql], {
      encoding: "utf8",
    })
    .trim();
const as = (uid: string) =>
  `SET request.jwt.claim.sub='${uid}'; SET request.jwt.claims='{"sub":"${uid}","role":"authenticated","is_anonymous":false}';`;

// ---- fixture (superuser for setup only; every assertion runs as a user) ----
psql(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('${EDITOR}','pgrst-editor@example.test',now()),('${OTHER}','pgrst-other@example.test',now()),('${VIEWER}','pgrst-viewer@example.test',now());
 INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '58000000-%';
 INSERT INTO sw_private.worker_keys(key_id,secret) VALUES('${env.SW_WORKER_KEY_ID}','${secretWorker}');`);
const workspace = psql(
  `${as(EDITOR)} SET ROLE authenticated; SELECT sw_create_personal_workspace('PostgREST assistant workspace');`,
)
  .split("\n")
  .pop()!;
psql(`${as(EDITOR)}
 INSERT INTO sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES('${workspace}','${OTHER}','editor',true),('${workspace}','${VIEWER}','viewer',false);
 INSERT INTO sw_ai_activations(id,workspace_id,environment,purpose,provider,model,task_version,prompt_version,policy_version,output_schema_version,data_processing_approval,approved_by,valid_until,max_cost_micros,daily_budget_micros,max_output_tokens,timeout_ms)
 VALUES('${ACTIVATION}','${workspace}','${env.SW_AI_ENVIRONMENT}','draft_analysis','${env.SW_AI_PROVIDER}','${env.SW_AI_MODEL}','${SW_AI_TASK_VERSION}','${SW_AI_PROMPT_VERSION}','${SW_AI_POLICY_VERSION}','${SW_AI_OUTPUT_VERSION}','Synthetic approval only','${EDITOR}',now()+interval '1 hour',100,1000,2048,10000);
 SET ROLE authenticated;
 INSERT INTO sw_security_mandates(id,workspace_id,organisation_description,geographic_scope) VALUES('${MANDATE}','${workspace}','Synthetic logistics company','Sweden');`);

// ---- real PostgREST 14.15 ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sw-pgrst-"));
const jwtSecret = crypto.randomBytes(48).toString("hex");
psql(
  `CREATE OR REPLACE FUNCTION public.sw_pgrst_test_request() RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub',coalesce(current_setting('request.jwt.claims',true)::jsonb->>'sub',''),true) $$;`,
);
const envfile = path.join(tmp, "postgrest.env");
fs.writeFileSync(
  envfile,
  `PGRST_DB_URI=postgresql://${encodeURIComponent(process.env.PGUSER ?? "postgres")}:${encodeURIComponent(process.env.PGPASSWORD ?? "")}@host.docker.internal:${process.env.PGPORT ?? 5432}/${db}\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_DB_PRE_REQUEST=public.sw_pgrst_test_request\nPGRST_JWT_SECRET=${jwtSecret}\nPGRST_SERVER_PORT=3000\nPGRST_LOG_LEVEL=error\n`,
  { mode: 0o600 },
);
// CI (linux/amd64) runs the pinned digest. A local arm64 machine may name the
// same 14.15 tag for its own platform; the run says which image it used.
const image = process.env.SW_PGRST_IMAGE?.endsWith(`:${POSTGREST_14_IMAGE.tag}`)
  ? { ref: process.env.SW_PGRST_IMAGE }
  : await ensurePinnedImage(POSTGREST_14_IMAGE);
console.log(`    ..  PostgREST image ${image.ref}`);
const port = await new Promise<number>((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const value = (server.address() as net.AddressInfo).port;
    server.close(() => resolve(value));
  });
});
const container = `sw-assistant-pgrst-${process.pid}`;
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
    `host.docker.internal:${process.env.DOCKER_HOST_GATEWAY ?? "host-gateway"}`,
    "-p",
    `127.0.0.1:${port}:3000`,
    image.ref,
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const origin = `http://127.0.0.1:${port}`;
let checks = 0;
try {
  for (let n = 0; ; n++) {
    try {
      if ((await fetch(origin)).status === 200) break;
    } catch {
      /* not up yet */
    }
    if (n > 150) throw new Error("PostgREST did not start");
    await new Promise((r) => setTimeout(r, 200));
  }
  const token = (uid: string) => {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: uid, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })}`;
    return `${body}.${crypto.createHmac("sha256", jwtSecret).update(body).digest("base64url")}`;
  };
  const caller = (uid: string) =>
    ({
      supabase: new PostgrestClient(origin, { headers: { Authorization: `Bearer ${token(uid)}` } }),
      userId: uid,
    }) as unknown as SecurityWorkCaller;

  const draft = { text: "Synthetic mandate text.", caveats: [] };
  let providerCalls = 0;
  const provider = (outcome: "succeeded" | "outcome_unknown", delayMs = 0) =>
    (async (_c, prepare, options) => {
      const prepared = prepare();
      await options?.beforeDispatch?.(new AbortController().signal);
      providerCalls += 1;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return outcome === "succeeded"
        ? {
            status: "succeeded",
            output: prepared.parse(draft),
            provider: "anthropic",
            model: env.SW_AI_MODEL,
            usage: { inputTokens: 10, outputTokens: 20, costMicros: null },
          }
        : {
            status: "outcome_unknown",
            errorCode: "deadline",
            usage: { inputTokens: null, outputTokens: null, costMicros: null },
          };
    }) as typeof dispatchProviderOnce;
  const req = (requestId: string, over: Record<string, unknown> = {}) => ({
    workspaceId: workspace,
    capability: "mandate_draft" as const,
    contextKind: "mandate" as const,
    contextId: null,
    requestText: "Draft our mandate",
    requestId,
    ...over,
  });
  const code = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return "OK";
    } catch (error) {
      return (error as { code?: string }).code ?? String(error);
    }
  };
  const check = async (label: string, run: () => Promise<void>) => {
    await run();
    checks += 1;
    console.log(`    ok  SW-AST-PGRST ${label}`);
  };
  const count = (sql: string) => Number(psql(sql));

  await check("anon cannot reach the reservation RPC", async () => {
    const response = await fetch(`${origin}/rpc/sw_reserve_assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.ok([401, 403, 404].includes(response.status), `status ${response.status}`);
  });

  const first = ids[10];
  await check("a request reserves, dispatches once and stores the signed result", async () => {
    providerCalls = 0;
    const suggestion = await requestSuggestion(caller(EDITOR), req(first), env, {
      dispatch: provider("succeeded"),
    });
    assert.equal(suggestion.id, first);
    assert.equal(providerCalls, 1);
    assert.equal(
      psql(
        `SELECT status||'|'||kind||'|'||(output = '${JSON.stringify(draft)}'::jsonb) FROM sw_processing_jobs WHERE id='${first}'`,
      ),
      "succeeded|assistant|true",
    );
    assert.equal(psql(`SELECT job_id FROM sw_ai_suggestions WHERE id='${first}'`), first);
  });

  await check(
    "a retry returns the stored result with no provider call and no new job",
    async () => {
      providerCalls = 0;
      const again = await requestSuggestion(caller(EDITOR), req(first), env, {
        dispatch: provider("succeeded"),
      });
      assert.equal(again.id, first);
      assert.equal(providerCalls, 0);
      assert.equal(
        count(`SELECT count(*) FROM sw_processing_jobs WHERE workspace_id='${workspace}'`),
        1,
      );
    },
  );

  await check("the same id with a different capability or question is CONFLICT", async () => {
    providerCalls = 0;
    assert.equal(
      await code(
        requestSuggestion(
          caller(EDITOR),
          req(first, { capability: "mandate_ceo_questions" }),
          env,
          { dispatch: provider("succeeded") },
        ),
      ),
      "CONFLICT",
    );
    assert.equal(
      await code(
        requestSuggestion(caller(EDITOR), req(first, { requestText: "Another question" }), env, {
          dispatch: provider("succeeded"),
        }),
      ),
      "CONFLICT",
    );
    assert.equal(providerCalls, 0);
  });

  await check(
    "after the workspace context changed, the same intent still recovers its result",
    async () => {
      psql(
        `${as(EDITOR)} SET ROLE authenticated; UPDATE sw_security_mandates SET organisation_description='Changed after the answer' WHERE id='${MANDATE}';`,
      );
      providerCalls = 0;
      const again = await requestSuggestion(
        caller(EDITOR),
        req(first, { requestText: "  Draft   our mandate " }),
        env,
        {
          dispatch: provider("succeeded"),
        },
      );
      assert.equal(again.id, first);
      assert.equal(providerCalls, 0);
    },
  );

  const lost = ids[11];
  await check(
    "a lost answer is outcome_unknown; checking again sends nothing and keeps the reservation",
    async () => {
      providerCalls = 0;
      assert.equal(
        await code(
          requestSuggestion(caller(EDITOR), req(lost, { requestText: "Second question" }), env, {
            dispatch: provider("outcome_unknown"),
          }),
        ),
        "AI_OUTCOME_UNKNOWN",
      );
      assert.equal(providerCalls, 1);
      assert.equal(
        await code(
          requestSuggestion(caller(EDITOR), req(lost, { requestText: "Second question" }), env, {
            dispatch: provider("succeeded"),
          }),
        ),
        "AI_OUTCOME_UNKNOWN",
      );
      assert.equal(providerCalls, 1, "checking again made no provider call");
      assert.equal(
        psql(
          `SELECT status||'|'||reserved_cost_micros||'|'||coalesce(actual_cost_micros::text,'null') FROM sw_processing_jobs WHERE id='${lost}'`,
        ),
        "outcome_unknown|100|null",
      );
      assert.equal(count(`SELECT count(*) FROM sw_ai_suggestions WHERE id='${lost}'`), 0);
    },
  );

  await check("a new explicit request is a separate, separately reserved operation", async () => {
    providerCalls = 0;
    const fresh = ids[12];
    const suggestion = await requestSuggestion(
      caller(EDITOR),
      req(fresh, { requestText: "Second question" }),
      env,
      {
        dispatch: provider("succeeded"),
      },
    );
    assert.equal(suggestion.id, fresh);
    assert.equal(providerCalls, 1);
    assert.equal(
      count(
        `SELECT count(*) FROM sw_processing_jobs WHERE workspace_id='${workspace}' AND reserved_cost_micros=100`,
      ),
      3,
    );
  });

  await check("two concurrent requests with one id cause exactly one provider call", async () => {
    providerCalls = 0;
    const same = ids[13];
    const results = await Promise.all([
      code(
        requestSuggestion(caller(EDITOR), req(same, { requestText: "Concurrent" }), env, {
          dispatch: provider("succeeded", 400),
        }),
      ),
      code(
        requestSuggestion(caller(EDITOR), req(same, { requestText: "Concurrent" }), env, {
          dispatch: provider("succeeded", 400),
        }),
      ),
    ]);
    assert.equal(providerCalls, 1, `calls ${providerCalls}, results ${results.join(",")}`);
    assert.equal(count(`SELECT count(*) FROM sw_processing_jobs WHERE id='${same}'`), 1);
  });

  await check("a viewer cannot start billable work", async () => {
    assert.equal(
      await code(
        requestSuggestion(caller(VIEWER), req(ids[14]), env, { dispatch: provider("succeeded") }),
      ),
      "ACCESS_DENIED",
    );
  });

  await check(
    "a decision over PostgREST applies once; a second approver gets CONFLICT",
    async () => {
      const decided = await decideSuggestion(caller(EDITOR), {
        workspaceId: workspace,
        suggestionId: first,
        version: 1,
        status: "approved",
        decision_note: "",
        apply: {
          kind: "mandate_document",
          version: Number(psql(`SELECT version FROM sw_security_mandates WHERE id='${MANDATE}'`)),
        },
      });
      assert.equal(decided.status, "approved");
      assert.equal(
        psql(`SELECT mandate_document FROM sw_security_mandates WHERE id='${MANDATE}'`),
        draft.text,
      );
      assert.equal(
        await code(
          decideSuggestion(caller(OTHER), {
            workspaceId: workspace,
            suggestionId: first,
            version: 1,
            status: "rejected",
            decision_note: "",
            apply: { kind: "none" },
          }),
        ),
        "CONFLICT",
      );
    },
  );
} finally {
  try {
    cp.execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  } catch {
    /* already gone */
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
assert.ok(checks >= 9, `only ${checks} checks ran`);
console.log(
  `    ok  ${checks} assistant checks over real PostgreSQL and PostgREST ${POSTGREST_14_IMAGE.tag}; provider stubbed`,
);
