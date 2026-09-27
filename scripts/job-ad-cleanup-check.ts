import { cleanAdText } from "../src/components/jobs/JobAdContent";
let fail = 0;
const eq = (name: string, got: string, want: string) => {
  if (got !== want) {
    fail++;
    console.error(`FAIL ${name}: ${JSON.stringify(got)} !== ${JSON.stringify(want)}`);
  }
};
eq(
  "placeholder-only sv",
  cleanAdText("[Beskriv arbetsuppgifterna och arbetsplatsen]", "Om rollen"),
  "",
);
eq(
  "placeholder-only en",
  cleanAdText("  [Describe the duties and the workplace] \n", "About the role"),
  "",
);
eq("unknown bracket kept", cleanAdText("[B-körkort krävs]", "Om rollen"), "[B-körkort krävs]");
eq(
  "mixed kept",
  cleanAdText("Du arbetar [dag/natt] i Göteborg.\n\n[B-körkort krävs]", "Om rollen"),
  "Du arbetar [dag/natt] i Göteborg.\n\n[B-körkort krävs]",
);
eq("opening heading removed", cleanAdText("Om rollen\nText här.", "Om rollen"), "Text här.");
eq(
  "later heading kept",
  cleanAdText("Intro.\nOm rollen\nMer.", "Om rollen"),
  "Intro.\nOm rollen\nMer.",
);
if (fail) {
  console.error(`job-ad-cleanup: ${fail} failed`);
  process.exit(1);
}
console.log("job-ad-cleanup:check OK (6 assertions)");
