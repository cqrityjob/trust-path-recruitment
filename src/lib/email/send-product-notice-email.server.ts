// The product notices that leave the app as e-mail (slots 20270316090000 and
// 20270318090000): a Passport review that waits for someone, and a contact
// request between an organisation and a discoverable person.
//
// Same transport as every sender here: the `transactional-email` Edge
// Function, kind `product_notice` -- From CQrityjob, no Reply-To, no
// organisation display name (CQrityjob writes; nobody replies to this mail).
//
// ── WHAT IS IN THE MAIL, AND WHAT NEVER IS ─────────────────────────────
//
// What happened and where to read it. Never a document, a credential number,
// a review note, the holder's own text, a message body or a person's name.
// The two talent kinds name the organisation and the vacancy title (both
// public on the job board); nothing else about either party. The TYPE below has
// no field for anything more, and product-notice-email:check renders with
// hostile values.
//
// Links are built from the site origin (serverSiteOrigin) and fixed paths;
// ids of an unexpected shape fall back to the product's front door.

import { sendTransactionalEmail } from "@/lib/email/transport.server";
import { classifyProviderResponse } from "@/lib/email/send-recruitment-message-email.server";

export const PRODUCT_NOTICE_KINDS = [
  "passport_review_requested",
  "passport_clarification_answered",
  "passport_clarification_requested",
  "passport_decision_approved",
  "passport_decision_rejected",
  "passport_verification_revoked",
  "talent_contact_received",
  "talent_contact_accepted",
  "talent_contact_declined",
] as const;
export type ProductNoticeKind = (typeof PRODUCT_NOTICE_KINDS)[number];

export function isProductNoticeKind(value: string): value is ProductNoticeKind {
  return (PRODUCT_NOTICE_KINDS as readonly string[]).includes(value);
}

export type ProductNoticeParams = {
  kind: ProductNoticeKind;
  language: "sv" | "en";
  siteOrigin: string;
  /** claim / experience / contact id, for the link only. */
  subjectType: "claim" | "experience" | "request" | "contact";
  subjectId: string;
  /** Talent kinds only: public facts. */
  employerName?: string | null;
  jobTitle?: string | null;
  jobId?: string | null;
  employerSlug?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]{0,100}$/;
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u001f\u007f\u2028\u2029]+/g;

