# Offline P4 contract evidence

Contract `recruiter-ai-v0.3-draft1`, base `8c9b3138bcb801ac69aa44b14e9cb592da5ea50a`, local synthetic observation 2026-10-08. This package contains no real applicant data, secrets, model response, Auth session, original upload or hosted proof.

`evaluation.json` is the original local offline evaluator output: nine input/output hashes and expected structural results with separate human facit. A structurally correct citation is explicitly not semantic support. Unsupported experience paraphrase and wrong OCR year require rejection by the human facit. There are no mismatches, provider calls or persistent writes.

`verification.json` binds this output and the reviewed source files by exact SHA-256. Source hashes are file bytes. Fixture input/output hashes use the evaluator's canonical JSON SHA-256; they are different representations and must not be compared as interchangeable hashes. The evaluation timestamp is an observation, not an instrumented production run.

From the repository root, with the existing bundled dependencies:

```sh
bun test scripts/recruiter-ai-contract.test.ts
bun scripts/recruiter-ai-synthetic-evaluation.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.scripts.json
bun scripts/generative-ai-gate-check.ts
```

The evaluator prints a fresh timestamp on each run. To save a new observation, use `--output <new-local-path>` and preserve this original output. No `--live` mode or activation toggle exists.

Executed limits: pure contract/fixture exercise, 68 tests/151 assertions, 9 facit cases and 9 compile-only negative type contracts. Five format/name variations test deterministic binding, not model fairness. Auth, tenant RLS, API, browser/mobile, durable queues/budgets, provider behavior, quality and commercial activation remain untested by this package. See the [delivery note](../../2026-10-08-p4-disabled-contract.md).
