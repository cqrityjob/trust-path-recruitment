// Platform administration — the Security Passport catalogue, diagnosed.
//
// READ-ONLY. Every researched definition, by its stable code, with WHY it is or
// is not selectable and which decision is outstanding. It approves nothing:
// definition approval and market activation remain reviewed migrations
// (docs/passport/closed-catalogue-governance.md), and pilot access for a named
// user is granted on that user's page.

import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import {
  adminListPassportCatalogue,
  type AdminCatalogueRow,
} from "@/lib/job-intelligence/admin-passport-catalogue.functions";
import type {
  CatalogueAvailability,
  DiagnosticReason,
} from "@/lib/security-passport/catalogue-diagnostics";

export const Route = createFileRoute("/_authenticated/admin/passport-catalogue")({
  ssr: false,
  component: PassportCatalogueRoute,
});

const AVAILABILITY: Record<CatalogueAvailability, { sv: string; en: string }> = {
  selectable: { sv: "Valbar för alla", en: "Selectable by everyone" },
  selectable_pilot_members: {
    sv: "Valbar för pilotmedlemmar i marknaden",
    en: "Selectable by this market's pilot members",
  },
  awaiting_definition_approval: {
    sv: "Väntar på godkännande av definitionen",
    en: "Awaiting definition approval",
  },
  market_closed: { sv: "Marknaden är stängd", en: "Market closed" },
  blocked: { sv: "Blockerad — styrd uppgift saknas", en: "Blocked — governed data missing" },
};

const REASONS: Record<DiagnosticReason, { sv: string; en: string }> = {
  definition_not_approved: {
    sv: "Definitionen är inte godkänd (is_active = false). Beslutas per definition genom granskad migration.",
    en: "The definition is not approved (is_active = false). Decided per definition by reviewed migration.",
  },
  market_closed: {
    sv: "Marknadspaketet är varken aktivt eller i intern pilot.",
    en: "The market pack is neither active nor in internal pilot.",
  },
  market_pilot_members_only: {
    sv: "Marknaden är i intern pilot: erbjuds bara namngivna pilotmedlemmar (ges på användarens sida).",
    en: "The market is in internal pilot: offered to named pilot members only (granted on the user's page).",
  },
  pilot_authorised_not_public: {
    sv: "Ägaren har godkänt definitionen för intern pilot. Den erbjuds giltiga pilotmedlemmar i just den här marknaden, är inte godkänd för allmänheten (is_active = false) och publiceras inte av att marknaden aktiveras.",
    en: "Authorised by the owner for the internal pilot. Offered to valid pilot members of this exact market, not approved for the public (is_active = false), and not published by activating the market.",
  },
  issuer_unresolved: {
    sv: "Ingen styrd utfärdare, och ingen dokumentangiven utfärdare under en styrd tillsynsmyndighet.",
    en: "No governed issuer, and no document-stated issuer under a governed regulator.",
  },
  deprecated: { sv: "Definitionen är utfasad.", en: "The definition is deprecated." },
  jurisdiction_inactive: {
    sv: "Land eller region är inte aktiv.",
    en: "The country or region is not active.",
  },
  source_review_missing: {
    sv: "Källgranskning saknas: inget yrkesområde och ingen registrerad källa.",
    en: "No source review: no professional area and no recorded source.",
  },
};

