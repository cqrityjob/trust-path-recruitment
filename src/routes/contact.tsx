import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, type FormEvent } from "react";
import { CheckCircle2, Info, Lock } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import {
  ENQUIRY_LIMITS,
  ENQUIRY_SERVICES,
  isEnquiryService,
  type EnquiryService,
} from "@/lib/contact/recruitment-enquiry";
import {
  getRecruitmentEnquiryAvailability,
  sendRecruitmentEnquiry,
} from "@/lib/contact/recruitment-enquiry.functions";

// ── CONTACT: A RECRUITMENT ENQUIRY THAT ACTUALLY ARRIVES (2026-09-30) ────
//
// The one contact action on the public site — "Kontakta oss" on the
// homepage's services band and on /employers — lands here. The form sends
// through the product's existing mail transport (Resend, the same secrets
// the employer registration notice uses) to CQrityjob's configured inbox,
// with the enquirer's address as reply-to. Nothing is stored in the
// platform and nothing new is bought.
//
// ── IT NEVER PRETENDS ─────────────────────────────────────────────────
//
// Before drawing a form, the page asks the server whether mail is
// configured at all. When it is not, the page says the form is not open and
// offers the platform instead — no form is drawn that sends nothing. After a
// send, "Tack – er förfrågan är skickad" is shown only when the provider
// ACCEPTED the message.

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
  validateSearch: (raw: Record<string, unknown>): { service?: EnquiryService } =>
    isEnquiryService(raw.service) ? { service: raw.service } : {},
  component: ContactPage,
});

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; key: TranslationKey };

function ContactPage() {
  const { t, lang } = useT();
  useLocalizedHead("meta.contact.title", "contact.lead");
  const search = Route.useSearch();
  const checkAvailability = useServerFn(getRecruitmentEnquiryAvailability);
  const send = useServerFn(sendRecruitmentEnquiry);
  const availability = useQuery({
    queryKey: ["recruitment-enquiry-availability"],
    queryFn: () => checkAvailability(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const [service, setService] = useState<EnquiryService>(search.service ?? "recruitment");
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const ids = {
    name: useId(),
    organisation: useId(),
    email: useId(),
    message: useId(),
    hint: useId(),
    error: useId(),
    website: useId(),
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !organisation.trim() || !email.trim()) {
      setPhase({ kind: "error", key: "contact.error.required" });
      return;
    }
    if (!EMAIL_SHAPE.test(email.trim())) {
      setPhase({ kind: "error", key: "contact.error.email" });
      return;
    }
    setPhase({ kind: "sending" });
    try {
      const result = await send({
        data: {
          service,
          name,
          organisation,
          email,
          message,
          language: lang === "en" ? "en" : "sv",
          website,
        },
      });
      if (result.status === "sent") setPhase({ kind: "sent", email: email.trim() });
      else if (result.status === "rate_limited")
        setPhase({ kind: "error", key: "contact.error.rateLimited" });
      else if (result.status === "closed") {
        // Back to idle so the button is usable again if the form reopens.
        setPhase({ kind: "idle" });
        void availability.refetch();
      }
      else setPhase({ kind: "error", key: "contact.error.failed" });
    } catch {
      setPhase({ kind: "error", key: "contact.error.failed" });
    }
  };

  const open = availability.data?.open === true;
  const closed = availability.isError || availability.data?.open === false;

  return (
    <SiteLayout>
      <Section className="py-16 md:py-24">
        <div className="mx-auto max-w-2xl">
          <h1
            className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("contact.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t("contact.lead")}
          </p>

          {availability.isLoading ? (
            <p role="status" className="mt-8 text-sm text-muted-foreground">
              {t("contact.checking")}
            </p>
          ) : closed ? (
            <div
              role="status"
              data-contact-closed
              className="mt-8 rounded-xl border border-border bg-muted/50 p-6"
            >
              <p className="flex items-start gap-3 text-base font-semibold text-foreground">
                <Info className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                {t("contact.closed.title")}
              </p>
              <p className="mt-2 pl-7 text-sm leading-relaxed text-muted-foreground">
                {t("contact.closed.body")}
              </p>
              <div className="mt-4 pl-7">
                <Link
                  to="/employers"
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {t("nav.forEmployers.platform")}
                </Link>
              </div>
            </div>
          ) : phase.kind === "sent" ? (
            <div
              role="status"
              data-contact-sent
              className="mt-8 rounded-xl border border-border bg-card p-6"
            >
              <p className="flex items-start gap-3 text-lg font-semibold text-foreground">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                {t("contact.sent.title")}
              </p>
              <p className="mt-2 pl-8 text-sm leading-relaxed text-muted-foreground">
                {t("contact.sent.body").replace("{email}", phase.email)}
              </p>
            </div>
          ) : open ? (
            <form
              noValidate
              onSubmit={(e) => void onSubmit(e)}
              data-contact-form
              aria-describedby={phase.kind === "error" ? ids.error : undefined}
              className="mt-8 space-y-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-xs)] md:p-8"
            >
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">
                  {t("contact.service.legend")}
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {ENQUIRY_SERVICES.map((key) => (
                    <label
                      key={key}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                    >
                      <input
                        type="radio"
                        name="service"
                        value={key}
                        checked={service === key}
                        onChange={() => setService(key)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      {t(`contact.service.${key}` as TranslationKey)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={ids.name} label={t("contact.field.name")}>
                  <Input
                    id={ids.name}
                    autoComplete="name"
                    required
                    maxLength={ENQUIRY_LIMITS.name}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11"
                  />
                </Field>
                <Field id={ids.organisation} label={t("contact.field.organisation")}>
                  <Input
                    id={ids.organisation}
                    autoComplete="organization"
                    required
                    maxLength={ENQUIRY_LIMITS.organisation}
                    value={organisation}
                    onChange={(e) => setOrganisation(e.target.value)}
                    className="h-11"
                  />
                </Field>
              </div>
              <Field id={ids.email} label={t("contact.field.email")}>
                <Input
                  id={ids.email}
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={ENQUIRY_LIMITS.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                />
              </Field>
              <Field id={ids.message} label={t("contact.field.message")}>
                <Textarea
                  id={ids.message}
                  rows={5}
                  maxLength={ENQUIRY_LIMITS.message}
                  aria-describedby={ids.hint}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <p id={ids.hint} className="mt-1.5 text-xs text-muted-foreground">
                  {t("contact.field.messageHint")}
                </p>
              </Field>

              {/* Out of sight and out of the accessibility tree: a person
                  never fills this in, so a value means a bot. */}
              <div
                aria-hidden="true"
                className="absolute -left-[10000px] h-px w-px overflow-hidden"
              >
                <label htmlFor={ids.website}>Website</label>
                <input
                  id={ids.website}
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t("contact.privacy")}
              </p>

              {phase.kind === "error" && (
                <p id={ids.error} role="alert" className="text-sm font-medium text-destructive">
                  {t(phase.key)}
                </p>
              )}

              <Button
                type="submit"
                className="min-h-11 w-full sm:w-auto"
                disabled={phase.kind === "sending"}
              >
                {phase.kind === "sending" ? t("contact.sending") : t("contact.submit")}
              </Button>
            </form>
          ) : null}

          <p className="mt-8 text-sm text-muted-foreground">
            {t("contact.platform.lead")}{" "}
            <Link
              to="/employers"
              hash="how-it-works"
              className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline"
            >
              {t("employers.cta.how")}
            </Link>
          </p>
        </div>
      </Section>
    </SiteLayout>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
