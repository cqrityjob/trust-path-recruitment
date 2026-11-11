/**
 * Voluntary self-declarations — the guard.
 *
 * The database proves its own half (supabase/tests/vsd_voluntary_self_declarations_test.sql).
 * This proves the application's, from source:
 *
 *   1  ISOLATION   nothing outside the module, its section and the Profile
 *                  route names it -- so no public profile, card, CV, talent,
 *                  application or sharing surface can read it -- and it
 *                  contributes nothing to completeness or the Passport
 *   2  THE GATE    no criminal-history wording exists; a panel opens only on
 *                  an authorization naming wording the app holds
 *   3  VOLUNTARY   nothing pre-selected, no "no" answer, no free text
 *   4  WORDING     three provenance labels and no stronger claim, in both
 *                  languages
 *   5  SERVER      every function authenticated; the service key only in the
 *                  two narrowed server-only files; no path or hash to the
 *                  browser; NO link to a document -- bytes are delivered per
 *                  request after the database authorizes the caller's own
 *                  session, and never cached; uploaded content is bounded,
 *                  strictly decoded and recognised from its own bytes; an
 *                  upload error never discards a document that was saved
 *   6  ERASURE     "erased"/"deleted" is said only from the server's answer
 *   7  REGISTERED  this check, its controls, tests and browser suite run in CI
 *
 * Run: bun run self-declarations:check
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import * as copy from "../src/lib/self-declarations/copy";
import {
  DECLARATION_KINDS,
  PROVENANCE_LEVELS,
  STATEMENT_VERSIONS,
  buildSelfDeclarationsView,
} from "../src/lib/self-declarations/model";
import {
  CRIMINAL_AUTHORIZED_PAYLOAD,
  OPEN_PAYLOAD,
} from "../src/lib/self-declarations/fixtures/self-declaration-fixtures";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
let failures = 0;
function ck(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok    ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`);
  }
}
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

/** Every needle is present, each after the one before. A missing needle is
 *  a failure -- `indexOf` comparisons alone pass on -1, which is how an
 *  assertion here once went dead (found by its own negative control). */
function ordered(text: string, ...needles: string[]): boolean {
  let from = 0;
  for (const needle of needles) {
    const at = text.indexOf(needle, from);
    if (at === -1) return false;
    from = at + needle.length;
  }
  return true;
}

const MODULE = "src/lib/self-declarations";
const SECTION_DIR = "src/components/self-declarations";
const SECTION = `${SECTION_DIR}/SelfDeclarationsSection.tsx`;
const ROUTE = "src/routes/_authenticated.my-career.profile.tsx";
const FUNCTIONS = `${MODULE}/declarations.functions.ts`;
const ERASURE = `${MODULE}/erasure.server.ts`;
const STORE = `${MODULE}/document-store.server.ts`;
const CONTENT = `${MODULE}/content.ts`;
const MODEL = `${MODULE}/model.ts`;
const MIGRATION = "20270324090000_vsd_voluntary_self_declarations.sql";

