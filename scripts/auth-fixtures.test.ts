import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import {
  HOSTED_TARGET,
  LOCAL_CONTRACT_TARGET,
  OPERATIONAL_ALIASES,
  assertTarget,
  dryRun,
  executeRun,
  planRun,
  readHostedCredentials,
  readPrivateJson,
} from "./auth-fixtures/core.mjs";
import { adminOnlyFetch, officialAdmin } from "./auth-fixtures/admin-adapter.mjs";
import { hostedMain, parseHostedArgs } from "./auth-fixtures/hosted.mjs";
import { parseLocalArgs } from "./auth-fixtures/local-contract.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ri-auth-wrapper-test-"));
fs.chmodSync(root, 0o700);
const originalFetch = globalThis.fetch;
let externalCalls = 0;
beforeAll(() => {
  globalThis.fetch = (() => {
    externalCalls++;
    throw new Error("EXTERNAL_CALL_FORBIDDEN_IN_UNIT_TEST");
  }) as typeof globalThis.fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  fs.rmSync(root, { recursive: true, force: true });
  expect(externalCalls).toBe(0);
});
const directory = () => path.join(root, randomUUID());
const stateOf = (dir: string) => readPrivateJson(path.join(dir, "private-state.json"));
const writeState = (dir: string, state: object) =>
  fs.writeFileSync(path.join(dir, "private-state.json"), JSON.stringify(state), { mode: 0o600 });

type Attributes = {
  id: string;
  email: string;
  password: string;
  email_confirm: boolean;
  app_metadata: {
    ri_auth_fixture: { runId: string; namespace: string; alias: string; intentId: string };
  };
  user_metadata: { display_name: string };
};
type User = Omit<Attributes, "password" | "email_confirm" | "user_metadata"> & {
  email_confirmed_at: string;
  role: string;
  invited_at?: string;
  confirmation_sent_at?: string;
};
function fakeAdmin(onCreate?: (attributes: Attributes) => void) {
  const users = new Map<string, User>();
  const posted: Attributes[] = [];
  return {
    users,
    posted,
    async getUserById(id: string) {
      const user = users.get(id);
      return user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { status: 404 } };
    },
    async createUser(attributes: Attributes) {
      onCreate?.(attributes);
      posted.push(attributes);
      const user: User = {
        id: attributes.id,
        email: attributes.email,
        app_metadata: attributes.app_metadata,
        email_confirmed_at: new Date().toISOString(),
        role: "authenticated",
      };
      users.set(user.id, user);
      return { data: { user }, error: null };
    },
  };
}

