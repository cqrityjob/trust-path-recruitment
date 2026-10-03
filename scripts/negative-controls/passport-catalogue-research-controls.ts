/**
 * Negative controls for the certification research import guard.
 *
 * Each mutation brings back one defect the import must never have: matching an
 * award by its acronym alone, ignoring the issuer or a disagreeing
 * abbreviation, publishing a definition at import time, giving a definition a
 * place or a lifetime, inventing an abbreviation or a mark, approving a record
 * the research said needs stronger evidence, and letting a generated artefact
 * drift from the reviewed decisions.
 *
 * Run: bun run negative-controls:passport-catalogue-research
 */
import { runControls, type Mutation } from "./runner";

const LIB = "scripts/lib/passport-catalogue-research.ts";
const DATA = "scripts/lib/passport-catalogue-research-data.ts";
const GUARD = "passport-catalogue-research:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PCR-NC-ACRONYM-ALONE-MATCHES",
    defect:
      "an award is matched to an existing definition by its acronym alone, whatever its issuer or name",
    file: LIB,
    find: "    if (sameIssuer && sameName && !acronymsDisagree) {",
    replace: "    if (sameAcronym) {",
    guard: GUARD,
    expect: "2.2 the same issuer and acronym with a different award does not match",
  },
  {
    id: "PCR-NC-ISSUER-IGNORED",
    defect:
      "the issuer is not part of the match, so another body's identically named award is folded into an existing definition",
    file: LIB,
    find: "    if (sameIssuer && sameName && !acronymsDisagree) {",
    replace: "    if (sameName && !acronymsDisagree) {",
    guard: GUARD,
    expect: "2.3 the same acronym and award under another issuer does not match",
  },
  {
    id: "PCR-NC-DISAGREEING-ABBREVIATION-IGNORED",
    defect:
      "a disagreeing abbreviation is ignored, so OSCP+ would be folded into OSCP once the names normalise alike",
    file: LIB,
    find: "    if (sameIssuer && sameName && !acronymsDisagree) {",
    replace: "    if (sameIssuer && sameName) {",
    guard: GUARD,
    expect:
      "2.5 an award name that normalises equal but whose abbreviation disagrees does not match",
  },
  {
    id: "PCR-NC-PUBLISH-AT-IMPORT",
    defect:
      "the import activates every definition it adds, so 140 awards become selectable before the application that renders them",
    file: LIB,
    find: "  w(`       false, false, false, v.sort_order,`);",
    replace: "  w(`       false, false, true, v.sort_order,`);",
    guard: GUARD,
    expect: "3.4 the type insert is global_professional, legal review pending and INACTIVE",
  },
  {
    id: "PCR-NC-DEFINITION-GETS-A-COUNTRY",
    defect: "a definition is given a jurisdiction from the research's national origin",
    file: LIB,
    find: "  w(`       NULL, NULL, NULL, NULL, NULL,`);",
    replace: "  w(`       NULL, 'GB', NULL, NULL, NULL,`);",
    guard: GUARD,
    expect: "3.5 no market pack, jurisdiction, sub-jurisdiction, authority or role",
  },
  {
    id: "PCR-NC-NO-EXPIRY-INFERRED",
    defect: "a definition allows a non-expiring claim because the research did not say it expires",
    file: LIB,
    find: "  w(`       false, false, v.reference_label, v.reference_label`);",
    replace: "  w(`       true, false, v.reference_label, v.reference_label`);",
    guard: GUARD,
    expect: "3.5 no market pack, jurisdiction, sub-jurisdiction, authority or role",
  },
  {
    id: "PCR-NC-MARK-TOO-LONG",
    defect: "a plate mark longer than the plate is accepted",
    file: LIB,
    find: "    ac.length <= 8 &&\n",
    replace: "    ac.length <= 12 &&\n",
    guard: GUARD,
    expect: "3.7 every plate mark fits the plate",
  },
  {
    id: "PCR-NC-ABBREVIATION-INVENTED",
    defect: "an award that publishes no abbreviation is given one (its issuer's)",
    file: LIB,
    find: "  const abbreviation = r.acronym && !ACRONYM_IS_NOT_AN_ABBREVIATION.has(id) ? r.acronym : null;",
    replace:
      "  const abbreviation = r.acronym && !ACRONYM_IS_NOT_AN_ABBREVIATION.has(id) ? r.acronym : issuer.mark;",
    guard: GUARD,
    expect: "3.9 the 27 awards with no published abbreviation have none: none is invented",
  },
  {
    id: "PCR-NC-KIND-COLLAPSED",
    defect:
      "a personal certification is classed as a course certificate, collapsing two kinds the brief keeps apart",
    file: DATA,
    find: '  person_certification: "certification",',
    replace: '  person_certification: "course_certificate",',
    guard: GUARD,
    expect: "3.12 all five kinds and all five research areas are represented",
  },
  {
    id: "PCR-NC-UNVERIFIED-ROW-APPROVED",
    defect:
      "a record the research marked source_recheck_required is approved without stronger evidence",
    file: DATA,
    find: '  "12e054": sourceCheck(',
    replace: '  "12e054x": sourceCheck(',
    guard: GUARD,
    expect: "source_recheck_required but has no retained decision",
  },
  {
    id: "PCR-NC-PLATE-MARKS-DRIFT",
    defect: "the generated TypeScript plate marks drift from the marks the migration seeds",
    file: LIB,
    find: "    ...rows.map(([c, m]) => `  ${c}: ${JSON.stringify(m)},`),",
    replace: "    ...rows.map(([c, m]) => `  ${c}: ${JSON.stringify(m.toLowerCase())},`),",
    guard: GUARD,
    expect: "catalogue-research-marks.ts is exactly what the generator produces",
  },
  {
    id: "PCR-NC-MIGRATION-DRIFT",
    defect: "the committed import migration no longer matches the reviewed decisions",
    file: LIB,
    find: "  w(`-- Security Passport — the 2026-10-03 certification research import (DATA).`);",
    replace:
      "  w(`-- Security Passport — the 2026-10-03 certification research import (DATA), edited by hand.`);",
    guard: GUARD,
    expect: "sp_catalogue_research_import.sql is exactly what the generator produces",
  },
  {
    id: "PCR-NC-COLLIDING-CODES",
    defect: "two awards are given the same code, silently merging them",
    file: DATA,
    find: '  "9b6fa5": "ADV_DIPLOMA_INSURANCE",',
    replace: '  "9b6fa5": "CERT_INSURANCE",',
    guard: GUARD,
    expect: "duplicate definition codes",
  },
];

runControls("passport-catalogue-research", MUTATIONS);
