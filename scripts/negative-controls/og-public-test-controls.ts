/**
 * Negative controls for the public test deployment guard
 * (scripts/og-public-test-workflow-check.ts).
 *
 * Each mutation plants one of the defects the review found, or a way they could
 * come back: an input interpolated into a shell, a validator that accepts
 * anything, an allowlist that drifted from the fixtures, a free-text input, a
 * build that still carries the real client key, a deploy with no isolation
 * check, an isolation check that is blind to the key, a stand-in that keeps
 * state, and browser evidence that stops watching the network.
 *
 * Run: bun run negative-controls:og-public-test
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "og-public-test:check";
const WF = ".github/workflows/og-public-test.yml";
const EV = ".github/workflows/og-worker-evidence.yml";
const VALIDATE = "scripts/og-public-test-validate.sh";
const STUB = "scripts/og-test-stub-worker.ts";
const ISOLATION = "scripts/og-build-isolation-check.ts";
const SHOTS = "scripts/og-worker-shots.ts";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "OGT-NC-SHELL-INJECTION",
    defect: "the share input is interpolated into a run block again",
    file: WF,
    find: 'status="$(curl -s -o /dev/null -w \'%{http_code}\' "${APP_URL}/og/share/${SHARE}")"',
    replace:
      'status="$(curl -s -o /dev/null -w \'%{http_code}\' "${APP_URL}/og/share/${{ inputs.share }}")"',
    guard: GUARD,
    expect: "no workflow expression inside a run block",
  },
  {
    id: "OGT-NC-VALIDATOR-ACCEPTS-ANY-SHARE",
    defect: "the validator accepts any share value",
    file: VALIDATE,
    find: 'if ! [[ "$share" =~ ^[A-Za-z0-9_-]{24}$ ]] || ! in_list "$share" "$ALLOWED_SHARES"; then',
    replace: "if false; then",
    guard: GUARD,
    expect: "a hostile share value is refused",
  },
  {
    id: "OGT-NC-VALIDATOR-ACCEPTS-ANY-ACTION",
    defect: "the validator accepts any action value",
    file: VALIDATE,
    find: 'if ! [[ "$action" =~ ^[a-z]+$ ]] || ! in_list "$action" "$ALLOWED_ACTIONS"; then',
    replace: "if false; then",
    guard: GUARD,
    expect: "a hostile action value is refused",
  },
  {
    id: "OGT-NC-ALLOWLIST-DRIFT",
    defect: "the shell allowlist admits an id the fixtures do not know",
    file: VALIDATE,
    find: 'ReadErrorReadErrorReadEr"',
    replace: 'ReadErrorReadErrorReadEr ZzZzZzZzZzZzZzZzZzZzZzZz"',
    guard: GUARD,
    expect: "the shell allowlist equals the fixture ids",
  },
  {
    id: "OGT-NC-FREE-TEXT-INPUT",
    defect: "the share input becomes free text",
    file: WF,
    find: '        description: "Which synthetic share the smoke read after deploy checks"\n        required: true\n        default: "AbCdEfGhIjKlMnOpQrStUvWx"\n        type: choice',
    replace:
      '        description: "Which synthetic share the smoke read after deploy checks"\n        required: true\n        default: "AbCdEfGhIjKlMnOpQrStUvWx"\n        type: string',
    guard: GUARD,
    expect: "the share input is a closed choice",
  },
  {
    id: "OGT-NC-CLIENT-KEY-NOT-OVERRIDDEN",
    defect: "the build no longer sets the client's publishable key, so the real one is inlined",
    file: WF,
    find: "          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ env.SYNTHETIC_KEY }}\n",
    replace: "",
    guard: GUARD,
    expect: "the build sets VITE_SUPABASE_PUBLISHABLE_KEY to the synthetic key",
  },
  {
    id: "OGT-NC-NO-ISOLATION-BEFORE-DEPLOY",
    defect: "the application deploys without the built output being checked",
    file: WF,
    find: '        run: bun run og-build-isolation:check -- --root .output --url "$STUB_URL"\n',
    replace: "        run: echo skipped\n",
    guard: GUARD,
    expect: "no isolation check between build and deploy",
  },
  {
    id: "OGT-NC-ISOLATION-BLIND-TO-KEY",
    defect: "the isolation check no longer notices the real key",
    file: ISOLATION,
    find: "  if (keyHits > 0) {",
    replace: "  if (keyHits > 1000) {",
    guard: GUARD,
    expect: "the isolation check notices the real key in the client",
  },
  {
    id: "OGT-NC-STATEFUL-STUB",
    defect: "the public stand-in keeps per-isolate state again",
    file: STUB,
    find: "export default {",
    replace: "const states = new Map<string, string>();\nexport default {",
    guard: GUARD,
    expect: "the public stand-in keeps state nowhere",
  },
  {
    id: "OGT-NC-EVIDENCE-BUILD-NOT-ISOLATED",
    defect: "the PR evidence job builds the client against the real project",
    file: EV,
    find: "          VITE_SUPABASE_URL: http://127.0.0.1:54399\n",
    replace: "",
    guard: GUARD,
    expect: "og-worker-evidence.yml: the build sets VITE_SUPABASE_URL to the stand-in",
  },
  {
    id: "OGT-NC-BROWSER-NETWORK-UNWATCHED",
    defect: "the browser evidence stops watching where the page's requests go",
    file: SHOTS,
    find: 'page.on("request", (request) => {',
    replace: 'page.on("requestfinished", (request) => {',
    guard: GUARD,
    expect: "the browser evidence records every request",
  },
];

runControls("og-public-test", MUTATIONS);
