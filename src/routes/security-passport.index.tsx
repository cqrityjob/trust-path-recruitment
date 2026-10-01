import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  FileText,
  Globe2,
  IdCard,
  Info,
  Lock,
  ScanText,
  Share2,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { SecurityPassportNetwork } from "@/components/site/SecurityPassportNetwork";
import { HomePassportPreview } from "@/components/site/HomePassportPreview";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

/** ── THE PUBLIC SECURITY PASSPORT PAGE (2026-09-30) ────────────────────
 *
 *  The page a signed-out visitor opens from "Security Passport" in the
 *  header and from its card on the homepage. It explains ONE product, in
 *  depth, and nothing else: what the Passport holds, how sharing is
 *  controlled, what each status means, what HAYAT does, and what the
 *  Passport is NOT. The signed-in product stays at /passport, untouched.
 *
 *  ── WHAT THIS PAGE MAY NOT SAY ─────────────────────────────────────────
 *
 *  * that the Passport is only a place to store documents;
 *  * that it is recognised, approved or legally valid in another country,
 *    or that it replaces a licence, security vetting, the right to work or
 *    an employer's own checks. The one sentence on that subject is the
 *    owner-approved disclaimer, rendered verbatim (passportPage.disclaimer);
 *  * that a read document is a verified credential;
 *  * that HAYAT confirms a credential with its issuer. Release gate B (an
 *    enabled verification source) is NOT met in production, so HAYAT is
 *    described as the document reader it is. The gate-met wording is kept
 *    in docs/public-website/release-gates.md;
 *  * education or work history — those belong to the profile and CV, not
 *    to the Passport pitch (passport-card-surface:check).
 *
 *  ── ONE STATUS VOCABULARY ─────────────────────────────────────────────
 *
 *  The four levels use the outward words the product shows a recipient
 *  (Egen uppgift · Dokument inlämnat · Dokumenterad · Källbekräftad). This
 *  page changes no status model; it only names the existing levels the same
 *  way everywhere a visitor reads them. */

const SV = dictionaries.sv;
const CANONICAL = "https://trust-path-recruitment.lovable.app/security-passport";

/** "Skapa mitt Security Passport" goes through the one validated sign-up
 *  door, carrying the intent: /passport answers a brand-new account with its
 *  own named first action. No second sign-up path. */
const PASSPORT_INTENT = { redirect: "/passport" } as const;

