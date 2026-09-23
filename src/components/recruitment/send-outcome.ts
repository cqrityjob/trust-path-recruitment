// What a send attempt did, as the sentence the recruiter reads. Kept out of the
// component files so they export components only.

import type { TranslationKey } from "@/i18n/dictionaries";
import type { SendOutcome } from "@/lib/recruitment/recruitment.functions";
import { recruitmentErrorKey } from "@/components/recruitment/errors";

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