describe("canonical target and non-network planning", () => {
  test("accepts only the exact canonical URL and project; local contract is separate", () => {
    expect(() => assertTarget(HOSTED_TARGET)).not.toThrow();
    const denied = [
      "http://wrygicdfxwjnrugduxnt.supabase.co",
      "https://wrygicdfxwjnrugduxnt.supabase.co/",
      "https://wrygicdfxwjnrugduxnt.supabase.co:443",
      "https://wrygicdfxwjnrugduxnt.supabase.co/auth/v1",
      "https://wrygicdfxwjnrugduxnt.supabase.co?x=1",
      "https://wrygicdfxwjnrugduxnt.supabase.co#x",
      "https://user@wrygicdfxwjnrugduxnt.supabase.co",
      "https://wrygicdfxwjnrugduxnt.supabase.co.evil.invalid",
      "https://WRYGICDFXWJNRUGDUXNT.supabase.co",
      LOCAL_CONTRACT_TARGET.url,
    ];
    for (const url of denied)
      expect(() => assertTarget({ ...HOSTED_TARGET, url })).toThrow("TARGET_DENIED");
    expect(() => assertTarget({ ...HOSTED_TARGET, projectRef: "other-project" })).toThrow(
      "TARGET_DENIED",
    );
    expect(() => assertTarget(LOCAL_CONTRACT_TARGET)).toThrow("TARGET_DENIED");
  });

  test("plans exactly eight fresh aliases, random private credentials, redacted manifest and zero requests", async () => {
    const dir = directory();
    const result = await hostedMain(["plan", "--directory", dir]);
    const state = stateOf(dir);
    expect(result.actorCount).toBe(8);
    expect(state.actors.map((actor: { alias: string }) => actor.alias)).toEqual(
      OPERATIONAL_ALIASES,
    );
    expect(
      state.actors.every((actor: { email: string }) =>
        actor.email.endsWith(`@${state.namespace}.invalid`),
      ),
    ).toBe(true);
    expect(new Set(state.actors.map((actor: { password: string }) => actor.password)).size).toBe(8);
    const plan = readPrivateJson(path.join(dir, "plan.json"));
    const manifestText = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
    expect(plan.actors).toHaveLength(8);
    for (const actor of state.actors) {
      expect(manifestText).not.toContain(actor.email);
      expect(manifestText).not.toContain(actor.password);
      expect(JSON.stringify(plan)).not.toContain(actor.password);
    }
    for (const file of ["private-state.json", "manifest.json", "plan.json"]) {
      expect(fs.statSync(path.join(dir, file)).mode & 0o777).toBe(0o600);
    }
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(await hostedMain(["dry-run", "--directory", dir])).toMatchObject({
      actorCount: 8,
      outcome: "dry_run_no_requests",
    });
    const second = planRun({ directory: directory() });
    expect(second.namespace).not.toBe(result.namespace);
    expect(externalCalls).toBe(0);
  });

  test("optional hundred candidates have bounded aliases and no implicit product fixture", () => {
    const dir = directory();
    planRun({ directory: dir, candidateCount: 100 });
    const state = stateOf(dir);
    expect(state.actors).toHaveLength(108);
    expect(state.actors[8].alias).toBe("P001");
    expect(state.actors[107].alias).toBe("P100");
    expect(() => planRun({ directory: directory(), candidateCount: 101 })).toThrow(
      "CANDIDATE_COUNT_DENIED",
    );
  });

  test("execution must be explicit, and CLI cannot select local mode or arbitrary count", () => {
    expect(() =>
      parseHostedArgs([
        "create",
        "--directory",
        directory(),
        "--credentials-file",
        "/private/file",
      ]),
    ).toThrow("EXPLICIT_CREATE_REQUIRED");
    expect(() => parseHostedArgs(["plan", "--directory", directory(), "--execute"])).toThrow(
      "ARGUMENT_OUT_OF_SCOPE",
    );
    expect(() => parseHostedArgs(["plan", "--directory", directory(), "--local"])).toThrow(
      "ARGUMENT_INVALID",
    );
    expect(() =>
      parseHostedArgs(["plan", "--directory", directory(), "--url", LOCAL_CONTRACT_TARGET.url]),
    ).toThrow("TARGET_DENIED");
    expect(() =>
      parseHostedArgs(["plan", "--directory", directory(), "--directory", directory()]),
    ).toThrow("ARGUMENT_DUPLICATED");
    expect(() =>
      parseLocalArgs(["--directory", directory(), "--execute-local-eight"]),
    ).not.toThrow();
    expect(() =>
      parseLocalArgs([
        "--directory",
        directory(),
        "--execute-local-eight",
        "--url",
        HOSTED_TARGET.url,
      ]),
    ).toThrow("LOCAL_EXPLICIT_EIGHT_REQUIRED");
  });
});

