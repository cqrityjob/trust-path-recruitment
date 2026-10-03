// Platform administration — the Security Passport catalogue, diagnosed.
//
// READ-ONLY. Every researched definition, by its stable code, with WHY it is or
// is not selectable and which decision is outstanding. It approves nothing:
// definition approval, market activation and opening a public pilot remain
// reviewed migrations (docs/passport/closed-catalogue-governance.md), and
// internal pilot access for a named user is granted on that user's page.

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import {
  adminListPassportCatalogue,
  type AdminCatalogueRow,
} from "@/lib/job-intelligence/admin-passport-catalogue.functions";
import {
  adminListCatalogueRequests,
  adminListResearchRecords,
  adminResolveCatalogueRequest,
  adminReviewResearchRecord,
  type AdminCatalogueRequest,
  type AdminResearchRecord,
} from "@/lib/job-intelligence/admin-catalogue-research.functions";
import { RequestsPanel } from "@/components/admin/passport-catalogue/RequestsPanel";
import { ResearchPanel } from "@/components/admin/passport-catalogue/ResearchPanel";
import type {
  CatalogueAvailability,
  DiagnosticReason,
} from "@/lib/security-passport/catalogue-diagnostics";

type Tab = "definitions" | "research" | "requests";
const TABS: readonly { value: Tab; sv: string; en: string }[] = [
  { value: "definitions", sv: "Definitioner", en: "Definitions" },
  { value: "research", sv: "Forskning", en: "Research" },
  { value: "requests", sv: "Förfrågningar", en: "Requests" },
];

export const Route = createFileRoute("/_authenticated/admin/passport-catalogue")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab:
      search.tab === "research" || search.tab === "requests" || search.tab === "definitions"
        ? search.tab
        : undefined,
  }),
  component: PassportCatalogueRoute,
});

const AVAILABILITY: Record<CatalogueAvailability, { sv: string; en: string }> = {
  selectable: { sv: "Valbar för alla", en: "Selectable by everyone" },
  selectable_pilot_members: {
    sv: "Valbar för pilotmedlemmar i marknaden",
    en: "Selectable by this market's pilot members",
  },
  selectable_public_pilot: {
    sv: "Valbar för alla inloggade — öppen pilot",
    en: "Selectable by every signed-in holder — public pilot",
  },
  awaiting_definition_approval: {
    sv: "Väntar på godkännande av definitionen",
    en: "Awaiting definition approval",
  },
  market_closed: { sv: "Marknaden är stängd", en: "Market closed" },
  retired: {
    sv: "Utfasad — kan inte registreras på nytt",
    en: "Retired — cannot be registered again",
  },
  blocked: { sv: "Blockerad — styrd uppgift saknas", en: "Blocked — governed data missing" },
};

