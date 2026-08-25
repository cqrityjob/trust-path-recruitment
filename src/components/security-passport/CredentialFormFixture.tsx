// Dev-harness host for the credential form. Scaffolding, not product.
//
// Wires the pure CredentialForm to fixture taxonomy rows and local state,
// so every behaviour — progressive disclosure, validation, draft save,
// resume, discard — can be exercised and reviewed in a browser with no
// account, no database and no network. What the live route wires to the
// server, this wires to component state and prints back for inspection.

import { useState } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { CredentialDraft } from "@/lib/security-passport/credentials";
import { FIXTURE_CREDENTIAL_TYPES } from "@/lib/security-passport/fixtures/credential-types";
import { CredentialForm } from "./CredentialForm";
import {
  JurisdictionPicker,
  type MarketChoice,
  type PickerJurisdiction,
} from "./JurisdictionPicker";

/** The jurisdiction registry as it actually stands: Sweden live, everything
 *  else authored and pending legal review, and five emirates with no pack at
 *  all.
 *
 *  Mirrors sp_jurisdictions, sp_sub_jurisdictions and sp_market_packs after
 *  20260908094000-20260908096000. The harness exists so this flow can be
 *  reviewed with no account and no database, and the states are the whole
 *  point of the flow — a fixture that pretended every market worked would be
 *  reviewing a screen the product does not serve. */
const FIXTURE_JURISDICTIONS: readonly PickerJurisdiction[] = [
  {
    jurisdictionCode: "SE",
    nameSv: "Sverige",
    nameEn: "Sweden",
    nationalState: "supported",
    requiresSubJurisdiction: false,
    subJurisdictions: [],
  },
  {
    jurisdictionCode: "GB",
    nameSv: "Storbritannien",
    nameEn: "United Kingdom",
    // Authored from the SIA licence sectors, not yet legally reviewed.
    nationalState: "pending_review",
    // FALSE on purpose: the seven Great Britain sectors resolve against the
    // national pack, so a UK holder is offered the region question but never
    // forced through it.
    requiresSubJurisdiction: false,
    subJurisdictions: [
      {
        code: "GB-NI",
        nameSv: "Nordirland",
        nameEn: "Northern Ireland",
        supportState: "pending_review",
      },
    ],
  },
  {
    jurisdictionCode: "AE",
    nameSv: "Förenade Arabemiraten",
    nameEn: "United Arab Emirates",
    // There is no national pack, and that is not a gap: SIRA regulates Dubai,
    // the Ministry of Interior framework covers Abu Dhabi, and "a UAE security
    // licence" is not a thing that exists.
    nationalState: "not_supported",
    requiresSubJurisdiction: true,
    subJurisdictions: [
      { code: "AE-AJ", nameSv: "Ajman", nameEn: "Ajman", supportState: "not_supported" },
      { code: "AE-AZ", nameSv: "Abu Dhabi", nameEn: "Abu Dhabi", supportState: "pending_review" },
      { code: "AE-DU", nameSv: "Dubai", nameEn: "Dubai", supportState: "pending_review" },
      { code: "AE-FU", nameSv: "Fujairah", nameEn: "Fujairah", supportState: "not_supported" },
      {
        code: "AE-RK",
        nameSv: "Ras al-Khaimah",
        nameEn: "Ras Al Khaimah",
        supportState: "not_supported",
      },
      { code: "AE-SH", nameSv: "Sharjah", nameEn: "Sharjah", supportState: "not_supported" },
      {
        code: "AE-UQ",
        nameSv: "Umm al-Quwain",
        nameEn: "Umm Al Quwain",
        supportState: "not_supported",
      },
    ],
  },
];

export function CredentialFormFixture() {
  const { pt } = usePassportCopy();
  const [saved, setSaved] = useState<(CredentialDraft & { id: string }) | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activated, setActivated] = useState<CredentialDraft | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [market, setMarket] = useState<MarketChoice | null>(null);

  function reset() {
    setSaved(null);
    setSavedAt(null);
    setActivated(null);
    setFormKey((k) => k + 1);
  }

  // The harness's stand-in for listCredentialCatalogue. Sweden is the only
  // supported market, so it is the only one with a catalogue — and every other
  // choice yields NOTHING rather than falling back to this one, which is the
  // behaviour worth reviewing.
  const country = market
    ? (FIXTURE_JURISDICTIONS.find((j) => j.jurisdictionCode === market.jurisdictionCode) ?? null)
    : null;
  const region =
    country && market?.subJurisdictionCode
      ? (country.subJurisdictions.find((r) => r.code === market.subJurisdictionCode) ?? null)
      : null;
  const resolvedState = region ? region.supportState : country ? country.nationalState : null;
  const supported = resolvedState === "supported" && !(country?.requiresSubJurisdiction && !region);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("cred.add.title")}
        </h2>
        <div className="mt-4">
          <JurisdictionPicker
            jurisdictions={FIXTURE_JURISDICTIONS}
            value={market}
            resolvedState={resolvedState}
            busy={false}
            onChange={(next) => {
              setMarket(next);
              reset();
            }}
          />
        </div>
      </section>

      {supported ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <CredentialForm
            key={formKey}
            types={FIXTURE_CREDENTIAL_TYPES}
            // The market arrives already CHOSEN, exactly as it does in the
            // live route: JurisdictionPicker above decides it, and this form
            // never asks for it. Sweden is the only market that reaches here,
            // because it is the only supported one — the others render their
            // own state and no form at all.
            market={{
              marketPackCode: country?.jurisdictionCode ?? "SE",
              jurisdictionCode: country?.jurisdictionCode ?? "SE",
              subJurisdictionCode: market?.subJurisdictionCode ?? null,
              nameSv: country?.nameSv ?? "Sverige",
              nameEn: country?.nameEn ?? "Sweden",
            }}
            initial={saved}
            busy={false}
            serverError={null}
            savedAt={savedAt}
            onSaveDraft={(d) => {
              setSaved({ ...d, id: "fixture-draft" });
              setSavedAt(new Date().toISOString());
              setActivated(null);
            }}
            onActivate={(d) => {
              setActivated(d);
              setSaved(null);
              setSavedAt(null);
            }}
            onDiscard={saved ? reset : undefined}
            onCancel={reset}
            onChangeMarket={() => {
              setMarket(null);
              reset();
            }}
          />
        </section>
      ) : null}

      {activated ? (
        <section className="rounded-xl border border-border bg-secondary/40 p-5">
          <p role="status" className="text-sm font-medium text-foreground">
            {pt("cred.added")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{pt("cred.evidenceNext")}</p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            {JSON.stringify(activated, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
