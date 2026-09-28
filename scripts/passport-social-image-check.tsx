// Security Passport — the social image, asserted without a browser.
//
// Run: bun run passport-social-image:check
//
// The image a holder downloads from "Dela på sociala medier" is SocialCardSvg,
// the same drawing SocialFrame previews. This renders it for every format and
// both languages and asserts what it may and may not carry:
//
//   * the SELECTED credentials only, each at the state the shared
//     presentation gave it -- never raised to verified -- with its flag or
//     globe and its written scope;
//   * no link and no QR code unless the model carries a link, and then the
//     link as printed text beside exactly the QR it was given;
//   * a "snapshot" line whenever there is no link, because a cached image
//     outlives what it shows;
//   * nothing drawn outside its own canvas.
//
// The browser walk (e2e/passport-public-pilot-local.spec.ts, case S) proves the
// download is the preview pixel for pixel; this is the fast, structural half.

import { renderToStaticMarkup } from "react-dom/server";
import { SocialCardSvg } from "../src/components/security-passport/social/SocialCardSvg";
import { SHARE_FORMATS } from "../src/lib/security-passport/social-export";
import { socialImageStrings } from "../src/lib/security-passport/share-image";
import {
  buildSelectedSocialCard,
  SOCIAL_CREDENTIAL_LIMIT,
  type SocialCardModel,
} from "../src/lib/security-passport/social";
import type { RecipientCredential } from "../src/lib/security-passport/recipient-presentation";
import { passportT, type PassportLang } from "../src/lib/security-passport/i18n";
import { deriveVerifiedIdentity } from "../src/lib/security-passport/identity/visibility";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import type { PassportHolder } from "../src/lib/security-passport/types";

let assertions = 0;
const errors: string[] = [];
function expect(ok: boolean, message: string): void {
  assertions += 1;
  if (!ok) errors.push(message);
}

const holder: PassportHolder = {
  id: "h-social",
  displayName: "Nadia Fiktiv",
  professionSlug: "vaktare",
  identity: deriveVerifiedIdentity([], MIRRORED_TITLE_RULES, "2026-09-28"),
  jurisdictionCode: "AE",
  subJurisdictionCode: "AE-DU",
  periods: [],
  claims: [],
  hasCareerDiscoveryResult: false,
};

/** A credential as the shared presentation hands it over. Only the fields the
 *  image reads are meaningful; the rest would be the payload's. */
function presented(key: string, over: Partial<RecipientCredential>): RecipientCredential {
  return {
    key,
    title: "Credential",
    code: null,
    presentation: "documented",
    lifecycle: "active",
    statusWordKey: "trust.level.documented",
    definitionScope: "national",
    jurisdiction: null,
    subJurisdiction: null,
    ...over,
  } as unknown as RecipientCredential;
}

const SIRA = presented("c0", {
  title: "SIRA Security Cadre Card — Security Guard",
  code: "AE_DU_SIRA_CARD_GUARD",
  jurisdiction: "AE",
  subJurisdiction: "AE-DU",
});
const OWN = presented("c1", {
  title: "Väktarutbildning 1",
  code: "VU1",
  presentation: "self_declared",
  statusWordKey: "assertion.self_declared",
  jurisdiction: "SE",
});
const CPP = presented("c2", {
  title: "Certified Protection Professional",
  code: "INTL_ASIS_CPP",
  definitionScope: "global",
});
const NOT_STATED = presented("c3", { title: "A course nobody placed", code: null });
const LAPSED = presented("c4", {
  title: "An expired licence",
  presentation: "expired",
  lifecycle: "expired",
  statusWordKey: "lifecycle.expired",
});

const LINK = `https://app.example/p#${"ab".repeat(32)}`;
const QR = "data:image/png;base64,iVBORw0KGgo=";

function card(
  credentials: readonly RecipientCredential[],
  verifyUrl: string | null,
  lang: PassportLang,
): SocialCardModel {
  return buildSelectedSocialCard(holder, "2026-09-28", credentials, {
    privacyMode: "full_name",
    anonymousLabel: passportT("share.anonymousLabel", lang),
    verifyUrl,
  });
}

function draw(model: SocialCardModel, format: string, lang: PassportLang, qr: string | null) {
  const pt = (key: Parameters<typeof passportT>[0]) => passportT(key, lang);
  return renderToStaticMarkup(
    <SocialCardSvg
      model={model}
      format={format as (typeof SHARE_FORMATS)[number]["id"]}
      lang={lang}
      strings={socialImageStrings(model, lang, pt)}
      qrDataUrl={qr}
    />,
  );
}

