import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AbuDhabiIssuerAttribution } from "../src/components/security-passport/AbuDhabiIssuerAttribution";

for (const role of ["GUARD", "CIT", "BANKS", "EVENT", "SUPERVISOR", "MANAGER", "TRAINER"]) {
  for (const lang of ["sv", "en"]) {
    const markup = renderToStaticMarkup(
      <AbuDhabiIssuerAttribution code={`AE_AZ_PSBD_LICENCE_${role}`} lang={lang} />,
    );
    assert.match(markup, /data-abu-dhabi-issuer-attribution/);
    assert.match(markup, lang === "sv" ? /har inte kontrollerats/ : /has not been checked/);
    assert.match(markup, lang === "sv" ? /granskningen är inte klar/ : /legal review is pending/);
    assert.match(markup, lang === "sv" ? /ingen rätt att arbeta/ : /no right to work/);
  }
}
for (const code of [null, "VU1", "AE_DU_SIRA_CARD_GUARD", "INTL_ASIS_CPP"])
  assert.equal(renderToStaticMarkup(<AbuDhabiIssuerAttribution code={code} lang="en" />), "");
for (const file of [
  "InternationalCredentialForm.tsx",
  "ClaimRow.tsx",
  "live/ReviewDefinitionFacts.tsx",
  "live/RecipientCredentialList.tsx",
])
  assert.match(
    readFileSync(`src/components/security-passport/${file}`, "utf8"),
    /<AbuDhabiIssuerAttribution code=/,
  );
console.log(
  "Abu Dhabi source attribution: all seven definitions, both languages and four issuer surfaces pass; other credentials unchanged",
);
