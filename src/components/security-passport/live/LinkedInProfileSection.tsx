// Security Passport — "Lägg till i LinkedIn-profil".
//
// Distinct from LinkedInShareSection, which prepares a POST. This prepares a
// PROFILE ENTRY: a permanent line under Licenses & Certifications or
// Education, with the holder's live verification URL attached.
//
// ── WHY TWO ROWS AND NOT A LIST OF CREDENTIALS ─────────────────────────
//
// The holder is choosing a LinkedIn section, not browsing their Passport —
// they already know what they hold. So the default surface is exactly the
// two actions the product decision names, and the eligible credentials
// appear when one is opened. A holder with six verified credentials does not
// meet six rows before they have decided anything.
//
// ── WHAT IS PROMISED ───────────────────────────────────────────────────
//
// Nothing that LinkedIn does not do. The parameters are sent, the fields are
// shown, and the copy says plainly that LinkedIn may not fill them in. See
// src/lib/security-passport/linkedin-profile.ts for why only verified,
// active credentials are offered at all.

import { useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Linkedin } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  linkedInProfileEntries,
  type LinkedInProfileEntry,
  type LinkedInProfileTarget,
} from "@/lib/security-passport/linkedin-profile";
import type { PassportHolder } from "@/lib/security-passport/types";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

/** LinkedIn blue, used only on the mark so the row is recognisable at a
 *  glance. Everything else stays CQrityjob's own palette. */
const LINKEDIN_BLUE = "#0A66C2";

function EntryCard({ entry }: { entry: LinkedInProfileEntry }) {
  const { pt } = usePassportCopy();
  const [copied, setCopied] = useState(false);

  async function copyFields() {
    const text = entry.fields.map((f) => `${pt(f.labelKey)}: ${f.value}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <p className="text-sm font-medium text-foreground">{entry.name}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{entry.organisation}</p>

      <dl className="mt-3 grid gap-2 rounded-md border border-border bg-secondary/30 p-3 sm:grid-cols-2">
        {entry.fields.map((f) => (
          <div key={f.labelKey} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt(f.labelKey)}
            </dt>
            <dd className="mt-0.5 break-all text-sm text-foreground">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyFields()}
          className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Copy aria-hidden="true" className="h-4 w-4" />
          )}
          {copied ? pt("lip.copied") : pt("lip.copyFields")}
        </button>
        <a
          href={entry.addUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          {pt("lip.openLinkedIn")}
        </a>
      </div>
    </li>
  );
}

function TargetRow({
  target,
  entries,
  labelKey,
  emptyKey,
}: {
  target: LinkedInProfileTarget;
  entries: readonly LinkedInProfileEntry[];
  labelKey: PassportCopyKey;
  emptyKey: PassportCopyKey;
}) {
  const { pt } = usePassportCopy();

  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-4 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
        <Linkedin
          aria-hidden="true"
          className="h-5 w-5 shrink-0"
          style={{ color: LINKEDIN_BLUE }}
        />
        <span className="min-w-0 flex-1">{pt(labelKey)}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {entries.length}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="px-5 pb-5">
        {entries.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{pt(emptyKey)}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">{pt("lip.prefillNote")}</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt(target === "certification" ? "lip.certGroup" : "lip.eduGroup")}
            </p>
            <ul className="mt-2 space-y-3">
              {entries.map((entry) => (
                <EntryCard key={entry.claimId} entry={entry} />
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

export function LinkedInProfileSection({
  holder,
  shareUrl,
}: {
  readonly holder: PassportHolder;
  readonly shareUrl: string;
}) {
  const { pt, lang } = usePassportCopy();
  const entries = linkedInProfileEntries(holder, shareUrl, lang);
  const certifications = entries.filter((e) => e.target === "certification");
  const educations = entries.filter((e) => e.target === "education");

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="px-5 pb-1 pt-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {pt("lip.title")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt("lip.lead")}</p>
      </div>

      <div className="mt-3">
        <TargetRow
          target="certification"
          entries={certifications}
          labelKey="lip.addCert"
          emptyKey="lip.noneCert"
        />
        <TargetRow
          target="education"
          entries={educations}
          labelKey="lip.addEdu"
          emptyKey="lip.noneEdu"
        />
      </div>
    </section>
  );
}
