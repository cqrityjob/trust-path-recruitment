// The Passport card never prints an address it was not given.
//
// Run via `bun run passport-recipient-card:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// `verifyUrl` on this card is a PUBLIC verification address -- /p/<token>,
// the thing a stranger opens to check a Passport is real. The employer
// application panel passed window.location.href instead, so the card printed
// the employer's own internal deep link, application id and all, in small
// type across the bottom of a card designed to be looked at and screenshotted.
//
// A customer reported it as "konstig text under passport". It was worse than
// odd: an application id rendered into a picture, on a surface whose entire
// promise is that the holder controls what is shown about them.
//
// The fix made `verifyUrl` optional and the footer conditional. This asserts
// both halves, because either could regress alone: a required prop would push
// the next caller into inventing an address, and an unconditional footer would
// print an empty label under a rule.

import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { RecipientPassportCard } from "../src/components/security-passport/live/RecipientPassportCard";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";
import type { RecipientPayloadActive } from "../src/lib/security-passport/packages";

// The exact shape the employer application panel receives: one application
// share, two verified credentials, a named holder.
const payload = {
  status: "active",
  package: "employer_application",
  focus: "passport",
  purpose: null,
  expires_at: "2026-09-22",
  authorised_at: "2026-08-23",
  last_updated: "2026-08-23",
  holder: "Mostafa Alshawi",
  privacy_mode: "full_name",
  profession_slug: "security-officer",
  jurisdiction: "SE",
  verified_claims: [
    {
      id: "c1",
      title: "OV",
      assertion: "verified",
      lifecycle: "active",
      valid_until: null,
      verifier_organisation: "CQrityjob",
      kind: "credential",
    },
    {
      id: "c2",
      title: "Skyddsvaktsförordnande",
      assertion: "verified",
      lifecycle: "active",
      valid_until: null,
      verifier_organisation: "CQrityjob",
      kind: "credential",
    },
  ],
  verified_experience: [],
  verified_experience_days: 0,
} as unknown as RecipientPayloadActive;

const presentation = buildRecipientPresentation(payload, "2026-08-23");
const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const withUrl = html(
  <RecipientPassportCard presentation={presentation} verifyUrl="cqrityjob.example/p/abc123" />,
);
const without = html(<RecipientPassportCard presentation={presentation} />);
const strip = (s: string) => s.replace(/xmlns="[^"]*"/g, "");

const fails: string[] = [];
const ck = (n: string, ok: boolean) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${n}`);
  if (!ok) fails.push(n);
};

ck("address given: address renders", withUrl.includes("cqrityjob.example/p/abc123"));
ck(
  "address given: verify label renders",
  /Kontrollera aktuell status|Check current status/.test(withUrl),
);
ck(
  "no address: nothing URL-shaped renders",
  !/https?:\/\/|cqrityjob\.example/.test(strip(without)),
);
ck(
  "no address: dangling verify label gone",
  !/Kontrollera aktuell status|Check current status/.test(without),
);
ck("no address: no /employer/ deep link — the reported defect", !without.includes("/employer/"));
ck(
  "no address: no uuid-shaped id leaks",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(strip(without)),
);
ck("card still renders the holder", without.includes("Mostafa Alshawi"));
ck("card still renders the credentials", without.includes("Skyddsvaktsf"));

console.log(fails.length ? `\nFAILED: ${fails.join(", ")}` : "\nPASS");
process.exit(fails.length ? 1 : 0);
