import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { FinalCta } from "@/components/patterns/FinalCta";
import { SectionBand } from "@/components/patterns/SectionBand";
import { SplitHero } from "@/components/patterns/SplitHero";
import { TrustPath } from "@/components/patterns/TrustPath";
import { ConditionsScene } from "@/components/patterns/scenes/ConditionsScene";
import { ExplorerScene } from "@/components/patterns/scenes/ExplorerScene";
import { PassportEntriesScene } from "@/components/patterns/scenes/PassportEntriesScene";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bättre karriärbeslut. Tryggare rekrytering. | CQrityjob" },
      {
        name: "description",
        content:
          "CQrityjob är en karriär- och kompetensplattform för säkerhetsbranschen. Utforska säkerhetsyrken, samla din yrkesbakgrund och se vad vi bygger härnäst.",
      },
      { property: "og:title", content: "Bättre karriärbeslut. Tryggare rekrytering. | CQrityjob" },
      {
        property: "og:description",
        content: "CQrityjob är en karriär- och kompetensplattform för säkerhetsbranschen.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CQrityjob",
          slogan: "Where trust comes first.",
          description: "A career and competence platform for the security industry.",
          url: "https://www.cqrityjob.com",
        }),
      },
    ],
  }),
  component: HomePage,
});

const copy = {
  sv: {
    eyebrow: "Karriär och kompetens inom säkerhet",
    h1: "Bättre karriärbeslut. Tryggare rekrytering.",
    lede: "CQrityjob är en karriär- och kompetensplattform för säkerhetsbranschen. Här utforskar du vilka yrken som finns och vad de kräver. Security Passport och stödet för arbetsgivare byggs ut steg för steg.",
    explore: "Utforska säkerhetsyrken",
    passportRead: "Läs om Security Passport",
    trust: "Du bestämmer vad som delas. CQrityjob avgör inte om någon är lämplig eller behörig.",
    explorerCaption: "Yrkesguider: krav, kompetenser och vägar vidare.",
    startEye: "Utgångsläget",
    startH: "Yrkesbakgrunden finns redan — sällan på ett ställe.",
    startBody:
      "Erfarenhet, behörigheter, utbildningar och intyg samlas sällan på ett ställe. För den som söker tar det tid att sätta ihop och visa det man vill visa. För den som rekryterar tar det tid att gå igenom. Det är ett strukturproblem, och det går att arbeta med.",
    startClose:
      "Där underlagsinformation finns visar CQrityjob vad den består av. När en offentlig status saknas hittar vi inte på en.",
    passEye: "Security Passport",
    passH: "Samla din yrkesbakgrund på ett ställe.",
    passBody:
      "I Security Passport registrerar du erfarenhet, behörigheter, utbildningar och intyg. Du bestämmer vad som delas, med vem och hur länge. Du kan dela uppgifterna med mottagare i andra länder — men en behörighet blir inte automatiskt erkänd eller juridiskt giltig någon annanstans.",
    recordLink: "Så redovisas underlaget",
    passCaption: "Fyra poster, med den information som finns om var och en.",
    pathEye: "Vägen",
    pathH: "Ett stöd genom hela karriären, inte bara vid jobbyte.",
    stages: [
      { title: "Upptäck", body: "Vilka yrken finns inom säkerhet, och vad krävs för dem?" },
      { title: "Förstå", body: "Var passar dina styrkor in, och vad har du redan registrerat?" },
      { title: "Väx", body: "Vilken utbildning, certifiering eller erfarenhet tar dig vidare?" },
      { title: "Arbeta", body: "Visa det du väljer att visa, och sök rollen." },
      { title: "Fortsätt", body: "Håll uppgifterna aktuella och ta nästa steg." },
    ],
    empEye: "För arbetsgivare",
    empH: "Så bygger vi för arbetsgivare.",
    empBody:
      "Vi bygger stöd för rekrytering, kompetensbedömning, strukturerade intervjuer och kompetensutveckling. Delarna byggs ut i tur och ordning, och vi beskriver en funktion som tillgänglig först när den är det. Det en arbetsgivare ser av ett Security Passport kommer från vad personen själv har registrerat och valt att dela. Beslutet fattar arbetsgivaren.",
    empLink: "Läs om plattformen för arbetsgivare",
    aiLine: "AI ger beslutsstöd. Människor fattar besluten.",
    recEye: "Så redovisar vi underlaget",
    recH: "Vi säger vad vi vet om en uppgift — och hittar inte på resten.",
    recIntro:
      "En uppgift kan vara registrerad av dig själv, ej källbekräftad eller bekräftad av en namngiven arbetsgivare. För en del uppgifter finns ingen offentlig status — då visas ingen.",
    conditions: [
      [
        "Registrerat av dig",
        "Uppgiften är inlagd av personen själv och inte granskad. Den visas som just det.",
      ],
      [
        "Ej källbekräftat",
        "Det underlag som finns når inte upp till en källbekräftelse, och därför anges ingen källa.",
      ],
      [
        "Bekräftat av en namngiven arbetsgivare",
        "En namngiven arbetsgivare har bekräftat en anställningsperiod, med datum. Det gäller anställningen som sådan, inte omdömen om personen.",
      ],
    ] as const,
    recValidity:
      "Behörigheter kan dessutom ha en giltighet: aktuell, går ut snart, utgången eller återkallad. Saknas den uppgiften antar vi inte att behörigheten fortfarande gäller.",
    recAI:
      "AI hjälper till att strukturera underlag och formulera frågor. Den avgör inte om någon är lämplig för ett arbete.",
    recLimit:
      "CQrityjob ersätter inte tillstånd, licens, bakgrundskontroll eller due diligence. CQrityjob rangordnar inte kandidater inför anställningsbeslut och lämnar inga omdömen om lämplighet.",
    recCaption: "Samma uppgift, tydligt redovisad efter vad som faktiskt är känt.",
    closeH: "Ett underlag, samma redovisning.",
    closeBody:
      "Du registrerar din yrkesbakgrund och väljer vad som delas. Mottagaren ser samma uppgifter, redovisade på samma sätt och med samma status som du ser.",
    slogan: "Where trust comes first.",
  },
  en: {
    eyebrow: "Security careers and competence",
    h1: "Better career decisions. More confident hiring.",
    lede: "CQrityjob is a career and competence platform for the security industry. Here you explore which roles exist and what they require. The Security Passport and the tools for employers are being built out step by step.",
    explore: "Explore security roles",
    passportRead: "Read about the Security Passport",
    trust:
      "You decide what is shared. CQrityjob does not decide whether anyone is suitable or eligible.",
    explorerCaption: "Profession guides: requirements, competencies and where each one leads.",
    startEye: "The starting point",
    startH: "The record already exists — rarely in one place.",
    startBody:
      "Experience, authorisations, training and written confirmations are rarely kept together. Assembling them, and showing only what you want to show, takes time. So does reading through them. It is a structural problem, and one you can do something about.",
    startClose:
      "Where supporting information exists, CQrityjob shows what it consists of. Where a public status is missing, we do not invent one.",
    passEye: "Security Passport",
    passH: "Keep your professional record in one place.",
    passBody:
      "In the Security Passport you record experience, authorisations, training and written confirmations. You decide what is shared, with whom, and for how long. You can share the record with recipients in other countries — but that does not make an authorisation recognised or legally valid anywhere else.",
    recordLink: "How the record is presented",
    passCaption: "Four entries, with whatever is known about each.",
    pathEye: "The path",
    pathH: "Support across a career, not only when you change jobs.",
    stages: [
      { title: "Discover", body: "Which roles exist in security, and what do they require?" },
      {
        title: "Understand",
        body: "Where do your strengths fit, and what have you already recorded?",
      },
      { title: "Grow", body: "Which training, certification or experience takes you further?" },
      { title: "Work", body: "Show what you choose to show, and go for the role." },
      { title: "Continue", body: "Keep it current, and take the next step." },
    ],
    empEye: "For employers",
    empH: "What we are building for employers.",
    empBody:
      "We are building support for recruitment, competence assessment, structured interviews and workforce development. We are building the parts in sequence, and we describe a capability as available only once it is. What an employer sees of a Security Passport comes from what that person recorded and chose to share. The employer makes the decision.",
    empLink: "Read about the platform for employers",
    aiLine: "AI provides decision support. People make the decisions.",
    recEye: "How we present the record",
    recH: "We say what we know about an entry, and we do not invent the rest.",
    recIntro:
      "An entry may be recorded by you, not source-confirmed, or confirmed by a named employer. Some entries carry no public status — then none is shown.",
    conditions: [
      ["Recorded by you", "Entered by the person and not reviewed. Shown as exactly that."],
      [
        "Not source-confirmed",
        "The supporting information does not amount to source confirmation, so no source is named.",
      ],
      [
        "Confirmed by a named employer",
        "A named employer has confirmed a period of employment, with a date. That covers the employment itself, not opinions about the person.",
      ],
    ] as const,
    recValidity:
      "Authorisations may also carry a validity: current, expiring, expired or withdrawn. Where that is missing, we do not assume the authorisation still stands.",
    recAI:
      "AI helps structure material and frame questions. It does not judge whether anyone is right for a job.",
    recLimit:
      "CQrityjob is not a substitute for a permit, a licence, background screening or due diligence. CQrityjob does not rank candidates for hiring decisions and does not judge anyone's suitability.",
    recCaption: "The same entry, presented clearly according to what is actually known.",
    closeH: "One record, presented the same way.",
    closeBody:
      "You record your professional background and choose what is shared. Whoever receives it sees the same entries, presented the same way and with the same status you see.",
    slogan: "Where trust comes first.",
  },
} as const;

