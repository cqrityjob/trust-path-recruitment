import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";

export const HOSTED_TARGET = Object.freeze({
  kind: "hosted",
  projectRef: "wrygicdfxwjnrugduxnt",
  url: "https://wrygicdfxwjnrugduxnt.supabase.co",
});
export const LOCAL_CONTRACT_TARGET = Object.freeze({
  kind: "local_contract",
  projectRef: "cqj-ri-real-20261008b",
  url: "http://127.0.0.1:55690",
});
export const OPERATIONAL_ALIASES = Object.freeze(["O1", "A1", "R1", "M1", "C1", "C2", "X2", "V1"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NAMESPACE = /^ri-auth-[0-9]{8}-[0-9a-f]{24}$/;
const FILES = Object.freeze({
  state: "private-state.json",
  plan: "plan.json",
  manifest: "manifest.json",
});
const STATES = new Set([
  "planned",
  "intent_pending",
  "created",
  "unknown_outcome",
  "collision",
  "readback_failed",
]);

export class FixtureStop extends Error {
  constructor(code) {
    super(`RI_AUTH_FIXTURE_STOP:${code}`);
    this.name = "FixtureStop";
    this.code = code;
  }
}
const stop = (code) => {
  throw new FixtureStop(code);
};

export function assertTarget(target, expected = HOSTED_TARGET) {
  if (
    !target ||
    target.kind !== expected.kind ||
    target.projectRef !== expected.projectRef ||
    target.url !== expected.url
  ) {
    stop("TARGET_DENIED");
  }
}

function outsideGit(filePath) {
  let cursor = path.dirname(filePath);
  while (true) {
    if (fs.existsSync(path.join(cursor, ".git"))) stop("PRIVATE_PATH_INSIDE_GIT");
    const parent = path.dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

function ownedRegular(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) stop("PRIVATE_FILE_NOT_REGULAR");
  if ((stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid())
    stop("PRIVATE_FILE_PERMISSIONS");
  outsideGit(fs.realpathSync(filePath));
}

export function readPrivateJson(filePath) {
  try {
    ownedRegular(filePath);
    const fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.uid !== process.getuid()
      ) {
        stop("PRIVATE_FILE_PERMISSIONS");
      }
      if (stat.size > 256 * 1024) stop("PRIVATE_FILE_TOO_LARGE");
      return JSON.parse(fs.readFileSync(fd, "utf8"));
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    if (error instanceof FixtureStop) throw error;
    stop("PRIVATE_FILE_UNREADABLE");
  }
}

export function privateDirectory(directory, create = false) {
  try {
    const absolute = path.resolve(directory);
    if (create) {
      outsideGit(
        path.join(
          fs.realpathSync(path.dirname(absolute)),
          path.basename(absolute),
          "private-state.json",
        ),
      );
      fs.mkdirSync(absolute, { mode: 0o700 }); // existing directories are deliberately rejected for a new run
    }
    const stat = fs.lstatSync(absolute);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o700
    ) {
      stop("PRIVATE_DIRECTORY_PERMISSIONS");
    }
    const real = fs.realpathSync(absolute);
    outsideGit(path.join(real, "private-state.json"));
    return real;
  } catch (error) {
    if (error instanceof FixtureStop) throw error;
    stop("PRIVATE_DIRECTORY_UNAVAILABLE");
  }
}

function writePrivateJson(directory, name, value) {
  const target = path.join(privateDirectory(directory), name);
  if (fs.existsSync(target)) ownedRegular(target);
  const temporary = path.join(directory, `.${name}.${randomUUID()}.tmp`);
  const fd = fs.openSync(
    temporary,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    0o600,
  );
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, target);
  const parent = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(parent);
  } finally {
    fs.closeSync(parent);
  }
}

function aliases(candidateCount) {
  if (![0, 100].includes(candidateCount)) stop("CANDIDATE_COUNT_DENIED");
  return [
    ...OPERATIONAL_ALIASES,
    ...Array.from({ length: candidateCount }, (_, i) => `P${String(i + 1).padStart(3, "0")}`),
  ];
}

