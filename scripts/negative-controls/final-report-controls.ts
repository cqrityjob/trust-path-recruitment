/**
 * E4 employer final-report negative controls.
 *
 * ── WHY THESE EXIST ────────────────────────────────────────────────────
 *
 * employer-final-report-check asserts that the canonical output of this
 * process is provable. None of its assertions, on its own, proves it would
 * NOTICE if that stopped being true: a regex that no longer matches, a table
 * test over a union that lost a member, or an assertion whose subject was
 * renamed all go on printing "ok".
 *
 * Each mutation below introduces exactly one of the defects E4 exists to
 * prevent -- the real defect, in the real file, in the shape a careless edit
 * would actually produce -- and requires a named guard to fail with a named
 * diagnostic. Several are the ORIGINAL defect restored verbatim: the md5
 * hash, the one assessor chosen by LIMIT 1 with no ORDER BY, the aggregate
 * with no ORDER BY, the Passport disclosure called verified, the finalisation
 * that took no previewed identity, the report drawn from live data.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:final-report
 */

import { runControls, type Mutation } from "./runner";

const SEQ = "src/lib/interview-intelligence/final-report.ts";
const PANEL = "src/components/employer/interview/FinalReportSequence.tsx";
const DOCUMENT = "src/components/employer/interview/FinalReportDocument.tsx";
const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const MIGRATION = "supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql";
const ROLLBACK = "supabase/rollback/20261107090000_scp_iv_report_basis_integrity_rollback.sql";
const DB_TEST = "scripts/db-test.sh";
const DICT = "src/i18n/dictionaries.ts";
const EVIDENCE_WF = ".github/workflows/e4-evidence.yml";
const SCAN = "scripts/e4-evidence-scan.ts";
const VERIFY = "scripts/e4-evidence-verify.ts";
const MANIFEST = "scripts/e4-evidence-manifest.ts";
const EVIDENCE_SPEC = "e2e/employer-final-report-evidence.spec.ts";

const E4 = "employer-final-report:check";

