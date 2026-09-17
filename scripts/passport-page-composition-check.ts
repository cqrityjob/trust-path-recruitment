// The Security Passport page: exactly ONE Passport.
//
// ── WHAT THE OWNER ASKED FOR (2026-09-17) ──────────────────────────────
//
//   Main column   the ONE premium Passport identity surface, the two
//                 actions near the top (add a credential, preview and
//                 share), and the credential wallet with each record's
//                 truthful trust and lifecycle state.
//   Side column   the next step, and the privacy/sharing status. NOT a
//                 second Passport.
//
// The earlier sketch put a complete compact Passport card in the side
// column, directly beside the large identity surface that already states
// the holder's name and title. Two Passports on the page that IS the
// Passport -- and the second was an empty selection. The recipient-style
// rendering belongs to Preview and share, where a selection exists for it
// to show, so this guard now asserts its ABSENCE here as firmly as it used
// to assert its presence.
//
// ── WHY THIS READS SOURCE ──────────────────────────────────────────────
//
// The page is a route: it reads the holder's Passport through a server
// function and composes components that need a full PassportSnapshot --
// profile, holder, derived professional identity and all. A fixture large
// enough to render it here would be a second, drifting definition of the
// holder, and the guard would then be asserting the fixture.
//
// So the LAYOUT CONTRACT is asserted from source, and the rendered proof for
// this page is CI's browser suites, which run it for real against a stack.
// What source can prove is exactly what tends to regress: a region that
// stops being rendered, an action that gains a second copy, a writer that
// gets duplicated into a summary, and a label that collides with another
// product's.
//
// Run: bun run passport-page-composition:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const INDEX = "src/routes/_authenticated.passport.index.tsx";
const SIDE = "src/components/security-passport/PassportSideColumn.tsx";
const WORKSPACE = "src/components/security-passport/CredentialWallet.tsx";
const SHELL = "src/routes/_authenticated.passport.tsx";
const PASSPORT_I18N = "src/lib/security-passport/i18n.ts";
const APP_I18N = "src/i18n/dictionaries.ts";

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");
}

const index = code(read(INDEX));
const side = code(read(SIDE));
const workspace = code(read(WORKSPACE));

/* ------------------------------------------------------------------ */
console.log("\n1 · the two columns exist, and the sketch's left column is the left column");

check(/<PassportSideColumn/.test(index), "the Passport page renders a side column");
check(
  /<PassportSideColumn\s+part="steps"/.test(index) &&
    /<PassportSideColumn\s+part="privacy"/.test(index),
  "both halves of the side column are mounted: the steps in the panel, privacy under the card",
);
check(/<CredentialWallet/.test(index), "and the Passport workspace");
check(
  /max-w-\[1280px\]/.test(index) &&
    /lg:grid-cols-\[minmax\(0,1\.08fr\)_minmax\(0,1fr\)\]/.test(workspace),
  "the overview uses the desktop width, and the card and its panel form a two-column region",
);
check(
  !/lg:order-[12]/.test(index) &&
    /data-premium-credential-record/.test(
      read("src/components/security-passport/CredentialRecord.tsx"),
    ),
  "the responsive wallet uses one markup and never reorders identity behind the credential list",
);

// SOURCE ORDER IS THE MOBILE ORDER. On a phone the holder's own record is
// what they came for; a card preview above it pushes every merit off the
// first screen. So the workspace must come FIRST in source.
const wsIdx = index.indexOf("<CredentialWallet");
const sideIdx = index.indexOf("<PassportSideColumn");
check(wsIdx >= 0 && sideIdx >= 0, "both are rendered at all");
check(
  wsIdx >= 0 && sideIdx >= 0 && wsIdx < sideIdx,
  "the workspace comes first in source, so one column at 375px reads record-then-card",
);

/* ------------------------------------------------------------------ */
console.log("\n2 · ONE Passport: the side column is a next step and a sharing status");

