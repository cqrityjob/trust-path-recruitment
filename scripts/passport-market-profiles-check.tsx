// Security Passport — market profiles, asserted against the RENDERED markup
// and the derivation.
//
// Run via `bun run passport-market-profiles:check`.
//
// ── THE DEFECT THIS GUARD EXISTS TO KEEP FIXED ─────────────────────────
//
// "Mina uppgifter" rendered its credential entry controls from a literal:
//
//     (["VU1", "VU2", "OV", "SV"] as const).map(...)
//
// unconditionally, with no reference to where the holder said they work. A
// holder who selected Dubai was still offered Väktarutbildning 1 — a Swedish
// regulated credential — as something to register there. The governed answer
// (`getRegulatedCredentialAvailability`) already existed and was wired to the
// credential FORM but not to the page that leads to it.
//
// A guard that only checked the domain module would pass while the page still
// rendered the literal, so the market assertions below render the real
// components and read the markup.
//
// ── WHAT IS ASSERTED, AND WHY EACH ONE ─────────────────────────────────
//
//   1  Sweden selected  -> no Dubai credential offered
//   2  Dubai selected   -> no Swedish credential entry offered
//   3  unsupported      -> no fallback catalogue
//   4  inactive market  -> nothing selectable
//   5  switching market -> no claim mutated
//   6  a Swedish claim  -> still jurisdiction SE after the switch
//   7  grouping         -> deterministic, total order
//   8  the card         -> never files a credential under the wrong market
//   9  disclosure       -> keeps each credential's own jurisdiction
//  10  SV/EN            -> semantic parity on every new key

import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { MarketCredentialSection } from "../src/components/security-passport/MarketCredentialSection";
import { OtherMarketsPanel } from "../src/components/security-passport/OtherMarketsPanel";
import { MarketBadgeRow } from "../src/components/security-passport/MarketBadgeRow";
import { PassportCard } from "../src/components/security-passport/PassportCard";
import { PassportOverview } from "../src/components/security-passport/PassportOverview";
import { FIXTURE_CREDENTIAL_TYPES } from "../src/lib/security-passport/fixtures/credential-types";
import {
  deriveMarketProfiles,
  marketBadges,
  marketCodeOf,
  isSameMarket,
  otherMarkets,
  currentMarket,
} from "../src/lib/security-passport/market-profiles";
import { buildPassportCard } from "../src/lib/security-passport/card";
import { buildDisclosurePayload } from "../src/lib/security-passport/disclosure";
import {
  deriveProfessionalIdentity,
  SWEDEN_TITLE_RULES,
} from "../src/lib/security-passport/identity";
import { passportT, type PassportCopyKey } from "../src/lib/security-passport/i18n";
import type { Claim, PassportHolder } from "../src/lib/security-passport/types";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}

const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const noop = () => {};

const EVAL_ON = "2026-08-16";

/* ------------------------------------------------------------------ */
/* Fictional claims                                                    */
/* ------------------------------------------------------------------ */

function claim(c: Partial<Claim> & Pick<Claim, "id" | "titleSv" | "titleEn">): Claim {
  return {
    claimType: "licence",
    credentialCode: null,
    skillCode: null,
    skillLevel: null,
    issuerName: "Fiktiv utfärdare",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2024-01-15",
    validFrom: "2024-01-15",
    validUntil: null,
    assertionLevel: "verified",
    lifecycleState: "active",
    verifierName: "Fiktiva Bevakning AB",
    limitationSv: "Fiktiv testdata.",
    limitationEn: "Fictional test data.",
    versionNo: 1,
    supersedesClaimId: null,
    ...c,
  } as Claim;
}

const SE_OV = claim({
  id: "t-se-ov",
  credentialCode: "OV",
  titleSv: "Ordningsvaktsförordnande",
  titleEn: "Public Order Guard Appointment",
  validUntil: "2029-01-14",
});
const SE_SV = claim({
  id: "t-se-sv",
  credentialCode: "SV",
  titleSv: "Skyddsvaktsförordnande",
  titleEn: "Protective Security Guard Appointment",
  validUntil: "2029-06-30",
});
const AE_GUARD = claim({
  id: "t-ae-guard",
  titleSv: "SIRA Security Guard",
  titleEn: "SIRA Security Guard",
  jurisdictionCode: "AE",
  subJurisdictionCode: "AE-DU",
  validUntil: "2028-11-30",
});
const AE_AZ_GUARD = claim({
  id: "t-az-guard",
  titleSv: "Abu Dhabi Security Guard",
  titleEn: "Abu Dhabi Security Guard",
  jurisdictionCode: "AE",
  subJurisdictionCode: "AE-AZ",
  validUntil: "2028-11-30",
});
/** No jurisdiction: a language. Portable, belongs to no market. */
const PORTABLE = claim({
  id: "t-lang",
  claimType: "language",
  titleSv: "Svenska",
  titleEn: "Swedish",
  jurisdictionCode: null,
});