const MUTATIONS: readonly Mutation[] = [
  /* ---- The evidence pipeline's own safety ---------------------------- */
  {
    id: "E4-EVIDENCE-JOB-USES-PULL-REQUEST-TARGET",
    defect:
      "the evidence job runs on pull_request_target, so pull-request code executes with the base repository's secrets and write token",
    file: EVIDENCE_WF,
    find: "on:\n  pull_request:\n    branches:",
    replace: "on:\n  pull_request_target:\n    branches:",
    guard: E4,
    expect: "16.1 the evidence job never uses pull_request_target",
  },
  {
    id: "E4-EVIDENCE-JOB-KEEPS-CREDENTIALS",
    defect: "the checkout keeps the workflow token, so anything the job runs could push",
    file: EVIDENCE_WF,
    find: "          persist-credentials: false",
    replace: "          persist-credentials: true",
    guard: E4,
    expect: "16.3 the checkout leaves no pushable credential",
  },
  {
    id: "E4-ISOLATION-GATE-AFTER-THE-FIXTURE",
    defect:
      "the loopback check moves after the fixture, so a misconfigured stack is written to before anything verifies where it points",
    file: EVIDENCE_WF,
    find: "      - name: Refuse anything that is not loopback",
    replace: "      - name: Check loopback later, after the data is already written",
    guard: E4,
    expect: "16.5 there is an isolation gate",
  },
  {
    id: "E4-LOOPBACK-CHECK-ACCEPTS-ANY-HOST",
    defect:
      "the API URL check accepts any host, so the walk can sign in and finalise against the owner project",
    file: EVIDENCE_WF,
    find: "            http://127.0.0.1:*|http://localhost:*) : ;;",
    replace: "            *) : ;;",
    guard: E4,
    expect: "16.7 the API URL must be loopback",
  },
  {
    id: "E4-LEAK-SCAN-AFTER-THE-UPLOAD",
    defect:
      "the artifact is uploaded before it is scanned, so a leak is published and then noticed",
    file: EVIDENCE_WF,
    find: "      - name: Scan the evidence for anything that must not leave",
    replace: "      - name: Scan the evidence afterwards, once it is already public",
    guard: E4,
    expect: "16.13 the leak scan runs BEFORE the upload",
  },
  {
    id: "E4-LEAK-SCAN-REDACTS-QUIETLY",
    defect:
      "the scan reports a finding and exits zero, so a leak becomes a log line nobody reads instead of a red build",
    file: SCAN,
    find: "    process.exit(1);\n  }\n\n  // An empty artifact uploaded green is worse than no artifact",
    replace:
      "    process.exit(0);\n  }\n\n  // An empty artifact uploaded green is worse than no artifact",
    guard: E4,
    expect: "16.17 and a leak fails the job rather than being redacted quietly",
  },
  {
    id: "E4-UPLOAD-IGNORES-THE-SCAN-VERDICT",
    defect:
      "the upload runs on always(), so a leak turns the job red AND publishes the artifact anyway -- the scan becomes an opinion and the secret is downloadable by anyone who can read the pull request",
    file: EVIDENCE_WF,
    find: "        if: always() && steps.leak_scan.outcome == 'success'",
    replace: "        if: always()",
    guard: E4,
    expect: "16.13b and the upload happens only if the scan PASSED",
  },

  /* ---- A reproducible evidence environment --------------------------- *
   *
   * `version: latest` makes the environment float: a CLI release changes the
   * local stack's images, its default privileges or its command surface, and
   * a run that stops matching an earlier one reads as a code change rather
   * than a tool change.
   */
  {
    id: "E4-CLI-VERSION-FLOATS",
    defect:
      "the Supabase CLI is asked for `latest`, so the evidence environment changes under the workflow and two runs of the same commit can disagree for reasons no commit explains",
    file: EVIDENCE_WF,
    find: '  SUPABASE_CLI_VERSION: "2.117.0"',
    replace: '  SUPABASE_CLI_VERSION: "latest"',
    guard: E4,
    expect: "16.24 the Supabase CLI is pinned to an exact reviewed version",
  },
  {
    id: "E4-CLI-PIN-NEVER-VERIFIED",
    defect:
      "the run stops checking that the installed CLI is the pinned one, so the pin becomes a comment and a silently different tool produces the evidence",
    file: EVIDENCE_WF,
    find: '            echo "CLI PIN REFUSED: asked for ${SUPABASE_CLI_VERSION}, got ${installed}" >&2',
    replace: '            echo "note: a different CLI installed, carrying on" >&2',
    guard: E4,
    expect: "16.25 and the run refuses to continue if the installed CLI is not the pinned one",
  },
  {
    id: "E4-CLI-SURFACE-ASSUMED",
    defect:
      "the commands this job depends on are no longer proven to exist in the pinned version, so a surface change fails half an hour in with an unhelpful message",
    file: EVIDENCE_WF,
    find: "          for c in start stop status db; do",
    replace: "          for c in ; do",
    guard: E4,
    expect: "16.26 the run proves `supabase start` exists in that version",
  },
  {
    id: "E4-MANIFEST-HIDES-THE-PIN",
    defect:
      "the manifest stops recording the pinned version, so a reader cannot tell whether the CLI that produced the artifact was the one the workflow asked for",
    file: MANIFEST,
    find: "    supabaseCliPinned: process.env.E4_SUPABASE_CLI_PINNED || null,",
    replace: "    // pinned version not recorded",
    guard: E4,
    expect: "16.27 the manifest records the pinned version beside the one that actually ran",
  },

  /* ---- One description of the database ------------------------------- *
   *
   * The walk writes to a database. Being told which one twice -- once by the
   * validated URL and once by defaults written from memory -- is not
   * redundancy: two descriptions can disagree, and the way that failure
   * presents is writing to the wrong database.
   */
  {
    id: "E4-WORKFLOW-HARDCODES-THE-DATABASE",
    defect:
      "the walk is handed a hardcoded host, a guessed port and a literal password again instead of the URL the isolation gate proved is loopback",
    file: EVIDENCE_WF,
    find: "          E4_DATABASE_URL: ${{ steps.local.outputs.db_url }}",
    replace:
      '          E4_PGHOST: 127.0.0.1\n          E4_PGPORT: "54322"\n          E4_PGPASSWORD: postgres',
    guard: E4,
    expect: "16.28 the walk is handed the SAME database URL the isolation gate validated",
  },
  {
    id: "E4-SPEC-GUESSES-THE-DATABASE",
    defect:
      "the spec gives the database URL a default, so a missing or unset value no longer stops the walk -- it proceeds against whatever the default happens to name",
    file: EVIDENCE_SPEC,
    find: "  const raw = process.env.E4_DATABASE_URL;",
    replace:
      '  const raw = process.env.E4_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";',
    guard: E4,
    expect: "16.31 the spec reads exactly one URL and gives it NO default",
  },
  {
    id: "E4-SPEC-ACCEPTS-A-HOSTED-DATABASE",
    defect:
      "the spec stops refusing a non-loopback host, so one wrong environment variable points a MUTATING walk -- it finalises reports and writes findings -- at a hosted project",
    file: EVIDENCE_SPEC,
    find: "    throw new Error(`E4 evidence writes only to the local stack, not ${url.hostname}`);",
    replace: "    // any host will do",
    guard: E4,
    expect: "16.32 it refuses a parsed host that is not loopback",
  },
  {
    id: "E4-SPEC-ACCEPTS-THE-OWNER-PROJECT",
    defect: "the spec stops refusing a URL naming the owner production project by name",
    file: EVIDENCE_SPEC,
    find: '    throw new Error("E4 evidence refuses a database URL naming the owner production project.");',
    replace: "    // the owner project ref is allowed through",
    guard: E4,
    expect: "16.33c a missing deny value fails closed, and a matching database URL is refused",
  },
  {
    id: "E4-SPEC-EMBEDS-THE-OWNER-PROJECT-REF",
    defect:
      "the production project ref is embedded in the Playwright spec again, so every trace carries it in a source resource and the scanner must refuse the artifact",
    file: EVIDENCE_SPEC,
    find: "const OWNER_PROJECT_REF = process.env.E4_FORBIDDEN_PROJECT_REF;",
    replace: 'const OWNER_PROJECT_REF = "wrygicdfxwjnrugduxnt";',
    guard: E4,
    expect: "16.33b the trace-captured spec source does not embed the production project ref",
  },
  {
    id: "E4-SPEC-OWNER-PROJECT-DENY-VALUE-MAY-BE-MISSING",
    defect:
      "the workflow can omit the deny value and the mutating walk carries on without its explicit production-project refusal",
    file: EVIDENCE_SPEC,
    find: '    throw new Error(\n      "E4 evidence needs E4_FORBIDDEN_PROJECT_REF so the owner production project is refused by name.",\n    );',
    replace: "    // missing deny value is accepted",
    guard: E4,
    expect: "16.33c a missing deny value fails closed, and a matching database URL is refused",
  },
  {
    id: "E4-SPEC-GUESSES-THE-PORT",
    defect:
      "the spec falls back to a guessed port when the URL names none, so it writes to whatever is listening there",
    find: '    throw new Error("E4_DATABASE_URL names no port, and nothing here may guess one.");',
    file: EVIDENCE_SPEC,
    replace: '    url.port = "54322";',
    guard: E4,
    expect: "16.34 and refuses to guess a port",
  },

  /* ---- The debt the evidence pipeline found --------------------------- */
  {
    id: "E4-REPLAY-DEBT-NOT-RECORDED",
    defect:
      "the stock-local replay incompatibility is dropped from the record, so a pre-existing defect that blocks anyone reproducing this schema locally is known only to whoever read the workflow comments",
    file: "docs/employer/employer-final-report-product-truth.md",
    find: "#### D · The migration history does not replay on a stock local Supabase stack",
    replace: "#### D · A note about local development",
    guard: E4,
    expect: "15.8 the record names limitation D",
  },
  {
    id: "E4-REPLAY-DEBT-CLAIMS-A-FIX",
    defect:
      "the record stops saying the migration's apply-time proof was left intact, which is what separates 'we worked around a defect and wrote it down' from 'we weakened a guarantee to get a green run'",
    file: "docs/employer/employer-final-report-product-truth.md",
    find: "apply-time proof is **not weakened**",
    replace: "apply-time proof was adjusted",
    guard: E4,
    expect: "15.13 and states that the migration's apply-time proof was not weakened",
  },

  {
    id: "E4-WALK-REPORTS-TO-THE-TERMINAL-ONLY",
    defect:
      "the walk stops writing a machine-readable result, so `manifest.results` -- which the manifest calls the authoritative answer to which states were exercised -- is null on every run and reads as 'nothing ran'",
    file: EVIDENCE_WF,
    find: "            --reporter=list,json,html",
    replace: "            --reporter=list",
    guard: E4,
    expect: "16.36 the walk writes a machine-readable result the manifest can actually read",
  },
  {
    id: "E4-SERVER-LOG-NEVER-SCANNED",
    defect:
      "the server log is collected after the leak scan instead of before it, so a request log -- exactly where a token ends up by accident -- is published unread",
    file: EVIDENCE_WF,
    find: "      - name: Collect the server log",
    replace: "      - name: Gather the server log at the very end instead",
    guard: E4,
    expect: "16.37 the server log is collected into the artifact BEFORE the leak scan reads it",
  },

  /* ---- Whose token is it --------------------------------------------- *
   *
   * A trace records the network, so it carries the anon key and the signed-in
   * user's bearer token. Refusing every JWT would make a trace unpublishable;
   * accepting anything self-declared is a bypass. The rule is "this exact
   * token came out of this run, and is not service-role".
   */
  {
    id: "E4-TOKEN-POLICY-TRUSTS-THE-ISSUER",
    defect:
      "the scan accepts a token because its ISSUER matches, which is a claim the token makes about itself -- an unsigned forgery naming the local issuer is published",
    file: SCAN,
    find: "  if (!allow.digests.has(sha256hex(token))) {",
    replace:
      '  if (claims.iss === "e4-local-demo") return { allowed: true, reason: "issuer matches" };\n  if (!allow.digests.has(sha256hex(token))) {',
    guard: E4,
    expect: "17.13 an UNSIGNED token claiming the local issuer is refused",
  },
  {
    id: "E4-TOKEN-POLICY-ALLOWS-SERVICE-ROLE",
    defect:
      "a service-role token becomes publishable, so the one credential class that must never leave can leave",
    file: SCAN,
    find: 'if (claims.role === "service_role") {',
    replace: "if (false) {",
    guard: E4,
    expect: "17.14 a VALIDLY SIGNED service-role token is refused",
  },
  {
    id: "E4-TOKEN-POLICY-CHECKS-ROLE-AFTER-THE-ALLOWLIST",
    defect:
      "the allowlist is consulted before the service-role rule, so an allowlisted service-role token is published and the rule stops being absolute",
    file: SCAN,
    find: "  const claims = jwtClaims(token);",
    replace:
      '  if (allow.digests.has(sha256hex(token))) return { allowed: true, reason: "on the list" };\n  const claims = jwtClaims(token);',
    guard: E4,
    expect: "17.15 even ON the allowlist",
  },
  {
    id: "E4-TOKEN-POLICY-OPEN-ON-PARSE-FAILURE",
    defect:
      "a token whose payload cannot be parsed is allowed instead of refused, so anything that defeats the parser is published",
    file: SCAN,
    find: '    return {\n      allowed: false,\n      reason: "the token could not be parsed, so nothing about it is known",\n    };',
    replace: '    return { allowed: true, reason: "unparseable, letting it through" };',
    guard: E4,
    expect: "17.13b a JWT-shaped string whose payload cannot be parsed is refused",
  },
  {
    id: "E4-ALLOWLIST-UNREADABLE-MEANS-ALLOW-ALL",
    defect:
      "an unreadable allowlist stops meaning 'allow nothing' and starts meaning 'allow everything'",
    file: SCAN,
    find: "        .filter((line) => /^[0-9a-f]{64}$/.test(line)),",
    replace: "        .filter(() => false),",
    guard: E4,
    expect: "17.9 the allowlist is read as exact digests",
  },
  {
    id: "E4-LEAK-SCAN-STOPS-AT-THE-FIRST-JWT",
    defect:
      "the JWT sweep stops at the first match, so a foreign token hides behind an allowed local one in the same trace and is published",
    file: SCAN,
    find: "      while ((m = JWT_PATTERN.exec(text)) !== null && budget-- > 0) {",
    replace: "      if ((m = JWT_PATTERN.exec(text)) !== null && budget-- > 0) {",
    guard: E4,
    expect: "17.18 a foreign token AFTER an allowed one in the same file is still found",
  },
  {
    id: "E4-LOCAL-ALLOWANCE-APPLIED-SILENTLY",
    defect:
      "allowed tokens stop being counted, so the exception is applied without anybody being told -- which is how an exception becomes a hole",
    file: SCAN,
    find: "          ctx.allowedLocalTokens += 1;",
    replace: "          // not counted",
    guard: E4,
    expect: "17.15b every allowance is COUNTED",
  },
  {
    id: "E4-ALLOWLIST-INSIDE-THE-ARTIFACT",
    defect:
      "the allowlist is written into the artifact directory, where the upload reads and the manifest hashes it",
    file: EVIDENCE_WF,
    find: '          install -m 600 /dev/null "$RUNNER_TEMP/e4-token-allowlist.txt"',
    replace:
      '          install -m 600 /dev/null "artifacts/employer-final-report-e4/allowlist.txt"',
    guard: E4,
    expect: "17.25 the allowlist lives outside the artifact directory",
  },
  {
    id: "E4-ALLOWLIST-WORLD-READABLE",
    defect: "the allowlist is created with default permissions instead of 0600",
    file: EVIDENCE_WF,
    find: "          install -m 600 /dev/null",
    replace: "          touch",
    guard: E4,
    expect: "17.26 created with restrictive permissions",
  },
  {
    id: "E4-ALLOWLIST-OUTLIVES-THE-UPLOAD",
    defect:
      "the allowlist is destroyed after the upload rather than before it, so it exists while the artifact is being published",
    file: EVIDENCE_WF,
    find: "      - name: Destroy this run's token allowlist",
    replace: "      - name: Tidy up the temporary files at the very end",
    guard: E4,
    expect: "17.27 and destroyed BEFORE the upload",
  },
  {
    id: "E4-SCAN-READS-A-JWT-SECRET",
    defect:
      "the scan takes a JWT secret again, putting a signing key in the one process whose whole job is to look at things that must not be published",
    file: SCAN,
    find: "  const file = env.E4_TOKEN_ALLOWLIST?.trim();",
    replace:
      "  const unused = env.JWT_SECRET;\n  void unused;\n  const file = env.E4_TOKEN_ALLOWLIST?.trim();",
    guard: E4,
    expect: "17.24 the scan reads no JWT secret at all",
  },
  {
    id: "E4-WALK-RECORDS-RAW-TOKENS",
    defect:
      "the walk writes raw tokens into the allowlist instead of their digests, so a file full of live bearer tokens sits on the runner",
    file: EVIDENCE_SPEC,
    find: '    appendFileSync(ALLOWLIST, `${createHash("sha256").update(token, "utf8").digest("hex")}\\n`, {',
    replace: "    appendFileSync(ALLOWLIST, `${token}\\n`, {",
    guard: E4,
    expect: "17.29 and the walk recording DIGESTS, never a token",
  },

  {
    id: "E4-WALK-TIMEOUT-SMALLER-THAN-ITS-WAITS",
    defect:
      "the walk's test budget drops below the waits inside it, so an assertion timeout can never be honoured and a still-rendering page is reported as a missing element -- the exact failure the first real run produced",
    file: EVIDENCE_SPEC,
    find: "test.describe.configure({ timeout: 240_000 });",
    replace: "test.describe.configure({ timeout: 30_000 });",
    guard: E4,
    expect: "13.2b and every wait inside it fits",
  },

  {
    id: "E4-FINDING-CANNOT-BE-LOCATED",
    defect:
      "a finding names only the file, so an artifact is refused over a string nobody can find and the leak cannot be fixed at its source",
    file: SCAN,
    find: "  const at = redacted.indexOf(needle);",
    replace: '  return "";\n  const at = redacted.indexOf(needle);',
    guard: E4,
    expect: "17.23b a finding names the field that carried it",
  },
  {
    id: "E4-FINDING-CONTEXT-LEAKS-A-TOKEN",
    defect:
      "the surrounding text is reported unredacted, so widening the report to make a finding locatable widens the leak instead",
    file: SCAN,
    find: '    .replace(/eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}/g, "«token»")',
    replace: '    .replace(/\\u0000/g, "")',
    guard: E4,
    expect: "17.23c and a token beside it is masked WHOLE",
  },
  {
    id: "E4-WALK-KEEPS-NO-TRACE",
    defect:
      "the walk falls back to trace-on-failure, so a green run publishes an artifact with no trace in it at all and there is nothing to inspect",
    file: EVIDENCE_WF,
    find: "--project=chromium --workers=1 --trace on \\",
    replace: "--project=chromium --workers=1 \\",
    guard: E4,
    expect: "16.36c the walk retains a trace even when it passes",
  },
  {
    id: "E4-REPORT-EMBEDS-THE-COMMIT-BODY",
    defect:
      "Playwright re-embeds the HEAD commit -- subject, full body, author name and email -- into every report's metadata, so a commit message and a contributor's address become published text in a downloadable artifact",
    file: "playwright.config.ts",
    find: "  captureGitInfo: { commit: false, diff: false },",
    replace: "  captureGitInfo: { commit: true, diff: false },",
    guard: E4,
    expect: "16.36d no report embeds the commit body or a contributor's email",
  },

  {
    id: "E4-WALK-TYPES-OUT-A-TRANSLATION",
    defect:
      "the walk hand-writes the English verified-digest sentence again instead of reading it from the dictionary, so a copy edit fails the evidence run for a wording mismatch rather than a defect -- which has already happened twice",
    file: EVIDENCE_SPEC,
    find: '    await expect(main(page)).toContainText(copy("en", "iir.readback.verified"));',
    replace: "    await expect(main(page)).toContainText(/Verified: the digest was recomputed/);",
    guard: E4,
    expect: "13.2h and no hand-typed copy of it survives anywhere in the walk",
  },
  {
    id: "E4-WALK-DROPS-THE-DICTIONARY-LOOKUP",
    defect:
      "the Swedish verified-digest assertion stops reading the dictionary, so the two languages drift apart again",
    file: EVIDENCE_SPEC,
    find: '  await expect(main(page)).toContainText(copy("sv", "iir.readback.verified"));\n  await expect(main(page)).toContainText(/Version 1/);',
    replace:
      "  await expect(main(page)).toContainText(/Kontrollerad/);\n  await expect(main(page)).toContainText(/Version 1/);",
    guard: E4,
    expect: "13.2g EVERY walk asserting the verified-digest sentence reads it from the dictionary",
  },

  /* ---- All four language-and-viewport combinations -------------------- */
  {
    id: "E4-ENGLISH-DESKTOP-WAITS-ON-STALE-SWEDISH-COPY",
    defect:
      "the English-desktop walk waits for an obsolete Swedish status word before it can switch to English, so correct current copy fails the evidence run",
    file: EVIDENCE_SPEC,
    find: '    await expect(doc(page, "final")).toBeVisible({ timeout: 60_000 });',
    replace:
      "    await expect(main(page)).toContainText(/Slutförd|Finalised/, { timeout: 60_000 });",
    guard: E4,
    expect:
      "13.2f the English-desktop walk waits on the structural final document before changing language, not on stale translated copy",
  },
  {
    // KEPT FROM THE REPOSITORY OWNER'S FIX, RE-AIMED. Their control mutated
    // the literal the walk used to assert; the walk reads the dictionary now,
    // so the literal is gone and the defect they were guarding against has
    // moved. What can still go stale is the DICTIONARY, so that is what this
    // mutates: the product copy regressing to the obsolete wording.
    id: "E4-ENGLISH-DIGEST-COPY-REGRESSES-TO-OBSOLETE-WORDING",
    defect:
      "the English verified-digest sentence reverts to the obsolete Verified wording, so the product ships copy the evidence record says was replaced",
    file: DICT,
    find: '"Checked: the digest was recomputed from the stored basis and matches."',
    replace: '"Verified: the digest was recomputed from the stored basis and matches."',
    guard: E4,
    expect: "13.2i the English verified-digest copy is the current one",
  },
  {
    id: "E4-WALK-SKIPS-ENGLISH-DESKTOP",
    defect:
      "the English desktop walk is dropped, so the manifest still declares two locales and two viewports while only three of the four combinations are ever routed",
    file: EVIDENCE_SPEC,
    find: 'test("14-15 · ENGLISH DESKTOP 1440',
    replace: 'test.skip("14-15 · english desktop dropped',
    guard: E4,
    expect: "13.2e the walk covers ENGLISH DESKTOP 1440",
  },
  {
    id: "E4-WALK-SKIPS-SWEDISH-MOBILE",
    defect: "the Swedish mobile walk is dropped, leaving the fourth combination unrouted",
    file: EVIDENCE_SPEC,
    find: 'test("16-17 · SWEDISH MOBILE 375',
    replace: 'test.skip("16-17 · swedish mobile dropped',
    guard: E4,
    expect: "13.2e the walk covers SWEDISH MOBILE 375",
  },
  {
    id: "E4-WALK-SLEEPS-INSTEAD-OF-WAITING",
    defect:
      "the walk waits on the clock instead of on an application state, so it passes or fails on how loaded the runner is and a generous budget hides a hang",
    file: EVIDENCE_SPEC,
    find: '  await page.waitForLoadState("networkidle");',
    replace: "  await page.waitForTimeout(5000);",
    guard: E4,
    expect: "13.2c and it contains no arbitrary sleep",
  },
  {
    id: "E4-WALK-RECORDS-NO-DURATIONS",
    defect:
      "phase and test durations stop being recorded, so a step that hangs for three minutes inside a 240 s budget is indistinguishable from one that took a second",
    file: EVIDENCE_SPEC,
    find: "  writeFileSync(`${OUT}/timings.json`",
    replace: "  void String(`${OUT}/nothing.json`",
    guard: E4,
    expect:
      "13.2d each test's duration and each step's duration are recorded beside the captures under ONE key",
  },

  /* ---- Does the artifact contain what the manifest says? -------------- */
  {
    id: "E4-ARTIFACT-NEVER-VERIFIED",
    defect:
      "the artifact is uploaded without checking that the manifest describes it, so a manifest that is wrong about its own contents becomes a false assurance in the one place a reviewer looks",
    file: EVIDENCE_WF,
    find: "      - name: Verify the artifact against its own manifest",
    replace: "      - name: Take the manifest at its word",
    guard: E4,
    expect: "16.13c the artifact is verified BEFORE it is uploaded",
  },
  {
    id: "E4-UPLOAD-IGNORES-THE-VERIFIER",
    defect:
      "the upload stops depending on the verifier, so an artifact that does not match its manifest is published anyway",
    file: EVIDENCE_WF,
    find: " && steps.verify.outcome == 'success'",
    replace: "",
    guard: E4,
    expect: "16.13d and a manifest that does not describe the artifact publishes nothing",
  },
  {
    id: "E4-VERIFIER-TRUSTS-THE-RECORDED-DIGESTS",
    defect:
      "the verifier stops recomputing digests, so the manifest can say anything about the bytes it ships",
    file: VERIFY,
    find: "  if (sha256(buf) !== entry.sha256) {",
    replace: "  if (false) {",
    guard: E4,
    expect: "16.13e the verifier checks that every recorded digest is recomputed from the bytes",
  },
  {
    id: "E4-VERIFIER-ACCEPTS-A-MISSING-CAPTURE",
    defect:
      "a capture the walk claims to take can go missing without failing the run, so the artifact quietly shrinks",
    file: VERIFY,
    find: "  if (!captures.has(name)) problems.push(`the capture ${name}.png was never taken`);",
    replace: "  void name;",
    guard: E4,
    expect: "16.13e the verifier checks that every capture the walk claims is required by name",
  },
  {
    id: "E4-VERIFIER-ACCEPTS-A-FAILED-WALK",
    defect:
      "a failed test no longer refuses the artifact, so evidence of a journey that did not complete is published as if it had",
    file: VERIFY,
    find: "    if (!spec.ok) problems.push(`the walk did not pass: ${spec.title}`);",
    replace: "    void spec;",
    guard: E4,
    expect: "16.13e the verifier checks that a failed test refuses the artifact",
  },
  {
    id: "E4-VERIFIER-ACCEPTS-ANOTHER-COMMIT",
    defect:
      "the manifest's head is no longer compared with the commit the job ran on, so an artifact from another commit is published as evidence for this one",
    file: VERIFY,
    find: "if (expectedHead && manifest.head !== expectedHead) {",
    replace: "if (false) {",
    guard: E4,
    expect: "16.13e the verifier checks that the head recorded is the head the job ran on",
  },
  {
    id: "E4-VERIFIER-PRINTS-NOTHING",
    defect:
      "the inventory stops being printed, so a reviewer who cannot download the artifact has no way to see what was in it or to check a copy against it",
    file: VERIFY,
    find: 'console.log("\\n  EVERY FILE (sha256 · bytes · path)");',
    replace: "  // inventory not printed",
    guard: E4,
    expect: "16.13f and prints the whole inventory to the job log",
  },

  {
    id: "E4-VERIFIER-ACCEPTS-DUPLICATE-CAPTURES",
    defect:
      "two captures may be byte-for-byte identical without failing the run, so the artifact lists as separate evidence an image that shows nothing another does not -- which is exactly what the first green run produced",
    file: VERIFY,
    find: "  if (names.length > 1) {",
    replace: "  if (false) {",
    guard: E4,
    expect: "16.13e the verifier checks that no capture is a byte-for-byte duplicate of another",
  },
  {
    id: "E4-VERIFIER-ACCEPTS-AN-UNTIMED-TEST",
    defect:
      "a test may record only a total with no step durations, so a stall inside a 240 s budget is indistinguishable from work",
    file: VERIFY,
    find: "    problems.push(`${name} recorded no step durations, only a total`);",
    replace: "    void name;",
    guard: E4,
    expect: "16.13e the verifier checks that every test recorded how its time was spent",
  },
  {
    id: "E4-CAPTURE-15-DUPLICATES-CAPTURE-14",
    defect:
      "the disagreement capture is clipped to the section's HEADING id instead of the section, so it is 3 kB of a one-line title and shows neither assessor -- the shape of the mistake the verifier caught twice",
    file: EVIDENCE_SPEC,
    find: "      .locator('section[aria-labelledby=\"fr-assessments\"]')",
    replace: '      .locator("#fr-assessments")',
    guard: E4,
    expect: "13.2k the disagreement capture is clipped to the assessors SECTION",
  },
  {
    id: "E4-LONG-WALK-RECORDS-NO-STEPS",
    defect:
      "the 31-second Swedish walk stops recording step durations, so a stall in the longest test is hidden by the budget that makes the test possible",
    file: EVIDENCE_SPEC,
    find: '  mark("01 · before a preview, the act is not offered");',
    replace: "  // step no longer recorded",
    guard: E4,
    expect: "13.2j EVERY capture's own step is timed",
  },

  {
    id: "E4-VERIFIER-PRINTS-OK-FOR-A-REFUSED-CAPTURE",
    defect:
      "the captures table prints ok beside a file the refusal below rejects, so the two halves of the same report contradict each other and a reader trusts the wrong one",
    file: VERIFY,
    find: "  const faulted = problems.some((p) => p.includes(name));",
    replace: "  const faulted = false;",
    guard: E4,
    expect: "16.13e the verifier checks that a capture it rejected is not also printed as ok",
  },

  /* ---- The stack the evidence is taken against ----------------------- *
   *
   * The first run of the evidence workflow failed replaying the migration
   * history, because a migration's own apply-time grant proof cannot survive
   * a stock `supabase start`: its default function privileges grant EXECUTE
   * to service_role, and a REVOKE naming only PUBLIC and anon leaves that
   * grant standing. The owner project has no such implicit grant -- read
   * read-only from production -- so matching it is what makes the evidence
   * faithful. Both controls below restore a stack that cannot produce
   * evidence at all.
   */
  {
    id: "E4-REPLAY-SKIPS-THE-PRIVILEGE-BASELINE",
    defect:
      "the replay runs against a stock Supabase stack, whose implicit service_role grant does not match the owner project and makes a migration refuse itself at apply time",
    file: EVIDENCE_WF,
    find: "      - name: Match the hosted privilege baseline",
    replace: "      - name: Take the stock grants and hope they match production",
    guard: E4,
    expect: "16.8b the privilege baseline is set BEFORE the replay",
  },
  {
    id: "E4-REPLAY-BACK-TO-DB-RESET",
    defect:
      "the replay goes back to `supabase db reset`, which recreates the database and restores exactly the stock default privileges the baseline step exists to correct",
    file: EVIDENCE_WF,
    find: "          for f in supabase/migrations/*.sql; do",
    replace: "          supabase db reset --no-seed; for f in /dev/null; do",
    guard: E4,
    expect: "16.8d and the replay is not `supabase db reset`",
  },

  /* ---- The manifest must name the commit under review ----------------- */
  {
    id: "E4-MANIFEST-NAMES-THE-MERGE-COMMIT",
    defect:
      "the manifest records GITHUB_SHA, which on a pull_request event is the ephemeral merge commit and never the pull request's head -- so a reviewer following the manifest's own instruction concludes the artifact belongs to another commit",
    file: MANIFEST,
    find: "  head: process.env.E4_HEAD_SHA ?? process.env.GITHUB_SHA",
    replace: "  head: process.env.GITHUB_SHA",
    guard: E4,
    expect: "16.21 the manifest's head is the PULL REQUEST's head",
  },
  {
    id: "E4-WORKFLOW-WITHHOLDS-THE-HEAD-SHA",
    defect:
      "the workflow stops passing the pull request's head sha, so the manifest silently falls back to the merge commit",
    file: EVIDENCE_WF,
    find: "          E4_SUPABASE_CLI_PINNED: ${{ env.SUPABASE_CLI_VERSION }}\n          E4_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    replace:
      "          E4_SUPABASE_CLI_PINNED: ${{ env.SUPABASE_CLI_VERSION }}\n          E4_HEAD_SHA: ${{ github.sha }}",
    guard: E4,
    expect: "16.22 EVERY step handed a head sha is handed the PULL REQUEST's, from the event",
  },

  /* ---- The leak scan must actually READ what it scans ----------------- *
   *
   * Each of these disables ONE reader. The guard proves the scan works by
   * RUNNING it over planted leaks, so a scanner that stops decompressing
   * stops passing -- which is the whole point, because the first version of
   * this file read every byte as latin1, called that "scanning binaries",
   * and could not see a JWT inside a trace.
   */
  {
    id: "E4-LEAK-SCAN-BLIND-INSIDE-A-ZIP",
    defect:
      "zip entries are no longer inflated, so a JWT inside trace.zip -- the artifact file most likely to carry one, because a trace records the network -- is invisible and is published",
    file: SCAN,
    find: "inflateRawSync(raw)",
    replace: "Buffer.alloc(0)",
    guard: E4,
    expect: "17.1 a JWT inside trace.zip is found",
  },
  {
    id: "E4-LEAK-SCAN-BLIND-TO-EMBEDDED-BASE64",
    defect:
      "base64 attachments are no longer decoded, so a service-role value embedded in the Playwright HTML report is published unread",
    file: SCAN,
    find: "/[A-Za-z0-9+/]{80,}={0,2}/g",
    replace: "/[A-Za-z0-9+/]{8000,}={0,2}/g",
    guard: E4,
    expect: "17.2 a service-role value embedded as base64",
  },
  {
    id: "E4-LEAK-SCAN-BLIND-TO-GZIP",
    defect:
      "compressed logs are no longer inflated, so the owner project ref inside a gzipped network log is published",
    file: SCAN,
    find: 'if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf).toString("utf8");',
    replace: "if (buf[0] === 0x1f && buf[1] === 0x8b) return null;",
    guard: E4,
    expect: "17.3 the owner project ref inside a compressed network log",
  },
  {
    id: "E4-LEAK-SCAN-STOPS-AT-THE-TOP-LEVEL",
    defect:
      "nesting is no longer walked, so a hosted Supabase URL in an attachment inside an attachment is published",
    file: SCAN,
    find: "if (depth < 2 && buf.length > 4",
    replace: "if (depth < 1 && buf.length > 4",
    guard: E4,
    expect: "17.4 a hosted Supabase URL one archive deeper is still found",
  },
  {
    id: "E4-LEAK-SCAN-WALKS-NOTHING",
    defect:
      "the walk stops descending into subdirectories, so the readers all work and the scan is pointed at nothing -- test-results/<case>/trace.zip is never opened and the artifact is published unscanned",
    file: SCAN,
    find: "if (statSync(path.join(base, child)).isDirectory()) out.push(...walk(child, base));",
    replace: "if (statSync(path.join(base, child)).isDirectory()) continue;",
    guard: E4,
    expect: "17.5 the walk read every planted file",
  },
  {
    id: "E4-EMPTY-ARTIFACT-PUBLISHED-GREEN",
    defect:
      "an artifact with no screenshot is published as evidence, so the checks list shows evidence that does not exist",
    file: EVIDENCE_WF,
    find: "          if-no-files-found: error",
    replace: "          if-no-files-found: ignore",
    guard: E4,
    expect: "16.14 and an empty artifact is an error, not a pass",
  },
  {
    id: "E4-MANIFEST-DROPS-THE-HEAD",
    defect:
      "the manifest stops recording the HEAD, so nobody can tell whether the captures belong to the commit under review",
    file: MANIFEST,
    find: "  head: process.env.E4_HEAD_SHA ??",
    replace: "  capturedFrom: process.env.E4_HEAD_SHA ??",
    guard: E4,
    expect: "16.19 the manifest records head",
  },
  {
    id: "E4-WALK-RUNS-IN-PARALLEL",
    defect:
      "the walk runs with default workers, so two of them share one database, race the version counter and assert against each other's reports",
    file: EVIDENCE_WF,
    find: " --project=chromium --workers=1",
    replace: " --project=chromium",
    guard: E4,
    expect: "16.11 the walk runs serially",
  },
  /* ---- What finalising MEANS ---------------------------------------- */
  {
    id: "E4-FINALISING-CLAIMS-A-CONCLUSION",
    defect:
      "finalising is described as approving a conclusion, which the model does not hold: the only persisted conclusion is the PANEL's, written by any case member, and a case without a panel has none at all",
    file: SEQ,
    find: '  "recordsWhoAndWhen",',
    replace: '  "recordsWhoAndWhen",\n  "approvesTheConclusion",',
    guard: E4,
    expect: "15.1 what finalising DOES is stated as locking a basis",
  },
  {
    id: "E4-OWNER-CONCLUSION-INVENTED-IN-COPY",
    defect:
      "the effects copy starts calling the frozen basis the owner's conclusion, so a reader believes a named human authored a judgement the record does not contain",
    file: DICT,
    find: '    "iir.effects.freezesTheBasis": "The basis is frozen exactly as it stands now",',
    replace:
      '    "iir.effects.freezesTheBasis": "Your conclusion is approved and frozen exactly as it stands now",',
    guard: E4,
    expect: "15.2 en: and the rendered copy says so too",
  },
  {
    id: "E4-PANEL-PROSE-RELABELLED-AS-THE-OWNERS",
    defect:
      "the panel's conclusion is relabelled as the recruitment owner's, although scp_iv_panel_conclude is gated on any case member and finalisation on owner/admin -- two different people",
    file: DICT,
    find: '    "iir.doc.panel.title": "Panel conclusion",',
    replace: '    "iir.doc.panel.title": "The recruitment owner\'s conclusion",',
    guard: E4,
    expect: "15.3 en: the only persisted conclusion is labelled the PANEL",
  },
  {
    id: "E4-OWNER-CONCLUSION-IN-CLIENT-STATE",
    defect:
      "an owner conclusion is manufactured in client state, so the document looks more decisive than the governed model actually is",
    file: SEQ,
    find: "export function actorLabel(r: {",
    replace:
      "export function ownerConclusion(): string | null {\n  return null;\n}\n\nexport function actorLabel(r: {",
    guard: E4,
    expect: "15.4 and no owner conclusion is manufactured in client state",
  },
  {
    id: "E4-LIMITATION-QUIETLY-DROPPED",
    defect:
      "the product-truth record stops saying that no recruitment-owner conclusion exists, so the gap becomes something only the schema knows",
    file: "docs/employer/employer-final-report-product-truth.md",
    find: "**There is no server-owned, persisted recruitment-owner conclusion.**",
    replace: "**The recruitment owner records their conclusion.**",
    guard: E4,
    expect: "15.6 the product-truth record states the missing owner conclusion",
  },
  /* ---- The digest ------------------------------------------------- */
  {
    id: "E4-HASH-BACK-TO-MD5",
    defect: "the finalised basis is hashed with md5 again, the original defect restored",
    file: MIGRATION,
    find: "  _hash := public.scp_iv_content_hash(_payload);",
    replace: "  _hash := md5(_payload::text);",
    guard: E4,
    expect: "8.2 md5 is gone from the write path",
  },
  {
    id: "E4-HASH-VIA-PGCRYPTO",
    defect:
      "the digest goes through pgcrypto's digest(), which cannot resolve under a pinned search_path on the hosted project",
    file: MIGRATION,
    find: "  SELECT encode(sha256(convert_to(_payload::text, 'UTF8')), 'hex');",
    replace: "  SELECT encode(digest(_payload::text, 'sha256'), 'hex');",
    guard: E4,
    expect: "8.3 and it does NOT use pgcrypto digest()",
  },
  {
    id: "E4-HASH-OVER-BYTEA-CAST",
    defect:
      "the digest is taken over text::bytea, which parses bytea escape syntax and fails on a payload containing a quote",
    file: MIGRATION,
    find: "  SELECT encode(sha256(convert_to(_payload::text, 'UTF8')), 'hex');",
    replace: "  SELECT encode(sha256(_payload::text::bytea), 'hex');",
    guard: E4,
    expect: "8.1b and nothing casts text to bytea",
  },
  {
    id: "E4-ALGORITHM-NOT-RECORDED",
    defect: "the stored hash no longer says which algorithm produced it",
    file: MIGRATION,
    find: "          _hash, 'sha256', _basis, _c.pack_version_id, _c.pack_content_hash,",
    replace: "          _hash, NULL, _basis, _c.pack_version_id, _c.pack_content_hash,",
    guard: E4,
    expect: "8.5 as sha256 on every new finalisation",
  },

  /* ---- The basis --------------------------------------------------- */
  {
    id: "E4-ROLE-IS-THE-INTERNAL-TITLE",
    defect:
      "the advertised role is dropped, so the report names only the internal title a recruiter typed for themselves",
    file: MIGRATION,
    find: "      'advertised_role_sv', (SELECT j.title_sv FROM public.jobs j WHERE j.id = _c.job_id),",
    replace: "      'internal_title_only', _c.title,",
    guard: E4,
    expect: "8.6 the basis names the ADVERTISED role in both languages",
  },
  {
    id: "E4-BASIS-FORGETS-THE-APPLICATION",
    defect: "the report stops naming the application and advert it belongs to",
    file: MIGRATION,
    find: "      'application_id', _c.application_id,\n      'job_id', _c.job_id,",
    replace: "      'unnamed', true,",
    guard: E4,
    expect: "8.7 and the application and the advert it belongs to",
  },
  {
    id: "E4-ASSESSMENT-MATERIAL-DROPPED",
    defect: "the report no longer records which assessment material the process ran on",
    file: MIGRATION,
    find: "    'assessment_material', coalesce((",
    replace: "    'unused_block', coalesce((",
    guard: E4,
    expect: "8.8 and the assessment material the process ran on",
  },

  /* ---- The assessment RESULT, bound ------------------------------- */
  {
    id: "E4-RESULT-NOT-BOUND-TO-VERSION",
    defect:
      "the released result is carried without the release version it came from, so a later re-release could pass as this one",
    file: MIGRATION,
    find: "                          'report_version_id', ident.report_version_id,",
    replace: "                          'unbound', NULL,",
    guard: E4,
    expect: "8.8c bound to the exact snapshot, release version and release time",
  },
  {
    id: "E4-FINDINGS-NAMED-NOT-CARRIED",
    defect:
      "the assessment material is named but its released findings are dropped -- the report says an assessment happened and not what it found",
    file: MIGRATION,
    find: "                          'findings', er.safety_flags,\n                          'context', er.context,\n",
    replace:
      "                          'findings', '[]'::jsonb,\n                          'context', er.context,\n",
    guard: E4,
    expect: "8.8e the released findings are carried in the bound result itself",
  },
  {
    id: "E4-SNAPSHOT-TABLE-READ-DIRECTLY",
    defect:
      "the builder reads the assessment snapshot table itself instead of the assessment domain's governed projection (TR12.3)",
    file: MIGRATION,
    find: "                   FROM public.scp_employer_report(at.id) er",
    replace:
      "                   FROM (SELECT s.id, s.payload, s.brief, s.safety_flags, s.context, s.limitations_sv, s.limitations_en FROM public.scp_report_snapshots s WHERE s.attempt_id = at.id) er",
    guard: E4,
    expect: "8.13 and no scp_iv_ function names the assessment snapshot or evidence table (TR12.3)",
  },

  /* ---- Every assessor, in a declared order ------------------------ */
  {
    id: "E4-ONE-ASSESSOR-BY-HEAP",
    defect:
      "one assessment per question is picked with LIMIT 1 and no ORDER BY -- the original defect, where the heap chose whose judgement became the employer's report",
    file: MIGRATION,
    find: "               'assessor_count', (",
    replace:
      "               'assessment', (SELECT to_jsonb(a) FROM public.scp_interview_assessments a WHERE a.case_id = _case_id AND a.question_id = q.id AND a.superseded_by IS NULL LIMIT 1),\n               'assessor_count', (",
    guard: E4,
    expect: "8.25 no assessment is picked with LIMIT 1",
  },
  {
    id: "E4-ASSESSORS-IN-HEAP-ORDER",
    defect:
      "the assessments aggregate loses its ORDER BY, so which assessor comes first -- and the digest -- depends on physical row order",
    file: MIGRATION,
    find: "                        ORDER BY a.assessor_id, a.assessed_at, a.id)",
    replace: "                        )",
    guard: E4,
    expect: "8.27 in an order declared by who assessed, when, and an immutable id",
  },
  {
    id: "E4-AGGREGATE-UNORDERED",
    defect:
      "the evidence aggregate loses its ORDER BY, so the same case can produce two payloads with two digests",
    file: MIGRATION,
    find: "                        ORDER BY ev.confirmed_at, ev.id)",
    replace: "                        )",
    guard: E4,
    expect: "8.31 and every one of them carries an ORDER BY inside its own parentheses",
  },
  {
    id: "E4-TIEBREAKER-DROPPED",
    defect:
      "the evidence ORDER BY loses its immutable tie-breaker, so two items confirmed in the same instant can swap places between two builds",
    file: MIGRATION,
    find: "                        ORDER BY ev.confirmed_at, ev.id)",
    replace: "                        ORDER BY ev.confirmed_at)",
    guard: E4,
    expect: "8.32 and each ORDER BY ends in an immutable tie-breaker",
  },
  {
    id: "E4-LIMIT-WITHOUT-ORDER",
    defect: "a LIMIT 1 in the builder is left without an ORDER BY above it",
    file: MIGRATION,
    find: "                  ORDER BY er.id\n                  LIMIT 1))",
    replace: "                  LIMIT 1))",
    guard: E4,
    expect: "8.34 and every LIMIT 1 left in the builder sits under an ORDER BY",
  },

  /* ---- Evidence that all looks the same ---------------------------- */
  {
    id: "E4-EVIDENCE-UNCLASSIFIED",
    defect:
      "evidence stops carrying what KIND of thing it is, so a candidate statement and an interviewer observation render identically",
    file: MIGRATION,
    find: "                          'classification',",
    replace: "                          'unused_field',",
    guard: E4,
    expect: "8.9 every evidence item is classified",
  },
  {
    id: "E4-DISCLOSURE-CALLED-VERIFIED",
    defect:
      "a line from a Passport disclosure is classified as verified material on the strength of its source kind alone -- the original defect restored",
    file: MIGRATION,
    find: "WHEN 'passport_disclosure'   THEN 'passport_disclosure'",
    replace: "WHEN 'passport_disclosure'   THEN 'verified_material'",
    guard: E4,
    expect: "8.11b a Passport disclosure is classified as what it is",
  },
  {
    id: "E4-LEVEL-PRESENTED-AS-FACT",
    defect:
      "a human level stops being labelled an interpretation and is presented as a further fact about the person",
    file: MIGRATION,
    find: "                          'kind', 'human_interpretation')",
    replace: "                          'kind', 'established_fact')",
    guard: E4,
    expect: "8.10 and a human level is named an interpretation, not a further fact",
  },
  {
    id: "E4-UNSOURCED-EVIDENCE-GUESSED",
    defect:
      "an evidence item with no source link is silently called an interviewer observation rather than reported as unattributed",
    file: MIGRATION,
    find: "                            ELSE 'unattributed'",
    replace: "                            ELSE 'interviewer_observation'",
    guard: E4,
    expect: "8.11 an item with no source link is reported as unattributed",
  },

  /* ---- Preview equals finalisation --------------------------------- */
  {
    id: "E4-FINALISE-TAKES-NO-IDENTITY",
    defect:
      "the previewed identity becomes optional on the finalisation function, so a client can finalise what nobody previewed",
    file: MIGRATION,
    find: "  _case_id uuid, _expected_basis_hash text, _draft_run_id uuid)",
    replace: "  _case_id uuid, _expected_basis_hash text DEFAULT NULL, _draft_run_id uuid)",
    guard: E4,
    expect: "8.36 the preview-bound finalisation is a separately named contract",
  },
  {
    id: "E4-STALE-PREVIEW-ACCEPTED",
    defect:
      "the comparison between the previewed identity and the basis about to be locked is short-circuited, so a stale preview finalises",
    file: MIGRATION,
    find: "  IF _expected_basis_hash <> _basis THEN",
    replace: "  IF false THEN",
    guard: E4,
    expect: "8.38 finalisation refuses without an identity and refuses a stale one",
  },
  {
    id: "E4-PREVIEW-IS-ANOTHER-BUILDER",
    defect:
      "the preview stops calling the builder finalisation calls, so what the owner reads and what is locked are two code paths again",
    file: MIGRATION,
    find: "  _p := public.scp_iv_build_report_basis(_case_id);",
    replace: "  _p := jsonb_build_object('case', jsonb_build_object('candidate', 'preview'));",
    guard: E4,
    expect: "8.35 preview and finalisation call the SAME builder",
  },

  /* ---- The invariants the schema already held ---------------------- */
  {
    id: "E4-BUILDER-READS-LIVE-APPLICATION",
    defect:
      "the report builder reads the live job_applications row again, so material nobody confirmed into evidence reaches a finalised report",
    file: MIGRATION,
    find: "      'application_id', _c.application_id,",
    replace:
      "      'application_id', (SELECT a.id FROM public.job_applications a WHERE a.id = _c.application_id),",
    guard: E4,
    expect: "8.12 the builder reads no live application, Passport, CV or note table",
  },
  {
    id: "E4-SUPERSEDED-BECOMES-EDITABLE",
    defect:
      "the immutability guard stops protecting a superseded version, so a correction no longer preserves the previous one",
    file: MIGRATION,
    find: "  IF OLD.status = 'superseded' THEN\n    RAISE EXCEPTION",
    replace: "  IF false THEN\n    RAISE EXCEPTION",
    guard: E4,
    expect: "8.21 and a superseded version is immutable too",
  },

  /* ---- A finding can be written ------------------------------------ */
  {
    id: "E4-FINDINGS-GUARD-READS-A-MISSING-COLUMN",
    defect:
      "the origin guard reads NEW.note_id on every table again, so no row can be written to scp_interview_findings and the report's unresolved section is always empty -- the defect the fixture found, restored",
    file: MIGRATION,
    find: "  IF TG_TABLE_NAME IN ('scp_interview_evidence_proposals', 'scp_interview_evidence') THEN\n    IF NEW.note_id IS NOT NULL THEN",
    replace: "  IF true THEN\n    IF NEW.note_id IS NOT NULL THEN",
    guard: E4,
    expect: "8.41 the guard reads the note link only on the two tables that have one",
  },
  {
    id: "E4-EVIDENCE-ACCEPTED-WITHOUT-STATUS",
    defect: "the index loses its explicit accepted status while leaving reassuring provenance prose behind",
    file: "artifacts/employer-final-report-e4/INDEX.md",
    find: "**STATUS: ACCEPTED.**",
    replace: "**STATUS: complete.**",
    guard: E4,
    expect: "13.9 the evidence status is ACCEPTED only with a completed provenance record",
  },
  {
    id: "E4-EVIDENCE-ACCEPTED-WITHOUT-CODE-HEAD",
    defect: "accepted evidence is no longer bound to the application-code commit that produced it",
    file: "artifacts/employer-final-report-e4/INDEX.md",
    find: "| Application-code HEAD | `0b9dde32b62170dda361d6e7d5015cfdc9ce4372` |",
    replace: "| Application-code HEAD | _missing_ |",
    guard: E4,
    expect: "13.9b accepted evidence is bound to its code HEAD",
  },
  {
    id: "E4-EVIDENCE-ACCEPTED-WITHOUT-ARTIFACT-ID",
    defect: "accepted evidence no longer identifies the exact CI artifact",
    file: "artifacts/employer-final-report-e4/INDEX.md",
    find: "| Artifact | `e4-evidence-216-1` · ID `10185505021` · 21,474,020 bytes |",
    replace: "| Artifact | `e4-evidence-216-1` · ID _missing_ · 21,474,020 bytes |",
    guard: E4,
    expect: "13.9b accepted evidence is bound to its code HEAD",
  },
  {
    id: "E4-EVIDENCE-ACCEPTED-WITHOUT-ARCHIVE-DIGEST",
    defect: "accepted evidence loses the digest that makes substitution detectable",
    file: "artifacts/employer-final-report-e4/INDEX.md",
    find: "| Archive SHA-256 | `545290cb92e438d4144aa8efe2aaca5799c4e39b995ef5b313329f5476f6bdb3` |",
    replace: "| Archive SHA-256 | _missing_ |",
    guard: E4,
    expect: "13.9b accepted evidence is bound to its code HEAD",
  },
  {
    id: "E4-EVIDENCE-ACCEPTED-WITHOUT-ALL-CAPTURES",
    defect: "the record claims acceptance after fewer than the required seventeen captures were reviewed",
    file: "artifacts/employer-final-report-e4/INDEX.md",
    find: "| Captures | 17 reviewed · both languages · both widths |",
    replace: "| Captures | 16 reviewed · both languages · both widths |",
    guard: E4,
    expect: "13.9b accepted evidence is bound to its code HEAD",
  },
  {
    id: "E4-EVIDENCE-ACCEPTED-WITHOUT-ALL-TRACES",
    defect: "the record claims acceptance after fewer than all six traces were checked",
    file: "artifacts/employer-final-report-e4/INDEX.md",
    find: "| Traces | 6 archives opened and integrity-checked · no recorded page, console or action errors |",
    replace: "| Traces | 5 archives opened and integrity-checked · no recorded page, console or action errors |",
    guard: E4,
    expect: "13.9b accepted evidence is bound to its code HEAD",
  },
  {
    id: "E4-EVIDENCE-SPEC-WRITES-ANYWHERE",
    defect:
      "the loopback test is applied to a literal instead of the host actually parsed from the URL, so it passes for every host and the refusal never fires",
    file: EVIDENCE_SPEC,
    find: "if (!/^(127\\.0\\.0\\.1|localhost)$/.test(url.hostname)) {",
    replace: 'if (!/^(127\\.0\\.0\\.1|localhost)$/.test("127.0.0.1")) {',
    guard: E4,
    expect: "13.2 and its database side-effects test the host PARSED FROM THE URL for loopback",
  },

  /* ---- The rollback ----------------------------------------------- */
  {
    id: "E4-ROLLBACK-DROPS-THE-LEGACY",
    defect:
      "the rollback drops the legacy two-argument finalisation as well, which the migration never touched -- leaving the deployed application with no finalisation at all",
    file: ROLLBACK,
    find: "DROP FUNCTION IF EXISTS public.scp_iv_finalise_previewed_report(uuid, text, uuid);",
    replace:
      "DROP FUNCTION IF EXISTS public.scp_iv_finalise_previewed_report(uuid, text, uuid);\nDROP FUNCTION IF EXISTS public.scp_iv_finalise_report(uuid, uuid);",
    guard: E4,
    expect: "12.2 and neither drops nor redefines the legacy finalisation",
  },
  {
    id: "E4-MIGRATION-DROPS-THE-LEGACY",
    defect:
      "the migration drops the legacy two-argument finalisation, so the deployed application breaks the moment the schema is applied -- the release-blocking defect the review found, restored",
    file: MIGRATION,
    find: "CREATE OR REPLACE FUNCTION public.scp_iv_finalise_previewed_report(",
    replace:
      "DROP FUNCTION IF EXISTS public.scp_iv_finalise_report(uuid, uuid);\nCREATE OR REPLACE FUNCTION public.scp_iv_finalise_previewed_report(",
    guard: E4,
    expect: "8.37 and the migration neither drops, redefines nor alters the legacy",
  },
  {
    id: "E4-MIGRATION-REDEFINES-THE-LEGACY",
    defect:
      "the migration redefines the legacy function under its old name, changing the contract the deployed application calls",
    file: MIGRATION,
    find: "CREATE OR REPLACE FUNCTION public.scp_iv_finalise_previewed_report(",
    replace: "CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report(",
    guard: E4,
    expect: "8.36 the preview-bound finalisation is a separately named contract",
  },
  {
    id: "E4-PROOF-STOPS-CHECKING-THE-LEGACY",
    defect: "the apply-time proof no longer asserts the legacy contract survives the migration",
    file: MIGRATION,
    find: "  IF NOT has_function_privilege('authenticated', 'public.scp_iv_finalise_report(uuid, uuid)', 'EXECUTE') THEN\n    RAISE EXCEPTION 'SCP_IV_BASIS: the deployed application can no longer execute the legacy finalisation';\n  END IF;",
    replace: "",
    guard: E4,
    expect: "8.37b and the apply-time proof asserts BOTH contracts exist",
  },
  {
    id: "E4-LEGACY-CALL-RESTORED",
    defect:
      "the application calls the legacy two-argument finalisation again, so it finalises without a preview and breaks when the CONTRACT migration lands",
    file: RUNTIME,
    find: 'await context.supabase.rpc("scp_iv_finalise_previewed_report", {',
    replace: 'await context.supabase.rpc("scp_iv_finalise_report", {',
    guard: E4,
    expect: '14.1 no application file calls rpc("scp_iv_finalise_report")',
  },
  {
    id: "E4-LEGACY-CALL-ELSEWHERE",
    defect: "a second application path finalises through the legacy contract",
    file: ROUTE,
    find: "  const previewFn = useServerFn(previewReport);",
    replace:
      '  const previewFn = useServerFn(previewReport);\n  void (() => supabaseBrowser.rpc("scp_iv_finalise_report", { _case_id: caseId }));',
    guard: E4,
    expect: '14.1 no application file calls rpc("scp_iv_finalise_report")',
  },
  {
    id: "E4-ROLLBACK-NOT-EXERCISED",
    defect:
      "the suite stops applying the rollback and merely reads a constant, so rollback is described rather than exercised",
    file: DB_TEST,
    find: '  -f supabase/rollback/20261107090000_scp_iv_report_basis_integrity_rollback.sql 2>&1)"',
    replace: '  -c "SELECT \'SCP_IV_REPORT_BASIS_ROLLBACK ok\'" 2>&1)"',
    guard: E4,
    expect: "12.6 the suite APPLIES the rollback and reads its proof",
  },
];

