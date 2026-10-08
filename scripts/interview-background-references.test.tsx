import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { countApplicationSourceReferences } from "../src/lib/interview-intelligence/background-source-references";
import { CandidateBackgroundStatus } from "../src/components/employer/interview/CandidateBackgroundStatus";
import { I18nProvider } from "../src/i18n/context";
import { SelectedRequirementBrief } from "../src/components/employer/interview/SelectedRequirementBrief";
import { selectedRequirementBriefs } from "../src/lib/interview-intelligence/selected-requirement-brief";
import { SavedCaseSources } from "../src/components/employer/interview/SavedCaseSources";
import { readFileSync } from "node:fs";
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

describe("readable case source targets", () => {
  const original: CaseDetail["sources"][number] = {
    ...selectedSource(""),
    id: "00000000-0000-4000-8000-000000000031",
    kind: "candidate_cv",
    label: "Original <candidate> material",
    passages: [
      { id: "second", index: 1, content: "Second line\n<script>unsafe</script>" },
      { id: "first", index: 0, content: "First <original> statement & evidence" },
    ],
  };
  const htmlOf = (lang: "sv" | "en", sources: CaseDetail["sources"]) =>
    renderToStaticMarkup(
      <I18nProvider initialLang={lang}>
        <SavedCaseSources sources={sources} />
      </I18nProvider>,
    );

  for (const lang of ["sv", "en"] as const) {
    it(`${lang}: the original link's exact target contains ordered, escaped saved text`, () => {
      const html = htmlOf(lang, [original]);
      const exactTarget = `id="source-${original.id}"`;
      assert.equal(html.split(exactTarget).length - 1, 1);
      assert.match(html, /Original &lt;candidate&gt; material/);
      assert.match(html, /First &lt;original&gt; statement &amp; evidence/);
      assert.match(html, /Second line\n&lt;script&gt;unsafe&lt;\/script&gt;/);
      assert.ok(html.indexOf("First &lt;original&gt;") < html.indexOf("Second line"));
      assert.match(html, /id="source-passage-first"/);
      assert.doesNotMatch(html, /<script>|dangerouslySetInnerHTML/);
      assert.match(
        html,
        lang === "sv" ? /inte bekräftad intervjuevidens/ : /not confirmed interview evidence/,
      );
      assert.match(html, lang === "sv" ? /återkallad delning/ : /sharing is withdrawn/);
    });
    it(`${lang}: selected requirements remain readable and do not expose the transport JSON`, () => {
      const html = htmlOf(lang, [selectedSource(selectedText)]);
      assert.match(html, /Vilket datum är intyget giltigt till\?/);
      assert.match(html, /Kontrollera originalintyget/);
      assert.match(html, /Datum behöver styrkas &lt;script&gt;unsafe&lt;\/script&gt;/);
      assert.match(html, /CV från ansökan/);
      assert.doesNotMatch(html, /"requirementId"|selected-profile|&quot;humanNote&quot;|<script>/);
    });
    it(`${lang}: unavailable passages are explicit and do not claim that no source exists`, () => {
      const html = htmlOf(lang, [{ ...original, passages: [] }]);
      assert.match(html, new RegExp(`id="source-${original.id}"`));
      assert.match(html, lang === "sv" ? /Inga läsbara textpassager/ : /No readable text passages/);
      assert.doesNotMatch(
        html,
        lang === "sv" ? /Inget underlag har sparats/ : /No material has been saved/,
      );
    });
  }

  it("prepare renders saved sources independently of its prep_generated / in_progress setup form", () => {
    const prepare = readFileSync(
      new URL(
        "../src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(prepare, /const setUp = \["draft", "sources_ready", "prep_generated"\]/);
    assert.equal((prepare.match(/<SavedCaseSources sources=\{d.sources\} \/>/g) ?? []).length, 1);
    assert.ok(prepare.indexOf("<SavedCaseSources") < prepare.indexOf("{setUp && ("));
    assert.doesNotMatch(prepare, /id=\{`source-\$\{s.id\}`\}/);
    const review = readFileSync(
      new URL("../src/components/recruitment/RequirementReviewPanel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(review, /hash=\{`source-\$\{selected.reference\}`\}/);
  });

  it("keeps the existing denied-case and case-scoped passage read boundary without a new data read", () => {
    const runtime = readFileSync(
      new URL("../src/lib/interview-intelligence/runtime.functions.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      runtime.indexOf('if (!caseRes.data) throw new Error("INTERVIEW_CASE_NOT_FOUND")') <
        runtime.indexOf("const frozen = await loadFrozenContent(db, caseId)"),
    );
    assert.match(runtime, /scp_interview_case_sources!inner\(case_id\)/);
    assert.match(runtime, /\.eq\("scp_interview_case_sources.case_id", caseId\)/);
    const panel = readFileSync(
      new URL("../src/components/employer/interview/SavedCaseSources.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      panel,
      /useQuery|useServerFn|\.rpc\(|\.from\(|fetch\(|dangerouslySetInnerHTML/,
    );
  });
});
