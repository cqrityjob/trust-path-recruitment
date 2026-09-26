// The Security Passport overview: one compact card, one action panel, and the
// credential collection beneath them.
//
// ── THE IDENTITY HIERARCHY (owner decision, 2026-09-17) ────────────────
//
//   Mostafa Alshawi
//   Head of Security
//   Current professional role · Self-declared
//
// Who the person IS comes from the canonical Career Profile — the one place a
// current profession is stated and edited. A credential-derived title is a
// fact about CREDENTIALS: it belongs to the trust layer, labelled as what it
// is, and it never replaces the role. A holder-reported ordningsvakts-
// förordnande does not get to rename the person holding it, and the absence
// of one is not printed under their name as "No active professional title".
//
// ── THE CARD IS A FIXED OBJECT ─────────────────────────────────────────
//
// It holds no action control and it does not grow: four shield slots, whether
// the holder has four credentials or forty. Everything the holder can DO is
// in the panel beside it; everything they HOLD is in the rows below.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  FileCheck2,
  Globe2,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Shield,
} from "lucide-react";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import {
  credentialPassportHolder,
  credentialRowAnchor,
} from "@/lib/security-passport/credential-passport";
import { CAREER_PROFILE_PROFESSION_EDIT_HREF } from "@/lib/security-passport/profile-basics";
import {
  CREDENTIAL_CLASSES,
  credentialClass,
  credentialDate,
} from "@/lib/security-passport/international";
import {
  credentialPresentationOf,
  presentationWordKeyOf,
} from "@/lib/security-passport/trust-presentation";
import { credentialProductStatus } from "@/lib/security-passport/product-status";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatExpiry } from "@/lib/security-passport/format";
import {
  headlineIsSelfDeclared,
  headlineTitles,
  joinTitles,
} from "@/lib/security-passport/identity/presentation";
import {
  resolveCredentialScope,
  type CredentialScope,
} from "@/lib/security-passport/credential-shield";
import {
  CredentialConstellation,
  ScopeMark,
  ShieldMark,
  type ShieldCredential,
} from "./CredentialShield";
import { LifecycleChip } from "./LifecycleChip";

