/**
 * ONE real e-mail through the product's own transport, to ONE explicitly
 * named, owner-approved test address -- so that delivery is proven by a
 * message in a mailbox, not by an API answering 200.
 *
 * What it sends: the recruitment test invitation exactly as "Skicka test"
 * produces it (src/lib/recruitment/message-templates.ts), through
 * sendRecruitmentMessageEmail (src/lib/email/send-recruitment-message-email.server.ts),
 * i.e. the same Resend HTTP call, headers and idempotency the product uses.
 * Nothing is written to any database and no candidate exists.
 *
 * What it refuses: any run without an explicit --to address AND
 * --approved-by <name>, the two Resend variables the product itself needs,
 * and any address on a domain other than the one given with --allow-domain.
 * There is no default recipient, no address book, no batch mode.
 *
 *   RESEND_API_KEY=... RESEND_FROM_EMAIL=... PUBLIC_SITE_URL=https://... \
 *   bun run scripts/email/real-delivery-probe.ts \
 *     --to owner+cqrityjob-test@example.com --allow-domain example.com \
 *     --approved-by "<owner name>" [--language sv|en]
 *
 * Outcome to record in docs/release/2026-09-26-auth-confirmation-email-owner-actions.md:
 * the provider answer printed here AND, separately, whether the message
 * arrived in the mailbox (subject, time, sender as shown by the mail client).
 * "sent" below means accepted by the provider -- nothing more.
 */
import { testInvitationMessage } from "../../src/lib/recruitment/message-templates";
import { sendRecruitmentMessageEmail } from "../../src/lib/email/send-recruitment-message-email.server";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const to = arg("to");
const allowDomain = arg("allow-domain");
const approvedBy = arg("approved-by");
const language = (arg("language") ?? "sv") as "sv" | "en";
const missing = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "PUBLIC_SITE_URL"].filter(
  (k) => !process.env[k],
);

if (!to || !allowDomain || !approvedBy || missing.length > 0 || !["sv", "en"].includes(language)) {
  console.error(
    [
      "refused: this probe sends a real e-mail and needs every one of these, explicitly:",
      `  --to <address>            ${to ? "given" : "MISSING"}`,
      `  --allow-domain <domain>   ${allowDomain ? "given" : "MISSING"}`,
      `  --approved-by <name>      ${approvedBy ? "given" : "MISSING"}`,
      `  --language sv|en          ${language}`,
      `  environment               ${missing.length ? "missing " + missing.join(", ") : "present"}`,
    ].join("\n"),
  );
  process.exit(2);
}
if (!to.toLowerCase().endsWith(`@${allowDomain.toLowerCase()}`)) {
  console.error(`refused: ${to} is not on the allowed domain ${allowDomain}`);
  process.exit(2);
}

const message = testInvitationMessage({
  language,
  candidateName: null,
  employerName: "CQrityjob (leveransprov)",
  jobTitle:
    language === "sv" ? "Leveransprov av testinbjudan" : "Delivery probe of a test invitation",
  assessmentName:
    language === "sv"
      ? "Väktare – Recruitment Assessment (leveransprov)"
      : "Security Officer – Recruitment Assessment (delivery probe)",
  academyUrl: `${process.env.PUBLIC_SITE_URL!.replace(/\/$/, "")}/academy`,
});

const startedAt = new Date().toISOString();
const result = await sendRecruitmentMessageEmail({
  recipientEmail: to,
  language,
  employerName: "CQrityjob (leveransprov)",
  jobTitle: message.subject,
  subject: `[LEVERANSPROV ${startedAt}] ${message.subject}`,
  body: `${message.body}\n\nDetta är ett leveransprov beställt av ${approvedBy} ${startedAt}. Ingen kandidat, ingen rekrytering.`,
  link: "/academy",
  siteOrigin: process.env.PUBLIC_SITE_URL!,
  idempotencyKey: `delivery-probe:${startedAt}`,
});

console.log(
  JSON.stringify(
    {
      probe: "recruitment-test-invitation",
      to,
      approvedBy,
      startedAt,
      from: process.env.RESEND_FROM_EMAIL,
      providerResult: result,
      meaning:
        result.result === "sent"
          ? "ACCEPTED BY THE PROVIDER. Not yet delivered: confirm in the mailbox and record subject, time and sender."
          : "NOT ACCEPTED. Nothing to look for in the mailbox.",
    },
    null,
    2,
  ),
);
process.exit(result.result === "sent" ? 0 : 1);
