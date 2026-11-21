// Pure checks for Security Work Release A. No database, no network.
// The mission state machine in the client must equal the database's
// sw_private.guard_mission (20270327090000): this reads both and compares, so
// a change to either without the other fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canTransition,
  executionTransitions,
  missingInputs,
  nextStep,
  offeredMissionKinds,
  parseBrief,
} from "../src/lib/security-work/missions/model";
import {
  UnknownProfileSchema,
  confirmedOnly,
  emptyProfile,
  operatingProfileSchema,
  prefillFrom,
  readProfile,
} from "../src/lib/security-work/operating-context/schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const check = (label: string, run: () => void) => {
  try {
    run();
    checks += 1;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

check("client mission transitions equal the database guard", () => {
  const sql = readFileSync(
    path.join(
      root,
      "supabase/migrations/20270327090000_security_work_context_missions_collaboration.sql",
    ),
    "utf8",
  );
  const body = sql.slice(sql.indexOf("_allowed := CASE OLD.execution_state"));
  const database: Record<string, string[]> = {};
  for (const match of body.matchAll(/WHEN '([a-z_]+)' THEN ARRAY\[([^\]]*)\]/g))
    database[match[1]] = [...match[2].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.ok(Object.keys(database).length >= 6, "guard_mission transitions not found");
  for (const [from, to] of Object.entries(executionTransitions))
    assert.deepEqual([...to].sort(), database[from] ?? [], `transitions from ${from}`);
  assert.match(sql, /CHECK \(execution_state <> 'completed' OR review_state = 'accepted'\)/);
});

check("completion requires an accepted review", () => {
  assert.equal(
    canTransition({ execution_state: "needs_review", review_state: "in_review" }, "completed"),
    false,
  );
  assert.equal(
    canTransition({ execution_state: "needs_review", review_state: "accepted" }, "completed"),
    true,
  );
});

check("event security is not offered until it works", () => {
  assert.deepEqual([...offeredMissionKinds], ["monitoring_impact", "risk_assessment"]);
});

check("unknown inputs stay unknown and are listed", () => {
  const brief = parseBrief("event_security", { eventType: "Festival" });
  assert.equal(brief.expectedAttendance, null);
  assert.deepEqual(missingInputs("event_security", brief), [
    "place",
    "startsAt",
    "endsAt",
    "timeZone",
    "expectedAttendance",
  ]);
  assert.deepEqual(
    nextStep({
      kind: "event_security",
      execution_state: "created",
      review_state: "not_started",
      brief,
      evidenceCount: 0,
    }),
    {
      kind: "complete_brief",
      missing: ["place", "startsAt", "endsAt", "timeZone", "expectedAttendance"],
    },
  );
});

check("an unknown profile schema version fails closed", () => {
  assert.throws(() => readProfile("sw-operating-profile-2", {}), UnknownProfileSchema);
  assert.deepEqual(readProfile("sw-operating-profile-1", {}), emptyProfile());
  assert.throws(() => operatingProfileSchema.parse({ unknownField: true }));
  assert.throws(() =>
    operatingProfileSchema.parse({
      locations: [{ name: "HQ", country: "SE", timeZone: "Mars/Olympus" }],
    }),
  );
});

check("prefilled values are never saved unconfirmed", () => {
  const prefill = prefillFrom({
    mandate: { organisation_description: "Synthetic org", geographic_scope: "" },
    assets: [{ name: "Terminal", category: "operations", status: "active" }],
    monitoring: { sector: "logistics", countries: ["se", "XX1"], threat_categories: [] },
  });
  assert.deepEqual(prefill.profile.countries, ["SE"]);
  const profile = { ...emptyProfile(), ...prefill.profile };
  const unconfirmed = confirmedOnly(profile, prefill.provenance);
  assert.equal(unconfirmed.profile.organisationDescription, "");
  assert.deepEqual(unconfirmed.profile.criticalServices, []);
  assert.deepEqual(unconfirmed.provenance, {});
  const confirmed = confirmedOnly(profile, {
    ...prefill.provenance,
    organisationDescription: { origin: "mandate", confirmed: true },
  });
  assert.equal(confirmed.profile.organisationDescription, "Synthetic org");
  assert.deepEqual(confirmed.profile.criticalServices, []);
});

console.log(`Security Work Release A: ${checks} pure checks passed; no database or network.`);
