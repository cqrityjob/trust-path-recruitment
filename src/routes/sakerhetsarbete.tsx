import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ClipboardCheck,
  FileBarChart,
  Globe2,
  ListChecks,
  Lock,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Telescope,
  FolderSearch,
  LifeBuoy,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";

/** ── THE PUBLIC SÄKERHETSARBETE PAGE (2026-09-30) ───────────────────────
 *
 *  The page a signed-out visitor opens from "Säkerhetsarbete" in the header
 *  and from its card on the homepage. One product, in depth: what the
 *  workspace is for, how the work flows from sources to decisions, the use
 *  cases, and where AI stands. The authenticated workspace stays at
 *  /security-work, untouched.
 *
 *  ── RELEASE GATE A ────────────────────────────────────────────────────
 *
 *  The positioning is "AI-stöd för ditt säkerhetsarbete", but production has
 *  no active row in sw_ai_activations, so the LIVE title, status line and AI
 *  paragraph say what is true today: the workspace works without AI, and AI
 *  support is prepared but not activated. The gate-met wording replaces the
 *  three keys named in docs/public-website/release-gates.md. There is no
 *  flag here: copy is changed in the dictionary when the gate is met.
 *
 *  ── THE SECURITY NOTICE ───────────────────────────────────────────────
 *
 *  Information-handling warnings belong where information is handled —
 *  inside the workspace. This page mentions them once, under "Bra att
 *  veta", and never as the hero. */

const SV = dictionaries.sv;
const CANONICAL = "https://trust-path-recruitment.lovable.app/sakerhetsarbete";

/** The one validated sign-up door, landing in the workspace itself. */
const SECURITY_WORK_INTENT = { redirect: "/security-work" } as const;

export const Route = createFileRoute("/sakerhetsarbete")({
  head: () => ({
    meta: [
      { title: SV["meta.securityWorkPage.title"] },
      { name: "description", content: SV["securityWorkPage.lead"] },
      { property: "og:title", content: SV["meta.securityWorkPage.title"] },
      { property: "og:description", content: SV["securityWorkPage.lead"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: SecurityWorkPage,
});

const DISPLAY = { fontFamily: "var(--font-display)" } as const;
const H2 =
  "text-balance text-[1.6rem] font-semibold leading-[1.15] tracking-tight text-foreground md:text-[2.1rem]";

const FLOW = [
  { key: "monitor", icon: Telescope },
  { key: "collect", icon: FolderSearch },
  { key: "assess", icon: ClipboardCheck },
  { key: "report", icon: FileBarChart },
  { key: "followUp", icon: ListChecks },
] as const;

const USES = [
  { key: "monitoring", icon: Globe2 },
  { key: "risk", icon: ShieldAlert },
  { key: "assessment", icon: ShieldCheck },
  { key: "preparedness", icon: LifeBuoy },
] as const;

function SecurityWorkPage() {
  const { t } = useT();
  useLocalizedHead("meta.securityWorkPage.title", "securityWorkPage.lead");

  return (
    <SiteLayout>
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="surface-dawn relative overflow-hidden border-b border-border">
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-12 md:px-8 md:pt-16 lg:pb-20">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Radar className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("securityWorkPage.eyebrow")}
            </p>
            <h1
              className="mt-3 max-w-[22ch] text-balance text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-foreground [hyphens:auto] sm:text-[2.8rem] lg:text-[3.2rem] lg:[hyphens:none]"
              style={DISPLAY}
            >
              {t("securityWorkPage.title")}
            </h1>
            <p className="mt-5 max-w-[58ch] text-base leading-relaxed text-muted-foreground md:text-[1.0625rem]">
              {t("securityWorkPage.lead")}
            </p>
            <p
              data-security-work-status
              className="mt-5 inline-flex max-w-[60ch] items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground"
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {t("securityWorkPage.status")}
            </p>
            <div className="mt-8 flex flex-col gap-x-6 gap-y-3 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
              <PrimaryLink to="/signup" search={SECURITY_WORK_INTENT} className="w-full sm:w-auto">
                {t("securityWorkPage.cta.start")}
              </PrimaryLink>
              <p>
                {t("securityWorkPage.cta.signinLead")}{" "}
                <Link
                  to="/security-work"
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {t("securityWorkPage.cta.open")}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE FLOW ─────────────────────────────────────────────────── */}
      <Section id="arbetsflode" className="scroll-mt-20 py-16 md:py-24">
        <div className="max-w-2xl">
          <h2 className={H2} style={DISPLAY}>
            {t("securityWorkPage.flow.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("securityWorkPage.flow.lead")}
          </p>
        </div>
        <ol
          aria-label={t("securityWorkPage.flow.label")}
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-3"
        >
          {FLOW.map(({ key, icon: Icon }, i) => (
            <li key={key} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-accent">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {t(`securityWorkPage.flow.${key}.title` as TranslationKey)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`securityWorkPage.flow.${key}.body` as TranslationKey)}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── USE CASES ────────────────────────────────────────────────── */}
      <Section id="anvandning" bordered className="scroll-mt-20 bg-secondary/40 py-16 md:py-24">
        <h2 className={H2} style={DISPLAY}>
          {t("securityWorkPage.uses.title")}
        </h2>
        <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          {USES.map(({ key, icon: Icon }) => (
            <li
              key={key}
              data-security-work-use={key}
              className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">
                  {t(`securityWorkPage.uses.${key}.title` as TranslationKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`securityWorkPage.uses.${key}.body` as TranslationKey)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── AI, AND WHAT TO KNOW ─────────────────────────────────────── */}
      <Section id="ai-stod" bordered className="scroll-mt-20 py-16 md:py-24">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
              {t("securityWorkPage.ai.title")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("securityWorkPage.ai.body")}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Lock className="h-5 w-5 text-accent" aria-hidden="true" />
              {t("securityWorkPage.privacy.title")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("securityWorkPage.privacy.body")}
            </p>
          </div>
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
              {t("securityWorkPage.closing.title")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
              {t("securityWorkPage.closing.body")}
            </p>
          </div>
          <PrimaryLink
            to="/signup"
            search={SECURITY_WORK_INTENT}
            className="w-full gap-2 border border-primary-foreground bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
          >
            {t("securityWorkPage.cta.start")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryLink>
        </div>
      </Section>
    </SiteLayout>
  );
}
