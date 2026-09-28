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
//   * every one of them: three to an image, and a larger selection as a set
//     of whole images, each saying which of the set it is -- never a shorter
//     list;
//   * nothing the presentation holds beyond the drawn facts: no issuer, date,
//     verifier, identifier or authorisation scope, on any image of a set;
//   * no link and no QR code unless the model carries a link, and then the
//     link as printed text beside exactly the QR it was given;
//   * a "snapshot" line whenever there is no link, because a cached image
//     outlives what it shows;
//   * nothing drawn outside its own canvas.
//
// And what each way out of the page claims: only the device's share sheet,
// which is handed the PNG files themselves, says the image is attached; every
// platform button hands the holder the image and says to add it to the post.
// Nothing creates a link except the holder's own press on "create a link".
//
// The browser walk (e2e/passport-public-pilot-local.spec.ts, case S) proves the
// download is the preview pixel for pixel; this is the fast, structural half.

import { renderToStaticMarkup } from "react-dom/server";
import { SocialCardSvg } from "../src/components/security-passport/social/SocialCardSvg";
import { SHARE_FORMATS } from "../src/lib/security-passport/social-export";
import { readFileSync } from "node:fs";
import { socialImageFileName, socialImageStrings } from "../src/lib/security-passport/share-image";
import {
  buildSelectedSocialCard,
  SOCIAL_CREDENTIALS_PER_IMAGE,
  SOCIAL_FORBIDDEN_KEYS,
  socialCardPages,
  type SocialCardModel,
} from "../src/lib/security-passport/social";
import {
  deviceShareData,
  FEED_CHANNELS,
  platformPlan,
} from "../src/lib/security-passport/share-channels";
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
  const pages = socialCardPages(model);
  expect(
    model.credentials.map((c) => c.id).join(",") === "c0,c1,c2,c3",
    "every selected credential that is current is drawn, in the order given: none is cut",
  );
  expect(
    pages.length === 2 &&
      pages.every((p) => p.credentials.length <= SOCIAL_CREDENTIALS_PER_IMAGE) &&
      pages.flatMap((p) => p.credentials.map((c) => c.id)).join(",") === "c0,c1,c2,c3",
    "more than one image holds becomes a set, three to an image, each credential on exactly one",
  );
  expect(
    card([LAPSED], null, "sv").credentials.length === 0,
    "a credential that is no longer current is never drawn",
  );
  expect(
    model.verifiedCredentials.length === 0 &&
      model.credentials.every((c) => c.state !== "verified") &&
      pages.every((p) => p.verifiedCredentials.length === 0),
    "nothing is raised to verified for the image",
  );

  const svg = draw(pages[0]!, "square", "sv", null);
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
  // Read defensively: a set that lost its second image must fail here, by
  // name, rather than crash the check.
  const second = pages[1] ? textOf(draw(pages[1], "square", "sv", null)).join("\n") : "";
  expect(
    !words.includes("A course nobody placed") && second.includes("A course nobody placed"),
    "the fourth credential is on the second image, not squeezed onto the first",
  );
  expect(
    !words.includes("An expired licence") && !second.includes("An expired licence"),
    "and the expired one is on neither",
  );
}

