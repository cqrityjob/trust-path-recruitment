import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, CircleDashed, ShieldCheck } from "lucide-react";
import { FinalCta } from "@/components/patterns/FinalCta";
import { SectionBand } from "@/components/patterns/SectionBand";
import { SplitHero } from "@/components/patterns/SplitHero";
import { ApplicationScene } from "@/components/patterns/scenes/ApplicationScene";
import { InterviewScene } from "@/components/patterns/scenes/InterviewScene";
import { JobHubScene } from "@/components/patterns/scenes/JobHubScene";
import { ReportScene } from "@/components/patterns/scenes/ReportScene";
import { TrainingScene } from "@/components/patterns/scenes/TrainingScene";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/employers")({
  head: () => ({
    meta: [
      { title: "För arbetsgivare — så bygger CQrityjob för säkerhetsbranschen" },
      {
        name: "description",
        content:
          "Rekrytering, kompetensbedömning, strukturerade intervjuer och kompetensutveckling — byggda för säkerhetsbranschen och släppta i tur och ordning.",
      },
      { property: "og:title", content: "För arbetsgivare — CQrityjob" },
      {
        property: "og:description",
        content: "Fyra tjänster byggda för säkerhetsbranschens arbetsgivare.",
      },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/employers" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/employers" }],
  }),
  component: EmployersPage,
});

const copy = {
  sv: {
    eye: "För arbetsgivare",
    h1: "Så bygger CQrityjob för säkerhetsbranschens arbetsgivare",
    lede: "Fyra tjänster som utgår från samma underlag: rekrytering, kompetensbedömning, strukturerade intervjuer och kompetensutveckling. Vi beskriver en tjänst som tillgänglig först när den är det.",
    contact: "Kontakta oss",
    caption: "Från rollens krav till ett tydligare beslutsunderlag.",
    start: "Utgångsläget",
    startBody:
      "Rekrytering inom säkerhet har sina särskilda krav. Vissa roller är reglerade eller omfattas av särskilda villkor, ansvaret är verkligt och underlaget behöver hålla. I dag ligger kandidaternas erfarenhet, behörigheter och utbildningar ofta i olika format och på olika ställen.",
    services: "Fyra tjänster",
    building: "Under uppbyggnad",
    tiles: [
      [
        "Rekrytering",
        "Publicera roller, ta emot ansökningar och se kandidatens registrerade uppgifter samlade på ett ställe.",
      ],
      [
        "Kompetensbedömning",
        "Strukturerat beslutsstöd för jobbrelevant kompetens, med redovisad metod och version.",
      ],
      [
        "Strukturerade intervjuer",
        "Förbered, genomför och dokumentera intervjun mot rollens faktiska krav.",
      ],
      [
        "Kompetensutveckling",
        "Tilldela utbildningsprogram och följ hur många som pågår, är klara och finns tillgängliga.",
      ],
    ],
    limitsH: "Vad CQrityjob inte gör",
    limits:
      "CQrityjob rangordnar inte kandidater inför anställningsbeslut och lämnar inga omdömen om lämplighet. Där underlagsinformation finns visar vi vad den består av; när den saknas hittar vi inte på någon. CQrityjob ersätter inte tillstånd, licens, bakgrundskontroll eller due diligence.",
    ai: "AI ger beslutsstöd. Människor fattar besluten.",
    finalH: "Börja med samtalet, inte en säljpresentation.",
    finalBody:
      "Berätta vilket problem ni försöker lösa. Vi säger tydligt vad som finns i dag och vad som fortfarande byggs.",
  },
  en: {
    eye: "For employers",
    h1: "What CQrityjob is building for security employers",
    lede: "Four services working from the same record: recruitment, competence assessment, structured interviews and workforce development. We describe a service as available only once it is.",
    contact: "Contact us",
    caption: "From role requirements to a clearer basis for decisions.",
    start: "The starting point",
    startBody:
      "Security recruitment has requirements of its own. Some roles are regulated or subject to specific conditions, the responsibility is real, and the basis for a decision has to hold up. Today a candidate's experience, authorisations and training often sit in different formats and different places.",
    services: "Four services",
    building: "In development",
    tiles: [
      [
        "Recruitment",
        "Publish roles, receive applications, and see the candidate's recorded information gathered in one place.",
      ],
      [
        "Assessment",
        "Structured decision support for job-relevant competence, with a stated method and version.",
      ],
      [
        "Structured interviews",
        "Prepare, run and document the interview against the role's actual requirements.",
      ],
      [
        "Workforce development",
        "Assign training programmes and track how many are in progress, completed and available.",
      ],
    ],
    limitsH: "What CQrityjob does not do",
    limits:
      "CQrityjob does not rank candidates for hiring decisions and does not judge anyone's suitability. Where supporting information exists we show what it consists of; where it is missing we do not invent any. CQrityjob is not a substitute for a permit, a licence, background screening or due diligence.",
    ai: "AI provides decision support. People make the decisions.",
    finalH: "Start with the conversation, not a sales presentation.",
    finalBody:
      "Tell us which problem you are trying to solve. We will be clear about what exists today and what is still being built.",
  },
} as const;

