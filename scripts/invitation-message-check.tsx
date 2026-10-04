import { strict as assert } from "node:assert";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider, LanguageScope } from "../src/i18n/context";
import { InvitationMessageBody } from "../src/components/recruitment/InvitationMessageBody";
import { assessmentMessagePath } from "../src/lib/recruitment/assessment-message-path";
import { PRODUCTION_ORIGIN } from "../src/lib/site-origin";

const id = "11111111-1111-4111-8111-111111111111";
assert.equal(assessmentMessagePath(`${PRODUCTION_ORIGIN}/academy/${id}`), `/academy/${id}`);
assert.equal(assessmentMessagePath(`${PRODUCTION_ORIGIN}/academy`), "/academy");
for (const unsafe of [
  "javascript:alert(1)",
  "https://evil.example/academy",
  `${PRODUCTION_ORIGIN}.evil.example/academy`,
  "https://www.cqrityjob.com@evil.example/academy",
  `${PRODUCTION_ORIGIN}/academy/../../admin`,
  `${PRODUCTION_ORIGIN}/academy?redirect=https://evil.example`,
  `${PRODUCTION_ORIGIN}/academy#secret`,
]) {
  assert.equal(assessmentMessagePath(unsafe), null, unsafe);
}
for (const lang of ["sv", "en"] as const) {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <LanguageScope lang={lang}>
        <InvitationMessageBody
          body={`<img src=x onerror=alert(1)>\n${PRODUCTION_ORIGIN}/academy/${id}`}
        />
      </LanguageScope>
    </I18nProvider>,
  );
  assert.ok(html.includes(`href="/academy/${id}"`));
  assert.ok(html.includes(lang === "sv" ? "Öppna testet" : "Open the test"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
}
console.log("Invitation message destination and safe rendering checks passed (SV/EN).");
