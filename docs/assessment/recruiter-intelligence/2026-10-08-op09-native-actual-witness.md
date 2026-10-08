# OP09 native recovery: independent actual witness, 2026-10-08

[Native run 37774303398](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37774303398), job `113301207464`, completed successfully. Its evidence checkout was `a037191087620fed975fade51e5585a9b604b0bd`, separate application `cce2c8a238522d51396b52697d25bc9d54a8a8bd`, and strict schema witness `9c8b8159ce5f350c6ace074c917823599d19ce99`. This is actual ephemeral GitHub integration with native services, not an installation or test against the hosted project or published runtime.

The retrieved [artifact 11549931289](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37774303398/artifacts/11549931289) has ZIP SHA256 `186f803c694fda8f5f3bf25335b56ae54692b05dfc51ad676adf1b0d22c48a33`. Its original manifest SHA256 is `123b460539bc74f8f74f245d9c95822d1d160d27e4de7cb61e5b5d4ee2f21d12`. Both were independently checked before reporting. The original manifest, independent readback and two original PNGs are also retained in the [versioned evidence package](evidence/2026-10-08-native-op09-a037/README.md). All 387 recorded migration hashes match the exact evidence source; all 12 exported PNG hashes and byte counts match the manifest. The original ZIP, manifest and PNGs are preserved privately under `/private/tmp/ri-op09-native-a037-actual-20261008/`; GitHub artifact retention is seven days.

| Actual phase           | Observed result                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Official native stack  | PostgreSQL 17.6; GoTrue 2.194.0; Storage API 1.67.20; PostgREST binary 14.15; supabase-js/auth-js 2.110.5                                    |
| Strict complete schema | All 387 migrations applied in filename order, including pending 080 then 0909; no production installation                                    |
| Auth and receipt setup | Eight fresh auto-confirmed admin-API accounts and actual password sessions; one synthetic draft job with receipt disabled; zero applications |
| SDK recovery           | Exactly 44 completed checks through real holder sessions, caller RPCs and Storage                                                            |
| Application            | Exact separate application started against that isolated stack                                                                               |
| Browser recovery       | Four successful cases, SV/EN × desktop1440/emulated375; zero failures, skips or flaky cases                                                  |
| Final readback         | Side-effect fences unchanged; owned stack stopped; no errors recorded                                                                        |

The operational helper hash `d6c145b5dc2d25114d4f60cad22fb18e9a81ca84e3c0a14dcf1459954c0ac1fe` independently matches the helper in the exact application Git object. The fault preload hash `fb946ffc25843ba8a2892eefc75830c8e1ce9a08e7fb9835b126f455407ca2ca` independently matches the evidence source. Setup uses Auth admin only to create fresh users; probes use their own password sessions. Local fixture DML creates the synthetic receipt-disabled job. No direct Auth/session/JWT SQL or service-role test actor substitutes for holder authorization.

The 44 SDK checks cover a lost successful upload reply and fresh-client reconciliation; explicit idempotent resume with one metadata row; other-holder direct-API and original-byte denial; durable cleanup fence after a transport failure; late attachment/upsert refusal; explicit cleanup retry and actual byte absence; registered-byte preservation; existing withdrawal behavior; altered-byte integrity rejection; two concurrency attempts; and ten actual local-logout/live-session denial checks. **Both concurrency attempts observed registration winning.** The manifest correctly reports `bothRaceOrdersObserved=false`; sequential committed registration-first and cleanup-first orders were separately verified. This is not proof that both concurrent scheduling orders occurred.

Logout was real GoTrue `scope=local`. Subsequent requests replayed the previously issued JWT and were denied by the Passport live-session guard. The JWT may remain cryptographically valid until its TTL: this run does not prove token expiry, global logout or general JWT revocation outside the tested Passport boundary.

Each browser case reads its own saved upload attempt after reload without implicit attachment, explicitly resumes once, then receives exactly one test-only server-side 503 on its exact own fenced Storage DELETE. Reload preserves the fence without rearming the injector or silently retrying deletion; explicit cleanup retry proves absence while registered original bytes remain readable. Every case reports one metadata row, one injected failure, preserved registered bytes, cleaned absence and both no-implicit-action checks. Only the isolated exact-own-path DELETE response is fault-injected; the actual Auth, RPC and Storage services remain native.

| Readback population                  | Before SDK | After SDK | After four browser cases |
| ------------------------------------ | ---------: | --------: | -----------------------: |
| Auth users / confirmed               |      8 / 8 |     8 / 8 |                    8 / 8 |
| Synthetic jobs                       |          1 |         1 |                        1 |
| Upload journal rows                  |          0 |         5 |                       13 |
| Evidence rows                        |          0 |         3 |                        7 |
| Applications / receipt enabled       |      0 / 0 |     0 / 0 |                    0 / 0 |
| Messages / mail attempts             |      0 / 0 |     0 / 0 |                    0 / 0 |
| Interview AI / security-work AI runs |      0 / 0 |     0 / 0 |                    0 / 0 |
| Erasure jobs / erasure queue / cron  |  0 / 0 / 0 | 0 / 0 / 0 |                0 / 0 / 0 |

AI flags remained false. These are aggregate synthetic-fixture readbacks, not claims about production traffic or account erasure. The local disposable stack was stopped by the runner.

Four representative artifact PNGs were visually inspected: `sv-desktop1440-fenced`, `en-desktop1440-cleaned`, `en-emulated375-resumed` and `sv-emulated375-fenced`. Recovery state and actions are visible in both languages. A concrete presentation limitation remains at 375 pixels: the supporting-document filename wraps into individual characters in the existing narrow evidence row. Functional browser PASS does not establish polished mobile layout, accessibility conformance or physical-phone behavior. No product change was made during this independent review.

The original [failed 2bb run 37770828265](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37770828265) remains preserved separately. It passed native schema/Auth setup but failed before SDK acceptance; its private exception was not available. The subsequent launcher correction and app-pin advancement are explicitly represented in the new evidence SHA. The successful exact-head rerun establishes recovery acceptance for this isolated pin; it does not retrospectively recover the original exception or imply a product/schema correction.

The separate [ordinary schema CI 37769873343](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37769873343) passed all eight mandatory jobs on 9c8: actual PG16 and PG17 full strict history, all 41 journal and 95 P1 SQL assertions, protected nonempty rollback refusal/standdown and 51 documented rollback assertions; separate PostgREST API checks also passed. Its PR merge checkout `13b88998a5f84784c8e83653e652725990d56f24` has an identical tracked tree to 9c8. Those API fixtures use substitutes and remain separate from this native Auth/Storage witness.

Remaining release boundaries are unchanged: apply pending 080 before 0909 under the repository's schema-first release procedure; then release compatible consumers only after installation proof. Hosted/published runtime, CDN/cache/CSP behavior, physical phones, real candidates, messages, AI/provider activation and workers/cron were not exercised or enabled by this evidence. No source, generated type, migration, permission or release-state file is changed in this witness.
