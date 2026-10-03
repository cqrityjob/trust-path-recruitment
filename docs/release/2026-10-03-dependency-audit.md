# Dependency audit against the current lockfile (2026-10-03)

Base: `main` at `7ff0cbe` (after #384). Scope: every package version pinned in `bun.lock`
(753 name@version pairs; `bun.lock` is what Lovable builds from) and, for comparison, the
tracked `package-lock.json` (599 pairs, stale, see below).

## Method (repeatable)

1. Parse `bun.lock` into `name@version` pairs.
2. POST them to the npm bulk advisory endpoint
   (`https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`).
3. For every flagged package: `bun why <package>` for the dependency chain (production
   dependency, dev dependency or build tool), then the **built production output**
   (`bun run build` → `.output/`, preset `cloudflare-module`) for the code that actually ships:
   `.output/server/_libs/*` is the complete list of libraries bundled into the server, and
   `.output/public/assets/*.js` is the browser bundle.
4. For each, decide whether vulnerable code can be reached with untrusted input.

Result: **13 packages are flagged; none is reachable with untrusted input in production.**
No lockfile change was made, for the reason in "What was deliberately not changed".

## Findings

| Package (locked) | Worst severity | Chain | Ships in production? | Reachable with untrusted input? | Verdict |
|---|---|---|---|---|---|
| `fast-uri` 3.1.3 | high (8 advisories: host confusion, SSRF-style parsing, authority injection) | `@lovable.dev/mcp-js` → `@modelcontextprotocol/sdk@1.28.0` → `ajv@8` → `fast-uri` | **Yes, in the server bundle** (`.output/server/_libs/@lovable.dev/mcp-js+[...].mjs`, Ajv's URI resolver) | **No.** Ajv uses it to resolve `$id`/`$ref` of JSON schemas that are written in code, never a URI taken from a request. The only route that loads the MCP library, `/mcp`, answers 404 unless `CQRITYJOB_MCP_ENABLED=true` and a bearer token is configured (`src/routes/mcp.ts`, `src/lib/mcp/access.ts`; both unset in production). | Not applicable. Update at the next dependency refresh. |
| `hono` 4.12.30, `@hono/node-server` 1.19.14 | moderate | `@modelcontextprotocol/sdk` | **No.** Neither is in `.output/server/_libs`; a search of server and client output for `class Hono`, `hono/jsx`, `getRequestListener` and `express()` finds nothing. The SDK uses them only for its Node HTTP transport, which this Cloudflare build does not include. | n/a | Not applicable (not shipped). |
| `ip-address` 10.2.0 (high), `qs` 6.15.3 (moderate) | high | `express-rate-limit` / `body-parser` ← `express` ← `@modelcontextprotocol/sdk` | **No** (absent from server and client output) | n/a | Not applicable (not shipped). |
| `nanoid` 3.3.12 (high: generators loop on size 0 / negative) | high | `postcss` ← `vite` | **No.** The only `nanoid` text in the bundles is **zod's `nanoid` string-format regex** (`/^[a-z0-9_-]{21}$/i`, in `types-*.js` and the MCP chunk), not the `nanoid` package. | n/a | Not applicable (build tool). |
| `postcss` 8.5.15 (high: source-map path traversal) | high | `vite` | **No** (build time only) | The build reads this repository's own CSS. | Build tool; refresh. |
| `browserslist` 4.28.2 (high: unbounded memory; crash on custom stats), `baseline-browser-mapping` 2.10.21 | high | `@babel/core` ← `@vitejs/plugin-react`, TanStack plugins | **No** | The build reads no `browserslist-stats.json`; no `.browserslistrc` exists. | Build tool; refresh. |
| `@babel/core` 7.29.0 (low; 7.29.7 is also locked) | low | same | **No** (the `@babel/core` string in a client chunk is a dependency list inside `tesseract.js`'s package metadata) | n/a | Build tool. |
| `brace-expansion` 1.1.14 and 5.0.5 (high, DoS) | high | `minimatch` ← `eslint`, `typescript-eslint` | **No** | ESLint runs on this repository's own file names. | Dev tool; refresh. |
| `js-yaml` 4.1.1 (high, quadratic CPU) | high | `@eslint/eslintrc` ← `eslint` | **No** | Reads this repository's own ESLint config. | Dev tool; refresh. |
| `esbuild` 0.25.12, 0.27.7 (low: arbitrary file read on the **Windows** dev server) | low | `vite` | **No** | The dev server is not run on Windows or exposed. | Not applicable (platform). |

Direct dependencies of the application (the ones in `package.json` `dependencies`) have **no**
advisory.

### The stale `package-lock.json`

`package-lock.json` (last touched 2026-09-30) does not match `package.json` (for example
`@tanstack/react-router` `^1.170.16` there, pinned `1.170.41` in `package.json`) and no workflow
uses it (CI and Lovable use `bun.lock`). A scanner that reads it reports 12 flagged packages
(same set, different versions, plus `js-yaml` 4.3.0 / `nanoid` 3.3.16 that are only flagged against
the older advisory ranges). That is why a report can disagree with the lockfile the build uses.
Recommendation: delete `package-lock.json` or regenerate it, so there is one lockfile of record.
Not changed here: it is the owner's call and the file is not part of any build.

## What was deliberately not changed

Every flagged package has a fixed version inside the range its dependents already accept, so
the remedy is a lockfile-only refresh and no `package.json` edit:

| Package | Locked | Newest same-major version with no advisory |
|---|---|---|
| `fast-uri` | 3.1.3 | 3.1.8 |
| `hono` | 4.12.30 | 4.13.12 |
| `@hono/node-server` | 1.19.14 | 1.19.17 |
| `ip-address` | 10.2.0 | 10.7.3 |
| `qs` | 6.15.3 | 6.16.0 |
| `postcss` | 8.5.15 | 8.5.28 |
| `nanoid` | 3.3.12 | 3.3.19 |
| `browserslist` | 4.28.2 | 4.29.3 |
| `baseline-browser-mapping` | 2.10.21 | 2.11.27 |
| `brace-expansion` | 1.1.14 / 5.0.5 | 1.1.21 / 5.0.12 |
| `js-yaml` | 4.1.1 | 4.3.2 |
| `@babel/core` | 7.29.0 | 7.29.7 |
| `esbuild` | 0.25.12 / 0.27.7 | no same-major fix (fix is 0.28.1+, Windows-only advisory) |

Why no lockfile edit was made from this session: `bun.lock` resolves its 170 non-npm entries to
Lovable's package cache (`europe-west*-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`), which
this environment cannot reach, so a regenerated lock would either rewrite those entries or carry a
version the cache may not have yet (and `bunfig.toml` refuses versions younger than 24 h). A
lockfile that Lovable's build cannot satisfy would break the synced branch. Hand-editing the lock
without being able to install from the cache is not a change that can be regression-tested here.

### Approval request (not executed)

In an environment that can reach the Lovable cache (or from Lovable itself):

```bash
bun update fast-uri hono @hono/node-server ip-address qs postcss nanoid browserslist \
  baseline-browser-mapping brace-expansion js-yaml @babel/core
bun install --frozen-lockfile && bun run build && bun run scripts:typecheck
git diff --stat bun.lock          # expect bun.lock only
```

Regression gate for that change: `bunx tsc --noEmit`, `bun run build`, the CI verify job, and
`curl -s -o /dev/null -w '%{http_code}' <preview>/mcp` still 404.

## Evidence kept

- Advisory query result: 13 packages in `bun.lock`, 12 in `package-lock.json`.
- Production bundle inventory: `.output/server/_libs/` holds 38 library chunks (no `hono`, `express`,
  `ip-address`, `qs`, `postcss`, `browserslist`, `js-yaml`, `brace-expansion`, `esbuild`, and no nanoid generator);
  the single flagged library present is `fast-uri` inside the MCP chunk.
- `bun why` chains above.
