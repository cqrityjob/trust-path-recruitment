// What a send attempt did, as the sentence the recruiter reads. Kept out of the
// component files so they export components only.

import type { TranslationKey } from "@/i18n/dictionaries";
import type { SendOutcome } from "@/lib/recruitment/recruitment.functions";
import { recruitmentErrorKey } from "@/components/recruitment/errors";

/** What a receipt's e-mail retry did, in the recruiter's words. */
export function receiptOutcomeText(
  t: (k: TranslationKey) => string,
  outcome: string,
  code: string | null,
  windowOpen: boolean | null = null,
): string {
  switch (outcome) {
    case "sent":
      return t("rec.send.deliveredEmailSent");
    case "not_configured":
      return t("rec.send.deliveredEmailNotConfigured");
    case "failed":
      return t("rec.send.deliveredEmailFailed");
    case "already_sent":
      return t("rec.send.alreadySent");
    case "in_progress":
      return t("rec.send.inProgress");
    case "none":
      return t("rec.receipt.noneForApplication");
    case "refused":
      return t(recruitmentErrorKey(code));
    case "unknown":
      // Outside the provider's window nothing was sent: the person is told
      // why, and that a resend needs their explicit acceptance.
      return windowOpen === false
        ? t("rec.send.deliveredEmailUnknownClosed")
        : t("rec.send.deliveredEmailUnknown");
    default:
      return t("rec.send.deliveredEmailUnknown");
  }
}

export function outcomeText(
  t: (k: TranslationKey) => string,
  o: SendOutcome,
): { tone: "ok" | "warn"; text: string } {
  if (o.delivery === "refused") return { tone: "warn", text: t(recruitmentErrorKey(o.code)) };
  if (o.delivery === "in_progress") return { tone: "warn", text: t("rec.send.inProgress") };
  if (o.delivery === "already_sent") return { tone: "ok", text: t("rec.send.alreadySent") };
  switch (o.email) {
    case "sent":
      return { tone: "ok", text: t("rec.send.deliveredEmailSent") };
    case "not_configured":
      return { tone: "warn", text: t("rec.send.deliveredEmailNotConfigured") };
    case "failed":
      return { tone: "warn", text: t("rec.send.deliveredEmailFailed") };
    default:
      return { tone: "warn", text: t("rec.send.deliveredEmailUnknown") };
  }
}