const textOf = (svg: string) =>
  [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? "");

// ── What is drawn, and at which state ─────────────────────────────────────
{
  const model = card([SIRA, OWN, CPP, NOT_STATED, LAPSED], null, "sv");
  expect(
    model.credentials.length === SOCIAL_CREDENTIAL_LIMIT &&
      model.credentials.map((c) => c.id).join(",") === "c0,c1,c2",
    "the image draws at most three credentials, in the order given",
  );
  expect(
    card([LAPSED], null, "sv").credentials.length === 0,
    "a credential that is no longer current is never drawn",
  );
  expect(
    model.verifiedCredentials.length === 0 &&
      model.credentials.every((c) => c.state !== "verified"),
    "nothing is raised to verified for the image",
  );

  const svg = draw(model, "square", "sv", null);
  const words = textOf(svg).join("\n");
  expect(
    /data-shield-mark="documented"/.test(svg) && /data-shield-mark="self_declared"/.test(svg),
    "each shield wears its own state",
  );
  expect(
    words.includes("DOKUMENTERAD") && words.includes("EGENRAPPORTERAD"),
    "each credential carries its own truthful word",
  );
  expect(!/VERIFIERAD|KÄLLBEKRÄFTAD/.test(words), "no verified word where nothing is verified");
  expect(
    /data-flag="AE"/.test(svg) && words.includes("Dubai, UAE"),
    "a Dubai credential wears the UAE flag and says Dubai",
  );
  expect(
    /data-scope-mark="globe"/.test(svg) && words.includes("Global"),
    "a global certification wears the globe and says so",
  );
  expect(words.includes("SIRA") && words.includes("CPP"), "shields carry their abbreviations");
  expect(
    !words.includes("A course nobody placed") && !words.includes("An expired licence"),
    "nothing beyond the three drawn credentials appears",
  );
}

