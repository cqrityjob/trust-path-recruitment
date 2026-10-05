// Security Passport — the ONE Passport image, asserted without a browser.
//
// Run: bun run passport-social-image:check
//
// The image a holder previews, downloads and shares from "Dela på sociala
// medier" is SocialCardSvg. This renders it for every format and both
// languages and asserts the product rule the owner fixed on 2026-09-29:
//
//   ONE HOLDER = ONE SECURITY PASSPORT = ONE SHAREABLE IMAGE
//
//   * every selected, current credential is on the ONE image, exactly once,
//     whether the holder chose one, four, six, eight, eleven or fifteen;
//     there is no "1 / 2", no set, no count at which a second image begins;
//   * the credentials are grouped by their CONTROLLED scope -- the definition's
//     global flag, the stored jurisdiction and sub-jurisdiction -- under one
//     heading per scope, and a credential can never land in another group;
//   * each shield keeps its own state and its own trust word; a group never
//     says anything about verification;
//   * every format (square, Story, OG, compact) carries the complete
//     Passport, and no critical text is drawn below the readability floor;
//   * nothing the presentation holds beyond the drawn facts: no issuer, date,
//     verifier, identifier or authorisation scope;
//   * no link and no QR code unless the model carries a link, and then the
//     link as printed text beside exactly the QR it was given; a "snapshot"
//     line whenever there is no link;
//   * the device share is handed ONE file; every platform prepares ONE file;
//     nothing creates a link except the holder's own press.
//
// The browser walk (e2e/passport-sharing.spec.ts, scenario 23, and the
// real-backend e2e/passport-public-pilot-local.spec.ts, case S) proves the
// download is the preview pixel for pixel; this is the fast, structural half.

import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import {
  READABILITY_FLOOR,
  SocialCardSvg,
} from "../src/components/security-passport/social/SocialCardSvg";
import { SHARE_FORMATS } from "../src/lib/security-passport/social-export";
import { socialImageFileName, socialImageStrings } from "../src/lib/security-passport/share-image";
import {
  buildSelectedSocialCard,
  SOCIAL_FORBIDDEN_KEYS,
  type SocialCardModel,
} from "../src/lib/security-passport/social";
import {
  groupPassportCredentials,
  passportDensity,
} from "../src/lib/security-passport/passport-groups";
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
  identity: deriveVerifiedIdentity([], MIRRORED_TITLE_RULES, "2026-09-29"),
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
    presentation: "self_declared",
    lifecycle: "active",
    statusWordKey: "assertion.self_declared",
    definitionScope: "national",
    jurisdiction: null,
    subJurisdiction: null,
    ...over,
  } as unknown as RecipientCredential;
}
const se = (key: string, code: string, title: string) =>
  presented(key, { code, title, jurisdiction: "SE" });
const intl = (key: string, code: string, title: string) =>
  presented(key, { code, title, definitionScope: "global" });

// ── Controlled fixtures: real catalogue codes, fictional holder ──────────
const VU1 = se("vu1", "VU1", "Väktarutbildning 1");
const VU2 = se("vu2", "VU2", "Väktarutbildning 2");
const OV = se("ov", "OV", "Ordningsvaktsförordnande");
const SV = se("sv", "SV", "Skyddsvaktsutbildning");
const CPP = intl("cpp", "INTL_ASIS_CPP", "Certified Protection Professional (CPP)");
const PSP = intl("psp", "INTL_ASIS_PSP", "Physical Security Professional (PSP)");
const PCI = intl("pci", "INTL_ASIS_PCI", "Professional Certified Investigator (PCI)");
const CC = intl("cc", "INTL_ISC2_CC", "Certified in Cybersecurity (CC)");
const CAMS = presented("cams", {
  code: "INTL_ACAMS_CAMS",
  title: "Certified Anti-Money Laundering Specialist (CAMS)",
  definitionScope: "global",
  presentation: "documented",
  statusWordKey: "trust.level.documented",
});
const SIRA = presented("sira", {
  title: "SIRA Security Cadre Card — Security Guard",
  code: "AE_DU_SIRA_CARD_GUARD",
  presentation: "documented",
  statusWordKey: "trust.level.documented",
  jurisdiction: "AE",
  subJurisdiction: "AE-DU",
});
const SIRA_SUP = presented("sira-sup", {
  title: "SIRA Security Cadre Card — Security Supervisor",
  code: "AE_DU_SIRA_CARD_SUP",
  jurisdiction: "AE",
  subJurisdiction: "AE-DU",
});
const SIA_SG = presented("sia-sg", {
  title: "SIA Licence — Security Guarding",
  code: "UK_SIA_LICENCE_SG",
  jurisdiction: "GB",
});
const SIA_DS = presented("sia-ds", {
  title: "SIA Licence — Door Supervision",
  code: "UK_SIA_LICENCE_DS",
  jurisdiction: "GB",
});
const SIA_NI = presented("sia-ni", {
  title: "SIA Licence — Vehicle Immobilisation",
  code: "GB_NI_SIA_VI",
  presentation: "verified",
  statusWordKey: "trust.level.source_verified",
  jurisdiction: "GB",
  subJurisdiction: "GB-NI",
});
const Q7101 = presented("q7101", {
  title: "Security Guard (MEP/Q7101)",
  code: "IN_MEPSC_Q7101",
  jurisdiction: "IN",
});
const NOT_STATED = presented("unplaced", { title: "A course nobody placed", code: null });
const LAPSED = presented("lapsed", {
  title: "An expired licence",
  presentation: "expired",
  lifecycle: "expired",
  statusWordKey: "lifecycle.expired",
});

