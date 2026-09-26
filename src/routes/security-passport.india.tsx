import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  FileSearch,
  Globe2,
  Layers,
  Link2,
  Lock,
  Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { LanguageScope, readStoredLang, useT } from "@/i18n/context";
import {
  CredentialConstellation,
  type ShieldCredential,
} from "@/components/security-passport/CredentialShield";
import { resolveCredentialScope } from "@/lib/security-passport/credential-shield";
import {
  indiaT,
  INDIA_ENTRY_SOURCES,
  type IndiaCopyKey,
  type IndiaLang,
} from "@/lib/india-entry/copy";
import { trackFunnelOnce } from "@/lib/india-entry/analytics";

/** ── THE INDIA ENTRY PAGE ─────────────────────────────────────────────
 *
 *  One focused public page for security professionals in India, inside the
 *  existing site and design system. English first: the page renders English
 *  (server-side too) unless the visitor has explicitly chosen Swedish on this
 *  device, and the site's own language switcher still works on it.
 *
 *  ── WHERE "CREATE MY SECURITY PASSPORT" GOES ─────────────────────────
 *
 *  /signup with `?redirect=/passport/start?market=IN` — the product's one
 *  validated intent mechanism (safeReturnPath). It survives an immediate
 *  session, the emailed confirmation link and Google. `/passport/start` is not
 *  an auth surface, and nothing on this page adds a second sign-up path or
 *  weakens the redirect rules. `market=IN` only PRESELECTS India as the
 *  country of residence in the setup; it is editable and decides nothing.
 *
 *  ── WHAT IS NEVER LOADED HERE ────────────────────────────────────────
 *
 *  Nothing from HAYAT's reader: no pdf.js, no OCR engine, no language data.
 *  scripts/india-entry-check.ts refuses any such import on this route and on
 *  the setup route. Reading only ever starts when somebody chooses a file.
 *
 *  ── WHAT THIS PAGE MAY NOT SAY ───────────────────────────────────────
 *
 *  See src/lib/india-entry/copy.ts: no guaranteed jobs, visas, sponsorship or
 *  verification, no partners, counts or testimonials, no "Dubai-ready", and
 *  nothing that presents an Indian qualification as a SIRA licence.
 */

const INDIA_SETUP_REDIRECT = "/passport/start?market=IN";
/** The sign-up intent, WITH the language the visitor is reading -- in the
 *  sign-up URL and in the setup it returns to (an e-mailed confirmation link
 *  may be opened on another device). A click before hydration runs no
 *  handler, so the URL is what carries it; I18nProvider adopts it only when
 *  nothing was chosen on this device, so an explicit Swedish choice wins. */
function indiaIntent(lang: IndiaLang) {
  return { redirect: `${INDIA_SETUP_REDIRECT}&lang=${lang}`, lang } as const;
}
const PAGE_PATH = "/security-passport/india";
const CANONICAL = `https://trust-path-recruitment.lovable.app${PAGE_PATH}`;