// ── Three is one image; more is a set of whole images ────────────────────
{
  const three = socialCardPages(card([SIRA, OWN, CPP], null, "sv"));
  const alone = draw(three[0]!, "square", "sv", null);
  expect(
    three.length === 1 &&
      three[0]!.page === null &&
      !alone.includes("data-social-page") &&
      textOf(alone).includes("SECURITY PASSPORT"),
    "three credentials are one image, which claims no place in a set",
  );
  expect(
    socialCardPages(card([], null, "sv")).length === 1,
    "a selection with nothing current is still one image, saying so",
  );

  const more = [
    SIRA,
    OWN,
    CPP,
    NOT_STATED,
    presented("c7", { title: "Ordningsvakt", code: "OV", jurisdiction: "SE" }),
    presented("c8", {
      title: "SIA Licence — Door Supervision",
      code: "UK_SIA_LICENCE_DS",
      jurisdiction: "GB",
    }),
    presented("c9", {
      title: "Certified Fraud Examiner",
      code: "INTL_ACFE_CFE",
      definitionScope: "global",
    }),
  ];
  for (const lang of ["sv", "en"] as const) {
    const whole = card(more, LINK, lang);
    const set = socialCardPages(whole);
    expect(
      set.length === 3 && set.map((p) => p.credentials.length).join(",") === "3,3,1",
      `${lang}: seven credentials are three images of 3, 3 and 1`,
    );
    for (const spec of SHARE_FORMATS) {
      const drawnIds: string[] = [];
      for (const [i, page] of set.entries()) {
        const svg = draw(page, spec.id, lang, QR);
        const lines = textOf(svg);
        const joined = lines.join(" ");
        const at = `${lang}/${spec.id} image ${i + 1}`;
        expect(
          svg.includes(`data-social-page="${i + 1}/3"`) &&
            lines.includes(`SECURITY PASSPORT · ${i + 1} / 3`),
          `${at}: says it is image ${i + 1} of 3`,
        );
        expect(
          joined.includes("Nadia") && joined.includes(passportT("card.verifyAtSource", lang)),
          `${at}: is a whole card -- the holder and the footer`,
        );
        expect(
          new RegExp(`<image\\b[^>]*href="${QR.replace(/[+/=.]/g, "\\$&")}"`).test(svg) &&
            lines.join("").includes(LINK),
          `${at}: carries the link the holder chose, as every image of the set does`,
        );
        const shields = (svg.match(/data-shield-mark=/g) ?? []).length;
        expect(
          shields === page.credentials.length && shields <= SOCIAL_CREDENTIALS_PER_IMAGE,
          `${at}: draws its own credentials, at most ${SOCIAL_CREDENTIALS_PER_IMAGE}`,
        );
        // Drawn at the size the same credentials would be drawn alone: a set
        // does not make an image harder to read.
        const sizes = (markup: string) =>
          [...markup.matchAll(/<text\b[^>]*font-size="([\d.]+)"/g)]
            .map((m) => Number(m[1]))
            .sort((a, b) => a - b)
            .join(",");
        const aloneSvg = draw({ ...page, page: null }, spec.id, lang, QR);
        expect(
          sizes(svg) === sizes(aloneSvg),
          `${at}: drawn at the size the same credentials are drawn alone`,
        );
        drawnIds.push(...page.credentials.map((c) => c.id));
      }
      expect(
        drawnIds.join(",") === whole.credentials.map((c) => c.id).join(","),
        `${lang}/${spec.id}: the set draws every selected credential once, in order`,
      );
    }
  }
  expect(
    socialImageFileName("square", null) === "cqrityjob-passport-square.png" &&
      socialImageFileName("story", { index: 2, count: 3 }) ===
        "cqrityjob-passport-story-2-of-3.png",
    "a set's files say which image each is",
  );
}

// ── Nothing private reaches any image of a set ───────────────────────────
{
  const PRIVATE = [
    "Hemlig Utfärdare AB",
    "SEC-NUMBER-4711",
    "2031-12-24",
    "2019-01-02",
    "Hemlig Granskare",
    "manual_document_check",
    "Protected object: Central Bank vault",
  ];
  const withPrivate = (key: string, title: string) =>
    presented(key, {
      title,
      code: null,
      issuer: PRIVATE[0],
      credentialIdentifier: PRIVATE[1],
      validUntil: PRIVATE[2] as never,
      issuedOn: PRIVATE[3] as never,
      verifierOrganisation: PRIVATE[4],
      verificationMethod: PRIVATE[5],
      authorisationScope: PRIVATE[6],
    });
  const creds = [1, 2, 3, 4, 5].map((n) => withPrivate(`p${n}`, `Licence ${n}`));
  const model = card(creds, null, "sv");
  const set = socialCardPages(model);
  const serialised = JSON.stringify(set);
  expect(
    set.length === 2 && PRIVATE.every((v) => !serialised.includes(v)),
    "no issuer, identifier, date, verifier, method or scope reaches the set's model",
  );
  expect(
    SOCIAL_FORBIDDEN_KEYS.every((k) => !serialised.includes(`"${k}"`)),
    "no forbidden field name appears in the set's model",
  );
  for (const spec of SHARE_FORMATS)
    for (const page of set) {
      const svg = draw(page, spec.id, "sv", null);
      // A wrapped name spreads over several lines; read them as one text too.
      const text = textOf(svg).join(" ");
      expect(
        PRIVATE.every((v) => !svg.includes(v) && !text.includes(v)),
        `${spec.id} image ${page.page?.index}: none of it is drawn`,
      );
    }
}

