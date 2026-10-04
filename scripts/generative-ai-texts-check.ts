// Launch (owner, 2026-10-04): version 1 has no generative AI, and no text a
// person reads may say otherwise.
//
// Run via `bun run generative-ai-texts:check`.
// Planted controls: `bun run negative-controls:generative-ai-texts`.
//
// The owner named three texts that promised AI the product does not offer:
// the home page, the CV button and the candidate's interview page. This guard
// holds those three at the owner's wording, in Swedish and English, and holds
// the rest of the surfaces a candidate or a visitor reads to the same rule:
//
//   * a public or candidate-facing text may not promise AI;
//   * the CV screens may mention AI only where the sentence says it is NOT
//     used, or where the control is shown only when generative AI is on;
//   * a new dictionary key that mentions AI outside the reviewed workspace
//     groups fails, so the next promise is caught when it is written;
//   * and the whole set of version-1 texts stands only while the server gate
//     is closed. If `GENERATIVE_AI_ENABLED` is ever true, this fails until the
//     texts have been revisited in the same change.
//
// What is NOT held here: the employer and staff workspaces (interview,
// recruitment, Security work), whose AI texts are conditional ("not activated")
// and sit behind switches that the gate now backs. They are listed below so
// that "reviewed" means a person looked, not that nobody checked.

import { readFileSync } from "node:fs";
import path from "node:path";
import { dictionaries } from "../src/i18n/dictionaries";
import { CV, CV_STATUS_NOTE } from "../src/components/professional-identity/cv-copy";
import { GENERATIVE_AI_ENABLED } from "../src/lib/ai/generative-ai-gate";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const fails: string[] = [];
let checks = 0;
function ck(label: string, cond: boolean, detail = ""): void {
  checks += 1;
  if (cond) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    fails.push(label);
  }
}

const AI = /\bAI\b|\bAI-|\bAI:|\bKI\b|\bGPT\b|språkmodell|language model|\bchatbot/i;
const d = dictionaries as unknown as Record<"sv" | "en", Record<string, string>>;

console.log("generative-ai-texts-check\n");

/* ------------------------------------------------------------------ */
/* 0 · The texts stand only while the gate is closed                   */
/* ------------------------------------------------------------------ */

console.log("0 · the version-1 texts and the server gate");
ck(
  "the version-1 texts stand only while the server gate is closed (revisit every text below before opening it)",
  GENERATIVE_AI_ENABLED === false,
);

/* ------------------------------------------------------------------ */
/* 1 · The three owner texts                                           */
/* ------------------------------------------------------------------ */

