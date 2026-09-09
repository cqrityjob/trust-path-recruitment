import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, ShieldCheck } from "lucide-react";
import { FinalCta } from "@/components/patterns/FinalCta";
import { SectionBand } from "@/components/patterns/SectionBand";
import { SplitHero } from "@/components/patterns/SplitHero";
import { TrustPath } from "@/components/patterns/TrustPath";
import { ExplorerScene } from "@/components/patterns/scenes/ExplorerScene";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Om CQrityjob — karriär och kompetens inom säkerhet" },
      {
        name: "description",
        content:
          "Varför CQrityjob finns, hur vi ser på underlag, mänskligt omdöme och AI. Byggt för säkerhetsbranschen, från Sverige.",
      },
      { property: "og:title", content: "Om CQrityjob — karriär och kompetens inom säkerhet" },
      {
        property: "og:description",
        content: "Varför CQrityjob finns och hur vi bygger för säkerhetsbranschen.",
      },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/about" }],
  }),
  component: AboutPage,
});

const copy = {
  sv: {
    eyebrow: "Om CQrityjob",
    h1: "Därför finns CQrityjob",
    lede: "Säkerhetsarbete bygger på förtroende. CQrityjob finns för att göra underlaget för det förtroendet samlat, begripligt och möjligt att styra själv.",
    explore: "Utforska säkerhetsyrken",
    contact: "Kontakta oss",
    sections: [
      [
        "Säkerhet är inte ett yrke — det är många",
        "Säkerhet spänner över offentlig och privat sektor, operativa och strategiska roller, fysiska och digitala miljöer, och ansvar som direkt påverkar människor, tillgångar och samhälle. Arbetsmarknaden har länge behandlat säkerhet som en kategori bland andra. Vi tycker att branschen förtjänar mer än så.",
      ],
      [
        "Varför CQrityjob skapades",
        "CQrityjob grundades av Mostafa Alshawi utifrån egen erfarenhet av arbete inom kritisk infrastruktur, offentliga myndigheter, företags- och koncernsäkerhet samt internationella och reglerade miljöer. Ett problem återkom: kompetensen fanns, men det saknades struktur för att koppla ihop den på ett ansvarsfullt sätt. Säkerhetsarbete handlar om förtroende, ansvar, sammanhang och mandat.",
      ],
      [
        "Bara säkerhetsbranschen",
        "Vi arbetar bara med säkerhetsbranschen, och det är ett aktivt val. Behörigheter, regelverk och kompetenskrav skiljer sig mellan länder och förändras över tid. Väktare, ordningsvakt och skyddsvakt är olika reglerade roller i Sverige och ska inte slås ihop till en generisk titel.",
      ],
      [
        "Plattformen",
        "CQrityjob är en karriär- och kompetensplattform för säkerhetsbranschen. Karriärcenter visar vilka yrken som finns och vad de kräver. I Security Passport registrerar en person sin yrkesbakgrund. Kompetensbedömning, strukturerade intervjuer, rekrytering och jobbannonsering knyter ihop delarna. Delarna byggs ut i tur och ordning.",
      ],
      [
        "Mänskligt omdöme och AI",
        "AI hjälper oss att strukturera underlag, formulera frågor och sammanställa material. Den avgör inte om en människa är lämplig för ett arbete och fattar inga anställningsbeslut. Teknik ska stödja bättre beslut, inte ersätta omdöme.",
      ],
      [
        "Underlag, noggrannhet och öppenhet",
        "Där underlagsinformation finns visar CQrityjob vad den består av: registrerat av personen själv, granskat utan att vara källbekräftat, eller bekräftat av en namngiven arbetsgivare. När en offentlig status saknas hittar vi inte på en. Saknas en giltighet antar vi inte att den fortfarande gäller.",
      ],
    ],
    commitments: [
      ["En bransch", "Byggt för säkerhetens särskilda roller och krav."],
      ["Tydligt underlag", "Vi skiljer på registrerat, granskat och källbekräftat."],
      ["Mänskliga beslut", "AI ger beslutsstöd. Människor fattar besluten."],
    ],
    finalH: "Byggt för förtroende som går att förstå.",
    finalBody: "Utforska yrkena, läs hur plattformen fungerar eller hör av dig till oss.",
    caption: "En sammanhängande väg genom säkerhetskarriären.",
    ai: "AI ger beslutsstöd. Människor fattar besluten.",
  },
  en: {
    eyebrow: "About CQrityjob",
    h1: "Why CQrityjob exists",
    lede: "Security work rests on trust. CQrityjob exists to make the basis for that trust coherent, understandable, and something people control themselves.",
    explore: "Explore security roles",
    contact: "Contact us",
    sections: [
      [
        "Security is not one profession but many",
        "Security spans the public and private sectors, operational and strategic roles, physical and digital environments, and responsibilities that reach people, assets and society directly. The labour market has long treated it as one category among many. We think the field deserves more than that.",
      ],
      [
        "How CQrityjob started",
        "CQrityjob was founded by Mostafa Alshawi, drawing on his work in critical infrastructure, public authorities, corporate and enterprise security, and international and regulated environments. One problem recurred: the competence was there, but there was no structure for connecting it responsibly. Security work turns on trust, responsibility, context and mandate.",
      ],
      [
        "The security industry only",
        "We work only with the security industry, and that is a deliberate choice. Authorisations, regulations and competence requirements differ between countries and change over time. Väktare, ordningsvakt and skyddsvakt are distinct regulated roles in Sweden and should not be collapsed into a single generic title.",
      ],
      [
        "The platform",
        "CQrityjob is a career and competence platform for the security industry. The Career Center sets out which roles exist and what they require. In the Security Passport a person records their professional background. Competence assessment, structured interviews, recruitment and job advertising connect the parts. We are building them in sequence.",
      ],
      [
        "Human judgement and AI",
        "AI helps us structure material, frame questions and assemble information. It does not judge whether a person is suitable for a job, and it makes no employment decisions. Technology should support better decisions, not replace judgement.",
      ],
      [
        "Evidence, accuracy and openness",
        "Where supporting information exists, CQrityjob shows what it consists of: recorded by the person, reviewed without being source-confirmed, or confirmed by a named employer. Where a public status is missing, we do not invent one. Where validity is missing, we do not assume it still stands.",
      ],
    ],
    commitments: [
      ["One industry", "Built for the distinct roles and requirements of security."],
      ["Clear evidence", "We distinguish recorded, reviewed and source-confirmed information."],
      ["Human decisions", "AI provides decision support. People make the decisions."],
    ],
    finalH: "Built for trust you can understand.",
    finalBody: "Explore the roles, see how the platform works, or talk to us.",
    caption: "One connected path through a security career.",
    ai: "AI provides decision support. People make the decisions.",
  },
} as const;