function EmployersPage() {
  const { lang } = useT();
  const c = copy[lang];
  const scenes = [<JobHubScene />, <ReportScene />, <InterviewScene />, <TrainingScene />];
  return (
    <SiteLayout>
      <SectionBand tone="ivory">
        <SplitHero
          copy={
            <div>
              <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.eye}</p>
              <h1 className="cq-h1 mt-5">{c.h1}</h1>
              <p className="cq-lede mt-6 text-[var(--cq-text-muted)]">{c.lede}</p>
              <Link to="/contact" className="cq-button-primary mt-8">
                {c.contact}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          }
          scene={<ApplicationScene caption={c.caption} />}
        />
      </SectionBand>
      <SectionBand tone="ice">
        <div className="max-w-[var(--cq-w-prose)]">
          <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.start}</p>
          <h2 className="cq-h2 mt-4">{c.start}</h2>
          <p className="cq-lede mt-6 text-[var(--cq-text-muted)]">{c.startBody}</p>
        </div>
      </SectionBand>
      <SectionBand tone="ivory">
        <p className="cq-eyebrow text-[var(--cq-blue-ink)]">{c.services}</p>
        <h2 className="cq-h2 mt-4">{c.services}</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {c.tiles.map(([title, body], i) => (
            <article
              key={title}
              className="flex min-h-full flex-col rounded-2xl border border-[var(--cq-border)] bg-white p-5 shadow-sm"
            >
              <div className="min-h-40">{scenes[i]}</div>
              <span className="cq-caption mt-6 inline-flex items-center gap-2 text-[var(--cq-blue-ink)]">
                <CircleDashed className="h-4 w-4" />
                {c.building}
              </span>
              <h3 className="cq-h3 mt-3">{title}</h3>
              <p className="cq-body mt-3 text-[var(--cq-text-muted)]">{body}</p>
            </article>
          ))}
        </div>
      </SectionBand>
      <SectionBand tone="navy">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ShieldCheck className="h-7 w-7 text-[var(--cq-blue-soft)]" />
            <h2 className="cq-h2 mt-5">{c.limitsH}</h2>
            <p className="cq-body mt-6 text-[var(--cq-on-navy-muted)]">{c.limits}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-7 lg:col-span-5">
            <Bot className="h-6 w-6 text-[var(--cq-blue-soft)]" />
            <p className="cq-h3 mt-5">{c.ai}</p>
          </div>
        </div>
      </SectionBand>
      <SectionBand tone="ice">
        <FinalCta>
          <h2 className="cq-h2">{c.finalH}</h2>
          <p className="cq-lede mt-5 text-[var(--cq-text-muted)]">{c.finalBody}</p>
          <Link to="/contact" className="cq-button-primary mt-8">
            {c.contact}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </FinalCta>
      </SectionBand>
    </SiteLayout>
  );
}
