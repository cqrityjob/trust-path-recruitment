import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CREDENTIAL_CLASSES } from "@/lib/security-passport/international";
import {
  getInternationalPassportMetadata,
  saveInternationalCredential,
  type InternationalCredentialInput,
  type InternationalPassportMetadata,
} from "@/lib/security-passport/international.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";

export function InternationalCredentialForm({
  initial,
}: {
  initial?: InternationalCredentialInput;
}) {
  const { lang } = usePassportCopy();
  const t = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const navigate = useNavigate();
  const load = useServerFn(getInternationalPassportMetadata);
  const save = useServerFn(saveInternationalCredential);
  const [metadata, setMetadata] = useState<InternationalPassportMetadata | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<InternationalCredentialInput>(
    initial ?? {
      class: "certification",
      title: "",
      issuer: "",
      country: "",
      issuing_jurisdiction: "",
      validity_jurisdiction: "",
      language: "",
      identifier: "",
      issued_on: "",
      valid_until: "",
      no_expiry: null,
    },
  );
  useEffect(() => {
    let alive = true;
    void load({ data: undefined })
      .then((v) => {
        if (alive) setMetadata(v);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [load]);
  const inputClass =
    "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      const result = await save({ data: draft });
      await navigate({
        to: "/passport/entry/$kind/$entryId",
        params: { kind: "claim", entryId: result.id },
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="rounded-xl border border-border bg-card p-4"
      data-international-credential-form
    >
      <summary className="min-h-11 cursor-pointer font-semibold">
        {initial
          ? t("Ändra yrkesbevis", "Edit credential")
          : t("Lägg till annat yrkesbevis", "Add another professional credential")}
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        {t(
          "Använd katalogen nedan för kända certifieringar. Ett eget namn eller en uppladdad handling innebär inte att utfärdaren eller meriten har verifierats.",
          "Use the catalogue below for listed certifications. A custom name or uploaded document does not mean the issuer or credential has been verified.",
        )}
      </p>
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          {t("Typ av yrkesbevis", "Credential class")}
          <select
            className={inputClass}
            disabled={!!initial}
            value={draft.class}
            onChange={(e) =>
              setDraft({ ...draft, class: e.target.value as InternationalCredentialInput["class"] })
            }
          >
            {Object.entries(CREDENTIAL_CLASSES).map(([key, label]) => (
              <option key={key} value={key}>
                {label[lang]}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["title", t("Ursprungligt namn", "Original credential name")],
            ["issuer", t("Utfärdare (egen uppgift)", "Issuer (self-reported)")],
            ["identifier", t("Bevisnummer (valfritt)", "Credential identifier (optional)")],
            ["language", t("Originalspråk, språkkod", "Original language code")],
          ] as const
        ).map(([key, label]) => (
          <label className="text-sm" key={key}>
            {label}
            <input
              required={key === "title" || key === "issuer"}
              maxLength={key === "language" ? 35 : key === "identifier" ? 120 : 240}
              className={inputClass}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <label className="text-sm">
          {t("Utfärdarland", "Issuing country")}
          <select
            className={inputClass}
            value={draft.country}
            onChange={(e) =>
              setDraft({ ...draft, country: e.target.value, issuing_jurisdiction: "" })
            }
          >
            <option value="">{t("Inte angivet", "Not stated")}</option>
            {metadata?.jurisdictions
              .filter((j) => j.jurisdiction_type === "national")
              .map((j) => (
                <option key={j.code} value={j.country_code ?? ""}>
                  {lang === "sv" ? j.name_sv : j.name_en}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          {t("Utfärdande jurisdiktion", "Issuing jurisdiction")}
          <select
            className={inputClass}
            value={draft.issuing_jurisdiction}
            onChange={(e) => setDraft({ ...draft, issuing_jurisdiction: e.target.value })}
          >
            <option value="">{t("Inte angivet", "Not stated")}</option>
            {metadata?.jurisdictions
              .filter((j) => !draft.country || j.country_code === draft.country)
              .map((j) => (
                <option key={j.code} value={j.code}>
                  {lang === "sv" ? j.name_sv : j.name_en}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          {t("Giltighetsjurisdiktion (egen uppgift)", "Validity jurisdiction (self-reported)")}
          <select
            className={inputClass}
            value={draft.validity_jurisdiction}
            onChange={(e) => setDraft({ ...draft, validity_jurisdiction: e.target.value })}
          >
            <option value="">
              {t(
                "Inte angivet — ingen global giltighet antas",
                "Not stated — global validity is not assumed",
              )}
            </option>
            {metadata?.jurisdictions.map((j) => (
              <option key={j.code} value={j.code}>
                {lang === "sv" ? j.name_sv : j.name_en}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t("Utfärdad", "Issued")}
          <input
            type="date"
            className={inputClass}
            value={draft.issued_on}
            onChange={(e) => setDraft({ ...draft, issued_on: e.target.value })}
          />
        </label>
        <label className="text-sm">
          {t("Giltig till", "Valid until")}
          <input
            type="date"
            disabled={draft.no_expiry === true}
            className={inputClass}
            value={draft.valid_until}
            onChange={(e) => setDraft({ ...draft, valid_until: e.target.value, no_expiry: null })}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
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
          {t(
            "Beviset anger uttryckligen att det saknar utgångsdatum",
            "The credential explicitly states that it has no expiry date",
          )}
        </label>
        {failed && (
          <p role="alert" className="text-sm sm:col-span-2">
            {t(
              "Kunde inte läsa eller spara. Kontrollera uppgifterna och försök igen.",
              "Could not load or save. Check the details and try again.",
            )}
          </p>
        )}
        <button
          disabled={busy || !metadata}
          type="submit"
          className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? t("Sparar…", "Saving…") : t("Spara som egen uppgift", "Save as self-reported")}
        </button>
      </form>
    </details>
  );
}
