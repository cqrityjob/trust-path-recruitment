# Security Work processing activation

The application remains on its existing Cloudflare target. PDF and DOCX parsing runs in a separately operated Node processor, using a disposable worker with a hard 10-second deadline. The Cloudflare application sends bytes only to an explicitly approved first-party HTTPS endpoint. It validates the returned file hash, segment hashes, parser version and limits before signing a database completion receipt.

Neither document processing nor AI is activated by this change. No credentials, activation rows or production worker keys are seeded. Interview AI settings and credentials do not activate Security Work.

## Document processor artifact

The concrete unactivated deployment proposal is one owner-controlled Fly.io Machine in Frankfurt, with 2 shared CPUs and 1 GiB RAM. The [processor deployment decision and runbook](./processor-deployment.md) records current price assumptions, the approval list, runtime/image pins, secret handling and the limits of the region claim. No external deployment has been performed.

Build on the same OS, architecture and libc as the processor host, using Bun 1.3.14 and the repository's locked dependencies, including optional native dependencies:

```sh
bun run scripts/security-work-processor-build.ts /absolute/output/security-work-processor
node /absolute/output/security-work-processor/verify.mjs
```

The output includes `server.mjs`, the pinned PDF.js engine and worker, native canvas dependencies, offline verification/configuration tools and a file-hash manifest with runtime/platform and lockfile provenance. It has no dependency on the application's source tree or current working directory. Nothing is deployed or published by this command. Use a new output directory for every build; existing outputs are rejected so stale assets or local environment files cannot enter the new package.

Run with the pinned Node 22.23.3 on the matching target platform. Provision `SW_PROCESSOR_AUTH_TOKEN` as a dedicated random secret of at least 32 bytes, encoded as hex/base64, then run `node /absolute/output/security-work-processor/server.mjs`. `SW_PROCESSOR_PORT` defaults to 8789 and `SW_PROCESSOR_HOST` to `127.0.0.1`. The container explicitly uses `0.0.0.0` behind its approved TLS proxy. A fixed synthetic PDF must parse before startup; `GET /healthz` returns only status and parser version. The processor requires no database credentials, worker signing key or AI credential. It does not write document bytes or content to disk/logs.

The only processing endpoint is `POST /v1/extract`. It requires the bearer secret, exact PDF/DOCX MIME type, at most 10 MiB and at most two concurrent requests. Parsing accepts at most 100 PDF pages, 200 segments, 200,000 text characters and 16,000 characters per segment. DOCX processing has independent compressed and expanded ZIP limits and rejects macros, embedded objects, DTDs and external entities. Embedded URLs and relationships are not followed. Image-only or empty documents return `scanned_or_empty`; OCR is not included.

## Application document configuration

After the owner approves the first-party processor's location, operation and document data processing, provision all of these **server-only** settings:

| Setting                                 | Required value                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `SW_PROCESSOR_ENABLED`                  | Exactly `true`                                                                      |
| `SW_PROCESSOR_URL`                      | Approved HTTPS origin plus exactly `/v1/extract`; no credentials, query or fragment |
| `SW_PROCESSOR_EXPECTED_ORIGIN`          | The same exact HTTPS origin, including any nondefault port                          |
| `SW_PROCESSOR_AUTH_TOKEN`               | Dedicated secret matching the processor; at least 32 UTF-8 bytes                    |
| `SW_PROCESSOR_DATA_PROCESSING_APPROVAL` | Recorded owner approval reference for this processor and document purpose           |
| `SW_WORKER_KEY_ID`                      | Active database receipt key ID; letters, digits, `_` or `-`, at most 80 characters  |
| `SW_WORKER_SECRET`                      | Matching receipt signing secret; at least 32 UTF-8 bytes                            |

An owner provisions the matching signing key out of band in `sw_private.worker_keys`. The application uses the authenticated user's RLS client and signed, fenced completion RPCs. There is no service-role route. The processor bearer secret and receipt signing secret have separate purposes and should be separate values. Failed or absent configuration prevents dispatch; the endpoint is never inferred from a document or user input.

The application permits no redirects and makes one processor request with a 15-second total transfer deadline. The Node worker has its own 10-second parse limit. Errors remain errors; a missing response is not replaced with invented extracted text.

With server settings already securely injected, `node /absolute/artifact/config-check.mjs` performs an offline check without printing values. Adding `--probe` explicitly checks the approved TLS endpoint, minimal readiness response and bearer match with an empty body. It makes no database request and does not verify the database receipt-key match. See the deployment runbook for the separate published synthetic upload proof.

## Separate AI activation

The owner must explicitly approve the provider, exact model, purpose, versions and data processing. Provision one unrevoked, unexpired `sw_ai_activations` row for the workspace and environment, using these version pins:

| Approval field          | Value                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `provider`              | `anthropic`                                                                            |
| `model`                 | Exact owner-approved model ID confirmed by the provider; no default or latest fallback |
| `purpose`               | `draft_analysis`                                                                       |
| `task_version`          | `sw-analysis-1.1.0`                                                                    |
| `prompt_version`        | `sw-analysis-prompt-1.1.0`                                                             |
| `policy_version`        | `sw-analysis-policy-1.1.0`                                                             |
| `output_schema_version` | `sw-analysis-output-1.0.0`                                                             |
| `max_output_tokens`     | 256–8192                                                                               |
| `timeout_ms`            | 1000–60000                                                                             |

The approval also records `approved_by`, `approved_at`, `valid_until`, `data_processing_approval`, a maximum reservation and a daily budget. The app rejects ambiguous matching activations. Revocation is an immutable `sw_ai_activation_revocations` record.

Provision these server-only environment settings to match the approved row: `SW_AI_ENABLED=true`, `SW_AI_PROVIDER=anthropic`, `SW_AI_MODEL`, `SW_AI_ENVIRONMENT` (`production` or `internal_qa`), and a dedicated `SW_ANTHROPIC_API_KEY`. Production cannot use an internal-QA approval. Receipt signing configuration is required for AI too. None of these settings has an inherited Interview AI fallback.

The server sends only the immutable accepted-source manifest and explicitly selected assessment/question fields. Source facts must quote an exact segment and its immutable source-item ID. User interpretations must reproduce the referenced user input; explicit assumptions cannot be relabelled as facts or existing controls. Likelihood and consequence remain null without all five scale definitions, a horizon and an acceptance description. Outputs contain the report's required sections and remain proposals until a person reviews and applies them.

Each request ID reserves one durable job and budget before dispatch. A fence allows one provider request only. The model metadata request and generation share one abort deadline; there are no automatic transport retries or fallback models. `dispatched` and `outcome_unknown` jobs are never resent by reusing the request ID. A lost completion acknowledgement must be reconciled; it does not authorize another charge. Known provider token usage is preserved in the signed receipt. Exact monetary cost is unknown, so `costMicros` stays null and the database retains the full reserved budget conservatively.

## Verification

The following use only synthetic data and mocked provider responses:

```sh
bun run scripts/security-work-processing-check.ts
bun run scripts/security-work-ai-jobs-check.ts
bun run scripts/security-work-processor-check.ts
```

Run the complete packaged processor verification without preparing a server or certificate:

```sh
bash scripts/security-work-processor-integration-test.sh
bun run scripts/security-work-processor-artifact-check.ts
# Optional actual local Linux/amd64 container proof; requires Docker, never deploys:
bash scripts/security-work-processor-container-build.sh sw-processor:review
bash scripts/security-work-processor-container-test.sh sw-processor:review
```

It requires the locked dependencies, Bun 1.3.14, Node 22.23.3 and OpenSSL. The script builds the actual standalone artifact, creates a two-day self-signed certificate and random synthetic bearer secret in a private temporary directory, starts Node HTTP and TLS listeners on automatically assigned loopback ports, and runs **15 actual HTTP/TLS checks**. These cover readiness, authorization, MIME/signature checks, malformed and empty PDF, PDF hashes, real application transport, compressed DOCX, the 10 MiB request cap and ZIP amplification. No provider or database is contacted. It terminates its own listeners and removes its temporary artifacts. Set `SW_PROCESSOR_TEST_KEEP=1` to retain its private files and build log for diagnosis; listeners still stop.

The browser harness can use the same foreground bootstrap:

```sh
processor_fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/sw-browser-processor.XXXXXX")"
bun run scripts/security-work-processor-local.ts "$processor_fixture_dir" &
processor_fixture_pid=$!
# Wait for "$processor_fixture_dir/ready.json" while also checking the child is alive.
source "$processor_fixture_dir/app.env"
# Start the Node/Vite application only after sourcing: Node reads its extra CA at startup.
# Run browser checks, then terminate and wait for this owned bootstrap PID.
kill -TERM "$processor_fixture_pid"
wait "$processor_fixture_pid"
```

The parent harness must use an exit trap to terminate/wait and remove its generated temporary directory even when a check fails. `ready.json` and `app.env` are written atomically after both listeners start. SIGTERM/SIGINT to the bootstrap stop its Node child. `app.env` is mode 0600 and supplies the exact synthetic HTTPS endpoint, matching origin, bearer token, approval marker, extra CA and HTTP test origin. It does not supply database, AI or receipt-signing keys. The harness configures those independently for its isolated test database. Optional `--http-port=<port>` and `--https-port=<port>` arguments pin fixture ports; their default is zero, which asks the OS for free ports. Existing services are never adopted or stopped.

Certificates and keys remain in temporary storage, never the checkout. HTTPS certificate verification stays enabled; no `NODE_TLS_REJECT_UNAUTHORIZED=0`, HTTP production fallback or production activation is introduced. The older `security-work-processor-check.ts --local-node` helper remains available for a manually prepared HTTP 3150/TLS 3151 fixture.
