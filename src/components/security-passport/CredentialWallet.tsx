import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  FileCheck2,
  Globe2,
  MapPin,
  Plus,
  Lock,
  Share2,
  UserRound,
} from "lucide-react";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import { credentialPassportHolder } from "@/lib/security-passport/credential-passport";
import {
  CREDENTIAL_CLASSES,
  credentialClass,
  credentialDate,
} from "@/lib/security-passport/international";
import { credentialPresentationOf } from "@/lib/security-passport/trust-presentation";
import { credentialProductStatus } from "@/lib/security-passport/product-status";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  headlineIsSelfDeclared,
  professionLine,
} from "@/lib/security-passport/identity/presentation";
import { CredentialSymbol } from "./CredentialSymbol";
import { CredentialRecord, CredentialRecordFact } from "./CredentialRecord";
import { LifecycleChip } from "./LifecycleChip";

export function CredentialWallet({
  snapshot,
  metadata,
  reviews,
  reviewState,
  now,
}: {
  snapshot: PassportSnapshot;
  metadata: InternationalPassportMetadata;
  reviewState: "loading" | "available" | "failed";
  reviews: ReadonlyMap<string, string> | null;
  now: string;
}) {
  const { lang, pt } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  // One derivation, one renderer — the same line the overview and the card
  // print, from the same engine output the snapshot already carries.
  const derivedTitle = professionLine(snapshot.holder.identity, lang, pt("identity.none"));
  const derivedIsSelfDeclared = headlineIsSelfDeclared(snapshot.holder.identity);
  const claims = credentialPassportHolder(snapshot.holder).claims;
  const rows = claims.map((c) =>
    credentialProductStatus(c, metadata.verificationEvents, now, reviews?.get(c.id)),
  );
  const active = rows.filter((r) => r.lifecycle === "active");
  const verified = active.filter((r) => r.checked).length;
  const expiring = active.filter(
    (r) =>
      r.claim.validUntil &&
      r.claim.validUntil <=
        new Date(new Date(now).getTime() + 30 * 86400000).toISOString().slice(0, 10),
  ).length;
  const identity = snapshot.profileIdentity;
  const title = lang === "sv" ? identity?.titleSv : identity?.titleEn;
  const country = (code: string | null | undefined) => {
    const j = metadata.jurisdictions.find((j) => j.code === code);
    return j ? j[lang === "sv" ? "name_sv" : "name_en"] : code;
  };
  const international = (code: string | null | undefined) =>
    metadata.definitions?.find((d) => d.code === code)?.scope_code === "global_professional" ||
    metadata.definitionScopes?.some(
      (d) => d.code === code && d.scope_code === "global_professional",
    );
  return (
    <section
      id="merits"
      aria-labelledby="credential-wallet-heading"
      tabIndex={-1}
      data-credential-wallet
      className="min-w-0 space-y-8"
    >
      <header
        data-passport-identity-surface
        className="passport-signature relative isolate overflow-hidden [container-type:inline-size] rounded-xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-lg)] sm:p-8 lg:p-9"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-primary-foreground/40"
        />
        <div
          aria-hidden="true"
          className="passport-grid absolute top-0 right-0 h-full w-52 border-l border-primary-foreground/10 opacity-25"
        />
        {/* The identity takes the full width and the actions sit on their own
            row beneath it. Side by side, the two buttons took whatever the
            name needed: "Amina Karlsson" wrapped to "Karlss / on" at 1440. */}
        <div className="relative grid min-w-0 gap-6">
          <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-5">
            <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 text-xl font-semibold text-primary-foreground shadow-[var(--shadow-md)] sm:h-[5.5rem] sm:w-[5.5rem] sm:text-2xl">
              {identity?.displayName
                ?.split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((name) => name[0])
                .join("") || "CQ"}
            </div>
            <div className="min-w-0">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-primary-foreground/65">
                <Lock size={12} aria-hidden="true" />
                Security Passport
              </p>
              {/* A holder's name never breaks inside a word. `overflow-wrap:
                  anywhere` on a large size is what printed "Most / afa /
                  Alsha / wi"; the size now follows the CARD's width, the
                  name takes at most two lines, and then an ellipsis. */}
              <h1
                id="credential-wallet-heading"
                data-passport-holder-name
                className="line-clamp-2 text-[clamp(20px,5.2cqw,30px)] font-semibold leading-tight !text-primary-foreground [hyphens:none] [overflow-wrap:normal] [word-break:keep-all]"
              >
                {identity?.displayName || copy("Mitt Security Passport", "My Security Passport")}
              </h1>
              {/* The primary title line is the derivation engine's output and
                  nothing else. With no qualifying credential it is the neutral
                  fallback — never the title somebody typed into Profile. */}
              <p
                data-passport-derived-title
                className="mt-2 line-clamp-2 font-medium text-primary-foreground/90"
              >
                {derivedTitle}
              </p>
              {derivedIsSelfDeclared ? (
                <p
                  data-testid="sp-self-declared-marker"
                  className="mt-0.5 text-xs text-primary-foreground/65"
                >
                  {pt("identity.selfDeclared")}
                </p>
              ) : null}
              {/* The Profile title may appear, below the derived line, lighter
                  and smaller, and said to be the holder's own description. */}
              {title ? (
                <p
                  data-passport-profile-title
                  className="mt-1.5 truncate text-xs font-normal text-primary-foreground/65"
                >
                  {title}
                  {" · "}
                  {copy("egen uppgift från Profil", "self-described, from Profile")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="relative mt-7 border-t border-primary-foreground/15 pt-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/60">
            {copy("Din professionella dokumentation", "Your professional records")}
          </p>
          {/* A grid, not a wrapping row: five figures in a flex row broke after
              the fourth at 1440 and left one orphan on a line of its own. Two
              columns on a phone, five across from `sm`. */}
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5">
            {[
              [active.length, copy("Aktiva meriter", "Active credentials")],
              [verified, copy("Granskade dokument", "Documents reviewed")],
              [
                active.filter((r) => r.status === "registered").length,
                copy("Egna uppgifter", "Holder reported"),
              ],
              [expiring, copy("Utgår inom 30 dagar", "Expire within 30 days")],
              [
                reviews === null ? "—" : rows.filter((r) => reviews.has(r.claim.id)).length,
                copy("Pågående granskningar", "Open reviews"),
              ],
            ].map(([value, label]) => (
              <div
                key={label}
                className="flex min-w-0 flex-col border-primary-foreground/15 sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0"
              >
                <dd className="text-xl font-semibold tabular-nums text-primary-foreground">
                  {value}
                </dd>
                <dt className="text-[11px] leading-snug text-primary-foreground/65">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </header>
      {/* The card holds no controls — no button, link, tab or input, ever.
          Everything the holder can DO sits in this row beneath it. */}
      <div
        data-passport-actions
        className="!mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <Link
          to="/passport/credentials/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Plus size={17} aria-hidden="true" />
          {copy("Lägg till meriter", "Add credential")}
        </Link>
        <Link
          to="/passport/share"
          data-cta="share"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Share2 size={16} aria-hidden="true" />
          {copy("Förhandsvisa och dela", "Preview and share")}
        </Link>
        {/* Shown there, edited here: the name and the Profile title are
            Profile facts, and the Passport has no editor for either. */}
        <Link
          to="/my-career/profile"
          hash="profile-basics"
          data-cta="edit-in-profile"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:ml-auto"
        >
          <UserRound size={12} aria-hidden="true" />
          {title
            ? copy("Namn och titel ändras i Profil", "Name and title are edited in Profile")
            : copy("Lägg till yrkestitel i Profil", "Add professional title in Profile")}
        </Link>
      </div>
      {reviews === null && (
        <p role="status" data-review-read-status className="rounded-xl bg-muted p-3 text-sm">
          {reviewState === "loading"
            ? copy("Läser granskningsstatus…", "Loading review status…")
            : copy("Granskningsstatus kunde inte läsas", "Review status unavailable")}
        </p>
      )}
      {!claims.length && (
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6">
          <h2 className="text-xl font-semibold">
            {copy("Din första merit", "Your first credential")}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {copy(
              "Välj en merit från katalogen och lägg till ditt underlag. Allt förblir privat tills du delar.",
              "Choose a credential from the catalogue and add your evidence. Everything stays private until you share.",
            )}
          </p>
        </div>
      )}
      {([true, false] as const).map((global) => {
        const group = rows.filter((r) => !!international(r.claim.credentialCode) === global);
        if (!group.length) return null;
        const Icon = global ? Globe2 : MapPin;
        return (
          <section
            key={String(global)}
            aria-label={
              global
                ? copy("Internationellt", "International")
                : copy("Nationellt och regionalt", "National and regional")
            }
          >
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Icon size={18} aria-hidden="true" />
              {global
                ? copy("Internationellt", "International")
                : copy("Nationellt och regionalt", "National and regional")}
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {group.length}
              </span>
            </h2>
            <ul className="space-y-3" aria-label={copy("Meriter", "Credentials")}>
              {group.map((row) => {
                const c = row.claim;
                const detail = metadata.details.find((d) => d.claim_id === c.id);
                const issuerRole = metadata.organisationRoles?.find(
                  (r) => r.credential_code === c.credentialCode && r.role === "issuer",
                );
                const officialIssuer = issuerRole
                  ? metadata.issuers.find(
                      (i) =>
                        i.id === (issuerRole.authority_id ?? issuerRole.certification_issuer_id),
                    )?.name
                  : undefined;
                const definition = metadata.definitions?.find((d) => d.code === c.credentialCode);
                return (
                  <li key={c.id} data-credential-row className="min-w-0">
                    <CredentialRecord
                      symbol={
                        <CredentialSymbol
                          code={c.credentialCode}
                          state={credentialPresentationOf(c, row.lifecycle)}
                          name={lang === "sv" ? c.titleSv : c.titleEn || c.titleSv}
                          decorative
                          size={42}
                          className="relative z-10 sm:h-[52px] sm:w-[52px]"
                        />
                      }
                      eyebrow={CREDENTIAL_CLASSES[credentialClass(c, detail)][lang]}
                      title={
                        definition
                          ? definition[lang === "sv" ? "name_sv" : "name_en"]
                          : lang === "sv"
                            ? c.titleSv
                            : c.titleEn || c.titleSv
                      }
                      metadata={
                        <>
                          <CredentialRecordFact
                            label={copy("Källa / utfärdare", "Source / issuer")}
                            value={
                              officialIssuer ||
                              (issuerRole?.document_specific
                                ? copy(
                                    "Utfärdare enligt dokumentet",
                                    "Issuer recorded on the document",
                                  )
                                : definition?.issuer_name) ||
                              copy(
                                "Officiell organisation behöver bekräftas",
                                "Official organisation needs confirmation",
                              )
                            }
                          />
                          <CredentialRecordFact
                            label={copy("Jurisdiktion", "Jurisdiction")}
                            value={
                              global
                                ? copy("Internationell", "International")
                                : country(
                                    detail?.validity_jurisdiction_code || c.jurisdictionCode,
                                  ) || copy("Område ej angivet", "Area not stated")
                            }
                          />
                          <CredentialRecordFact
                            label={copy("Giltighet", "Validity")}
                            value={
                              c.validUntil
                                ? credentialDate(c.validUntil, lang)
                                : detail?.no_expiry
                                  ? copy("Utan utgångsdatum", "No expiry")
                                  : copy("Slutdatum inte angivet", "Expiry not stated")
                            }
                          />
                        </>
                      }
                      states={
                        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                          <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                            <FileCheck2 size={13} className="mr-1.5" aria-hidden="true" />
                            {row.label[lang]}
                          </span>
                          <LifecycleChip state={row.lifecycle} />
                        </div>
                      }
                      action={
                        <Link
                          to="/passport/entry/$kind/$entryId"
                          params={{ kind: "claim", entryId: c.id }}
                          className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-accent"
                        >
                          {row.status === "registered"
                            ? copy("Lägg till underlag", "Add evidence")
                            : row.status === "clarification"
                              ? copy("Komplettera uppgifter", "Provide information")
                              : copy("Öppna meriter", "View credential")}
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </Link>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {copy(
          "Ett aktuellt datum är inte en verifiering. Granskning gäller det enskilda meriten och dess dokumenterade omfattning.",
          "A current date is not verification. Review applies to the individual credential and its documented scope.",
        )}
      </p>
    </section>
  );
}