/** The owner's scenarios, A to E, and a stress selection beyond them. */
const SCENARIOS = {
  A_four_one_jurisdiction: [VU1, VU2, OV, SV],
  B_six_two_groups: [VU1, VU2, OV, CPP, PSP, PCI],
  D_eight_three_groups: [VU1, VU2, OV, CPP, PSP, PCI, SIRA, SIRA_SUP],
  E_eleven_densest: [VU1, VU2, OV, SV, CPP, PSP, PCI, CC, CAMS, SIRA, SIRA_SUP],
  F_fifteen_six_groups: [
    VU1,
    VU2,
    OV,
    SV,
    CPP,
    PSP,
    PCI,
    CC,
    CAMS,
    SIRA,
    SIRA_SUP,
    SIA_SG,
    SIA_DS,
    SIA_NI,
    Q7101,
  ],
} as const;

const LINK = `https://app.example/p#${"ab".repeat(32)}`;
const QR = "data:image/png;base64,iVBORw0KGgo=";

function card(
  credentials: readonly RecipientCredential[],
  verifyUrl: string | null,
  lang: PassportLang,
): SocialCardModel {
  return buildSelectedSocialCard(holder, "2026-09-29", credentials, {
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
const attr = (svg: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(svg)?.[1];
/** Every drawn shield: its credential id and the group it was drawn in. */
const shieldsOf = (svg: string) =>
  [...svg.matchAll(/data-passport-shield="([^"]+)" data-passport-group="([^"]+)"/g)].map((m) => ({
    id: m[1]!,
    group: m[2]!,
  }));
const num = (attrs: string, name: string) =>
  Number(new RegExp(`\\b${name}="(-?[\\d.]+)"`).exec(attrs)?.[1]);

// ── 1–6, 16: every selected credential on ONE image, once, in every format ──
for (const [name, credentials] of Object.entries(SCENARIOS)) {
  const expectedIds = credentials.map((c) => c.key);
  for (const lang of ["sv", "en"] as const) {
    const model = card(credentials, null, lang);
    expect(
      model.credentials.map((c) => c.id).join(",") === expectedIds.join(","),
      `${name}/${lang}: the model carries every selected credential once, in order: none is cut`,
    );
    for (const spec of SHARE_FORMATS) {
      const svg = draw(model, spec.id, lang, null);
      const at = `${name}/${lang}/${spec.id}`;
      const drawn = shieldsOf(svg);
      expect(
        (svg.match(/<svg\b[^>]*data-social-card=/g) ?? []).length === 1,
        `${at}: ONE Passport image`,
      );
      expect(
        !svg.includes("data-social-page") &&
          !/SECURITY PASSPORT · \d+ \/ \d+/.test(svg) &&
          !/\b\d+ \/ \d+\b/.test(textOf(svg).join("\n")),
        `${at}: no page marker, no "1 / 2", no set`,
      );
      expect(
        drawn.length === credentials.length &&
          [...drawn.map((s) => s.id)].sort().join(",") === [...expectedIds].sort().join(","),
        `${at}: ${credentials.length} selected credentials are drawn as ${credentials.length} shields on the one image`,
      );
      expect(
        new Set(drawn.map((s) => s.id)).size === drawn.length,
        `${at}: no credential is drawn twice`,
      );
      expect(
        attr(svg, "data-passport-credentials") === String(credentials.length),
        `${at}: the image declares the complete count`,
      );
      // Every abbreviation is printed: the shield is identifiable.
      for (const c of credentials) {
        const mark = /^[A-Z][A-Z0-9]{1,5}/.exec(
          {
            VU1: "VU1",
            VU2: "VU2",
            OV: "OV",
            SV: "SV",
            INTL_ASIS_CPP: "CPP",
            INTL_ASIS_PSP: "PSP",
            INTL_ASIS_PCI: "PCI",
            INTL_ISC2_CC: "CC",
            INTL_ACAMS_CAMS: "CAMS",
            IN_MEPSC_Q7101: "Q7101",
          }[c.code ?? ""] ?? c.title,
        )?.[0];
        expect(
          mark !== undefined && textOf(svg).includes(mark),
          `${at}: the abbreviation "${mark}" of ${c.key} is printed`,
        );
      }
    }
  }
}

// ── The densest realistic fixture fits every format at the floor ────────
// Eleven current credentials across three groups is the densest real holder
// the pilot seeds (case S): it fits every format, link and QR code included.
// Fifteen across six groups is the stress case beyond any seeded holder: the
// Story holds it; the square misses by a few dozen pixels and the short
// landscape formats by more, and each of those REPORTS the overflow so the
// page says the format is crowded (data-social-crowded) -- nothing is cut
// and nothing is drawn below the floor. That measured bound is the owner's
// to move, not this file's to hide.
for (const lang of ["sv", "en"] as const) {
  for (const spec of SHARE_FORMATS) {
    const eleven = draw(card(SCENARIOS.E_eleven_densest, LINK, lang), spec.id, lang, QR);
    expect(
      attr(eleven, "data-passport-fits") === "true",
      `${lang}/${spec.id}: eleven credentials across three groups fit ONE image at the readability floor`,
    );
    const fifteen = draw(card(SCENARIOS.F_fifteen_six_groups, null, lang), spec.id, lang, null);
    expect(
      shieldsOf(fifteen).length === 15,
      `${lang}/${spec.id}: fifteen credentials are still fifteen shields on ONE image, fitting or not`,
    );
    if (spec.id === "story") {
      expect(
        attr(fifteen, "data-passport-fits") === "true",
        `${lang}/${spec.id}: fifteen credentials across six groups fit`,
      );
    }
    expect(
      attr(fifteen, "data-passport-fits") === "true" ||
        Number(attr(fifteen, "data-passport-overflow")) > 0,
      `${lang}/${spec.id}: fifteen credentials either fit or report by how much they do not`,
    );
  }
}

// ── 7–9: grouping by controlled scope only ───────────────────────────────
{
  const mixed = [SIRA, VU1, CPP, NOT_STATED, SIA_NI, OV, SIA_SG, Q7101, PSP, SIRA_SUP];
  for (const lang of ["sv", "en"] as const) {
    const model = card(mixed, null, lang);
    const groups = groupPassportCredentials(model.credentials, lang);
    const byGroup = Object.fromEntries(
      groups.map((g) => [g.key, g.credentials.map((c) => c.id).join(",")]),
    );
    expect(
      byGroup["jurisdiction:SE"] === "vu1,ov" &&
        byGroup["global"] === "cpp,psp" &&
        byGroup["jurisdiction:AE-DU"] === "sira,sira-sup" &&
        byGroup["jurisdiction:GB"] === "sia-sg" &&
        byGroup["jurisdiction:GB-NI"] === "sia-ni" &&
        byGroup["jurisdiction:IN"] === "q7101" &&
        byGroup["not_stated"] === "unplaced",
      `${lang}: same-scope credentials share one group, in the Passport's order; Dubai is not the UAE, Northern Ireland is not Great Britain, and an unplaced credential is neither`,
    );
    expect(
      groups.map((g) => g.key).join("|") ===
        "jurisdiction:AE-DU|jurisdiction:SE|global|jurisdiction:GB-NI|jurisdiction:GB|jurisdiction:IN|not_stated",
      `${lang}: groups keep first-appearance order with the unplaced last`,
    );
    expect(
      groups.reduce((n, g) => n + g.credentials.length, 0) === mixed.length &&
        new Set(groups.flatMap((g) => g.credentials.map((c) => c.id))).size === mixed.length,
      `${lang}: every credential is in exactly one group`,
    );
    const globe = groups.find((g) => g.key === "global");
    expect(
      globe?.scope.kind === "global" &&
        globe.scope.label === passportT("scope.global", lang) &&
        globe.credentials.every((c) => c.scope.global),
      `${lang}: international certifications use the controlled global group, from the definition and nothing else`,
    );
    for (const spec of SHARE_FORMATS) {
      const svg = draw(model, spec.id, lang, null);
      const drawn = shieldsOf(svg);
      expect(
        drawn.every((s) => {
          const c = model.credentials.find((x) => x.id === s.id)!;
          const expected = c.scope.global
            ? "global"
            : c.scope.subJurisdictionCode || c.scope.jurisdictionCode
              ? `jurisdiction:${(c.scope.subJurisdictionCode || c.scope.jurisdictionCode)!.toUpperCase()}`
              : "not_stated";
          return s.group === expected;
        }),
        `${lang}/${spec.id}: every shield is drawn in the group its own controlled scope names`,
      );
      const words = textOf(svg).map((t) => t.toUpperCase());
      expect(
        words.includes(passportT("scope.global", lang).toUpperCase()) &&
          words.includes(passportT("jurisdiction.SE", lang).toUpperCase()) &&
          words.includes(passportT("scope.AE-DU", lang).toUpperCase()) &&
          words.includes(passportT("scope.GB", lang).toUpperCase()) &&
          words.includes(passportT("jurisdiction.GB-NI", lang).toUpperCase()) &&
          words.includes(passportT("jurisdiction.IN", lang).toUpperCase()) &&
          words.includes(passportT("scope.notStated", lang).toUpperCase()),
        `${lang}/${spec.id}: each group heading is printed once, with its controlled label`,
      );
      expect(
        (svg.match(/data-flag="SE"/g) ?? []).length === 1 &&
          (svg.match(/data-flag="AE"/g) ?? []).length === 1 &&
          (svg.match(/data-flag="GB"/g) ?? []).length === 2 &&
          (svg.match(/data-scope-mark="globe"/g) ?? []).length === 1,
        `${lang}/${spec.id}: a flag is drawn once per group, not once per shield`,
      );
      expect(
        attr(svg, "data-passport-groups") === "7",
        `${lang}/${spec.id}: the image declares its seven groups`,
      );
    }
  }
}

// ── 15: trust stays on the shield ────────────────────────────────────────
{
  // A verified, a documented and two self-declared credentials in ONE group.
  const dubai = [SIRA, SIRA_SUP];
  const ni = [
    SIA_NI,
    presented("ni-own", {
      title: "SIA Licence — Close Protection",
      code: "GB_NI_SIA_CP",
      jurisdiction: "GB",
      subJurisdiction: "GB-NI",
    }),
  ];
  for (const lang of ["sv", "en"] as const) {
    const model = card([...dubai, ...ni, CAMS, VU1], null, lang);
    expect(
      model.verifiedCredentials.map((c) => c.id).join(",") === "sia-ni" &&
        model.credentials.filter((c) => c.state === "verified").length === 1,
      `${lang}: only the source-confirmed credential is verified; grouping raises nothing`,
    );
    for (const spec of SHARE_FORMATS) {
      const svg = draw(model, spec.id, lang, null);
      const states = [...svg.matchAll(/data-shield-mark="([a-z_]+)"/g)].map((m) => m[1]);
      expect(
        states.filter((s) => s === "verified").length === 1 &&
          states.filter((s) => s === "documented").length === 2 &&
          states.filter((s) => s === "self_declared").length === 3,
        `${lang}/${spec.id}: each shield wears its own state -- one verified, two documented, three self-declared`,
      );
      const words = textOf(svg).map((t) => t.toUpperCase());
      const count = (word: string) => words.filter((w) => w === word.toUpperCase()).length;
      expect(
        count(passportT("trust.level.source_verified", lang)) === 1 &&
          count(passportT("trust.level.documented", lang)) === 2 &&
          count(passportT("assertion.self_declared", lang)) === 3,
        `${lang}/${spec.id}: each credential carries its own truthful word, and the word is printed per shield, never per group`,
      );
    }
  }
  const own = card([VU1, VU2, OV, SV], null, "sv");
  const svg = draw(own, "square", "sv", null);
  expect(
    !/VERIFIERAD|KÄLLBEKRÄFTAD|DOKUMENTERAD/i.test(textOf(svg).join("\n")) &&
      !svg.includes('data-shield-mark="verified"'),
    "no verified word and no verified shield where nothing is verified",
  );
  expect(
    card([LAPSED, VU1], null, "sv").credentials.length === 1,
    "a credential that is no longer current is never drawn",
  );
}

// ── Density: guidance, not a limit ───────────────────────────────────────
expect(
  passportDensity(1) === "small" &&
    passportDensity(3) === "small" &&
    passportDensity(4) === "medium" &&
    passportDensity(6) === "medium" &&
    passportDensity(7) === "large" &&
    passportDensity(10) === "large" &&
    passportDensity(11) === "dense" &&
    passportDensity(40) === "dense",
  "density names a presentation, and there is no count it refuses",
);
{
  const one = draw(card([VU1], null, "sv"), "square", "sv", null);
  const four = draw(card(SCENARIOS.A_four_one_jurisdiction, null, "sv"), "square", "sv", null);
  const eleven = draw(card(SCENARIOS.E_eleven_densest, null, "sv"), "square", "sv", null);
  expect(
    attr(one, "data-passport-tier") === "spacious" &&
      attr(four, "data-passport-tier") === "roomy" &&
      attr(eleven, "data-passport-tier") === "micro",
    "the layout adapts to the credentials: a spacious Passport for one, a denser one for eleven",
  );
  const shieldSize = (svg: string) =>
    Number(/data-shield-mark="[a-z_]+" viewBox="0 0 44 44" width="([\d.]+)"/.exec(svg)?.[1]);
  expect(
    shieldSize(one) > shieldSize(four) && shieldSize(four) > shieldSize(eleven),
    "a small Passport draws larger shields; a large one draws them smaller, never fewer",
  );
}

// ── Readability floor, canvas, holder dominance ──────────────────────────
// The floor is the approved one, in absolute pixels: a lowered constant
// would let a crowded format shrink text instead of saying it is crowded.
expect(READABILITY_FLOOR === 14, "the approved readability floor is 14px per 1080");
for (const [name, credentials] of Object.entries(SCENARIOS)) {
  for (const lang of ["sv", "en"] as const) {
    for (const spec of SHARE_FORMATS) {
      const svg = draw(card(credentials, LINK, lang), spec.id, lang, QR);
      const at = `${name}/${lang}/${spec.id}`;
      const base = spec.width > spec.height ? spec.width / 1200 : spec.width / 1080;
      const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
        attrs: m[1] ?? "",
        text: m[2] ?? "",
      }));
      const sizes = texts.map((t) => num(t.attrs, "font-size"));
      expect(
        sizes.length > 0 && sizes.every((s) => s >= 14 * base - 0.05),
        `${at}: no text is drawn below the readability floor (14px per 1080)`,
      );
      const width = Number(/<svg\b[^>]*width="(\d+)"/.exec(svg)?.[1]);
      const height = Number(/<svg\b[^>]*height="(\d+)"/.exec(svg)?.[1]);
      expect(
        width === spec.width && height === spec.height,
        `${at}: drawn at ${spec.width}×${spec.height}`,
      );
      const fits = attr(svg, "data-passport-fits") === "true";
      expect(
        !fits ||
          texts.every((t) => {
            const x = num(t.attrs, "x");
            const y = num(t.attrs, "y");
            const size = num(t.attrs, "font-size");
            const middle = /text-anchor="middle"/.test(t.attrs);
            const bold = num(t.attrs, "font-weight") >= 600;
            const spacing = /letter-spacing=/.test(t.attrs) ? num(t.attrs, "letter-spacing") : 0;
            const est = t.text.length * (size * (bold ? 0.62 : 0.56) + spacing);
            const left = middle ? x - est / 2 : x;
            const right = middle ? x + est / 2 : x + est;
            return left >= -1 && right <= width + 1 && y - size >= 0 && y <= height;
          }),
        `${at}: every line of text lies inside the canvas`,
      );
      expect(
        fits || Number(attr(svg, "data-passport-overflow")) > 0,
        `${at}: a Passport that does not fit says by how much, so the page can say the format is crowded`,
      );
      // The holder's name is the largest text on the image.
      const nameSize = Math.max(
        ...texts.filter((t) => /Nadia|Fiktiv/.test(t.text)).map((t) => num(t.attrs, "font-size")),
      );
      expect(nameSize === Math.max(...sizes), `${at}: the holder's name stays the dominant text`);
      // Shields never collide: no two shields share a row closer than a cell.
      const shields = [
        ...svg.matchAll(
          /data-passport-group="[^"]+" transform="translate\(([\d.]+) ([\d.]+)\)"><svg[^>]*width="([\d.]+)"/g,
        ),
      ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]) }));
      const collide = shields.some((a, i) =>
        shields.some(
          (b, j) => i !== j && Math.abs(a.y - b.y) < a.size && Math.abs(a.x - b.x) < a.size,
        ),
      );
      expect(shields.length === credentials.length && !collide, `${at}: no two shields overlap`);
    }
  }
}

