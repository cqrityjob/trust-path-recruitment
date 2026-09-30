// The Passport card's ground, and the homepage's use of it.
//
// ── WHAT THIS GUARDS ───────────────────────────────────────────────────
//
// The card wore four different decorations on four surfaces: diagonal stripes
// and a grid on the overview and the homepage, a wave engraving on the shared
// card, concentric circles in the exported image. The owner's finish is ONE
// quiet ground — deep navy, a subtle tonal gradient, a hairline border, a soft
// shadow — with nothing drawn behind text, shields or a QR code.
//
// One token (PASSPORT_CARD_SURFACE) is the source of truth. CSS cannot import
// it, so `src/styles.css` MIRRORS it; this guard is what stops the mirror
// drifting, and what stops a pattern coming back on any surface.
//
// It also guards the homepage's illustrative Passport card, which used to be a
// separate imitation of the Passport with decorative trust facts and copy that
// advertised the Passport as the editor for employment history. Since the
// locked public website (2026-09-30) the homepage only points to the Passport
// ("HOMEPAGE = BREADTH. SUBPAGE = DEPTH."), and the illustrative card sits in
// the hero of the Passport's own public page, /security-passport, as an
// example only: the page, not the card, carries the heading and the action,
// and the card holds no control at all.
//
// Run: bun run passport-card-surface:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASSPORT_CARD_SURFACE,
  passportCardBackground,
  passportCardSvgStops,
} from "../src/lib/security-passport/design/trust-system";
import { dictionaries } from "../src/i18n/dictionaries";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");

const failures: string[] = [];
let assertions = 0;
function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

/* ------------------------------------------------------------------ */
console.log("\n1 · one ground, and the CSS mirror has not drifted");

const css = code(read("src/styles.css"));
const signature = css.match(/@utility passport-signature \{([\s\S]*?)\n\}/)?.[1] ?? "";
const frame = css.match(/@utility passport-card-frame \{([\s\S]*?)\n\}/)?.[1] ?? "";
const s = PASSPORT_CARD_SURFACE;
const expectedGradient = `linear-gradient(${s.angle}deg, ${s.stops
  .map((x) => `${x.color.toLowerCase()} ${Math.round(x.offset * 100)}%`)
  .join(", ")})`;
check(
  signature.toLowerCase().includes(expectedGradient),
  `styles.css draws the token's gradient: ${expectedGradient}`,
);
check(
  passportCardBackground().toLowerCase() === expectedGradient,
  "and an inline-styled card draws the identical one",
);
check(
  s.stops.every((x) => passportCardSvgStops().includes(`stop-color="${x.color}"`)) &&
    (passportCardSvgStops().match(/<stop /g) ?? []).length === s.stops.length,
  "and so does an exported image",
);
check(
  frame.includes(s.border.replace(/\s+/g, " ")) &&
    s.shadow.split(/,\s*(?=\d)/).every((part) => frame.replace(/\s+/g, " ").includes(part.trim())),
  "the frame utility carries the token's hairline border and soft shadow",
);

/* ------------------------------------------------------------------ */
console.log("\n2 · nothing is drawn behind the card any more");