// ── No link unless the model carries one ─────────────────────────────────
for (const lang of ["sv", "en"] as const) {
  const none = card([SIRA], null, lang);
  const linked = card([SIRA], LINK, lang);
  for (const spec of SHARE_FORMATS) {
    const plain = draw(none, spec.id, lang, QR);
    // A sentence may wrap onto several lines; read the lines as one text.
    const plainWords = textOf(plain).join(" ");
    expect(
      !/<image\b/.test(plain) && !plain.includes("/p#") && !plain.includes(QR),
      `${lang}/${spec.id}: no link and no QR code when the model carries none, even with a QR to hand`,
    );
    expect(
      plainWords.includes(passportT("social.snapshotNote", lang)) &&
        !plainWords.includes(passportT("card.verifyAtSource", lang)),
      `${lang}/${spec.id}: an image without a link says it is a snapshot`,
    );

    const withLink = draw(linked, spec.id, lang, QR);
    const joined = textOf(withLink).join("");
    expect(
      new RegExp(`<image\\b[^>]*href="${QR.replace(/[+/=.]/g, "\\$&")}"`).test(withLink),
      `${lang}/${spec.id}: a chosen link draws exactly the QR code it was given`,
    );
    expect(joined.includes(LINK), `${lang}/${spec.id}: and prints the link itself`);
    expect(
      textOf(withLink).join(" ").includes(passportT("card.verifyAtSource", lang)) &&
        !textOf(withLink).join(" ").includes(passportT("social.snapshotNote", lang)),
      `${lang}/${spec.id}: and says to check the status at the source`,
    );
    expect(
      !/<image\b/.test(draw(linked, spec.id, lang, null)),
      `${lang}/${spec.id}: no QR code is drawn before it exists`,
    );

    // Nothing outside the canvas.
    const width = Number(/<svg\b[^>]*width="(\d+)"/.exec(withLink)?.[1]);
    const height = Number(/<svg\b[^>]*height="(\d+)"/.exec(withLink)?.[1]);
    expect(
      width === spec.width && height === spec.height,
      `${lang}/${spec.id}: drawn at ${spec.width}×${spec.height}`,
    );
    for (const svg of [plain, withLink]) {
      const positions = [...svg.matchAll(/<text\b[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"/g)];
      expect(
        positions.length > 0 &&
          positions.every(
            ([, x, y]) => Number(x) >= 0 && Number(x) <= width && Number(y) <= height,
          ),
        `${lang}/${spec.id}: every line of text starts inside the canvas`,
      );
    }
  }
}

// ── Each place and trust word inside its own column ──────────────────────
// Both are one line. The longest words are the holder's own entry in Swedish
// and a source confirmation in English, which no credential reaches today but
// the drawing must still hold. The longest place is the United Arab Emirates,
// written out for a national credential. Where one would not fit, the card is
// drawn smaller instead.
{
  const SOURCE = presented("c5", {
    title: "SIA Licence — Vehicle Immobilisation",
    code: "GB_NI_SIA_VI",
    presentation: "verified",
    statusWordKey: "trust.level.source_verified",
    jurisdiction: "GB",
    subJurisdiction: "GB-NI",
  });
  const NATIONAL = presented("c6", {
    title: "A national licence",
    code: "AE_NATIONAL_LICENCE",
    jurisdiction: "AE",
  });
  const num = (attrs: string, name: string) =>
    Number(new RegExp(`\\b${name}="(-?[\\d.]+)"`).exec(attrs)?.[1]);
  const PLACES = [
    "Sverige",
    "Sweden",
    "Nordirland",
    "Northern Ireland",
    "Dubai, UAE",
    "Förenade Arabemiraten",
    "United Arab Emirates",
  ];
  // Beside short places the words decide the scale; beside the long one, the
  // place does. Each is checked where it is the one that matters.
  const sets = [
    ["long words", [OWN, SOURCE, SIRA]],
    ["the longest place", [OWN, SOURCE, NATIONAL]],
  ] as const;
  for (const [what, credentials] of sets)
    for (const lang of ["sv", "en"] as const) {
      const model = card(credentials, null, lang);
      for (const spec of SHARE_FORMATS) {
        const svg = draw(model, spec.id, lang, null);
        const dividers = [...svg.matchAll(/<line\b([^>]*)>/g)]
          .map((m) => m[1] ?? "")
          .filter((attrs) => num(attrs, "x1") === num(attrs, "x2"))
          .map((attrs) => num(attrs, "x1"))
          .sort((a, b) => a - b);
        const slot = (dividers[1] ?? NaN) - (dividers[0] ?? NaN);
        const firstLeft = (dividers[0] ?? NaN) - slot;
        const columnOf = (x: number) => firstLeft + Math.floor((x - firstLeft) / slot) * slot;
        const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
          attrs: m[1] ?? "",
          text: m[2] ?? "",
        }));
        const words = texts.filter(
          (t) =>
            /font-weight="600"/.test(t.attrs) &&
            /text-anchor="middle"/.test(t.attrs) &&
            /letter-spacing=/.test(t.attrs),
        );
        const wordsOutside = words.filter((t) => {
          const x = num(t.attrs, "x");
          const width =
            t.text.length * (num(t.attrs, "font-size") * 0.72 + num(t.attrs, "letter-spacing"));
          const left = columnOf(x);
          return x - width / 2 < left + 4 || x + width / 2 > left + slot - 4;
        });
        expect(
          dividers.length === 2 && words.length === 3 && wordsOutside.length === 0,
          `${lang}/${spec.id}, ${what}: every trust word stays inside its own column`,
        );
        const places = texts.filter((t) => PLACES.includes(t.text));
        const placesOutside = places.filter((t) => {
          const x = num(t.attrs, "x");
          const left = columnOf(x);
          return x + t.text.length * num(t.attrs, "font-size") * 0.55 > left + slot - 4;
        });
        expect(
          places.length === 3 && placesOutside.length === 0,
          `${lang}/${spec.id}, ${what}: every place stays inside its own column`,
        );
      }
    }
}

// ── Only the card ground, and plain attributes ───────────────────────────
{
  const svg = draw(card([SIRA, OWN], LINK, "sv"), "og", "sv", QR);
  expect(
    /<linearGradient id="sp-social-ground"/.test(svg),
    "the image is drawn on the card ground",
  );
  expect(
    !/<style\b|@import|url\(https?:|<foreignObject|<script\b/.test(svg),
    "the image references no stylesheet, font, external image or script",
  );
}

if (errors.length > 0) {
  console.error("passport-social-image-check FAILED");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`passport-social-image-check: ${assertions} assertions passed`);