const SWEDISH_OPTIONS = FIXTURE_CREDENTIAL_TYPES.filter((t) =>
  ["VU1", "VU2", "OV", "SV"].includes(t.code),
).map((t) => ({
  code: t.code,
  nameSv: t.nameSv,
  nameEn: t.nameEn,
  symbolLabel: t.symbolLabel,
}));

function section(props: Partial<React.ComponentProps<typeof MarketCredentialSection>>) {
  return html(
    <MarketCredentialSection
      state="open"
      jurisdictionCode="SE"
      subJurisdictionCode={null}
      options={SWEDISH_OPTIONS}
      onSelect={noop}
      {...props}
    />,
  );
}

function holder(
  claims: readonly Claim[],
  jurisdictionCode: string | null,
  subJurisdictionCode: string | null,
): PassportHolder {
  return {
    id: "t-holder",
    displayName: "Testperson (fiktiv)",
    professionSlug: "vaktare",
    identity: deriveProfessionalIdentity(claims, SWEDEN_TITLE_RULES, EVAL_ON),
    jurisdictionCode: jurisdictionCode as PassportHolder["jurisdictionCode"],
    subJurisdictionCode,
    periods: [],
    claims,
    hasCareerDiscoveryResult: false,
  };
}

console.log("passport-market-profiles-check\n");

/* ══════════════════════════════════════════════════════════════════════
   1 & 2. THE SELECTED MARKET DECIDES WHAT IS OFFERED
   ══════════════════════════════════════════════════════════════════════ */
