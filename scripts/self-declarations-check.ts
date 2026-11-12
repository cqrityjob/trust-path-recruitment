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
 *   8  THE BRIDGE  the ONE authorized way out: the Security Passport. Named
 *                  files only; a self-declared shield that no document can
 *                  upgrade; nothing pre-selected; only what was previewed is
 *                  attached, to one new link; a recipient reads through a
 *                  separate, authenticated call; nothing reaches the social
 *                  image, the page head, a download or any other surface
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
import * as bridge from "../src/lib/self-declarations/passport-bridge";
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

// ── The Security Passport bridge (20270325090000) ─────────────────────────
// The ONLY files outside the module that may name the self-declarations.
// Anything else -- a card, the wallet, the social flow, an export, a
// catalogue, search -- still fails 1.1.
const BRIDGE_MIGRATION = "20270325090000_vsd_passport_disclosure.sql";
const BRIDGE_DIR = "src/components/security-passport/self-declarations";
const BRIDGE_SHIELD = `${BRIDGE_DIR}/SelfDeclarationShield.tsx`;
const BRIDGE_PASSPORT = `${BRIDGE_DIR}/PassportSelfDeclarations.tsx`;
const BRIDGE_SHARE = `${BRIDGE_DIR}/ShareSelfDeclarations.tsx`;
const BRIDGE_RECIPIENT = `${BRIDGE_DIR}/RecipientSelfDeclarations.tsx`;
const BRIDGE_MODEL = `${MODULE}/passport-bridge.ts`;
const BRIDGE_FUNCTIONS = `${MODULE}/passport-bridge.functions.ts`;
const BRIDGE_RECIPIENT_FN = "src/lib/security-passport/self-declarations-bridge.functions.ts";
const PASSPORT_ROUTE = "src/routes/_authenticated.passport.index.tsx";
const SHARE_ROUTE = "src/routes/_authenticated.passport.share.tsx";
const RECIPIENT_ROUTE = "src/routes/p.$token.tsx";
const BRIDGE_MOUNTS = [PASSPORT_ROUTE, SHARE_ROUTE, RECIPIENT_ROUTE];
const BRIDGE_FILES = [BRIDGE_RECIPIENT_FN, ...BRIDGE_MOUNTS];
/** Source without comments, so a rule about code is not met by prose. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ── 1 · Isolation ─────────────────────────────────────────────────────────
console.log("1 · isolation");
const NAMES = /\bvsd_|self-declarations|SelfDeclaration|self_declaration|selfDeclaration/;
const outside = walk("src").filter(
  (f) =>
    !f.startsWith(`${MODULE}/`) &&
    !f.startsWith(`${SECTION_DIR}/`) &&
    !f.startsWith(`${BRIDGE_DIR}/`) &&
    !BRIDGE_FILES.includes(f) &&
    f !== ROUTE &&
    f !== "src/routeTree.gen.ts" &&
    NAMES.test(read(f)),
);
ck(
  "1.1 no file outside the module, its section, the Profile route and the named Passport bridge names self-declarations",
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
  (f) =>
    f !== MIGRATION && f !== BRIDGE_MIGRATION && /\bvsd_/.test(read(`supabase/migrations/${f}`)),
);
ck(
  "1.4 no migration but the collection schema and its Passport bridge names a vsd_ object",
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

// ── 8 · The Security Passport bridge ──────────────────────────────────────
console.log("8 · the Security Passport bridge");
const SYN = {
  kind: "enforcement_debt_none",
  jurisdiction: "SE",
  statementVersion: "se-enforcement-v1",
  asOfDate: "2026-11-11",
  declaredOn: "2026-11-11",
  statementPeriod: null,
} as const;
const SYN_ID = "0d000000-0000-4000-8000-000000000001";

// The only self-declaration imports a mount or a bridge file may make.
const importsOf = (rel: string) =>
  [...read(rel).matchAll(/from "(@\/[^"]+)"/g)].map((m) => m[1]!).filter((x) => NAMES.test(x));
const MOUNT_MAY_IMPORT = new Set([
  "@/components/security-passport/self-declarations/PassportSelfDeclarations",
  "@/components/security-passport/self-declarations/ShareSelfDeclarations",
  "@/components/security-passport/self-declarations/RecipientSelfDeclarations",
  "@/lib/self-declarations/passport-bridge",
  "@/lib/self-declarations/passport-bridge.functions",
  "@/lib/security-passport/self-declarations-bridge.functions",
]);
const strayMountImports = BRIDGE_MOUNTS.flatMap((f) =>
  importsOf(f)
    .filter((x) => !MOUNT_MAY_IMPORT.has(x))
    .map((x) => `${f} -> ${x}`),
);
ck(
  "8.1 the three Passport routes reach the self-declarations only through the bridge: never the Profile's editor, its documents or its model",
  strayMountImports.length === 0 &&
    BRIDGE_MOUNTS.every((f) => importsOf(f).length > 0) &&
    BRIDGE_MOUNTS.every(
      (f) => !/\bvsd_|declarations\.functions|document-store|erasure\.server/.test(read(f)),
    ),
  strayMountImports.join(", "),
);
const BRIDGE_MAY_IMPORT =
  /^@\/lib\/self-declarations\/(copy|model|passport-bridge)$|^@\/components\/security-passport\/CredentialShield$|^@\/components\/professional-identity\/copy$|^@\/hooks\/useSignedIn$/;
const strayBridgeImports = walk(BRIDGE_DIR).flatMap((f) =>
  [...read(f).matchAll(/from "(@\/[^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((x) => !BRIDGE_MAY_IMPORT.test(x))
    .map((x) => `${f} -> ${x}`),
);
ck(
  "8.2 the bridge components import only the shield primitive, the copy and the narrowed bridge model: no claim, card, CV, social or server module",
  strayBridgeImports.length === 0 &&
    walk(BRIDGE_DIR).every((f) => !/@tanstack\/react-start|supabase|\.server"/.test(code(f))),
  strayBridgeImports.join(", "),
);

// ── The shield ──────────────────────────────────────────────────────────
const shield = code(BRIDGE_SHIELD);
ck(
  "8.3 the shield is drawn only in the self-declared treatment: no prop, document or review selects another",
  (shield.match(/<ShieldMark /g) ?? []).length === 1 &&
    shield.includes('<ShieldMark state="self_declared" size={36} />') &&
    !/state=\{/.test(shield) &&
    !/"verified"|"document_provided"|"document_reviewed"|CredentialShield\b(?!")|Check\b|BadgeCheck|ShieldCheck/.test(
      shield.replace('from "@/components/security-passport/CredentialShield"', ""),
    ),
);
const labelFn =
  shield.split("export function selfDeclarationShieldLabel")[1]?.split("export function")[0] ?? "";
ck(
  "8.3a its label is the subject and 'Självdeklarerat' / 'Self-declared', never a provenance level",
  labelFn.includes("SHIELD_SUBJECT[statement.kind]") &&
    labelFn.includes("SHIELD.selfDeclared") &&
    !/PROVENANCE/.test(labelFn) &&
    copy.SHIELD.selfDeclared.sv === "Självdeklarerat" &&
    copy.SHIELD.selfDeclared.en === "Self-declared" &&
    `${copy.SHIELD_SUBJECT.enforcement_debt_none.sv} · ${copy.SHIELD.selfDeclared.sv}` ===
      "Kronofogden · Självdeklarerat" &&
    `${copy.SHIELD_SUBJECT.payment_remarks_none.sv} · ${copy.SHIELD.selfDeclared.sv}` ===
      "Betalningsanmärkningar · Självdeklarerat" &&
    `${copy.SHIELD_SUBJECT.criminal_history.sv} · ${copy.SHIELD.selfDeclared.sv}` ===
      "Brottshistorik · Självdeklarerat",
);
ck(
  "8.3b an opened shield always shows the exact statement, its date, jurisdiction, scope and that CQrityjob has not verified it",
  ordered(
    shield,
    "{open ? (",
    "Lf(wording.statement, lang, statement.asOfDate)",
    "{statement.asOfDate}",
    "L(SHIELD.jurisdiction, lang)",
    "L(wording.scope, lang)",
    "{L(SHIELD.notVerified, lang)}",
  ) &&
    // Unconditional inside the opened panel: no branch stands between them.
    !/\? \(\s*<p[^>]*data-vsd-shield-unverified/.test(shield) &&
    copy.SHIELD.notVerified.sv ===
      "Uppgiften är lämnad av personen själv och har inte verifierats av CQrityjob." &&
    /has not been verified by CQrityjob/.test(copy.SHIELD.notVerified.en),
);
ck(
  "8.3c a document's provenance is described to the holder only, in the existing precise words, and never to a recipient",
  shield.includes('holderProvenance && holderProvenance !== "self_declared"') &&
    shield.includes("L(PROVENANCE[holderProvenance].hint, lang)") &&
    !/holderProvenance/.test(code(BRIDGE_RECIPIENT)) &&
    !/holderProvenance/.test(code(BRIDGE_SHARE)) &&
    (code(BRIDGE_PASSPORT).match(/holderProvenance=/g) ?? []).length === 1,
);
ck(
  "8.3d a statement whose wording the application does not hold draws nothing",
  shield.includes("const wording = STATEMENTS[statement.statementVersion];") &&
    shield.includes("if (!wording) return null;"),
);

// ── What can be shown at all ────────────────────────────────────────────
ck(
  "8.4 a disclosed statement is exactly six fields, strictly: no document, hash, path, review, provenance or id can pass",
  JSON.stringify(Object.keys(bridge.disclosedStatementSchema.shape).sort()) ===
    JSON.stringify(
      [
        "asOfDate",
        "declaredOn",
        "jurisdiction",
        "kind",
        "statementPeriod",
        "statementVersion",
      ].sort(),
    ) &&
    bridge.toDisclosedStatements({ items: [SYN] }).length === 1 &&
    bridge.toDisclosedStatements({ items: [{ ...SYN, provenance: "document_reviewed" }] })
      .length === 0 &&
    bridge.toDisclosedStatements({ items: [{ ...SYN, sha256: "a".repeat(64) }] }).length === 0 &&
    bridge.toDisclosedStatements({ items: [{ ...SYN, id: SYN_ID }] }).length === 0 &&
    bridge.toDisclosedStatements(null).length === 0,
);
ck(
  "8.4a criminal history, or any wording the application does not hold, is dropped whatever the database returns",
  bridge.toDisclosedStatements({
    items: [{ ...SYN, kind: "criminal_history", statementVersion: "se-criminal-synthetic-v1" }],
  }).length === 0 &&
    bridge.toDisclosedStatements({ items: [{ ...SYN, statementVersion: "se-enforcement-v2" }] })
      .length === 0,
);
const closedView = bridge.buildPassportDeclarationsView({ open: [], declarations: [] });
const criminalView = bridge.buildPassportDeclarationsView({
  open: [
    { kind: "criminal_history", jurisdiction: "SE", statementVersion: "se-criminal-synthetic-v1" },
  ],
  declarations: [
    {
      id: SYN_ID,
      revision: 1,
      statement: { ...SYN, kind: "criminal_history", statementVersion: "se-criminal-synthetic-v1" },
      provenance: "document_reviewed",
      shareable: true,
    },
  ],
});
ck(
  "8.5 closed processing produces no shield: 'not activated', and the same for a criminal-history row or a failed read",
  closedView.state === "not_activated" &&
    closedView.declarations.length === 0 &&
    criminalView.state === "not_activated" &&
    criminalView.declarations.length === 0 &&
    bridge.CLOSED_PASSPORT_DECLARATIONS.state === "not_activated" &&
    bridge.parsePassportDeclarations({ open: [], declarations: [{}] }) === null &&
    /if \(error\) return CLOSED_PASSPORT_DECLARATIONS;/.test(read(BRIDGE_FUNCTIONS)),
);
ck(
  "8.5a the holder's view has no state for a missing, withdrawn or expired statement, and the copy infers nothing adverse",
  /readonly state: "not_activated" \| "none" \| "declared";/.test(read(BRIDGE_MODEL)) &&
    !/saknas|missing|inte godkänd|not approved|har skulder|has debts|anmärkning finns|underkänd|failed/i.test(
      [copy.PASSPORT_SECTION, copy.SHARE, copy.RECIPIENT, copy.SHIELD]
        .flatMap((group) => Object.values(group))
        .map((p) => `${p.sv} ${p.en}`)
        .join(" "),
    ),
);

// ── The holder's Passport ───────────────────────────────────────────────
const passportRoute = read(PASSPORT_ROUTE);
const wallet = passportRoute.split("<CredentialWallet")[1]?.split("\n        />")[0] ?? "";
ck(
  "8.6 the Passport page mounts the section once, beside the wallet, and gives the wallet, the side column and the attention panel nothing of it",
  (passportRoute.match(/<PassportSelfDeclarations /g) ?? []).length === 1 &&
    wallet.length > 0 &&
    !NAMES.test(wallet) &&
    (passportRoute.match(/loadSelfDeclarations/g) ?? []).length === 2 &&
    !NAMES.test(read("src/components/security-passport/CredentialWallet.tsx")) &&
    !NAMES.test(read("src/components/security-passport/PassportSideColumn.tsx")),
);
ck(
  "8.6a the section edits nothing: it links to the Profile's existing editor",
  code(BRIDGE_PASSPORT).includes(
    '<Link to="/my-career/profile" hash="profile-self-declarations"',
  ) &&
    !/<input|<form|<select|<textarea|onSubmit/.test(code(BRIDGE_PASSPORT)) &&
    read(ROUTE).includes('<div id="profile-self-declarations"'),
);

// ── The share step ──────────────────────────────────────────────────────
const share = code(BRIDGE_SHARE);
ck(
  "8.7 nothing is pre-selected and nothing is offered while disclosure is closed",
  share.includes("useState<ReadonlySet<string>>(new Set())") &&
    share.includes("checked={ticked.has(declaration.id)}") &&
    !/defaultChecked|checked=\{true\}|checked\s*\/>|selectAll|SelectAllBox/.test(share) &&
    share.includes("(query.data?.declarations ?? []).filter((d) => d.shareable)") &&
    share.includes("if (shareable.length === 0) return null;"),
);
const TICKED = [
  { id: SYN_ID, revision: 2, statement: SYN, provenance: "self_declared", shareable: true },
] as const;
ck(
  "8.8 only what the server's preview returned can be attached; the preview renders through the recipient's own component",
  share.includes(
    "const confirmed = useMemo(() => confirmedChoices(chosen, previewed), [chosen, previewed]);",
  ) &&
    bridge.confirmedChoices(TICKED, []).length === 0 &&
    bridge.confirmedChoices(TICKED, [{ ...SYN, asOfDate: "2026-11-10" }]).length === 0 &&
    JSON.stringify(bridge.confirmedChoices(TICKED, [SYN])) ===
      JSON.stringify([{ declarationId: SYN_ID, revision: 2 }]) &&
    (share.match(/<RecipientSelfDeclarationList/g) ?? []).length === 1 &&
    share.includes('previewState === "failed"'),
);
const shareRoute = read(SHARE_ROUTE);
ck(
  "8.9 the choice goes to one place: the single operation that creates the link. Never an existing link, the social image, a preview payload or a reissue",
  ordered(
    shareRoute,
    "if (selfDeclarationOffer.offered || shareUnconfirmed) {",
    "await shareOperation.run({",
    "requestKey: requestKey.current,",
    "choices: selfDeclarationOffer.choices,",
    "shareOperation.clear();",
    "const result = await doCreate({",
  ) &&
    (shareRoute.match(/shareOperation\.run\(/g) ?? []).length === 1 &&
    (shareRoute.match(/selfDeclarationOffer\.choices/g) ?? []).length === 1 &&
    (shareRoute.match(/<ShareSelfDeclarationChoices/g) ?? []).length === 1 &&
    !/attachSelfDeclarations|disclosureId:\s*[a-zA-Z.]+,\s*choices/.test(shareRoute) &&
    !/vsd_select_for_disclosure|attachSelfDeclarationsToShare/.test(read(BRIDGE_FUNCTIONS)) &&
    /\{via === "link" \? \(\s*<ShareSelfDeclarationResult/.test(shareRoute) &&
    !NAMES.test(read("src/components/security-passport/live/SocialShareFlow.tsx")) &&
    !NAMES.test(read("src/lib/security-passport/credential-sharing.functions.ts")) &&
    !NAMES.test(read("src/lib/security-passport/share-image.ts")) &&
    !NAMES.test(read("src/lib/security-passport/social-export.ts")),
);
// What a caller can KNOW after one creation call, exercised for real.
const OP = {
  requestKey: "0d000000-0000-4000-8000-0000000000aa",
  link: { claimIds: [SYN_ID], permittedFields: [], expiresDays: 7, locale: "sv" },
  choices: [{ declarationId: SYN_ID, revision: 2 }],
} as const;
const lost = () => Promise.reject(new Error("fetch failed"));
const settled = {
  lostThenNothing: await bridge.settleShareOperation(
    { create: lost, committed: async () => ({ status: "none" }) },
    OP,
  ),
  lostThenUnreadable: await bridge.settleShareOperation({ create: lost, committed: lost }, OP),
  lostButCommitted: await bridge.settleShareOperation(
    {
      create: lost,
      committed: async () => ({ status: "sealed", disclosureId: SYN_ID, declarations: 1 }),
    },
    OP,
  ),
  lostButNarrower: await bridge.settleShareOperation(
    {
      create: lost,
      committed: async () => ({ status: "sealed", disclosureId: SYN_ID, declarations: 0 }),
    },
    OP,
  ),
  refused: await bridge.settleShareOperation(
    {
      create: () => Promise.reject(new Error("VSD_STALE_REVISION")),
      committed: () => {
        throw new Error("a refusal must not be reconciled");
      },
    },
    OP,
  ),
};
ck(
  "8.9a a lost answer is never 'not shared': it is confirmed from what the database committed, or it stays unconfirmed; only the database's own refusal is a no",
  settled.lostThenNothing.kind === "unconfirmed" &&
    settled.lostThenUnreadable.kind === "unconfirmed" &&
    settled.lostButCommitted.kind === "created" &&
    settled.lostButCommitted.token === null &&
    settled.lostButNarrower.kind === "unconfirmed" &&
    settled.refused.kind === "refused" &&
    bridge.shareRefusalCode(new Error("UNCONFIRMED")) === null &&
    bridge.shareRefusalCode(new Error("fetch failed")) === null &&
    bridge.shareRefusalCode(new Error("SP_REQUEST_KEY_CONFLICT")) === "SP_REQUEST_KEY_CONFLICT" &&
    !share.includes('return "failed"') &&
    !("attachFailed" in copy.SHARE) &&
    /vet därför inte/.test(copy.SHARE.unconfirmed.sv) &&
    /do not know/.test(copy.SHARE.unconfirmed.en) &&
    [copy.SHARE.unconfirmed, copy.SHARE.unconfirmedPlain].every(
      (p) =>
        !/delades inte|ingen självdeklaration delades|innehåller den inte|not shared|was shared\.|does not carry|ingen länk skapades|no link was created/i.test(
          `${p.sv} ${p.en}`,
        ),
    ) &&
    ordered(share, 'if (outcome.kind === "refused") {', "L(refusalCopy(outcome.code), lang)") &&
    (share.match(/refusalCopy\(/g) ?? []).length === 2 &&
    (share.match(/SHARE\.refused/g) ?? []).length === 3,
);
ck(
  "8.9b an unconfirmed operation is kept and repeated as it was: same key, same link, same choices; the steps are closed until it is settled",
  share.includes("settle(unconfirmed.current && kept.current ? kept.current : operation)") &&
    share.includes("async () => (kept.current ? settle(kept.current) : null)") &&
    shareRoute.includes("const composing = !outcome && !shareUnconfirmed;") &&
    (shareRoute.match(/via === "link" && composing/g) ?? []).length === 4 &&
    ordered(
      shareRoute,
      "async function applyShareOutcome(",
      'if (!settled || settled.kind === "unconfirmed") return;',
      "requestKey.current = newRequestKey();",
      "async function onRetryShareOperation() {",
      "await applyShareOutcome(await shareOperation.retry());",
    ) &&
    share.includes("data-share-vsd-retry") &&
    shareRoute.includes("!selfDeclarationOffer.ready"),
);
ck(
  "8.9c whether the list could be re-read is a separate fact from whether the statement is shared, and a reissued link is never said to carry one",
  ordered(
    share,
    "setView((current) => ({ ...current, operation, outcome, settling: false }));",
    'if (outcome.kind === "created" && outcome.declarations > 0) await refreshList();',
    "return outcome;",
  ) &&
    ordered(
      share,
      "const refreshList = useCallback(async () => {",
      "setView((current) => ({ ...current, listStale: false }));",
      "} catch {",
      "setView((current) => ({ ...current, listStale: true }));",
    ) &&
    /does not change what is shared/.test(copy.SHARE.listStale.en) &&
    /if \(error\) throw refusal\(error, "VSD_READ_FAILED"\);\s*return toSharedSelections\(data\);/.test(
      read(BRIDGE_FUNCTIONS),
    ) &&
    ordered(
      shareRoute,
      "async function onReissue(",
      "if (!shareUnconfirmed) shareOperation.clear();",
      "replaceShare(",
    ),
);

// ── The recipient ───────────────────────────────────────────────────────
const recipientFn = read(BRIDGE_RECIPIENT_FN);
ck(
  "8.10 the recipient's read is a separate call that requires a signed-in caller AND the link's share session from the server-read cookie",
  (recipientFn.match(/createServerFn\(/g) ?? []).length === 1 &&
    ordered(
      recipientFn,
      'createServerFn({ method: "POST" })',
      ".middleware([requireSupabaseAuth])",
      "shareSessionFromCookieHeader(",
      "if (!session) return [];",
      'client.rpc("vsd_read_disclosed", {',
      "if (error) return [];",
      "return toDisclosedStatements(payload);",
    ) &&
    !/supabaseAdmin|client\.server|public-disclosure\.server|shareTokenFromCookieHeader/.test(
      recipientFn,
    ) &&
    recipientFn.includes('setResponseHeader("Cache-Control", "no-store, private, max-age=0")') &&
    !/session/.test(
      recipientFn.split(".validator(")[1]!.split(".handler(")[0]!.replace("navigationId", ""),
    ),
);
ck(
  "8.10a the anonymous recipient call, its server module and its payload types are untouched by it",
  !NAMES.test(read("src/lib/security-passport/public-disclosure.functions.ts")) &&
    !NAMES.test(read("src/lib/security-passport/public-disclosure.server.ts")) &&
    !NAMES.test(read("src/lib/security-passport/packages.ts")) &&
    !NAMES.test(read("src/lib/security-passport/recipient-presentation.ts")) &&
    !NAMES.test(read("src/components/security-passport/live/RecipientPassportView.tsx")) &&
    !NAMES.test(read("src/components/security-passport/live/RecipientPassportCard.tsx")),
);
const recipient = code(BRIDGE_RECIPIENT);
ck(
  "8.10b a visitor who is not signed in triggers no call and is shown nothing: no placeholder, count or hint",
  ordered(recipient, "if (signedIn !== true) {", "setStatements([]);", "return;", "void read({") &&
    recipient.includes("if (statements.length === 0) return null;") &&
    !/sign in|logga in|signup|login/i.test(recipient) &&
    !/sign in to see|logga in för att se/i.test(
      Object.values(copy.RECIPIENT)
        .map((p) => `${p.sv} ${p.en}`)
        .join(" "),
    ),
);
const recipientRoute = read(RECIPIENT_ROUTE);
const head = recipientRoute.split("export const Route")[1]?.split("component:")[0] ?? "";
ck(
  "8.11 nothing of it reaches the recipient page's head, title or social image, or the social share and OG routes",
  head.length > 200 &&
    !NAMES.test(head) &&
    (recipientRoute.match(/<RecipientSelfDeclarations\b/g) ?? []).length === 1 &&
    !NAMES.test(read("src/routes/s.$publicId.tsx")) &&
    !NAMES.test(read("src/routes/og.share.$publicId.ts")) &&
    !NAMES.test(read("src/lib/security-passport/og-image/render.ts")),
);

const recipientView = read("src/components/security-passport/live/RecipientPassportView.tsx");
ck(
  "8.11a the section sits directly below the card -- before the details and the promotional block -- in both layouts, through a slot that carries no payload",
  ordered(
    recipientView,
    "<RecipientPassportCard presentation={presentation} verifyUrl={verifyUrl} />",
    "{afterCard}",
    'pt("rec.detailsTitle")',
    'pt("rec.ctaTitle")',
  ) &&
    (recipientView.match(/afterCard/g) ?? []).length === 3 &&
    (recipientRoute.match(/afterCard=\{selfDeclarations\}/g) ?? []).length === 2 &&
    ordered(
      recipientRoute,
      "function CredentialShare({",
      "<CredentialVerificationPage",
      "afterCard={afterCard}",
      "{presentation.checkedAt ? (",
    ) &&
    ordered(
      read("src/components/security-passport/live/CredentialVerificationPage.tsx"),
      "</article>",
      "{afterCard}",
      '<section className="rounded-xl border border-border bg-card p-5">',
    ) &&
    !NAMES.test(read("src/components/security-passport/live/CredentialVerificationPage.tsx")) &&
    !/payload[^;\n]*selfDeclarations|selfDeclarations[^;\n]*payload/.test(recipientRoute),
);

// ── The holder's functions ──────────────────────────────────────────────
const bridgeFns = read(BRIDGE_FUNCTIONS);
ck(
  "8.12 every holder bridge function requires a signed-in caller, uses the caller's own client and no service key",
  (bridgeFns.match(/createServerFn\(/g) ?? []).length === 6 &&
    (
      bridgeFns.match(
        /createServerFn\(\{ method: "(GET|POST)" \}\)\s*\.middleware\(\[requireSupabaseAuth\]\)/g,
      ) ?? []
    ).length === 6 &&
    !/supabaseAdmin|client\.server|\.server"/.test(bridgeFns) &&
    !/throw new Error\(error\.message\)/.test(bridgeFns) &&
    [...bridgeFns.matchAll(/rpc\(\s*"([a-z_]+)"/g)]
      .map((m) => m[1])
      .sort()
      .join(",") ===
      "vsd_create_credential_share,vsd_my_disclosure_selections,vsd_my_disclosure_selections,vsd_my_passport_declarations,vsd_preview_disclosure,vsd_share_operation,vsd_withdraw_disclosure_selection",
);
ck(
  "8.12a the holder is told how often a statement was read, never by whom",
  !/recipient|readBy|userId/i.test(
    read(BRIDGE_MODEL)
      .split("const selectionRowSchema")[1]!
      .split("export function toSharedSelections")[0]!,
  ) && /accessCount: z\.number\(\)/.test(read(BRIDGE_MODEL)),
);

// ── Registered ──────────────────────────────────────────────────────────
ck(
  "8.13 the bridge's database suite is registered with its sixteen negative controls and its cross-connection races, ahead of the collection suite",
  ordered(
    read("scripts/db-test.sh"),
    "VSDD_T=vsd_passport_disclosure_test",
    'td_suite "$VSDD_T" "Self-declarations Passport bridge (after controls)"',
    "VSD_T=vsd_voluntary_self_declarations_test",
  ) &&
    (read("scripts/db-test.sh").match(/td_nc "\$VSDD_T"/g) ?? []).length === 16 &&
    ordered(
      read("scripts/db-test.sh"),
      'td_suite "$VSDD_T" "Self-declarations Passport bridge (after controls)"',
      'TEST_DB="$TEST_DB" bash scripts/vsd-share-operation-race-check.sh',
      'vsdd_race_nc "VSDD NC12',
      'vsdd_race_nc "VSDD NC13',
      "VSD_T=vsd_voluntary_self_declarations_test",
    ),
);
ck(
  "8.13a the bridge's browser suite runs with the self-declarations suite, at desktop and 375",
  /"e2e:self-declarations": "playwright test e2e\/self-declarations\.spec\.ts e2e\/self-declarations-passport\.spec\.ts --project=chromium --project=mobile-375"/.test(
    pkg,
  ) && ci.includes("bun run e2e:self-declarations"),
);
ck(
  "8.14 the bridge migration records no authorization and names no anonymous audience",
  !/INSERT INTO public\.vsd_(processing|disclosure)_authorizations/.test(
    read(`supabase/migrations/${BRIDGE_MIGRATION}`),
  ) &&
    read(`supabase/migrations/${BRIDGE_MIGRATION}`).includes(
      "permitted_audiences <@ ARRAY['signed_in_recipient']",
    ) &&
    bridge.DISCLOSURE_AUDIENCE === "signed_in_recipient",
);
const bridgeMigration = read(`supabase/migrations/${BRIDGE_MIGRATION}`);
ck(
  "8.14a the migration has no function that gives an existing link a statement and consults no time window: the choice is sealed in the transaction that creates the link",
  !/FUNCTION public\.vsd_select_for_disclosure/.test(bridgeMigration) &&
    !/interval '\d+ (hour|minute|day)s?'/.test(bridgeMigration) &&
    bridgeMigration.includes("AND x.created_at = transaction_timestamp()") &&
    bridgeMigration.includes("AND c.sealed_xid = pg_current_xact_id()") &&
    (bridgeMigration.match(/INSERT INTO public\.vsd_disclosure_(selections|choices)/g) ?? [])
      .length === 2 &&
    ordered(
      bridgeMigration,
      "CREATE FUNCTION public.vsd_create_credential_share(",
      "_r := public.sp_create_credential_disclosure_v2(",
      "INSERT INTO public.vsd_disclosure_choices",
      "INSERT INTO public.vsd_disclosure_selections",
    ),
);

console.log(
  failures === 0
    ? "\nself-declarations-check: OK"
    : `\nself-declarations-check: ${failures} FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