export const Route = createFileRoute("/security-passport/india")({
  head: () => ({
    meta: [
      { title: indiaT("landing.meta.title", "en") },
      { name: "description", content: indiaT("landing.meta.description", "en") },
      { property: "og:title", content: indiaT("landing.meta.title", "en") },
      { property: "og:description", content: indiaT("landing.meta.description", "en") },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: IndiaEntryPage,
});

/** The four national qualifications on the page. Display only: the governed
 *  catalogue (20261214090000) is what a holder actually selects from, and
 *  scripts/india-entry-check.ts pins this list against the migration. */
const INDIA_QUALIFICATIONS = [
  { code: "IN_MEPSC_Q7101", title: "Security Guard", qp: "MEP/Q7101" },
  { code: "IN_MEPSC_Q7201", title: "Security Supervisor", qp: "MEP/Q7201" },
  { code: "IN_MEPSC_Q7104", title: "CCTV Supervisor", qp: "MEP/Q7104" },
  { code: "IN_MEPSC_Q7204", title: "CCTV Video Footage Auditor", qp: "MEP/Q7204" },
] as const;

function IndiaEntryPage() {
  const site = useT();
  const [lang, setLang] = useState<IndiaLang>("en");
  const [signedIn, setSignedIn] = useState(false);

  // Follow an EXPLICIT earlier choice; otherwise the page is English, and a
  // visitor who has never chosen a language continues in the one they are
  // reading -- sign-up, the confirmation e-mail and the setup included. Set
  // once on arrival rather than on the click, so a tap that lands before the
  // page is interactive (a slow phone) cannot lose it.
  useEffect(() => {
    const stored = readStoredLang();
    if (stored === "sv") setLang("sv");
    else if (stored === null) site.setLang("en");
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    trackFunnelOnce("india_landing_viewed");
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) setSignedIn(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onLangChange = useCallback((next: "sv" | "en") => setLang(next), []);

  const startJourney = () => {
    // Carry the page's language into sign-up, the confirmation email and the
    // setup: the visitor is continuing in the language they are reading.
    // First, so nothing after it can stand in its way.
    if (site.lang !== lang) site.setLang(lang);
    trackFunnelOnce("india_registration_started");
  };

  return (
    <LanguageScope lang={lang} onLangChange={onLangChange}>
      <SiteLayout>
        <IndiaPageBody lang={lang} signedIn={signedIn} onStart={startJourney} />
      </SiteLayout>
    </LanguageScope>
  );
}

function IndiaPageBody({
  lang,
  signedIn,
  onStart,
}: {
  lang: IndiaLang;
  signedIn: boolean;
  onStart: () => void;
}) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const primary = signedIn ? (
    <PrimaryLink
      to="/passport/start"
      search={{ market: "IN" }}
      onClick={onStart}
      className="w-full sm:w-auto"
    >
      {t("landing.cta.create")}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
    </PrimaryLink>
  ) : (
    <PrimaryLink
      to="/signup"
      search={indiaIntent(lang) as never}
      onClick={onStart}
      className="w-full sm:w-auto"
    >
      {t("landing.cta.create")}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
    </PrimaryLink>
  );

  return (
    <div data-india-entry-page lang={lang}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-secondary/40">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-12 pt-10 sm:px-6 md:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:pb-16 lg:pt-14">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t("landing.eyebrow")}
            </p>
            <h1
              className="mt-4 max-w-[18ch] text-balance text-[2rem] font-semibold leading-[1.08] tracking-tight text-foreground sm:text-[2.75rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("landing.title")}
            </h1>
            <p className="mt-5 max-w-[58ch] text-base leading-relaxed text-muted-foreground">
              {t("landing.lead")}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              {primary}
              <PrimaryLink
                to={PAGE_PATH}
                hash="example"
                variant="ghost"
                className="w-full sm:w-auto"
              >
                {t("landing.cta.example")}
              </PrimaryLink>
            </div>
            <p className="mt-4 max-w-[58ch] text-sm text-muted-foreground" data-india-cta-note>
              {t("landing.cta.note")}
            </p>
          </div>

          {/* How it starts — the four setup steps, stated before anybody signs up. */}
          <ol
            className="self-start rounded-xl border border-border bg-card p-5 sm:p-6"
            aria-label={t("landing.how.title")}
          >
            <li className="mb-3 text-sm font-semibold text-foreground">{t("landing.how.title")}</li>
            {(["landing.how.1", "landing.how.2", "landing.how.3", "landing.how.4"] as const).map(
              (key, i) => (
                <li
                  key={key}
                  className="flex gap-3 border-t border-border py-3 text-sm first-of-type:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground"
                  >
                    {i + 1}
                  </span>
                  <span className="text-foreground">{t(key)}</span>
                </li>
              ),
            )}
          </ol>
        </div>
      </section>

      {/* ── What you can do ──────────────────────────────────────────── */}
      <section className="py-12 md:py-16" aria-labelledby="india-what">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 md:px-8">
          <h2 id="india-what" className="text-2xl font-semibold tracking-tight text-foreground">
            {t("landing.what.title")}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [Layers, "landing.what.collect.title", "landing.what.collect.body"],
                [Globe2, "landing.what.add.title", "landing.what.add.body"],
                [FileSearch, "landing.what.hayat.title", "landing.what.hayat.body"],
                [Lock, "landing.what.share.title", "landing.what.share.body"],
              ] as const
            ).map(([Icon, title, body]) => (
              <li key={title} className="rounded-xl border border-border bg-card p-5">
                <Icon className="h-5 w-5 text-accent" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-foreground">{t(title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(body)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── The Indian catalogue, and what it is not ─────────────────── */}
      <section className="border-t border-border py-12 md:py-16" aria-labelledby="india-catalogue">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 md:px-8 lg:grid-cols-2">
          <div>
            <h2
              id="india-catalogue"
              className="text-2xl font-semibold tracking-tight text-foreground"
            >
              {t("landing.catalogue.title")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{t("landing.catalogue.body")}</p>
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {INDIA_QUALIFICATIONS.map((q) => (
                <li key={q.code} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span className="font-medium text-foreground">{q.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">{q.qp}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              <a
                className="inline-flex min-h-11 items-center gap-1 text-accent underline"
                href={INDIA_ENTRY_SOURCES.mepscSecurity}
                target="_blank"
                rel="noreferrer"
              >
                {t("landing.catalogue.source")}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </p>
          </div>
          <div className="space-y-4 text-sm leading-relaxed text-foreground">
            <p className="border-l-2 border-accent/60 pl-3">{t("landing.catalogue.nq")}</p>
            <p className="border-l-2 border-accent/60 pl-3">{t("landing.catalogue.psara")}</p>
            <p className="border-l-2 border-accent/60 pl-3">{t("landing.catalogue.intl")}</p>
          </div>
        </div>
      </section>

      {/* ── Dubai, stated truthfully ─────────────────────────────────── */}
      <section
        className="border-t border-border bg-secondary/40 py-12 md:py-16"
        aria-labelledby="india-dubai"
      >
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 md:px-8">
          <h2 id="india-dubai" className="text-2xl font-semibold tracking-tight text-foreground">
            {t("landing.dubai.title")}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-foreground">{t("landing.dubai.body1")}</p>
          <p className="mt-3 text-sm leading-relaxed text-foreground">{t("landing.dubai.body2")}</p>
          <a
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent underline"
            href={INDIA_ENTRY_SOURCES.siraCadreCard}
            target="_blank"
            rel="noreferrer"
          >
            {t("landing.dubai.link")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* ── The example: fictional, and labelled so ───────────────────── */}
      <section id="example" className="scroll-mt-24 border-t border-border py-12 md:py-16">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 md:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("landing.example.title")}
          </h2>
          <ExamplePassport lang={lang} />
        </div>
      </section>

      {/* ── Good to know, and the invitation ─────────────────────────── */}
      <section className="border-t border-border py-12 md:py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 md:px-8 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{t("landing.truth.title")}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-foreground">
              <li>{t("landing.truth.1")}</li>
              <li>{t("landing.truth.2")}</li>
              <li>{t("landing.truth.3")}</li>
            </ul>
          </div>
          <InviteCard lang={lang} />
        </div>
        <div className="mx-auto mt-10 flex w-full max-w-6xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:px-6 md:px-8">
          {primary}
          {!signedIn && (
            <Link
              to="/login"
              search={indiaIntent(lang) as never}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {t("landing.signin")}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

/** Fictional, and deliberately unverified: every shield is registered by its
 *  holder, which is the honest shape of a Passport on its first day. The
 *  Indian rows wear India's flag and the international one a globe, from the
 *  same scope resolver the real card uses. No number, no issuer logo, no tick. */
function ExamplePassport({ lang }: { lang: IndiaLang }) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const l = lang === "sv" ? "sv" : "en";
  const example: readonly ShieldCredential[] = [
    {
      id: "example-in-guard",
      code: "IN_MEPSC_Q7101",
      name: "Security Guard (MEP/Q7101)",
      state: "self_declared",
      lifecycle: "active",
      validUntil: null,
      scope: resolveCredentialScope({ jurisdictionCode: "IN" }, l),
    },
    {
      id: "example-in-cctv",
      code: "IN_MEPSC_Q7104",
      name: "CCTV Supervisor (MEP/Q7104)",
      state: "self_declared",
      lifecycle: "active",
      validUntil: null,
      scope: resolveCredentialScope({ jurisdictionCode: "IN" }, l),
    },
    {
      id: "example-app",
      code: "INTL_ASIS_APP",
      name: "Associate Protection Professional (APP)",
      state: "self_declared",
      lifecycle: "active",
      validUntil: null,
      scope: resolveCredentialScope({ global: true }, l),
    },
  ];
  return (
    <figure
      className="mt-6"
      data-india-example
      aria-label={`${t("landing.example.label")} — ${t("landing.example.caption")}`}
    >
      <div className="passport-signature passport-card-frame relative isolate overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-primary-foreground">CQrityjob</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/65">
              Security Passport
            </p>
          </div>
          <span
            data-india-example-label
            className="inline-flex min-h-6 items-center rounded-full border border-dashed border-primary-foreground/45 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/85"
          >
            {t("landing.example.label")}
          </span>
        </div>
        <p className="mt-5 text-lg font-semibold text-primary-foreground">
          {t("landing.example.name")}
        </p>
        <p className="text-xs text-primary-foreground/70">{t("landing.example.status")}</p>
        <CredentialConstellation
          credentials={example}
          ground="navy"
          className="mt-5 border-t border-primary-foreground/15 pt-4"
        />
      </div>
      <figcaption className="mt-3 text-sm text-muted-foreground">
        {t("landing.example.caption")}
      </figcaption>
    </figure>
  );
}

/** A generic invitation: the page's own public address and nothing else. Not a
 *  personal Passport share, no contacts are read, nothing is sent by us, and
 *  there is no reward. */
function InviteCard({ lang }: { lang: IndiaLang }) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  const url = () => `${window.location.origin}${PAGE_PATH}`;
  const share = async () => {
    try {
      await navigator.share({ title: t("landing.meta.title"), url: url() });
    } catch {
      // Dismissing the share sheet is not an error worth showing.
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6" data-india-invite>
      <h2 className="text-xl font-semibold text-foreground">{t("landing.invite.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("landing.invite.body")}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {canShare && (
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {t("landing.invite.share")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium"
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {t("landing.invite.copy")}
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-muted-foreground">
        {status === "copied"
          ? t("landing.invite.copied")
          : status === "failed"
            ? t("landing.invite.failed")
            : ""}
      </p>
    </div>
  );
}