function PassportCatalogueRoute() {
  const { lang } = useT();
  const l = lang === "sv" ? "sv" : "en";
  const copy = (sv: string, en: string) => (l === "sv" ? sv : en);
  const load = useServerFn(adminListPassportCatalogue);
  const [rows, setRows] = useState<readonly AdminCatalogueRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [market, setMarket] = useState("");
  const [availability, setAvailability] = useState("");

  useEffect(() => {
    let active = true;
    load()
      .then((r) => active && setRows(r))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [load]);

  const marketOf = (r: AdminCatalogueRow) => r.marketPackCode ?? "INTL";
  const markets = useMemo(() => [...new Set((rows ?? []).map(marketOf))].sort(), [rows]);
  const shown = (rows ?? []).filter(
    (r) =>
      (!market || marketOf(r) === market) && (!availability || r.availability === availability),
  );
  const counts = (rows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.availability] = (acc[r.availability] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="passportCatalogue">
        <section className="space-y-6" data-admin-passport-catalogue>
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {copy("Security Passport — meritkatalog", "Security Passport — credential catalogue")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {copy(
                "Varje undersökt definition, med varför den är eller inte är valbar. Sidan är läsande: godkännande av en definition och aktivering av en marknad sker genom granskad migration, och pilotåtkomst ges på användarens sida.",
                "Every researched definition, with why it is or is not selectable. This page is read-only: a definition is approved and a market activated by reviewed migration, and pilot access is granted on the user's page.",
              )}
            </p>
          </header>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {copy("Katalogen kunde inte läsas.", "The catalogue could not be read.")}
            </p>
          )}
          {!rows && !failed && (
            <p role="status">{copy("Läser katalogen…", "Loading catalogue…")}</p>
          )}
          {rows && (
            <>
              <dl className="grid gap-3 sm:grid-cols-5" data-catalogue-counts>
                {(Object.keys(AVAILABILITY) as CatalogueAvailability[]).map((a) => (
                  <div key={a} className="rounded-lg border border-border bg-card p-3">
                    <dt className="text-xs text-muted-foreground">{AVAILABILITY[a][l]}</dt>
                    <dd className="mt-1 text-xl font-semibold" data-count={a}>
                      {counts[a] ?? 0}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-4">
                <label className="text-sm">
                  {copy("Marknad", "Market")}
                  <select
                    className="mt-1 block min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                  >
                    <option value="">{copy("Alla", "All")}</option>
                    {markets.map((m) => (
                      <option key={m} value={m}>
                        {m === "INTL" ? copy("Internationell", "International") : m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  {copy("Tillgänglighet", "Availability")}
                  <select
                    className="mt-1 block min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                  >
                    <option value="">{copy("Alla", "All")}</option>
                    {(Object.keys(AVAILABILITY) as CatalogueAvailability[]).map((a) => (
                      <option key={a} value={a}>
                        {AVAILABILITY[a][l]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="self-end text-sm text-muted-foreground" role="status">
                  {copy(
                    `Visar ${shown.length} av ${rows.length}`,
                    `Showing ${shown.length} of ${rows.length}`,
                  )}
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[60rem] text-left text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3">{copy("Kod", "Code")}</th>
                      <th className="p-3">{copy("Merit", "Credential")}</th>
                      <th className="p-3">{copy("Marknad", "Market")}</th>
                      <th className="p-3">{copy("Organisationer", "Organisations")}</th>
                      <th className="p-3">
                        {copy("Tillgänglighet och orsak", "Availability and reason")}
                      </th>
                      <th className="p-3">{copy("Källa", "Source")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr
                        key={r.code}
                        className="border-t border-border align-top"
                        data-catalogue-row={r.code}
                      >
                        <td className="p-3 font-mono text-xs">{r.code}</td>
                        <td className="p-3">
                          <p className="font-medium">{l === "sv" ? r.nameSv : r.nameEn}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.claimType} · {r.category}
                            {r.holderMustState.includes("authorisation_scope") &&
                              ` · ${copy("innehavaren anger omfattning", "holder states the scope")}`}
                            {r.holderMustState.includes("issuer_name") &&
                              ` · ${copy("innehavaren anger utfärdare enligt intyget", "holder states the issuer on the certificate")}`}
                          </p>
                        </td>
                        <td className="p-3 text-xs">
                          {marketOf(r)}
                          {r.subJurisdictionCode ? ` / ${r.subJurisdictionCode}` : ""}
                          <br />
                          <span className="text-muted-foreground">
                            {r.legalReviewState ?? "-"} · {r.pilotState ?? "-"}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {r.regulator && (
                            <p>
                              {copy("Tillsyn", "Regulator")}: {r.regulator}
                            </p>
                          )}
                          <p>
                            {copy("Utfärdare", "Issuer")}:{" "}
                            {r.governedCertificationIssuer ??
                              r.governedAuthority ??
                              (r.issuerStatedOnDocument
                                ? copy("anges på intyget", "stated on the certificate")
                                : copy("saknas", "missing"))}
                          </p>
                          {r.trainingProviderStatedOnDocument && (
                            <p>
                              {copy("Utbildare", "Training provider")}:{" "}
                              {copy("anges på intyget", "stated on the certificate")}
                            </p>
                          )}
                        </td>
                        <td className="p-3">
                          <p className="font-medium" data-availability={r.availability}>
                            {AVAILABILITY[r.availability][l]}
                          </p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                            {r.reasons.map((reason) => (
                              <li key={reason}>{REASONS[reason][l]}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="p-3 text-xs">
                          {r.review ? (
                            <>
                              <a
                                className="text-accent underline"
                                href={r.review.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {new URL(r.review.sourceUrl).hostname}
                              </a>
                              <br />
                              {copy("kontrollerad", "checked")} {r.review.checkedOn}
                            </>
                          ) : (
                            copy("saknas", "missing")
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </AdminShellChrome>
    </SiteLayout>
  );
}
