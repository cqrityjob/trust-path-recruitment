import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import {
  credentialPassportHolder,
  PASSPORT_OWNERSHIP,
} from "@/lib/security-passport/credential-passport";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { validityOf } from "@/lib/security-passport/validity";
import { credentialDate } from "@/lib/security-passport/international";
import { AssertionChip } from "./AssertionChip";
import { LifecycleChip } from "./LifecycleChip";

/** Private summary. Recipient content is separately authorised by a share policy. */
export function CompactPassportCard({
  snapshot,
  today,
}: {
  snapshot: PassportSnapshot;
  today: string;
}) {
  const { lang } = usePassportCopy();
  const t = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const claims = credentialPassportHolder(snapshot.holder).claims;
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
          {identity?.displayName || t("Mitt Passport", "My Passport")}
        </h2>
        <p className="mt-1 break-words text-sm">{title || PASSPORT_OWNERSHIP[lang].noTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{PASSPORT_OWNERSHIP[lang].titleSource}</p>
      </header>
      <ul className="divide-y divide-border">
        {claims.slice(0, 3).map((c) => {
          const state = validityOf(c.lifecycleState, c.validUntil, today).effectiveState;
          return (
            <li className="space-y-2 p-4" key={c.id}>
              <h3 className="break-words text-sm font-semibold">{c.titleSv}</h3>
              <p className="break-words text-xs">
                {t("Utfärdare", "Issuer")}: {c.issuerName || t("Inte angivet", "Not stated")}
              </p>
              <p className="text-xs">
                {t("Giltig till", "Valid until")}: {credentialDate(c.validUntil, lang)}
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
          {claims.length} {t("yrkesbevis i plånboken", "credentials in the wallet")}
        </p>
        <p>
          {t(
            "Privat sammanfattning. Välj yrkesbevis och fält innan du delar. Underlag delas inte automatiskt.",
            "Private summary. Select credentials and fields before sharing. Evidence is not shared automatically.",
          )}
        </p>
        <p>
          {t(
            "Status gäller angiven omfattning och giltighet. Inget generellt eller internationellt godkännande.",
            "Status covers the recorded scope and validity. It does not establish general or international acceptance.",
          )}
        </p>
      </footer>
    </article>
  );
}