// ── What each way out claims ─────────────────────────────────────────────
{
  const file = (n: number) => new File([String(n)], `f${n}.png`, { type: "image/png" });
  const files = [file(1), file(2)];
  const plain = deviceShareData(files, "Mitt Security Passport från CQrityjob.", null);
  expect(
    Array.isArray(plain.files) &&
      plain.files.length === 2 &&
      plain.files[0] === files[0] &&
      plain.files[1] === files[1] &&
      !("url" in plain),
    "the device share is handed the image files themselves, and no link unless one was chosen",
  );
  expect(
    deviceShareData(files, "x", LINK).url === LINK,
    "a link the holder chose for the images travels with them",
  );

  const claimsAttached = /bifogad|bifogas|finns nu|är med|attached|is now in|included/i;
  for (const lang of ["sv", "en"] as const) {
    expect(
      claimsAttached.test(passportT("social.device.hint", lang)) &&
        claimsAttached.test(passportT("social.device.hintMany", lang)),
      `${lang}: the device share says the image is attached -- it is`,
    );
    for (const hint of ["social.platformsHint", "social.platformsHintMany"] as const) {
      const text = passportT(hint, lang);
      expect(
        /laddas ner|downloaded/i.test(text) && /själv|yourself/i.test(text),
        `${lang}: the platform list says the image is downloaded and added by the holder`,
      );
    }
    for (const { id } of FEED_CHANNELS) {
      // Copying a link and the device's own sheet are not platforms.
      if (id === "copy_link" || id === "native") continue;
      for (const count of [1, 3]) {
        const plan = platformPlan(id, null, "text", count);
        const notice = passportT(plan.noticeKey, lang);
        expect(
          plan.delivery === "added_by_holder" &&
            !claimsAttached.test(notice) &&
            /Lägg till|Bifoga|Lägg upp|Add the|Attach the|Post (it|them)/.test(notice),
          `${lang}/${id} (${count}): never claims the image went along; says to add it`,
        );
        expect(
          count === 1
            ? !/bilderna|images|dem |them /.test(notice)
            : /bilderna|images|dem |them /.test(notice),
          `${lang}/${id} (${count}): speaks of ${count === 1 ? "the image" : "the images"}`,
        );
        expect(
          plan.url === null || !/data:|\.png|blob:|image=|media=/i.test(plan.url),
          `${lang}/${id}: its web address carries no image, because none can`,
        );
      }
    }
  }
  const instagram = platformPlan("instagram", null, "text", 1);
  expect(
    instagram.url === null && instagram.format === "story",
    "Instagram has no web page to post from: the Story image, and no pretend publish",
  );
  expect(
    platformPlan("linkedin", null, "text", 1).url === "https://www.linkedin.com/feed/" &&
      !/url=|%2Fp%23/.test(platformPlan("x", null, "text", 1).url ?? ""),
    "no platform is given a link the holder did not choose",
  );
}

