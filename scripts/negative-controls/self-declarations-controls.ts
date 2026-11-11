/**
 * Negative controls for the voluntary self-declarations guard.
 *
 * Each mutation plants one of the specific ways this feature goes wrong --
 * the data leaking to another surface, criminal-history wording appearing, a
 * pre-ticked affirmation, a "verified" claim, an unauthenticated function, a
 * widened erasure drain, a deletion announced before the file is gone -- and
 * the guard must fail with the named diagnostic. Every file is restored
 * byte-for-byte (proved by the shared runner).
 *
 * The database's own controls are the eight VSD NC plants in scripts/db-test.sh.
 *
 * Run: bun run negative-controls:self-declarations
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "self-declarations:check";
const MODEL = "src/lib/self-declarations/model.ts";
const COPY = "src/lib/self-declarations/copy.ts";
const FUNCTIONS = "src/lib/self-declarations/declarations.functions.ts";
const ERASURE = "src/lib/self-declarations/erasure.server.ts";
const SECTION = "src/components/self-declarations/SelfDeclarationsSection.tsx";
const IDENTITY = "src/lib/professional-identity/identity.functions.ts";
const WORKFLOW = "src/lib/self-declarations/workflow.ts";
const STORE = "src/lib/self-declarations/document-store.server.ts";
const CONTENT = "src/lib/self-declarations/content.ts";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "VSD-NC-SURFACE-LEAK",
    defect:
      "the professional-identity read -- the source of the CV, the career home and every summary -- starts naming the self-declarations",
    file: IDENTITY,
    find: 'export const getMyProfessionalIdentity = createServerFn({ method: "GET" })',
    replace:
      'const leakedSelfDeclarations = "vsd_my_declarations";\nexport const getMyProfessionalIdentity = createServerFn({ method: "GET" })',
    guard: GUARD,
    expect: "1.1 no file outside the module",
  },
  {
    id: "VSD-NC-CRIMINAL-WORDING",
    defect:
      "the application gains a criminal-history statement version, so a database authorization alone would open that panel",
    file: MODEL,
    find: '  payment_remarks_none: "se-remarks-v1",\n};',
    replace: '  payment_remarks_none: "se-remarks-v1",\n  criminal_history: "se-criminal-v1",\n};',
    guard: GUARD,
    expect: "2.1 the application holds no criminal-history statement version",
  },
  {
    id: "VSD-NC-PRE-TICKED",
    defect:
      "the affirmation box opens already ticked, so a statement can be saved without the holder making it",
    file: SECTION,
    find: "setForm({ asOfDate: todayIso(), affirmed: false });",
    replace: "setForm({ asOfDate: todayIso(), affirmed: true });",
    guard: GUARD,
    expect: "3.2 the form always opens unaffirmed",
  },
  {
    id: "VSD-NC-AFFIRMATION-OPTIONAL",
    defect:
      "the server accepts any boolean as the affirmation, so 'false' can be sent and stored as a statement",
    file: FUNCTIONS,
    find: "affirmed: z.literal(true),",
    replace: "affirmed: z.boolean(),",
    guard: GUARD,
    expect: "3.3 the server accepts only a literal affirmation",
  },
  {
    id: "VSD-NC-VERIFIED-CLAIM",
    defect: "an uploaded file is labelled as a verified clean record",
    file: COPY,
    find: 'label: c("Dokument bifogat", "Document provided"),',
    replace: 'label: c("Dokument bifogat", "Verified clean record"),',
    guard: GUARD,
    expect: "4.3 no sentence claims a verified, clean or approved status",
  },
  {
    id: "VSD-NC-UNAUTHENTICATED-READ",
    defect: "the read loses its authentication middleware",
    file: FUNCTIONS,
    find: 'export const getMySelfDeclarations = createServerFn({ method: "GET" })\n  .middleware([requireSupabaseAuth])',
    replace: 'export const getMySelfDeclarations = createServerFn({ method: "GET" })',
    guard: GUARD,
    expect: "5.1 every server function requires a signed-in caller",
  },
  {
    id: "VSD-NC-DRAIN-WIDENED",
    defect:
      "the service-key erasure drain stops filtering on the caller, so one holder's request reaches every holder's queued files",
    file: ERASURE,
    find: '    .eq("subject_user_id", userId)\n',
    replace: "",
    guard: GUARD,
    expect: "5.3 the drain is narrowed to this bucket and the caller's own queued rows",
  },
  {
    id: "VSD-NC-DELETED-EARLY",
    defect: "the screen announces a deletion while a file is still owed to erasure",
    file: SECTION,
    find: 'confirm === "delete" && result.fileDeletion === "confirmed"',
    replace: 'confirm === "delete"',
    guard: GUARD,
    expect: "6.3 the screen says 'deleted' and 'erased' only on a confirmed answer",
  },
  // ---- Review corrections (2026-11-11) --------------------------------------
  {
    id: "VSD-NC-DISCARD-ON-ERROR",
    defect:
      "a lost attach acknowledgement is treated as a failure again: the persisted state is not consulted, so a saved document is abandoned",
    file: WORKFLOW,
    find: '  if (status === "attached") return { status: "attached" };\n',
    replace: "",
    guard: GUARD,
    expect: "5.9b after a failed stamp or attach the persisted state is read",
  },
  {
    id: "VSD-NC-COMPENSATE-BY-DISCARD",
    defect:
      "the upload compensates with the holder's document removal instead of abandon, which erases an attached document on retry",
    file: FUNCTIONS,
    find: 'await call(ctx, "vsd_abandon_upload", { _id: data.uploadId }, "VSD_UPLOAD_UNCONFIRMED");',
    replace:
      'await call(ctx, "vsd_discard_document", { _id: data.uploadId }, "VSD_UPLOAD_UNCONFIRMED");',
    guard: GUARD,
    expect: "5.9 the upload's only compensation is abandon",
  },
  {
    id: "VSD-NC-PUT-TRUSTED",
    defect:
      "the stored bytes are not read back after the write, so whatever put() reported is believed",
    file: WORKFLOW,
    find: "    await quietly(() => steps.put(begun.storagePath));\n    try {\n      stored = await steps.inspect(begun.storagePath);",
    replace:
      '    await quietly(() => steps.put(begun.storagePath));\n    try {\n      stored = "matching";',
    guard: GUARD,
    expect: "5.9c the stored bytes are inspected again after every put",
  },
  {
    id: "VSD-NC-SIGNED-LINK-RETURNS",
    defect:
      "a signed Storage link is issued for a document again: a link that outlives withdrawal, revocation and sign-out",
    file: STORE,
    find: "  const file = await supabaseAdmin.storage.from(BUCKET).download(storagePath);",
    replace:
      "  await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 300);\n  const file = await supabaseAdmin.storage.from(BUCKET).download(storagePath);",
    guard: GUARD,
    expect: "5.6 no code path signs or builds a link to a document",
  },
  {
    id: "VSD-NC-DELIVERY-UNAUTHORIZED-ERROR-IGNORED",
    defect: "delivery reads the bytes even when the database refused the caller",
    file: FUNCTIONS,
    find: '    if (error) throw refusal(error, "VSD_DOCUMENT_NOT_FOUND");\n    const parsed = authorizedRead.safeParse(granted);',
    replace: "    const parsed = authorizedRead.safeParse(granted);",
    guard: GUARD,
    expect: "5.6a delivery asks the database with the caller's own session",
  },
  {
    id: "VSD-NC-DELIVERY-CACHEABLE",
    defect: "a delivered document may be stored by a cache",
    file: FUNCTIONS,
    find: '    setResponseHeader("Cache-Control", "no-store, private, max-age=0");\n',
    replace: "",
    guard: GUARD,
    expect: "5.6b a delivered document is never cacheable",
  },
  {
    id: "VSD-NC-ENCODED-UNBOUNDED",
    defect: "the encoded body is no longer bounded before it is decoded",
    file: FUNCTIONS,
    find: "contentBase64: z.string().min(1).max(DOCUMENT_MAX_ENCODED_LENGTH),",
    replace: "contentBase64: z.string().min(1),",
    guard: GUARD,
    expect: "5.8 the encoded body is bounded by the schema",
  },
  {
    id: "VSD-NC-MIME-TRUSTED",
    defect: "the declared MIME type is accepted without comparing it to what the bytes are",
    file: CONTENT,
    find: "    !(DOCUMENT_ALLOWED_MIME as readonly string[]).includes(declaredMime) ||\n    actual !== declaredMime\n",
    replace: "    !(DOCUMENT_ALLOWED_MIME as readonly string[]).includes(declaredMime)\n",
    guard: GUARD,
    expect: "5.8b decoding is strict and canonical, and the type comes from the bytes",
  },
  {
    id: "VSD-NC-ANY-PATH",
    defect: "the server's bucket reader accepts any path it is handed",
    file: STORE,
    find: "  assertPath(storagePath);\n  const slash",
    replace: "  const slash",
    guard: GUARD,
    expect: "5.6d the server's bucket access takes only a database path",
  },
];

runControls("self-declarations", MUTATIONS);