// ── 13: nothing private reaches the image ────────────────────────────────
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
  const withPrivate = (key: string, title: string, jurisdiction: string) =>
    presented(key, {
      title,
      code: null,
      jurisdiction,
      issuer: PRIVATE[0],
      credentialIdentifier: PRIVATE[1],
      validUntil: PRIVATE[2] as never,
      issuedOn: PRIVATE[3] as never,
      verifierOrganisation: PRIVATE[4],
      verificationMethod: PRIVATE[5],
      authorisationScope: PRIVATE[6],
    });
  const creds = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    withPrivate(`p${n}`, `Licence ${n}`, n % 2 ? "SE" : "GB"),
  );
  const model = card(creds, null, "sv");
  const serialised = JSON.stringify(model);
  expect(
    model.credentials.length === 7 && PRIVATE.every((v) => !serialised.includes(v)),
    "no issuer, identifier, date, verifier, method or scope reaches the model",
  );
  expect(
    SOCIAL_FORBIDDEN_KEYS.every((k) => !serialised.includes(`"${k}"`)),
    "no forbidden field name appears in the model",
  );
  for (const spec of SHARE_FORMATS) {
    const svg = draw(model, spec.id, "sv", null);
    const text = textOf(svg).join(" ");
    expect(
      PRIVATE.every((v) => !svg.includes(v) && !text.includes(v)),
      `${spec.id}: none of it is drawn`,
    );
  }
}

