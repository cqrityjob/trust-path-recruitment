import { Lock, ArrowUpRight } from "lucide-react";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { credentialPassportHolder } from "@/lib/security-passport/credential-passport";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import { credentialProductStatus } from "@/lib/security-passport/product-status";

/** Owner-only preview. Selection does not create a share or disclose anything. */
export function SecurityPassportPreview({
  snapshot,
  today,
  metadata,
  selectedIds = [],
}: {
  snapshot: PassportSnapshot;
  today: string;
  metadata?: InternationalPassportMetadata;
  selectedIds?: readonly string[];
}) {
  const { lang } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const claims = credentialPassportHolder(snapshot.holder).claims.filter((c) =>
    selectedIds.includes(c.id),
  );
  const identity = snapshot.profileIdentity;
  const title = lang === "sv" ? identity?.titleSv : identity?.titleEn;
  return (
    <article
      data-compact-passport-card
      className="relative isolate min-w-0 overflow-hidden rounded-xl border border-primary-foreground/20 bg-primary p-6 text-primary-foreground shadow-[var(--shadow-lg)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-36 bg-primary-foreground/[0.04]"
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-semibold tracking-tight">CQrityjob</p>
          <p className="mt-1 text-xs tracking-[.16em] text-primary-foreground/65">
            SECURITY PASSPORT
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-primary-foreground/20 px-3 py-1.5 text-xs text-primary-foreground/80">
          <Lock size={12} aria-hidden="true" />
          {copy("Privat förhandsvisning", "Private preview")}
        </span>
      </header>
      <div className="my-8 flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-primary-foreground/25 bg-primary-foreground/5 text-xl font-light text-primary-foreground"
        >
          {identity?.displayName
            ?.split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0])
            .join("") || "CQ"}
        </div>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-medium tracking-tight !text-primary-foreground">
            {identity?.displayName || copy("Ditt Security Passport", "Your Security Passport")}
          </h2>
          <p className="mt-1 break-words text-sm text-primary-foreground/80">
            {title || copy("Lägg till yrkestitel i Profil", "Add a professional title in Profile")}
          </p>
          <p className="mt-1 text-xs text-primary-foreground/55">
            {copy("Uppgifter från din profil", "Information from your profile")}
          </p>
        </div>
      </div>
      {claims.length ? (
        <ul className="space-y-3 border-t border-primary-foreground/15 pt-4">
          {claims.map((c) => {
            const state = credentialProductStatus(c, metadata?.verificationEvents ?? [], today);
            return (
              <li key={c.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words text-sm">
                  {lang === "sv" ? c.titleSv : c.titleEn || c.titleSv}
                </span>
                <span className="max-w-[45%] shrink-0 text-right text-xs text-primary-foreground/80">
                  {state.label[lang]}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-primary-foreground/25 bg-primary-foreground/5 p-4">
          <p className="text-sm font-medium">
            {copy("Ditt urval. Din kontroll.", "Your selection. Your control.")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-primary-foreground/70">
            {copy(
              "Välj vilka meriter som ska ingå innan du delar.",
              "Choose the credentials to include before sharing.",
            )}
          </p>
        </div>
      )}
      <footer className="mt-6 flex items-center justify-between gap-4 border-t border-primary-foreground/15 pt-4 text-xs text-primary-foreground/65">
        <span>
          {claims.length} {copy("valda meriter", "selected credentials")}
        </span>
        <span className="flex items-center gap-2">
          {copy("Förhandsvisning", "Preview")} <ArrowUpRight size={14} aria-hidden="true" />
        </span>
      </footer>
    </article>
  );
}
