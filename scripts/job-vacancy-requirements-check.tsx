import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { VacancyRequirementsContent } from "../src/components/jobs/VacancyRequirementsContent";

const requirements = [
  {
    key: "draft-mandatory",
    kind: "mandatory" as const,
    label_sv: "Erfarenhet av riskarbete",
    label_en: "Risk management experience",
  },
  { key: "draft-desirable", kind: "desirable" as const, label_sv: "B-körkort", label_en: null },
];
for (const lang of ["sv", "en"] as const) {
  const render = (rows: typeof requirements) =>
    renderToStaticMarkup(
      <I18nProvider initialLang={lang}>
        <VacancyRequirementsContent requirements={rows} />
      </I18nProvider>,
    );
  const draft = render(requirements);
  const published = render(
    requirements.map(({ key, ...row }) => ({ ...row, id: key })) as unknown as typeof requirements,
  );
  assert.equal(draft, published, `${lang}: draft and saved requirements must render identically`);
  assert.match(draft, lang === "sv" ? /Erfarenhet av riskarbete/ : /Risk management experience/);
  assert.match(
    draft,
    /B-körkort/,
    "A missing translation must preserve the employer's other language",
  );
  assert.equal(
    (draft.match(/<h3/g) ?? []).length,
    2,
    "Mandatory and desirable requirements retain their group headings",
  );
  assert.equal(render([]), "", "No requirements must not create an empty public section");
}
const form = readFileSync(
  new URL("../src/components/employer/EmployerJobForm.tsx", import.meta.url),
  "utf8",
);
const preview = readFileSync(
  new URL("../src/components/employer/job-form/JobAdPreview.tsx", import.meta.url),
  "utf8",
);
assert.match(
  form,
  /requirements=\{structure\.requirements\}/,
  "The preview receives unsaved requirement edits",
);
assert.match(
  preview,
  /<JobAdSections job=\{job\}/,
  "Legacy and prose content remains visible alongside structured requirements",
);
assert.match(preview, /<VacancyRequirementsContent requirements=\{requirements\}/);
console.log("job-vacancy-requirements:check OK (preview parity, groups, fallback, empty states)");
