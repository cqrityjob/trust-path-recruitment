import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const route = read("src/routes/index.tsx");
const shell = read("src/components/patterns/PublicShell.tsx");
const layout = read("src/components/site/SiteLayout.tsx");
const failures: string[] = [];

function check(name: string, ok: boolean) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failures.push(name);
}

const ids = ["hero", "starting-point", "security-passport", "path", "employers", "record", "close"];
const positions = ids.map((id) => route.indexOf(`id="${id}"`));

console.log("public-homepage-check — premium foundation");
check(
  "seven narrative bands exist",
  positions.every((position) => position >= 0),
);
check(
  "bands appear in the approved order",
  positions.every((position, index) => index === 0 || position > positions[index - 1]!),
);
check("one homepage H1", (route.match(/<h1\b/g) ?? []).length === 1);
check(
  "Swedish proposition is exact",
  route.includes("Bättre karriärbeslut. Tryggare rekrytering."),
);
check(
  "English proposition is exact",
  route.includes("Better career decisions. More confident hiring."),
);
check("both locales are authored", route.includes("sv:") && route.includes("en:"));
check(
  "primary journey leads to Career Center",
  route.includes('to="/career-center" className="cq-button-primary"'),
);
check("Passport section is an in-page destination", route.includes('href="#security-passport"'));
check("record section is an in-page destination", route.includes('href="#record"'));
check(
  "no Passport creation CTA ships",
  !route.includes("/signup") && !route.includes("redirect=/passport"),
);
check("no missing public Passport route is linked", !route.includes('to="/security-passport"'));
check("no missing Career Discovery route is linked", !route.includes('to="/career-discovery"'));
check("employer CTA uses the existing landing", route.includes('to="/employers"'));
check(
  "AI decision boundary is present in Swedish",
  route.includes("AI ger beslutsstöd. Människor fattar besluten."),
);
check(
  "AI decision boundary is present in English",
  route.includes("AI provides decision support. People make the decisions."),
);
check(
  "eligibility boundary is present in both languages",
  route.includes("lämplig eller behörig") && route.includes("suitable or eligible"),
);
check(
  "cross-border limitation is explicit",
  route.includes("inte automatiskt erkänd") &&
    route.includes("does not make an authorisation recognised"),
);
check(
  "due-diligence limitation is explicit",
  route.includes("due diligence") && route.includes("background screening"),
);
check(
  "signed-in redirect remains",
  route.includes('navigate({ to: "/my-career", replace: true })'),
);
check(
  "SiteLayout delegates to PublicShell",
  layout.includes("<PublicShell>{children}</PublicShell>"),
);
check("PublicShell owns one main landmark", (shell.match(/<main\b/g) ?? []).length === 1);
check(
  "the visual scenes are language-aware",
  ["ExplorerScene", "PassportEntriesScene", "ConditionsScene"].every(
    (name) => route.includes(`<${name}`) && route.includes("lang={lang}"),
  ),
);

if (failures.length) {
  console.error(`\npublic-homepage-check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\npublic-homepage-check passed");