export function CredentialWallet({
  snapshot,
  metadata,
  reviews,
  reviewState,
  now,
  panel,
  underCard,
}: {
  snapshot: PassportSnapshot;
  metadata: InternationalPassportMetadata;
  reviewState: "loading" | "available" | "failed";
  reviews: ReadonlyMap<string, string> | null;
  now: string;
  /** The rest of the action panel — next step, what needs attention, who can
   *  see. A slot, so the route still owns every read and this file still
   *  renders card → panel → collection in that order at every width. */
  panel?: ReactNode;
  /** Who can see the Passport. Sits under the card on a wide screen, and
   *  after the panel on a narrow one — source order is the mobile order. */
  underCard?: ReactNode;
}) {
  const { lang, pt } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);

  // WHO: the canonical Career Profile. Nothing else may fill this line.
  const identity = snapshot.profileIdentity;
  const currentRole = (lang === "sv" ? identity?.titleSv : identity?.titleEn)?.trim() || null;

  // WHAT THE CREDENTIALS SUPPORT: the engine's output, shown in the trust
  // layer of the panel and nowhere near the name.
  const derived = headlineTitles(snapshot.holder.identity);
  const credentialDerivedTitle = derived.length ? joinTitles(derived, lang, "") : null;
  const derivedIsSelfDeclared = headlineIsSelfDeclared(snapshot.holder.identity);

  const claims = credentialPassportHolder(snapshot.holder).claims;
  const isGlobal = (code: string | null | undefined) =>
    metadata.definitions?.find((d) => d.code === code)?.scope_code === "global_professional" ||
    Boolean(
      metadata.definitionScopes?.some(
        (d) => d.code === code && d.scope_code === "global_professional",
      ),
    );
  const rows = claims.map((c) => {
    const status = credentialProductStatus(c, metadata.verificationEvents, now, reviews?.get(c.id));
    const detail = metadata.details.find((d) => d.claim_id === c.id);
    const definition = metadata.definitions?.find((d) => d.code === c.credentialCode);
    const global = isGlobal(c.credentialCode);
    // The definition decides "global"; a blank jurisdiction never does.
    const scope = resolveCredentialScope(
      {
        global,
        jurisdictionCode: detail?.validity_jurisdiction_code || c.jurisdictionCode,
        subJurisdictionCode: c.subJurisdictionCode,
      },
      lang,
    );
    const name = definition
      ? definition[lang === "sv" ? "name_sv" : "name_en"]
      : lang === "sv"
        ? c.titleSv
        : c.titleEn || c.titleSv;
    const state = credentialPresentationOf(c, status.lifecycle);
    const shield: ShieldCredential = {
      id: c.id,
      code: c.credentialCode,
      name,
      state,
      statusWordKey: presentationWordKeyOf(c, state),
      lifecycle: status.lifecycle,
      validUntil: c.validUntil,
      scope,
    };
    return { ...status, detail, definition, global, scope, name, shield };
  });
  type Row = (typeof rows)[number];

  const active = rows.filter((r) => r.lifecycle === "active");
  const horizon = new Date(new Date(now).getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const stats: readonly [number, string][] = [
    [active.length, copy("Aktiva", "Active")],
    [
      active.filter((r) => r.trust.status !== "self_reported" && !r.sourceConfirmed).length,
      copy("Dokumenterade", "Documented"),
    ],
    [active.filter((r) => r.sourceConfirmed).length, copy("Källbekräftade", "Source-confirmed")],
    [
      active.filter((r) => r.claim.validUntil && r.claim.validUntil <= horizon).length,
      copy("Utgår inom 30 dagar", "Expire within 30 days"),
    ],
  ];

  // International first, then national — the page's own display order, which
  // is also the order the constellation keeps inside one trust standing.
  const international = rows.filter((r) => r.global);
  const national = rows.filter((r) => !r.global);
  const groups = new Map<string, { scope: CredentialScope; rows: Row[] }>();
  for (const r of national) {
    const key = r.scope.code ?? r.scope.kind;
    const g = groups.get(key) ?? { scope: r.scope, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }

  /** A holder-stated issuer, or null when it is really a governed authority's name. */
  const statedIssuer = (value: string | null | undefined): string | null => {
    const stated = value?.trim();
    if (!stated) return null;
    const lower = stated.toLocaleLowerCase();
    const governed = metadata.issuers.some((i) => {
      const name = i.name.toLocaleLowerCase();
      return name.includes(lower) || lower.includes(name);
    });
    return governed ? null : stated;
  };

  const issuerOf = (r: Row) => {
    const role = metadata.organisationRoles?.find(
      (o) => o.credential_code === r.claim.credentialCode && o.role === "issuer",
    );
    const official = role
      ? metadata.issuers.find((i) => i.id === (role.authority_id ?? role.certification_issuer_id))
          ?.name
      : undefined;
    return (
      official ||
      (role?.document_specific
        ? // The holder named the awarding organisation or training provider on
          // the certificate. It is shown as THEIR statement — unless what is
          // stored is the name of a governed authority. Records created before
          // the closed catalogue defaulted the issuer to the Police; a regulator
          // must never be presented as the trainer of a course it does not run.
          statedIssuer(r.claim.issuerName)
          ? `${statedIssuer(r.claim.issuerName)} · ${copy("enligt intyget", "as stated on the certificate")}`
          : copy("Utfärdare enligt dokumentet", "Issuer recorded on the document")
        : r.definition?.issuer_name) ||
      copy("Officiell organisation behöver bekräftas", "Official organisation needs confirmation")
    );
  };

  /** The governed REGULATOR, shown only where it is not also the issuer. */
  const regulatorOf = (r: Row) => {
    const roles = (metadata.organisationRoles ?? []).filter(
      (o) => o.credential_code === r.claim.credentialCode,
    );
    const regulator = roles.find((o) => o.role === "regulator");
    const issuer = roles.find((o) => o.role === "issuer");
    if (!regulator?.authority_id || regulator.authority_id === issuer?.authority_id) return null;
    return metadata.issuers.find((i) => i.id === regulator.authority_id)?.name ?? null;
  };

  const renderRow = (r: Row) => {
    const c = r.claim;
    return (
      <li
        key={c.id}
        // The side panel's next step links HERE. The arrival helper scrolls
        // the row into view, focuses it and marks it; the outline and tint
        // below are what make that arrival visible to a sighted reader.
        id={credentialRowAnchor(c.id)}
        data-credential-row
        aria-label={r.name}
        className="scroll-mt-28 outline-offset-[-2px] focus:outline-2 focus:outline-ring data-[hash-target]:bg-accent/10 grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[2.25rem_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-x-4"
      >
        {/* The treatment's tones are drawn for the card's navy ground, so the
            mark brings that ground with it onto a themed page. */}
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <ShieldMark state={r.shield.state} size={28} />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {CREDENTIAL_CLASSES[credentialClass(c, r.detail)][lang]}
          </p>
          <p className="text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
            {r.name}
          </p>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{issuerOf(r)}</p>
          {regulatorOf(r) && (
            <p
              data-credential-regulator
              className="text-xs text-muted-foreground [overflow-wrap:anywhere]"
            >
              {copy("Tillsyn", "Regulator")}: {regulatorOf(r)}
            </p>
          )}
          {c.authorisationScope?.trim() && (
            <p
              data-credential-authorisation-scope
              className="text-xs text-foreground [overflow-wrap:anywhere]"
            >
              {copy("Omfattning", "Scope")}: {c.authorisationScope.trim()}
            </p>
          )}
        </div>
        <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 sm:contents">
          <p
            data-credential-scope={r.scope.code ?? r.scope.kind}
            className="inline-flex items-center gap-1.5 justify-self-start rounded-md border border-border bg-secondary/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground"
          >
            <ScopeMark scope={r.scope} size={11} />
            {r.scope.label}
          </p>
          <div className="min-w-0">
            <LifecycleChip state={r.lifecycle} />
            <p className="mt-0.5 text-xs text-muted-foreground">
              {c.validUntil
                ? `${copy("Giltig till", "Valid until")} ${credentialDate(c.validUntil, lang)}`
                : formatExpiry(null, lang, r.detail?.no_expiry)}
            </p>
          </div>
          <p className="inline-flex items-center justify-self-start rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
            <FileCheck2 size={13} className="mr-1.5 shrink-0" aria-hidden="true" />
            {r.label[lang]}
          </p>
        </div>
        <Link
          to="/passport/entry/$kind/$entryId"
          params={{ kind: "claim", entryId: c.id }}
          className="col-start-2 inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:col-start-auto sm:justify-self-end"
        >
          {r.status === "registered"
            ? copy("Lägg till underlag", "Add evidence")
            : r.status === "clarification"
              ? copy("Komplettera uppgifter", "Provide information")
              : copy("Öppna meriter", "View credential")}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </li>
    );
  };

  return (
    <section
      aria-labelledby="credential-wallet-heading"
      data-credential-wallet
      className="min-w-0 space-y-6"
    >
      <div>
        {/* Styled as the page title, but not a heading: the holder's name on
            the card is this page's one h1, as it has been since the identity
            surface was introduced. */}
        <p
          data-passport-page-title
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {copy("Mitt Security Passport", "My Security Passport")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {copy(
            "Dina yrkesmeriter inom säkerhet – internationella och nationella, på ett ställe.",
            "Your professional security credentials — international and national, in one place.",
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
        <header
          data-passport-identity-surface
          className="passport-signature passport-card-frame relative isolate flex min-w-0 flex-col gap-6 overflow-hidden rounded-xl p-5 text-primary-foreground [container-type:inline-size] sm:gap-7 sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xl font-semibold tracking-tight">CQrityjob</p>
              <p className="mt-0.5 text-[11px] tracking-[0.28em] text-primary-foreground/65">
                SECURITY PASSPORT
              </p>
            </div>
            {/* The brand's shield, without a tick: a mark of approval at card
                level would say something no record on this card supports. */}
            <Shield aria-hidden="true" size={30} className="shrink-0 text-accent" />
          </div>

          <div className="grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-5">
            <div
              aria-hidden="true"
              className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-lg border border-primary-foreground/20 bg-primary-foreground/10 text-xl font-semibold shadow-[var(--shadow-md)] sm:h-[5.5rem] sm:w-[5.5rem] sm:text-2xl"
            >
              {identity?.displayName
                ?.split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((name) => name[0])
                .join("") || "CQ"}
            </div>
            <div className="min-w-0">
              {/* A holder's name never breaks inside a word: sized from the
                  CARD's width, two lines at most, then an ellipsis. */}
              <h1
                id="credential-wallet-heading"
                data-passport-holder-name
                className="line-clamp-2 text-[clamp(20px,5.2cqw,30px)] font-semibold leading-tight !text-primary-foreground [hyphens:none] [overflow-wrap:normal] [word-break:keep-all]"
              >
                {identity?.displayName || copy("Namn saknas i Profil", "Name not added in Profile")}
              </h1>
              {currentRole ? (
                <>
                  <p
                    data-passport-current-role
                    className="mt-1.5 line-clamp-2 text-base text-primary-foreground/90 sm:text-lg"
                  >
                    {currentRole}
                  </p>
                  <p
                    data-passport-role-source
                    className="mt-1 text-xs text-primary-foreground/60 sm:text-sm"
                  >
                    {copy("Nuvarande yrke", "Current professional role")}
                    {" · "}
                    {copy("Egen uppgift", "Self-declared")}
                  </p>
                </>
              ) : (
                <p data-passport-role-source className="mt-1.5 text-sm text-primary-foreground/60">
                  {copy("Nuvarande yrke inte angivet", "Current professional role not added")}
                </p>
              )}
            </div>
          </div>

          <CredentialConstellation
            credentials={rows.map((r) => r.shield)}
            ground="navy"
            // The one way out of the card: a link to the rest of what it
            // summarises. It navigates; it does not act.
            overflow={(shield, label) => (
              <Link
                to="/passport"
                hash="merits"
                data-shield-overflow-link
                aria-label={`${label} — ${copy("visa alla meriter", "show all credentials")}`}
                title={label}
                className="flex min-h-11 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
              >
                {shield}
              </Link>
            )}
          />
        </header>

        <div
          data-passport-panel
          className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)] sm:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <div data-passport-actions className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/passport/credentials/new"
              data-cta="add-credential"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus size={17} aria-hidden="true" />
              {copy("Lägg till meriter", "Add credential")}
            </Link>
            <Link
              to="/passport/share"
              data-cta="share"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-input bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Share2 size={16} aria-hidden="true" />
              {copy("Dela Passport", "Share Passport")}
            </Link>
          </div>
          {/* Shown on the card, edited in the Profile: the Passport has no
              editor for the name or the role, and says where the editor is. */}
          {/* A plain anchor on the SHARED contract: the href carries a query
              and a fragment, and re-spelling it here is how the Passport and
              the Profile came to disagree about where the editor is. */}
          <a
            href={CAREER_PROFILE_PROFESSION_EDIT_HREF}
            data-cta="edit-in-profile"
            className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Pencil size={14} aria-hidden="true" />
            {currentRole
              ? copy("Ändra nuvarande yrke", "Edit current professional role")
              : copy("Lägg till nuvarande yrke", "Add current professional role")}
          </a>

          <dl
            data-passport-stats
            className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4"
          >
            {stats.map(([value, label]) => (
              <div
                key={label}
                className="flex min-w-0 flex-col border-border sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0"
              >
                <dd className="text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
                <dt className="text-xs leading-snug text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>

          {/* The trust layer's statement about titles. Never on the card. */}
          {credentialDerivedTitle ? (
            <p
              data-passport-derived-title
              className="mt-4 rounded-lg border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground"
            >
              <span className="font-semibold text-foreground">
                {copy("Titel som meriterna ger stöd för", "Title your credentials support")}
                {": "}
                {credentialDerivedTitle}
              </span>
              {derivedIsSelfDeclared ? (
                <span data-testid="sp-self-declared-marker">
                  {" · "}
                  {pt("identity.selfDeclared")}
                  {". "}
                  {pt("identity.selfDeclaredNote")}
                </span>
              ) : null}
            </p>
          ) : null}

          {panel}
        </div>
        {underCard ? (
          <div
            data-passport-under-card
            className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)] sm:p-6 lg:col-start-1 lg:row-start-2"
          >
            {underCard}
          </div>
        ) : null}
      </div>

      {reviews === null && (
        <p role="status" data-review-read-status className="rounded-xl bg-muted p-3 text-sm">
          {reviewState === "loading"
            ? copy("Läser granskningsstatus…", "Loading review status…")
            : copy("Granskningsstatus kunde inte läsas", "Review status unavailable")}
        </p>
      )}

      <div
        id="merits"
        role="region"
        aria-labelledby="sp-merits-heading"
        tabIndex={-1}
        className="scroll-mt-24 space-y-5"
      >
        <h2 id="sp-merits-heading" className="sr-only">
          {copy("Meriter", "Credentials")}
        </h2>
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

        {international.length > 0 && (
          <section
            aria-labelledby="sp-international-heading"
            data-credential-group="global"
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <h2
              id="sp-international-heading"
              className="flex items-center gap-2.5 border-b border-border px-4 py-3 text-base font-semibold text-foreground"
            >
              <Globe2 size={18} aria-hidden="true" />
              {copy("Internationella certifieringar", "International certifications")}
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {international.length}
              </span>
            </h2>
            <ul className="divide-y divide-border" aria-label={copy("Meriter", "Credentials")}>
              {international.map(renderRow)}
            </ul>
          </section>
        )}

        {national.length > 0 && (
          <section
            aria-labelledby="sp-national-heading"
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <h2
              id="sp-national-heading"
              className="flex items-center gap-2.5 border-b border-border px-4 py-3 text-base font-semibold text-foreground"
            >
              <MapPin size={18} aria-hidden="true" />
              {copy("Nationella och regionala meriter", "National & regional credentials")}
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {national.length}
              </span>
            </h2>
            {[...groups.entries()].map(([key, g]) => (
              <div key={key} data-credential-group={key}>
                <h3 className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-foreground">
                  <ScopeMark scope={g.scope} size={13} />
                  {g.scope.label}
                </h3>
                <ul
                  className="divide-y divide-border border-b border-border last:border-b-0"
                  aria-label={g.scope.label}
                >
                  {g.rows.map(renderRow)}
                </ul>
              </div>
            ))}
          </section>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          {copy(
            "Ett aktuellt datum är inte en verifiering. Granskning gäller det enskilda meriten och dess dokumenterade omfattning.",
            "A current date is not verification. Review applies to the individual credential and its documented scope.",
          )}
        </p>
      </div>
    </section>
  );
}
