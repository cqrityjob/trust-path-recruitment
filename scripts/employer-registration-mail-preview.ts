/**
 * Exactly what the two registration emails will say, written to disk.
 *
 * Run: bun run employer-registration-mail:preview
 *      PUBLIC_SITE_URL=https://cqrityjob.com bun run employer-registration-mail:preview
 *
 * ── WHY A PREVIEW AND NOT A TEST SEND ──────────────────────────────────
 *
 * The messages have to be readable, and every link in them has to be checked,
 * BEFORE a provider key exists anywhere — and certainly before one is handed
 * to a developer machine. This renders the real functions the product calls,
 * so what you read here is what a company and an administrator receive; it
 * makes no network call, needs no key, and reads no secret.
 *
 * It prints every link it finds, because the links are the part a preview is
 * actually for: the applicant's goes to the status page, the administrator's
 * to the registration behind an administrator sign-in, and both are built
 * from PUBLIC_SITE_URL. Pass that variable to see the addresses a given
 * deployment will really produce.
 *
 * The values below are obviously fictitious and are never sent anywhere.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderEmployerRegistrationAdminEmail,
  renderEmployerRegistrationReceivedEmail,
} from "../src/lib/email/send-employer-registration-email.server";
import { SITE_ORIGIN } from "../src/lib/job-intelligence/seo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "artifacts", "employer-registration-mail");
mkdirSync(outDir, { recursive: true });

const siteOrigin = process.env.PUBLIC_SITE_URL || SITE_ORIGIN;
const employerId = "00000000-0000-0000-0000-0000000000ff";
const companyName = "Provvakt Sakerhet AB";
const contactName = "Test Testsson";
const contactEmail = "kontakt@example.test";

function links(html: string): string[] {
  return Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
}

function emit(file: string, label: string, subject: string, html: string): void {
  const target = path.join(outDir, file);
  writeFileSync(target, html, "utf8");
  console.log(`\n${label}`);
  console.log(`  subject : ${subject}`);
  console.log(`  file    : ${path.relative(root, target)}`);
  for (const href of links(html)) console.log(`  link    : ${href}`);
}

console.log(`Site origin in use: ${siteOrigin}`);
console.log(
  process.env.PUBLIC_SITE_URL
    ? "  (from PUBLIC_SITE_URL)"
    : "  (SITE_ORIGIN fallback — set PUBLIC_SITE_URL to preview a specific deployment)",
);

for (const language of ["sv", "en"] as const) {
  const { subject, html } = renderEmployerRegistrationReceivedEmail({
    recipientEmail: contactEmail,
    language,
    companyName,
    contactName,
    siteOrigin,
  });
  emit(`applicant.${language}.html`, `To the company (${language})`, subject, html);
}

{
  const { subject, html } = renderEmployerRegistrationAdminEmail({
    recipientEmail: "admin@example.test",
    companyName,
    companyCountry: "Sverige",
    contactName,
    contactEmail,
    employerId,
    siteOrigin,
  });
  emit("admin.html", "To the configured administrator address", subject, html);
}

console.log(
  "\nNothing was sent. The administrator link requires an administrator sign-in;\n" +
    "holding it grants nothing.\n",
);