const PREVIEW = "src/components/security-passport/SecurityPassportPreview.tsx";
const SHARE = "src/routes/_authenticated.passport.share.tsx";
const CARD_ROUTE = "src/routes/_authenticated.passport.card.tsx";
check(
  !/SecurityPassportPreview/.test(side) && !/SecurityPassportPreview/.test(index),
  "no second Passport card beside the identity surface — not in the side column, not in the route",
);
check(
  !/RecipientPassportView|PassportCard\b/.test(side + index),
  "and no recipient-style rendering on the overview either",
);
check(
  (workspace.match(/<h1\b/g) ?? []).length === 1 && !/<h1\b/.test(side),
  "the identity surface owns the page's only h1",
);
check(
  /data-passport-next-step=\{next\.kind\}/.test(side),
  "the side column opens with the next step",
);
check(
  /credentialProductStatus\(/.test(side) &&
    /credentialPassportHolder\(snapshot\.holder\)/.test(side),
  "derived from the SAME status function and the same claims as the wallet rows",
);
check(/data-passport-privacy-summary/.test(side), "and an integrity/privacy region");
check(
  side.indexOf("data-passport-next-step") < side.indexOf("data-passport-privacy-summary"),
  "with the sharing status BELOW the next step",
);
check(
  /RecipientPassportView/.test(code(read(SHARE))),
  "the recipient-style Passport lives under Preview and share",
);
check(
  /redirect\(\{ to: "\/passport\/share", replace: true \}\)/.test(code(read(CARD_ROUTE))) &&
    !/SecurityPassportPreview/.test(code(read(CARD_ROUTE))),
  "and the retired /passport/card sends its visitors there rather than being a second preview",
);
check(
  /variant = "preview"/.test(code(read(PREVIEW))) &&
    /variant === "summary"/.test(code(read(PREVIEW))),
  "the compact card distinguishes a selection preview from the My Career summary",
);
check(
  /share\.privacy\.\$\{profile\.privacyMode\}/.test(side) || /share\.privacy\.\$\{/.test(side),
  "the privacy region states the mode actually in force, not a generic sentence",
);

/* ------------------------------------------------------------------ */
console.log("\n3 · one writer — the summary reports, it does not duplicate");

check(
  !/setPrivacyMode/.test(side),
  "the side column does NOT write the privacy mode — the page that owns it does",
);
check(/to="\/passport\/privacy"/.test(side), "it links to the canonical privacy editor instead");
check(
  /to="\/passport\/share"/.test(side) && !/to="\/passport\/card"/.test(side + workspace),
  "and to Preview and share — never to the retired second preview",
);
check(
  /\{ to: "\/passport\/share", sv: "Förhandsvisa och dela", en: "Preview and share" \}/.test(
    code(read(SHELL)),
  ),
  "the Passport navigation's Preview and share opens the sharing flow",
);
check(
  !/getMyPassport/.test(side),
  "it reads nothing of its own: the snapshot is passed in, so there is no second request",
);

/* ------------------------------------------------------------------ */
console.log("\n4 · one card, and the actions in the panel beside it");

check(/to="\/passport\/credentials\/new"/.test(workspace), "add a credential is offered");
check(/data-cta="share"/.test(workspace), "and sharing the Passport");
check(
  (workspace.match(/data-cta="share"/g) ?? []).length === 1,
  "share appears exactly once — not one control per region",
);
// ── THE OWNER'S CORRECTION, 2026-09-17 ──────────────────────────────────
// The card is a fixed visual object: no action control sits inside it. The
// actions are the panel's. The single element in the card that can be
// followed is the "+N" shield — a link to the rest of what the card
// summarises — and the guard names it rather than allowing "a link".
const headerStart = workspace.indexOf("<header");
const headerEnd = workspace.indexOf("</header>");
const header =
  headerStart >= 0 && headerEnd > headerStart ? workspace.slice(headerStart, headerEnd) : "";
const panelIdx = workspace.indexOf("data-passport-panel");
const actionsIdx = workspace.indexOf("data-passport-actions");
check(
  header.length > 0 &&
    !/<(a|button|input|select|textarea)\b|role="(tab|button|menu)|onClick=/.test(header),
  "the Passport card contains no button, input or action control",
);
check(
  (header.match(/<Link\b/g) ?? []).length === 1 &&
    /<Link\s+to="\/passport"\s+hash="merits"\s+data-shield-overflow-link/.test(header),
  'and its only link is the "+N" shield, which goes to Credentials',
);
check(
  panelIdx > headerEnd &&
    actionsIdx > panelIdx &&
    workspace.indexOf('to="/passport/credentials/new"') > actionsIdx &&
    workspace.indexOf('data-cta="share"') > actionsIdx &&
    workspace.indexOf('data-cta="edit-in-profile"') > actionsIdx,
  "add, share and edit-current-role sit in the action panel, after the card",
);
check(
  (workspace.match(/to="\/passport\/credentials\/new"/g) ?? []).length === 1 &&
    !/to="\/passport\/credentials\/new"/.test(side),
  "there is exactly ONE Add credential on the overview — the panel's",
);
check(
  /lg:grid-cols-\[minmax\(0,1\.08fr\)_minmax\(0,1fr\)\]/.test(workspace) &&
    workspace.indexOf("<header") < panelIdx &&
    panelIdx < workspace.indexOf("data-passport-under-card") &&
    workspace.indexOf("data-passport-under-card") < workspace.indexOf('id="merits"'),
  "source order is card, panel, privacy, collection — which is the order on a phone",
);

check(
  !/passport\/entry/.test(side) && !/entryId/.test(side),
  "the side column links to NO claim — the credential row owns the one claim-specific link",
);
// ── A VISIBLE ACTION NEVER LEADS TO AN EMPTY REGION ─────────────────────
// 1317be8 pointed these two steps at `#attention`, which renders nothing for
// a self-reported credential with no review outcome. They go to the
// credential's OWN ROW, and because locating a record is all they do, they
// are labelled "View credential" and nothing stronger.
check(
  (side.match(/data-cta="next-step"/g) ?? []).length === 2 &&
    (side.match(/to="\/passport"\s+hash=\{credentialRowAnchor\(next\.claimId\)\}/g) ?? [])
      .length === 1 &&
    (side.match(/\{viewCredential\}/g) ?? []).length === 2 &&
    /next\.kind === "clarify" \|\| next\.kind === "evidence" \?/.test(side),
  "the clarify and evidence steps share ONE action, to that credential's own row on this page",
);
check(
  !/hash="attention"/.test(side) && !/hash="merits"/.test(side),
  "and never to a generic region that may have nothing in it",
);
check(
  (side.match(/\{copy\("Visa meriten", "View credential"\)\}/g) ?? []).length === 1 &&
    !/data-cta="next-step"[\s\S]{0,260}copy\("(Lägg till underlag|Komplettera uppgifter)"/.test(
      side,
    ),
  'labelled truthfully — "Visa meriten" / "View credential" — because they locate, they do not act',
);
check(
  /id=\{credentialRowAnchor\(c\.id\)\}\s+data-credential-row/.test(workspace) &&
    /focus:outline-2/.test(workspace) &&
    /data-\[hash-target\]:/.test(workspace),
  "every credential row carries the anchor, and shows a visible focus state on arrival",
);
{
  const { credentialRowAnchor } = await import("../src/lib/security-passport/credential-passport");
  const ids = ["c-gb-ds", "f1900000-0000-4000-8000-000000000010", "merits", "attention", "a b#c/d"];
  const anchors = ids.map(credentialRowAnchor);
  check(
    new Set(anchors).size === ids.length &&
      anchors.every((a) => /^sp-credential-[A-Za-z0-9_-]+$/.test(a)) &&
      !anchors.includes("merits") &&
      !anchors.includes("attention"),
    "the anchor is one shared function: namespaced, fragment-safe, and cannot collide with a section id",
  );
  check(
    /goToHash\(anchor\)/.test(side) &&
      /export function goToHash/.test(read("src/lib/security-passport/hash-arrival.ts")),
    "a second press re-runs the arrival, so the step is never inert when the fragment is unchanged",
  );
}
check(
  (workspace.match(/to="\/passport\/entry\/\$kind\/\$entryId"/g) ?? []).length === 1,
  "and the wallet renders exactly one claim link per credential row",
);
// The WHOLE page, not only the wallet. The Verification section used to link
// to the claim route too, so a credential with a reviewer's question had two
// claim links. Its outcome now names the credential and goes to that
// credential's row; the row's own action opens the claim.
check(
  /hrefOf=\{\(item\) => `\/passport#\$\{credentialRowAnchor\(item\.subjectId\)\}`\}/.test(index) &&
    !/`\/passport\/entry\/claim\//.test(index),
  "the Verification section sends an outcome to the credential's row, never to a second claim link",
);
check(
  /linkLabel=\{\{ sv: "Visa meriten", en: "View credential" \}\}/.test(index),
  'and says what it does: "Visa meriten" / "View credential"',
);
check(
  /if \(kind !== "claim"\) \{[\s\S]{0,220}\$kind\/\$entryId[\s\S]{0,120}return;[\s\S]{0,200}credentialRowAnchor\(entryId\)/.test(
    index,
  ),
  "its open button does the same for a credential; only an employment period keeps its own route",
);

/* ------------------------------------------------------------------ */
console.log("\n4b · who the person is comes from the Profile; the card never renames them");

const nameTag = workspace.match(/<h1\s[^>]*data-passport-holder-name[\s\S]*?>/)?.[0] ?? "";
check(
  /\[overflow-wrap:normal\]/.test(nameTag) &&
    /\[word-break:keep-all\]/.test(nameTag) &&
    /\[hyphens:none\]/.test(nameTag) &&
    !/overflow-wrap:anywhere|break-all|break-words/.test(nameTag),
  "the holder's name may wrap between words and nowhere else",
);
check(
  /line-clamp-2/.test(nameTag) && /text-\[clamp\(20px,5\.2cqw,30px\)\]/.test(nameTag),
  "two lines then an ellipsis, sized from the card's own width",
);
check(/\[container-type:inline-size\]/.test(header), "the card is the container-query context");
check(
  /const identity = snapshot\.profileIdentity;/.test(workspace) &&
    /const currentRole = \(lang === "sv" \? identity\?\.titleSv : identity\?\.titleEn\)/.test(
      workspace,
    ) &&
    /data-passport-current-role[\s\S]{0,200}\{currentRole\}/.test(header),
  "the primary professional line is the canonical Career Profile's current role",
);
check(
  !/credentialDerivedTitle|headlineTitles|professionLine|joinTitles/.test(header) &&
    workspace.indexOf("data-passport-derived-title") > panelIdx,
  "a credential-derived title never appears on the card — it is the panel's trust layer",
);
check(
  !/identity\.none/.test(workspace) && !/No active professional title/.test(workspace),
  'and "No active professional title" cannot render under anybody\'s name',
);
check(
  /"Nuvarande yrke", "Current professional role"/.test(header) &&
    /"Egen uppgift", "Self-declared"/.test(header),
  "the role says whose statement it is, in both languages",
);
check(
  /"Ändra nuvarande yrke", "Edit current professional role"/.test(workspace) &&
    /href=\{CAREER_PROFILE_PROFESSION_EDIT_HREF\}\s+data-cta="edit-in-profile"/.test(workspace),
  "and the way to change it is the SHARED profession-edit contract, not a re-spelled URL",
);
check(
  !/\/my-career|#profile-basics|hash="profile-basics"|edit=profession/.test(workspace),
  "the wallet spells no Profile URL of its own",
);
{
  const { CAREER_PROFILE_PROFESSION_EDIT_HREF } =
    await import("../src/lib/security-passport/profile-basics");
  const { SECTION_DESTINATIONS } =
    await import("../src/lib/professional-identity/profile-destinations");
  const contract = new URL(CAREER_PROFILE_PROFESSION_EDIT_HREF, "https://x.invalid");
  const profile = new URL(SECTION_DESTINATIONS.profession.href, "https://x.invalid");
  check(
    contract.pathname === profile.pathname &&
      contract.hash === profile.hash &&
      contract.searchParams.get("edit") === "profession" &&
      profile.searchParams.get("edit") === "profession",
    "the Passport's contract and the Profile's own destination name the SAME page, intent and anchor",
  );
  check(
    contract.searchParams.get("from") === "passport",
    "and it still carries the return origin, so the editor can offer the way back",
  );
  const mount = read("src/routes/_authenticated.my-career.profile.tsx");
  check(
    contract.pathname === "/my-career/profile" && /<SecurityCareerProfileCard\b/.test(mount),
    "that page is where the profession editor is actually mounted",
  );
}

/* ------------------------------------------------------------------ */
console.log("\n4c · four tabs");

const shell = code(read(SHELL));
const navBlock = shell.match(/const NAV = \[([\s\S]*?)\n\] as const;/)?.[1] ?? "";
check(
  (navBlock.match(/\ben: "/g) ?? []).join("|") === 'en: "|en: "|en: "|en: "' &&
    /en: "Overview"[\s\S]*en: "Credentials"[\s\S]*en: "Verification"[\s\S]*en: "Share"/.test(
      navBlock,
    ),
  "Overview, Credentials, Verification, Share — in that order and no others",
);
check(
  /also: \["\/passport\/credentials\/new"\]/.test(navBlock) &&
    /also: \["\/passport\/privacy"\]/.test(navBlock),
  "the absorbed routes keep a current tab: the form under Credentials, privacy under Share",
);
check(
  /to: "\/passport\/privacy", sv: "Delning och integritet", en: "Sharing & privacy"/.test(shell),
  "and Sharing & privacy stays reachable from inside Share — nothing was removed",
);
check(/identity\?\.displayName/.test(workspace), "the main column names the holder from Profile");
// Displayed here, edited there. The Passport has no editor for the name or
// the title, and says where the editor is.
check(
  /href=\{CAREER_PROFILE_PROFESSION_EDIT_HREF\}\s+data-cta="edit-in-profile"/.test(workspace),
  "and sends the holder to the Profile to change the role",
);
check(
  !/<(input|textarea|select)\b/.test(workspace) &&
    !/savePassportBasics/.test(workspace + side + index),
  "the Passport overview holds no editor for a Profile fact",
);

/* ------------------------------------------------------------------ */
console.log("\n4d · the jurisdiction is rendered once, by one helper");

const { titleWithJurisdictionOnce } = await import("../src/lib/security-passport/format");
check(
  titleWithJurisdictionOnce("Public Order Guard (Ordningsvakt) · Sweden", "Sweden") ===
    "Public Order Guard (Ordningsvakt) · Sweden",
  "a title that already ends in the country is not given it again",
);
check(
  titleWithJurisdictionOnce("Ordningsvakt", "Sverige") === "Ordningsvakt · Sverige" &&
    titleWithJurisdictionOnce("Ordningsvakt · sverige ", "Sverige") === "Ordningsvakt · sverige",
  "one that does not is, and case or trailing space does not defeat the check",
);
check(
  titleWithJurisdictionOnce("Ordningsvakt", null) === "Ordningsvakt" &&
    titleWithJurisdictionOnce("", "Sverige") === "Sverige",
  "a missing half never leaves a dangling separator",
);
for (const surface of [
  "src/components/security-passport/PassportOverview.tsx",
  "src/components/security-passport/RecipientVerification.tsx",
  "src/components/security-passport/live/RecipientPassportCard.tsx",
  "src/components/security-passport/live/LinkedInShareSection.tsx",
  "src/lib/security-passport/share-image.ts",
]) {
  const src = code(read(surface));
  check(
    /titleWithJurisdictionOnce\(/.test(src) &&
      !/\}\s*·\s*\$\{format(Jurisdiction|WorkLocation)\(/.test(src) &&
      !/\{profession\}\s*·\s*\{jurisdiction\}/.test(src),
    `${surface.split("/").pop()} joins title and jurisdiction through the helper only`,
  );
}
check(
  /TODO\(A4\)/.test(read("src/lib/security-passport/format.ts")),
  "and the helper is marked temporary, tied to the A4 data fix",
);

/* ------------------------------------------------------------------ */
console.log("\n5 · no label collides with another product's");

const passportCopy = read(PASSPORT_I18N);
const appCopy = read(APP_I18N);

// The candidate's primary navigation calls /my-career "Översikt". The
// Passport's own first tab used the same word for /passport, so a holder saw
// one word meaning two places on one screen.
check(
  /"nav\.overview": "Passport(översikt| overview)"/.test(passportCopy),
  "the Passport's overview tab names WHICH overview it is",
);
check(
  !/"nav\.overview": "Översikt"/.test(passportCopy),
  "and no longer reuses the candidate home's label",
);
check(
  /"nav\.overview": "Översikt"/.test(appCopy),
  "while the candidate home keeps it — this moved the Passport's label, not the owner's",
);

// A tab must not repeat a heading that is already on the page below it.
check(
  !/"nav\.overview": "Mina meriter"/.test(passportCopy),
  'the tab does not repeat the "Mina meriter" heading rendered beneath it',
);

/* ------------------------------------------------------------------ */
console.log("\n6 · the side column is reachable and operable");

for (const m of side.matchAll(/className=\{?`?([^`"}]*min-h-11[^`"}]*)`?\}?/g)) {
  void m;
}
// EVERY control class, not "min-h-11 appears somewhere": the column has two
// (a text link and the next step's button), and a file-wide search stayed
// true with either one shrunk.
const controlClasses = [...side.matchAll(/const (LINK|PRIMARY) =\s*"([^"]+)"/g)];
check(
  controlClasses.length === 2 && controlClasses.every((m) => /\bmin-h-11\b/.test(m[2]!)),
  "its controls carry a 44px minimum target",
);
check(/focus-visible:outline/.test(side), "and a visible keyboard focus state");
check(
  /aria-labelledby="sp-side-next-heading"/.test(side) &&
    /aria-labelledby="sp-side-privacy-heading"/.test(side),
  "both regions are labelled, so a screen-reader user is told what they are",
);

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`passport-page-composition-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Passport page composition: ${assertions} of ${assertions} assertions passed.`);
