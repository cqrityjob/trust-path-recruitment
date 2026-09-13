/**
 * The LOCAL routed-evidence gateway.
 *
 * One origin, exactly the shape `supabase start` publishes, so the checked-in
 * application code, the checked-in Supabase client and the real routes run
 * against it unmodified:
 *
 *   /auth/v1/*   handled here  -- password sign-in, token refresh, /user, logout
 *   /rest/v1/*   proxied       -- to a real PostgREST, which enforces the real RLS
 *
 * WHAT IS REAL AND WHAT IS NOT
 *
 *   REAL: PostgreSQL 16 carrying the full migration history; PostgREST 12.2.3
 *   speaking to it as `authenticator`; every RLS policy, every GRANT, every
 *   SECURITY DEFINER RPC; the application, its routes and its server functions.
 *
 *   SUBSTITUTED: GoTrue. Its container image is unreachable from the
 *   environment this evidence was captured in -- every registry blob CDN
 *   answers 403 -- so the four endpoints the walk uses are implemented here
 *   against the same auth.users rows a real GoTrue would read, with the same
 *   bcrypt verification and the same HS256 secret PostgREST verifies with.
 *
 * Loopback only: the process refuses to start if either the database or
 * PostgREST is anywhere else.
 */

import { createServer } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";

/** Run psql with the script on stdin, so psql's own :'name' quoting applies. */
function psql(args, script) {
  return new Promise((resolve, reject) => {
    const child = execFile("psql", args, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}\n${stderr}`;
        reject(error);
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(script);
  });
}

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? "http://127.0.0.1:3000";
const SECRET = process.env.LOCAL_JWT_SECRET;
const DB_URL = process.env.LOCAL_DB_URL;
const ACCESS_TTL = 3600;

if (!SECRET || SECRET.length < 32) {
  console.error("GATEWAY REFUSED: LOCAL_JWT_SECRET must be at least 32 characters.");
  process.exit(1);
}
if (!DB_URL || !/@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)) {
  console.error(`GATEWAY REFUSED: LOCAL_DB_URL is not loopback: ${DB_URL}`);
  process.exit(1);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(POSTGREST)) {
  console.error(`GATEWAY REFUSED: POSTGREST_URL is not loopback: ${POSTGREST}`);
  process.exit(1);
}

// -- JWT, HS256, the same secret PostgREST verifies with --------------------

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function sign(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verify(token) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  const expected = b64url(createHmac("sha256", SECRET).update(`${parts[0]}.${parts[1]}`).digest());
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

/** A GoTrue-shaped access token. The claim names are what RLS and PostgREST read. */
function accessToken(user, sessionId) {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    iss: `http://127.0.0.1:${PORT}/auth/v1`,
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    phone: "",
    exp: now + ACCESS_TTL,
    iat: now,
    session_id: sessionId,
    is_anonymous: false,
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.user_metadata ?? {},
  });
}

/** The anon key: a real JWT for the `anon` role, as the local stack publishes one. */
export function anonKey(secret = SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ iss: "supabase-local", role: "anon", iat: now, exp: now + 60 * 60 * 24 * 7 }),
  );
  const sig = b64url(createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

// -- the database, through psql, with psql's own parameter quoting ----------

async function query(sql, params = {}) {
  // Through stdin, not -c: psql interpolates :'name' only for input it reads
  // as a script, and that interpolation -- which quotes and escapes the value
  // as a literal -- is the whole reason a password never reaches the SQL text
  // by concatenation.
  const args = ["-tAq", "-v", "ON_ERROR_STOP=1", "-d", DB_URL];
  for (const [k, v] of Object.entries(params)) args.push("--set", `${k}=${v}`);
  return (await psql(args, sql)).trim();
}

/** One row as JSON, or null. */
async function queryJson(sql, params) {
  const out = await query(sql, params);
  return out ? JSON.parse(out) : null;
}

const USER_JSON =
  "json_build_object('id', u.id, 'email', u.email, 'user_metadata', coalesce(u.raw_user_meta_data, '{}'::jsonb))";

/** Verify an email and password against auth.users, in the database, with bcrypt. */
async function authenticate(email, password) {
  const sql = (cryptFn) => `
    SELECT ${USER_JSON}
      FROM auth.users u
     WHERE u.email = :'email'
       AND u.encrypted_password IS NOT NULL
       AND u.encrypted_password = ${cryptFn}(:'password', u.encrypted_password)
       AND u.email_confirmed_at IS NOT NULL
       AND (u.banned_until IS NULL OR u.banned_until < now())`;
  try {
    return await queryJson(sql("extensions.crypt"), { email, password });
  } catch {
    // pgcrypto lives in `public` on a bare cluster and in `extensions` on a
    // Supabase one. Try the other rather than assume which.
    return await queryJson(sql("public.crypt"), { email, password });
  }
}

async function userById(id) {
  return queryJson(`SELECT ${USER_JSON} FROM auth.users u WHERE u.id = :'id'::uuid`, { id });
}

/** The user object GoTrue returns. */
function userBody(user) {
  const now = new Date().toISOString();
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: user.user_metadata ?? {},
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function sessionBody(user) {
  const sessionId = randomUUID();
  return {
    access_token: accessToken(user, sessionId),
    token_type: "bearer",
    expires_in: ACCESS_TTL,
    expires_at: Math.floor(Date.now() / 1000) + ACCESS_TTL,
    refresh_token: `local.${user.id}.${sessionId}`,
    user: userBody(user),
  };
}

// -- HTTP -------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,range,x-supabase-api-version",
  "Access-Control-Expose-Headers": "content-range,content-location,x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...CORS, ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function bearer(req) {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("gateway error:", error);
    if (!res.headersSent) send(res, 500, { msg: "local gateway failed", detail: String(error) });
    else res.end();
  });
});

