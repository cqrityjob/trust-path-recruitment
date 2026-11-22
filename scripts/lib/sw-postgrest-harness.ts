// Real PostgREST 14.15 in front of a disposable *ci_test database, with
// locally minted user JWTs, for Security Work service checks. Nothing hosted.
import cp from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SecurityWorkCaller } from "../../src/lib/security-work/services";
import { POSTGREST_14_IMAGE, ensurePinnedImage } from "../registry-image-retry.mjs";

export function requireDisposableDb(): string {
  const db = process.env.TEST_DB ?? "";
  if (!/ci_test/.test(db)) throw new Error("TEST_DB must name a disposable *ci_test database");
  if (!["127.0.0.1", "localhost", undefined].includes(process.env.PGHOST))
    throw new Error("REFUSING: local disposable database only");
  return db;
}

export function psqlFor(db: string) {
  return (sql: string) =>
    cp
      .execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-d", db, "-c", sql], {
        encoding: "utf8",
      })
      .trim();
}
export const asUser = (uid: string) =>
  `SET request.jwt.claim.sub='${uid}'; SET request.jwt.claims='{"sub":"${uid}","role":"authenticated","is_anonymous":false}';`;

export async function startPostgrest(db: string) {
  const psql = psqlFor(db);
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
  // CI (linux/amd64) runs the pinned digest; a local arm64 machine may name the same tag.
  const image = process.env.SW_PGRST_IMAGE?.endsWith(`:${POSTGREST_14_IMAGE.tag}`)
    ? { ref: process.env.SW_PGRST_IMAGE }
    : await ensurePinnedImage(POSTGREST_14_IMAGE);
  const port = await new Promise<number>((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const value = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(value));
    });
  });
  const container = `sw-pgrst-${process.pid}-${port}`;
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
  const stop = () => {
    try {
      cp.execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
    } catch {
      /* already gone */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  };
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
  } catch (error) {
    stop();
    throw error;
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
  return { origin, caller, stop, image: image.ref, tag: POSTGREST_14_IMAGE.tag };
}

export async function failureCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}
