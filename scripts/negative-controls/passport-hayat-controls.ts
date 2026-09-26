/**
 * Negative controls for HAYAT (document reading and verification).
 *
 * Each mutation reintroduces one defect the guard exists for: a guessed date,
 * a holder's value overwritten, a reading outliving its file, "unknown" rounded
 * up to "passed", somebody else's credential verified, an issuer verified
 * outside its scope, a document steering a server-side fetch, and a trusted
 * issuer appearing without review.
 *
 * Run: bun run negative-controls:passport-hayat
 */
import { runControls, type Mutation } from "./runner";

const DATES = "src/lib/security-passport/hayat/parse-dates.ts";
const SUGGEST = "src/lib/security-passport/hayat/suggestions.ts";
const MODEL = "src/lib/security-passport/hayat/verification/model.ts";
const SIGNED = "src/lib/security-passport/hayat/verification/signed-credential.ts";
const FETCH = "src/lib/security-passport/hayat/verification/safe-fetch.ts";
const BOUNDARY = "src/lib/security-passport/hayat/hayat.functions.ts";
const WRITER = "src/lib/security-passport/hayat/hayat-assessment.server.ts";
const FIELDS = "src/lib/security-passport/hayat/parse-fields.ts";
const GUARD = "passport-hayat:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "HAYAT-NC-AMBIGUOUS-DATE-GUESSED",
    defect: "03/04/2026 is silently read day-first, so a US certificate gets the wrong expiry",
    file: DATES,
    find: '    return { kind: "ambiguous", candidates: [dayFirst, monthFirst], index };',
    replace: '    return { kind: "exact", iso: dayFirst, index };',
    guard: GUARD,
    expect: "1.8 03/04/2026 is ambiguous",
  },
  {
    id: "HAYAT-NC-HOLDER-VALUE-OVERWRITTEN",
    defect: "a reading fills a field the holder already typed in",
    file: SUGGEST,
    find: '  if (typed === "") return { kind: "filled", value: reading.value };',
    replace: '  if (typed !== "\\u0000") return { kind: "filled", value: reading.value };',
    guard: GUARD,
    expect: "4.3 a typed value is never overwritten",
  },
  {
    id: "HAYAT-NC-READING-OUTLIVES-FILE",
    defect: "values read from file A stay in the form after file A is removed",
    file: SUGGEST,
    find: '    if (isReadByHayat(draft, marks, field)) next[field] = "";',
    replace: '    if (isReadByHayat(draft, marks, field)) next[field] = next[field] ?? "";',
    guard: GUARD,
    expect: "4.10",
  },
  {
    id: "HAYAT-NC-UNKNOWN-ROUNDS-UP",
    defect: "a check nobody could run counts as passed, so a missing status becomes 'not revoked'",
    file: MODEL,
    find: 'const ok = (c: Check) => c.result === "passed" || c.result === "not_applicable";',
    replace:
      'const ok = (c: Check) =>\n  c.result === "passed" || c.result === "not_applicable" || c.result === "unknown";',
    guard: GUARD,
    expect: "7.30 a missing status is never 'not revoked'",
  },
  {
    id: "HAYAT-NC-BINDING-SKIPPED",
    defect: "holder binding is assumed, so a copied genuine credential verifies for anyone",
    file: SIGNED,
    find: "  set(await bindingCheck(subject, input.account));",
    replace: '  set(check("subject_binding", "passed", "ok"));',
    guard: GUARD,
    expect: "7.5 somebody else's genuine credential",
  },
  {
    id: "HAYAT-NC-ISSUER-SCOPE-IGNORED",
    defect: "a trusted issuer is trusted for every credential type, not only those it may issue",
    file: SIGNED,
    find: "    achievementId && permitted.includes(achievementId)",
    replace: "    achievementId",
    guard: GUARD,
    expect: "7.13 a genuine credential of the wrong type",
  },
  {
    id: "HAYAT-NC-FETCH-ALLOWLIST-DROPPED",
    defect: "any public host named by the credential is fetched from the server",
    file: FETCH,
    find: '  if (!allowedHosts.map((h) => h.toLowerCase()).includes(host)) return "host_not_allowed";\n',
    replace: "",
    guard: GUARD,
    expect: "https://evil.example/x -> host_not_allowed",
  },
  {
    id: "HAYAT-NC-CLIENT-SUPPLIED-RESULT",
    defect: "the server input stops refusing unknown keys, so a client can start sending a result",
    file: BOUNDARY,
    find: "  .strict()\n  .refine(",
    replace: "  .passthrough()\n  .refine(",
    guard: GUARD,
    expect: "9.7 EVERY server input schema refuses unknown keys",
  },
  {
    id: "HAYAT-NC-OUTAGE-RECORDED",
    defect: "a source outage is stored as if it were a result about the credential",
    file: WRITER,
    find: '  if (decision.status === "temporarily_unavailable") return { recorded: false, why: "outage" };\n',
    replace: "",
    guard: GUARD,
    expect: "10.8 an outage is never recorded",
  },
  {
    id: "HAYAT-NC-HOLDER-FROM-REQUEST",
    defect:
      "the holder the writer is told about comes from request data instead of the verified session",
    file: BOUNDARY,
    find: "      holderUserId: context.userId,",
    replace: "      holderUserId: data.claimId,",
    guard: GUARD,
    expect: "10.5 the holder passed to the writer",
  },
  // ── India (20261214090000) ─────────────────────────────────────────────
  {
    id: "HAYAT-NC-INDIA-AMBIGUOUS-GUESSED-DAY-FIRST",
    defect:
      "an Indian dashed date is resolved day-first because 'Indian certificates are day-first' -- a guess",
    file: DATES,
    find: '  if (separator === ".") return dayFirst ? { kind: "exact", iso: dayFirst, index } : null;',
    replace:
      '  if (separator === "." || separator === "-") return dayFirst ? { kind: "exact", iso: dayFirst, index } : null;',
    guard: GUARD,
    expect: "11.3 04-03-2023 is still ambiguous",
  },
  {
    id: "HAYAT-NC-INDIA-TITLE-READ-AS-NAME",
    defect:
      "a printed title (Ms., Shri) counts as part of the name and a true match reads as a difference",
    file: FIELDS,
    find: "        .filter((t) => t.length > 1 && !HONORIFICS.has(t)),",
    replace: "        .filter((t) => t.length > 1),",
    guard: GUARD,
    expect: "11.15 'Shri' is a title",
  },
  {
    id: "HAYAT-NC-INDIA-COMPACT-DATE-DROPPED",
    defect: "03-Apr-2023 is not read, so every Indian issue date must be typed by hand",
    file: DATES,
    find: "  if (compact && MONTHS[compact[3]]) {",
    replace: "  if (compact && MONTHS[compact[3]] && false) {",
    guard: GUARD,
    expect: "11.1 a compact Indian date",
  },
];

runControls("passport-hayat", MUTATIONS);
