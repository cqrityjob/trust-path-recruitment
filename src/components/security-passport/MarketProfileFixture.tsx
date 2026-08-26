// Market profiles — the reviewable states, on fictional data, offline.
//
// ── WHY A FIXTURE AND NOT A SEEDED ACCOUNT ─────────────────────────────
//
// Screens D and E need a holder with VERIFIED credentials in two markets at
// once. Only Sweden's market pack is active, so producing that against the
// real environment would mean writing verified Dubai claims into hosted data —
// inventing a regulatory fact in order to photograph it. Nothing here touches a
// database, a session or a network: every row below is fiction, declared as
// fiction, and `passport-separation-check` prevents this file from reaching a
// Supabase client even by accident.
//
// ── THE MARKET STATES ARE NOT INVENTED EITHER ──────────────────────────
//
// The `state` passed to each section is the same union
// `getRegulatedCredentialAvailability` returns, and the values used here match
// what `sp_market_packs` says TODAY: SE active, GB / GB-NI / AE-DU / AE-AZ
// pending. This fixture demonstrates the UI for a state; it does not open a
// market, and switching a pack on remains a governance decision made in the
// database.

import { useMemo } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { FIXTURE_CREDENTIAL_TYPES } from "@/lib/security-passport/fixtures/credential-types";
import { FIXTURE_EVALUATION_DATE } from "@/lib/security-passport/fixtures/personas";
import { buildPassportCard } from "@/lib/security-passport/card";
import { deriveMarketProfiles, marketBadges } from "@/lib/security-passport/market-profiles";
import { deriveProfessionalIdentity, SWEDEN_TITLE_RULES } from "@/lib/security-passport/identity";
import type { Claim, PassportHolder } from "@/lib/security-passport/types";
import { MarketCredentialSection } from "./MarketCredentialSection";
import { OtherMarketsPanel, type OtherMarketClaim } from "./OtherMarketsPanel";
import { MarketBadgeRow } from "./MarketBadgeRow";
import { PassportCard } from "./PassportCard";

/* ------------------------------------------------------------------ */
/* Fictional claims                                                    */
/* ------------------------------------------------------------------ */

