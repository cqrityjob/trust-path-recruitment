// Security Passport — structured entry forms for employment and claims.
//
// Pure components: no server import, no navigation. The route supplies the
// callbacks, the harness supplies fakes. That is what lets the whole entry
// experience be reviewed against fixtures with no database.
//
// ── WHY THESE ARE STRUCTURED, NOT FREE TEXT ────────────────────────────
//
// A Passport entry is going to be checked by somebody. "Väktare, Securitas,
// 2019–2022" typed into one box cannot be verified, cannot be de-duplicated
// against an overlapping period, and cannot carry the FTE and
// security-relevance fractions the experience calculation needs. So every
// field the domain actually uses has its own input, and the ones the
// calculation would otherwise have to guess — relevance and extent — are
// asked explicitly rather than inferred.
//
// ── ONGOING EMPLOYMENT IS A CHECKBOX, NOT AN EMPTY DATE ────────────────
//
// "Still employed" is a fact, and leaving the end date blank is ambiguous
// between "ongoing" and "not filled in yet". The checkbox makes the holder
// say which, and the end date disappears when it is ticked.

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type {
  ClaimEntry,
  ExperienceEntry,
  FreeClaimKind,
} from "@/lib/security-passport/entries.functions";

const inputClass =
  "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {help ? (
        <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 flex items-start gap-1 text-sm text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Employment                                                          */
/* ------------------------------------------------------------------ */

export interface ExperienceDraft {
  id: string | null;
  employerName: string;
  roleTitle: string;
  employmentType: "full_time" | "part_time" | "hourly" | "temporary";
  fteFraction: number;
  securityRelevance: "primary" | "partial" | "none";
  securityFraction: number;
  startedOn: string;
  endedOn: string | null;
  ongoing: boolean;
  jurisdictionCode: string;
}

export function emptyExperienceDraft(): ExperienceDraft {
  return {
    id: null,
    employerName: "",
    roleTitle: "",
    employmentType: "full_time",
    fteFraction: 1,
    securityRelevance: "primary",
    securityFraction: 1,
    startedOn: "",
    endedOn: null,
    ongoing: true,
    jurisdictionCode: "SE",
  };
}

export function experienceToDraft(e: ExperienceEntry): ExperienceDraft {
  return {
    id: e.id,
    employerName: e.employerName,
    roleTitle: e.roleTitle,
    employmentType: e.employmentType as ExperienceDraft["employmentType"],
    fteFraction: e.fteFraction,
    securityRelevance: e.securityRelevance as ExperienceDraft["securityRelevance"],
    securityFraction: e.securityFraction,
    startedOn: e.startedOn,
    endedOn: e.endedOn,
    ongoing: e.endedOn === null,
    jurisdictionCode: e.jurisdictionCode,
  };
}

export function validateExperience(d: ExperienceDraft): Partial<Record<string, PassportCopyKey>> {
  const errors: Partial<Record<string, PassportCopyKey>> = {};
  if (d.employerName.trim() === "") errors.employerName = "entry.error.employerRequired";
  if (d.roleTitle.trim() === "") errors.roleTitle = "entry.error.roleRequired";
  if (!ISO.test(d.startedOn)) errors.startedOn = "entry.error.startRequired";
  if (!d.ongoing) {
    if (!d.endedOn || !ISO.test(d.endedOn)) errors.endedOn = "entry.error.endRequired";
    else if (ISO.test(d.startedOn) && d.endedOn <= d.startedOn)
      errors.endedOn = "entry.error.endBeforeStart";
  }
  if (d.securityRelevance === "partial" && !(d.securityFraction > 0 && d.securityFraction < 1)) {
    errors.securityFraction = "entry.error.fractionRange";
  }
  return errors;
}