// ── 10–12: one file, one device share, one platform hand-over ────────────
{
  const file = new File(["1"], "f1.png", { type: "image/png" });
  const plain = deviceShareData(file, "Mitt Security Passport från CQrityjob.", null);
  expect(
    Array.isArray(plain.files) &&
      plain.files.length === 1 &&
      plain.files[0] === file &&
      !("url" in plain),
    "the device share is handed ONE image file, and no link unless one was chosen",
  );
  expect(deviceShareData(file, "x", LINK).url === LINK, "a link the holder chose travels with it");
  expect(
    socialImageFileName("square") === "cqrityjob-passport-square.png" &&
      socialImageFileName("story") === "cqrityjob-passport-story.png" &&
      !/-of-/.test(socialImageFileName("og")),
    "the file is the Passport in its format: no '-1-of-2' name exists",
  );

  const claimsAttached = /bifogad|bifogas|finns nu|är med|attached|is now in|included/i;
  for (const lang of ["sv", "en"] as const) {
    expect(
      claimsAttached.test(passportT("social.device.hint", lang)),
      `${lang}: the device share says the image is attached -- it is`,
    );
    const hint = passportT("social.platformsHint", lang);
    expect(
      /laddas ner|downloaded/i.test(hint) && /själv|yourself/i.test(hint),
      `${lang}: the platform list says the image is downloaded and added by the holder`,
    );
    for (const { id } of FEED_CHANNELS) {
      if (id === "copy_link" || id === "native") continue;
      const plan = platformPlan(id, null, "text");
      const notice = passportT(plan.noticeKey, lang);
      expect(
        plan.delivery === "added_by_holder" &&
          !claimsAttached.test(notice) &&
          /Lägg till|Bifoga|Lägg upp|Add the|Attach the|Post it/.test(notice),
        `${lang}/${id}: never claims the image went along; says to add it`,
      );
      expect(
        !/bilderna|images|dem |them /.test(notice),
        `${lang}/${id}: speaks of THE image -- one Passport, one file`,
      );
      expect(
        plan.url === null || !/data:|\.png|blob:|image=|media=/i.test(plan.url),
        `${lang}/${id}: its web address carries no image, because none can`,
      );
    }
    for (const key of [
      "social.onlyPublishable",
      "social.device.hint",
      "social.platformsHint",
      "social.ready.post",
      "social.link.include",
      "social.step.preview",
    ] as const) {
      expect(
        !/\btre\b|\bthree\b|flera bilder|several images|bilderna|the images|1 \/ 2/i.test(
          passportT(key, lang),
        ),
        `${lang}/${key}: the copy speaks of ONE image and names no credential count`,
      );
    }
  }
  const linkedin = platformPlan("linkedin", null, "text");
  expect(
    linkedin.url === "https://www.linkedin.com/feed/" && linkedin.format === null,
    "LinkedIn is prepared from the ONE image on screen and opened where the holder posts",
  );
  const instagram = platformPlan("instagram", null, "text");
  expect(
    instagram.url === null && instagram.format === "story",
    "Instagram has no web page to post from: the Story image, and no pretend publish",
  );
  expect(
    !/url=|%2Fp%23/.test(platformPlan("x", null, "text").url ?? ""),
    "no platform is given a link the holder did not choose",
  );
}