function fixtureClaim(c: Partial<Claim> & Pick<Claim, "id" | "titleSv" | "titleEn">): Claim {
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

/** Four Swedish credentials, verified. The holder of screens C, D and E. */
const SWEDISH_CLAIMS: readonly Claim[] = [
  fixtureClaim({
    id: "fx-se-ov",
    claimType: "licence",
    credentialCode: "OV",
    titleSv: "Ordningsvaktsförordnande",
    titleEn: "Public Order Guard Appointment",
    issuerName: "Fiktiva Myndigheten",
    validUntil: "2029-01-14",
  }),
  fixtureClaim({
    id: "fx-se-sv",
    claimType: "licence",
    credentialCode: "SV",
    titleSv: "Skyddsvaktsförordnande",
    titleEn: "Protective Security Guard Appointment",
    issuerName: "Fiktiva Myndigheten",
    validUntil: "2029-06-30",
  }),
  fixtureClaim({
    id: "fx-se-vu1",
    claimType: "training",
    credentialCode: "VU1",
    titleSv: "Väktargrundutbildning (VU1)",
    titleEn: "Basic security guard training (VU1)",
  }),
  fixtureClaim({
    id: "fx-se-vu2",
    claimType: "training",
    credentialCode: "VU2",
    titleSv: "Väktarutbildning 2 (VU2)",
    titleEn: "Security guard training 2 (VU2)",
  }),
];

/** Two Dubai credentials, verified.
 *
 *  ── READ THIS BEFORE REUSING THEM ────────────────────────────────────
 *
 *  These exist to prove the GROUPING renders, and for no other purpose. Dubai's
 *  market pack is `is_active = false` and pending legal review, so no holder can
 *  register these today and this fixture does not change that. They carry
 *  `sub_jurisdiction_code = 'AE-DU'` because SIRA licenses the emirate; a
 *  fixture that wrote plain "AE" would be demonstrating the UAE-wide claim
 *  rather than the correction. */
const DUBAI_CLAIMS: readonly Claim[] = [
  fixtureClaim({
    id: "fx-ae-guard",
    claimType: "licence",
    titleSv: "SIRA Security Guard",
    titleEn: "SIRA Security Guard",
    issuerName: "SIRA (fiktiv referens)",
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
    validUntil: "2028-11-30",
  }),
  fixtureClaim({
    id: "fx-ae-super",
    claimType: "licence",
    titleSv: "Security Supervisor",
    titleEn: "Security Supervisor",
    issuerName: "SIRA (fiktiv referens)",
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
    validUntil: "2028-11-30",
  }),
];

function holderWith(
  claims: readonly Claim[],
  jurisdictionCode: string | null,
  subJurisdictionCode: string | null,
): PassportHolder {
  return {
    id: "fx-market-profiles",
    displayName: "Mostafa Alshawi (fiktiv)",
    professionSlug: "vaktare",
    identity: deriveProfessionalIdentity(claims, SWEDEN_TITLE_RULES, FIXTURE_EVALUATION_DATE),
    jurisdictionCode: jurisdictionCode as PassportHolder["jurisdictionCode"],
    subJurisdictionCode,
    periods: [],
    claims,
    hasCareerDiscoveryResult: false,
  };
}

function toPanelClaims(claims: readonly Claim[]): readonly OtherMarketClaim[] {
  return claims.map((c) => ({
    id: c.id,
    title: c.titleSv,
    jurisdictionCode: c.jurisdictionCode,
    subJurisdictionCode: c.subJurisdictionCode,
    assertionLevel: c.assertionLevel,
    lifecycleState: c.lifecycleState,
  }));
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

function Panel({
  id,
  title,
  note,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section id={id} data-testid={id} className="scroll-mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">{title}</h2>
      <p className="mt-1 max-w-[80ch] text-sm text-muted-foreground">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function MarketProfileFixture() {
  const { lang } = usePassportCopy();

  // The seven SIA licences, exactly as the GB pack authors them. Fictional
  // only in that no database is consulted: these are the real catalogue codes,
  // which is what makes the pilot screen worth reviewing.
  const GB_PILOT_OPTIONS = useMemo(
    () =>
      [
        ["UK_SIA_LICENCE_SG", "SIA Licence — Security Guarding", "SG"],
        ["UK_SIA_LICENCE_DS", "SIA Licence — Door Supervision", "DS"],
        ["UK_SIA_LICENCE_CCTV", "SIA Licence — Public Space Surveillance (CCTV)", "CCTV"],
        ["UK_SIA_LICENCE_CP", "SIA Licence — Close Protection", "CP"],
        ["UK_SIA_LICENCE_CVIT", "SIA Licence — Cash and Valuables in Transit", "CVIT"],
        ["UK_SIA_LICENCE_KH", "SIA Licence — Key Holding", "KH"],
        ["UK_SIA_LICENCE_NFL", "SIA Licence — Non-Front-Line", "NFL"],
      ].map(([code, name, label]) => ({
        code,
        nameSv: name,
        nameEn: name,
        symbolLabel: label,
      })),
    [],
  );

  const swedishOptions = useMemo(
    () =>
      FIXTURE_CREDENTIAL_TYPES.filter((t) => ["VU1", "VU2", "OV", "SV"].includes(t.code)).map(
        (t) => ({
          code: t.code,
          nameSv: t.nameSv,
          nameEn: t.nameEn,
          symbolLabel: t.symbolLabel,
        }),
      ),
    [],
  );

  // Screen C's holder: four Swedish credentials, working in Dubai.
  const swedishInDubai = useMemo(
    () =>
      deriveMarketProfiles(toPanelClaims(SWEDISH_CLAIMS), {
        jurisdictionCode: "AE",
        subJurisdictionCode: "AE-DU",
      }).profiles,
    [],
  );

  const singleMarketCard = useMemo(
    () => buildPassportCard(holderWith(SWEDISH_CLAIMS, "SE", null), FIXTURE_EVALUATION_DATE),
    [],
  );

  const multiMarketCard = useMemo(
    () =>
      buildPassportCard(
        holderWith([...SWEDISH_CLAIMS, ...DUBAI_CLAIMS], "AE", "AE-DU"),
        FIXTURE_EVALUATION_DATE,
      ),
    [],
  );

  const multiBadges = useMemo(
    () => marketBadges(multiMarketCard.marketProfiles),
    [multiMarketCard],
  );

  const note = (sv: string, en: string) => (lang === "sv" ? sv : en);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10">
      <Panel
        id="screen-a"
        title={note("A — Arbetsmarknad Sverige", "A — Work market Sweden")}
        note={note(
          "Marknadspaketet SE är aktivt. Svenska behörigheter erbjuds för registrering.",
          "The SE market pack is active. Swedish credentials are offered for registration.",
        )}
      >
        <MarketCredentialSection
          state="open"
          jurisdictionCode="SE"
          subJurisdictionCode={null}
          options={swedishOptions}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="screen-b"
        title={note("B — Byter till Dubai", "B — Switched to Dubai")}
        note={note(
          "Marknadspaketet AE-DU finns men är under juridisk granskning. Inga svenska val visas.",
          "The AE-DU market pack exists but is under legal review. No Swedish options are shown.",
        )}
      >
        <MarketCredentialSection
          state="pending_review"
          jurisdictionCode="AE"
          subJurisdictionCode="AE-DU"
          options={[]}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="screen-b-pilot"
        title={note(
          "B-PILOT — Storbritannien som pilotmarknad",
          "B-PILOT — Great Britain as a pilot market",
        )}
        note={note(
          "Samma marknad som är stängd för alla andra. En namngiven pilotdeltagare ser SIA-katalogen och en marknadsstatus som säger att innehållet fortfarande granskas.",
          "The same market that is closed to everyone else. A named pilot participant sees the SIA catalogue and a market status saying the content is still under review.",
        )}
      >
        <MarketCredentialSection
          state="open_pilot"
          jurisdictionCode="GB"
          subJurisdictionCode={null}
          options={GB_PILOT_OPTIONS}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="screen-b2"
        title={note("B2 — Marknad som inte stöds", "B2 — Unsupported market")}
        note={note(
          "Inget marknadspaket täcker landet. Ingen reservkatalog, inga svenska val.",
          "No market pack covers the country. No fallback catalogue, no Swedish options.",
        )}
      >
        <MarketCredentialSection
          state="unsupported"
          jurisdictionCode="NO"
          subJurisdictionCode={null}
          options={[]}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="screen-c"
        title={note(
          "C — Svenska uppgifter bevaras vid marknadsbyte",
          "C — Swedish records preserved across a market change",
        )}
        note={note(
          "Samma innehavare som B. De fyra svenska behörigheterna finns kvar, med jurisdiktion SE, som läsbar information.",
          "The same holder as B. The four Swedish credentials remain, jurisdiction SE, as read-only information.",
        )}
      >
        <OtherMarketsPanel profiles={swedishInDubai} />
      </Panel>

      <Panel
        id="screen-d"
        title={note("D — Passport Card, en marknad", "D — Passport Card, one market")}
        note={note(
          "Innehavare i Sverige med fyra verifierade svenska behörigheter.",
          "A Sweden-based holder with four verified Swedish credentials.",
        )}
      >
        <div className="max-w-md">
          <PassportCard card={singleMarketCard} />
        </div>
      </Panel>

      <Panel
        id="screen-e"
        title={note("E — Passport Card, flera marknader", "E — Passport Card, several markets")}
        note={note(
          "Fyra verifierade i Sverige, två i Dubai, aktuell arbetsmarknad Dubai. Marknaderna redovisas var för sig — aldrig blandat.",
          "Four verified in Sweden, two in Dubai, current work market Dubai. Markets are stated separately — never mixed.",
        )}
      >
        <div className="max-w-md space-y-4">
          <PassportCard card={multiMarketCard} />
          <div className="rounded-xl border border-border bg-card p-4">
            <MarketBadgeRow badges={multiBadges} />
          </div>
        </div>
      </Panel>
    </div>
  );
}