function validateState(state, target) {
  assertTarget(state.target, target);
  if (
    state.version !== 1 ||
    !UUID.test(state.runId) ||
    !NAMESPACE.test(state.namespace) ||
    !Array.isArray(state.actors) ||
    ![8, 108].includes(state.actors.length)
  ) {
    stop("STATE_INVALID");
  }
  const expectedAliases = aliases(state.actors.length - 8);
  const seenIds = new Set();
  const seenPasswords = new Set();
  for (const [i, actor] of state.actors.entries()) {
    if (
      actor.alias !== expectedAliases[i] ||
      actor.email !== `${actor.alias.toLowerCase()}@${state.namespace}.invalid` ||
      !UUID.test(actor.id) ||
      !UUID.test(actor.intentId) ||
      !/^[A-Za-z0-9_-]{48}$/.test(actor.password) ||
      !STATES.has(actor.status) ||
      seenIds.has(actor.id) ||
      seenPasswords.has(actor.password)
    ) {
      stop("STATE_INVALID");
    }
    seenIds.add(actor.id);
    seenPasswords.add(actor.password);
  }
  return state;
}

export function manifestOf(state) {
  return {
    version: 1,
    runId: state.runId,
    namespace: state.namespace,
    target: state.target,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    outcome: state.outcome,
    actors: state.actors.map(({ alias, id, intentId, status, readbackVerifiedAt }) => ({
      alias,
      id,
      intentId,
      status,
      ...(readbackVerifiedAt ? { readbackVerifiedAt } : {}),
    })),
  };
}

function persist(directory, state) {
  state.updatedAt = new Date().toISOString();
  // Private journal is authoritative; a crash before the derived manifest is written cannot permit another create.
  writePrivateJson(directory, FILES.state, state);
  writePrivateJson(directory, FILES.manifest, manifestOf(state));
}

export function planRun({ directory, target = HOSTED_TARGET, candidateCount = 0 }) {
  // Both callers choose one of the two exact targets; the hosted CLI only ever passes HOSTED_TARGET.
  assertTarget(target, target.kind === "local_contract" ? LOCAL_CONTRACT_TARGET : HOSTED_TARGET);
  const now = new Date().toISOString();
  const namespace = `ri-auth-${now.slice(0, 10).replaceAll("-", "")}-${randomBytes(12).toString("hex")}`;
  const state = {
    version: 1,
    runId: randomUUID(),
    namespace,
    target: { ...target },
    createdAt: now,
    updatedAt: now,
    outcome: "planned_no_requests",
    actors: aliases(candidateCount).map((alias) => ({
      alias,
      id: randomUUID(),
      intentId: randomUUID(),
      email: `${alias.toLowerCase()}@${namespace}.invalid`,
      password: randomBytes(36).toString("base64url"),
      status: "planned",
    })),
  };
  validateState(state, target);
  const root = privateDirectory(directory, true);
  persist(root, state);
  writePrivateJson(root, FILES.plan, {
    ...manifestOf(state),
    actors: state.actors.map(({ alias, id, email }) => ({ alias, id, email })),
    scope: "Auth users only; aliases do not assign platform or employer permissions",
  });
  return {
    directory: root,
    runId: state.runId,
    namespace,
    actorCount: state.actors.length,
    outcome: state.outcome,
  };
}

export function dryRun(directory) {
  const root = privateDirectory(directory);
  const state = validateState(readPrivateJson(path.join(root, FILES.state)), HOSTED_TARGET);
  return {
    runId: state.runId,
    namespace: state.namespace,
    actorCount: state.actors.length,
    outcome: "dry_run_no_requests",
  };
}

export function readHostedCredentials(filePath) {
  const credentials = readPrivateJson(filePath);
  assertTarget({ kind: "hosted", projectRef: credentials.projectRef, url: credentials.url });
  if (typeof credentials.serviceRoleKey !== "string" || credentials.serviceRoleKey.length < 32)
    stop("SERVER_KEY_INVALID");
  // Both legacy service_role JWTs and current secret API keys are server credentials. Do not parse or emit either.
  if (
    !credentials.serviceRoleKey.startsWith("eyJ") &&
    !credentials.serviceRoleKey.startsWith("sb_secret_")
  ) {
    stop("SERVER_KEY_INVALID");
  }
  if (credentials.serviceRoleKey.startsWith("eyJ")) {
    try {
      const claims = JSON.parse(
        Buffer.from(credentials.serviceRoleKey.split(".")[1], "base64url").toString("utf8"),
      );
      if (claims.role !== "service_role" || claims.ref !== HOSTED_TARGET.projectRef)
        stop("SERVER_KEY_INVALID");
    } catch {
      stop("SERVER_KEY_INVALID");
    }
  }
  return credentials.serviceRoleKey;
}

function markerFor(state, actor) {
  return {
    runId: state.runId,
    namespace: state.namespace,
    alias: actor.alias,
    intentId: actor.intentId,
  };
}

