// Three markets, one Passport — the reviewable states, on fixtures, offline.
//
// What a holder sees on the overview (the three market cards, as a public
// reader and as an entitled pilot member) and on "Mina uppgifter" (the
// governed catalogue for each of the four market packs, grouped and counted),
// rendered from the fixture mirrors with no database, no session and no
// network. The browser evidence suite photographs these panels; the
// market-catalogue guard renders the same components from the same fixtures.
//
// Nothing here opens a market. GB, GB-NI and AE-DU are `is_active = false`
// and pending legal review; the "open_pilot" state below is what an ENTITLED
// member sees, and the public card beside it is what everyone else sees.

import { useMemo, useState } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { FIXTURE_CREDENTIAL_TYPES } from "@/lib/security-passport/fixtures/credential-types";
import {
  FIXTURE_AE_DU_CATALOGUE,
  FIXTURE_GB_CATALOGUE,
  FIXTURE_GB_NI_CATALOGUE,
} from "@/lib/security-passport/fixtures/market-catalogues";
import type { CatalogueOption } from "@/lib/security-passport/market-catalogue";
import {
  FIXTURE_MARKETS_PILOT_GB,
  FIXTURE_MARKETS_PUBLIC,
} from "@/lib/security-passport/fixtures/market-overview";
import { MarketCredentialSection } from "./MarketCredentialSection";
import { MarketOverviewCards } from "./MarketOverviewCards";
import { CredentialCatalogue } from "./CredentialCatalogue";

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

const toOptions = (rows: readonly CatalogueOption[]): readonly CatalogueOption[] =>
  rows.map((t) => ({
    code: t.code,
    category: t.category,
    nameSv: t.nameSv,
    nameEn: t.nameEn,
    symbolLabel: t.symbolLabel,
  }));

export function ThreeMarketFixture() {
  const { lang } = usePassportCopy();
  const note = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const [selected, setSelected] = useState<string | null>("AE_DU_SIRA_CARD_GUARD");

  const se = useMemo(() => toOptions(FIXTURE_CREDENTIAL_TYPES), []);
  const gb = useMemo(() => toOptions(FIXTURE_GB_CATALOGUE), []);
  const ni = useMemo(() => toOptions(FIXTURE_GB_NI_CATALOGUE), []);
  const du = useMemo(() => toOptions(FIXTURE_AE_DU_CATALOGUE), []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10">
      <Panel
        id="markets-public"
        title={note(
          "A — Marknadsöversikt, utan pilotåtkomst",
          "A — Market overview, no pilot access",
        )}
        note={note(
          "Sverige tillgänglig. Storbritannien och Dubai synligt under granskning; inga reglerade val kan väljas där.",
          "Sweden available. The United Kingdom and Dubai visibly under review; no regulated choice is selectable there.",
        )}
      >
        <MarketOverviewCards state={{ status: "ready", markets: FIXTURE_MARKETS_PUBLIC }} />
      </Panel>

      <Panel
        id="markets-pilot"
        title={note(
          "B — Marknadsöversikt, pilotdeltagare (GB)",
          "B — Market overview, pilot member (GB)",
        )}
        note={note(
          "Samma tre kort. Storbritannien är innehavarens arbetsmarknad och användbart — med pilotvarningen kvar.",
          "The same three cards. Great Britain is the holder's work market and usable — with the pilot warning kept.",
        )}
      >
        <MarketOverviewCards state={{ status: "ready", markets: FIXTURE_MARKETS_PILOT_GB }} />
      </Panel>

      <Panel
        id="catalogue-se"
        title={note(
          "C — Sverige: 3 förordnanden, 5 utbildningar",
          "C — Sweden: 3 appointments, 5 training",
        )}
        note={note(
          "Produktionsmarknad. Ingen sökruta vid åtta val.",
          "Production market. No search at eight choices.",
        )}
      >
        <MarketCredentialSection
          state="open"
          jurisdictionCode="SE"
          subJurisdictionCode={null}
          options={se}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="catalogue-gb"
        title={note(
          "D — Storbritannien: 7 licenser, 6 kvalifikationer",
          "D — Great Britain: 7 licences, 6 qualifications",
        )}
        note={note(
          "Intern pilot. Katalogen är användbar för en behörig deltagare och säger att marknaden granskas.",
          "Internal pilot. The catalogue is usable for an entitled member and says the market is under review.",
        )}
      >
        <MarketCredentialSection
          state="open_pilot"
          jurisdictionCode="GB"
          subJurisdictionCode={null}
          options={gb}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="catalogue-gb-ni"
        title={note(
          "E — Nordirland: 1 licens, 0 kvalifikationer",
          "E — Northern Ireland: 1 licence, 0 qualifications",
        )}
        note={note(
          "En egen delmarknad. Fordonslåsning finns här och aldrig i den allmänna GB-katalogen.",
          "A separate submarket. Vehicle immobilisation lives here and never in the general GB catalogue.",
        )}
      >
        <MarketCredentialSection
          state="open_pilot"
          jurisdictionCode="GB"
          subJurisdictionCode="GB-NI"
          options={ni}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="catalogue-ae-du"
        title={note(
          "F — Dubai: 15 kadrekort, 15 utbildningar",
          "F — Dubai: 15 cadre cards, 15 training",
        )}
        note={note(
          "Trettio val får en sökruta. Varje rad är Dubai/SIRA, aldrig UAE-omfattande.",
          "Thirty choices gain a search field. Every row is Dubai/SIRA, never UAE-wide.",
        )}
      >
        <MarketCredentialSection
          state="open_pilot"
          jurisdictionCode="AE"
          subJurisdictionCode="AE-DU"
          options={du}
          onSelect={() => undefined}
        />
      </Panel>

      <Panel
        id="catalogue-select"
        title={note("G — Formulärets urval, med sök", "G — The form's selection, with search")}
        note={note(
          "Samma katalog i radioläge. Ett val överlever en sökning som inte matchar det.",
          "The same catalogue in select mode. A choice survives a search that does not match it.",
        )}
      >
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            {note("Vad vill du lägga till?", "What would you like to add?")}
          </legend>
          <div className="mt-2">
            <CredentialCatalogue
              mode="select"
              idPrefix="fx-select"
              options={du}
              selectedCode={selected}
              onChange={setSelected}
            />
          </div>
        </fieldset>
      </Panel>

      <Panel
        id="catalogue-states"
        title={note("H — Laddar, misslyckades, tom", "H — Loading, failed, empty")}
        note={note(
          "De tre tillstånden som inte är en katalog, var och en i ord.",
          "The three states that are not a catalogue, each in words.",
        )}
      >
        <div className="space-y-4">
          <CredentialCatalogue
            mode="action"
            options={[]}
            status="loading"
            onSelect={() => undefined}
          />
          <CredentialCatalogue
            mode="action"
            options={[]}
            status="failed"
            onRetry={() => undefined}
            onSelect={() => undefined}
          />
          <CredentialCatalogue
            mode="action"
            options={[]}
            status="ready"
            onSelect={() => undefined}
          />
        </div>
      </Panel>
    </div>
  );
}