function HomePage() {
  const { lang } = useT();
  const c = copy[lang];
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) navigate({ to: "/my-career", replace: true });
    });
    return () => {
      alive = false;
    };
  }, [navigate]);
  return (
    <SiteLayout>
      <SectionBand id="hero" tone="ivory" className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_75%_20%,rgba(20,121,184,0.12),transparent_55%)]"
        />
        <SplitHero
          copy={
            <div className="relative">
              <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.eyebrow}</p>
              <h1 className="cq-h1 mt-5">{c.h1}</h1>
              <p className="cq-lede mt-6 text-[var(--cq-text-muted)]">{c.lede}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/career-center" className="cq-button-primary">
                  {c.explore}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <a href="#security-passport" className="cq-button-secondary">
                  {c.passportRead}
                </a>
              </div>
              <p className="cq-caption mt-6 flex items-start gap-2 text-[var(--cq-text-muted)]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cq-blue)]" />
                {c.trust}
              </p>
            </div>
          }
          scene={<ExplorerScene caption={c.explorerCaption} lang={lang} />}
        />
      </SectionBand>
      <SectionBand id="starting-point" tone="ice">
        <div className="max-w-[var(--cq-w-prose)]">
          <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.startEye}</p>
          <h2 className="cq-h2 mt-4">{c.startH}</h2>
          <p className="cq-lede mt-6 text-[var(--cq-text-muted)]">{c.startBody}</p>
          <p className="cq-body mt-6 border-l-2 border-[var(--cq-blue)] pl-5 font-medium">
            {c.startClose}
          </p>
        </div>
      </SectionBand>
      <SectionBand id="security-passport" tone="ivory">
        <SplitHero
          copy={
            <div>
              <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.passEye}</p>
              <h2 className="cq-h2 mt-4">{c.passH}</h2>
              <p className="cq-lede mt-6 text-[var(--cq-text-muted)]">{c.passBody}</p>
              <a
                className="cq-link mt-7 inline-flex min-h-11 items-center font-semibold"
                href="#record"
              >
                {c.recordLink}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </div>
          }
          scene={<PassportEntriesScene caption={c.passCaption} lang={lang} />}
        />
      </SectionBand>
      <SectionBand id="path" tone="ice">
        <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.pathEye}</p>
        <h2 className="cq-h2 mt-4 max-w-3xl">{c.pathH}</h2>
        <div className="mt-12">
          <TrustPath stages={c.stages} />
        </div>
      </SectionBand>
      <SectionBand id="employers" tone="navy">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className="cq-eyebrow text-[var(--cq-on-navy-muted)]">{c.empEye}</p>
            <h2 className="cq-h2 mt-4 text-[var(--cq-ivory)]">{c.empH}</h2>
            <p className="cq-lede mt-6 max-w-[var(--cq-w-prose)] text-[var(--cq-on-navy-muted)]">
              {c.empBody}
            </p>
            <Link
              to="/employers"
              className="mt-7 inline-flex min-h-11 items-center font-semibold text-white underline decoration-[var(--cq-blue)] decoration-2 underline-offset-4"
            >
              {c.empLink}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
          <div className="flex items-end lg:col-span-4">
            <p className="flex items-start gap-3 border-l border-[var(--cq-on-navy-line)] pl-5 text-lg font-semibold text-white">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cq-on-navy-line)]" />
              {c.aiLine}
            </p>
          </div>
        </div>
      </SectionBand>
      <SectionBand id="record" tone="ivory">
        <SplitHero
          copy={
            <div>
              <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.recEye}</p>
              <h2 className="cq-h2 mt-4">{c.recH}</h2>
              <p className="cq-body mt-6 text-[var(--cq-text-muted)]">{c.recIntro}</p>
              <div className="mt-7 space-y-5">
                {c.conditions.map(([title, body]) => (
                  <div key={title} className="flex gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[var(--cq-blue)]" />
                    <div>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="cq-caption mt-1 text-[var(--cq-text-muted)]">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="cq-caption mt-7 text-[var(--cq-text-muted)]">{c.recValidity}</p>
              <p className="cq-caption mt-4 font-medium">
                {c.aiLine} {c.recAI}
              </p>
              <p className="cq-caption mt-4 text-[var(--cq-text-muted)]">{c.recLimit}</p>
            </div>
          }
          scene={<ConditionsScene caption={c.recCaption} lang={lang} />}
        />
      </SectionBand>
      <SectionBand id="close" tone="ice">
        <FinalCta>
          <h2 className="cq-h2">{c.closeH}</h2>
          <p className="cq-lede mt-5 text-[var(--cq-text-muted)]">{c.closeBody}</p>
          <Link to="/career-center" className="cq-button-primary mt-8">
            {c.explore}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <p className="cq-eyebrow mt-9 text-[var(--cq-blue-ink)]">{c.slogan}</p>
        </FinalCta>
      </SectionBand>
    </SiteLayout>
  );
}
