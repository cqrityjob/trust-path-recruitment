// Security Passport — the one credential form.
//
// VU1, VU2, ordningsvaktsförordnande and skyddsvaktsförordnande are one
// form, not four: every difference between them is DATA on the taxonomy row
// (category, requires_valid_until, requires_issuer), so the form asks the
// row what to show and adding a fifth credential to the database changes
// this form with no code change. See lib/security-passport/credentials.ts
// for why the rules are deliberately not restated here.
//
// ── PROGRESSIVE DISCLOSURE, HONESTLY ───────────────────────────────────
//
// Nothing but the credential choice is shown until a credential is chosen,
// because the field set depends on the choice. A qualification asks who
// trained you and when you finished — and has NO expiry field at all,
// because VU1 does not expire and offering the field would invent one. An
// appointment asks who appointed you and until when, and the end date is
// marked required because a förordnande without one is not a förordnande.
//
// ── WHAT SAVING MEANS, IN WORDS ────────────────────────────────────────
//
// A draft is private and unfinished; adding to the Passport makes the entry
// real but still SELF-DECLARED. The form says both, and it also says the
// thing holders most often get wrong: uploading documentation later makes
// an entry DOCUMENTED, not approved — only a review can do that.
//
// ── PURE COMPONENT ─────────────────────────────────────────────────────
//
// No server import, no Supabase, no navigation. The route wires the
// callbacks; the dev harness wires fakes. That is what lets the whole form
// be exercised and reviewed against fixtures with no database.

import { useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  clearIncompatible,
  emptyCredentialDraft,
  fieldsFor,
  issuedOnLabelKey,
  issuerLabelKey,
  validateCredential,
  type CredentialDraft,
  type CredentialFieldError,
  type CredentialType,
} from "@/lib/security-passport/credentials";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { CredentialSymbol } from "./CredentialSymbol";

/** The jurisdictions the select offers. ISO 3166-1 alpha-2; Sweden first
 *  because the launch taxonomy is Swedish, never because others are less. */
/** One market the form may offer.
 *
 *  Structural rather than imported from the server module, so this component
 *  stays free of any database dependency — the same reason `CredentialType` is
 *  declared this way. The dev harness supplies its own list. */
export interface FormMarket {
  readonly marketPackCode: string;
  readonly jurisdictionCode: string;
  readonly subJurisdictionCode: string | null;
  readonly nameSv: string;
  readonly nameEn: string;
}

export interface CredentialFormProps {
  /** The taxonomy, from sp_credential_types (or fixtures in the harness). */
  readonly types: readonly CredentialType[];
  /** The markets a holder may record in, from the ACTIVE market packs.
   *
   *  This used to be a literal `["SE", "NO", "DK", "FI", "DE"]` in this file.
   *  Only the first existed in sp_jurisdictions, so four of the five options
   *  produced a foreign-key error — a controlled vocabulary whose control was
   *  a list nobody had reconciled with the database. Reading it from the packs
   *  means the form can only offer what the database will accept. */
  readonly markets: readonly FormMarket[];
  /** Resumed draft, or null for a fresh form. */
  readonly initial?: (CredentialDraft & { readonly id: string }) | null;
  /** Preselected credential code (e.g. arriving from an overview action). */
  readonly preselectCode?: string | null;
  readonly busy: boolean;
  readonly serverError: string | null;
  /** Set after a successful draft save; rendered as a quiet confirmation. */
  readonly savedAt: string | null;
  onSaveDraft: (draft: CredentialDraft) => void;
  onActivate: (draft: CredentialDraft) => void;
  /** Present only when resuming an existing draft. */
  onDiscard?: () => void;
  onCancel: () => void;
}

function fieldId(name: string): string {
  return `sp-cred-${name}`;
}

