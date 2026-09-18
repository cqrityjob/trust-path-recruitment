/**
 * BESKT v0.1 import — the plan is checked against the specification and the
 * recruitment / security-vetting boundary, without a database.
 *
 * The validator and the routed walk prove the content in a real database;
 * this guard runs in the fast job and fails when the import stops carrying
 * the specification, or when it starts carrying security-vetting content into
 * the recruitment method, or invents a decision it must leave to people.
 *
 * Run: bun run beskt-v01-import:check
 */

import {
  ANCHORS,
  QUESTIONS,
  PROMPTS,
  WORDING_ADAPTATIONS,
} from "./beskt-import/beskt-v0-1.content";
import { buildPlan } from "./beskt-import/plan";

const fails: string[] = [];
let passed = 0;
function check(ok: boolean, label: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok ${label}`);
  } else {
    fails.push(label);
    console.log(`  FAIL ${label}`);
  }
}

const rek = buildPlan("rekrytering", { synthetic: false });
const sak = buildPlan("sakerhet", { synthetic: false });
const rekSyn = buildPlan("rekrytering", { synthetic: true });
const keysOf = (rows: Array<Record<string, unknown>>) => rows.map((r) => String(r.item_key));

/* ---- coverage of §4–6 ------------------------------------------------ */
for (let n = 1; n <= 20; n += 1) {
  const q = QUESTIONS.find((x) => x.specRef === `§4.3 fråga ${n}`);
  check(
    q !== undefined && keysOf(sak.items).includes(q.key),
    `V01-COVERAGE: §4.3 fråga ${n} is carried by the security-vetting method`,
  );
}
check(
  QUESTIONS.filter((q) => q.specRef.startsWith("§4.4 scenario")).length === 6,
  "V01-COVERAGE: all six §4.4 scenarios are carried",
);
check(
  keysOf(rek.items).includes("t01_forstaelse") && keysOf(rek.items).includes("t02_tidigare_ansvar"),
  "V01-COVERAGE: T is the candidate's acknowledgement and experience, not a question block",
);
for (let n = 1; n <= 10; n += 1) {
  check(
    PROMPTS.some((p) => new RegExp(`§5\\.2 steg ${n}\\b`).test(p.specRef)),
    `V01-COVERAGE: FAKTA step ${n} (§5.2) is carried by a prompt`,
  );
}
check(
  ANCHORS.map((a) => a.state)
    .sort()
    .join(",") ===
    [
      "clarification_needed",
      "conflicting_information",
      "external_verification_needed",
      "insufficient_basis",
      "not_applicable",
      "sufficiently_clarified",
      "unaddressed",
    ].join(","),
  "V01-COVERAGE: exactly the seven evidence states carry the §5.3 anchors",
);

/* ---- the recruitment / security-vetting boundary ---------------------- */
check(
  rek.version.mode === "recruitment_support" &&
    rek.items.every(
      (i) =>
        i.permitted_mode === "recruitment_support" &&
        i.sensitivity_class !== "security_vetting_only",
    ) &&
    !rek.items.some((i) => /^q(09|1[0-9]|20)_/.test(String(i.item_key))),
  "V01-BOUNDARY: the recruitment method carries no E, S or K question and nothing security-vetting-only",
);
check(
  rek.profiles.every(
    (p) =>
      p.permitted_mode === "recruitment_support" &&
      p.access_class !== "authorised_security_function" &&
      p.retention_class === "recruitment_record",
  ) && rek.activation.length === 0,
  "V01-BOUNDARY: the recruitment profile is a recruitment record, with no activation requirement",
);
check(
  sak.version.mode === "security_vetting_support" &&
    sak.activation.length === 3 &&
    sak.profiles.every(
      (p) =>
        p.access_class === "authorised_security_function" &&
        p.retention_class === "security_vetting_record",
    ),
  "V01-BOUNDARY: the security-vetting method carries the three activation requirements and its own access and retention class",
);
check(
  sak.items.filter((i) => /^q(09|1[0-9]|20)_/.test(String(i.item_key))).length >= 12 &&
    sak.items
      .filter((i) => /^q(09|1[0-9]|20)_/.test(String(i.item_key)))
      .every(
        (i) => i.sensitivity_class === "security_vetting_only" && i.discuss_orally_allowed === true,
      ),
  "V01-BOUNDARY: every E, S and K item is security-vetting-only and may be taken orally",
);

/* ---- decisions left to people ----------------------------------------- */
check(
  [...rek.profiles, ...sak.profiles].every(
    (p) =>
      p.lawful_basis_reference === null && p.security_sensitive_role_attestation_reference === null,
  ),
  "V01-DECISIONS: no lawful basis and no role attestation is invented for a real import",
);
check(
  rekSyn.profiles.every((p) => /^SYNTETISK/.test(String(p.lawful_basis_reference))) &&
    /^SYNTETISK TEST/.test(rekSyn.method.nameSv) &&
    /^syntetisk-/.test(rekSyn.method.slug),
  "V01-DECISIONS: a synthetic test version says so in its name, slug and lawful-basis text",
);
check(
  [...rek.items, ...sak.items].every((i) =>
    ((i.options as Array<{ option_key: string }>) ?? []).every(
      (o) => !/(prefer_not|decline|no_answer|discuss|omit|skip|rather_not)/.test(o.option_key),
    ),
  ),
  "V01-DECISIONS: 'Vill inte svara' and 'Tar muntligt' stay response states, never options",
);
check(
  WORDING_ADAPTATIONS.length === 2 &&
    !QUESTIONS.some((q) => q.sv.includes("nedsatt omdöme")) &&
    !ANCHORS.some((a) => a.defSv.startsWith("Bedömning kan inte göras")),
  "V01-DECISIONS: every place the specification's own wording changed is recorded for the reviewers",
);
check(
  [...rek.items, ...sak.items].every(
    (i) => i.item_key === "t01_forstaelse" || i.requiredness === "voluntary",
  ),
  "V01-DECISIONS: no question is compulsory — an omission is an information gap, never negative evidence",
);

console.log("");
if (fails.length > 0) {
  console.error(`beskt-v01-import:check FAILED (${fails.length} of ${passed + fails.length}).`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `beskt-v01-import:check: ${passed} assertions passed. The import carries the specification and keeps recruitment and security vetting apart.`,
);
