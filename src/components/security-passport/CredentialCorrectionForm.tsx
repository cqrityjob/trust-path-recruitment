// Security Passport — correcting a recorded credential.
//
// A correction is not an edit. The database RPC creates a NEW version,
// marks the old one superseded and keeps both — and if what is being
// asserted changes, the new version starts over as self-declared with no
// verifier attribution. This form says all of that in words BEFORE the
// holder submits, because losing a verification seal must never come as a
// surprise.
//
// Every field arrives prefilled with the current values: the RPC treats
// each parameter as a full replacement, so "unchanged" must be sent as the
// same value rather than as absence (see correctionInput in
// passport.functions.ts). Pure component; the route wires the server.

import { useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { Claim } from "@/lib/security-passport/types";

export interface CorrectionValues {
  readonly title: string;
  readonly issuerName: string;
  readonly jurisdictionCode: string;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  readonly credentialReference: string;
  readonly holderNote: string;
  /** What the authorisation is limited to. Only asked for when the credential
   *  type says so, and owned by the holder — a reviewer may approve, reject or
   *  request clarification, never silently edit it. */
  readonly authorisationScope: string;
  readonly reason: string;
}

const inputClass =
  "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CredentialCorrectionForm({
  claim,
  privateFields,
  requiresScope,
  busy,
  serverError,
  onSubmit,
  onCancel,
}: {
  claim: Claim;
  privateFields: { credentialReference: string | null; holderNote: string | null };
  /** Straight from the taxonomy row via `fieldsFor`, not a list in this file.
   *  A legacy claim stored before the column existed has no scope, and this is
   *  where the holder supplies it — correction is the only route, and it was
   *  closed until 20260908090000. */
  requiresScope: boolean;
  busy: boolean;
  serverError: string | null;
  onSubmit: (values: CorrectionValues) => void;
  onCancel: () => void;
}) {
  const { pt, lang } = usePassportCopy();
  const [values, setValues] = useState<CorrectionValues>({
    title: lang === "sv" ? claim.titleSv : claim.titleEn,
    issuerName: claim.issuerName === "—" ? "" : claim.issuerName,
    jurisdictionCode: claim.jurisdictionCode ?? "SE",
    issuedOn: claim.issuedOn,
    validUntil: claim.validUntil,
    credentialReference: privateFields.credentialReference ?? "",
    holderNote: privateFields.holderNote ?? "",
    authorisationScope: claim.authorisationScope ?? "",
    reason: "",
  });
  const [problems, setProblems] = useState<readonly ("title" | "reason" | "authorisationScope")[]>(
    [],
  );
  const summaryRef = useRef<HTMLDivElement>(null);

  function set<K extends keyof CorrectionValues>(key: K, value: CorrectionValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit() {
    const found: ("title" | "reason" | "authorisationScope")[] = [];
    if (values.title.trim() === "") found.push("title");
    if (values.reason.trim() === "") found.push("reason");
    // The database refuses this too. Checking here means the holder gets a
    // field-level message in their own language instead of a 23514.
    if (requiresScope && values.authorisationScope.trim() === "") {
      found.push("authorisationScope");
    }
    setProblems(found);
    if (found.length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    onSubmit(values);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      {/* What a correction does to trust — before, not after. */}
      <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
        {pt("cred.correct.trustNote")}
      </p>

      <div>
        <label htmlFor="sp-corr-title" className="block text-sm font-medium text-foreground">
          {pt("cred.field.title")}
        </label>
        <input
          id="sp-corr-title"
          type="text"
          maxLength={200}
          value={values.title}
          aria-invalid={problems.includes("title") || undefined}
          aria-describedby={problems.includes("title") ? "sp-corr-title-error" : undefined}
          onChange={(e) => set("title", e.target.value)}
          className={inputClass}
        />
        {problems.includes("title") ? (
          <p id="sp-corr-title-error" className="mt-1 text-sm text-destructive">
            {pt("cred.error.titleRequired")}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="sp-corr-issuer" className="block text-sm font-medium text-foreground">
          {pt("claims.issuer")}
        </label>
        <input
          id="sp-corr-issuer"
          type="text"
          maxLength={160}
          value={values.issuerName}
          onChange={(e) => set("issuerName", e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sp-corr-issued" className="block text-sm font-medium text-foreground">
            {pt("claims.issuedOn")}
          </label>
          <input
            id="sp-corr-issued"
            type="date"
            value={values.issuedOn ?? ""}
            onChange={(e) => set("issuedOn", e.target.value || null)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="sp-corr-until" className="block text-sm font-medium text-foreground">
            {pt("cred.field.validUntil")}
          </label>
          <input
            id="sp-corr-until"
            type="date"
            value={values.validUntil ?? ""}
            onChange={(e) => set("validUntil", e.target.value || null)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="sp-corr-ref" className="block text-sm font-medium text-foreground">
          {pt("cred.field.reference")}{" "}
          <span className="font-normal text-muted-foreground">({pt("common.optional")})</span>
        </label>
        <input
          id="sp-corr-ref"
          type="text"
          maxLength={120}
          value={values.credentialReference}
          onChange={(e) => set("credentialReference", e.target.value)}
          className={inputClass}
        />
      </div>

      {requiresScope ? (
        <div>
          <label htmlFor="sp-corr-scope" className="block text-sm font-medium text-foreground">
            {pt("cred.field.scope")}
          </label>
          <input
            id="sp-corr-scope"
            type="text"
            maxLength={200}
            value={values.authorisationScope}
            aria-invalid={problems.includes("authorisationScope") ? true : undefined}
            aria-describedby="sp-corr-scope-help"
            onChange={(e) => set("authorisationScope", e.target.value)}
            className={inputClass}
          />
          <p id="sp-corr-scope-help" className="mt-1 text-xs text-muted-foreground">
            {pt("cred.field.scopeHelp")}
          </p>
          {problems.includes("authorisationScope") ? (
            <p className="mt-1 text-sm text-destructive">{pt("cred.error.scopeRequired")}</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label htmlFor="sp-corr-note" className="block text-sm font-medium text-foreground">
          {pt("cred.field.holderNote")}{" "}
          <span className="font-normal text-muted-foreground">({pt("common.optional")})</span>
        </label>
        <textarea
          id="sp-corr-note"
          rows={3}
          maxLength={2000}
          value={values.holderNote}
          onChange={(e) => set("holderNote", e.target.value)}
          className={cn(inputClass, "h-auto py-2.5")}
        />
      </div>

      <div>
        <label htmlFor="sp-corr-reason" className="block text-sm font-medium text-foreground">
          {pt("cred.correct.reason")}
        </label>
        <input
          id="sp-corr-reason"
          type="text"
          maxLength={300}
          value={values.reason}
          aria-invalid={problems.includes("reason") || undefined}
          aria-describedby={
            problems.includes("reason") ? "sp-corr-reason-error" : "sp-corr-reason-help"
          }
          onChange={(e) => set("reason", e.target.value)}
          className={inputClass}
        />
        <p id="sp-corr-reason-help" className="mt-1 text-xs text-muted-foreground">
          {pt("cred.correct.reasonHelp")}
        </p>
        {problems.includes("reason") ? (
          <p id="sp-corr-reason-error" className="mt-1 text-sm text-destructive">
            {pt("cred.correct.reasonRequired")}
          </p>
        ) : null}
      </div>

      {problems.length > 0 ? (
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

      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("cred.action.saving") : pt("cred.correct.submit")}
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
