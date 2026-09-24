# Security Work processor deployment decision

Prepared 2026-09-24. **No external resource, registry push or deployment has been performed.** The existing application remains on Cloudflare and the database remains in its existing project. Processor activation is independent of AI activation.

## Concrete recommendation for approval

Use one owner-controlled **Fly.io Machine in Frankfurt (`fra`), 2 shared vCPUs and 1 GiB RAM**, with managed HTTPS, no volume, no autoscaler and no automatic stop. Keep one warm instance because the app has a 15-second transfer deadline. The processor accepts at most two simultaneous documents and uses a disposable worker for each. A single instance can be unavailable during failure or maintenance; this is a bounded pilot configuration, not a high-availability commitment. Use `--ha=false` on the first deployment so Fly does not create its default second Machine. [Fly regions](https://fly.io/docs/reference/regions/), [machine and health configuration](https://fly.io/docs/reference/configuration/), [default deployment redundancy](https://fly.io/docs/apps/app-availability/).

Repository inspection found the Cloudflare application target in `vite.config.ts` and the existing Supabase `eu-central-1` backend in `supabase/deployment-targets.json`; no existing owner-operated Node service, container platform or Fly app configuration was present. Frankfurt is the proposed processing region near that recorded backend region. Cloudflare documents `node:worker_threads` as a non-functional stub, so the existing disposable Node-worker parser cannot run directly in this app's Workers runtime. [Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/).

The VM region **does not establish EU-only processing**: the application and HTTPS edge path use globally operated services, and support, logs and infrastructure processing need contractual review. Before real documents, the owner must approve Fly as a hosting processor, its signed DPA, relevant subprocessors/transfers and infrastructure log retention. Fly provides its DPA through its compliance documents workflow; no contract has been accepted here. The service writes no documents, extracted text or credentials to disk or logs, but that application behavior is not a promise about every infrastructure provider's retention. [Fly compliance documents](https://fly.io/documents).

## Cost assumption, not a billing cap

The official pricing widget, checked 2026-09-24, gives the `shared-cpu-2x`/1 GiB base rate as USD 0.00000256/second and Frankfurt's multiplier as 1.21: **USD 8.03 per 30 continuously running days** (`0.00000256 × 1.21 × 2,592,000`), or about USD 8.14 for 730 hours. European internet egress is USD 0.02/GB; inbound transfer is free. For 1,000 documents and at most 2 MiB returned per document, budget roughly USD 0.04 processor egress. Shared IPv4 needs no dedicated-IP charge. No volume, paid support, reservation or dedicated IPv4 is proposed. [Fly resource pricing](https://fly.io/docs/about/pricing/).

Approve a **USD 15/month pilot operating budget**, with an owner checking spend at USD 10 and reviewing at USD 15. This is an operating threshold, not a provider-enforced hard cap. Taxes, currency conversion, existing app/Supabase egress, AI usage, registry/build overhead, extra Machines during releases and optional paid support are outside the compute estimate. Recheck regional prices and available capacity immediately before provisioning.

## Versioned package and local proof

`scripts/security-work-processor-runtime.json` pins Node **22.23.3**, Bun **1.3.14**, PDF.js **6.3.289**, and the public Node/Bun container manifests by SHA256. The full dependency graph stays locked by `bun.lock`; no second dependency manifest is maintained. Node 22.23.3 was confirmed in the official release archive; the local macOS verification binary was checked against its official SHA256 list. [Node release](https://nodejs.org/en/download/archive/v22.23.3), [Node release checksums](https://nodejs.org/dist/v22.23.3/SHASUMS256.txt).

Build a local Linux/amd64 image and test it:

```sh
bash scripts/security-work-processor-container-build.sh sw-processor:review
bash scripts/security-work-processor-container-test.sh sw-processor:review
```

The builder copies an explicit file allowlist into a temporary build context. It excludes `.env*`, `.git`, local credentials, attachments, private references and all unrelated app files. It never pushes an image. `SW_PROCESSOR_DOCKER_BIN` can select the Docker executable. The Dockerfile also has a deny-all context allowlist, but the helper's physically separate context is the authoritative boundary, including on legacy Docker builders.

The runtime contains only the compiled server, verification tools, PDF.js/native canvas assets and a hash manifest. It runs as an unprivileged user; code files are root-owned. The build verifies every packaged file, exact Node version, architecture and libc. A fixed synthetic PDF must parse successfully before the production listener opens. `GET /healthz` then returns only `{"status":"ok","parserVersion":"sw-text-1.0.0"}` with `no-store`; it accepts no document and exposes no environment or tenant data. A 30-second health check detects a failed listener. It is not a repeated full document-quality test.

The container test starts only an owned container with a read-only filesystem, dropped capabilities, no privilege escalation, 1 GiB/2-CPU bounds and an ephemeral loopback port. Its temporary TLS proxy uses a private synthetic certificate and bearer secret. Fifteen actual HTTP/TLS tests cover readiness, authorization, type/signature/size checks, malformed/scanned PDF, PDF and compressed DOCX extraction, content hashes, ZIP amplification and the real application's transport. It also verifies the packaged file inventory, credential-redacting config probe and Docker's actual scheduled health state. The harness allows 100 seconds for the configured 30-second/three-retry health cycle and prints health state on failure; production parse, transfer and health timeouts are unchanged. The test stops its own container and listeners; no database or AI endpoint is contacted.

For a native artifact, use the pinned Node version and matching build/host platform:

```sh
bun run scripts/security-work-processor-build.ts /absolute/new/artifact
node /absolute/new/artifact/verify.mjs
bun run scripts/security-work-processor-artifact-check.ts
bash scripts/security-work-processor-integration-test.sh
```

The artifact check builds twice and compares manifests, then rejects modified, missing or extra files and an incompatible runtime. The builder requires a fresh output directory and refuses to mix in a previously written `.env`. It tests valid/invalid offline configuration without printing synthetic secret values. `SW_PROCESSOR_NODE_BINARY` may name the pinned Node executable for this check. File reproducibility is verified on the same target; OCI layer timestamps and image IDs are not claimed to be bit-for-bit identical across Docker implementations.

### Recorded isolated verification, 2026-09-24

| Evidence                                                                                    | Result                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Native Node 22.23.3 package and real TLS application transport                              | 15/15 checks passed                                                                                          |
| Actual Linux/amd64 container, Node 22.23.3, read-only filesystem, 1 GiB/2 CPU               | 15/15 HTTP/TLS checks, packaged inventory, empty-body auth probe and scheduled Docker `healthy` state passed |
| Reproducibility, artifact tampering, existing-output isolation and offline config redaction | 10/10 checks passed                                                                                          |
| Existing processor transport checks with mocked endpoint responses                          | 8/8 passed; these remain mocked                                                                              |
| Tested local container image ID                                                             | `sha256:b7628d33984ce6d080e201fcb2da44373812acfaf201fae3ff000005daccfab9`, 110,227,183 bytes                 |
| External registry, Fly resource, production configuration and published user flow           | Not performed; require the decisions below                                                                   |

The local image ID identifies the tested Docker image, not a published registry manifest digest. Record the actual registry digest only after approved publication. All documents, bearer tokens, certificates and receipt settings used in this proof were synthetic; test listeners and containers were stopped afterward. This proof does not establish live regional latency, production load capacity or AI quality.

## Exact settings and safe verification

| Location                    | Settings                                                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processor runtime           | `NODE_ENV=production`, `SW_PROCESSOR_HOST=0.0.0.0`, `SW_PROCESSOR_PORT=8789`; dedicated `SW_PROCESSOR_AUTH_TOKEN` secret of at least 32 random bytes, encoded as hex/base64                                                                              |
| Application server          | `SW_PROCESSOR_ENABLED=true`, `SW_PROCESSOR_URL=https://<approved-app>.fly.dev/v1/extract`, `SW_PROCESSOR_EXPECTED_ORIGIN=https://<approved-app>.fly.dev`, matching `SW_PROCESSOR_AUTH_TOKEN`, recorded `SW_PROCESSOR_DATA_PROCESSING_APPROVAL` reference |
| Application receipt signing | Separate `SW_WORKER_KEY_ID` and `SW_WORKER_SECRET` matching an active owner-provisioned private database receipt key; do not install these on the processor                                                                                              |

Use the existing application's server-secret configuration mechanism and Fly's app-specific secret vault. The processor needs no Supabase URL/key, service-role credential, AI key or receipt-signing key. Store the bearer token separately from the receipt secret. Import only the processor's one secret through trusted operator tooling/stdin; do not place it in shell history, `fly.toml`, Docker build arguments, image layers or the repository. Fly stores secrets encrypted and exposes them as environment variables at runtime; `fly secrets list --app <approved-app>` shows names/digests, not plaintext. Deploy access can still execute code that reads environment secrets, so restrict it to the named operator. [Fly secret handling](https://fly.io/docs/apps/secrets/).

From a trusted server environment with the application settings already injected, run:

```sh
node /absolute/artifact/config-check.mjs
# Explicit network probe after endpoint approval; empty POST, no document or database write:
node /absolute/artifact/config-check.mjs --probe
```

The offline check prints pass/fail only. The probe verifies TLS, the minimal readiness contract and bearer matching with an empty PDF body that must receive the expected malformed-body response. Responses are capped at 1 KiB and five seconds; redirects are rejected. It does **not** prove that the database receipt key matches, the published Cloudflare environment has those same values or a user's job completed. Prove those separately with one authorized synthetic upload in the published app and its persisted source segments; record the deployed app revision and processor image digest.

## Operator runbook after approval

The owner selects the Fly organization/app name, accepts the appropriate contracts and grants a named operator permission to provision the one Machine. The operator builds/tests locally, records the commit and image digest, and publishes that image to the approved registry. Deploy **only the reviewed registry image by digest**, using this template and the approved app name:

```sh
fly deploy --app <approved-app> --config deploy/security-work-processor/fly.toml \
  --image registry.fly.io/<approved-app>@sha256:<reviewed-image-digest> --ha=false
fly status --app <approved-app>
fly checks list --app <approved-app>
fly secrets list --app <approved-app>
```

These are future operator commands, not authorization to run them now. Do not remote-build the checkout. Confirm exactly one Machine in `fra`, the expected size, no volumes and healthy checks before configuring the app endpoint. No fallback region is approved; lack of Frankfurt capacity requires another owner decision. Keep the prior reviewed image digest for rollback. First disable document dispatch in the app, then roll back the processor image and verify readiness before re-enabling. Never rewrite or automatically redispatch a completed/unknown processing job.

The named operator owns TLS/secret rotation, monthly spend checks, resource monitoring, incident response and pinned-runtime/PDF.js updates. Update pins and rerun artifact, container and browser checks before each release. Alert on sustained failed health checks, failed synthetic extraction, memory pressure and increased 503/parse failures using metadata-only monitoring; do not log bodies or bearer headers. Rotation uses a short disabled-dispatch window while both server copies change. The product/data owner approves document classifications and data-processing terms; the release owner verifies the deployed frontend/server revision and synthetic end-to-end evidence.

## Remaining owner decisions

1. Approve the Fly organization/app, Frankfurt-only one-Machine pilot and USD 15/month operating threshold; name the operator and incident owner.
2. Approve hosting/data-processing terms, transfer and infrastructure-log handling, plus permitted document classifications. Region selection alone is insufficient.
3. Approve registry publication/deployment of the tested image and provision the dedicated bearer secret, app-server receipt keys and approval reference.
4. Approve the subsequent published synthetic end-to-end test before enabling real documents.

OCR remains unimplemented. A scanned/image-only PDF produces `scanned_or_empty`; the working route is a manually entered source or an accessible text PDF/DOCX. No successful reading or extracted content is fabricated.