function matchesUser(user, state, actor) {
  const marker = user?.app_metadata?.ri_auth_fixture;
  return (
    user?.id === actor.id &&
    user.email === actor.email &&
    !!user.email_confirmed_at &&
    marker?.runId === state.runId &&
    marker.namespace === state.namespace &&
    marker.alias === actor.alias &&
    marker.intentId === actor.intentId &&
    user.role === "authenticated" &&
    !user.invited_at &&
    !user.confirmation_sent_at
  );
}

function isAbsent(result) {
  return result?.error?.status === 404 && !result?.data?.user;
}

/** The adapter exposes only two official Auth-admin methods, never SQL/RPC/Storage/invite. */
export async function executeRun({ directory, target, createAdmin }) {
  assertTarget(target, target.kind === "local_contract" ? LOCAL_CONTRACT_TARGET : HOSTED_TARGET);
  const root = privateDirectory(directory);
  const lock = path.join(root, "execution.lock");
  let lockFd;
  try {
    lockFd = fs.openSync(
      lock,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
  } catch {
    stop("RUN_LOCKED_MANUAL_RECONCILIATION_REQUIRED");
  }
  try {
    const state = validateState(readPrivateJson(path.join(root, FILES.state)), target);
    // Pending/unknown writes survive process termination. No client is constructed and no retry is issued.
    if (state.actors.some((actor) => !["planned", "created"].includes(actor.status))) {
      stop("MANUAL_RECONCILIATION_REQUIRED");
    }
    const admin = await createAdmin(
      target,
      state.actors.map((actor) => actor.id),
    );
    if (
      !admin ||
      typeof admin.getUserById !== "function" ||
      typeof admin.createUser !== "function"
    ) {
      stop("ADMIN_ADAPTER_INVALID");
    }
    // Check every planned UUID before the first POST. Email collisions are rejected by createUser and stop the run.
    // No unbounded listUsers scan, no existing user update or delete, and no recovery by creating a new UUID.
    for (const actor of state.actors) {
      let existing;
      try {
        existing = await admin.getUserById(actor.id);
      } catch {
        stop("PREFLIGHT_READ_FAILED");
      }
      if (actor.status === "created") {
        if (existing?.error || !matchesUser(existing?.data?.user, state, actor)) {
          actor.status = "readback_failed";
          state.outcome = "stopped_readback_failed";
          persist(root, state);
          stop("READBACK_MISMATCH");
        }
      } else if (!isAbsent(existing)) {
        actor.status = existing?.data?.user ? "collision" : "readback_failed";
        state.outcome = "stopped_preflight";
        persist(root, state);
        stop(existing?.data?.user ? "UUID_COLLISION" : "PREFLIGHT_READ_FAILED");
      }
    }
    for (const actor of state.actors) {
      if (actor.status === "created") continue;
      actor.status = "intent_pending";
      state.outcome = "creating";
      persist(root, state); // Durable intent, UUID and password BEFORE any potentially successful POST.
      let result;
      try {
        result = await admin.createUser({
          id: actor.id,
          email: actor.email,
          password: actor.password,
          email_confirm: true,
          app_metadata: { ri_auth_fixture: markerFor(state, actor) },
          user_metadata: { display_name: `RI synthetic ${actor.alias}` },
        });
      } catch {
        actor.status = "unknown_outcome";
        state.outcome = "stopped_unknown_outcome";
        persist(root, state);
        stop("CREATE_OUTCOME_UNKNOWN");
      }
      if (result?.error || !matchesUser(result?.data?.user, state, actor)) {
        actor.status = "unknown_outcome";
        state.outcome = "stopped_unknown_outcome";
        persist(root, state);
        stop("CREATE_OUTCOME_UNKNOWN");
      }
      // A returned success is still not marked created until an independent Auth-admin read agrees.
      let readback;
      try {
        readback = await admin.getUserById(actor.id);
      } catch {
        actor.status = "unknown_outcome";
        state.outcome = "stopped_unknown_outcome";
        persist(root, state);
        stop("CREATE_READBACK_UNKNOWN");
      }
      if (readback?.error || !matchesUser(readback?.data?.user, state, actor)) {
        actor.status = "unknown_outcome";
        state.outcome = "stopped_unknown_outcome";
        persist(root, state);
        stop("CREATE_READBACK_UNKNOWN");
      }
      actor.status = "created";
      actor.readbackVerifiedAt = new Date().toISOString();
      persist(root, state);
    }
    state.outcome = "completed_auth_only";
    persist(root, state);
    return {
      runId: state.runId,
      namespace: state.namespace,
      created: state.actors.length,
      outcome: state.outcome,
    };
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}
