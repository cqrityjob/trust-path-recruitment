import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Clock3, Mail, ShieldCheck } from "lucide-react";
import { SectionBand } from "@/components/patterns/SectionBand";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Kontakta CQrityjob — säkerhetsbranschens plattform" },
      {
        name: "description",
        content:
          "Kontakta CQrityjob om karriär, rekrytering och kompetens inom säkerhetsbranschen.",
      },
      { property: "og:title", content: "Kontakta CQrityjob" },
      { property: "og:description", content: "En direkt väg till CQrityjob." },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/contact" }],
  }),
  component: ContactPage,
});

const copy = {
  sv: {
    eye: "Kontakt",
    h1: "Låt oss börja med det ni faktiskt behöver.",
    lede: "Har du en fråga om CQrityjob, vill du följa utvecklingen eller undersöker du ett problem inom karriär, rekrytering eller kompetens? Skriv direkt till oss.",
    action: "Mejla info@cqrityjob.com",
    direct: "Direkt väg",
    directBody:
      "Ditt mejl går till CQrityjob. Ingen kontaktförfrågan försvinner i ett formulär som inte skickar.",
    response: "Svar",
    responseBody: "Du får normalt svar inom två arbetsdagar.",
    trust: "Förtroende först",
    trustBody:
      "Skicka inte säkerhetskänsliga personuppgifter, behörighetsunderlag eller andra skyddsvärda uppgifter i ett vanligt mejl.",
    subject: "Kontakt från cqrityjob.com",
  },
  en: {
    eye: "Contact",
    h1: "Let us start with what you actually need.",
    lede: "Have a question about CQrityjob, want to follow the work, or are you exploring a problem in security careers, recruitment or competence? Write to us directly.",
    action: "Email info@cqrityjob.com",
    direct: "Direct route",
    directBody:
      "Your email goes to CQrityjob. No enquiry disappears into a form that does not send.",
    response: "Response",
    responseBody: "You will normally receive a reply within two working days.",
    trust: "Trust first",
    trustBody:
      "Do not send security-sensitive personal data, authorisation records or other protected information in a regular email.",
    subject: "Contact from cqrityjob.com",
  },
} as const;

function ContactPage() {
  const { lang } = useT();
  const c = copy[lang];
  const mailto = `mailto:info@cqrityjob.com?subject=${encodeURIComponent(c.subject)}`;
  return (
    <SiteLayout>
      <SectionBand tone="navy" className="relative overflow-hidden">
        <div className="max-w-4xl">
          <p className="cq-eyebrow text-[var(--cq-blue-soft)]">{c.eye}</p>
          <h1 className="cq-h1 mt-5">{c.h1}</h1>
          <p className="cq-lede mt-6 max-w-2xl text-[var(--cq-on-navy-muted)]">{c.lede}</p>
          <a
            href={mailto}
            className="cq-button-secondary mt-8 border-white/30 bg-white text-[var(--cq-navy)]"
          >
            {c.action}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </a>
        </div>
      </SectionBand>
      <SectionBand tone="ivory">
        <div className="grid gap-5 md:grid-cols-3">
          <ContactCard icon={Mail} title={c.direct} body={c.directBody} />
          <ContactCard icon={Clock3} title={c.response} body={c.responseBody} />
          <ContactCard icon={ShieldCheck} title={c.trust} body={c.trustBody} />
        </div>
        <div className="mt-12 rounded-2xl border border-[var(--cq-border)] bg-[var(--cq-ice)] p-7 sm:p-9">
          <p className="cq-eyebrow text-[var(--cq-blue-ink)]">CQrityjob</p>
          <a
            href={mailto}
            className="cq-h2 mt-4 block break-words underline decoration-[var(--cq-blue)] decoration-2 underline-offset-8"
          >
            info@cqrityjob.com
          </a>
        </div>
      </SectionBand>
    </SiteLayout>
  );
}

function ContactCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Mail;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--cq-border)] bg-white p-7 shadow-sm">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--cq-ice)] text-[var(--cq-blue)]">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="cq-h3 mt-6">{title}</h2>
      <p className="cq-body mt-3 text-[var(--cq-text-muted)]">{body}</p>
    </article>
  );
}
