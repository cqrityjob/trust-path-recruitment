// The credential shield system: scope, constellation, trust treatment, and
// the disclosure boundary.
//
// ── WHAT THIS PROVES AND WHAT IT LEAVES TO THE BROWSER ─────────────────
//
// The rules here are enumerable, so they are enumerated: every credential
// count from 0 to 30, every jurisdiction the product knows and one it does
// not, every presentation state. The browser suite
// (e2e/passport-overview-acceptance.spec.ts) proves the same rules survive
// layout at 390, 768 and 1440; it cannot cheaply walk thirty counts.
//
// ── WHY THE NEGATIVE CASES ARE THE POINT ───────────────────────────────
//
// "Shows shields" is easy to satisfy. The defects worth guarding are the
// quiet ones: an expired licence drawn as current, a blank jurisdiction
// wearing a globe, a shared view whose "+N" counts what the holder chose NOT
// to share. Each has an assertion below and a mutation in
// negative-controls/passport-credential-shield-controls.ts.
//
// Run: bun run passport-credential-shield:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { PassportLangProvider } from "../src/lib/security-passport/use-passport-copy";
import {
  SHIELD_SLOTS,
  constellationOf,
  isCurrentShield,
  resolveCredentialScope,
  shieldMarkText,
} from "../src/lib/security-passport/credential-shield";
import {
  CredentialConstellation,
  CredentialShield,
  type ShieldCredential,
} from "../src/components/security-passport/CredentialShield";
import { RecipientPassportCard } from "../src/components/security-passport/live/RecipientPassportCard";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";
import {
  CREDENTIAL_PRESENTATION_STATES,
  type CredentialPresentationState,
} from "../src/lib/security-passport/design/credential-symbols";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const failures: string[] = [];
let assertions = 0;
function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

const html = (node: React.ReactNode, lang: "sv" | "en" = "en") =>
  renderToStaticMarkup(
    <I18nProvider>
      <PassportLangProvider lang={lang}>{node}</PassportLangProvider>
    </I18nProvider>,
  );

function shield(
  id: string,
  over: Partial<ShieldCredential> & { global?: boolean; j?: string | null; sub?: string | null },
): ShieldCredential {
  return {
    id,
    code: null,
    name: `Credential ${id}`,
    state: "self_declared",
    lifecycle: "active",
    validUntil: null,
    scope: resolveCredentialScope(
      { global: over.global, jurisdictionCode: over.j ?? null, subJurisdictionCode: over.sub },
      "en",
    ),
    ...over,
  };
}

/* ------------------------------------------------------------------ */
console.log("\n1 · scope: a flag is a cue, the written label is the fact");

