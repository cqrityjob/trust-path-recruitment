import { CredentialDateInput } from "./CredentialDateInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Globe2, MapPin, ArrowRight, Lock, Check, FileCheck2 } from "lucide-react";
import type {
  InternationalCredentialInput,
  InternationalPassportMetadata,
} from "@/lib/security-passport/international.functions";
import {
  EVIDENCE_ALLOWED_MIME,
  EVIDENCE_MAX_BYTES,
} from "@/lib/security-passport/evidence.functions";
import { CREDENTIAL_CLASSES, type CredentialClass } from "@/lib/security-passport/international";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { isStrictlyAfter, toIsoDateOrRaw, todayIso } from "@/lib/security-passport/dates";
import {
  acceptValue,
  applyReading,
  isReadByHayat,
  withdrawReading,
  type FieldNotices,
  type HayatMarks,
} from "@/lib/security-passport/hayat/suggestions";
import type {
  DocumentReader,
  DocumentReading,
  ReadingContext,
  SuggestibleField,
} from "@/lib/security-passport/hayat/types";
import {
  unverifiableDocument,
  type HayatDecision,
} from "@/lib/security-passport/hayat/verification/model";
import {
  HayatBadge,
  HayatFieldNote,
  HayatPanel,
  type HayatAssessmentState,
} from "./hayat/HayatPanel";
import { useHayatReading } from "./hayat/use-hayat-reading";
import {
  buildCatalogueIndex,
  changeFilter,
  clearOptionalFilters,
  EMPTY_FILTERS,
  filterCatalogue,
  type CatalogueFilterState,
  type IndexedDefinition,
  type OrganisationRoleKind,
} from "@/lib/security-passport/credential-catalogue-filters";

const DOMAIN_LABELS: Record<string, { sv: string; en: string }> = {
  security_operations: { sv: "Säkerhetsarbete", en: "Security operations" },
  security_management: { sv: "Säkerhetsledning", en: "Security management" },
  physical_security: { sv: "Fysisk säkerhet", en: "Physical security" },
  information_security: { sv: "Informationssäkerhet", en: "Information security" },
  investigation: { sv: "Utredning", en: "Investigation" },
  financial_crime: { sv: "Finansiell brottslighet", en: "Financial crime" },
};

// The organisation-role model's four roles, named as what they ARE. A regulator
// is never presented as a training provider, and an awarding organisation is
// never presented as a regulator.
const ROLE_LABELS: Record<OrganisationRoleKind, { sv: string; en: string }> = {
  regulator: { sv: "Tillsynsmyndighet", en: "Regulator" },
  issuer: { sv: "Utfärdare", en: "Issuer" },
  training_provider: { sv: "Utbildare", en: "Training provider" },
  verification_authority: { sv: "Kontrolleras hos", en: "Verified with" },
};

