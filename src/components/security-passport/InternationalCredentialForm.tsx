import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  type InternationalCredentialInput,
  type InternationalPassportMetadata,
} from "@/lib/security-passport/international.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export function InternationalCredentialForm({
  initial,
  preselectCode,
  metadata,
  onSave,
}: {
  initial?: InternationalCredentialInput;
  preselectCode?: string;
  metadata: InternationalPassportMetadata | null;
  onSave: (data: InternationalCredentialInput) => Promise<{ id: string }>;
}) {
  const { lang } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const navigate = useNavigate();
  const definitions = metadata?.definitions ?? null;
  const preselected = definitions?.find((d) => d.code === preselectCode);
  const saving = useRef(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(preselectCode && !preselected ? preselectCode : "");
  const [scope, setScope] = useState(
    (initial?.market_country ?? preselected?.country) ? "national" : "international",
  );
  const [country, setCountry] = useState(initial?.market_country ?? preselected?.country ?? "");
  const [region, setRegion] = useState(initial?.market_region ?? preselected?.region ?? "");
  const [draft, setDraft] = useState<InternationalCredentialInput>(
    initial ?? {
      definition_code: preselected?.code ?? "",
      market_country: "",
      market_region: "",
      identifier: "",
      issued_on: "",
      valid_until: "",
      no_expiry: null,
    },
  );
  const selected = definitions?.find((d) => d.code === draft.definition_code);
  const locations = metadata?.jurisdictions ?? [];
  const locationName = (code: string | null) => {
    const j = locations.find((j) => j.code === code);
    return j ? (lang === "sv" ? j.name_sv : j.name_en) : (code ?? "");
  };
  const visible = (definitions ?? []).filter((d) => {
    const applicable =
      scope === "international"
        ? d.scope_code === "global_professional"
        : d.country === country && !!country && (!d.region || d.region === region);
    return (
      applicable &&
      [
        d.name_sv,
        d.name_en,
        d.issuer_name,
        d.credential_class.replaceAll("_", " "),
        d.country,
        d.region,
        locationName(d.country),
        locationName(d.region),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase().trim())
    );
  });
  const clearSelection = () => setDraft((d) => ({ ...d, definition_code: "", no_expiry: null }));
  const inputClass =
    "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || saving.current) return;
    saving.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const result = await onSave({
        ...draft,
        market_country: selected.country ?? "",
        market_region: selected.region ?? "",
      });
      await navigate({
        to: "/passport/entry/$kind/$entryId",
        params: { kind: "claim", entryId: result.id },
      });
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      data-international-credential-form
    >
      <h2 className="text-lg font-semibold">
        {initial
          ? copy("Ändra yrkesbevis", "Edit credential")
          : copy("Lägg till yrkesbevis", "Add credential")}
      </h2>
      <p className="my-3 text-sm text-muted-foreground">
        {copy(
          "Välj ett godkänt yrkesbevis ur CQrityjobs katalog. Uppgifterna är egenrapporterade tills de har verifierats.",
          "Select an approved credential from CQrityjob’s catalogue. Your claim is self-reported until verified.",
        )}
      </p>
      {!initial && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            {copy("Omfattning", "Scope")}
            <select
              className={inputClass}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                clearSelection();
              }}
            >
              <option value="international">{copy("Internationellt", "International")}</option>
              <option value="national">
                {copy("Nationellt eller regionalt", "National or regional")}
              </option>
            </select>
          </label>
          {scope === "national" && (
            <>
              <label>
                {copy("Land", "Country")}
                <select
                  className={inputClass}
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setRegion("");
                    clearSelection();
                  }}
                >
                  <option value="">{copy("Välj land", "Select country")}</option>
                  {locations
                    .filter((j) => j.jurisdiction_type === "national")
                    .map((j) => (
                      <option key={j.code} value={j.code}>
                        {locationName(j.code)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {copy("Region (valfritt)", "Region (optional)")}
                <select
                  className={inputClass}
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    clearSelection();
                  }}
                >
                  <option value="">{copy("Välj region", "Select region")}</option>
                  {locations
                    .filter((j) => j.jurisdiction_type === "regional" && j.country_code === country)
                    .map((j) => (
                      <option key={j.code} value={j.code}>
                        {locationName(j.code)}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label>
            {copy("Sök i katalogen", "Search catalogue")}
            <input
              type="search"
              className={inputClass}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                clearSelection();
              }}
            />
          </label>
          <label className="sm:col-span-2">
            {copy("Godkänt yrkesbevis", "Approved credential")}
            <select
              className={inputClass}
              value={draft.definition_code}
              onChange={(e) =>
                setDraft({ ...draft, definition_code: e.target.value, no_expiry: null })
              }
            >
              <option value="">{copy("Välj yrkesbevis", "Select credential")}</option>
              {visible.map((d) => (
                <option key={d.code} value={d.code}>
                  {lang === "sv" ? d.name_sv : d.name_en} — {d.issuer_name}
                </option>
              ))}
            </select>
          </label>
          {definitions && visible.length === 0 && (
            <p role="status" className="sm:col-span-2">
              {copy(
                "Ditt yrkesbevis är för närvarande inte tillgängligt i CQrityjob Security Passport.",
                "Your credential is not currently available in CQrityjob Security Passport.",
              )}
            </p>
          )}
        </div>
      )}
      {selected && (
        <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-md bg-muted p-3">
            <p className="font-medium">{lang === "sv" ? selected.name_sv : selected.name_en}</p>
            <p>{selected.issuer_name}</p>
            <p>
              {locationName(selected.region ?? selected.country) ||
                copy("Internationellt", "International")}
            </p>
            {selected.official_url && (
              <a
                className="underline"
                href={selected.official_url}
                target="_blank"
                rel="noreferrer"
              >
                {copy("Officiell källa", "Official source")}
              </a>
            )}
          </div>
          <label className="sm:col-span-2">
            {copy("Bevisnummer (valfritt)", "Credential identifier (optional)")}
            <input
              maxLength={120}
              className={inputClass}
              value={draft.identifier}
              onChange={(e) => setDraft({ ...draft, identifier: e.target.value })}
            />
          </label>
          <label>
            {copy("Utfärdad", "Issued")}
            <input
              type="date"
              className={inputClass}
              value={draft.issued_on}
              onChange={(e) => setDraft({ ...draft, issued_on: e.target.value })}
            />
          </label>
          <label>
            {copy("Giltig till", "Valid until")}
            <input
              type="date"
              required={selected.requires_valid_until}
              disabled={draft.no_expiry === true}
              className={inputClass}
              value={draft.valid_until}
              onChange={(e) => setDraft({ ...draft, valid_until: e.target.value })}
            />
          </label>
          {selected.allows_no_expiry && !selected.requires_valid_until && (
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
          <p className="text-sm sm:col-span-2">
            {copy(
              "Du kan lägga till dokument på nästa sida.",
              "You can add evidence on the next page.",
            )}
          </p>
          <button
            disabled={busy}
            type="submit"
            className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? copy("Sparar…", "Saving…")
              : copy("Spara som egen uppgift", "Save as self-reported")}
          </button>
        </form>
      )}
      {!definitions && !failed && (
        <p role="status">{copy("Läser katalogen…", "Loading catalogue…")}</p>
      )}
      {initial && definitions && !selected && (
        <p role="status">
          {copy(
            "Yrkesbeviset är inte tillgängligt för nya uppgifter.",
            "This definition is unavailable for new claims or corrections.",
          )}
        </p>
      )}
      {failed && (
        <p role="alert">
          {copy(
            "Kunde inte läsa eller spara. Försök igen.",
            "Could not load or save. Please try again.",
          )}
        </p>
      )}
    </section>
  );
}