// ── 14: a public link only on the holder's own, confirmed press ──────────
{
  const flow = readFileSync("src/components/security-passport/live/SocialShareFlow.tsx", "utf8");
  const route = readFileSync("src/routes/_authenticated.passport.share.tsx", "utf8");
  const uses = (text: string, needle: string) => text.split(needle).length - 1;
  // ensureShare is defined once and called from exactly the two actions that
  // need a public link; nothing creates one on load, on selection or on change.
  expect(
    uses(flow, "ensureShare()") === 3 && /async function ensureShare\(\)/.test(flow),
    "a public share is created from one function, called only by the channel press and 'copy link'",
  );
  expect(
    /function gate\(\)[\s\S]*?if \(!consent\)[\s\S]*?return false;/.test(flow) &&
      uses(flow, "if (!gate()) return;") === 2,
    "and both go through the consent gate: nothing is public until the holder has said so",
  );
  expect(
    !/useEffect\([^)]*\)\s*=>\s*\{[^}]*ensureShare/.test(flow),
    "no effect creates a share: the default selection creates nothing",
  );
  expect(
    /const popup = isMail \? null : window\.open\("", "_blank"\);[\s\S]*?const link = await ensureShare\(\);/.test(
      flow,
    ) && /data-social-popup-blocked/.test(flow),
    "the destination window is opened inside the click, before the await; a blocked one is shown as a link",
  );
  // One frame, one file: the set machinery is gone.
  expect(
    !/socialCardPages|data-social-set|data-social-page|PageFrame|files\[i\]|imageOf|setSummary/.test(
      flow,
    ) &&
      uses(flow, "<SocialFrame") === 1 &&
      /shareFromDevice\(\)/.test(flow) &&
      /downloadBlob\(prepared, prepared\.name\)/.test(flow),
    "the flow previews one Passport, shares one file and saves one file",
  );
  expect(
    /async function shareFromDevice\(\)[\s\S]*?AbortError"\) return;/.test(flow) &&
      !/async function shareFromDevice\(\)[\s\S]{0,900}downloadBlob/.test(flow),
    "cancelling the device share is a decision: it returns and downloads nothing",
  );
  expect(
    /<PassportGroupList/.test(flow) && /data-social-export/.test(flow),
    "the whole Passport is also given in words: every group and credential, nothing dropped",
  );
  expect(
    /const prepared = svg && file && file\.svg === svg \? file\.file : null;/.test(flow),
    "the file handed over is the one made from the SVG on screen, and nothing else",
  );
  expect(
    !/includeLink|socialLinkUrl|onCreateSocialLink|setSocialLink/.test(route) &&
      /verifyUrl: null,/.test(route),
    "the page no longer prints a private link into the image",
  );
  expect(
    /holderLabel: "full_name"/.test(flow) &&
      !/anonymous|initials/.test(
        flow.slice(flow.indexOf("<SocialFrame"), flow.indexOf("</figure>")),
      ),
    "the personal flow offers no anonymity or initials choice",
  );
  const model = readFileSync("src/lib/security-passport/social.ts", "utf8");
  expect(
    !/socialCardPages|SOCIAL_CREDENTIALS_PER_IMAGE|SocialCardPage|\.slice\(0, 3\)/.test(model),
    "the model has no page, no per-image count and no cut",
  );
}

