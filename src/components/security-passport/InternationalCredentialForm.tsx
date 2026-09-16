import { CredentialDateInput } from "./CredentialDateInput";
import { useRef, useState } from "react";
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

const DOMAIN_LABELS: Record<string, { sv: string; en: string }> = {
  security_operations: { sv: "Säkerhetsarbete", en: "Security operations" },
  security_management: { sv: "Säkerhetsledning", en: "Security management" },
  physical_security: { sv: "Fysisk säkerhet", en: "Physical security" },
  information_security: { sv: "Informationssäkerhet", en: "Information security" },
  investigation: { sv: "Utredning", en: "Investigation" },
  financial_crime: { sv: "Finansiell brottslighet", en: "Financial crime" },
};

export function InternationalCredentialForm({
  initial,
  preselectCode,
  metadata,
  onSave,
  onUpload,
}: {
  initial?: InternationalCredentialInput;
  preselectCode?: string;
  metadata: InternationalPassportMetadata | null;
  onSave: (data: InternationalCredentialInput) => Promise<{ id: string }>;
  onUpload: (
    claimId: string,
    file: { fileName: string; mimeType: string; contentBase64: string },
  ) => Promise<unknown>;
}) {
  const { lang } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const navigate = useNavigate();
  const definitions = metadata?.definitions;
  const preselected = definitions?.find((d) => d.code === preselectCode);
  const [step, setStep] = useState(initial || preselected ? 4 : 1);
  const [scope, setScope] = useState(
    initial?.market_country || preselected?.country ? "national" : "international",
  );
  const [country, setCountry] = useState(initial?.market_country ?? preselected?.country ?? "");
  const [region, setRegion] = useState(initial?.market_region ?? preselected?.region ?? "");
  const [category, setCategory] = useState("");
  const [domain, setDomain] = useState("");
  const [issuer, setIssuer] = useState("");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Saving the claim and attaching evidence are separate existing secure operations.
  // A failed attachment retries only that attachment, never creates another claim.
  const savedId = useRef<string | null>(null);
  const blank = {
    definition_code: "",
    market_country: "",
    market_region: "",
    identifier: "",
    issued_on: "",
    valid_until: "",
    no_expiry: null,
  };
  const [draft, setDraft] = useState<InternationalCredentialInput>(
    initial ?? { ...blank, definition_code: preselected?.code ?? "" },
  );
  const selected = definitions?.find((d) => d.code === draft.definition_code);
  const locations = metadata?.jurisdictions ?? [];
  const locationName = (code: string | null) => {
    const j = locations.find((j) => j.code === code);
    return j
      ? j[lang === "sv" ? "name_sv" : "name_en"]
      : code || copy("Internationellt", "International");
  };
  const className = (value: string) =>
    CREDENTIAL_CLASSES[value as CredentialClass]?.[lang] || value;
  const applicable = (definitions ?? []).filter((d) =>
    scope === "international"
      ? d.scope_code === "global_professional"
      : !!country && d.country === country && (!d.region || d.region === region),
  );
  const visible = applicable.filter(
    (d) =>
      (!domain ||
        metadata?.definitionReviews?.find((r) => r.credential_code === d.code)
          ?.professional_domain === domain) &&
      (!category || d.credential_class === category) &&
      (!issuer || d.issuer_id === issuer) &&
      [
        d.name_sv,
        d.name_en,
        d.issuer_name,
        className(d.credential_class),
        locationName(d.country),
        locationName(d.region),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase().trim()),
  );
  const reset = () => {
    setDraft(blank);
    setFile(null);
    setError(null);
  };
  const inputClass =
    "mt-2 block min-h-12 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const steps = [
    copy("Omfattning", "Scope"),
    copy("Plats och kategori", "Location & category"),
    copy("Merit", "Credential"),
    copy("Dina uppgifter", "Your details"),
    copy("Granska och spara", "Review & save"),
  ];
  async function save() {
    if (!selected || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!savedId.current)
        savedId.current = (
          await onSave({
            ...draft,
            market_country: selected.country ?? "",
            market_region: selected.region ?? "",
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
      await navigate({
        to: "/passport/entry/$kind/$entryId",
        params: { kind: "claim", entryId: savedId.current },
      });
    } catch {
      setError(
        savedId.current
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
                  className={`cursor-pointer rounded-lg border p-5 transition-colors ${scope === value ? "border-accent bg-accent/5" : "border-border bg-background"}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => {
                      setScope(value);
                      setCategory("");
                      setIssuer("");
                      setDomain("");
                      reset();
                    }}
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
          <div className="grid gap-5 sm:grid-cols-2">
            {scope === "national" && (
              <>
                <label>
                  {copy("Land", "Country")}
                  <select
                    required
                    className={inputClass}
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value);
                      setRegion("");
                      reset();
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
                      reset();
                    }}
                  >
                    <option value="">{copy("Alla tillgängliga", "All available")}</option>
                    {locations
                      .filter(
                        (j) => j.jurisdiction_type === "regional" && j.country_code === country,
                      )
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
              {copy("Yrkesområde", "Professional domain")}
              <select
                className={inputClass}
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  reset();
                }}
              >
                <option value="">{copy("Alla yrkesområden", "All domains")}</option>
                {[
                  ...new Set(
                    metadata?.definitionReviews
                      ?.filter((r) => applicable.some((d) => d.code === r.credential_code))
                      .map((r) => r.professional_domain) ?? [],
                  ),
                ].map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABELS[d]?.[lang] || d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy("Typ av meriter", "Credential class")}
              <select
                className={inputClass}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  reset();
                }}
              >
                <option value="">{copy("Alla typer", "All classes")}</option>
                {[...new Set(applicable.map((d) => d.credential_class))].map((c) => (
                  <option key={c} value={c}>
                    {className(c)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy("Organisation", "Organisation")}
              <select
                className={inputClass}
                value={issuer}
                onChange={(e) => {
                  setIssuer(e.target.value);
                  reset();
                }}
              >
                <option value="">{copy("Alla organisationer", "All organisations")}</option>
                {[...new Map(applicable.map((d) => [d.issuer_id, d.issuer_name])).entries()].map(
                  ([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        )}
        {step === 3 && (
          <>
            <label className="block">
              {copy("Sök i katalogen", "Search catalogue")}
              <input
                type="search"
                className={inputClass}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  reset();
                }}
                placeholder={copy("Namn, organisation, land…", "Name, organisation, country…")}
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
                    {d[lang === "sv" ? "name_sv" : "name_en"]} — {d.issuer_name}
                  </option>
                ))}
              </select>
            </label>
            {!visible.length && (
              <p role="status" className="rounded-xl bg-muted p-4 text-sm">
                {copy(
                  "Din merit är för närvarande inte tillgängligt i CQrityjob Security Passport.",
                  "Your credential is not currently available in CQrityjob Security Passport.",
                )}
              </p>
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
            <p className="mt-1 text-sm">
              {selected.issuer_name} · {locationName(selected.region ?? selected.country)}
            </p>
            {selected.official_url && (
              <a
                className="mt-2 inline-flex min-h-11 items-center text-sm text-accent underline"
                href={selected.official_url}
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
            <label className="sm:col-span-2">
              {copy(
                "Certifikats- eller licensnummer (valfritt)",
                "Credential identifier (optional)",
              )}
              <input
                className={inputClass}
                maxLength={120}
                value={draft.identifier}
                onChange={(e) => setDraft({ ...draft, identifier: e.target.value })}
              />
            </label>
            <label>
              {copy("Utfärdad", "Issued")}
              <CredentialDateInput
                lang={lang}
                className={inputClass}
                value={draft.issued_on}
                onChange={(value) => setDraft({ ...draft, issued_on: value })}
              />
            </label>
            <label>
              {copy("Giltig till", "Valid until")}
              <CredentialDateInput
                lang={lang}
                className={inputClass}
                min={draft.issued_on || undefined}
                required={selected.requires_valid_until}
                disabled={draft.no_expiry === true}
                value={draft.valid_until}
                onChange={(value) => setDraft({ ...draft, valid_until: value })}
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
                    setFile(null);
                    e.target.value = "";
                  } else {
                    setFile(f);
                    setError(null);
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
                <span className="min-w-0 break-all text-sm">
                  {file?.name ?? copy("Ingen fil vald", "No file chosen")}
                </span>
              </div>
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
