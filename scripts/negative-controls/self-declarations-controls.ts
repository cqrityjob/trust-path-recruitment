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
];

runControls("self-declarations", MUTATIONS);