// ── 15: the number, the founder line and no "no title" sentence ──────────
for (const lang of ["sv", "en"] as const) {
  const base = card([SIRA, VU1, CPP, OV], null, lang);
  for (const spec of SHARE_FORMATS) {
    const plain = textOf(draw(base, spec.id, lang, null)).join(" ");
    expect(
      !/#\d/.test(plain) && !plain.includes(passportT("rec.designation.founder", lang)),
      `${lang}/${spec.id}: no number and no founder line unless the server assigned them`,
    );
    expect(
      !plain.includes(passportT("identity.none", lang)),
      `${lang}/${spec.id}: a card without a title never says "no active professional title"`,
    );
    const founder = draw(
      { ...base, passportNumber: 1, designation: "founder" },
      spec.id,
      lang,
      null,
    );
    const words = textOf(founder).join(" ");
    expect(
      words.includes(`${passportT("rec.passportNumber", lang)} #1`) &&
        words.includes(passportT("rec.designation.founder", lang)),
      `${lang}/${spec.id}: the founder card says "Security Passport #1" and the designation on its own line`,
    );
    expect(
      shieldsOf(founder).length === shieldsOf(draw(base, spec.id, lang, null)).length,
      `${lang}/${spec.id}: the designation changes no credential and no verification`,
    );
    const ordinary = textOf(draw({ ...base, passportNumber: 7 }, spec.id, lang, null)).join(" ");
    expect(
      ordinary.includes(`${passportT("rec.passportNumber", lang)} #7`) &&
        !ordinary.includes(passportT("rec.designation.founder", lang)),
      `${lang}/${spec.id}: an ordinary holder has a number and no designation`,
    );
  }
}