const inputClass =
  "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function FieldLabel({
  htmlFor,
  children,
  optional,
  optionalLabel,
}: {
  htmlFor: string;
  children: string;
  optional?: boolean;
  optionalLabel?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {children}
      {optional && optionalLabel ? (
        <span className="font-normal text-muted-foreground"> ({optionalLabel})</span>
      ) : null}
    </label>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 flex items-start gap-1 text-sm text-destructive">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}

export function CredentialForm({
  types,
  markets,
  initial = null,
  preselectCode = null,
  busy,
  serverError,
  savedAt,
  onSaveDraft,
  onActivate,
  onDiscard,
  onCancel,
}: CredentialFormProps) {
  const { pt, lang } = usePassportCopy();

  const [draft, setDraft] = useState<CredentialDraft>(() => {
    if (initial) return initial;
    const empty = emptyCredentialDraft();
    return preselectCode ? { ...empty, credentialCode: preselectCode } : empty;
  });
  const [errors, setErrors] = useState<readonly CredentialFieldError[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);

  const type = useMemo(
    () => types.find((t) => t.code === draft.credentialCode) ?? null,
    [types, draft.credentialCode],
  );
  const visible = type ? fieldsFor(type) : null;

  function set<K extends keyof CredentialDraft>(key: K, value: CredentialDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function errorFor(field: keyof CredentialDraft): string | null {
    const found = errors.find((e) => e.field === field);
    return found ? pt(found.messageKey) : null;
  }

  function describedBy(field: keyof CredentialDraft, helpId?: string): string | undefined {
    const ids: string[] = [];
    if (errorFor(field)) ids.push(`${fieldId(field)}-error`);
    if (helpId) ids.push(helpId);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  function trySubmit(mode: "draft" | "active") {
    const found = validateCredential(draft, type, mode);
    setErrors(found);
    if (found.length > 0) {
      // Move focus to the summary so keyboard and screen-reader users land
      // on the explanation, not silently back on the button.
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    if (mode === "draft") onSaveDraft(draft);
    else onActivate(draft);
  }

  const typeName = (t: CredentialType) => (lang === "sv" ? t.nameSv : t.nameEn);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        trySubmit("active");
      }}
      className="space-y-6"
    >
      {/* ── What everything here means, before anything is typed ────── */}
      <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
        {pt("cred.add.body")}
      </p>

      {/* ── Step 1: which credential ────────────────────────────────── */}
      <fieldset>
        <legend className="text-sm font-medium text-foreground">{pt("cred.select.label")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {types.map((t) => {
            const chosen = draft.credentialCode === t.code;
            return (
              <label
                key={t.code}
                className={cn(
                  // focus-within: the radio itself is visually hidden, so
                  // the card must carry the keyboard focus indicator.
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
                  chosen ? "border-accent bg-accent/5" : "border-border hover:bg-accent/5",
                )}
              >
                <input
                  type="radio"
                  name="sp-cred-code"
                  value={t.code}
                  checked={chosen}
                  onChange={() =>
                    setDraft((d) =>
                      // Values the new credential does not ask for are dropped,
                      // not merely hidden. A retained scope or end date would
                      // be submitted from a field the holder can no longer see.
                      clearIncompatible(
                        {
                          ...d,
                          credentialCode: t.code,
                          // The certificate name is almost always the taxonomy
                          // name, so it is prefilled — but stays editable, and a
                          // name the holder typed themselves is never replaced.
                          title:
                            d.title.trim() === "" ||
                            types.some((x) => d.title === x.nameSv || d.title === x.nameEn)
                              ? typeName(t)
                              : d.title,
                        },
                        t,
                      ),
                    )
                  }
                  className="sr-only"
                />
                <CredentialSymbol
                  code={t.code}
                  state="self_declared"
                  symbolLabel={t.symbolLabel}
                  name={typeName(t)}
                  size={40}
                  decorative
                  className="shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-foreground">
                    {typeName(t)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {pt(
                      t.category === "appointment"
                        ? "cred.category.appointment"
                        : "cred.category.qualification",
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <FieldError
          id={`${fieldId("credentialCode")}-error`}
          message={errorFor("credentialCode")}
        />
      </fieldset>

      {/* ── The rest appears once the choice decides what to ask ────── */}
      {type && visible ? (
        <>
          {/* The one sentence that stops the commonest misrepresentation:
              training is not an appointment, and an appointment ends. */}
          <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
            {pt(
              type.category === "appointment"
                ? "cred.appointment.notice"
                : "cred.qualification.notice",
            )}
          </p>

          <section aria-label={pt("cred.section.about")} className="space-y-4">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {pt("cred.section.about")}
            </h3>

            <div>
              <FieldLabel htmlFor={fieldId("title")}>{pt("cred.field.title")}</FieldLabel>
              <input
                id={fieldId("title")}
                type="text"
                maxLength={200}
                value={draft.title}
                placeholder={typeName(type)}
                aria-invalid={errorFor("title") ? true : undefined}
                aria-describedby={describedBy("title", `${fieldId("title")}-help`)}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass}
              />
              <p id={`${fieldId("title")}-help`} className="mt-1 text-xs text-muted-foreground">
                {pt("cred.field.titleHelp")}
              </p>
              <FieldError id={`${fieldId("title")}-error`} message={errorFor("title")} />
            </div>

            {visible.issuer ? (
              <div>
                <FieldLabel htmlFor={fieldId("issuerName")}>{pt(issuerLabelKey(type))}</FieldLabel>
                <input
                  id={fieldId("issuerName")}
                  type="text"
                  maxLength={160}
                  value={draft.issuerName}
                  aria-invalid={errorFor("issuerName") ? true : undefined}
                  aria-describedby={describedBy(
                    "issuerName",
                    type.category === "appointment" ? `${fieldId("issuerName")}-help` : undefined,
                  )}
                  onChange={(e) => set("issuerName", e.target.value)}
                  className={inputClass}
                />
                {type.category === "appointment" ? (
                  <p
                    id={`${fieldId("issuerName")}-help`}
                    className="mt-1 text-xs text-muted-foreground"
                  >
                    {pt("cred.field.authorityHelp")}
                  </p>
                ) : null}
                <FieldError
                  id={`${fieldId("issuerName")}-error`}
                  message={errorFor("issuerName")}
                />
              </div>
            ) : null}

            <div>
              <FieldLabel htmlFor={fieldId("jurisdictionCode")}>
                {pt("cred.field.jurisdiction")}
              </FieldLabel>
              <select
                id={fieldId("jurisdictionCode")}
                value={draft.jurisdictionCode}
                aria-invalid={errorFor("jurisdictionCode") ? true : undefined}
                aria-describedby={describedBy("jurisdictionCode")}
                onChange={(e) => set("jurisdictionCode", e.target.value)}
                className={cn(inputClass, "sm:w-64")}
              >
                {markets.map((m) => (
                  <option key={m.marketPackCode} value={m.jurisdictionCode}>
                    {lang === "sv" ? m.nameSv : m.nameEn}
                  </option>
                ))}
              </select>
              <FieldError
                id={`${fieldId("jurisdictionCode")}-error`}
                message={errorFor("jurisdictionCode")}
              />
              {/* `markets` is the ACTIVE market packs and nothing else, so an
                  unreviewed market is not merely discouraged here — it is not
                  in the list, and the claim trigger would refuse it anyway.
                  Saying which markets exist but are closed is what stops the
                  short list reading as an oversight. */}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {pt("jurisdiction.marketAvailability")}
              </p>
            </div>
          </section>

          <section aria-label={pt("cred.section.dates")} className="space-y-4">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {pt("cred.section.dates")}
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor={fieldId("issuedOn")}>{pt(issuedOnLabelKey(type))}</FieldLabel>
                <input
                  id={fieldId("issuedOn")}
                  type="date"
                  value={draft.issuedOn ?? ""}
                  aria-invalid={errorFor("issuedOn") ? true : undefined}
                  aria-describedby={describedBy("issuedOn")}
                  onChange={(e) => set("issuedOn", e.target.value || null)}
                  className={inputClass}
                />
                <FieldError id={`${fieldId("issuedOn")}-error`} message={errorFor("issuedOn")} />
              </div>

              {visible.validFrom ? (
                <div>
                  <FieldLabel
                    htmlFor={fieldId("validFrom")}
                    optional
                    optionalLabel={pt("common.optional")}
                  >
                    {pt("cred.field.validFrom")}
                  </FieldLabel>
                  <input
                    id={fieldId("validFrom")}
                    type="date"
                    value={draft.validFrom ?? ""}
                    aria-invalid={errorFor("validFrom") ? true : undefined}
                    aria-describedby={describedBy("validFrom", `${fieldId("validFrom")}-help`)}
                    onChange={(e) => set("validFrom", e.target.value || null)}
                    className={inputClass}
                  />
                  <p
                    id={`${fieldId("validFrom")}-help`}
                    className="mt-1 text-xs text-muted-foreground"
                  >
                    {pt("cred.field.validFromHelp")}
                  </p>
                  <FieldError
                    id={`${fieldId("validFrom")}-error`}
                    message={errorFor("validFrom")}
                  />
                </div>
              ) : null}

              {visible.validUntil ? (
                <div>
                  <FieldLabel htmlFor={fieldId("validUntil")}>
                    {type.requiresValidUntil
                      ? pt("cred.field.validUntilRequired")
                      : pt("cred.field.validUntil")}
                  </FieldLabel>
                  <input
                    id={fieldId("validUntil")}
                    type="date"
                    value={draft.validUntil ?? ""}
                    aria-invalid={errorFor("validUntil") ? true : undefined}
                    aria-describedby={describedBy("validUntil")}
                    onChange={(e) => set("validUntil", e.target.value || null)}
                    className={inputClass}
                  />
                  <FieldError
                    id={`${fieldId("validUntil")}-error`}
                    message={errorFor("validUntil")}
                  />
                </div>
              ) : null}
            </div>
          </section>

          {visible.scope ? (
            <section aria-label={pt("cred.field.scope")} className="space-y-4">
              <div>
                <FieldLabel htmlFor={fieldId("authorisationScope")}>
                  {pt("cred.field.scope")}
                </FieldLabel>
                <input
                  id={fieldId("authorisationScope")}
                  type="text"
                  maxLength={200}
                  value={draft.authorisationScope}
                  aria-invalid={errorFor("authorisationScope") ? true : undefined}
                  aria-describedby={describedBy(
                    "authorisationScope",
                    `${fieldId("authorisationScope")}-help`,
                  )}
                  onChange={(e) => set("authorisationScope", e.target.value)}
                  className={inputClass}
                />
                <p
                  id={`${fieldId("authorisationScope")}-help`}
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {pt("cred.field.scopeHelp")}
                </p>
                <FieldError
                  id={`${fieldId("authorisationScope")}-error`}
                  message={errorFor("authorisationScope")}
                />
              </div>
            </section>
          ) : null}

          <section aria-label={pt("cred.section.evidence")} className="space-y-4">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {pt("cred.section.evidence")}
            </h3>

            {visible.reference ? (
              <div>
                <FieldLabel
                  htmlFor={fieldId("credentialReference")}
                  optional
                  optionalLabel={pt("common.optional")}
                >
                  {pt("cred.field.reference")}
                </FieldLabel>
                <input
                  id={fieldId("credentialReference")}
                  type="text"
                  maxLength={120}
                  value={draft.credentialReference}
                  aria-invalid={errorFor("credentialReference") ? true : undefined}
                  aria-describedby={describedBy(
                    "credentialReference",
                    `${fieldId("credentialReference")}-help`,
                  )}
                  onChange={(e) => set("credentialReference", e.target.value)}
                  className={inputClass}
                />
                <p
                  id={`${fieldId("credentialReference")}-help`}
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {pt("cred.field.referenceHelp")}
                </p>
                <FieldError
                  id={`${fieldId("credentialReference")}-error`}
                  message={errorFor("credentialReference")}
                />
              </div>
            ) : null}

            {!visible.note ? (
              <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
                {pt("cred.field.narrowResultOnly")}
              </p>
            ) : (
              <div>
                <FieldLabel
                  htmlFor={fieldId("holderNote")}
                  optional
                  optionalLabel={pt("common.optional")}
                >
                  {pt("cred.field.holderNote")}
                </FieldLabel>
                <textarea
                  id={fieldId("holderNote")}
                  rows={3}
                  maxLength={2000}
                  value={draft.holderNote}
                  aria-invalid={errorFor("holderNote") ? true : undefined}
                  aria-describedby={describedBy("holderNote", `${fieldId("holderNote")}-help`)}
                  onChange={(e) => set("holderNote", e.target.value)}
                  className={cn(inputClass, "h-auto py-2.5")}
                />
                <p
                  id={`${fieldId("holderNote")}-help`}
                  className="mt-1 text-xs text-muted-foreground"
                >
                  {pt("cred.field.holderNoteHelp")}
                </p>
                <FieldError
                  id={`${fieldId("holderNote")}-error`}
                  message={errorFor("holderNote")}
                />
              </div>
            )}

            {/* Documentation ≠ approval, stated where documentation is first
                mentioned rather than discovered after an upload. */}
            <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
              {pt("cred.docsNotApproval")}
            </p>
            <p className="text-sm text-muted-foreground">{pt("cred.evidenceNext")}</p>
          </section>
        </>
      ) : null}

      {/* ── Errors, then actions ────────────────────────────────────── */}
      {errors.length > 0 ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/5 p-3"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle aria-hidden="true" className="h-4 w-4" />
            {pt("cred.errorSummary")}
          </p>
        </div>
      ) : null}

      {serverError ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      {savedAt ? (
        <p role="status" className="text-sm text-muted-foreground">
          {pt("cred.action.savedAt")} · {savedAt.slice(0, 16).replace("T", " ")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={busy || !type}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("cred.action.saving") : pt("cred.action.activate")}
        </button>
        <button
          type="button"
          disabled={busy || !type}
          onClick={() => trySubmit("draft")}
          className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("cred.action.saveDraft")}
        </button>
        {onDiscard ? (
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            className="inline-flex h-11 items-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("cred.action.discard")}
          </button>
        ) : null}
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
