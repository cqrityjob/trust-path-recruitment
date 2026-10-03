// A mailto to the one address that always reaches CQrityjob.
//
// The address is CONTACT_EMAIL (src/lib/contact/contact-address.ts), the same one
// /contact shows beside its form and in its closed state, so it works whatever the
// form is doing. Pages that tell somebody to "contact us" -- a rejected
// organisation, a removed member, an organisation waiting for review -- used to
// say so and offer nowhere to write to.
//
// The organisation's name rides in the subject when there is one, so whoever
// reads the mail knows which case it is without asking.

import { useT } from "@/i18n/context";
import { CONTACT_EMAIL } from "@/lib/contact/contact-address";

export function ContactMailto({ organisationName }: { organisationName?: string }) {
  const { t } = useT();
  const subject = [t("employer.contact.subject"), organisationName].filter(Boolean).join(": ");
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
      className="font-medium text-accent hover:underline"
      data-testid="employer-contact-mailto"
    >
      {CONTACT_EMAIL}
    </a>
  );
}