console.log("\n1 · the home page");
{
  ck(
    "sv: the positioning opens with the owner's sentence",
    d.sv["home.hero.subtitle"].startsWith(
      "Karriär, säkerhetsjobb och verifierbara meriter på ett ställe.",
    ),
    d.sv["home.hero.subtitle"],
  );
  ck(
    "en: the positioning opens with the same sentence in English",
    d.en["home.hero.subtitle"].startsWith(
      "Careers, security jobs and verifiable credentials in one place.",
    ),
    d.en["home.hero.subtitle"],
  );
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the hero positioning and the individual entrance mention no AI`,
      !AI.test(d[lang]["home.hero.subtitle"]) && !AI.test(d[lang]["home.hero.individual.body"]),
      `${d[lang]["home.hero.subtitle"]} | ${d[lang]["home.hero.individual.body"]}`,
    );
  }
}

console.log("\n2 · the CV");
{
  ck(
    "the CV button reads “Skapa nytt CV-utkast” / “Create a new CV draft”",
    CV.regenerate.sv === "Skapa nytt CV-utkast" && CV.regenerate.en === "Create a new CV draft",
    `${CV.regenerate.sv} / ${CV.regenerate.en}`,
  );

  const saved = read("src/routes/_authenticated.my-career.cv.$cvId.tsx");
  const gateAt = saved.indexOf("{GENERATIVE_AI_ENABLED ? (");
  const assistedAt = saved.indexOf("CV.regenerateAssisted");
  const linkAt = saved.indexOf("data-cv-new-draft");
  const toAt = saved.indexOf('to="/my-career/cv/new"');
  const labelAt = saved.indexOf("L(CV.regenerate, l)");
  ck(
    "the AI draft button is shown only when generative AI is on",
    gateAt > -1 && assistedAt > gateAt && assistedAt < linkAt,
    "CV.regenerateAssisted must sit inside the GENERATIVE_AI_ENABLED branch, before the link",
  );
  ck(
    "otherwise \u201cSkapa nytt CV-utkast\u201d is a link to the creator, which builds a draft from the person's facts",
    linkAt > assistedAt && toAt > -1 && toAt < labelAt && Math.abs(toAt - linkAt) < 200,
  );
  ck(
    "the creator builds a CV without any AI draft: the preview is the fact-based document",
    read("src/lib/professional-identity/cv/cv.functions.ts").includes("document: factual,") &&
      /provider_unavailable/.test(read("src/lib/professional-identity/cv/generation.ts")),
  );

  const creator = read("src/routes/_authenticated.my-career.cv.new.tsx");
  ck(
    "the creator does not show “AI not available” as a notice: no engine is the ordinary state",
    creator.includes('outcome.status !== "provider_unavailable"'),
  );

  // Every CV sentence that mentions AI is one of the reviewed ones.
  const REVIEWED: Record<string, string> = {
    // Legacy rows whose draft was written with a model; none can be created in version 1.
    aiAssistedLabel: "label for a saved CV that was drafted with a model before version 1",
    factualLabel: "says the CV was built without AI",
    builtWithoutAi: "says the CV was built without AI",
    aiNotice: "says nothing is sent to an AI service",
    regenerateAssisted: "the AI-only button, shown only when generative AI is on",
    proposalBody: "text of the AI suggestion, reachable only through that button",
  };
  const unreviewed: string[] = [];
  for (const [key, value] of Object.entries(CV)) {
    const text = `${value.sv} ${value.en}`;
    if (AI.test(text) && !(key in REVIEWED)) unreviewed.push(key);
  }
  ck(
    "every CV sentence that mentions AI is a reviewed one",
    unreviewed.length === 0,
    unreviewed.join(", "),
  );
  ck(
    "the notice before the preview says no information is sent to an AI service",
    /Inga uppgifter skickas till någon AI-tjänst/.test(CV.aiNotice.sv) &&
      /No information is sent to any AI service/.test(CV.aiNotice.en) &&
      !/skickas till den AI-tjänst som är konfigurerad|sent to the AI service configured/.test(
        `${CV.aiNotice.sv} ${CV.aiNotice.en}`,
      ),
    `${CV.aiNotice.sv} / ${CV.aiNotice.en}`,
  );
  ck(
    "the language help does not speak of an AI draft",
    !AI.test(CV.languageHelp.sv) && !AI.test(CV.languageHelp.en),
  );
  ck(
    "“no AI engine” reads as the ordinary state, not as an outage",
    !AI.test(CV_STATUS_NOTE.provider_unavailable.sv) &&
      !AI.test(CV_STATUS_NOTE.provider_unavailable.en),
    `${CV_STATUS_NOTE.provider_unavailable.sv} / ${CV_STATUS_NOTE.provider_unavailable.en}`,
  );
}

console.log("\n3 · the candidate's interview page");
{
  const page = read("src/routes/_authenticated.my-career.interviews.$caseId.tsx");
  ck(
    "sv: the page says the owner's two sentences",
    page.includes(
      "Arbetsgivaren använder ett strukturerat metodstöd för intervjun och bedömningen. Det är en människa som granskar underlaget och fattar beslut.",
    ),
  );
  ck(
    "en: the page says the same in English",
    page.includes(
      "The employer uses a structured method aid for the interview and the assessment. A person reviews the material and makes the decision.",
    ),
  );
  ck(
    "the candidate sees no sentence about an AI assistant",
    !/Ett AI-stöd hjälper|An AI assistant helps/.test(page) &&
      !/\bAI\b/.test(page.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
  );
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the notice element that says what the method is no longer says AI proposes material`,
      !AI.test(d[lang]["iin.el.aiProposes"]),
      d[lang]["iin.el.aiProposes"],
    );
  }
}

/* ------------------------------------------------------------------ */
/* 4 · No new promise in the dictionary                                */
/* ------------------------------------------------------------------ */

console.log("\n4 · dictionary keys that mention AI");
{
  // The groups reviewed on 2026-10-04. Each is a workspace behind a switch or
  // a sentence that says AI is not used; none is a public or candidate page.
  const REVIEWED_GROUPS = [
    "securityWorkPage.", // public page: says the AI support is NOT yet activated
    "employers.disclaimer", // public: says AI does not decide
    "employer.candidate.structuredInterview.", // employer: a count of proposals awaiting review (none in version 1)
    "beskt.noticeVetting", // staff: assessment notice
    "academy.reviews.", // staff: review workspace, "AI support is not enabled"
    "ii.", // employer interview workspace
    "iiu.", // employer interview workspace
    "iir.", // employer interview report
    "iin.el.", // candidate-notice element labels (aiDoesNotDecide)
    "rec.", // employer recruitment workspace
    "sw.", // Security work workspace
  ];
  for (const lang of ["sv", "en"] as const) {
    const stray = Object.entries(d[lang])
      .filter(([key, value]) => typeof value === "string" && AI.test(value))
      .map(([key]) => key)
      .filter((key) => !REVIEWED_GROUPS.some((g) => key.startsWith(g)));
    ck(
      `${lang}: no public text promises AI (every key that mentions it is in a reviewed group)`,
      stray.length === 0,
      stray.join(", "),
    );
  }

  // The two public sentences that still speak of AI say it is not activated.
  for (const lang of ["sv", "en"] as const) {
    const body = d[lang]["securityWorkPage.status"];
    ck(
      `${lang}: the public Security work page says the AI support is not activated`,
      lang === "sv"
        ? /ännu inte aktiverat/.test(body)
        : /not yet activated|not activated/.test(body),
      body,
    );
  }

  // The About page and the individual entrance do not list AI as something
  // the product offers.
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the About page's trust paragraph does not list AI support as a product`,
      !AI.test(d[lang]["about.trust.body"]),
      d[lang]["about.trust.body"],
    );
  }
}

console.log("");
if (fails.length) {
  console.error(`generative-ai-texts: ${fails.length} failure(s) of ${checks} checks`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`generative-ai-texts: all ${checks} checks passed`);