function AboutPage() {
  const { lang } = useT();
  const c = copy[lang];
  return (
    <SiteLayout>
      <SectionBand tone="ivory">
        <SplitHero
          copy={
            <div>
              <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.eyebrow}</p>
              <h1 className="cq-h1 mt-5">{c.h1}</h1>
              <p className="cq-lede mt-6 text-[var(--cq-text-muted)]">{c.lede}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/career-center" className="cq-button-primary">
                  {c.explore}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link to="/contact" className="cq-button-secondary">
                  {c.contact}
                </Link>
              </div>
            </div>
          }
          scene={<ExplorerScene lang={lang} caption={c.caption} />}
        />
      </SectionBand>
      <SectionBand tone="ice">
        <TrustPath stages={c.commitments.map(([title, body]) => ({ title, body }))} />
      </SectionBand>
      <SectionBand tone="ivory">
        <div className="grid gap-x-12 gap-y-14 lg:grid-cols-2">
          {c.sections.map(([title, body], i) => (
            <article key={title} className="border-t border-[var(--cq-border)] pt-7">
              <span className="cq-eyebrow text-[var(--cq-blue-ink)]">0{i + 1}</span>
              <h2 className="cq-h3 mt-4">{title}</h2>
              <p className="cq-body mt-4 text-[var(--cq-text-muted)]">{body}</p>
              {i === 4 && (
                <p className="mt-5 flex items-center gap-2 font-semibold">
                  <Bot className="h-5 w-5 text-[var(--cq-blue)]" />
                  {c.ai}
                </p>
              )}
            </article>
          ))}
        </div>
      </SectionBand>
      <SectionBand tone="navy">
        <FinalCta>
          <ShieldCheck className="mx-auto h-8 w-8 text-[var(--cq-blue-soft)]" />
          <h2 className="cq-h2 mt-5">{c.finalH}</h2>
          <p className="cq-lede mt-5 text-[var(--cq-on-navy-muted)]">{c.finalBody}</p>
          <Link
            to="/contact"
            className="cq-button-secondary mt-8 border-white/30 bg-white text-[var(--cq-navy)]"
          >
            {c.contact}
          </Link>
        </FinalCta>
      </SectionBand>
    </SiteLayout>
  );
}
