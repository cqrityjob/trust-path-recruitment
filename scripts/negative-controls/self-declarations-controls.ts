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
const BRIDGE_DIR = "src/components/security-passport/self-declarations";
const BRIDGE_SHIELD = `${BRIDGE_DIR}/SelfDeclarationShield.tsx`;
const BRIDGE_SHARE = `${BRIDGE_DIR}/ShareSelfDeclarations.tsx`;
const BRIDGE_RECIPIENT = `${BRIDGE_DIR}/RecipientSelfDeclarations.tsx`;
const BRIDGE_MODEL = "src/lib/self-declarations/passport-bridge.ts";
const BRIDGE_FUNCTIONS = "src/lib/self-declarations/passport-bridge.functions.ts";
const BRIDGE_RECIPIENT_FN = "src/lib/security-passport/self-declarations-bridge.functions.ts";
const PASSPORT_ROUTE = "src/routes/_authenticated.passport.index.tsx";
const SHARE_ROUTE = "src/routes/_authenticated.passport.share.tsx";
const RECIPIENT_ROUTE = "src/routes/p.$token.tsx";

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
  // ── The Security Passport bridge ──────────────────────────────────────
  {
    id: "VSD-NC-BRIDGE-OTHER-SURFACE",
    defect:
      "the social share flow -- the image, its preview and its download -- starts naming the self-declarations",
    file: "src/components/security-passport/live/SocialShareFlow.tsx",
    find: "export function SocialShareFlow({",
    replace: 'const leakedSelfDeclarations = "selfDeclaration";\nexport function SocialShareFlow({',
    guard: GUARD,
    expect: "1.1 no file outside the module",
  },
  {
    id: "VSD-NC-BRIDGE-VERIFIED-SHIELD",
    defect: "the shield is drawn in the verified treatment, with its tick and gold rim",
    file: BRIDGE_SHIELD,
    find: '<ShieldMark state="self_declared" size={36} />',
    replace: '<ShieldMark state="verified" size={36} />',
    guard: GUARD,
    expect: "8.3 the shield is drawn only in the self-declared treatment",
  },
  {
    id: "VSD-NC-BRIDGE-DOCUMENT-UPGRADES-LABEL",
    defect:
      "a supporting document changes the shield's label from self-declared to its provenance level",
    file: BRIDGE_SHIELD,
    find: "  return `${L(SHIELD_SUBJECT[statement.kind], lang)} · ${L(SHIELD.selfDeclared, lang)}`;",
    replace:
      "  return `${L(SHIELD_SUBJECT[statement.kind], lang)} · ${L(PROVENANCE.document_reviewed.label, lang)}`;",
    guard: GUARD,
    expect: "8.3a its label is the subject and",
  },
  {
    id: "VSD-NC-BRIDGE-UNVERIFIED-OMITTED",
    defect: "the sentence saying CQrityjob has not verified the statement is no longer shown",
    file: BRIDGE_SHIELD,
    find: "            {L(SHIELD.notVerified, lang)}\n",
    replace: "",
    guard: GUARD,
    expect: "8.3b an opened shield always shows the exact statement",
  },
  {
    id: "VSD-NC-BRIDGE-PROVENANCE-TO-RECIPIENT",
    defect:
      "the disclosed statement gains a provenance field, so a reviewed document can reach a recipient",
    file: BRIDGE_MODEL,
    find: "    statementPeriod: z.string().max(200).nullable(),\n  })\n  .strict();",
    replace:
      "    statementPeriod: z.string().max(200).nullable(),\n    provenance: z.string().optional(),\n  })\n  .strict();",
    guard: GUARD,
    expect: "8.4 a disclosed statement is exactly six fields",
  },
  {
    id: "VSD-NC-BRIDGE-CRIMINAL-SHIELD",
    defect:
      "a statement is shown without the application holding its wording, so criminal history could draw a shield",
    file: BRIDGE_MODEL,
    find: "  return held !== undefined && held === statement.statementVersion;",
    replace: "  return held !== statement.statementVersion || true;",
    guard: GUARD,
    expect: "8.4a criminal history, or any wording the application does not hold",
  },
  {
    id: "VSD-NC-BRIDGE-FAILED-READ-SHIELD",
    defect: "a refused Passport read is no longer the closed view",
    file: BRIDGE_FUNCTIONS,
    find: "    if (error) return CLOSED_PASSPORT_DECLARATIONS;\n",
    replace: "",
    guard: GUARD,
    expect: "8.5 closed processing produces no shield",
  },
  {
    id: "VSD-NC-BRIDGE-PRE-TICKED",
    defect: "a shareable statement is offered already ticked",
    file: BRIDGE_SHARE,
    find: "checked={ticked.has(declaration.id)}",
    replace: "defaultChecked",
    guard: GUARD,
    expect: "8.7 nothing is pre-selected",
  },
  {
    id: "VSD-NC-BRIDGE-UNPREVIEWED-ATTACH",
    defect: "a ticked statement is attached without the holder having been shown the preview",
    file: BRIDGE_SHARE,
    find: "  const confirmed = useMemo(() => confirmedChoices(chosen, previewed), [chosen, previewed]);",
    replace:
      "  const confirmed = useMemo(() => chosen.map((d) => ({ declarationId: d.id, revision: d.revision })), [chosen, previewed]);",
    guard: GUARD,
    expect: "8.8 only what the server's preview returned can be attached",
  },
  {
    id: "VSD-NC-BRIDGE-SOCIAL-IMAGE",
    defect: "the holder's choice of statements is passed on to the social share",
    file: SHARE_ROUTE,
    find: "      create: (input) => doSocialCreate({ data: { ...input, claimIds: [...input.claimIds] } }),",
    replace:
      "      create: (input) =>\n        doSocialCreate({\n          data: { ...input, claimIds: [...input.claimIds], extra: selfDeclarationOffer.choices } as never,\n        }),",
    guard: GUARD,
    expect: "8.9 the choice goes to one place",
  },
  {
    id: "VSD-NC-BRIDGE-ANONYMOUS-READ",
    defect: "the recipient's read no longer requires a signed-in caller",
    file: BRIDGE_RECIPIENT_FN,
    find: 'export const readSharedSelfDeclarations = createServerFn({ method: "POST" })\n  .middleware([requireSupabaseAuth])\n',
    replace: 'export const readSharedSelfDeclarations = createServerFn({ method: "POST" })\n',
    guard: GUARD,
    expect: "8.10 the recipient's read is a separate call",
  },
  {
    id: "VSD-NC-BRIDGE-SERVICE-ROLE-READ",
    defect:
      "the recipient's read goes through the service role instead of the recipient's own client",
    file: BRIDGE_RECIPIENT_FN,
    find: "    const client = (context as { supabase: unknown }).supabase as CallerClient;",
    replace:
      '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");\n    const client = supabaseAdmin as unknown as CallerClient;',
    guard: GUARD,
    expect: "8.10 the recipient's read is a separate call",
  },
  {
    id: "VSD-NC-BRIDGE-ANONYMOUS-CALL",
    defect: "the recipient page asks for the statements whether or not the visitor is signed in",
    file: BRIDGE_RECIPIENT,
    find: "    if (signedIn !== true) {",
    replace: "    if (signedIn === false) {",
    guard: GUARD,
    expect: "8.10b a visitor who is not signed in triggers no call",
  },
  {
    id: "VSD-NC-BRIDGE-PAGE-HEAD",
    defect: "the recipient page's head starts describing the self-declarations to link previews",
    file: RECIPIENT_ROUTE,
    find: '      { name: "robots", content: "noindex, nofollow" },',
    replace:
      '      { name: "robots", content: "noindex, nofollow" },\n      { name: "description", content: "self-declarations included" },',
    guard: GUARD,
    expect: "8.11 nothing of it reaches the recipient page",
  },
  {
    id: "VSD-NC-BRIDGE-WALLET",
    defect: "the credential wallet is handed the self-declarations, where they could be counted",
    file: PASSPORT_ROUTE,
    find: "          metadata={metadata}\n          reviews={reviews}\n          reviewState={reviewState}",
    replace:
      "          metadata={metadata}\n          selfDeclarations={loadSelfDeclarations}\n          reviews={reviews}\n          reviewState={reviewState}",
    guard: GUARD,
    expect: "8.6 the Passport page mounts the section once",
  },
  // ── One creation operation: what is known, and what a retry repeats ───
  {
    id: "VSD-NC-BRIDGE-LOST-ANSWER-NOT-SHARED",
    defect:
      "a lost answer with nothing committed yet is reported as a refusal, so the screen says nothing was shared while the request may still commit",
    file: BRIDGE_MODEL,
    find: '    // is not proof that nothing will be. Only a repeat settles it.\n    return { kind: "unconfirmed" };',
    replace:
      '    // is not proof that nothing will be. Only a repeat settles it.\n    return { kind: "refused", code: "VSD_WRITE_FAILED" };',
    guard: GUARD,
    expect: "8.9a a lost answer is never 'not shared'",
  },
  {
    id: "VSD-NC-BRIDGE-UNREADABLE-STATE-NOT-SHARED",
    defect: "when the committed state cannot be read either, the operation is reported as refused",
    file: BRIDGE_MODEL,
    find: '    } catch {\n      return { kind: "unconfirmed" };\n    }',
    replace: '    } catch {\n      return { kind: "refused", code: "VSD_WRITE_FAILED" };\n    }',
    guard: GUARD,
    expect: "8.9a a lost answer is never 'not shared'",
  },
  {
    id: "VSD-NC-BRIDGE-ANY-ERROR-IS-REFUSAL",
    defect: "any thrown error counts as the database's refusal",
    file: BRIDGE_MODEL,
    find: "  return REFUSAL.test(message) ? message : null;",
    replace: "  return message || null;",
    guard: GUARD,
    expect: "8.9a a lost answer is never 'not shared'",
  },
  {
    id: "VSD-NC-BRIDGE-RETRY-NEW-OPERATION",
    defect:
      "while an operation is unconfirmed, creating again starts a NEW operation from whatever the screen shows now",
    file: BRIDGE_SHARE,
    find: "      settle(unconfirmed.current && kept.current ? kept.current : operation),",
    replace: "      settle(operation),",
    guard: GUARD,
    expect: "8.9b an unconfirmed operation is kept and repeated as it was",
  },
  {
    id: "VSD-NC-BRIDGE-KEY-ROTATED-UNCONFIRMED",
    defect:
      "an unconfirmed outcome rotates the request key, so the next attempt can create a second link",
    file: SHARE_ROUTE,
    find: '    if (!settled || settled.kind === "unconfirmed") return;',
    replace: "    if (!settled) return;",
    guard: GUARD,
    expect: "8.9b an unconfirmed operation is kept and repeated as it was",
  },
  {
    id: "VSD-NC-BRIDGE-REFRESH-DECIDES-OUTCOME",
    defect: "a failed re-read of the list after a confirmed creation overturns the outcome",
    file: BRIDGE_SHARE,
    find: "      setView((current) => ({ ...current, listStale: true }));",
    replace:
      '      setView((current) => ({ ...current, listStale: true, outcome: { kind: "unconfirmed" } }));',
    guard: GUARD,
    expect: "8.9c whether the list could be re-read is a separate fact",
  },
  {
    id: "VSD-NC-BRIDGE-LIST-FAILURE-AS-EMPTY",
    defect: "an unreadable list of shared statements is answered as an empty one",
    file: BRIDGE_FUNCTIONS,
    find: '    if (error) throw refusal(error, "VSD_READ_FAILED");\n    return toSharedSelections(data);',
    replace: "    if (error) return [];\n    return toSharedSelections(data);",
    guard: GUARD,
    expect: "8.9c whether the list could be re-read is a separate fact",
  },
  {
    id: "VSD-NC-BRIDGE-RECIPIENT-BELOW-PROMOTION",
    defect: "the recipient view no longer renders the slot below the card",
    file: "src/components/security-passport/live/RecipientPassportView.tsx",
    find: "      </section>\n      {afterCard}\n",
    replace: "      </section>\n",
    guard: GUARD,
    expect: "8.11a the section sits directly below the card",
  },
  {
    id: "VSD-NC-BRIDGE-TIME-WINDOW",
    defect:
      "the seal accepts any link younger than an hour instead of the link being created in this transaction",
    file: "supabase/migrations/20270325090000_vsd_passport_disclosure.sql",
    find: "          AND x.created_at = transaction_timestamp()",
    replace: "          AND x.created_at > now() - interval '1 hour'",
    guard: GUARD,
    expect: "8.14a the migration has no function that gives an existing link a statement",
  },
];

runControls("self-declarations", MUTATIONS);
