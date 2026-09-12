# The local routed-evidence stack

A disposable Supabase-shaped stack on loopback, assembled from parts that are
reachable when `supabase start` is not, so the BESKT candidate-preparation
walk can be run in a real browser against a real database.

```
scripts/local-stack/up.sh                  # replay, seed, snapshot, start
scripts/local-stack/run-routed-evidence.sh # the walk, every viewport, traces kept
scripts/local-stack/down.sh                # stop what up.sh started
```

## Why it exists

The repository's own recipe for this is `.github/workflows/e4-evidence.yml`:
`supabase start`, hold the migrations back, match the hosted privilege
baseline, replay the history as `postgres`, seed, walk. That recipe is the
right one and it is unchanged.

It could not run where this evidence was captured. `supabase start` pulls
`supabase/postgres`, `postgrest`, `gotrue`, `storage-api`, `kong` and
`edge-runtime`; in that environment **every registry blob CDN answered 403**
— Docker Hub's `production.cloudfront.docker.com`, `public.ecr.aws` and
`pkg-containers.githubusercontent.com` alike. No Supabase image could be
fetched at all, and `npx playwright install` failed the same way.

The choice was therefore between no routed evidence and routed evidence
against a stack built from what was reachable. This is the second, with the
substitution named rather than glossed.

## What is real

| Part          | What runs                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database      | **Real PostgreSQL 16**, a fresh database, the full migration history replayed in order as `postgres`                                                                             |
| Privileges    | The **hosted baseline**: `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM authenticated, service_role`, asserted afterwards, for the reason `e4-evidence.yml` records at length |
| API           | **Real PostgREST 12.2.3**, connecting as `authenticator`, switching to `anon` / `authenticated` from the JWT                                                                     |
| Authorisation | **Real RLS**, real `GRANT`s, real `SECURITY DEFINER` RPCs, `auth.uid()` read from the verified claim set exactly as in production                                                |
| Application   | The checked-in application, its real routes, its real server functions, built from this checkout                                                                                 |

## What is substituted

**GoTrue, and only GoTrue.** `auth-gateway.mjs` serves the four endpoints the
walk uses — `POST /auth/v1/token` (password and refresh), `GET /auth/v1/user`,
`POST /auth/v1/logout` — against the same `auth.users` rows a real GoTrue
would read, verifying the password with the same bcrypt hash in the database
and signing with the same HS256 secret PostgREST verifies with. It proxies
`/rest/v1/*` to PostgREST untouched.

So a sign-in is a real password check against a real row, and every request
after it is authorised by the database and nothing else. What is NOT exercised
is GoTrue itself: its rate limiting, its email flows, its MFA, its session
table. Nothing the walk asserts depends on any of those.

`harness.sql` adds the GoTrue columns to the test-harness `auth.users` and
restores `auth.uid()` / `auth.role()` / `auth.jwt()` to their **production**
bodies, which read `request.jwt.claims` — the GUC PostgREST actually sets.
The SQL suite's own `set_config` path keeps working unchanged.

## Isolation

Every entry point refuses to continue unless the database, PostgREST and the
application are all loopback; the gateway exits at startup otherwise. `up.sh`
drops and creates databases, so it refuses a non-loopback `PGHOST`. The owner
project ref is checked for in the generated `.env.local`. No hosted credential
is read or needed.

## The walk is not idempotent, on purpose

`bcp_events` is append-only against **every** caller, the database owner
included, so a second run cannot tidy up after the first. `up.sh` snapshots
the seeded database as `<name>_seed` and `--reseed` restores it in seconds.
That is the honest way to repeat the walk: start from the seeded state again,
never unwind a ledger that is supposed to refuse being unwound.

## The synthetic method

`scripts/fixtures/beskt-candidate-preparation-fixture.sql` publishes a
synthetic BESKT method the only way the contract allows: an editor authors it,
five different reviewers each approve their own gate, and a publisher who is
not the author publishes it. It then mints a pilot grant for one employer and
not the other.

That content exists **only** inside this disposable database. Production must
stay honest when no governed method is published, and it does: the section
says the method is under development, which is the true answer.