function oneLine(value: string | null | undefined, max: number): string {
  const cleaned = String(value ?? "")
    .replace(CONTROLS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Where the reader acts. Exported for the guard. */
export function productNoticeLink(p: ProductNoticeParams): string {
  const origin = p.siteOrigin.replace(/\/$/, "");
  switch (p.kind) {
    case "passport_review_requested":
    case "passport_clarification_answered":
      return `${origin}/passport-review`;
    case "passport_clarification_requested":
    case "passport_decision_approved":
    case "passport_decision_rejected":
    case "passport_verification_revoked": {
      if (
        !UUID.test(p.subjectId) ||
        (p.subjectType !== "claim" && p.subjectType !== "experience")
      ) {
        return `${origin}/passport`;
      }
      return `${origin}/passport/entry/${p.subjectType}/${p.subjectId}#sp-entry-verification`;
    }
    case "talent_contact_received":
      return `${origin}/passport/discoverability#contacts`;
    case "talent_contact_accepted":
    case "talent_contact_declined":
      if (p.employerSlug && SLUG.test(p.employerSlug) && p.jobId && UUID.test(p.jobId)) {
        return `${origin}/employer/${encodeURIComponent(p.employerSlug)}/jobs/${p.jobId}/talent?tab=contacts`;
      }
      return `${origin}/employer`;
  }
}

const COPY = {
  sv: {
    passport_review_requested: {
      subject: "Ett Passport-ärende väntar på granskning",
      lead: "En merit har skickats in för dokumentgranskning.",
      cta: "Öppna granskningskön",
    },
    passport_clarification_answered: {
      subject: "Svar på en komplettering väntar",
      lead: "En innehavare har svarat på en begärd komplettering. Ärendet är tillbaka i kön.",
      cta: "Öppna granskningskön",
    },
    passport_clarification_requested: {
      subject: "Komplettering behövs för en merit i ditt Passport",
      lead: "Granskaren behöver mer information för att kunna granska en av dina meriter.",
      cta: "Läs vad som behövs och svara",
    },
    passport_decision_approved: {
      subject: "Din merit är dokumentgranskad",
      lead: "CQrityjob har granskat underlaget för en av dina meriter. Granskningen avser dokumentet, inte en bekräftelse från utfärdaren.",
      cta: "Visa meriten",
    },
    passport_decision_rejected: {
      subject: "Granskningen av en merit kunde inte godkännas",
      lead: "Underlaget räckte inte för att godkänna granskningen. Läs motiveringen och vad du kan göra.",
      cta: "Läs beslutet",
    },
    passport_verification_revoked: {
      subject: "En granskning i ditt Passport har återkallats",
      lead: "En tidigare granskning av en av dina meriter gäller inte längre.",
      cta: "Läs mer",
    },
    talent_contact_received: {
      subject: (org: string) => `${org} vill komma i kontakt med dig`,
      lead: (org: string, job: string) =>
        `${org} har sett din sökbara profil och vill komma i kontakt med dig om tjänsten ${job}. Du väljer själv om du vill svara.`,
      cta: "Läs förfrågan",
    },
    talent_contact_accepted: {
      subject: (job: string) => `Kontaktförfrågan accepterad: ${job}`,
      lead: (job: string) => `En person har accepterat er kontaktförfrågan om tjänsten ${job}.`,
      cta: "Öppna kontaktförfrågningar",
    },
    talent_contact_declined: {
      subject: (job: string) => `Kontaktförfrågan avböjd: ${job}`,
      lead: (job: string) => `En person har avböjt er kontaktförfrågan om tjänsten ${job}.`,
      cta: "Öppna kontaktförfrågningar",
    },
    footer: "Du får det här meddelandet från CQrityjob. Svara inte på det här mejlet.",
  },
  en: {
    passport_review_requested: {
      subject: "A Passport case is waiting for review",
      lead: "A credential has been submitted for document review.",
      cta: "Open the review queue",
    },
    passport_clarification_answered: {
      subject: "An answer to a clarification is waiting",
      lead: "A holder has answered a requested clarification. The case is back in the queue.",
      cta: "Open the review queue",
    },
    passport_clarification_requested: {
      subject: "More information is needed for a credential in your Passport",
      lead: "The reviewer needs more information to review one of your credentials.",
      cta: "Read what is needed and reply",
    },
    passport_decision_approved: {
      subject: "Your credential has been document-reviewed",
      lead: "CQrityjob has reviewed the documentation for one of your credentials. The review concerns the document, not a confirmation from the issuer.",
      cta: "View the credential",
    },
    passport_decision_rejected: {
      subject: "The review of a credential could not be approved",
      lead: "The documentation was not enough to approve the review. Read the reason and what you can do.",
      cta: "Read the decision",
    },
    passport_verification_revoked: {
      subject: "A review in your Passport has been revoked",
      lead: "An earlier review of one of your credentials no longer applies.",
      cta: "Read more",
    },
    talent_contact_received: {
      subject: (org: string) => `${org} would like to get in touch`,
      lead: (org: string, job: string) =>
        `${org} has seen your discoverable profile and would like to get in touch about the position ${job}. You decide whether to answer.`,
      cta: "Read the request",
    },
    talent_contact_accepted: {
      subject: (job: string) => `Contact request accepted: ${job}`,
      lead: (job: string) =>
        `A person has accepted your contact request about the position ${job}.`,
      cta: "Open contact requests",
    },
    talent_contact_declined: {
      subject: (job: string) => `Contact request declined: ${job}`,
      lead: (job: string) =>
        `A person has declined your contact request about the position ${job}.`,
      cta: "Open contact requests",
    },
    footer: "This message is from CQrityjob. Please do not reply to this e-mail.",
  },
} as const;

/** Exactly what the recipient gets, sending nothing. Exported for the guard. */
export function renderProductNotice(p: ProductNoticeParams): {
  subject: string;
  text: string;
  html: string;
  link: string;
} {
  const lang = p.language === "en" ? "en" : "sv";
  const copy = COPY[lang];
  const org = oneLine(p.employerName, 80) || "CQrityjob";
  const job = oneLine(p.jobTitle, 120) || (lang === "en" ? "a vacancy" : "en tjänst");
  const link = productNoticeLink(p);
  let subject: string;
  let lead: string;
  let cta: string;
  switch (p.kind) {
    case "talent_contact_received":
      subject = copy.talent_contact_received.subject(org);
      lead = copy.talent_contact_received.lead(org, job);
      cta = copy.talent_contact_received.cta;
      break;
    case "talent_contact_accepted":
    case "talent_contact_declined":
      subject = copy[p.kind].subject(job);
      lead = copy[p.kind].lead(job);
      cta = copy[p.kind].cta;
      break;
    default:
      subject = copy[p.kind].subject;
      lead = copy[p.kind].lead;
      cta = copy[p.kind].cta;
  }
  subject = oneLine(subject, 200);
  const text = [lead, "", `${cta}: ${link}`, "", copy.footer, ""].join("\n");
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <p style="margin: 0 0 12px;">${escapeHtml(lead)}</p>
      <p style="margin-top: 20px;"><a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #0b3d91; color: #ffffff; text-decoration: none; font-weight: 600;">${escapeHtml(cta)}</a></p>
      <p style="font-size: 12px; color: #888; margin-top: 20px;">${escapeHtml(copy.footer)}</p>
    </div>
  `;
  return { subject, text, html, link };
}

/**
 * Test environments: when PRODUCT_EMAIL_RECIPIENT_ALLOWLIST is set (comma
 * separated; exact addresses or `@domain` suffixes), a recipient outside it is
 * NOT sent to. Unset in production means no restriction. Exported for the guard.
 */
export function recipientAllowed(
  email: string,
  allowlist = process.env.PRODUCT_EMAIL_RECIPIENT_ALLOWLIST,
): boolean {
  if (!allowlist || allowlist.trim() === "") return true;
  const address = email.trim().toLowerCase();
  return allowlist
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith("@") ? address.endsWith(entry) : address === entry));
}

export type ProductNoticeEmailResult =
  | { result: "sent"; status: number }
  | { result: "failed"; status: number }
  | { result: "unknown"; status: number }
  | { result: "not_configured" }
  | { result: "not_allowlisted" };

export async function sendProductNoticeEmail(
  params: ProductNoticeParams & {
    recipientEmail: string;
    idempotencyKey: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<ProductNoticeEmailResult> {
  if (!recipientAllowed(params.recipientEmail)) return { result: "not_allowlisted" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 10_000);
  try {
    const { subject, html, text } = renderProductNotice(params);
    const res = await sendTransactionalEmail({
      kind: "product_notice",
      to: params.recipientEmail,
      subject,
      html,
      text,
      idempotencyKey: params.idempotencyKey,
      signal: controller.signal,
      fetchImpl: params.fetchImpl,
    });
    if (res.notConfigured) return { result: "not_configured" };
    const classified = classifyProviderResponse(res.status);
    if (classified.result === "sent") return { result: "sent", status: res.status };
    console.error("[send-product-notice-email] provider answered", res.status);
    return { result: classified.result, status: res.status };
  } catch (err) {
    const aborted =
      controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    console.error(
      "[send-product-notice-email]",
      aborted ? "timed out; outcome unknown" : "could not run",
    );
    return { result: "unknown", status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