// ── A link only on the holder's own press ────────────────────────────────
{
  const flow = readFileSync("src/components/security-passport/live/SocialShareFlow.tsx", "utf8");
  const route = readFileSync("src/routes/_authenticated.passport.share.tsx", "utf8");
  const uses = (text: string, needle: string) => text.split(needle).length - 1;
  expect(
    uses(flow, "link.onCreate") === 1 &&
      /data-social-link-create\s+onClick=\{link\.onCreate\}/.test(flow),
    "the social flow creates a link from one place: the holder's press on 'create a link'",
  );
  expect(
    uses(route, "onCreateSocialLink(") === 2 &&
      /onCreate: \(\) => void onCreateSocialLink\(\)/.test(route),
    "and the page wires that press, and nothing else, to the create",
  );
  expect(
    /const \[includeLink, setIncludeLink\] = useState\(false\)/.test(route) &&
      /const imageLink = includeLink && socialLinkUrl \? socialLinkUrl : null;/.test(route),
    "no link is printed unless the holder created one and ticked it in",
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

// ── A long name stays inside its space ───────────────────────────────────
// A name wraps at its spaces; a single word wider than its line -- a double
// surname, a long compound, a holder's own free text -- is drawn smaller
// instead of past the card's edge or into the next column.
{
  const LONG_HOLDER: PassportHolder = {
    ...holder,
    displayName: "Alexandra Konstantinopoulou-Lindqvist",
  };
  const LONG_WORD = presented("c11", {
    title: "Säkerhetsskyddsutbildningsintygskurs",
    code: null,
    jurisdiction: "SE",
  });
  const num = (attrs: string, name: string) =>
    Number(new RegExp(`\\b${name}="(-?[\\d.]+)"`).exec(attrs)?.[1]);
  for (const lang of ["sv", "en"] as const)
    for (const spec of SHARE_FORMATS) {
      // Each long text on its own: a long credential word draws the whole
      // card smaller, which would hide a long name running past the edge.
      const options = {
        privacyMode: "full_name" as const,
        anonymousLabel: passportT("share.anonymousLabel", lang),
        verifyUrl: null,
      };
      const named = draw(
        buildSelectedSocialCard(LONG_HOLDER, "2026-09-28", [SIRA, OWN, CPP], options),
        spec.id,
        lang,
        null,
      );
      const model = buildSelectedSocialCard(holder, "2026-09-28", [SIRA, LONG_WORD, CPP], options);
      const svg = draw(model, spec.id, lang, null);
      const width = Number(/<svg\b[^>]*width="(\d+)"/.exec(svg)?.[1]);
      const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
        attrs: m[1] ?? "",
        text: m[2] ?? "",
      }));
      // One line or two, depending on how small the format draws it.
      const nameLines = [...named.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
        .map((m) => ({ attrs: m[1] ?? "", text: m[2] ?? "" }))
        .filter((t) => t.text.includes("Konstantinopoulou"));
      const namedWidth = Number(/<svg\b[^>]*width="(\d+)"/.exec(named)?.[1]);
      expect(
        nameLines.length === 1 &&
          nameLines.every(
            (t) =>
              num(t.attrs, "x") + t.text.length * num(t.attrs, "font-size") * 0.62 <= namedWidth,
          ),
        `${lang}/${spec.id}: the holder's long name stays inside the card`,
      );
      const dividers = [...svg.matchAll(/<line\b([^>]*)>/g)]
        .map((m) => m[1] ?? "")
        .filter((attrs) => num(attrs, "x1") === num(attrs, "x2"))
        .map((attrs) => num(attrs, "x1"))
        .sort((a, b) => a - b);
      const slot = (dividers[1] ?? NaN) - (dividers[0] ?? NaN);
      const firstLeft = (dividers[0] ?? NaN) - slot;
      const columnOf = (x: number) => firstLeft + Math.floor((x - firstLeft) / slot) * slot;
      const credentialLines = texts.filter(
        (t) => /font-weight="500"/.test(t.attrs) && /text-anchor="middle"/.test(t.attrs),
      );
      const outside = credentialLines.filter((t) => {
        const x = num(t.attrs, "x");
        const w = t.text.length * num(t.attrs, "font-size") * 0.58;
        const left = columnOf(x);
        return x - w / 2 < left + 4 || x + w / 2 > left + slot - 4;
      });
      expect(
        dividers.length === 2 &&
          credentialLines.some((t) => t.text.startsWith("Säkerhetsskydds")) &&
          outside.length === 0,
        `${lang}/${spec.id}: every line of a credential's name stays inside its own column`,
      );
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