const REASONS: Record<DiagnosticReason, { sv: string; en: string }> = {
  definition_not_approved: {
    sv: "Definitionen är inte godkänd (is_active = false). Beslutas per definition genom granskad migration.",
    en: "The definition is not approved (is_active = false). Decided per definition by reviewed migration.",
  },
  market_closed: {
    sv: "Marknadspaketet är varken aktivt eller i pilot.",
    en: "The market pack is neither active nor in a pilot.",
  },
  market_pilot_members_only: {
    sv: "Marknaden är i intern pilot: erbjuds bara namngivna pilotmedlemmar (ges på användarens sida).",
    en: "The market is in internal pilot: offered to named pilot members only (granted on the user's page).",
  },
  market_public_pilot: {
    sv: "Marknaden är i öppen pilot: alla inloggade användare erbjuds den, utan pilotåtkomst. Den är inte aktiv och inte juridiskt godkänd.",
    en: "The market is in public pilot: every signed-in user is offered it, with no pilot grant. It is not active and not legally approved.",
  },
  public_pilot_not_approved: {
    sv: "Ägaren har öppnat definitionen i den öppna piloten. Den erbjuds alla inloggade i just den här marknaden, är inte godkänd (is_active = false) och dess juridiska granskning är oförändrad.",
    en: "Opened by the owner in the public pilot. Offered to every signed-in user in this exact market, not approved (is_active = false), and its legal review is unchanged.",
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
  retired: {
    sv: "Definitionens slutdatum har passerat. Den som redan registrerat den behåller den; ingen kan registrera den på nytt.",
    en: "The definition's end date has passed. Holders who already registered it keep it; nobody can register it again.",
  },
  jurisdiction_inactive: {
    sv: "Land eller region är inte aktiv.",
    en: "The country or region is not active.",
  },
  source_review_missing: {
    sv: "Källgranskning saknas: inget yrkesområde och ingen registrerad källa.",
    en: "No source review: no professional area and no recorded source.",
  },
  national_qualification_no_market: {
    sv: "Nationell yrkeskvalifikation: erbjuds utan marknadspaket eftersom den inte ger någon behörighet. Juridisk granskning av ett marknadspaket krävs inte och har inte gjorts.",
    en: "National qualification: offered without a market pack because it authorises nothing. No market-pack legal review is required, and none has been made.",
  },
};

/** The legal review, in its own words and its own column. Availability is a
 *  different question: a public pilot opens a market whose review is pending,
 *  and this column is what keeps that visible. */
const LEGAL_REVIEW: Record<string, { sv: string; en: string }> = {
  pending: { sv: "Väntar på granskning", en: "Pending" },
  in_review: { sv: "Granskas", en: "In review" },
  approved: { sv: "Godkänd", en: "Approved" },
  grandfathered: { sv: "Äldre godkännande", en: "Grandfathered" },
};

function legalReviewText(state: string | null | undefined, l: "sv" | "en"): string {
  if (!state) return "-";
  return LEGAL_REVIEW[state]?.[l] ?? state;
}

/** The definition's pilot state, in words. The raw `closed` printed under an
 *  active market's code read as "Sweden: closed" beside "Selectable by
 *  everyone"; it means only that the definition is in no pilot. */
const PILOT_STATE: Record<string, { sv: string; en: string }> = {
  closed: { sv: "ingen pilot", en: "no pilot" },
  internal_pilot: { sv: "intern pilot", en: "internal pilot" },
  public_pilot: { sv: "öppen pilot", en: "public pilot" },
};

function pilotStateText(state: string | null | undefined, l: "sv" | "en"): string {
  if (!state) return "-";
  return PILOT_STATE[state]?.[l] ?? state;
}

function AutomaticVerificationText({
  value,
  l,
}: {
  value: AdminCatalogueRow["automaticVerification"];
  l: "sv" | "en";
}) {
  const copy = (sv: string, en: string) => (l === "sv" ? sv : en);
  if (!value || value.kind === "none")
    return (
      <span data-automatic-verification="none">
        {copy(
          "Ingen — en behörig granskare bedömer underlaget",
          "None — an authorised reviewer assesses the evidence",
        )}
      </span>
    );
  if (value.kind === "signed_credential")
    return (
      <span data-automatic-verification="signed_credential">
        {copy("Signerat intyg", "Signed credential")}: {value.issuers.join(", ")}
      </span>
    );
  if (value.kind === "link_source")
    return <span data-automatic-verification="link_source">{value.source}</span>;
  return (
    <span data-automatic-verification="source_disabled">
      {value.source} — {copy("avstängd", "disabled")}: {value.blockedBy}
    </span>
  );
}

function PassportCatalogueRoute() {
  const { lang } = useT();
  const l = lang === "sv" ? "sv" : "en";
  const copy = (sv: string, en: string) => (l === "sv" ? sv : en);
  const load = useServerFn(adminListPassportCatalogue);
  const loadResearch = useServerFn(adminListResearchRecords);
  const loadRequests = useServerFn(adminListCatalogueRequests);
  const decide = useServerFn(adminReviewResearchRecord);
  const resolve = useServerFn(adminResolveCatalogueRequest);
  const { tab = "definitions" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<readonly AdminCatalogueRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [research, setResearch] = useState<readonly AdminResearchRecord[] | null>(null);
  const [researchFailed, setResearchFailed] = useState(false);
  const [requests, setRequests] = useState<readonly AdminCatalogueRequest[] | null>(null);
  const [requestsFailed, setRequestsFailed] = useState(false);
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
  // The research queue and the requests are read tolerantly: a database that has
  // not received 20270212090000 yet leaves these two tabs saying so, and the
  // definitions tab untouched.
  const refreshResearch = () =>
    loadResearch()
      .then((r) => {
        setResearch(r);
        setResearchFailed(false);
      })
      .catch(() => setResearchFailed(true));
  const refreshRequests = () =>
    loadRequests()
      .then((r) => {
        setRequests(r);
        setRequestsFailed(false);
      })
      .catch(() => setRequestsFailed(true));
  useEffect(() => {
    void refreshResearch();
    void refreshRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A national qualification has no market pack: it is grouped by its own
  // country, never under "International".
  const marketOf = (r: AdminCatalogueRow) =>
    r.marketPackCode ??
    (r.scopeCode === "global_professional" ? "INTL" : (r.jurisdictionCode ?? "INTL"));
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
                "Varje undersökt definition, med varför den är eller inte är valbar. Sidan är läsande: godkännande av en definition, aktivering av en marknad och öppning av en öppen pilot sker genom granskad migration, och intern pilotåtkomst ges på användarens sida. Tillgänglighet och juridisk granskning visas i var sin kolumn.",
                "Every researched definition, with why it is or is not selectable. This page is read-only: a definition is approved, a market activated and a public pilot opened by reviewed migration, and internal pilot access is granted on the user's page. Availability and legal review are shown in separate columns.",
              )}
            </p>
          </header>
          <nav
            aria-label={copy("Vyer", "Views")}
            className="flex flex-wrap gap-2"
            data-catalogue-tabs
          >
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                data-catalogue-tab={t.value}
                aria-pressed={tab === t.value}
                className={`min-h-11 rounded-full border px-4 text-sm ${tab === t.value ? "border-accent bg-accent/10 font-medium" : "border-border bg-background"}`}
                onClick={() => void navigate({ search: { tab: t.value } })}
              >
                {t[l]}
                {t.value === "research" && research && (
                  <span className="ml-2 text-xs text-muted-foreground">{research.length}</span>
                )}
                {t.value === "requests" && requests && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {requests.filter((r) => r.status === "open").length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          {tab === "research" && (
            <ResearchPanel
              l={l}
              records={research}
              failed={researchFailed}
              onDecide={async (input) => {
                await decide({ data: input });
                await refreshResearch();
              }}
            />
          )}
          {tab === "requests" && (
            <RequestsPanel
              l={l}
              requests={requests}
              failed={requestsFailed}
              definitions={(rows ?? []).map((r) => ({
                code: r.code,
                name: l === "sv" ? r.nameSv : r.nameEn,
              }))}
              research={research ?? []}
              onResolve={async (input) => {
                await resolve({ data: input });
                await refreshRequests();
              }}
            />
          )}
          {tab === "definitions" && (
            <>
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
                  <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" data-catalogue-counts>
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
                    <table className="w-full min-w-[68rem] text-left text-sm">
                      <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="p-3">{copy("Kod", "Code")}</th>
                          <th className="p-3">{copy("Merit", "Credential")}</th>
                          <th className="p-3">{copy("Marknad", "Market")}</th>
                          <th className="p-3">{copy("Organisationer", "Organisations")}</th>
                          <th className="p-3">
                            {copy("Tillgänglighet och orsak", "Availability and reason")}
                          </th>
                          <th className="p-3">{copy("Juridisk granskning", "Legal review")}</th>
                          <th className="p-3">
                            {copy("Automatisk verifiering", "Automatic verification")}
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
                              {(r.versions?.length ?? 0) > 0 && (
                                <ul className="mt-1 space-y-0.5 text-xs" data-catalogue-versions>
                                  {r.versions?.map((v) => (
                                    <li key={v.key}>
                                      <span className="font-mono">{v.key}</span> ·{" "}
                                      {[
                                        v.qualificationCode,
                                        v.registerCode,
                                        v.frameworkLevel != null
                                          ? `NSQF ${v.frameworkLevel}`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}{" "}
                                      ·{" "}
                                      {v.status === "current"
                                        ? copy("aktuell", "current")
                                        : copy(
                                            "ersatt (inte utgånget)",
                                            "superseded (not expired)",
                                          )}{" "}
                                      ·{" "}
                                      <a
                                        className="text-accent underline"
                                        href={v.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {new URL(v.sourceUrl).hostname}
                                      </a>
                                    </li>
                                  ))}
                                  <li className="text-muted-foreground">
                                    {copy("Examinerande organ", "Awarding body")}:{" "}
                                    {[...new Set(r.versions?.map((v) => v.awardingBody))].join(
                                      ", ",
                                    )}
                                  </li>
                                </ul>
                              )}
                            </td>
                            <td className="p-3 text-xs">
                              {marketOf(r)}
                              {r.subJurisdictionCode ? ` / ${r.subJurisdictionCode}` : ""}
                              <br />
                              <span className="text-muted-foreground" data-catalogue-territory>
                                {r.scopeCode === "global_professional"
                                  ? copy("inget land", "no country")
                                  : r.scopeCode === "national_qualification"
                                    ? copy(
                                        `${r.jurisdictionCode}, hela landet · ingen region · inget marknadspaket`,
                                        `${r.jurisdictionCode}, whole country · no region · no market pack`,
                                      )
                                    : `${r.jurisdictionCode ?? "-"}${r.subJurisdictionCode ? ` · ${copy("region krävs", "region required")}` : ""}`}
                              </span>
                              <br />
                              <span
                                className="text-muted-foreground"
                                data-catalogue-pilot-state={r.pilotState ?? ""}
                              >
                                {pilotStateText(r.pilotState, l)}
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
                            <td className="p-3 text-xs" data-catalogue-legal-review>
                              <p>
                                {copy("Definition", "Definition")}:{" "}
                                <span data-legal-review-definition={r.legalReviewState ?? ""}>
                                  {legalReviewText(r.legalReviewState, l)}
                                </span>
                              </p>
                              {r.marketPackCode ? (
                                <p>
                                  {copy("Marknadspaket", "Market pack")}:{" "}
                                  <span data-legal-review-pack={r.packLegalReviewState ?? ""}>
                                    {legalReviewText(r.packLegalReviewState, l)}
                                  </span>
                                </p>
                              ) : null}
                            </td>
                            <td className="p-3 text-xs">
                              <AutomaticVerificationText value={r.automaticVerification} l={l} />
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
            </>
          )}
        </section>
      </AdminShellChrome>
    </SiteLayout>
  );
}
