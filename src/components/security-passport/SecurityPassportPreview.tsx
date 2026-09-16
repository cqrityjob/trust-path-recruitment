import { Lock, ArrowUpRight, ShieldCheck, UserRound } from "lucide-react";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { credentialPassportHolder } from "@/lib/security-passport/credential-passport";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import { credentialProductStatus } from "@/lib/security-passport/product-status";
import { CredentialSymbol } from "./CredentialSymbol";
import { credentialPresentationOf } from "@/lib/security-passport/trust-presentation";

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
      className="passport-signature relative isolate min-w-0 overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-lg)] ring-1 ring-accent/20 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-primary-foreground/40"
      />
      <div aria-hidden="true" className="passport-grid pointer-events-none absolute top-0 right-0 -z-10 h-full w-40 opacity-20" />
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">CQrityjob</p>
          <p className="mt-1 text-xs tracking-[.16em] text-primary-foreground/65">
            SECURITY PASSPORT
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary-foreground/15 bg-primary-foreground/10 px-3 py-1.5 text-xs text-primary-foreground/80">
          <Lock size={12} aria-hidden="true" />
          {copy("Privat förhandsvisning", "Private preview")}
        </span>
      </header>
      <div className="my-8 grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 text-xl font-semibold text-primary-foreground shadow-[var(--shadow-md)]"
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
          <p className="mt-1 flex items-center gap-1.5 text-xs text-primary-foreground/55">
            <UserRound size={12} aria-hidden="true" />
            {copy("Profiluppgifter", "Profile information")}
          </p>
        </div>
      </div>
      {claims.length ? (
        <ul className="space-y-3 border-t border-primary-foreground/15 pt-5">
          {claims.map((c) => {
            const state = credentialProductStatus(c, metadata?.verificationEvents ?? [], today);
            return (
              <li
                key={c.id}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 rounded-lg border border-primary-foreground/15 bg-primary-foreground/[0.07] p-3"
              >
                <span className="passport-signature flex h-11 w-11 items-center justify-center rounded-md bg-primary ring-1 ring-primary-foreground/15">
                  <CredentialSymbol
                    code={c.credentialCode}
                    state={credentialPresentationOf(c, state.lifecycle)}
                    name={lang === "sv" ? c.titleSv : c.titleEn || c.titleSv}
                    decorative
                    size={34}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold">
                    {lang === "sv" ? c.titleSv : c.titleEn || c.titleSv}
                  </span>
                  <span className="mt-1 block text-xs text-primary-foreground/65">{state.label[lang]}</span>
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
      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-primary-foreground/15 pt-4">
        <div className="rounded-md bg-primary-foreground/[0.07] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-primary-foreground/50">
            {copy("Integritet", "Privacy")}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
            <Lock size={12} aria-hidden="true" />
            {copy("Styrs av innehavaren", "Holder controlled")}
          </p>
        </div>
        <div className="rounded-md bg-primary-foreground/[0.07] p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-primary-foreground/50">
            {copy("Tillitsnivå", "Trust state")}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium">
            <ShieldCheck size={12} aria-hidden="true" />
            {copy("Visas per merit", "Shown per credential")}
          </p>
        </div>
      </div>
      <footer className="mt-4 flex items-center justify-between gap-4 border-t border-primary-foreground/15 pt-4 text-xs text-primary-foreground/65">
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