console.log("1-2 -- the selected market decides what is offered");
{
  const sweden = section({ state: "open", jurisdictionCode: "SE", subJurisdictionCode: null });

  ck("Sweden open: the Swedish catalogue is offered", /VU1/.test(sweden));
  ck(
    "Sweden open: the heading names Sweden",
    sweden.includes(passportT("market.section.credentialsFor", "sv")) && /Sverige/.test(sweden),
  );
  // 1. Nothing from another market leaks into an open Swedish catalogue.
  ck(
    "Sweden open: no Dubai credential is shown",
    !/SIRA|Security Guard|Security Supervisor/i.test(sweden),
  );
  ck("Sweden open: no Dubai market code is shown", !/AE-DU/.test(sweden));

  // 2. THE ORIGINAL DEFECT. Dubai selected, Swedish buttons still rendered.
  const dubai = section({
    state: "pending_review",
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
    options: [],
  });
  for (const code of ["VU1", "VU2", "OV", "SV"]) {
    ck(
      `Dubai pending: the Swedish credential ${code} is NOT offered`,
      !new RegExp(`>${code}<`).test(dubai),
    );
  }
  ck(
    "Dubai pending: no Swedish credential name is offered",
    !/Väktarutbildning|Ordningsvakts|Skyddsvakts/i.test(dubai),
  );
  ck("Dubai pending: nothing is selectable", !/data-credential-code/.test(dubai));
  ck("Dubai pending: the heading names Dubai", /Dubai/.test(dubai));
  ck(
    "Dubai pending: the market is stated as not yet open",
    dubai.includes(passportT("market.pending.headingSuffix", "sv")),
  );
  ck(
    "Dubai pending: the holder is told existing credentials are untouched",
    dubai.includes(passportT("cred.market.keepsExisting", "sv").slice(0, 40)),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   2b. AN INTERNAL-PILOT MARKET OFFERS ITS CATALOGUE, AND SAYS WHAT IT IS
   ══════════════════════════════════════════════════════════════════════ */
// The pilot is the one state where an UNREVIEWED market is registrable. That
// makes it the one state where the surface can mislead: a catalogue with no
// status line reads exactly like a live market. Both halves are asserted --
// the catalogue must be there, and so must the sentence.
console.log("\n2b -- an internal-pilot market is usable AND labelled");
{
  const pilot = section({
    state: "open_pilot",
    jurisdictionCode: "GB",
    subJurisdictionCode: null,
    options: SWEDISH_OPTIONS.map((o) => ({ ...o, code: "UK_" + o.code })),
  });

  ck("pilot: the governed catalogue IS offered", /data-credential-code/.test(pilot));
  ck("pilot: the heading names the market", /Storbritannien/.test(pilot));
  ck("pilot: the market status line is rendered", /market-pilot-status/.test(pilot));
  ck(
    "pilot: it says the market is an internal pilot under review",
    pilot.includes(passportT("market.pilot.status", "sv")),
  );
  // The whole point of a separate state rather than a boolean.
  const open = section({ state: "open", jurisdictionCode: "SE", subJurisdictionCode: null });
  ck("a production market shows NO pilot status line", !/market-pilot-status/.test(open));

  for (const lang of ["sv", "en"] as const) {
    // "Under review" is the load-bearing claim. A status line that only said
    // "pilot" would leave a tester thinking the content was approved.
    ck(
      `${lang}: the status line says the regulatory content is under review`,
      /(granskas|under review)/i.test(passportT("market.pilot.status", lang)),
    );
    ck(
      `${lang}: the body denies legal approval outright`,
      /(inte juridiskt godkänt|not been legally approved)/i.test(
        passportT("market.pilot.body", lang),
      ),
    );
    ck(
      `${lang}: and says the market is not open to everyone`,
      /(inte .*öppen för alla|not yet open to everyone)/i.test(
        passportT("market.pilot.body", lang),
      ),
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════
   3 & 4. NO FALLBACK CATALOGUE, EVER
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n3-4 -- a closed market renders no catalogue at all");
{
  const unsupported = section({
    state: "unsupported",
    jurisdictionCode: "NO",
    subJurisdictionCode: null,
    options: [],
  });
  ck("unsupported: no credential is selectable", !/data-credential-code/.test(unsupported));
  ck(
    "unsupported: no Swedish credential name appears",
    !/Väktarutbildning|Ordningsvakts|Skyddsvakts/i.test(unsupported),
  );
  ck(
    "unsupported: the absence is named",
    unsupported.includes(passportT("market.unsupported.body", "sv")),
  );

  const noCountry = section({
    state: "no_work_country",
    jurisdictionCode: null,
    subJurisdictionCode: null,
    options: [],
  });
  ck("no work country: nothing is selectable", !/data-credential-code/.test(noCountry));
  ck(
    "no work country: the holder is asked for a market first",
    noCountry.includes(passportT("cred.market.noWorkCountry", "sv")),
  );

  // 4. THE CRITICAL ONE. A caller that wrongly passes a catalogue for a market
  //    that is not open must still render nothing selectable — the state is the
  //    authority, not the array.
  const inactiveWithOptions = section({
    state: "pending_review",
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
    options: SWEDISH_OPTIONS,
  });
  ck(
    "an inactive market ignores a catalogue passed to it",
    !/data-credential-code/.test(inactiveWithOptions),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   5 & 6. SWITCHING MARKET MUTATES NOTHING
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n5-6 -- switching market mutates no claim");
{
  const claims = Object.freeze([SE_OV, SE_SV, AE_GUARD]);
  const before = JSON.stringify(claims);

  const inSweden = deriveMarketProfiles(claims, {
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
  });
  const inDubai = deriveMarketProfiles(claims, {
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
  });

  // 5. Derivation is a read. Frozen input plus an unchanged serialisation is
  //    the strongest statement this layer can make.
  ck("deriving in Sweden mutates no claim", JSON.stringify(claims) === before);
  ck("deriving in Dubai mutates no claim", JSON.stringify(claims) === before);
  ck(
    "the same claims produce the same markets in both",
    inSweden.profiles
      .map((p) => p.marketCode)
      .sort()
      .join() ===
      inDubai.profiles
        .map((p) => p.marketCode)
        .sort()
        .join(),
  );

  // 6. The Swedish credential is still Swedish, and it is still THERE.
  const seInDubai = inDubai.profiles.find((p) => p.marketCode === "SE");
  ck("after switching to Dubai, Sweden is still a market", seInDubai !== undefined);
  ck(
    "after switching to Dubai, the Swedish claims are still jurisdiction SE",
    seInDubai?.verifiedCredentials.every((c) => c.jurisdictionCode === "SE") === true,
  );
  ck(
    "after switching to Dubai, the Swedish claims are still verified",
    seInDubai?.verifiedCredentials.length === 2,
  );
  ck(
    "after switching to Dubai, Sweden is NOT the current market",
    seInDubai?.isCurrentWorkMarket === false,
  );
  ck(
    "after switching to Dubai, the Swedish claims are filed under other markets",
    otherMarkets(inDubai.profiles).some((p) => p.marketCode === "SE"),
  );
  // Switching back restores the selected-market view.
  ck(
    "switching back to Sweden makes Sweden current again",
    currentMarket(inSweden.profiles)?.marketCode === "SE",
  );
  ck(
    "and Dubai is then the other market",
    otherMarkets(inSweden.profiles).some((p) => p.marketCode === "AE-DU"),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   7. GROUPING IS DETERMINISTIC AND MARKET-EXACT
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n7 -- grouping is deterministic and market-exact");
{
  ck('marketCodeOf("SE", null) is "SE"', marketCodeOf("SE", null) === "SE");
  ck('marketCodeOf("AE", "AE-DU") is "AE-DU"', marketCodeOf("AE", "AE-DU") === "AE-DU");
  ck("marketCodeOf(null, null) is null", marketCodeOf(null, null) === null);

  // The case the module exists for: SIRA's writ does not run in Abu Dhabi.
  ck(
    "Dubai and Abu Dhabi are DIFFERENT markets",
    !isSameMarket(AE_GUARD, { jurisdictionCode: "AE", subJurisdictionCode: "AE-AZ" }),
  );
  const emirates = deriveMarketProfiles([AE_GUARD, AE_AZ_GUARD], {
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
  });
  ck(
    "two emirates never collapse into one UAE group",
    emirates.profiles.length === 2 &&
      emirates.profiles
        .map((p) => p.marketCode)
        .sort()
        .join() === "AE-AZ,AE-DU",
  );

  // Same claims, four different input orders, one output order.
  const set = [SE_OV, SE_SV, AE_GUARD, AE_AZ_GUARD];
  const work = { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" };
  const orders = [
    set,
    [...set].reverse(),
    [set[2], set[0], set[3], set[1]],
    [set[3], set[1], set[2], set[0]],
  ];
  const rendered = orders.map((o) =>
    deriveMarketProfiles(o, work)
      .profiles.map((p) => `${p.marketCode}:${p.verifiedCredentials.length}`)
      .join("|"),
  );
  ck(
    `grouping is order-independent (${rendered[0]})`,
    rendered.every((r) => r === rendered[0]),
  );
  // Current market leads, then verified count, then market code.
  ck("the current work market is listed first", rendered[0].startsWith("AE-DU:"));

  const portable = deriveMarketProfiles([SE_OV, PORTABLE], {
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
  });
  ck(
    "a claim with no jurisdiction is portable, not filed under a country",
    portable.portable.length === 1,
  );
  ck("and it is not counted in any market", portable.profiles.length === 1);
}

/* ══════════════════════════════════════════════════════════════════════
   8. THE CARD NEVER FILES A CREDENTIAL UNDER THE WRONG MARKET
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n8 -- the card never files a credential under the wrong market");
{
  const card = buildPassportCard(holder([SE_OV, SE_SV, AE_GUARD], "AE", "AE-DU"), EVAL_ON);

  ck("the card carries market profiles", card.marketProfiles.length === 2);
  for (const p of card.marketProfiles) {
    const all = [...p.verifiedCredentials, ...p.pendingCredentials, ...p.otherClaims];
    ck(
      `every credential in ${p.marketCode} actually belongs to ${p.marketCode}`,
      all.every((c) => marketCodeOf(c.jurisdictionCode, c.subJurisdictionCode) === p.marketCode),
    );
  }
  // The market summary is computed over ALL claims, not the truncated
  // top-three plates, so a whole market can never silently drop off.
  const many = buildPassportCard(
    holder([SE_OV, SE_SV, AE_GUARD, AE_AZ_GUARD], "SE", null),
    EVAL_ON,
  );
  ck(
    "market profiles survive the card's three-plate limit",
    many.credentials.length <= 3 && many.marketProfiles.length === 3,
  );

  const markup = html(<PassportCard card={card} />);
  ck("the card names its markets", /DOKUMENTERADE MARKNADER|Dokumenterade marknader/i.test(markup));
  ck(
    "the card labels the current work market",
    /AKTUELL ARBETSMARKNAD|Aktuell arbetsmarknad/i.test(markup),
  );
  // The flattening PR #114 removed from DirectionC survived here until now.
  ck(
    "the card does NOT join the derived title to the work country with a middot",
    !/Ordningsvakt · Skyddsvakt · Dubai/.test(markup),
  );

  // A holder with no verified credential in the market they work in must be
  // told so, rather than left to read the markets above as covering it.
  const noneHere = buildPassportCard(holder([SE_OV, SE_SV], "AE", "AE-DU"), EVAL_ON);
  const noneHereMarkup = html(<PassportCard card={noneHere} />);
  ck(
    "a holder with nothing verified in their work market is told so",
    noneHereMarkup.includes(passportT("market.currentMarket.none", "sv")),
  );

  // Badges name markets, never credentials — and never "SV" for Sweden.
  const badges = marketBadges(card.marketProfiles);
  const badgeMarkup = html(<MarketBadgeRow badges={badges} />);
  ck("a badge exists per market", badges.length === 2);
  ck(
    'Sweden is badged "SE"',
    badges.some((b) => b.marketCode === "SE"),
  );
  ck(
    'Sweden is NEVER badged "SV" (that is Skyddsvakt)',
    !badges.some((b) => b.marketCode === "SV"),
  );
  ck(
    "Dubai is badged AE-DU",
    badges.some((b) => b.marketCode === "AE-DU"),
  );
  ck("badges name no credential", !/Ordningsvakts|Skyddsvakts|Väktarutbildning/i.test(badgeMarkup));

  // The other-markets panel is informative, never an edit surface.
  const panelProfiles = otherMarkets(
    deriveMarketProfiles(
      [SE_OV, SE_SV].map((c) => ({
        id: c.id,
        title: c.titleSv,
        jurisdictionCode: c.jurisdictionCode,
        subJurisdictionCode: c.subJurisdictionCode,
        assertionLevel: c.assertionLevel,
        lifecycleState: c.lifecycleState,
      })),
      { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" },
    ).profiles,
  );
  const panel = html(<OtherMarketsPanel profiles={panelProfiles} />);
  ck("the other-markets panel names Sweden", /Sverige/.test(panel));
  // Documented-or-better is what the market count means now (owner decision:
  // a CQrityjob review is documented, and that is what is counted).
  ck("the other-markets panel counts what is documented", /2 dokumenterade/.test(panel));
  ck(
    "the other-markets panel offers no way to add a credential",
    !/\/passport\/credentials\/new/.test(panel),
  );
}

/* ══════════════════════════════════════════════════════════════════════
   8b. THE OVERVIEW CARRIED THE SAME LITERAL
   ══════════════════════════════════════════════════════════════════════ */
// `/passport` offered the same four Swedish credentials from the Passport's
// front page, by the same hard-coded array, with the same indifference to the
// holder's market. Fixing only the entry page would have left a Dubai holder
// one tab away from the defect.
console.log("\n8b -- the Passport overview is governed by the market too");
{
  // No claims: anything Swedish in this markup can only have come from a
  // catalogue. A holder WITH claims must still see them -- existing
  // credentials stay visible in every market, which is the point of
  // section 6 -- so they would make this assertion meaningless.
  const h = holder([], "AE", "AE-DU");
  const overview = (
    marketCredentials?: React.ComponentProps<typeof PassportOverview>["marketCredentials"],
  ) =>
    html(
      <PassportOverview
        holder={h}
        evaluationOn={EVAL_ON}
        viewingJurisdiction="AE"
        onContinue={noop}
        onOpenCard={noop}
        onShare={noop}
        onAddCredential={noop}
        marketCredentials={marketCredentials}
      />,
    );

  const pending = overview({ state: "pending_review", options: [] });
  ck(
    "overview, market pending: nothing regulated is selectable",
    !/data-credential-code/.test(pending),
  );
  ck(
    "overview, market pending: no Swedish credential is offered",
    !/Väktarutbildning|Ordningsvakts|Skyddsvakts/i.test(pending),
  );

  // The unresolved case must fail CLOSED, not fall back to Sweden.
  const unresolved = overview(undefined);
  ck(
    "overview, market unresolved: nothing regulated is selectable",
    !/data-credential-code/.test(unresolved),
  );

  const open = overview({ state: "open", options: SWEDISH_OPTIONS });
  ck("overview, market open: the governed catalogue is offered", /data-credential-code/.test(open));
}

/* ══════════════════════════════════════════════════════════════════════
   9. DISCLOSURE KEEPS EACH CREDENTIAL'S OWN JURISDICTION
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n9 -- disclosure keeps each credential's own jurisdiction");
{
  const h = holder([SE_OV, SE_SV, AE_GUARD], "AE", "AE-DU");
  const payload = buildDisclosurePayload(
    h,
    {
      packageId: "employer",
      optionalIncluded: [],
      recipientHint: "Fiktiv arbetsgivare",
      expiresOn: "2026-12-31",
      revoked: false,
    },
    EVAL_ON,
  );
  const rows = payload.sections.flatMap((sec) => (sec.kind === "claims" ? sec.claims : []));
  ck("the disclosure carries claims", rows.length > 0);
  ck(
    "every disclosed credential keeps its own jurisdiction",
    rows.every((r) => {
      const src = [SE_OV, SE_SV, AE_GUARD].find((c) => c.id === r.id);
      return src === undefined || r.jurisdictionCode === src.jurisdictionCode;
    }),
  );
  const dubaiRow = rows.find((r) => r.id === AE_GUARD.id);
  ck(
    "the Dubai credential keeps its emirate rather than flattening to AE",
    dubaiRow === undefined || dubaiRow.subJurisdictionCode === "AE-DU",
  );
  const seRow = rows.find((r) => r.id === SE_OV.id);
  ck(
    "the Swedish credential is NOT relabelled with the holder's work market",
    seRow === undefined || seRow.jurisdictionCode === "SE",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   10. SV / EN SEMANTIC PARITY
   ══════════════════════════════════════════════════════════════════════ */
console.log("\n10 -- SV/EN semantic parity on the new copy");
{
  const KEYS: readonly PassportCopyKey[] = [
    "market.step.workMarket",
    "market.workMarket.question",
    "market.registerNote",
    "market.section.credentialsFor",
    "market.section.lead",
    "market.pending.headingSuffix",
    "market.pending.body",
    "market.unsupported.heading",
    "market.unsupported.body",
    "market.noWorkCountry.heading",
    "market.other.title",
    "market.other.lead",
    "market.other.none",
    "market.verified.one",
    "market.verified.many",
    "market.details.show",
    "market.details.hide",
    "market.currentMarket.none",
    "card.verifiedMarkets",
    "card.currentWorkMarket",
    "market.pilot.status",
    "market.pilot.body",
    "rec.credentialMarket",
  ];
  for (const k of KEYS) {
    const sv = passportT(k, "sv");
    const en = passportT(k, "en");
    ck(
      `${k}: both languages are present and non-empty`,
      sv.trim().length > 0 && en.trim().length > 0,
    );
    ck(
      `${k}: the two languages differ`,
      sv !== en || sv.length <= 3 || k === "market.verified.many",
    );
  }

  // ── NO MARKET NAME MAY BE BAKED INTO A SENTENCE ──────────────────
  //
  // The market is rendered beside these strings by formatWorkLocation. A
  // country hard-coded into one of them would be correct for exactly one
  // market and wrong for every market added after it.
  const GENERIC: readonly PassportCopyKey[] = [
    "market.pending.body",
    "market.unsupported.body",
    "market.section.credentialsFor",
    "market.pending.headingSuffix",
    "market.pilot.status",
    "market.pilot.body",
  ];
  for (const k of GENERIC) {
    for (const lang of ["sv", "en"] as const) {
      ck(
        `${lang}: ${k} names no specific market`,
        !/Sverige|Sweden|Dubai|Storbritannien|United Kingdom|Abu Dhabi/i.test(passportT(k, lang)),
      );
    }
  }

  // The pending sentence must promise that other markets' records survive —
  // that is the fear a country change creates.
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang}: the pending-market sentence says existing records remain`,
      /(finns kvar|remain)/i.test(passportT("market.pending.body", lang)),
    );
  }
}

console.log(
  fails.length === 0
    ? `\npassport-market-profiles-check: all assertions passed.`
    : `\npassport-market-profiles-check FAILED (${fails.length}):\n  - ${fails.join("\n  - ")}`,
);
process.exit(fails.length === 0 ? 0 : 1);
