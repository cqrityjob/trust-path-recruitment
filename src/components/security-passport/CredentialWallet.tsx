import { Link } from "@tanstack/react-router";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import {
  credentialPassportHolder,
  PASSPORT_OWNERSHIP,
} from "@/lib/security-passport/credential-passport";
import {
  CREDENTIAL_CLASSES,
  credentialClass,
  credentialDate,
} from "@/lib/security-passport/international";
import { validityOf } from "@/lib/security-passport/validity";
import { credentialPresentationOf } from "@/lib/security-passport/trust-presentation";
import { formatWorkLocation } from "@/lib/security-passport/format";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { CredentialSymbol } from "./CredentialSymbol";
import { AssertionChip } from "./AssertionChip";
import { LifecycleChip } from "./LifecycleChip";

export function CredentialWallet({
  snapshot,
  metadata,
  reviews,
  now,
}: {
  snapshot: PassportSnapshot;
  metadata: InternationalPassportMetadata;
  reviews: ReadonlyMap<string, string> | null;
  now: string;
}) {
  const { lang } = usePassportCopy();
  const t = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const holder = credentialPassportHolder(snapshot.holder);
  const identity = snapshot.profileIdentity;
  const title = lang === "sv" ? identity?.titleSv : identity?.titleEn;
  const details = new Map(metadata.details.map((d) => [d.claim_id, d]));
  const territory = (code: string | null | undefined) => {
    const j = metadata.jurisdictions.find((v) => v.code === code);
    return j ? (lang === "sv" ? j.name_sv : j.name_en) : code || t("Inte angivet", "Not stated");
  };
  return (
    <section data-credential-wallet className="min-w-0 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{t("Mina yrkesbevis", "My credentials")}</h1>
        <p className="mt-2 text-lg">{title || PASSPORT_OWNERSHIP[lang].noTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{PASSPORT_OWNERSHIP[lang].titleSource}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/passport/credentials/new"
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
          >
            {t("Lägg till yrkesbevis", "Add credential")}
          </Link>
          <Link
            to="/passport/share"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium"
          >
            {t("Välj och dela", "Select and share")}
          </Link>
        </div>
      </header>
      {holder.claims.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-5">
          {t(
            "Du har inga yrkesbevis här ännu. Ditt CV och din anställningshistorik finns kvar i Profil och CV.",
            "No credentials here yet. Your CV and employment history remain in Profile and CV.",
          )}
        </p>
      ) : null}
      <ul className="grid gap-3" aria-label={t("Yrkesbevis", "Credentials")}>
        {holder.claims.map((c) => {
          const d = details.get(c.id);
          const validity = validityOf(c.lifecycleState, c.validUntil, now);
          const state = credentialPresentationOf(c, validity.effectiveState);
          const review = reviews?.get(c.id);
          return (
            <li
              key={c.id}
              data-credential-row
              className="min-w-0 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <CredentialSymbol
                  code={c.credentialCode}
                  state={state}
                  name={c.titleSv}
                  decorative
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {CREDENTIAL_CLASSES[credentialClass(c, d)][lang]}
                  </p>
                  <h2 className="break-words text-base font-semibold">{c.titleSv}</h2>
                  <p className="mt-1 break-words text-sm">
                    {t("Utfärdare", "Issuer")}: {c.issuerName}
                  </p>
                  <p className="mt-1 text-sm">
                    {t("Giltighetsjurisdiktion", "Validity jurisdiction")}:{" "}
                    {d?.validity_jurisdiction_code
                      ? territory(d.validity_jurisdiction_code)
                      : formatWorkLocation(c.jurisdictionCode, c.subJurisdictionCode, lang)}
                  </p>
                  {d?.issuing_country_code && (
                    <p className="text-sm">
                      {t("Utfärdarland", "Issuing country")}: {territory(d.issuing_country_code)}
                    </p>
                  )}
                  <p className="mt-2 text-xs">
                    {t("Utfärdad", "Issued")}: {credentialDate(c.issuedOn, lang)} ·{" "}
                    {t("Giltig till", "Valid until")}:{" "}
                    {c.validUntil
                      ? credentialDate(c.validUntil, lang)
                      : d?.no_expiry === true
                        ? t("Uttryckligen utan utgångsdatum", "Explicitly no expiry")
                        : t("Inte angivet", "Not stated")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <AssertionChip
                      level={c.assertionLevel}
                      lifecycleState={validity.effectiveState}
                      provenance={{ ...c, subjectKind: "credential" }}
                      size="sm"
                    />
                    <LifecycleChip state={validity.effectiveState} />
                    {reviews === null ? (
                      <span className="text-xs">
                        {t("Granskningsstatus kunde inte läsas", "Review status unavailable")}
                      </span>
                    ) : (
                      review && (
                        <span className="text-xs">
                          {review === "pending"
                            ? t("Väntar på granskning", "Pending review")
                            : t("Komplettering begärd", "Clarification requested")}
                        </span>
                      )
                    )}
                  </div>
                  <Link
                    to="/passport/entry/$kind/$entryId"
                    params={{ kind: "claim", entryId: c.id }}
                    className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    {t("Detaljer, ändra eller arkivera", "Details, edit or archive")}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "Kontroll gäller endast det angivna underlaget och omfattningen. Den är inte en säkerhetsprövning, anställningsrekommendation eller garanti om internationellt erkännande.",
          "A check covers only the recorded evidence and scope. It is not security clearance, an employment recommendation or a guarantee of international recognition.",
        )}
      </p>
    </section>
  );
}