describe("private files and credentials", () => {
  test("rejects permissive mode, symlink, hardlink and Git-contained private files", () => {
    const file = path.join(root, "permissions.json");
    fs.writeFileSync(file, "{}", { mode: 0o644 });
    expect(() => readPrivateJson(file)).toThrow("PRIVATE_FILE_PERMISSIONS");
    fs.chmodSync(file, 0o600);
    const symlink = path.join(root, "symlink.json");
    fs.symlinkSync(file, symlink);
    expect(() => readPrivateJson(symlink)).toThrow("PRIVATE_FILE_NOT_REGULAR");
    const hardlink = path.join(root, "hardlink.json");
    fs.linkSync(file, hardlink);
    expect(() => readPrivateJson(hardlink)).toThrow("PRIVATE_FILE_NOT_REGULAR");
    const gitRoot = path.join(root, "git-root");
    fs.mkdirSync(gitRoot, { mode: 0o700 });
    fs.mkdirSync(path.join(gitRoot, ".git"));
    expect(() => planRun({ directory: path.join(gitRoot, "private-run") })).toThrow(
      "PRIVATE_PATH_INSIDE_GIT",
    );
    expect(fs.existsSync(path.join(gitRoot, "private-run"))).toBe(false);
  });

  test("requires private canonical server credential; rejects anon or wrong-project legacy JWT", () => {
    const file = path.join(root, "credential.json");
    const writeCredential = (key: string, url: string = HOSTED_TARGET.url) =>
      fs.writeFileSync(
        file,
        JSON.stringify({ projectRef: HOSTED_TARGET.projectRef, url, serviceRoleKey: key }),
        { mode: 0o600 },
      );
    const jwt = (role: string, ref: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.unit-test-not-a-real-signature`;
    writeCredential(jwt("anon", HOSTED_TARGET.projectRef));
    expect(() => readHostedCredentials(file)).toThrow("SERVER_KEY_INVALID");
    writeCredential(jwt("service_role", "wrong-project"));
    expect(() => readHostedCredentials(file)).toThrow("SERVER_KEY_INVALID");
    writeCredential(jwt("service_role", HOSTED_TARGET.projectRef));
    expect(readHostedCredentials(file)).toStartWith("eyJ");
    writeCredential(`sb_secret_${"fixture".repeat(8)}`);
    expect(readHostedCredentials(file)).toStartWith("sb_secret_");
    writeCredential(`sb_secret_${"fixture".repeat(8)}`, LOCAL_CONTRACT_TARGET.url);
    expect(() => readHostedCredentials(file)).toThrow("TARGET_DENIED");
  });
});

describe("bounded Auth create with durable intent and no duplicate retry", () => {
  test("intent exists before each createUser; eight confirmed users read back; completed repeat only reads", async () => {
    const dir = directory();
    planRun({ directory: dir });
    const admin = fakeAdmin((attributes) => {
      const actor = stateOf(dir).actors.find(
        (candidate: { id: string }) => candidate.id === attributes.id,
      );
      expect(actor.status).toBe("intent_pending");
      expect(actor.password).toBe(attributes.password);
      expect(attributes.email_confirm).toBe(true);
      expect(attributes).not.toHaveProperty("role");
      expect(attributes.app_metadata).not.toHaveProperty("role");
    });
    const result = await executeRun({
      directory: dir,
      target: HOSTED_TARGET,
      createAdmin: () => admin,
    });
    expect(result).toMatchObject({ created: 8, outcome: "completed_auth_only" });
    expect(admin.posted).toHaveLength(8);
    expect(
      stateOf(dir).actors.every((actor: { status: string }) => actor.status === "created"),
    ).toBe(true);
    await executeRun({ directory: dir, target: HOSTED_TARGET, createAdmin: () => admin });
    expect(admin.posted).toHaveLength(8);
    expect(externalCalls).toBe(0);
  });

  test("ambiguous network failure stops immediately; next run cannot create an admin or change IDs/passwords", async () => {
    const dir = directory();
    planRun({ directory: dir });
    const original = stateOf(dir);
    const admin = fakeAdmin(() => {
      throw new Error("private value must never be emitted");
    });
    await expect(
      executeRun({ directory: dir, target: HOSTED_TARGET, createAdmin: () => admin }),
    ).rejects.toThrow("CREATE_OUTCOME_UNKNOWN");
    const stopped = stateOf(dir);
    expect(stopped.actors[0].status).toBe("unknown_outcome");
    expect(stopped.actors[1].status).toBe("planned");
    expect(
      stopped.actors.map((actor: { id: string; password: string }) => [actor.id, actor.password]),
    ).toEqual(
      original.actors.map((actor: { id: string; password: string }) => [actor.id, actor.password]),
    );
    let constructed = 0;
    await expect(
      executeRun({
        directory: dir,
        target: HOSTED_TARGET,
        createAdmin: () => {
          constructed++;
          return admin;
        },
      }),
    ).rejects.toThrow("MANUAL_RECONCILIATION_REQUIRED");
    expect(constructed).toBe(0);
  });

  test("missing or unconfirmed successful response and post-create readback failure remain unknown", async () => {
    for (const failure of ["unconfirmed", "readback"] as const) {
      const dir = directory();
      planRun({ directory: dir });
      const admin = fakeAdmin();
      const normalCreate = admin.createUser;
      admin.createUser = async (attributes) => {
        const result = await normalCreate(attributes);
        if (failure === "unconfirmed") result.data.user.email_confirmed_at = "";
        else admin.users.delete(attributes.id);
        return result;
      };
      await expect(
        executeRun({ directory: dir, target: HOSTED_TARGET, createAdmin: () => admin }),
      ).rejects.toThrow(
        failure === "unconfirmed" ? "CREATE_OUTCOME_UNKNOWN" : "CREATE_READBACK_UNKNOWN",
      );
      expect(stateOf(dir).actors[0].status).toBe("unknown_outcome");
      expect(admin.posted).toHaveLength(1);
    }
  });

  test("UUID collision fails before any POST; durable pending intent and tampered email are rejected", async () => {
    const dir = directory();
    planRun({ directory: dir });
    const state = stateOf(dir);
    const admin = fakeAdmin();
    admin.users.set(state.actors[7].id, {
      id: state.actors[7].id,
      email: "unrelated@synthetic.invalid",
      role: "authenticated",
      email_confirmed_at: "now",
      app_metadata: state.actors[7].app_metadata,
    });
    await expect(
      executeRun({ directory: dir, target: HOSTED_TARGET, createAdmin: () => admin }),
    ).rejects.toThrow("UUID_COLLISION");
    expect(admin.posted).toHaveLength(0);
    for (const mutate of [
      (data: typeof state) => {
        data.actors[0].status = "intent_pending";
      },
      (data: typeof state) => {
        data.actors[0].email = "not-synthetic@example.com";
      },
    ]) {
      const another = directory();
      planRun({ directory: another });
      const data = stateOf(another);
      mutate(data);
      writeState(another, data);
      await expect(
        executeRun({
          directory: another,
          target: HOSTED_TARGET,
          createAdmin: () => {
            throw new Error("must not construct");
          },
        }),
      ).rejects.toThrow();
    }
  });

  test("a concurrent execution cannot pass the private exclusive lock", async () => {
    const dir = directory();
    planRun({ directory: dir });
    const admin = fakeAdmin();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = executeRun({
      directory: dir,
      target: HOSTED_TARGET,
      createAdmin: async () => {
        await gate;
        return admin;
      },
    });
    await expect(
      executeRun({ directory: dir, target: HOSTED_TARGET, createAdmin: () => admin }),
    ).rejects.toThrow("RUN_LOCKED_MANUAL_RECONCILIATION_REQUIRED");
    release();
    await expect(first).resolves.toMatchObject({ created: 8 });
    expect(admin.posted).toHaveLength(8);
    expect(fs.existsSync(path.join(dir, "execution.lock"))).toBe(false);
  });
});

describe("outbound request surface", () => {
  test("permits only exact admin-create and planned UUID read; forbids mail, SQL, redirect and target spoof", async () => {
    const id = randomUUID();
    let forwarded = 0;
    const fetcher = adminOnlyFetch(
      HOSTED_TARGET,
      [id],
      async (_input: unknown, init?: RequestInit) => {
        forwarded++;
        expect(init?.redirect).toBe("error");
        return new Response("{}", { status: 200 });
      },
    );
    await fetcher(`${HOSTED_TARGET.url}/auth/v1/admin/users`, { method: "POST" });
    await fetcher(`${HOSTED_TARGET.url}/auth/v1/admin/users/${id}`, { method: "GET" });
    const forbidden = [
      `${HOSTED_TARGET.url}/auth/v1/invite`,
      `${HOSTED_TARGET.url}/auth/v1/signup`,
      `${HOSTED_TARGET.url}/auth/v1/admin/users/${randomUUID()}`,
      `${HOSTED_TARGET.url}/auth/v1/admin/users?page=1`,
      `${HOSTED_TARGET.url}/rest/v1/rpc/anything`,
      `${HOSTED_TARGET.url}/storage/v1/object/file`,
      "https://example.invalid/auth/v1/admin/users",
    ];
    for (const url of forbidden)
      await expect(fetcher(url, { method: "GET" })).rejects.toThrow("OUTBOUND_REQUEST_DENIED");
    await expect(
      fetcher(`${HOSTED_TARGET.url}/auth/v1/admin/users/${id}`, { method: "DELETE" }),
    ).rejects.toThrow("OUTBOUND_REQUEST_DENIED");
    expect(forwarded).toBe(2);
  });

  for (const failure of ["redirect", "timeout", "unexpected"] as const) {
    test(`official SDK logs only a fixed redacted ${failure} transport error, never credential/body/cause/stack`, async () => {
      const keyCanary = "sb_secret_RI_KEY_CANARY_NOT_A_REAL_CREDENTIAL";
      const passwordCanary = "RI_PASSWORD_CANARY_NOT_A_REAL_PASSWORD";
      const jwtCanary = "eyJ.RI_JWT_CANARY_NOT_A_REAL_TOKEN.fixture";
      const id = randomUUID();
      const captured: unknown[][] = [];
      const previousFetch = globalThis.fetch;
      const previousError = console.error;
      let requests = 0;
      try {
        globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
          requests++;
          expect(init?.redirect).toBe("error");
          expect(init?.signal).toBeInstanceOf(AbortSignal);
          const message = `${failure}:${keyCanary}:${passwordCanary}:${jwtCanary}`;
          const error =
            failure === "timeout"
              ? new DOMException(message, "TimeoutError")
              : failure === "redirect"
                ? new TypeError(message)
                : { message };
          throw Object.assign(error, {
            cause: {
              headers: { authorization: keyCanary },
              body: passwordCanary,
              token: jwtCanary,
            },
            stack: `SYNTHETIC_SECRET_STACK:${keyCanary}:${passwordCanary}:${jwtCanary}`,
          });
        }) as typeof globalThis.fetch;
        console.error = (...args: unknown[]) => {
          captured.push(args);
        };
        const admin = await officialAdmin(HOSTED_TARGET, [id], keyCanary);
        const result = await admin.createUser({
          id,
          email: "fixture@ri-sdk-redaction.invalid",
          password: passwordCanary,
          email_confirm: true,
        });
        expect(requests).toBe(1);
        expect(result.error?.message).toBe("RI_AUTH_FIXTURE_STOP:AUTH_TRANSPORT_UNAVAILABLE");
        expect(captured).toHaveLength(1); // Exercised the installed SDK's actual console.error branch.
        const logged = captured[0][0] as Error;
        expect(logged.stack).toBeUndefined();
        expect(logged).not.toHaveProperty("cause");
        const text = inspect(captured, { depth: 8 });
        for (const canary of [keyCanary, passwordCanary, jwtCanary, "SYNTHETIC_SECRET_STACK"]) {
          expect(text).not.toContain(canary);
          expect(inspect(result.error, { depth: 8 })).not.toContain(canary);
        }
        expect(externalCalls).toBe(0);
      } finally {
        globalThis.fetch = previousFetch;
        console.error = previousError;
      }
    });
  }
});
