import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { countApplicationSourceReferences } from "../src/lib/interview-intelligence/background-source-references";
import { CandidateBackgroundStatus } from "../src/components/employer/interview/CandidateBackgroundStatus";
import { I18nProvider } from "../src/i18n/context";
import { SelectedRequirementBrief } from "../src/components/employer/interview/SelectedRequirementBrief";
import { selectedRequirementBriefs } from "../src/lib/interview-intelligence/selected-requirement-brief";
import type { CaseDetail } from "../src/lib/interview-intelligence/runtime.functions";
const record = (kind: string, text: string) => ({ kind, passages: [{ index: 0, content: text }] });
describe("selected application citations in interview background", () => {
  it("counts selected CV and answer citations without treating other requirement sources as a CV", () => {
    assert.equal(
      countApplicationSourceReferences([
        record("employer_requirements", '{"source":{"kind":"application_cv"}}'),
        record("employer_requirements", '{"source":{"kind":"application_answer"}}'),
        record("employer_requirements", '{"source":{"kind":"external_reference"}}'),
        record("candidate_cv", '{"source":{"kind":"application_cv"}}'),
      ]),
      2,
    );
  });
  it("does not infer references from broken, null or plain text source content", () => {
    assert.equal(
      countApplicationSourceReferences([
        record("employer_requirements", "null"),
        record("employer_requirements", "application_cv"),
        record("employer_requirements", '{"source":null}'),
      ]),
      0,
    );
  });
  for (const lang of ["sv", "en"] as const) {
    it(`${lang}: a saved citation never claims that no candidate material was selected`, () => {
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <CandidateBackgroundStatus
            result={undefined}
            isLoading={false}
            savedSourceCount={0}
            savedReferenceCount={1}
          />
        </I18nProvider>,
      );
      assert.match(html, lang === "sv" ? /1 valda kravunderlag/ : /1 selected requirement records/);
      assert.doesNotMatch(
        html,
        lang === "sv" ? /Inget CV eller ansökningssvar/ : /No CV or application answer/,
      );
      assert.match(
        html,
        lang === "sv"
          ? /inte separata CV-kopior eller bekräftad/
          : /separate from attached CV copies and confirmed/,
      );
    });
  }
});

const selectedSource = (text: string): CaseDetail["sources"][number] => ({
  id: "selected-source",
  kind: "employer_requirements",
  label: "Test X",
  purposeCode: "recruitment_interview",
  origin: "employer_supplied",
  passageCount: 2,
  passages: [
    { id: "p2", index: 1, content: text.slice(25) },
    { id: "p1", index: 0, content: text.slice(0, 25) },
  ],
});
const selectedText = JSON.stringify({
  requirementId: "selected-requirement",
  profileId: "selected-profile",
  profileVersion: 2,
  state: "clarify",
  humanNote: "Datum behöver styrkas <script>unsafe</script>",
  neutralQuestion: "Vilket datum är intyget giltigt till?",
  nextAction: "Kontrollera originalintyget",
  source: { kind: "application_cv", label: "CV från ansökan" },
});
describe("saved requirement briefing", () => {
  it("reassembles transferred passages, preserves the human question and ignores other employer text", () => {
    const briefs = selectedRequirementBriefs([
      selectedSource("Vanlig arbetsgivaranteckning"),
      selectedSource(selectedText),
      selectedSource('{"profileVersion":2,"neutralQuestion":"Not an explicit transfer"}'),
    ]);
    assert.equal(briefs.length, 1);
    assert.equal(briefs[0].neutralQuestion, "Vilket datum är intyget giltigt till?");
    assert.equal(briefs[0].profileVersion, 2);
    assert.equal(briefs[0].sourceLabel, "CV från ansökan");
  });
  for (const lang of ["sv", "en"] as const) {
    it(`${lang}: saved notes and follow-up render without claiming confirmed evidence or replacing core questions`, () => {
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <SelectedRequirementBrief
            sources={[selectedSource(selectedText)]}
            employerSlug="synthetic"
            applicationId={null}
          />
        </I18nProvider>,
      );
      assert.match(html, /Vilket datum är intyget giltigt till\?/);
      assert.match(html, /Kontrollera originalintyget/);
      assert.match(
        html,
        lang === "sv" ? /Kravprofil version 2 vid överföringen/ : /profile version 2 at transfer/,
      );
      assert.match(
        html,
        lang === "sv" ? /inte bekräftad intervjuevidens/ : /not confirmed interview evidence/,
      );
      assert.match(
        html,
        lang === "sv" ? /ersätter inte rollguidens kärnfrågor/ : /does not replace the role guide/,
      );
      assert.doesNotMatch(html, /<script>/);
      assert.doesNotMatch(html, /"requirementId"|selected-profile/);
    });
  }
});
