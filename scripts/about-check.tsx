import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const about = read("src/routes/about.tsx");
const employers = read("src/routes/employers.tsx");
const contact = read("src/routes/contact.tsx");
const failures: string[] = [];

function check(name: string, ok: boolean) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failures.push(name);
}

console.log("about-check — premium public landings");
check("about has one h1", (about.match(/<h1\b/g) ?? []).length === 1);
check(
  "about ships six sourced sections",
  [
    "Säkerhet är inte ett yrke — det är många",
    "Varför CQrityjob skapades",
    "Bara säkerhetsbranschen",
    "Plattformen",
    "Mänskligt omdöme och AI",
    "Underlag, noggrannhet och öppenhet",
  ].every((heading) => about.includes(heading)) &&
    !about.includes("Var vi står i dag") &&
    !about.includes("Where we stand today"),
);
check(
  "about is bilingual",
  about.includes("Därför finns CQrityjob") && about.includes("Why CQrityjob exists"),
);
check(
  "about keeps the AI boundary",
  about.includes("AI ger beslutsstöd. Människor fattar besluten.") &&
    about.includes("AI provides decision support. People make the decisions."),
);
check("employers has one h1", (employers.match(/<h1\b/g) ?? []).length === 1);
check(
  "four employer services are authored",
  ["Rekrytering", "Kompetensbedömning", "Strukturerade intervjuer", "Kompetensutveckling"].every(
    (item) => employers.includes(`"${item}"`),
  ),
);
check(
  "employer tiles are unlinked",
  !employers.includes('to="/employers/') && !employers.includes('href="/employers/'),
);
check(
  "employer availability is honest",
  employers.includes("Under uppbyggnad") && employers.includes("In development"),
);
check(
  "employer decision boundary is bilingual",
  employers.includes("rangordnar inte kandidater") &&
    employers.includes("does not rank candidates"),
);
check("contact has one h1", (contact.match(/<h1\b/g) ?? []).length === 1);
check(
  "contact has no inert form",
  !contact.includes("<form") && !contact.includes("preventDefault"),
);
check("contact uses the working direct route", contact.includes("mailto:info@cqrityjob.com"));
check(
  "contact sets a response expectation",
  contact.includes("två arbetsdagar") && contact.includes("two working days"),
);
check(
  "contact warns against sensitive email",
  contact.includes("säkerhetskänsliga personuppgifter") &&
    contact.includes("security-sensitive personal data"),
);
check(
  "all three routes use premium bands",
  [about, employers, contact].every((source) => source.includes("<SectionBand")),
);

if (failures.length) {
  console.error(`\nabout-check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nabout-check passed");