async function handle(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // -- GoTrue's surface, the part this walk uses --------------------------
  if (url.pathname.startsWith("/auth/v1/")) {
    const route = url.pathname.slice("/auth/v1/".length);

    if (route === "health" || route === "settings") {
      return send(res, 200, {
        version: "local-gateway",
        external: { email: true },
        disable_signup: false,
        mailer_autoconfirm: true,
      });
    }

    if (route === "token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");

      if (grant === "password") {
        const user = await authenticate(String(body.email ?? ""), String(body.password ?? ""));
        if (!user) {
          return send(res, 400, {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            code: "invalid_credentials",
            msg: "Invalid login credentials",
          });
        }
        return send(res, 200, sessionBody(user));
      }

      if (grant === "refresh_token") {
        const parts = String(body.refresh_token ?? "").split(".");
        const user = parts[0] === "local" && parts[1] ? await userById(parts[1]) : null;
        if (!user) {
          return send(res, 400, {
            error: "invalid_grant",
            error_description: "Invalid Refresh Token",
          });
        }
        return send(res, 200, sessionBody(user));
      }

      return send(res, 400, { error: "unsupported_grant_type", error_description: String(grant) });
    }

    if (route === "user" && (req.method === "GET" || req.method === "PUT")) {
      const claims = verify(bearer(req));
      if (!claims?.sub) {
        return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      }
      const user = await userById(claims.sub);
      if (!user) {
        return send(res, 401, { code: 401, error_code: "user_not_found", msg: "user not found" });
      }
      return send(res, 200, userBody(user));
    }

    if (route === "logout" && req.method === "POST") {
      res.writeHead(204, CORS);
      return res.end();
    }

    return send(res, 404, {
      code: 404,
      msg: `the local gateway implements no ${req.method} /auth/v1/${route}`,
    });
  }

  // -- everything else is PostgREST's ------------------------------------
  if (url.pathname.startsWith("/rest/v1")) {
    const target = POSTGREST + url.pathname.slice("/rest/v1".length) + url.search;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (["host", "connection", "content-length", "apikey", "accept-encoding"].includes(k))
        continue;
      headers.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    // A request with no session arrives bearing the anon key, which IS a JWT
    // for the anon role -- passed through untouched so PostgREST decides,
    // exactly as in production.
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
    const upstream = await fetch(target, { method: req.method, headers, body });
    const out = Buffer.from(await upstream.arrayBuffer());
    const outHeaders = { ...CORS };
    upstream.headers.forEach((v, k) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) outHeaders[k] = v;
    });
    res.writeHead(upstream.status, outHeaders);
    return res.end(out);
  }

  return send(res, 404, { msg: "the local gateway serves /auth/v1 and /rest/v1 only" });
}

if (process.argv[2] === "--print-anon-key") {
  process.stdout.write(anonKey());
} else {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`local gateway on http://127.0.0.1:${PORT} (auth local, rest -> ${POSTGREST})`);
  });
}
