/**
 * Planted defects for beskt-v01-import:check. Each one reintroduces a
 * material failure of the BESKT v0.1 import; the guard must catch every one.
 *
 * Run: bun run negative-controls:beskt-v01-import
 */

import { runControls, type Mutation } from "./runner";

const PLAN = "src/lib/beskt/import/plan.ts";
const CONTENT = "src/lib/beskt/import/beskt-v0-1.content.ts";
const GUARD = "beskt-v01-import:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "V01-NC-VETTING-INTO-RECRUITMENT",
    defect:
      "the recruitment method takes every question, so E, S and K reach candidates through a recruitment preparation",
    file: PLAN,
    find: '(q) => mode === "security_vetting_support" || q.mode === "recruitment_support",',
    replace: "() => true,",
    guard: GUARD,
    expect: "V01-BOUNDARY: the recruitment method carries no E, S or K question",
  },
  {
    id: "V01-NC-LAWFUL-BASIS-INVENTED",
    defect: "a real import records a lawful basis nobody decided",
    file: PLAN,
    find:
      '        ? "SYNTETISK TESTVERSION – ingen rättslig grund fastställd; får inte användas med verkliga personuppgifter"\n' +
      "        : lawfulBasisReference?.trim() || null,",
    replace:
      '        ? "SYNTETISK TESTVERSION – ingen rättslig grund fastställd; får inte användas med verkliga personuppgifter"\n' +
      '        : lawfulBasisReference?.trim() || "GDPR artikel 6.1 f",',
    guard: GUARD,
    expect: "V01-DECISIONS: no lawful basis and no role attestation is invented",
  },
  {
    id: "V01-NC-FAKTA-STEP-LOST",
    defect: "the first FAKTA step no longer reaches the interview",
    file: CONTENT,
    find: 'specRef: "§5.2 steg 1 Fakta",',
    replace: 'specRef: "§5.1",',
    guard: GUARD,
    expect: "V01-COVERAGE: FAKTA step 1 (§5.2) is carried by a prompt",
  },
  {
    id: "V01-NC-NON-ANSWER-OPTION",
    defect:
      "'Vill inte svara' becomes an option a routing rule can read, instead of a neutral state",
    file: CONTENT,
    find: '  { key: "osaker", sv: "Osäker", en: "Unsure" },\n];\nconst RECENCY',
    replace:
      '  { key: "osaker", sv: "Osäker", en: "Unsure" },\n  { key: "prefer_not", sv: "Vill inte svara", en: "Prefer not to say" },\n];\nconst RECENCY',
    guard: GUARD,
    expect: "V01-DECISIONS: 'Vill inte svara' and 'Tar muntligt' stay response states",
  },
];

await runControls("beskt-v01-import", MUTATIONS);