/* ---- The readback and the client ---------------------------------- */
const MORE: readonly Mutation[] = [
  {
    id: "E4-READBACK-IS-A-TABLE-SELECT",
    defect:
      "the readback selects the reports table directly, so nothing recomputes the digest and integrity is asserted rather than checked",
    file: RUNTIME,
    find: '    const { data: rows, error } = await context.supabase.rpc("scp_iv_final_report", {\n      _case_id: data.caseId,\n    });',
    replace:
      '    const { data: rows, error } = await context.supabase\n      .from("scp_interview_reports")\n      .select("*")\n      .eq("case_id", data.caseId);',
    guard: E4,
    expect: "9.1 the readback goes through the governed RPC",
  },
  {
    id: "E4-ERROR-CODE-DISCARDED",
    defect:
      "the readback throws away the error code, so a refusal and a breakage become the same thing to the screen",
    file: RUNTIME,
    find: '    const { data: rows, error } = await context.supabase.rpc("scp_iv_final_report", {\n      _case_id: data.caseId,\n    });\n    if (error) {\n      const e = new Error(error.message) as Error & { code?: string };\n      e.code = error.code;\n      throw e;\n    }',
    replace:
      '    const { data: rows, error } = await context.supabase.rpc("scp_iv_final_report", {\n      _case_id: data.caseId,\n    });\n    if (error) {\n      throw new Error(error.message);\n    }',
    guard: E4,
    expect: "9.6 and preserves the error code",
  },
  {
    id: "E4-ACTOR-NOT-CARRIED-TO-THE-SCREEN",
    defect:
      "the readback mapping drops the governed name and address, so the screen has only an account id to show for who finalised",
    file: RUNTIME,
    find: "    finalisedByName: row.finalised_by_name,\n    finalisedByEmail: row.finalised_by_email,",
    replace: "    finalisedByName: null,\n    finalisedByEmail: null,",
    guard: E4,
    expect: "9.5b and the actor's name and address",
  },
  {
    id: "E4-FINALISE-WITHOUT-HASH",
    defect:
      "the server function stops requiring the previewed identity, so the client can send an empty one and the database's check is met with a blank",
    file: RUNTIME,
    find: "        expectedBasisHash: z.string().min(1),",
    replace: "        expectedBasisHash: z.string().optional(),",
    guard: E4,
    expect: "9.16 it REQUIRES the previewed identity",
  },
  {
    id: "E4-IDENTITY-NOT-FROM-THE-PREVIEW",
    defect:
      "the identity sent to finalisation is no longer the one from the preview in hand, so the screen could lock something the owner did not read",
    file: ROUTE,
    find: "        expectedBasisHash: previewInHand.basisHash,",
    replace: '        expectedBasisHash: "recomputed-elsewhere",',
    guard: E4,
    expect: "9.19 the identity sent is the identity of the preview IN HAND",
  },
  {
    id: "E4-FAILED-READ-IS-A-ZERO",
    defect:
      'a failed or refused read is reported as `none`, so an outage renders as "no report has been finalised"',
    file: SEQ,
    find: 'export function readbackErrorOutcome(code: string | null | undefined): ReadbackOutcome {\n  return code && REFUSAL_CODES.has(code) ? { kind: "refused" } : { kind: "failed" };\n}',
    replace:
      'export function readbackErrorOutcome(_code: string | null | undefined): ReadbackOutcome {\n  return { kind: "none" };\n}',
    guard: E4,
    expect: "3.10 42501 is a refusal",
  },
  {
    id: "E4-MISMATCH-TREATED-AS-VERIFIED",
    defect:
      "a report whose stored digest does not match its stored basis is presented as a finalised report anyway",
    file: SEQ,
    find: '  return row.hashVerified\n    ? { kind: "verified", report: row }\n    : { kind: "notVerified", report: row };',
    replace: '  return { kind: "verified", report: row };',
    guard: E4,
    expect: "3.2 a mismatching digest is NOT",
  },
  {
    id: "E4-UNVERIFIED-IS-TRUSTWORTHY",
    defect: "an unverified readback is treated as trustworthy enough to present as the report",
    file: SEQ,
    find: 'export function readbackIsTrustworthy(o: ReadbackOutcome): boolean {\n  return o.kind === "verified";\n}',
    replace:
      'export function readbackIsTrustworthy(o: ReadbackOutcome): boolean {\n  return o.kind === "verified" || o.kind === "notVerified";\n}',
    guard: E4,
    expect: "3.5 a mismatch is not",
  },
  {
    id: "E4-ACTOR-FALLS-BACK-TO-A-PLACEHOLDER",
    defect:
      "an actor that cannot be resolved is given a placeholder string, which the screen would print as if it were a name",
    file: SEQ,
    find: "  return r.finalisedByName?.trim() || r.finalisedByEmail?.trim() || null;",
    replace: '  return r.finalisedByName?.trim() || r.finalisedByEmail?.trim() || "unknown";',
    guard: E4,
    expect: "3.15 and null, never a uuid, when neither can be resolved",
  },

  /* ---- The preview gate -------------------------------------------- */
  {
    id: "E4-NO-PREVIEW-STILL-FINALISES",
    defect:
      "the finalise control is enabled with no preview in hand, so there is no identity to send",
    file: SEQ,
    find: "  if (!preview || preview.blockerCount > 0) return false;",
    replace: "  if (preview && preview.blockerCount > 0) return false;",
    guard: E4,
    expect: "2.9 with NO preview in hand it may not",
  },
  {
    id: "E4-STALE-PREVIEW-STILL-COUNTS",
    defect:
      "a preview the server called stale still enables the finalise control, inviting the owner to send the same stale identity again",
    file: SEQ,
    find: '  if (outcome.kind === "stalePreview") return false;',
    replace: "  // a stale preview is treated as current",
    guard: E4,
    expect: "2.10 and a preview the server called stale is not a preview",
  },
  {
    id: "E4-STALE-IS-JUST-A-FAILURE",
    defect:
      "SCP_IV_STALE_PREVIEW is no longer told apart from a breakage, so the owner is not told to preview again",
    file: SEQ,
    find: '  ["SCP_IV_STALE_PREVIEW", { kind: "stalePreview" }],\n',
    replace: "",
    guard: E4,
    expect: "2.15 SCP_IV_STALE_PREVIEW is a stale preview",
  },
  {
    id: "E4-STALE-NOT-RENDERED",
    defect:
      "the stale state no longer reaches the finalisation control, so the screen shows nothing when the server refuses",
    file: ROUTE,
    find: '                stale={outcome.kind === "stalePreview"}',
    replace: "                stale={false}",
    guard: E4,
    expect: "9.23 a stale preview reaches the finalisation control as a state",
  },

  /* ---- The document ------------------------------------------------ */
  {
    id: "E4-DOCUMENT-READS-LIVE",
    defect:
      "the document component starts querying, so a 'locked' report can render live case data rather than the finalised payload",
    file: DOCUMENT,
    find: 'import { useT } from "@/i18n/context";',
    replace:
      'import { useT } from "@/i18n/context";\nimport { useQuery } from "@tanstack/react-query";',
    guard: E4,
    expect: "11.35 the document imports no server function, query or client",
  },
  {
    id: "E4-ONE-ASSESSOR-RENDERED",
    defect:
      "the document renders only the first assessor, so a two-person panel reads as one judgement",
    file: DOCUMENT,
    find: "                  {q.assessments.map((a) => (",
    replace: "                  {q.assessments.slice(0, 1).map((a) => (",
    guard: E4,
    expect: "11.7 sv: BOTH assessors' rationales are on the page",
  },
  {
    id: "E4-DISAGREEMENT-HIDDEN",
    defect: "the parser reports every panel as agreeing, so disagreement is never stated",
    file: SEQ,
    find: "        levelsAgree: q.levels_agree !== false,",
    replace: "        levelsAgree: true,",
    guard: E4,
    expect: "11.2 and the disagreement",
  },
  {
    id: "E4-DISCLOSURE-BADGE-SAYS-VERIFIED",
    defect: "the Passport disclosure badge claims the material was verified",
    file: DICT,
    find: '    "iir.doc.cls.passport_disclosure": "Passport disclosure (not verified here)",',
    replace: '    "iir.doc.cls.passport_disclosure": "Verified Passport material",',
    guard: E4,
    expect: "10.6 the Passport disclosure badge says in words, in each language",
  },
  {
    id: "E4-UNNAMED-ACTOR-PRINTS-A-UUID",
    defect: "an actor that cannot be named is printed as the account id",
    file: DOCUMENT,
    find: '                  : t("iir.doc.identity.byUnknown")}',
    replace:
      '                  : t("iir.doc.identity.by").replace("{who}", readback.finalisedBy ?? "")}',
    guard: E4,
    expect: "11.39 sv: and never printed as an account id",
  },
  {
    id: "E4-PREVIEW-IS-NOT-THE-DOCUMENT",
    defect:
      "the preview mounting is fed something other than the server's preview, so what the owner reads is not what is locked",
    file: ROUTE,
    find: '              mode={{ kind: "preview", preview: previewInHand }}',
    replace:
      '              mode={{ kind: "final", readback: readbackState.kind === "verified" ? readbackState.report : (null as never) }}',
    guard: E4,
    expect: "9.21 the preview mounting is fed the server's preview",
  },
  {
    id: "E4-HISTORY-RENDERED-UNVERIFIED",
    defect: "an opened earlier version is rendered without its digest having recomputed",
    file: ROUTE,
    find: "            opened.data.report.hashVerified &&\n",
    replace: "",
    guard: E4,
    expect: "9.27 an opened historical version is rendered only when its digest recomputes",
  },
  {
    id: "E4-DOCUMENT-NOT-MOUNTED",
    defect:
      "the current final report is disabled behind a falsy literal and the page shows no document",
    file: ROUTE,
    find: "              payload={readbackState.report.payload}",
    replace: "              payload={(false && readbackState.report.payload) as never}",
    guard: E4,
    expect: "9.22 and the final and historical mountings are fed the readback's exact payload",
  },

  /* ---- The readback panel ------------------------------------------ */
  {
    id: "E4-REFUSAL-OFFERS-A-RETRY",
    defect:
      "a refusal offers a retry button, inviting a person to press it forever against a permission rule",
    file: PANEL,
    find: "        {!refused && (\n          <button",
    replace: "        {true && (\n          <button",
    guard: E4,
    expect: "5.12 sv: a refusal offers NO retry",
  },
  {
    id: "E4-MISMATCH-NOT-ANNOUNCED",
    defect: "a digest mismatch is styled but never announced, so a screen reader never hears it",
    file: PANEL,
    find: '        <p role="alert" className="mt-1 text-sm text-foreground">\n          {t("iir.readback.notVerified")}',
    replace:
      '        <p className="mt-1 text-sm text-foreground">\n          {t("iir.readback.notVerified")}',
    guard: E4,
    expect: "9.15 and a mismatch is announced rather than only styled",
  },

  /* ---- The sequence ------------------------------------------------ */
  {
    id: "E4-TWO-STEPS-CURRENT",
    defect: "more than one act is current, so the page stops offering ONE clear next action",
    file: SEQ,
    find: '    if (i === at) return { step, state: "current" as const };',
    replace: '    if (i === at || i === at + 1) return { step, state: "current" as const };',
    guard: E4,
    expect: "1.5 exactly one act is current, in every combination",
  },
  {
    id: "E4-FINALISE-WHILE-BLOCKED",
    defect: "finalising becomes the current act while the server still reports a blocker",
    file: SEQ,
    find: "  if (p.blockerCount > 0 || p.assessedCount < p.requirementCount) {",
    replace: "  if (false) {",
    guard: E4,
    expect: "1.6 finalising is never the current act while the server reports a blocker",
  },
  {
    id: "E4-EMPTY-PACK-IS-READY",
    defect:
      "a case with no requirements at all is treated as ready to finalise, because it has no blockers either",
    file: SEQ,
    find: '  if (p.requirementCount === 0) return "reviewAssessmentMaterial";',
    replace: "  if (p.requirementCount === 0) { /* falls through to finalise */ }",
    guard: E4,
    expect: "1.11 a case with NO requirements is never ready to finalise",
  },
  {
    id: "E4-MEMBER-SEES-NOTHING",
    defect:
      "a member who may not finalise is shown no marker at all rather than being told it is somebody else's act",
    file: SEQ,
    find: '    if (step === "finalise" && !p.canFinalise) return { step, state: "notPermitted" as const };',
    replace: "    // removed",
    guard: E4,
    expect: "1.9 a member who may not finalise is TOLD so",
  },
  {
    id: "E4-FINALISE-ENABLED-FOR-MEMBER",
    defect: "the finalise control is offered to a member the database will refuse",
    file: SEQ,
    find: "  if (!p.canFinalise) return false;",
    replace: "  // permission no longer consulted",
    guard: E4,
    expect: "2.3 not without owner or admin",
  },

  /* ---- The boundary ------------------------------------------------ */
  {
    id: "E4-BOUNDARY-DROPS-THE-CANDIDATE",
    defect:
      "the confirmation stops saying the candidate receives nothing -- the one thing a person about to finalise most needs to know",
    file: SEQ,
    find: '  "doesNotShareWithCandidate",',
    replace: "",
    guard: E4,
    expect: "4.2 and the first thing it does NOT do is share with the candidate",
  },
  {
    id: "E4-BOUNDARY-NOT-RENDERED",
    defect: "the boundary is computed but never drawn, so the page states it nowhere",
    file: ROUTE,
    find: "        {!isFinal && <FinaliseBoundary />}",
    replace: "        {false && <FinaliseBoundary />}",
    guard: E4,
    expect: "9.13 and <FinaliseBoundary> is not disabled behind a falsy literal",
  },
  {
    id: "E4-READBACK-NOT-MOUNTED",
    defect: "the readback panel is disabled behind a falsy literal and the page shows no readback",
    file: ROUTE,
    find: "        <FinalReportReadbackPanel",
    replace: "        {false && <FinalReportReadbackPanel",
    guard: E4,
    expect: "9.13 and <FinalReportReadbackPanel> is not disabled behind a falsy literal",
  },
  {
    id: "E4-NO-REFETCH-AFTER-FINALISE",
    defect:
      "finalising no longer refetches the readback, so success is printed from having asked rather than from the server",
    file: ROUTE,
    find: "      const [rb] = await Promise.all([readback.refetch(), versions.refetch()]);",
    replace: "      const [rb] = await Promise.all([versions.refetch()]);",
    guard: E4,
    expect: "9.9 finalising refetches the readback",
  },
  {
    id: "E4-SEQUENCE-COLOUR-ONLY",
    defect: "the current act loses its aria-current, leaving weight and colour as the only signal",
    file: PANEL,
    find: '            aria-current={v.state === "current" ? "step" : undefined}',
    replace: '            data-current={v.state === "current" ? "step" : undefined}',
    guard: E4,
    expect: "6.2 sv: and marked for a screen reader",
  },
  {
    id: "E4-STEP-STATE-NOT-IN-WORDS",
    defect: "the step state stops being named in words, leaving the highlight alone to carry it",
    file: PANEL,
    find: '            <span className="text-xs uppercase tracking-wide">— {t(STATE_LABEL[v.state])}</span>',
    replace: "",
    guard: E4,
    expect: "6.1 sv: the current act is named IN WORDS",
  },

  /* ---- Language ---------------------------------------------------- */
  {
    id: "E4-ENGLISH-COPIES-SWEDISH",
    defect: "an English string is left as the Swedish one, so half the product is untranslated",
    file: DICT,
    find: '    "iir.readback.verified":\n      "Checked: the digest was recomputed from the stored basis and matches.",',
    replace:
      '    "iir.readback.verified":\n      "Kontrollerad: summan räknades om från det sparade underlaget och stämmer.",',
    guard: E4,
    expect: "10.4 and no new key is the same string in both languages",
  },
  {
    id: "E4-COPY-OFFERS-A-VERDICT",
    defect: "the report copy starts offering a suitability verdict",
    file: DICT,
    find: '    "iir.seq.finalise": "Färdigställ rapporten",',
    replace: '    "iir.seq.finalise": "Färdigställ rapporten och rangordna kandidaten",',
    guard: E4,
    expect:
      '10.5 and no string outside the "does not do" list mentions a recommendation or ranking',
  },
];

await runControls("final-report", [...MUTATIONS, ...MORE]);