check(
  !/repeating-linear-gradient/.test(signature) && !/url\(/.test(signature),
  "the ground has no stripes and no image",
);
check(!/@utility passport-grid/.test(css), "the grid utility is gone");
check(
  !/--passport-(line|glow)/.test(css),
  "and so are the two variables that only the patterns used",
);
for (const file of [
  "src/components/security-passport/CredentialWallet.tsx",
  "src/components/security-passport/SecurityPassportPreview.tsx",
  "src/components/security-passport/CredentialRecord.tsx",
  "src/components/site/HomePassportPreview.tsx",
]) {
  check(!/passport-grid/.test(code(read(file))), `${file.split("/").pop()} mounts no grid layer`);
}
const recipient = code(read("src/components/security-passport/live/RecipientPassportCard.tsx"));
check(
  /background: passportCardBackground\(\)/.test(recipient) &&
    /PASSPORT_CARD_SURFACE\.border/.test(recipient) &&
    /PASSPORT_CARD_SURFACE\.shadow/.test(recipient) &&
    !/EngravedField/.test(recipient),
  "the shared card takes the token's ground, border and shadow, with no engraving",
);
const frameSrc = code(read("src/components/security-passport/social/SocialFrame.tsx"));
check(
  /background: passportCardBackground\(\)/.test(frameSrc) && !/EngravedField/.test(frameSrc),
  "the social preview does the same",
);
// Two exported images: the generic link preview (social-export.ts) and the
// holder's own card, drawn once for preview and download (SocialCardSvg).
const exportSrc = code(read("src/lib/security-passport/social-export.ts"));
const cardSvgSrc = code(read("src/components/security-passport/social/SocialCardSvg.tsx"));
check(
  (exportSrc.match(/passportCardSvgStops\(\)/g) ?? []).length === 1 &&
    (cardSvgSrc.match(/passportCardSvgStops\(\)/g) ?? []).length === 1 &&
    ![exportSrc, cardSvgSrc].some(
      (src) =>
        /engraving\(|EngravedField|Rosette/.test(src) ||
        /<circle[^>]*stroke-opacity="0\.0/.test(src),
    ),
  "both exported images use the token's stops and draw no engraving behind the QR code",
);
for (const file of [
  "src/components/security-passport/CredentialWallet.tsx",
  "src/components/security-passport/SecurityPassportPreview.tsx",
  "src/components/site/HomePassportPreview.tsx",
]) {
  const src = code(read(file));
  check(
    /passport-signature passport-card-frame/.test(src),
    `${file.split("/").pop()} is a framed card on the shared ground`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3 · the homepage panel is the real system, and the example says it is one");

const home = code(read("src/components/site/HomePassportPreview.tsx"));
// The ONE-Passport model (2026-09-29): the example is drawn by the same
// grouped shields the exported Passport image uses, from controlled scopes --
// an international group, Sweden with several shields, and Great Britain.
check(
  /<PassportGroupedShields/.test(home) &&
    /global: true/.test(home) &&
    /jurisdictionCode: "SE"/.test(home) &&
    /jurisdictionCode: "GB"/.test(home) &&
    !/<CredentialConstellation/.test(home),
  "it draws the shared grouped shields: one international group, Sweden and Great Britain",
);
check(
  !/state: "verified"/.test(home) &&
    !/BadgeCheck|CheckCircle|ShieldCheck|Star\b/.test(home) &&
    !/<img\b/.test(home),
  "no example shield is verified, and there is no tick, star or logo",
);
check(
  // The label must be the VISIBLE content of the labelled span, and the
  // caption both a visible <figcaption> and the figure's accessible name —
  // a loose "key exists" test would pass with either missing.
  /data-home-passport-example-label[^>]*>\s*\{t\("home\.passportPreview\.exampleLabel"\)\}\s*<\/span>/.test(
    home,
  ) &&
    /aria-label=\{t\("home\.passportPreview\.exampleCaption"\)\}/.test(home) &&
    /<figcaption[^>]*data-home-passport-example-caption[^>]*>\s*\{t\("home\.passportPreview\.exampleCaption"\)\}\s*<\/figcaption>/.test(
      home,
    ),
  "the card is visibly labelled an example, and its caption and accessible name say it is fictional",
);
check(
  !/\{action\}/.test(home) && !/<(Link|PrimaryLink|a|button)\b/.test(home) && !/\bhref=/.test(home),
  "the illustrative card holds no control — nobody can read an action as one ON a fictional record",
);
check(
  !/home\.passportPreview\.(issuer|source|jurisdiction|marketScope|trustState|sharing)\b/.test(
    home,
  ) &&
    !/home\.trust\.documented/.test(home) &&
    /home\.passportPreview\.statusNote/.test(home),
  'the decorative "Documented source" / "Trust state" facts are replaced by the status explanation',
);

// The Passport's own sentences: the homepage card's and the public page's
// lead. Certifications, licences and authorisations -- and nothing else.
// Employment history is the CV's; personal details and current profession
// are the Profile's.
const COPY = {
  sv: {
    // Brand story, 2026-09-30: the Passport is the professional profile that
    // can move with a person -- its credentials, never their work history.
    card: "Samla och visa de meriter som bygger din professionella säkerhetsprofil.",
    lead: "Under en karriär samlar du på dig licenser, certifieringar och andra meriter. Security Passport samlar dem i en professionell säkerhetsprofil som kan följa med dig mellan roller, arbetsgivare och marknader – med underlag och en tydlig status för varje uppgift. Du bestämmer vad som delas och med vem.",
    documentIsNotVerification: "Ett dokument är inte en verifiering.",
    label: "Exempel",
  },
  en: {
    card: "Bring together and present the credentials behind your professional security profile.",
    lead: "Over a career you collect licences, certifications and other credentials. Security Passport brings them together in a professional security profile that can go with you across roles, employers and markets – with supporting evidence and a clear status for every entry. You decide what is shared, and with whom.",
    documentIsNotVerification: "A document is not a verification.",
    label: "Example",
  },
} as const;
for (const lang of ["sv", "en"] as const) {
  const d = dictionaries[lang] as Record<string, string>;
  check(
    d["home.individual.passport.body"] === COPY[lang].card &&
      d["passportPage.lead"] === COPY[lang].lead,
    `${lang} · the Passport sentences are the approved ones, to the letter`,
  );
  check(
    d["passportPage.status.documentProvided.body"].includes(COPY[lang].documentIsNotVerification),
    `${lang} · an uploaded document is said not to be a verification`,
  );
  const pitch = Object.keys(d).filter(
    (k) => k === "home.individual.passport.body" || k.startsWith("passportPage."),
  );
  for (const key of pitch) {
    check(
      !/erfarenhet|utbildning|anställning|experience|education|employment|work history/i.test(
        d[key],
      ),
      `${lang} · "${key}" does not advertise the Passport as the editor for CV or Profile content`,
    );
  }
  check(
    d["home.passportPreview.exampleLabel"] === COPY[lang].label &&
      /(påhittad|fictional)/i.test(d["home.passportPreview.exampleCaption"]),
    `${lang} · "${COPY[lang].label}", and the caption says the person is made up`,
  );
  check(
    /(egen status|own status)/i.test(d["home.passportPreview.statusNote"]) &&
      /(är inte verifierad|is not verified)/i.test(d["home.passportPreview.statusNote"]),
    `${lang} · registration alone is said not to be verification`,
  );
  for (const gone of ["source", "trustState", "issuer", "marketScope", "sharing", "jurisdiction"]) {
    if (`home.passportPreview.${gone}` in d) failures.push(`${lang} · stale key ${gone} remains`);
  }
  assertions += 1;
}
const route = code(read("src/routes/security-passport.index.tsx"));
check(
  /to="\/signup"\s+search=\{PASSPORT_INTENT\}/.test(route) &&
    /PASSPORT_INTENT[^;]*redirect: "\/passport"/s.test(route),
  "the action enters registration and carries the Passport destination through it",
);
{
  // The page's action sits beside, and outside, the example card.
  const action = route.indexOf("search={PASSPORT_INTENT}");
  const example = route.indexOf("<HomePassportPreview />");
  check(
    action !== -1 && example !== -1 && action < example,
    "the Passport page's own action is rendered outside the illustrative card",
  );
}
check(
  !code(read("src/components/site/HomeSections.tsx")).includes("HomePassportPreview") &&
    !code(read("src/routes/index.tsx")).includes("HomePassportPreview"),
  "the homepage does not explain the Passport in depth -- it links to the Passport's own page",
);

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`passport-card-surface-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Passport card surface: ${assertions} of ${assertions} assertions passed.`);