export function InternationalCredentialForm({
  initial,
  preselectCode,
  metadata,
  onSave,
  onUpload,
  onAssess,
  onLoadAvailability,
  onAssessSaved,
  accountName,
  documentReader,
}: {
  initial?: InternationalCredentialInput;
  preselectCode?: string;
  metadata: InternationalPassportMetadata | null;
  onSave: (data: InternationalCredentialInput) => Promise<{ id: string }>;
  onUpload: (
    claimId: string,
    file: { fileName: string; mimeType: string; contentBase64: string },
  ) => Promise<unknown>;
  /** HAYAT's server-side check of a signed credential found in the file. Reading
   *  the document never needs it; without it no verification result is shown
   *  beyond the honest default. */
  onAssess?: (input: {
    definitionCode: string;
    issuedOn: string | null;
    validUntil: string | null;
    signedCredential: string | null;
    badgeLink: string | null;
  }) => Promise<{ decision: HayatDecision; recorded: boolean }>;
  /** Runs once the claim (and its document) exist: the server checks the saved
   *  credential against its own evidence and RECORDS the result. Never blocks
   *  saving -- a check that cannot run leaves a credential that is simply saved. */
  onAssessSaved?: (input: { claimId: string; badgeLink: string | null }) => Promise<unknown>;
  /** The link-based sources the holder can use RIGHT NOW. A source HAYAT is not
   *  permitted to call is absent, so the link field is never a dead end. */
  onLoadAvailability?: () => Promise<{
    linkSources: readonly { id: string; name: string; definitionCodes: readonly string[] }[];
  }>;
  /** The account's display name, for comparison with the name on the document. */
  accountName?: string | null;
  /** Replaceable document reader; defaults to the in-browser pdf.js + OCR reader. */
  documentReader?: DocumentReader;
}) {
  const { lang, pt } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const navigate = useNavigate();
  const definitions = metadata?.definitions;
  const preselected = definitions?.find((d) => d.code === preselectCode);
  const [step, setStep] = useState(initial || preselected ? 4 : 1);
  const [filters, setFilters] = useState<CatalogueFilterState>({
    ...EMPTY_FILTERS,
    scope: initial?.market_country || preselected?.country ? "national" : "international",
    country: initial?.market_country ?? preselected?.country ?? "",
    // Every OPTIONAL filter starts at "all": the catalogue is never narrowed to a
    // first organisation, area or type the holder did not choose.
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Saving the claim and attaching evidence are separate existing secure operations.
  // A failed attachment retries only that attachment, never creates another claim.
  const savedId = useRef<string | null>(null);
  const blank: InternationalCredentialInput = {
    definition_code: "",
    market_country: "",
    market_region: "",
    identifier: "",
    issued_on: "",
    valid_until: "",
    no_expiry: null,
    authorisation_scope: "",
    issuer_name: "",
  };
  const [draft, setDraft] = useState<InternationalCredentialInput>(
    initial ?? { ...blank, definition_code: preselected?.code ?? "" },
  );
  // ── HAYAT: what was read from the chosen file, and what was done with it.
  const hayat = useHayatReading(documentReader);
  const [marks, setMarks] = useState<HayatMarks>({});
  const [notices, setNotices] = useState<FieldNotices>({});
  const [assessment, setAssessment] = useState<HayatAssessmentState>({ state: "none" });
  // A reading resolves seconds after it started. It is applied to the draft as
  // it is THEN, so anything typed while HAYAT was reading is already protected.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const latestMarks = useRef(marks);
  latestMarks.current = marks;
  const assessRun = useRef(0);
  const [badgeLink, setBadgeLink] = useState("");
  const [linkSources, setLinkSources] = useState<
    readonly { id: string; name: string; definitionCodes: readonly string[] }[]
  >([]);
  useEffect(() => {
    let active = true;
    // Best-effort: without it the link field is simply not offered.
    void onLoadAvailability?.()
      .then((a) => active && setLinkSources(a.linkSources))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [onLoadAvailability]);
  const locations = metadata?.jurisdictions ?? [];
  const locationName = (code: string | null) => {
    const j = locations.find((j) => j.code === code);
    return j
      ? j[lang === "sv" ? "name_sv" : "name_en"]
      : code || copy("Internationellt", "International");
  };
  const className = (value: string) =>
    CREDENTIAL_CLASSES[value as CredentialClass]?.[lang] || value;
  const domainName = (value: string) => DOMAIN_LABELS[value]?.[lang] || value;
  // ONE index over governed catalogue relationships; every filter, count and
  // search result below is derived from it. See credential-catalogue-filters.ts.
  const index = useMemo(
    () =>
      buildCatalogueIndex({
        definitions: metadata?.definitions ?? [],
        organisationRoles: metadata?.organisationRoles ?? [],
        definitionReviews: metadata?.definitionReviews ?? [],
        definitionFacts: metadata?.definitionScopes ?? [],
        abbreviations: metadata?.abbreviations ?? [],
        issuerAliases: metadata?.issuerAliases ?? [],
        organisations: (metadata?.issuers ?? []).map((i) => ({ id: i.id, name: i.name })),
      }),
    [metadata],
  );
  const localisedHaystack = (d: IndexedDefinition) =>
    [
      className(d.credential_class),
      d.country ? locationName(d.country) : "",
      d.region ? locationName(d.region) : "",
      d.domain ? domainName(d.domain) : "",
    ].join(" ");
  const answer = filterCatalogue(index, filters, localisedHaystack);
  const visible = answer.results;
  const selected = index.find((d) => d.code === draft.definition_code);
  // The catalogue row itself, for the governed fields the filter index does not carry.
  const selectedRow = definitions?.find((d) => d.code === draft.definition_code);
  const rolesOf = (d: IndexedDefinition) => {
    const byRole = new Map<OrganisationRoleKind, string>();
    for (const o of d.organisations) if (!byRole.has(o.role)) byRole.set(o.role, o.name);
    const onDocument = copy("anges på intyget", "stated on the certificate");
    if (d.issuerStatedOnDocument) byRole.set("issuer", onDocument);
    if (d.trainingProviderStatedOnDocument) byRole.set("training_provider", onDocument);
    return (["regulator", "issuer", "training_provider"] as const)
      .filter((role) => byRole.has(role))
      .map((role) => ({ role, label: ROLE_LABELS[role][lang], name: byRole.get(role) as string }));
  };
  /** Apply one filter change; dependents that are no longer valid are cleared. */
  const change = (patch: Partial<CatalogueFilterState>) => {
    setFilters((current) => changeFilter(index, current, patch));
    reset();
  };
  const scopeLabel =
    selected?.country === "AE"
      ? copy(
          "Licensierat företag som kortet är knutet till",
          "Licensed company the card is tied to",
        )
      : copy(
          "Vad förordnandet omfattar (skyddsobjekt eller uppdrag)",
          "What the appointment covers (protected site or assignment)",
        );
  /** Forget the current file's reading: abort it, and take back what it filled. */
  const forgetReading = () => {
    hayat.cancel();
    assessRun.current += 1;
    setDraft((current) => withdrawReading(current, latestMarks.current));
    setMarks({});
    setNotices({});
    setAssessment({ state: "none" });
  };
  const reset = () => {
    forgetReading();
    setDraft(blank);
    setFile(null);
    setError(null);
  };
  const readingContext = (): ReadingContext | null => {
    if (!selected) return null;
    const namesOf = (d: IndexedDefinition) => {
      const row = definitions?.find((r) => r.code === d.code);
      const abbreviation = metadata?.abbreviations?.find((a) => a.credential_code === d.code);
      return [row?.name_sv, row?.name_en, abbreviation?.abbreviation].filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0,
      );
    };
    // Approved variations are used to MATCH; only the governed name is ever shown.
    const issuersOf = (d: IndexedDefinition) => d.issuerMatchTerms;
    const issuerLabelOf = (d: IndexedDefinition) =>
      d.organisations.find((o) => o.role === "issuer")?.name ?? "";
    const labelOf = (d: IndexedDefinition) => {
      const row = definitions?.find((r) => r.code === d.code);
      return (lang === "sv" ? row?.name_sv : row?.name_en) ?? d.code;
    };
    return {
      selected: {
        code: selected.code,
        names: namesOf(selected),
        issuerNames: selected.issuerStatedOnDocument ? [] : issuersOf(selected),
        issuerStatedOnDocument: selected.issuerStatedOnDocument,
      },
      others: index
        .filter((d) => d.code !== selected.code)
        .map((d) => ({
          code: d.code,
          label: labelOf(d),
          names: namesOf(d),
          issuerLabel: issuerLabelOf(d),
          issuerNames: issuersOf(d),
        })),
      accountName: accountName ?? metadata?.holderDisplayName ?? null,
      today: todayIso(),
    };
  };
  const suggestible = (): SuggestibleField[] => [
    "identifier",
    "issued_on",
    "valid_until",
    ...(selected?.issuerStatedOnDocument ? (["issuer_name"] as const) : []),
  ];
  const onDocumentRead = (reading: DocumentReading) => {
    const applied = applyReading(latestDraft.current, reading, suggestible());
    setDraft(applied.draft);
    setMarks(applied.marks);
    setNotices(applied.notices);
  };
  /** Verification is a separate question, asked of the server, never of the reading. */
  const assess = async (signedCredential: string | null, link: string | null = null) => {
    assessRun.current += 1;
    const mine = assessRun.current;
    if ((!signedCredential && !link) || !onAssess || !selected) {
      setAssessment({
        state: "done",
        decision: unverifiableDocument(new Date().toISOString()),
        recorded: false,
      });
      return;
    }
    setAssessment({ state: "checking" });
    try {
      const result = await onAssess({
        definitionCode: selected.code,
        issuedOn: latestDraft.current.issued_on || null,
        validUntil: latestDraft.current.valid_until || null,
        // Exactly one kind of evidence per check; a link, when given, is the
        // stronger source because the server fetches it independently.
        signedCredential: link ? null : signedCredential,
        badgeLink: link,
      });
      if (assessRun.current === mine) setAssessment({ state: "done", ...result });
    } catch {
      if (assessRun.current === mine) setAssessment({ state: "unavailable" });
    }
  };
  const readDocument = (chosen: File) => {
    const context = readingContext();
    if (!context) return;
    void hayat.start(chosen, context, onDocumentRead);
  };
  const accept = (field: SuggestibleField, value: string) => {
    const accepted = acceptValue(draft, marks, notices, field, value);
    setDraft(accepted.draft);
    setMarks(accepted.marks);
    setNotices(accepted.notices);
  };
  // Once a reading has settled -- read or not -- ask the separate question.
  const settled = hayat.state.phase === "read" || hayat.state.phase === "failed";
  const signedCredential =
    hayat.state.phase === "read" || hayat.state.phase === "failed"
      ? hayat.state.signedCredential
      : null;
  useEffect(() => {
    if (settled) void assess(signedCredential);
    // `assess` reads refs and the current selection; re-running it on every
    // render would re-ask the server for the same file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, signedCredential]);
  const readBy = (field: SuggestibleField) =>
    isReadByHayat(draft, marks, field) ? <HayatBadge /> : null;
  const inputClass =
    "mt-2 block min-h-12 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const steps = [
    copy("Omfattning", "Scope"),
    copy("Plats och kategori", "Location & category"),
    copy("Merit", "Credential"),
    copy("Dina uppgifter", "Your details"),
    copy("Granska och spara", "Review & save"),
  ];
  /** The dates in one form -- the ISO form the database stores -- whatever
   *  way the holder typed them. The input settles a complete value itself;
   *  this covers the rest (an unpadded "2020-5-9" submitted with Enter
   *  before the field lost focus). */
  const settleDates = (d: InternationalCredentialInput): InternationalCredentialInput => ({
    ...d,
    issued_on: toIsoDateOrRaw(d.issued_on),
    valid_until: toIsoDateOrRaw(d.valid_until),
  });
  async function save() {
    if (!selected || saving.current) return;
    // The database refuses valid_until <= issued_on (SP_INVALID_DATES). Said
    // here, in the holder's words, instead of as a generic save failure.
    if (
      draft.issued_on &&
      draft.valid_until &&
      draft.no_expiry !== true &&
      !isStrictlyAfter(draft.valid_until, draft.issued_on)
    ) {
      setError(
        copy(
          `Giltig till måste vara efter utfärdandedatumet (${draft.issued_on}).`,
          `Valid until must be after the issue date (${draft.issued_on}).`,
        ),
      );
      return;
    }
    if (selected.requiresScope && !draft.authorisation_scope?.trim()) {
      setError(copy("Ange vad behörigheten omfattar.", "State what the authorisation covers."));
      return;
    }
    if (selected.issuerStatedOnDocument && (draft.issuer_name?.trim().length ?? 0) < 2) {
      setError(
        copy("Ange utfärdaren som står på intyget.", "Name the issuer stated on the certificate."),
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!savedId.current)
        savedId.current = (
          await onSave({
            ...draft,
            // Territory, issuer and scope follow the SELECTED DEFINITION, never a
            // filter: a stale country, organisation or scope cannot be saved.
            market_country: selected.country ?? "",
            market_region: selected.region ?? "",
            authorisation_scope: selected.requiresScope ? draft.authorisation_scope : "",
            issuer_name: selected.issuerStatedOnDocument ? draft.issuer_name : "",
          })
        ).id;
      if (file) {
        const contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("file"));
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.readAsDataURL(file);
        });
        await onUpload(savedId.current, {
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
        });
      }
      // There is something a SOURCE can check only when the file carried a signed
      // credential or the holder gave a link. Its failure is not a save failure.
      const signed =
        hayat.state.phase === "read" || hayat.state.phase === "failed"
          ? hayat.state.signedCredential
          : null;
      const link = badgeLink.trim() || null;
      if (onAssessSaved && (link || (file && signed)))
        await onAssessSaved({ claimId: savedId.current, badgeLink: link }).catch(() => undefined);
      await navigate({
        to: "/passport/entry/$kind/$entryId",
        params: { kind: "claim", entryId: savedId.current },
      });
    } catch (caught) {
      const invalidDates =
        !savedId.current && caught instanceof Error && caught.message === "SP_INVALID_DATES";
      setError(
        invalidDates
          ? copy(
              "Giltig till måste vara efter utfärdandedatumet. Kontrollera datumen och försök igen.",
              "Valid until must be after the issue date. Check the dates and try again.",
            )
          : savedId.current
            ? copy(
                "Meriten är sparat, men dokumentet kunde inte bifogas. Försök igen eller öppna meriten.",
                "The credential is saved, but the document could not be attached. Retry or open the credential.",
              )
            : copy(
                "Kunde inte spara. Kontrollera uppgifterna och försök igen.",
                "Could not save. Check your details and try again.",
              ),
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      data-international-credential-form
      className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-lg)]"
    >
      <header className="relative isolate overflow-hidden bg-primary p-5 text-primary-foreground sm:p-7">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-primary-foreground/40"
        />
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 h-40 w-32 border-l border-primary-foreground/10"
        />
        <p className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary-foreground/65">
          <FileCheck2 size={14} aria-hidden="true" />
          Security Passport
        </p>
        <h2 className="relative mt-3 text-2xl font-semibold !text-primary-foreground">
          {initial
            ? copy("Ändra merit", "Edit credential")
            : copy("Lägg till merit", "Add credential")}
        </h2>
        <p className="relative mt-2 text-sm text-primary-foreground/70">
          {copy(
            "Din merit. Ditt underlag. Privat tills du delar.",
            "Your credential. Your evidence. Private until you share.",
          )}
        </p>
        <ol
          aria-label={copy("Steg", "Steps")}
          className="relative mt-7 grid grid-cols-5 gap-2 border-t border-primary-foreground/15 pt-5"
        >
          {steps.map((label, i) => (
            <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${step === i + 1 ? "bg-primary-foreground font-bold text-primary" : step > i + 1 ? "border border-accent bg-accent/20 text-primary-foreground" : "border border-primary-foreground/25 text-primary-foreground/65"}`}
              >
                {step > i + 1 ? <Check size={14} aria-hidden="true" /> : i + 1}
              </span>
              <span className="mt-2 hidden text-[11px] sm:block">{label}</span>
            </li>
          ))}
        </ol>
      </header>
      <form
        className="space-y-6 p-5 sm:p-7"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 4) setDraft(settleDates(draft));
          if (step < 5) setStep(step + 1);
          else void save();
        }}
      >
        <div className="border-b border-border pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {copy("Professionell dokumentation", "Professional record")}
          </p>
          <h3 className="mt-1 text-xl font-semibold">{steps[step - 1]}</h3>
        </div>
        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {["international", "national"].map((value) => {
              const Icon = value === "international" ? Globe2 : MapPin;
              return (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border p-5 transition-colors ${filters.scope === value ? "border-accent bg-accent/5" : "border-border bg-background"}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={value}
                    checked={filters.scope === value}
                    onChange={() => change({ scope: value as CatalogueFilterState["scope"] })}
                  />
                  <Icon className="my-3" size={24} aria-hidden="true" />
                  <span className="block font-medium">
                    {value === "international"
                      ? copy("Internationellt", "International")
                      : copy("Nationellt eller regionalt", "National or regional")}
                  </span>
                  <span className="mt-2 block text-sm text-muted-foreground">
                    {value === "international"
                      ? copy(
                          "Certifieringar från professionella organisationer.",
                          "Certifications from professional organisations.",
                        )
                      : copy(
                          "Meriter för ett visst land eller område.",
                          "Credentials for a particular country or region.",
                        )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5" data-credential-filters>
            <div className="grid gap-5 sm:grid-cols-2">
              {filters.scope === "national" && (
                <>
                  <label>
                    {copy("Land", "Country")}
                    <select
                      required
                      data-filter="country"
                      className={inputClass}
                      value={filters.country}
                      onChange={(e) => change({ country: e.target.value })}
                    >
                      <option value="">{copy("Välj land", "Select country")}</option>
                      {/* EVERY governed country is offered, with its count — zero
                          included. A holder whose market is not open to them must be
                          able to choose it and be TOLD why it is empty, not find it
                          missing from the list. */}
                      {locations
                        .filter((j) => j.jurisdiction_type === "national")
                        .map((j) => (
                          <option key={j.code} value={j.code}>
                            {locationName(j.code)} (
                            {answer.countries.find((c) => c.value === j.code)?.count ?? 0})
                          </option>
                        ))}
                    </select>
                  </label>
                  {answer.regionRelevant && (
                    <label>
                      {copy("Region — sökfilter (valfritt)", "Region — search filter (optional)")}
                      <select
                        data-filter="region"
                        className={inputClass}
                        value={filters.region}
                        onChange={(e) => change({ region: e.target.value })}
                      >
                        <option value="">{copy("Alla tillgängliga", "All available")}</option>
                        {answer.regions.map((r) => (
                          <option key={r.value} value={r.value}>
                            {locationName(r.value)} ({r.count})
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {copy(
                          "Meriter som gäller i hela landet visas alltid. Meritens eget giltighetsområde bestäms av meriten, inte av filtret.",
                          "Country-wide credentials always stay listed. A credential's own territory is set by the credential, not by this filter.",
                        )}
                      </span>
                    </label>
                  )}
                </>
              )}
              <label>
                {copy("Yrkesområde", "Professional area")}
                <select
                  data-filter="domain"
                  className={inputClass}
                  value={filters.domain}
                  onChange={(e) => change({ domain: e.target.value })}
                >
                  <option value="">{copy("Alla yrkesområden", "All areas")}</option>
                  {answer.domains.map((d) => (
                    <option key={d.value} value={d.value}>
                      {domainName(d.value)} ({d.count})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy("Typ av merit", "Credential type")}
                <select
                  data-filter="category"
                  className={inputClass}
                  value={filters.category}
                  onChange={(e) => change({ category: e.target.value })}
                >
                  <option value="">{copy("Alla typer", "All types")}</option>
                  {answer.categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {className(c.value)} ({c.count})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy("Organisation", "Organisation")}
                <select
                  data-filter="organisation"
                  className={inputClass}
                  value={filters.organisation}
                  onChange={(e) => change({ organisation: e.target.value })}
                >
                  <option value="">{copy("Alla organisationer", "All organisations")}</option>
                  {answer.organisations.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.name} ({o.count})
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {copy(
                    "Tillsynsmyndighet eller utfärdare. Du behöver inte känna till den för att hitta din merit.",
                    "A regulator or an issuer. You do not need to know it to find your credential.",
                  )}
                </span>
              </label>
            </div>
            <FilterSummary
              shown={visible.length}
              total={answer.total}
              narrowed={answer.narrowed}
              needsCountry={filters.scope === "national" && !filters.country}
              lang={lang}
              onClear={() => {
                setFilters((current) => clearOptionalFilters(current));
                reset();
              }}
            />
          </div>
        )}
        {step === 3 && (
          <>
            <label className="block">
              {copy("Sök i katalogen", "Search catalogue")}
              <input
                type="search"
                className={inputClass}
                data-filter="search"
                value={filters.search}
                onChange={(e) => change({ search: e.target.value })}
                placeholder={copy(
                  "Namn, förkortning, kod eller organisation…",
                  "Name, abbreviation, code or organisation…",
                )}
              />
            </label>
            <label className="block">
              {copy("Godkänd merit", "Approved credential")}
              <select
                required
                className={inputClass}
                value={draft.definition_code}
                onChange={(e) => {
                  setDraft({ ...blank, definition_code: e.target.value });
                  setFile(null);
                }}
              >
                <option value="">{copy("Välj merit", "Select credential")}</option>
                {visible.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d[lang === "sv" ? "name_sv" : "name_en"]}
                    {" — "}
                    {d.issuer_name ??
                      d.organisations.find((o) => o.role === "regulator")?.name ??
                      copy("utfärdare anges på intyget", "issuer stated on the certificate")}
                  </option>
                ))}
              </select>
            </label>
            <FilterSummary
              shown={visible.length}
              total={answer.total}
              narrowed={answer.narrowed}
              needsCountry={filters.scope === "national" && !filters.country}
              lang={lang}
              onClear={() => {
                setFilters((current) => clearOptionalFilters(current));
                reset();
              }}
            />
            {!visible.length && (
              <>
                <p role="status" className="rounded-xl bg-muted p-4 text-sm" data-catalogue-empty>
                  {copy(
                    "Din merit är för närvarande inte tillgänglig i CQrityjob Security Passport.",
                    "Your credential is not currently available in CQrityjob Security Passport.",
                  )}
                </p>
                <p className="text-sm text-muted-foreground" data-catalogue-empty-reason>
                  {answer.narrowed
                    ? copy(
                        "Inget matchar de valda filtren eller sökningen. Rensa filtren för att se hela katalogen.",
                        "Nothing matches the chosen filters or the search. Clear the filters to see the whole catalogue.",
                      )
                    : filters.scope === "national" && filters.country
                      ? copy(
                          "Inga meriter är tillgängliga för dig i det här landet ännu. Marknaden är antingen inte öppnad för ditt konto eller så är dess meriter inte godkända än.",
                          "No credentials are available to you in this country yet. Either the market is not open to your account or its credentials are not approved yet.",
                        )
                      : copy(
                          "Katalogen är stängd: du kan inte lägga till en egen merittyp.",
                          "The catalogue is closed: you cannot add a credential type of your own.",
                        )}
                </p>
              </>
            )}
          </>
        )}
        {step >= 4 && selected && (
          <div className="relative overflow-hidden rounded-lg border border-border bg-secondary/40 p-5 pl-6">
            <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {copy("Från den godkända katalogen", "From the approved catalogue")}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {selected[lang === "sv" ? "name_sv" : "name_en"]}
            </p>
            <p className="mt-1 text-sm" data-credential-territory>
              {selected.scope_code === "global_professional"
                ? copy("Internationell · inget land", "International · no country")
                : `${copy("Gäller i", "Valid in")}: ${locationName(selected.region ?? selected.country)}`}
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-credential-roles>
              {rolesOf(selected).map((r) => (
                <div key={r.role} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{r.label}</dt>
                  <dd className="break-words">{r.name}</dd>
                </div>
              ))}
            </dl>
            {selectedRow?.official_url && (
              <a
                className="mt-2 inline-flex min-h-11 items-center text-sm text-accent underline"
                href={selectedRow?.official_url}
                target="_blank"
                rel="noreferrer"
              >
                {copy("Officiell källa", "Official source")}
              </a>
            )}
          </div>
        )}
        {step === 4 && selected && (
          <div className="grid gap-5 sm:grid-cols-2">
            {selected.issuerStatedOnDocument && (
              <label className="sm:col-span-2">
                {copy("Utfärdare enligt intyget", "Issuer stated on the certificate")}
                {readBy("issuer_name")}
                <input
                  required
                  data-field="issuer-name"
                  className={inputClass}
                  minLength={2}
                  maxLength={160}
                  value={draft.issuer_name ?? ""}
                  onChange={(e) => setDraft({ ...draft, issuer_name: e.target.value })}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {copy(
                    "Utbildningsföretaget eller examensutfärdaren som står på ditt intyg. Tillsynsmyndigheten är inte utbildare.",
                    "The training company or awarding organisation printed on your certificate. The regulator is not the trainer.",
                  )}
                </span>
                <HayatFieldNote
                  field="issuer_name"
                  notice={notices.issuer_name}
                  onAccept={accept}
                />
              </label>
            )}
            {selected.requiresScope && (
              <label className="sm:col-span-2">
                {scopeLabel}
                <input
                  required
                  data-field="authorisation-scope"
                  className={inputClass}
                  maxLength={200}
                  value={draft.authorisation_scope ?? ""}
                  onChange={(e) => setDraft({ ...draft, authorisation_scope: e.target.value })}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {copy(
                    "Obligatoriskt: den här behörigheten gäller bara inom sin omfattning. Texten visas inte i en anonym delning.",
                    "Required: this authorisation is valid only within its scope. The text is not shown in an anonymous share.",
                  )}
                </span>
              </label>
            )}
            <div className="sm:col-span-2">
              <label>
                {copy(
                  "Certifikats- eller licensnummer (valfritt)",
                  "Credential identifier (optional)",
                )}
                {readBy("identifier")}
                <input
                  data-field="identifier"
                  className={inputClass}
                  maxLength={120}
                  value={draft.identifier}
                  onChange={(e) => setDraft({ ...draft, identifier: e.target.value })}
                />
              </label>
              <HayatFieldNote field="identifier" notice={notices.identifier} onAccept={accept} />
            </div>
            <div>
              <label>
                {copy("Utfärdad", "Issued")}
                {readBy("issued_on")}
                <CredentialDateInput
                  lang={lang}
                  className={inputClass}
                  value={draft.issued_on}
                  onChange={(value) => setDraft({ ...draft, issued_on: value })}
                />
              </label>
              <HayatFieldNote field="issued_on" notice={notices.issued_on} onAccept={accept} />
            </div>
            <div>
              <label>
                {copy("Giltig till", "Valid until")}
                {readBy("valid_until")}
                <CredentialDateInput
                  lang={lang}
                  className={inputClass}
                  min={draft.issued_on || undefined}
                  required={selectedRow?.requires_valid_until}
                  disabled={draft.no_expiry === true}
                  value={draft.valid_until}
                  onChange={(value) => setDraft({ ...draft, valid_until: value })}
                />
              </label>
              <HayatFieldNote field="valid_until" notice={notices.valid_until} onAccept={accept} />
            </div>
            {selectedRow?.allows_no_expiry && !selectedRow?.requires_valid_until && (
              <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.no_expiry === true}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      no_expiry: e.target.checked ? true : null,
                      valid_until: e.target.checked ? "" : draft.valid_until,
                    })
                  }
                />
                {copy(
                  "Utan utgångsdatum enligt definitionen",
                  "No expiry, as permitted by this definition",
                )}
              </label>
            )}
            <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4 sm:col-span-2">
              {copy("Dokument (valfritt)", "Evidence (optional)")}
              <input
                ref={fileInput}
                aria-label={copy("Dokument (valfritt)", "Evidence (optional)")}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/heic"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (
                    f &&
                    (!EVIDENCE_ALLOWED_MIME.includes(f.type) ||
                      f.size === 0 ||
                      f.size > EVIDENCE_MAX_BYTES)
                  ) {
                    setError(
                      copy(
                        "Välj PDF, JPG, PNG eller HEIC, högst 8 MB.",
                        "Choose PDF, JPG, PNG or HEIC, up to 8 MB.",
                      ),
                    );
                    forgetReading();
                    setFile(null);
                    e.target.value = "";
                  } else {
                    // A new file, or none: the previous file's reading goes first,
                    // so nothing it produced can outlive it.
                    forgetReading();
                    setFile(f);
                    setError(null);
                    if (f) readDocument(f);
                  }
                }}
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-input bg-background px-4 text-sm"
                  onClick={() => fileInput.current?.click()}
                >
                  {copy("Välj fil", "Choose file")}
                </button>
                <span className="min-w-0 break-all text-sm" data-evidence-file-name>
                  {file?.name ?? copy("Ingen fil vald", "No file chosen")}
                </span>
                {file && (
                  <button
                    type="button"
                    data-evidence-remove
                    className="min-h-11 rounded-md px-3 text-sm underline"
                    onClick={() => {
                      forgetReading();
                      setFile(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  >
                    {copy("Ta bort fil", "Remove file")}
                  </button>
                )}
              </div>
              {selected && linkSources.some((s) => s.definitionCodes.includes(selected.code)) && (
                <div className="mt-4" data-hayat-link>
                  <label>
                    {pt("hayat.link.label")}
                    <input
                      type="url"
                      inputMode="url"
                      data-field="badge-link"
                      className={inputClass}
                      maxLength={400}
                      placeholder="https://www.credly.com/badges/…"
                      value={badgeLink}
                      onChange={(e) => setBadgeLink(e.target.value)}
                    />
                  </label>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {pt("hayat.link.help").replace(
                      "{source}",
                      linkSources.find((s) => s.definitionCodes.includes(selected.code))?.name ??
                        "",
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={!badgeLink.trim()}
                    className="mt-2 min-h-11 rounded-md border border-input bg-background px-4 text-sm disabled:opacity-50"
                    onClick={() => void assess(null, badgeLink.trim())}
                  >
                    {pt("hayat.link.check")}
                  </button>
                </div>
              )}
              <HayatPanel
                reading={hayat.state}
                notices={notices}
                assessment={assessment}
                onRetry={() => file && readDocument(file)}
                onChooseOther={() => setStep(3)}
              />
              <span className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock size={12} aria-hidden="true" />
                {copy(
                  "Privat dokument. Högst 8 MB. Delas inte med länken.",
                  "Private evidence. Up to 8 MB. Not included in the share link.",
                )}
              </span>
            </div>
          </div>
        )}
        {step === 5 && selected && (
          <>
            <dl className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-secondary/30 p-5 text-sm sm:grid-cols-2">
              {[
                ...(selected.issuerStatedOnDocument
                  ? [
                      [
                        copy("Utfärdare enligt intyget", "Issuer on the certificate"),
                        draft.issuer_name,
                      ],
                    ]
                  : []),
                ...(selected.requiresScope
                  ? [[copy("Omfattning", "Scope"), draft.authorisation_scope]]
                  : []),
                [copy("Certifikats- eller licensnummer", "Identifier"), draft.identifier],
                [copy("Utfärdad", "Issued"), draft.issued_on],
                [
                  copy("Slutdatum", "Expiry"),
                  draft.no_expiry ? copy("Utan utgångsdatum", "No expiry") : draft.valid_until,
                ],
                [copy("Dokument", "Evidence"), file?.name],
              ].map(([label, value]) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words font-medium">
                    {value || copy("Inte angivet", "Not provided")}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="rounded-lg border border-border p-4 text-sm">
              {copy(
                "Sparas som registrerat av innehavaren. Ett bifogat dokument är underlag, inte en verifiering.",
                "Saved as registered by holder. An attached document is evidence, not verification.",
              )}
            </p>
          </>
        )}
        {!definitions && <p role="status">{copy("Läser katalogen…", "Loading catalogue…")}</p>}
        {step >= 4 && definitions && !selected && (
          <p role="status">
            {copy(
              "Meriten är inte tillgänglig för nya uppgifter.",
              "This definition is unavailable for new claims or corrections.",
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5">
          {step > (initial ? 4 : 1) && !savedId.current ? (
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-md border border-border px-5 text-sm"
              onClick={() => {
                setStep(step - 1);
                setError(null);
              }}
            >
              {copy("Tillbaka", "Back")}
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={busy || !definitions || (step >= 3 && !selected)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? copy("Sparar…", "Saving…")
              : step === 5
                ? copy("Spara merit", "Save credential")
                : copy("Fortsätt", "Continue")}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {savedId.current && error && (
          <button
            type="button"
            className="min-h-11 text-sm underline"
            onClick={() => {
              const claimId = savedId.current;
              if (!claimId) return;
              void navigate({
                to: "/passport/entry/$kind/$entryId",
                params: { kind: "claim", entryId: claimId },
              });
            }}
          >
            {copy("Öppna sparad merit", "Open saved credential")}
          </button>
        )}
      </form>
    </section>
  );
}

/** "Showing N of M" and the one control that undoes every optional filter. */
function FilterSummary({
  shown,
  total,
  narrowed,
  needsCountry,
  lang,
  onClear,
}: {
  shown: number;
  total: number;
  narrowed: boolean;
  needsCountry: boolean;
  lang: "sv" | "en";
  onClear: () => void;
}) {
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  if (needsCountry) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm"
      data-filter-summary
    >
      <p aria-live="polite" data-filter-count>
        {copy(`Visar ${shown} av ${total} meriter`, `Showing ${shown} of ${total} credentials`)}
      </p>
      {narrowed && (
        <button
          type="button"
          data-clear-filters
          className="min-h-11 rounded-md border border-input bg-background px-4 text-sm"
          onClick={onClear}
        >
          {copy("Rensa filter", "Clear filters")}
        </button>
      )}
    </div>
  );
}
