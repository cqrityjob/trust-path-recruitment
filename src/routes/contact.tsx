import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — CQrityjob" },
      {
        name: "description",
        content: "Get in touch with CQrityjob about recruitment, verification and assessment.",
      },
      { property: "og:title", content: "Contact — CQrityjob" },
      {
        property: "og:description",
        content: "Reach out about partnering with CQrityjob.",
      },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t } = useT();
  return (
    <SiteLayout>
      <Section>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-5">
          <div className="md:col-span-2">
            <h1
              className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("contact.title")}
            </h1>
            <p className="mt-6 text-muted-foreground">{t("contact.lead")}</p>
          </div>

          <form
            className="md:col-span-3"
            onSubmit={(e) => {
              e.preventDefault();
            }}
            aria-describedby="contact-preview-notice"
          >
            <div
              id="contact-preview-notice"
              className="mb-6 flex items-start gap-3 rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground"
            >
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} />
              <p>{t("contact.preview_notice")}</p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label={t("contact.form.name")} name="name" />
              <Field label={t("contact.form.email")} name="email" type="email" />
              <div className="sm:col-span-2">
                <Field label={t("contact.form.company")} name="company" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("contact.form.message")}
                </label>
                <textarea
                  name="message"
                  rows={6}
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent"
                />
              </div>
            </div>
            <div className="mt-8">
              <PrimaryButton type="submit">{t("contact.form.submit")}</PrimaryButton>
            </div>
          </form>
        </div>
      </Section>
    </SiteLayout>
  );
}

function Field({
  label,
  name,
  type = "text",
}: {
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        name={name}
        type={type}
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent"
      />
    </div>
  );
}