for (const [input, flag, en, sv] of [
  [{ jurisdictionCode: "SE" }, "SE", "Sweden", "Sverige"],
  [{ jurisdictionCode: "GB" }, "GB", "Great Britain", "Storbritannien"],
  [
    { jurisdictionCode: "GB", subJurisdictionCode: "GB-NI" },
    "GB",
    "Northern Ireland",
    "Nordirland",
  ],
  [{ jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" }, "AE", "Dubai", "Dubai"],
] as const) {
  const e = resolveCredentialScope(input, "en");
  const s = resolveCredentialScope(input, "sv");
  check(
    e.kind === "jurisdiction" && e.flag === flag && e.label === en && s.label === sv,
    `${input.subJurisdictionCode ?? input.jurisdictionCode}: ${flag} flag, "${en}" / "${sv}"`,
  );
}
check(
  resolveCredentialScope({ jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" }, "en").code ===
    "AE-DU",
  "a local credential keeps its EXACT jurisdiction — Dubai is not flattened to the UAE",
);

const globalScope = resolveCredentialScope({ global: true, jurisdictionCode: "SE" }, "en");
check(
  globalScope.kind === "global" && globalScope.flag === null && globalScope.label === "Global",
  "a global certification gets the globe and NO national flag, even if a country is stored",
);
const blank = resolveCredentialScope({ jurisdictionCode: null }, "en");
check(
  blank.kind === "not_stated" && blank.flag === null,
  "a blank jurisdiction is 'not stated' — it never becomes global by omission",
);
const future = resolveCredentialScope({ jurisdictionCode: "no" }, "en");
check(
  future.kind === "jurisdiction" && future.flag === null && future.label === "NO",
  "an unknown future jurisdiction fails safely: no flag, the code as the label",
);
const futureHtml = html(<CredentialShield credential={shield("f", { j: "NO" })} ground="navy" />);
check(
  /data-scope-mark="generic"/.test(futureHtml) && !/<img\b/.test(futureHtml),
  "and renders the generic marker — never an image that could break",
);
const globalHtml = html(
  <CredentialShield
    credential={shield("g", { global: true, code: "INTL_ASIS_CPP" })}
    ground="navy"
  />,
);
check(
  /data-scope-mark="globe"/.test(globalHtml) &&
    !/data-flag=/.test(globalHtml) &&
    />CPP</.test(globalHtml) &&
    />Global</.test(globalHtml),
  "the global shield draws a globe, the governed abbreviation and the word Global",
);
check(
  !/<img\b|https?:\/\//.test(
    read("src/components/security-passport/CredentialShield.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, ""),
  ),
  "no flag is fetched and no issuer logo is loaded: everything is drawn in the file",
);

check(
  shieldMarkText({ code: "INTL_ASIS_CPP", name: "anything" }) === "CPP" &&
    shieldMarkText({ code: null, name: "SIA Licence — Security Guarding" }) === "SIA" &&
    shieldMarkText({ code: "AE_X", name: "SIRA Security Guard Card" }) === "SIRA",
  "the abbreviation is the governed mark, else one already written in the credential's name",
);
check(
  shieldMarkText({ code: "GB_SIA_SG", name: "Security Guarding Licence" }) === null &&
    shieldMarkText({ code: "SE_P", name: "Personalgodkännande" }) === null,
  "and is never composed from initials or sliced from a database code",
);

/* ------------------------------------------------------------------ */
console.log("\n2 · the constellation: four slots, at every count");

for (let n = 0; n <= 30; n += 1) {
  const all = Array.from({ length: n }, (_, i) => shield(`c${i}`, { j: "SE" }));
  const { shown, overflow } = constellationOf(all);
  const expectShown = n <= SHIELD_SLOTS ? n : SHIELD_SLOTS - 1;
  const ok =
    shown.length === expectShown &&
    overflow === n - expectShown &&
    shown.length + (overflow > 0 ? 1 : 0) <= SHIELD_SLOTS;
  if (!ok || n <= 5 || n === 30) {
    check(
      ok,
      `${n} current → ${expectShown} shields${n > SHIELD_SLOTS ? ` and +${n - expectShown}` : ""}`,
    );
  } else {
    assertions += 1;
  }
}
const eight = Array.from({ length: 8 }, (_, i) => shield(`e${i}`, { j: "SE" }));
const eightHtml = html(<CredentialConstellation credentials={eight} ground="navy" />);
check(
  (eightHtml.match(/data-credential-shield=/g) ?? []).length === 3 &&
    /data-shield-overflow="5"/.test(eightHtml) &&
    /\+5 more current credentials/.test(eightHtml),
  "eight render as three shields and an exact, worded +5",
);
check(
  /Inga aktuella meriter ännu/.test(
    html(<CredentialConstellation credentials={[]} ground="navy" />, "sv"),
  ) &&
    /No current credentials yet/.test(
      html(<CredentialConstellation credentials={[]} ground="navy" />),
    ),
  "none renders one calm empty state, in both languages",
);
const linked = html(
  <CredentialConstellation
    credentials={eight}
    ground="navy"
    overflow={(node, label) => (
      <a href="/passport#merits" aria-label={label}>
        {node}
      </a>
    )}
  />,
);
check(
  /<a href="\/passport#merits" aria-label="\+5 more current credentials">/.test(linked),
  "the caller decides what +N does — on the holder's card, a focusable link to Credentials",
);

/* ------------------------------------------------------------------ */
console.log("\n3 · only what is held NOW is a shield");

for (const lifecycle of ["draft", "expired", "revoked", "superseded", "disputed", "archived"]) {
  check(!isCurrentShield({ lifecycle }), `${lifecycle} is not current`);
}
const mixed = [
  shield("live", { j: "SE" }),
  shield("expired", { j: "SE", lifecycle: "expired", state: "expired" }),
  shield("revoked", { j: "SE", lifecycle: "revoked", state: "revoked" }),
  shield("replaced", { j: "SE", lifecycle: "superseded", state: "superseded" }),
  shield("draft", { j: "SE", lifecycle: "draft", state: "draft" }),
];
const mixedHtml = html(<CredentialConstellation credentials={mixed} ground="navy" />);
check(
  (mixedHtml.match(/data-credential-shield=/g) ?? []).length === 1 &&
    /data-credential-shield="live"/.test(mixedHtml) &&
    !/data-shield-overflow/.test(mixedHtml),
  "one live credential among four that are history: one shield, and no +N hinting at the rest",
);

const ordered = constellationOf([
  shield("a-self", { j: "SE" }),
  shield("b-doc", { j: "SE", state: "documented" }),
  shield("c-self", { j: "SE" }),
  shield("d-verified", { j: "SE", state: "verified" }),
  shield("e-doc", { j: "SE", state: "documented" }),
]);
check(
  ordered.shown.map((c) => c.id).join() === "d-verified,b-doc,e-doc" && ordered.overflow === 2,
  "what was checked leads; inside one standing the caller's own order is kept",
);
check(
  constellationOf([...mixed].reverse())
    .shown.map((c) => c.id)
    .join() === "live",
  "and the choice is deterministic — it does not depend on anything but the input",
);

/* ------------------------------------------------------------------ */
console.log("\n4 · trust is shape and words, never colour alone");

const render = (state: CredentialPresentationState) =>
  html(<CredentialShield credential={shield("t", { j: "SE", state })} ground="navy" />);
const mark = (h: string) => h.match(/<svg[^>]*data-shield-mark[\s\S]*?<\/svg>/)?.[0] ?? "";
const [v, d, s] = [render("verified"), render("documented"), render("self_declared")];
check(
  !/stroke-dasharray/.test(mark(v)) &&
    !/stroke-dasharray/.test(mark(d)) &&
    /stroke-dasharray/.test(mark(s)),
  "self-declared is dashed; documented and verified are solid",
);
check(
  // The inner rim starts at "M22 8"; the check at "M15 22.5"; the document at "M16.5 14".
  /d="M22 8 /.test(mark(v)) &&
    /d="M15 22\.5/.test(mark(v)) &&
    !/d="M22 8 /.test(mark(d)) &&
    /d="M16\.5 14/.test(mark(d)) &&
    (mark(s).match(/<path/g) ?? []).length === 1,
  "verified carries a doubled rim and a check, documented a document glyph, self-declared nothing",
);
check(
  />VERIFIED</.test(v) && />DOCUMENT PROVIDED</.test(d) && />SELF-DECLARED</.test(s),
  "each prints its status WORD beside the mark",
);
check(
  new Set([v, d, s].map((h) => h.match(/aria-label="([^"]+)"/)?.[1])).size === 3 &&
    /role="img"/.test(s) &&
    /title="/.test(s),
  "and says it in an accessible name and a tooltip, distinct per standing",
);
const expiring = html(
  <CredentialShield
    credential={shield("x", { j: "SE", name: "SIA Licence", validUntil: "2026-10-20" })}
    ground="surface"
  />,
);
check(
  /aria-label="SIA Licence · Sweden · SELF-DECLARED · Active · valid until 20 Oct 2026"/.test(
    expiring,
  ),
  "the full label states name, scope, trust, lifecycle and expiry",
);
for (const state of CREDENTIAL_PRESENTATION_STATES) {
  if (!/data-shield-mark=/.test(render(state))) failures.push(`${state} does not render`);
}
assertions += 1;
const notCurrent = (["expired", "revoked", "superseded"] as const).map((st) => mark(render(st)));
check(
  notCurrent.every((m) => m !== mark(v) && m !== mark(d) && m !== mark(s)) &&
    /M9 37 35 7/.test(notCurrent[1]!),
  "expired, revoked and superseded each look unlike any current standing; revoked is struck through",
);

/* ------------------------------------------------------------------ */
console.log("\n5 · a shared view counts only what was disclosed");

const claimOf = (i: number, title: string) => ({
  key: `c${i}`,
  type: "licence",
  title,
  credential_code: null,
  issuer: "Issuer",
  jurisdiction: "SE",
  sub_jurisdiction: null,
  scope_limited: false,
  authorisation_scope: null,
  issued_on: "2025-01-01",
  valid_until: null,
  assertion: "self_declared",
  lifecycle: "active",
  verified_at: null,
  verifier_organisation: null,
  verification_method: null,
});
// The holder has nine. Six were chosen. The three withheld titles exist in
// this file ONLY so the assertion can look for them.
const DISCLOSED = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
const WITHHELD = ["Withheld-Golf", "Withheld-Hotel", "Withheld-India"];
const payload = {
  status: "active",
  package: "selected_merits",
  focus: "passport",
  purpose: null,
  locale: "en",
  expires_at: "2026-10-17",
  authorised_at: "2026-09-17",
  last_updated: "2026-09-17",
  holder: "Mostafa Alshawi",
  privacy_mode: "full_name",
  profession_slug: null,
  jurisdiction: "SE",
  sub_jurisdiction: null,
  verified_claims: DISCLOSED.map((t, i) => claimOf(i, t)),
  verified_experience: [],
  verified_experience_days: 0,
  rules: [],
} as unknown as RecipientPayloadActive;
const recipient = html(
  <RecipientPassportCard presentation={buildRecipientPresentation(payload, "2026-09-17")} />,
);
const region = recipient.match(/data-recipient-shields[\s\S]*?<\/ul>/)?.[0] ?? "";
check(
  (region.match(/data-credential-shield=/g) ?? []).length === 3 &&
    /data-shield-overflow="3"/.test(region),
  "six disclosed → three shields and +3",
);
check(
  !/\+[4-9]\b/.test(region) && WITHHELD.every((t) => !recipient.includes(t)),
  "never a count of the holder's whole collection, and no withheld title anywhere",
);
check(!/<a\b/.test(region), "the recipient's +N is a count, not a link — there is nowhere to go");
// ── DEFINITION → PAYLOAD → MODEL → SHIELD ────────────────────────────
// The payload's `scope_code` (20261125090000) is what a recipient card draws
// a globe from. A blank jurisdiction alone is not global; an older payload
// without the key is unknown, and unknown wears no scope at all.
{
  const scoped = buildRecipientPresentation(
    {
      ...(payload as unknown as Record<string, unknown>),
      verified_claims: [
        {
          ...claimOf(0, "CPP"),
          credential_code: "INTL_ASIS_CPP",
          jurisdiction: null,
          scope_code: "global_professional",
        },
        { ...claimOf(1, "OV"), credential_code: "OV", scope_code: "national_regulated" },
        {
          ...claimOf(2, "SIRA course"),
          credential_code: "AE_DU_BASIC_FIRE_SAFETY",
          jurisdiction: "AE",
          sub_jurisdiction: "AE-DU",
          scope_code: "national_regulated",
        },
        {
          ...claimOf(3, "Old share, no key"),
          credential_code: "INTL_ASIS_PSP",
          jurisdiction: null,
        },
      ],
    } as unknown as RecipientPayloadActive,
    "2026-09-17",
  );
  check(
    scoped.credentials.map((c) => c.definitionScope).join() === "global,national,national,unknown",
    "the model reads the definition's scope from the payload and nothing else",
  );
  const card = html(<RecipientPassportCard presentation={scoped} />);
  // One shield's markup: from its own marker to the next shield, the +N slot
  // or the end of the list — whichever comes first.
  const shieldOf = (key: string) => {
    const start = card.indexOf(`data-credential-shield="${key}"`);
    if (start < 0) return "";
    const rest = card.slice(start + 1);
    const ends = [
      rest.indexOf("data-credential-shield="),
      rest.indexOf("data-shield-overflow"),
      rest.indexOf("</ul>"),
    ].filter((i) => i >= 0);
    return card.slice(start, start + 1 + Math.min(...ends));
  };
  check(
    /data-scope-mark="globe"/.test(shieldOf("c0")) &&
      !/data-flag=/.test(shieldOf("c0")) &&
      />Global</.test(shieldOf("c0")),
    "a disclosed international certification wears the globe and the word Global",
  );
  check(
    /data-flag="SE"/.test(shieldOf("c1")) && />Sweden</.test(shieldOf("c1")),
    "a disclosed Swedish credential keeps its flag and written scope",
  );
  check(
    /data-flag="AE"/.test(shieldOf("c2")) &&
      />Dubai</.test(shieldOf("c2")) &&
      !/United Arab Emirates/.test(shieldOf("c2")),
    "a disclosed Dubai credential keeps the emirate, not the country",
  );
  check(
    !/data-scope-mark=/.test(shieldOf("c3")) && !/>Global</.test(shieldOf("c3")),
    "a payload without the key stays unknown: no globe, no flag, no guessed scope",
  );
}

const cardSrc = read("src/components/security-passport/live/RecipientPassportCard.tsx");
check(
  /credentials=\{presentation\.credentials\.map\(/.test(cardSrc) &&
    !/snapshot|holder\.claims|getMyPassport/.test(cardSrc),
  "the recipient card builds its shields from the DISCLOSED model and cannot reach the holder's",
);
check(
  /<CredentialConstellation/.test(read("src/components/security-passport/CredentialWallet.tsx")) &&
    /<CredentialConstellation/.test(cardSrc),
  "the holder's card and the shared card draw the same component",
);
const share = read("src/routes/_authenticated.passport.share.tsx");
check(
  /\{shareUrl && <SecureShareQr url=\{shareUrl\} \/>\}/.test(share) &&
    !/SecureShareQr|useQrDataUrl/.test(
      read("src/components/security-passport/CredentialWallet.tsx"),
    ),
  "no QR exists until a share link does, and the overview never draws one",
);

/* ------------------------------------------------------------------ */
console.log("\n6 · on a phone, a long credential title never paints over its status");

{
  const list = read("src/components/security-passport/live/RecipientCredentialList.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const head = list.match(/data-recipient-credential-head\s+className="([^"]+)"/)?.[1] ?? "";
  const title = list.match(/data-recipient-credential-title\s+className="([^"]+)"/)?.[1] ?? "";
  const status = list.match(/data-recipient-credential-status\s+className="([^"]+)"/)?.[1] ?? "";
  check(
    /(^| )flex-col( |$)/.test(head) && /sm:flex-row/.test(head) && !/flex-wrap/.test(head),
    "the header is a deliberate stack below sm and a row from sm — not one wrapping row",
  );
  check(
    /\[overflow-wrap:normal\]/.test(title) &&
      /\[word-break:keep-all\]/.test(title) &&
      !/break-all|break-words|overflow-wrap:anywhere/.test(title),
    "the title wraps between words and never inside one",
  );
  check(
    /sm:shrink-0/.test(status) &&
      !/(^| )shrink-0( |$)/.test(status) &&
      /sm:flex-col/.test(status) &&
      /sm:items-end/.test(status),
    "the status sits on its own line on a phone, and keeps its right-hand column on desktop",
  );
}

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`passport-credential-shield-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Passport credential shields: ${assertions} of ${assertions} assertions passed.`);
