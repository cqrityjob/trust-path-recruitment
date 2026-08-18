// Dev-harness host for the structured entry forms and the experience mark.
// Scaffolding for review, not product: the live page wires these to the
// server, this wires them to component state so the whole entry experience
// is reviewable offline, in both languages, at 375px.

import { useState } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { DAYS_PER_YEAR } from "@/lib/security-passport/experience";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  ClaimEntryForm,
  ExperienceForm,
  emptyClaimDraft,
  emptyExperienceDraft,
  validateClaim,
  validateExperience,
  type ClaimDraft,
  type ExperienceDraft,
} from "./EntryForms";
import { ExperienceMark } from "./ExperienceMark";

const BANDS: readonly { label: string; verified: number; self: number }[] = [
  { label: "none — nothing verified yet", verified: 0, self: 4 * DAYS_PER_YEAR },
  { label: "early — 1 verified year", verified: 1 * DAYS_PER_YEAR, self: 3 * DAYS_PER_YEAR },
  { label: "established — 5 verified years", verified: 5 * DAYS_PER_YEAR, self: 5 * DAYS_PER_YEAR },
  { label: "senior — 12 verified years", verified: 12 * DAYS_PER_YEAR, self: 12 * DAYS_PER_YEAR },
];

export function EntryFixture() {
  const { pt } = usePassportCopy();
  const [exp, setExp] = useState<ExperienceDraft>(emptyExperienceDraft());
  const [expErrors, setExpErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [claim, setClaim] = useState<ClaimDraft>(emptyClaimDraft("education"));
  const [claimErrors, setClaimErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("info.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("info.lead")}</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("exp.verifiedLabel")}
        </h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {BANDS.map((b) => (
            <div key={b.label} className="rounded-lg border border-border p-4">
              <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                {b.label}
              </p>
              <ExperienceMark verifiedDays={b.verified} selfDeclaredDays={b.self} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("info.employment")}
        </h3>
        <div className="mt-4">
          <ExperienceForm
            draft={exp}
            onChange={setExp}
            errors={expErrors}
            busy={false}
            onSave={() => {
              const e = validateExperience(exp);
              setExpErrors(e);
              if (Object.keys(e).length === 0) setSaved(pt("entry.saved"));
            }}
            onCancel={() => {
              setExp(emptyExperienceDraft());
              setExpErrors({});
            }}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("claims.type.education")}
        </h3>
        <div className="mt-4">
          <ClaimEntryForm
            draft={claim}
            onChange={setClaim}
            errors={claimErrors}
            busy={false}
            onSave={() => {
              const e = validateClaim(claim);
              setClaimErrors(e);
              if (Object.keys(e).length === 0) setSaved(pt("entry.saved"));
            }}
            onCancel={() => {
              setClaim(emptyClaimDraft("education"));
              setClaimErrors({});
            }}
          />
        </div>
      </section>

      {saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          {saved}
        </p>
      ) : null}
    </div>
  );
}
