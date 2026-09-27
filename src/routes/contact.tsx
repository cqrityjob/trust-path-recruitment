import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";

// ── CONTACT IS NOT OPEN YET (MVP text specification §12.4) ───────────────
//
// There is no staffed address and no send path, so the page says exactly
// that. The form that sent nothing is gone rather than disabled: an active
// "Skicka" gave the impression that contact worked, and a greyed-out form
// invites the reader to type a message that has nowhere to go. No address,
// response time or sales process is invented here; a verified contact route
// is connected separately, when one exists.

const SV = dictionaries.sv;

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: SV["meta.contact.title"] },
      { name: "description", content: SV["contact.lead"] },
      { property: "og:title", content: SV["meta.contact.title"] },
      { property: "og:description", content: SV["contact.lead"] },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t } = useT();
  useLocalizedHead("meta.contact.title", "contact.lead");
  return (
    <SiteLayout>
      <Section>
        <div className="max-w-2xl">
          <h1
            className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("contact.title")}
          </h1>
          <p
            role="status"
            data-contact-closed
            className="mt-6 flex items-start gap-3 rounded-md border border-border bg-muted/50 p-4 text-base text-foreground"
          >
            <Info
              className="mt-1 h-4 w-4 shrink-0 text-accent"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>{t("contact.lead")}</span>
          </p>
        </div>
      </Section>
    </SiteLayout>
  );
}
