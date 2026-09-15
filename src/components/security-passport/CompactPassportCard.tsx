import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import {
  credentialPassportHolder,
  PASSPORT_OWNERSHIP,
} from "@/lib/security-passport/credential-passport";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { validityOf } from "@/lib/security-passport/validity";
import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import {
  credentialDate,
  credentialClass,
  CREDENTIAL_CLASSES,
  currentCredentialVerification,
} from "@/lib/security-passport/international";
import { AssertionChip } from "./AssertionChip";
import { LifecycleChip } from "./LifecycleChip";

/** Private summary. Recipient content is separately authorised by a share policy. */
export function CompactPassportCard({
  snapshot,
  today,
  metadata,
}: {
  snapshot: PassportSnapshot;
  today: string;
  metadata?: InternationalPassportMetadata;
}) {
  const { lang } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const claims = credentialPassportHolder(snapshot.holder).claims.map((c) =>
    currentCredentialVerification(c, metadata?.verificationEvents ?? [], today),
  );
  const identity = snapshot.profileIdentity;
  const title = lang === "sv" ? identity?.titleSv : identity?.titleEn;
  return (
    <article
      data-compact-passport-card
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border bg-secondary/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest">Security Passport</p>
        <h2 className="mt-2 break-words text-lg font-semibold">
          {identity?.displayName || copy("Mitt Passport", "My Passport")}
        </h2>
        <p className="mt-1 break-words text-sm">{title || PASSPORT_OWNERSHIP[lang].noTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{PASSPORT_OWNERSHIP[lang].titleSource}</p>
      </header>
      <ul className="divide-y divide-border">
        {claims.slice(0, 3).map((c) => {
          const detail = metadata?.details.find((d) => d.claim_id === c.id);
          const territory = metadata?.jurisdictions.find(
            (j) => j.code === detail?.validity_jurisdiction_code,
          );
          const state = validityOf(c.lifecycleState, c.validUntil, today).effectiveState;
          return (
            <li className="space-y-2 p-4" key={c.id}>
              <h3 className="break-words text-sm font-semibold">{c.titleSv}</h3>
              <p className="text-xs">
                {CREDENTIAL_CLASSES[credentialClass(c, detail)][lang]} ·{" "}
                {territory
                  ? lang === "sv"
                    ? territory.name_sv
                    : territory.name_en
                  : c.jurisdictionCode ||
                    copy("Jurisdiktion inte angiven", "Jurisdiction not stated")}
              </p>
              <p className="break-words text-xs">
                {copy("Utfärdare", "Issuer")}: {c.issuerName || copy("Inte angivet", "Not stated")}
              </p>
              <p className="text-xs">
                {copy("Giltig till", "Valid until")}:{" "}
                {!c.validUntil && detail?.no_expiry === true
                  ? copy("Uttryckligen utan utgångsdatum", "Explicitly no expiry")
                  : credentialDate(c.validUntil, lang)}
              </p>
              <div className="flex flex-wrap gap-2">
                <AssertionChip
                  level={c.assertionLevel}
                  lifecycleState={state}
                  provenance={{ ...c, subjectKind: "credential" }}
                  size="sm"
                />
                <LifecycleChip state={state} />
              </div>
            </li>
          );
        })}
      </ul>
      <footer className="space-y-2 border-t border-border p-4 text-xs text-muted-foreground">
        <p>
          {claims.length} {copy("yrkesbevis i plånboken", "credentials in the wallet")}
        </p>
        <p>
          {copy(
            "Privat sammanfattning. Välj yrkesbevis och fält innan du delar. Underlag delas inte automatiskt.",
            "Private summary. Select credentials and fields before sharing. Evidence is not shared automatically.",
          )}
        </p>
        <p>
          {copy(
            "Status gäller angiven omfattning och giltighet. Inget generellt eller internationellt godkännande.",
            "Status covers the recorded scope and validity. It does not establish general or international acceptance.",
          )}
        </p>
      </footer>
    </article>
  );
}