// ── No link unless the model carries one ─────────────────────────────────
for (const lang of ["sv", "en"] as const) {
  const none = card([SIRA, VU1, CPP, OV], null, lang);
  const linked = card([SIRA, VU1, CPP, OV], LINK, lang);
  for (const spec of SHARE_FORMATS) {
    const plain = draw(none, spec.id, lang, QR);
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
    expect(
      new RegExp(`<image\\b[^>]*href="${QR.replace(/[+/=.]/g, "\\$&")}"`).test(withLink),
      `${lang}/${spec.id}: a chosen link draws exactly the QR code it was given`,
    );
    expect(textOf(withLink).join("").includes(LINK), `${lang}/${spec.id}: and prints the link`);
    expect(
      textOf(withLink).join(" ").includes(passportT("card.verifyAtSource", lang)) &&
        !textOf(withLink).join(" ").includes(passportT("social.snapshotNote", lang)),
      `${lang}/${spec.id}: and says to check the status at the source`,
    );
    expect(
      !/<image\b/.test(draw(linked, spec.id, lang, null)),
      `${lang}/${spec.id}: no QR code is drawn before it exists`,
    );
    expect(
      shieldsOf(withLink).length === 4,
      `${lang}/${spec.id}: the link and QR code displace no credential`,
    );
  }
}

