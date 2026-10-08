import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { countApplicationSourceReferences } from "../src/lib/interview-intelligence/background-source-references";
import { CandidateBackgroundStatus } from "../src/components/employer/interview/CandidateBackgroundStatus";
import { I18nProvider } from "../src/i18n/context";
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
