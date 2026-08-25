// "Annat" and "Ej angivet" are different answers, and neither pollutes the
// canonical taxonomy.
//
// Run via `bun run employer-other-taxonomy:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// The job form offered one non-answer, "Ej angivet". A customer asked for
// "Annat", and the two say different things:
//
//   Ej angivet   the employer did not say, or does not know
//   Annat        the employer DID say: their role is not in our list
//
// Only the second tells us the taxonomy is incomplete, which is the reason it
// is worth storing separately rather than collapsing both into NULL.
//
// ── THE THING THAT MUST NEVER HAPPEN ────────────────────────────────────
//
// family_id is checked against assert_cig_family_id() -- fourteen ids -- and
// the public job search filters on it with exact equality, as it does on
// profession_slug. Writing "other", or the employer's own words, into either
// would fail the trigger; and if a later refactor removed the trigger, it
// would silently pollute a vocabulary that candidate-facing filters read.
//
// So the sentinel the <select> uses lives only in the form, and this asserts
// it never survives into a payload. The database holds the same rule in
// CHECK constraints (20260909092000), which is where it cannot be bypassed --
// this catches it at the layer where the mistake would actually be written.

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  emptyValues,
  fromJobRow,
  toServerPayload,
  OTHER_OPTION,
} from "../src/components/employer/job-form/model";
const fails: string[] = [];
const ck = (n: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${n}${ok ? "" : "  — " + d}`);
  if (!ok) fails.push(n);
};

// 1. Not specified stays not specified.
{
  const p = toServerPayload({
    ...emptyValues,
    family_id: "",
    profession_slug: "",
  } as never) as never as Record<string, unknown>;
  ck("not specified: family_id null", p.family_id === null);
  ck("not specified: family_other false", p.family_other === false);
  ck("not specified: no free text", p.family_other_text === null);
}
// 2. A canonical choice is untouched.
{
  const p = toServerPayload({
    ...emptyValues,
    family_id: "corporate_security",
  } as never) as never as Record<string, unknown>;
  ck("canonical: id preserved", p.family_id === "corporate_security");
  ck("canonical: other false", p.family_other === false);
}
// 3. Annat never reaches the canonical column.
{
  const p = toServerPayload({
    ...emptyValues,
    family_id: OTHER_OPTION,
    family_other_text: "  Säkerhetsteknik för sjukvård  ",
    profession_slug: OTHER_OPTION,
    profession_other_text: "Larmtekniker",
  } as never) as never as Record<string, unknown>;
  ck("Annat: family_id is null", p.family_id === null, String(p.family_id));
  ck("Annat: sentinel never stored", JSON.stringify(p).indexOf(OTHER_OPTION) === -1);
  ck("Annat: flag set", p.family_other === true);
  ck(
    "Annat: text trimmed",
    p.family_other_text === "Säkerhetsteknik för sjukvård",
    String(p.family_other_text),
  );
  ck("Annat role: slug null, flag set", p.profession_slug === null && p.profession_other === true);
  ck("Annat role: text kept", p.profession_other_text === "Larmtekniker");
}
// 4. Annat with no words is still Annat.
{
  const p = toServerPayload({
    ...emptyValues,
    family_id: OTHER_OPTION,
    family_other_text: "   ",
  } as never) as never as Record<string, unknown>;
  ck("Annat without text: flag still true", p.family_other === true);
  ck("Annat without text: text null (not empty string)", p.family_other_text === null);
}
// 5. Round trip back into the form.
{
  const row = {
    family_id: null,
    family_other: true,
    family_other_text: "Egen kategori",
    profession_slug: null,
    profession_other: true,
    profession_other_text: "Egen roll",
  };
  const v = fromJobRow(row as never) as never as Record<string, unknown>;
  ck("round trip: select shows Annat", v.family_id === OTHER_OPTION, String(v.family_id));
  ck("round trip: text restored", v.family_other_text === "Egen kategori");
  ck("round trip: role shows Annat", v.profession_slug === OTHER_OPTION);
}
// 6. Switching away from Annat clears the words.
{
  const p = toServerPayload({
    ...emptyValues,
    family_id: "risk_management",
    family_other_text: "leftover",
  } as never) as never as Record<string, unknown>;
  ck("switched to canonical: flag false", p.family_other === false);
  ck(
    "switched to canonical: stale text dropped",
    p.family_other_text === null,
    String(p.family_other_text),
  );
}

// 7. The two non-answers are actually different words, in both languages.
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  for (const [lang, d] of [
    ["sv", sv],
    ["en", en],
  ] as const) {
    const none = d["employer.jobs.form.option.none"] ?? "";
    const other = d["employer.jobs.form.option.other"] ?? "";
    ck(`${lang}: both options exist`, Boolean(none && other));
    ck(`${lang}: they are not the same word`, none !== other, `${none} / ${other}`);
  }
  for (const key of [
    "employer.jobs.form.field.familyOther",
    "employer.jobs.form.field.professionOther",
  ]) {
    ck(`copy: ${key} in both languages`, Boolean(sv[key] && en[key]));
  }
}

// 8. No public filter reads the free text.
//
// If it ever did, an employer's own words would become a facet -- an
// uncontrolled vocabulary in a candidate-facing filter, which is exactly what
// keeping family_id canonical avoids.
{
  const q = readFileSync(
    new URL("../src/lib/job-intelligence/public-queries.ts", import.meta.url),
    "utf8",
  );
  for (const col of ["family_other", "profession_other"]) {
    ck(`public search does not filter on ${col}`, !q.includes(col));
  }
}

console.log(fails.length ? `\nFAILED: ${fails.join(", ")}` : "\nPASS");
process.exit(fails.length ? 1 : 0);