// ── 1 · Isolation ─────────────────────────────────────────────────────────
console.log("1 · isolation");
const NAMES = /\bvsd_|self-declarations|SelfDeclaration|self_declaration|selfDeclaration/;
const outside = walk("src").filter(
  (f) =>
    !f.startsWith(`${MODULE}/`) &&
    !f.startsWith(`${SECTION_DIR}/`) &&
    f !== ROUTE &&
    f !== "src/routeTree.gen.ts" &&
    NAMES.test(read(f)),
);
ck(
  "1.1 no file outside the module, its section and the Profile route names self-declarations",
  outside.length === 0,
  outside.join(", "),
);
const SURFACES = [
  "src/lib/professional-identity/identity.functions.ts",
  "src/lib/professional-identity/completeness.ts",
  "src/lib/professional-identity/profile-destinations.ts",
  "src/lib/professional-identity/cv/source-bundle.ts",
  "src/lib/professional-identity/cv/document.ts",
  "src/lib/security-passport/public-disclosure.server.ts",
  "src/lib/security-passport/social.ts",
  "src/lib/security-passport/social-share-public.ts",
  "src/lib/security-passport/og-image/model.ts",
  "src/lib/security-passport/selected-sharing.functions.ts",
  "src/lib/security-passport/application-disclosure.functions.ts",
  "src/lib/talent/talent-search.functions.ts",
  "src/lib/job-intelligence/applications.functions.ts",
];
for (const surface of SURFACES) {
  ck(`1.2 ${surface} exists and does not read it`, !NAMES.test(read(surface)));
}
const moduleImports = walk(MODULE)
  .concat(walk(SECTION_DIR))
  .flatMap((f) => [...read(f).matchAll(/from "(@\/[^"]+)"/g)].map((m) => [f, m[1]!] as const))
  .filter(([, spec]) =>
    /security-passport|professional-identity\/(?!copy$)|talent|job-intelligence|recruitment/.test(
      spec,
    ),
  );
ck(
  "1.3 the module imports nothing from the Passport, CV, talent, job or recruitment code",
  moduleImports.length === 0,
  moduleImports.map(([f, s]) => `${f} -> ${s}`).join(", "),
);
const otherMigrations = readdirSync(path.join(ROOT, "supabase/migrations")).filter(
  (f) => f !== MIGRATION && /\bvsd_/.test(read(`supabase/migrations/${f}`)),
);
ck(
  "1.4 no other migration names a vsd_ object",
  otherMigrations.length === 0,
  otherMigrations.join(", "),
);
ck(
  "1.5 the Profile route mounts the section exactly once, under its own anchor",
  (read(ROUTE).match(/<SelfDeclarationsSection \/>/g) ?? []).length === 1 &&
    read(ROUTE).includes('<div id="profile-self-declarations"'),
);
ck(
  "1.6 the section does not touch the professional-identity query",
  !/professional-identity"\]|\["professional-identity/.test(read(SECTION)),
);

// ── 2 · The gate ──────────────────────────────────────────────────────────
console.log("2 · the processing gate");
ck(
  "2.1 the application holds no criminal-history statement version",
  !("criminal_history" in STATEMENT_VERSIONS) &&
    !/criminal_history:\s*"/.test(
      read(MODEL).split("export const STATEMENT_VERSIONS")[1]!.split("};")[0]!,
    ),
);
ck(
  "2.2 the wording table is exactly the held versions",
  JSON.stringify(Object.keys(copy.STATEMENTS).sort()) ===
    JSON.stringify(Object.values(STATEMENT_VERSIONS).sort()),
);
ck(
  "2.3 criminal history stays closed even with a database authorization",
  buildSelfDeclarationsView(CRIMINAL_AUTHORIZED_PAYLOAD).panels.every((p) => p.state === "closed"),
);
ck(
  "2.4 an authorized financial kind opens, and only that",
  buildSelfDeclarationsView(OPEN_PAYLOAD)
    .panels.map((p) => p.state)
    .join(",") === "open,open,closed",
);
ck(
  "2.5 the save function refuses a kind with no held wording before calling the database",
  /const statementVersion = STATEMENT_VERSIONS\[data\.kind\];\s*if \(!statementVersion\) throw new Error\("VSD_PROCESSING_NOT_AUTHORIZED"\);/.test(
    read(FUNCTIONS),
  ),
);
const section = read(SECTION);
ck(
  "2.6 a closed panel renders only its explanation",
  /panel\.state === "closed" \? \(\s*<p /.test(section) &&
    section.includes('{!form && panel.state !== "closed" ? (') &&
    section.includes("{form && authorization && statement ? ("),
);

// ── 3 · Voluntary ─────────────────────────────────────────────────────────
console.log("3 · voluntary");
ck(
  "3.1 no control is pre-selected",
  !/defaultChecked|defaultValue=|checked=\{true\}/.test(section),
);
ck(
  "3.2 the form always opens unaffirmed",
  section.includes("setForm({ asOfDate: todayIso(), affirmed: false });") &&
    (section.match(/affirmed: true/g) ?? []).length === 1,
);
ck(
  "3.3 the server accepts only a literal affirmation, and no other field",
  /affirmed: z\.literal\(true\)/.test(read(FUNCTIONS)) &&
    (() => {
      const body = read(FUNCTIONS)
        .split("const saveInput = z")[1]!
        .split("export const saveSelfDeclaration")[0]!;
      const keys = [...body.matchAll(/^ {4}([a-zA-Z]+): z\./gm)].map((m) => m[1]);
      return (
        body.includes(".strict()") && keys.join(",") === "kind,asOfDate,affirmed,expectedRevision"
      );
    })(),
);
ck("3.4 there is no free-text field anywhere", !/<textarea|type="text"/.test(section));
ck(
  "3.5 the section is absent from completeness and the Profile's destinations",
  !NAMES.test(read("src/lib/professional-identity/completeness.ts")) &&
    !NAMES.test(read("src/lib/professional-identity/profile-destinations.ts")),
);

// ── 4 · Wording ───────────────────────────────────────────────────────────
console.log("4 · wording");
type Pair = { sv: string; en: string };
const pairs: Array<[string, Pair]> = [];
(function collect(value: unknown, at: string) {
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>;
  if (typeof v.sv === "string" && typeof v.en === "string") pairs.push([at, v as unknown as Pair]);
  else for (const [k, child] of Object.entries(v)) collect(child, `${at}.${k}`);
})(copy, "copy");
ck("4.1 the copy is collected", pairs.length >= 80, `${pairs.length} pairs`);
const blank = pairs.filter(([, p]) => !p.sv.trim() || !p.en.trim() || p.sv === p.en);
ck(
  "4.2 every sentence exists in Swedish and in English",
  blank.length === 0,
  blank.map(([k]) => k).join(", "),
);
const FORBIDDEN =
  /verified (clean|debt)|debt[- ]free|clean record|skuldfri\b|ostraffad|fläckfri|prickfri|risk ?(score|level|nivå|poäng)|godkänd för anställning|approved for employment|security[- ]cleared|säkerhetsgodkänd|background check passed|bakgrundskontroll godkänd/i;
const strong = pairs.filter(([, p]) => FORBIDDEN.test(p.sv) || FORBIDDEN.test(p.en));
ck(
  "4.3 no sentence claims a verified, clean or approved status",
  strong.length === 0,
  strong.map(([k]) => k).join(", "),
);
ck(
  "4.4 the only labels are the three provenance levels",
  JSON.stringify(Object.keys(copy.PROVENANCE).sort()) ===
    JSON.stringify([...PROVENANCE_LEVELS].sort()) &&
    copy.PROVENANCE.self_declared.label.en === "Self-declared" &&
    copy.PROVENANCE.document_provided.label.en === "Document provided" &&
    copy.PROVENANCE.document_reviewed.label.en === "Document reviewed",
);
ck(
  "4.5 'document provided' says nobody reviewed it; 'reviewed' says it is not an assessment",
  /Nobody has reviewed/.test(copy.PROVENANCE.document_provided.hint.en) &&
    /Ingen har granskat/.test(copy.PROVENANCE.document_provided.hint.sv) &&
    /not an assessment/.test(copy.PROVENANCE.document_reviewed.hint.en) &&
    /inte en bedömning/.test(copy.PROVENANCE.document_reviewed.hint.sv),
);
ck(
  "4.6 the section says what it is not, and that it is voluntary and private",
  /not verification/.test(copy.SECTION.whatItIs.en) &&
    /inte en verifiering/.test(copy.SECTION.whatItIs.sv) &&
    /voluntary/i.test(copy.SECTION.lede.en) &&
    /frivilligt/i.test(copy.SECTION.lede.sv) &&
    /Only you/.test(copy.SECTION.privacy.en),
);
ck(
  "4.7 the financial statements exclude ordinary loans and mortgages",
  Object.values(copy.STATEMENTS).every(
    (s) => /mortgage/.test(s.scope.en) && /bolån/.test(s.scope.sv),
  ),
);
ck(
  "4.8 every kind has a title and nothing asks for an identity number, amount or explanation",
  DECLARATION_KINDS.every((k) => copy.KIND_TITLE[k].sv && copy.KIND_TITLE[k].en) &&
    !/(ange|enter|fyll i|provide).{0,40}(personnummer|identity number|belopp|amount|förklar|explain)/i.test(
      pairs.map(([, p]) => `${p.sv} ${p.en}`).join(" "),
    ),
);

// ── 5 · Server ────────────────────────────────────────────────────────────
console.log("5 · server");
const fns = read(FUNCTIONS);
const declared = (fns.match(/createServerFn\(/g) ?? []).length;
const guarded = (
  fns.match(
    /createServerFn\(\{ method: "(GET|POST)" \}\)\s*\.middleware\(\[requireSupabaseAuth\]\)/g,
  ) ?? []
).length;
ck(
  "5.1 every server function requires a signed-in caller",
  declared === 9 && guarded === declared,
  `${guarded}/${declared}`,
);
const serverOnly = walk(MODULE)
  .concat(walk(SECTION_DIR))
  .filter((f) => /supabaseAdmin|client\.server/.test(read(f)))
  .sort();
ck(
  "5.2 the service key appears only in the two server-only files, loaded inside handlers",
  serverOnly.join(",") === [STORE, ERASURE].sort().join(",") &&
    !/^import [^\n]*\.server"/m.test(fns) &&
    fns.includes('await import("./erasure.server")') &&
    (fns.match(/await import\("\.\/document-store\.server"\)/g) ?? []).length === 2 &&
    !/\.server"/.test(read(SECTION)),
  serverOnly.join(","),
);
const erasure = read(ERASURE);
ck(
  "5.3 the drain is narrowed to this bucket and the caller's own queued rows",
  erasure.includes('.eq("bucket_id", SELF_DECLARATION_BUCKET)') &&
    erasure.includes('.eq("subject_user_id", userId)') &&
    erasure.includes("startsWith(`${userId}/`)") &&
    (erasure.match(/\.from\("([a-z_]+)"\)/g) ?? []).every(
      (m) => m === '.from("storage_erasure_queue")',
    ) &&
    /drainOwnSelfDeclarationErasures\(userId: string\)/.test(erasure),
);
ck(
  "5.4 the drain takes its user from the verified session, never from the request",
  fns.includes("drainOwnSelfDeclarationErasures(ctx.userId);") &&
    (fns.match(/drainOwnSelfDeclarationErasures\(/g) ?? []).length === 1,
);
const viewTypes = read(MODEL)
  .split("// ── What the browser receives")[1]!
  .split("function documentView")[0]!;
ck("5.5 the browser's view has no storage path and no hash", !/storagePath|sha256/.test(viewTypes));
// ── No link, and a fresh authorization for every delivery ──────────────
const moduleSource = walk(MODULE)
  .concat(walk(SECTION_DIR))
  .map((f) => read(f).replace(/^\s*(\/\/|\*|\/\*).*$/gm, ""))
  .join("\n");
ck(
  "5.6 no code path signs or builds a link to a document",
  !/createSignedUrl|createSignedUrls|getPublicUrl|\/object\/sign|signedUrl/i.test(moduleSource),
);
const readFn =
  fns.split("export const readSelfDeclarationDocument")[1]?.split("const reviewInput")[0] ?? "";
ck(
  "5.6a delivery asks the database with the caller's own session, then -- and only then -- reads",
  readFn.includes(".middleware([requireSupabaseAuth])") &&
    ordered(
      readFn,
      'ctx.supabase.rpc("vsd_authorize_document_read"',
      'if (error) throw refusal(error, "VSD_DOCUMENT_NOT_FOUND");',
      "if (!parsed.success || parsed.data.documentId !== data.documentId) {",
      'throw new Error("VSD_DOCUMENT_NOT_FOUND");',
      "readAuthorizedDocument(",
    ),
);
ck(
  "5.6b a delivered document is never cacheable",
  ordered(
    readFn,
    'setResponseHeader("Cache-Control", "no-store, private, max-age=0")',
    'rpc("vsd_authorize_document_read"',
  ),
);
ck(
  "5.6c the decision is not remembered: no cache, memo or stored grant in the module",
  !/new Map\(|WeakMap|memo|localStorage|sessionStorage|staleTime|queryKey: \[[^\]]*document/i.test(
    moduleSource.replace(/useMemo/g, ""),
  ) && !/useQuery\([^)]*readSelfDeclarationDocument/s.test(read(SECTION)),
);
const store = read(STORE);
ck(
  "5.6d the server's bucket access takes only a database path of the exact shape, one bucket, no table",
  store.includes("function assertPath(storagePath: string): void") &&
    (store.match(/assertPath\(storagePath\);/g) ?? []).length === 1 &&
    /async function download\(storagePath: string\)[^}]*assertPath\(storagePath\);/s.test(store) &&
    !/\.from\("(?!")[a-z_]+"\)/.test(store) &&
    (store.match(/\.from\(BUCKET\)/g) ?? []).length === 2 &&
    !/\.remove\(|\.upload\(|\.move\(|\.copy\(|createSigned/.test(store),
);
ck(
  "5.6e delivered bytes must still be the verified bytes",
  /readAuthorizedDocument[\s\S]*if \(bytes === null \|\| !matches\(bytes, expected\)\) throw new Error\("VSD_DOCUMENT_NOT_FOUND"\)/.test(
    store,
  ) && /sniffDocumentMime\(bytes\) === expected\.mimeType/.test(store),
);

// ── Uploaded content ────────────────────────────────────────────────────
const uploadFn =
  fns.split("export const uploadSelfDeclarationDocument")[1]?.split("const documentInput")[0] ?? "";
ck(
  "5.8 the encoded body is bounded by the schema, before anything decodes it",
  /contentBase64: z\.string\(\)\.min\(1\)\.max\(DOCUMENT_MAX_ENCODED_LENGTH\)/.test(fns) &&
    !/Buffer\.from\(data\.contentBase64/.test(fns),
);
ck(
  "5.8a content is validated before anything is recorded or stored",
  ordered(
    uploadFn,
    "validateEncodedDocument(data.contentBase64, data.mimeType)",
    'if (!content.ok) throw new Error("VSD_FILE_REJECTED");',
    '"vsd_begin_document"',
  ),
);
const content = read(CONTENT);
ck(
  "5.8b decoding is strict and canonical, and the type comes from the bytes",
  content.includes('if (bytes.toString("base64") !== text) return null;') &&
    content.includes("text.length % 4 !== 0") &&
    content.includes("actual !== declaredMime") &&
    !/fileName|\.name\b|endsWith\(/.test(content),
);
ck(
  "5.8c the server vouches only for bytes it read back itself",
  uploadFn.includes(
    "inspect: (storagePath) => store.inspectStoredDocument(storagePath, expected)",
  ) &&
    uploadFn.includes("store.stampDocumentContent({") &&
    store.includes('"vsd_stamp_document_content"'),
);

// ── An upload error never discards a saved document ─────────────────────
const upload = read(`${MODULE}/workflow.ts`)
  .split("/** Give up on an upload KNOWN to be unfinished.")[1]!
  .split("export type EndAccessSteps")[0]!;
ck(
  "5.9 the upload's only compensation is abandon, which the database limits to unfinished uploads",
  !/discard/.test(upload.replace(/^\s*\/\/.*$/gm, "")) &&
    !/vsd_discard_document/.test(uploadFn) &&
    uploadFn.includes('"vsd_abandon_upload"') &&
    (upload.match(/steps\.abandon/g) ?? []).length === 1,
);
ck(
  "5.9a an attached upload returns before any step that writes or abandons",
  ordered(upload, 'if (begun.status === "attached") {', "return giveUp(steps", "steps.put(") &&
    !ordered(upload, "steps.put(", 'if (begun.status === "attached") {') &&
    !ordered(upload, "return giveUp(steps", 'if (begun.status === "attached") {'),
);
ck(
  "5.9b after a failed stamp or attach the persisted state is read before anything else is done",
  /status = await steps\.state\(\);[\s\S]*if \(status === "attached"\) return \{ status: "attached" \};[\s\S]*giveUp\(steps, code\)/.test(
    upload,
  ),
);
ck(
  "5.9c the stored bytes are inspected again after every put, whatever it reported",
  /await quietly\(\(\) => steps\.put\(begun\.storagePath\)\);\s*try \{\s*stored = await steps\.inspect\(begun\.storagePath\);/.test(
    upload,
  ),
);
ck(
  "5.9d the screen keeps the upload id when the result is unconfirmed",
  section.includes("if (!unconfirmed) setUploadId(crypto.randomUUID());"),
);
ck(
  "5.7 a refusal reaches the browser as a code, never a raw database message",
  !/throw new Error\(error\.message\)/.test(fns) && fns.includes("function refusal("),
);

// ── 6 · Erasure honesty ───────────────────────────────────────────────────
console.log("6 · erasure");
const workflow = read(`${MODULE}/workflow.ts`);
ck(
  "6.1 'confirmed' comes only from the database owing no file",
  workflow.includes('fileDeletion: filesOwed(payload) === 0 ? "confirmed" : "pending"') &&
    fns.includes('fileDeletion: filesOwed(payload) === 0 ? "confirmed" : "pending"') &&
    // One assignment each; the other mentions are the type and its comment.
    (workflow.match(/\? "confirmed"/g) ?? []).length === 1 &&
    (fns.match(/\? "confirmed"/g) ?? []).length === 1,
);
ck(
  "6.2 the access decision precedes the drain, and a drain failure is swallowed, not reported as success",
  /await steps\.end\(\);\s*try \{\s*await steps\.drain\(\);\s*\} catch \{/.test(workflow),
);
ck(
  "6.3 the screen says 'deleted' and 'erased' only on a confirmed answer",
  section.includes('confirm === "delete" && result.fileDeletion === "confirmed"') &&
    /result\.fileDeletion === "confirmed"\s*\? \{ tone: "ok", text: CLEANUP\.done \}/.test(
      section,
    ) &&
    (section.match(/PANEL\.removed/g) ?? []).length === 1 &&
    (section.match(/CLEANUP\.done/g) ?? []).length === 1,
);
ck(
  "6.3a erasing is bounded in time, so a silent Storage cannot stall an access decision",
  /const DRAIN_BUDGET_MS = \d[\d_]*;/.test(fns) &&
    fns.includes("await Promise.race([attempt, budget]);") &&
    fns.includes("await drainOwnSelfDeclarationErasures(ctx.userId)") === false &&
    fns.includes("const attempt = drainOwnSelfDeclarationErasures(ctx.userId);"),
);
ck(
  "6.4 an owed cleanup is rendered with a retry",
  section.includes("data-vsd-cleanup-retry") &&
    section.includes("panel.cleanups.map") &&
    section.includes("panel.deletionPending ?"),
);

// ── 7 · Registered ────────────────────────────────────────────────────────
console.log("7 · registration");
const pkg = read("package.json");
const ci = read(".github/workflows/ci.yml");
ck(
  "7.1 the check, its tests, its controls and its browser suite are package scripts",
  [
    "self-declarations:check",
    "self-declarations:test",
    "negative-controls:self-declarations",
    "e2e:self-declarations",
  ].every((s) => pkg.includes(`"${s}":`)),
);
ck(
  "7.2 the controls are part of negative-controls:all",
  /"negative-controls:all"[^\n]*negative-controls:self-declarations/.test(pkg),
);
ck(
  "7.3 CI runs the check, the tests and the browser suite",
  ci.includes("bun run self-declarations:check") &&
    ci.includes("bun run self-declarations:test") &&
    ci.includes("bun run e2e:self-declarations"),
);
ck(
  "7.4 the database suite is registered with its negative controls",
  read("scripts/db-test.sh").includes("VSD_T=vsd_voluntary_self_declarations_test") &&
    (read("scripts/db-test.sh").match(/td_nc "\$VSD_T"/g) ?? []).length === 13,
);

console.log(
  failures === 0
    ? "\nself-declarations-check: OK"
    : `\nself-declarations-check: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