export const Route = createFileRoute("/security-passport/")({
  head: () => ({
    meta: [
      { title: SV["meta.passportPage.title"] },
      { name: "description", content: SV["passportPage.lead"] },
      { property: "og:title", content: SV["meta.passportPage.title"] },
      { property: "og:description", content: SV["passportPage.lead"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: SecurityPassportPage,
});

const DISPLAY = { fontFamily: "var(--font-display)" } as const;
const H2 =
  "text-balance text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]";
const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const HOLDS = [
  { key: "credentials", icon: IdCard },
  { key: "certifications", icon: Award },
  { key: "qualifications", icon: BadgeCheck },
  { key: "evidence", icon: FileText },
  { key: "markets", icon: Globe2 },
] as const;

/** The four existing levels, weakest first. The dot only repeats what the
 *  word says; the word is always there. */
const STATUS_LEVELS = [
  { key: "selfDeclared", dot: "bg-muted-foreground/40" },
  { key: "documentProvided", dot: "bg-muted-foreground/70" },
  { key: "documented", dot: "bg-accent/70" },
  { key: "sourceConfirmed", dot: "bg-accent" },
] as const;

function SecurityPassportPage() {
  const { t } = useT();
  useLocalizedHead("meta.passportPage.title", "passportPage.lead");

  return (
    <SiteLayout>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="surface-dawn relative overflow-hidden border-b border-border">
        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-12 md:px-8 md:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pb-20">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("passportPage.eyebrow")}
            </p>
            <h1
              className="mt-3 max-w-[22ch] text-balance text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-foreground [hyphens:auto] sm:text-[2.8rem] lg:[hyphens:none]"
              style={DISPLAY}
            >
              {t("passportPage.title")}
            </h1>
            <p className="mt-5 max-w-[58ch] text-base leading-relaxed text-muted-foreground md:text-[1.0625rem]">
              {t("passportPage.lead")}
            </p>
            <div className="mt-8 flex flex-col gap-x-6 gap-y-3 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
              <PrimaryLink to="/signup" search={PASSPORT_INTENT} className="w-full sm:w-auto">
                {t("cta.passport")}
              </PrimaryLink>
              <p>
                {t("passportPage.cta.signinLead")}{" "}
                <Link
                  to="/passport"
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {t("passportPage.cta.open")}
                </Link>
              </p>
            </div>
          </div>
          <HomePassportPreview />
        </div>
      </section>

      {/* ── NETWORK (renders nothing until the owner publishes) ─────── */}
      <SecurityPassportNetwork surface="passport_page" />

      {/* ── WHAT IT HOLDS ────────────────────────────────────────────── */}
      <Section id="innehall" className="scroll-mt-20 py-16 md:py-24">
        <div className="max-w-2xl">
          <h2 className={H2} style={DISPLAY}>
            {t("passportPage.holds.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("passportPage.holds.lead")}
          </p>
        </div>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOLDS.map(({ key, icon: Icon }) => (
            <li
              key={key}
              data-passport-holds={key}
              className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-xs)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-foreground">
                {t(`passportPage.holds.${key}.title` as TranslationKey)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`passportPage.holds.${key}.body` as TranslationKey)}
              </p>
            </li>
          ))}
          <li className="flex flex-col justify-center rounded-2xl border border-dashed border-border p-6">
            <p className="text-sm font-semibold text-foreground">{t("passportPage.india.lead")}</p>
            <Link to="/security-passport/india" className={cn(TEXT_LINK, "mt-1 self-start")}>
              {t("passportPage.india.cta")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </Section>

      {/* ── CONTROLLED SHARING ───────────────────────────────────────── */}
      <Section id="delning" bordered className="scroll-mt-20 bg-secondary/40 py-16 md:py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Share2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="max-w-3xl">
            <h2 className={H2} style={DISPLAY}>
              {t("passportPage.share.title")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
              {t("passportPage.share.body")}
            </p>
          </div>
        </div>
      </Section>

      {/* ── STATUS ───────────────────────────────────────────────────── */}
      <Section id="status" bordered className="scroll-mt-20 py-16 md:py-24">
        <div className="max-w-2xl">
          <h2 className={H2} style={DISPLAY}>
            {t("passportPage.status.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("passportPage.status.lead")}
          </p>
        </div>
        <ol
          aria-label={t("passportPage.status.legend")}
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {STATUS_LEVELS.map(({ key, dot }) => (
            <li
              key={key}
              data-passport-status={key}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", dot)} />
                {t(`passportPage.status.${key}` as TranslationKey)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`passportPage.status.${key}.body` as TranslationKey)}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── HAYAT ────────────────────────────────────────────────────── */}
      <Section id="hayat" bordered className="scroll-mt-20 bg-secondary/40 py-16 md:py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-accent shadow-[var(--shadow-xs)]">
            <ScanText className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="max-w-3xl">
            <h2 className={H2} style={DISPLAY}>
              {t("passportPage.hayat.title")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {t("passportPage.hayat.body")}
            </p>
            <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">
              {t("passportPage.hayat.note")}
            </p>
          </div>
        </div>
      </Section>

      {/* ── LIMITS ───────────────────────────────────────────────────── */}
      <Section id="bra-att-veta" bordered className="scroll-mt-20 py-16 md:py-20">
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Info className="h-5 w-5 text-accent" aria-hidden="true" />
            {t("passportPage.limits.title")}
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li data-passport-disclaimer>{t("passportPage.disclaimer")}</li>
            <li>{t("passportPage.jurisdiction")}</li>
          </ul>
        </div>
      </Section>

      {/* ── CLOSING: THE PATH FORWARD ────────────────────────────────── */}
      <Section className="surface-night py-16 text-primary-foreground md:py-20">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2
              className="text-balance text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-primary-foreground md:text-[2.1rem]"
              style={DISPLAY}
            >
              {t("passportPage.closing.title")}
            </h2>
            <p className="mt-4 flex items-start gap-2 text-base leading-relaxed text-primary-foreground/80">
              <Lock className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("passportPage.closing.body")}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PrimaryLink
              to="/signup"
              search={PASSPORT_INTENT}
              className="w-full border border-primary-foreground bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
            >
              {t("cta.passport")}
            </PrimaryLink>
          </div>
        </div>
        <p className="mt-10 border-t border-primary-foreground/15 pt-6 text-sm text-primary-foreground/80">
          {t("passportPage.closing.jobsLead")}{" "}
          <Link
            to="/jobs"
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary-foreground underline-offset-4 hover:underline"
          >
            {t("passportPage.closing.jobsCta")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </p>
      </Section>
    </SiteLayout>
  );
}
