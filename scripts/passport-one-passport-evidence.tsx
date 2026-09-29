// Security Passport — the ONE-Passport image, rendered for owner review.
//
// Run: bun run scripts/passport-one-passport-evidence.tsx [out-dir]
//
// Writes the owner's scenarios (A: four credentials of one jurisdiction; B/C:
// six across Sweden and the international group; D: eight across three
// groups; E: the densest realistic holder, eleven across three groups; and a
// fifteen-credential stress case) as SVG files in every share format and
// both languages, exactly as SocialCardSvg draws them -- the same component,
// the same fixtures as scripts/passport-social-image-check.tsx. Rasterise
// them with any browser (docs/passport/one-passport-evidence/README.md says
// how the committed PNGs were made). No browser is needed to run this.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialCardSvg } from "../src/components/security-passport/social/SocialCardSvg";
import { SHARE_FORMATS } from "../src/lib/security-passport/social-export";
import { socialImageStrings } from "../src/lib/security-passport/share-image";
import { buildSelectedSocialCard } from "../src/lib/security-passport/social";
import type { RecipientCredential } from "../src/lib/security-passport/recipient-presentation";
import { passportT, type PassportLang } from "../src/lib/security-passport/i18n";
import { deriveVerifiedIdentity } from "../src/lib/security-passport/identity/visibility";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import type { PassportHolder } from "../src/lib/security-passport/types";

const OUT = process.argv[2] ?? "artifacts/one-passport-evidence";
mkdirSync(OUT, { recursive: true });

/** A fictional holder. The name is invented; nothing here is a real record. */
const holder: PassportHolder = {
  id: "h-evidence",
  displayName: "Mostafa Exempel",
  professionSlug: "vaktare",
  identity: deriveVerifiedIdentity([], MIRRORED_TITLE_RULES, "2026-09-29"),
  jurisdictionCode: "SE",
  subJurisdictionCode: null,
  periods: [],
  claims: [],
  hasCareerDiscoveryResult: false,
};

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

const SCENARIOS: Readonly<Record<string, readonly RecipientCredential[]>> = {
  "A-4-one-jurisdiction": [VU1, VU2, OV, SV],
  "B-6-two-groups": [VU1, VU2, OV, CPP, PSP, PCI],
  "C-sweden-and-international": [VU1, VU2, OV, CPP, PSP, PCI],
  "D-8-three-groups": [VU1, VU2, OV, CPP, PSP, PCI, SIRA, SIRA_SUP],
  "E-11-densest": [VU1, VU2, OV, SV, CPP, PSP, PCI, CC, CAMS, SIRA, SIRA_SUP],
  "F-15-stress": [
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
  "one-credential": [VU1],
  "three-mixed": [SIRA, VU1, CPP],
};

const LINK = `https://app.example/p#${"ab".repeat(32)}`;
const QR = "data:image/png;base64,iVBORw0KGgo=";
const rows: string[] = [];
for (const lang of ["sv", "en"] as const satisfies readonly PassportLang[]) {
  const pt = (key: Parameters<typeof passportT>[0]) => passportT(key, lang);
  for (const [name, credentials] of Object.entries(SCENARIOS)) {
    for (const withLink of [false, true]) {
      const model = buildSelectedSocialCard(holder, "2026-09-29", credentials, {
        privacyMode: "full_name",
        anonymousLabel: passportT("share.anonymousLabel", lang),
        verifyUrl: withLink ? LINK : null,
      });
      for (const spec of SHARE_FORMATS) {
        const svg = renderToStaticMarkup(
          <SocialCardSvg
            model={model}
            format={spec.id}
            lang={lang}
            strings={socialImageStrings(model, lang, pt)}
            qrDataUrl={withLink ? QR : null}
          />,
        );
        const file = `${name}-${spec.id}-${lang}${withLink ? "-link" : ""}.svg`;
        writeFileSync(join(OUT, file), svg);
        const attr = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(svg)?.[1] ?? "?";
        rows.push(
          `${file.padEnd(44)} tier=${attr("data-passport-tier").padEnd(8)} fits=${attr("data-passport-fits").padEnd(5)} groups=${attr("data-passport-groups")} shields=${(svg.match(/data-passport-shield=/g) ?? []).length}`,
        );
      }
    }
  }
}
writeFileSync(join(OUT, "index.txt"), `${rows.join("\n")}\n`);
console.log(`${rows.length} images written to ${OUT}`);