export function ExperienceForm({
  draft,
  onChange,
  errors,
  busy,
  onSave,
  onCancel,
}: {
  draft: ExperienceDraft;
  onChange: (next: ExperienceDraft) => void;
  errors: Partial<Record<string, PassportCopyKey>>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { pt } = usePassportCopy();
  const set = <K extends keyof ExperienceDraft>(k: K, v: ExperienceDraft[K]) =>
    onChange({ ...draft, [k]: v });
  const err = (k: string) => (errors[k] ? pt(errors[k]) : null);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exp-employer" label={pt("entry.emp.employer")} error={err("employerName")}>
          <input
            id="exp-employer"
            type="text"
            maxLength={160}
            value={draft.employerName}
            aria-invalid={err("employerName") ? true : undefined}
            onChange={(e) => set("employerName", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id="exp-role" label={pt("entry.emp.role")} error={err("roleTitle")}>
          <input
            id="exp-role"
            type="text"
            maxLength={160}
            value={draft.roleTitle}
            aria-invalid={err("roleTitle") ? true : undefined}
            onChange={(e) => set("roleTitle", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exp-start" label={pt("entry.emp.startedOn")} error={err("startedOn")}>
          <input
            id="exp-start"
            type="date"
            value={draft.startedOn}
            aria-invalid={err("startedOn") ? true : undefined}
            onChange={(e) => set("startedOn", e.target.value)}
            className={inputClass}
          />
        </Field>
        <div>
          <div className="flex items-start gap-2.5 pt-7">
            <input
              id="exp-ongoing"
              type="checkbox"
              checked={draft.ongoing}
              onChange={(e) =>
                onChange({
                  ...draft,
                  ongoing: e.target.checked,
                  endedOn: e.target.checked ? null : (draft.endedOn ?? ""),
                })
              }
              className="mt-0.5 h-5 w-5 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <label htmlFor="exp-ongoing" className="text-sm leading-relaxed text-foreground">
              {pt("entry.emp.ongoing")}
            </label>
          </div>
          {!draft.ongoing ? (
            <Field id="exp-end" label={pt("entry.emp.endedOn")} error={err("endedOn")}>
              <input
                id="exp-end"
                type="date"
                value={draft.endedOn ?? ""}
                aria-invalid={err("endedOn") ? true : undefined}
                onChange={(e) => set("endedOn", e.target.value || null)}
                className={inputClass}
              />
            </Field>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exp-type" label={pt("entry.emp.employmentType")}>
          <select
            id="exp-type"
            value={draft.employmentType}
            onChange={(e) =>
              set("employmentType", e.target.value as ExperienceDraft["employmentType"])
            }
            className={inputClass}
          >
            {(["full_time", "part_time", "hourly", "temporary"] as const).map((v) => (
              <option key={v} value={v}>
                {pt(`entry.emp.type.${v}` as PassportCopyKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="exp-fte" label={pt("entry.emp.extent")} help={pt("entry.emp.extentHelp")}>
          <select
            id="exp-fte"
            value={String(draft.fteFraction)}
            onChange={(e) => set("fteFraction", Number(e.target.value))}
            className={inputClass}
          >
            {[1, 0.75, 0.5, 0.25].map((v) => (
              <option key={v} value={String(v)}>
                {Math.round(v * 100)}%
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Relevance is asked, never inferred from the job title: a receptionist
          with security duties and a Väktare are not the same thing, and
          guessing would fabricate or erase experience. */}
      <Field
        id="exp-relevance"
        label={pt("entry.emp.relevance")}
        help={pt("entry.emp.relevanceHelp")}
        error={err("securityFraction")}
      >
        <select
          id="exp-relevance"
          value={draft.securityRelevance}
          onChange={(e) => {
            const v = e.target.value as ExperienceDraft["securityRelevance"];
            onChange({
              ...draft,
              securityRelevance: v,
              securityFraction: v === "primary" ? 1 : v === "none" ? 0 : 0.5,
            });
          }}
          className={inputClass}
        >
          {(["primary", "partial", "none"] as const).map((v) => (
            <option key={v} value={v}>
              {pt(`entry.emp.relevance.${v}` as PassportCopyKey)}
            </option>
          ))}
        </select>
      </Field>

      {draft.securityRelevance === "partial" ? (
        <Field
          id="exp-fraction"
          label={pt("entry.emp.securityShare")}
          help={pt("entry.emp.securityShareHelp")}
        >
          <select
            id="exp-fraction"
            value={String(draft.securityFraction)}
            onChange={(e) => set("securityFraction", Number(e.target.value))}
            className={inputClass}
          >
            {[0.75, 0.5, 0.25].map((v) => (
              <option key={v} value={String(v)}>
                {Math.round(v * 100)}%
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("entry.saving") : pt("entry.save")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex h-11 items-center px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Free-text claims                                                    */
/* ------------------------------------------------------------------ */

export interface ClaimDraft {
  id: string | null;
  claimType: FreeClaimKind;
  title: string;
  issuerName: string;
  jurisdictionCode: string;
  issuedOn: string | null;
  validUntil: string | null;
  expires: boolean;
}

export function emptyClaimDraft(kind: FreeClaimKind): ClaimDraft {
  return {
    id: null,
    claimType: kind,
    title: "",
    issuerName: "",
    jurisdictionCode: "SE",
    issuedOn: null,
    validUntil: null,
    expires: false,
  };
}

export function claimToDraft(c: ClaimEntry): ClaimDraft {
  return {
    id: c.id,
    claimType: c.claimType as FreeClaimKind,
    title: c.title,
    issuerName: c.issuerName ?? "",
    jurisdictionCode: c.jurisdictionCode ?? "SE",
    issuedOn: c.issuedOn,
    validUntil: c.validUntil,
    expires: c.validUntil !== null,
  };
}

export function validateClaim(d: ClaimDraft): Partial<Record<string, PassportCopyKey>> {
  const errors: Partial<Record<string, PassportCopyKey>> = {};
  if (d.title.trim() === "") errors.title = "entry.error.titleRequired";
  if (d.issuedOn && !ISO.test(d.issuedOn)) errors.issuedOn = "cred.error.dateFormat";
  if (d.expires) {
    if (!d.validUntil || !ISO.test(d.validUntil)) errors.validUntil = "entry.error.endRequired";
    else if (d.issuedOn && ISO.test(d.issuedOn) && d.validUntil < d.issuedOn)
      errors.validUntil = "cred.error.endBeforeStart";
  }
  return errors;
}

/** The label a claim kind's "who issued it" field should carry. A school, an
 *  issuing body and a training provider are not the same thing, and one
 *  generic "Issuer" makes the form read as a database screen. */
function issuerLabelFor(kind: FreeClaimKind): PassportCopyKey {
  switch (kind) {
    case "education":
      return "entry.claim.school";
    case "training":
      return "cred.field.trainingProvider";
    case "certification":
      return "entry.claim.certBody";
    case "professional_membership":
      return "entry.claim.organisation";
    case "specialisation":
      return "entry.claim.confirmedBy";
  }
}

export function ClaimEntryForm({
  draft,
  onChange,
  errors,
  busy,
  onSave,
  onCancel,
}: {
  draft: ClaimDraft;
  onChange: (next: ClaimDraft) => void;
  errors: Partial<Record<string, PassportCopyKey>>;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { pt } = usePassportCopy();
  const set = <K extends keyof ClaimDraft>(k: K, v: ClaimDraft[K]) =>
    onChange({ ...draft, [k]: v });
  const err = (k: string) => (errors[k] ? pt(errors[k]) : null);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="space-y-4"
    >
      <Field
        id="claim-title"
        label={pt("entry.claim.title")}
        help={pt("entry.claim.titleHelp")}
        error={err("title")}
      >
        <input
          id="claim-title"
          type="text"
          maxLength={200}
          value={draft.title}
          aria-invalid={err("title") ? true : undefined}
          onChange={(e) => set("title", e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field id="claim-issuer" label={pt(issuerLabelFor(draft.claimType))}>
        <input
          id="claim-issuer"
          type="text"
          maxLength={160}
          value={draft.issuerName}
          onChange={(e) => set("issuerName", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="claim-issued" label={pt("entry.claim.completedOn")} error={err("issuedOn")}>
          <input
            id="claim-issued"
            type="date"
            value={draft.issuedOn ?? ""}
            aria-invalid={err("issuedOn") ? true : undefined}
            onChange={(e) => set("issuedOn", e.target.value || null)}
            className={inputClass}
          />
        </Field>
        <div>
          <div className="flex items-start gap-2.5 pt-7">
            <input
              id="claim-expires"
              type="checkbox"
              checked={draft.expires}
              onChange={(e) =>
                onChange({
                  ...draft,
                  expires: e.target.checked,
                  validUntil: e.target.checked ? (draft.validUntil ?? "") : null,
                })
              }
              className="mt-0.5 h-5 w-5 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            {/* Opt-in, so nothing invents an expiry for a qualification that
                does not have one. */}
            <label htmlFor="claim-expires" className="text-sm leading-relaxed text-foreground">
              {pt("entry.claim.hasExpiry")}
            </label>
          </div>
          {draft.expires ? (
            <Field id="claim-until" label={pt("cred.field.validUntil")} error={err("validUntil")}>
              <input
                id="claim-until"
                type="date"
                value={draft.validUntil ?? ""}
                aria-invalid={err("validUntil") ? true : undefined}
                onChange={(e) => set("validUntil", e.target.value || null)}
                className={inputClass}
              />
            </Field>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("entry.saving") : pt("entry.save")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={cn(
            "inline-flex h-11 items-center px-2 text-sm font-medium text-muted-foreground hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {pt("common.cancel")}
        </button>
      </div>
    </form>
  );
}