// ── A long name stays inside its space ───────────────────────────────────
{
  const LONG_HOLDER: PassportHolder = {
    ...holder,
    displayName: "Alexandra Konstantinopoulou-Lindqvist",
  };
  const LONG_WORD = presented("long", {
    title: "Säkerhetsskyddsutbildningsintygskurs",
    code: null,
    jurisdiction: "SE",
  });
  for (const lang of ["sv", "en"] as const)
    for (const spec of SHARE_FORMATS) {
      const options = {
        privacyMode: "full_name" as const,
        anonymousLabel: passportT("share.anonymousLabel", lang),
        verifyUrl: null,
      };
      const named = draw(
        buildSelectedSocialCard(LONG_HOLDER, "2026-09-29", [SIRA, VU1, CPP], options),
        spec.id,
        lang,
        null,
      );
      const namedWidth = Number(/<svg\b[^>]*width="(\d+)"/.exec(named)?.[1]);
      const nameLines = [...named.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
        .map((m) => ({ attrs: m[1] ?? "", text: m[2] ?? "" }))
        .filter((t) => t.text.includes("Konstantinopoulou"));
      expect(
        nameLines.length === 1 &&
          nameLines.every(
            (t) =>
              num(t.attrs, "x") + t.text.length * num(t.attrs, "font-size") * 0.62 <= namedWidth,
          ),
        `${lang}/${spec.id}: the holder's long name stays inside the card`,
      );
      const svg = draw(
        buildSelectedSocialCard(holder, "2026-09-29", [SIRA, LONG_WORD, CPP, VU1], options),
        spec.id,
        lang,
        null,
      );
      const long = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
        .map((m) => ({ attrs: m[1] ?? "", text: m[2] ?? "" }))
        .filter((t) => t.text.startsWith("Säkerhetsskydds"));
      const base = spec.width > spec.height ? spec.width / 1200 : spec.width / 1080;
      expect(
        long.length === 1 && num(long[0]!.attrs, "font-size") >= READABILITY_FLOOR * base - 0.05,
        `${lang}/${spec.id}: one long word is drawn smaller or shortened, never below the floor and never past its cell`,
      );
    }
}

// ── Only the card ground, and plain attributes ───────────────────────────
{
  const svg = draw(card([SIRA, VU1], LINK, "sv"), "og", "sv", QR);
  expect(
    /<linearGradient id="sp-social-ground"/.test(svg),
    "the image is drawn on the card ground",
  );
  expect(
    !/<style\b|@import|url\(https?:|<foreignObject|<script\b/.test(svg),
    "the image references no stylesheet, font, external image or script",
  );
  expect(
    /<title id="sp-passport-title">Security Passport · Nadia Fiktiv<\/title>/.test(svg) &&
      /<desc id="sp-passport-desc">[^<]*Dubai, UAE: SIRA Security Cadre Card — Security Guard \(Dokumenterad\)[^<]*Sverige: Väktarutbildning 1 \(EGEN UPPGIFT\)/.test(
        svg,
      ),
    "the image carries its own accessible description: the holder, then every group and credential with its trust word",
  );
}

if (errors.length > 0) {
  console.error("passport-social-image-check FAILED");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`passport-social-image-check: ${assertions} assertions passed`);
