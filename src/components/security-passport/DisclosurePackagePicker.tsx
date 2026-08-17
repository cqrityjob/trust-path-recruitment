// Controlled disclosure — package selection and review.
//
// ── NOT A BUILDER ──────────────────────────────────────────────────────
//
// The holder picks an authored package and toggles its OPTIONAL items.
// Mandatory items are rendered with no control at all — not a disabled
// checkbox, which invites a reader to look for a way to enable it, but a
// plain locked row. There is no affordance to remove a claim's assertion
// level, lifecycle state, issuer, verifier, jurisdiction, dates or
// limitation, because those travel inside the claim itself (ClaimRow).
//
// ── THE REVIEW STEP SHOWS THE REAL PAYLOAD ─────────────────────────────
//
// The preview renders `buildDisclosurePayload(...)` — the same function a
// server would run — rather than a mock-up of it. So "this is exactly what
// the recipient sees" is true by construction, not by a promise in the
// copy.

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  ALLOWED_EXPIRY_DAYS,
  DEFAULT_EXPIRY_DAYS,
  DISCLOSURE_PACKAGES,
  buildDisclosurePayload,
  packageById,
  type DisclosureItemKind,
  type DisclosurePackageId,
  type DisclosureRequest,
} from "@/lib/security-passport/disclosure";
import { toEpochDay } from "@/lib/security-passport/experience";
import type { PassportHolder } from "@/lib/security-passport/types";
import { DisclosurePayloadView } from "./RecipientVerification";

function addDays(iso: string, days: number): string {
  const base = toEpochDay(iso) + days;
  return new Date(base * 86_400_000).toISOString().slice(0, 10);
}

export function DisclosurePackagePicker({
  holder,
  evaluationOn,
  viewingJurisdiction,
  className,
}: {
  holder: PassportHolder;
  evaluationOn: string;
  viewingJurisdiction: string;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const [packageId, setPackageId] = useState<DisclosurePackageId>("overview");
  const [optional, setOptional] = useState<readonly DisclosureItemKind[]>([]);
  const [recipient, setRecipient] = useState("");
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);

  const pkg = packageById(packageId);
  const mandatory = pkg.items.filter((i) => i.isMandatory);
  const optionalItems = pkg.items.filter((i) => !i.isMandatory);

  const request: DisclosureRequest = useMemo(
    () => ({
      packageId,
      optionalIncluded: optional,
      recipientHint: recipient.trim() === "" ? null : recipient.trim(),
      expiresOn: addDays(evaluationOn, expiryDays),
      revoked: false,
    }),
    [packageId, optional, recipient, expiryDays, evaluationOn],
  );

  const payload = useMemo(
    () => buildDisclosurePayload(holder, request, evaluationOn),
    [holder, request, evaluationOn],
  );

  function selectPackage(id: DisclosurePackageId) {
    setPackageId(id);
    // Optional selections belong to the package that offered them. Carrying
    // them across would silently include something the new package never
    // presented.
    setOptional([]);
  }

  function toggleOptional(kind: DisclosureItemKind) {
    setOptional((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));
  }

  return (
    <div className={cn("mx-auto w-full max-w-3xl space-y-6", className)}>
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("disclosure.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {pt("disclosure.lead")}
        </p>
      </header>

      <fieldset className="rounded-xl border border-border bg-card p-5">
        <legend className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("disclosure.package")}
        </legend>
        <div className="mt-2 space-y-2">
          {DISCLOSURE_PACKAGES.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                p.id === packageId
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-accent/5",
              )}
            >
              <input
                type="radio"
                name="sp-package"
                value={p.id}
                checked={p.id === packageId}
                onChange={() => selectPackage(p.id)}
                className="mt-1 h-4 w-4 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{pt(p.nameKey)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {pt(p.purposeKey)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("disclosure.mandatory")}
        </h3>
        <ul className="mt-2 space-y-1.5">
          {mandatory.map((item) => (
            <li key={item.kind} className="flex items-center gap-2 text-sm text-foreground">
              <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {pt(item.labelKey)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{pt("disclosure.mandatoryNote")}</p>

        {optionalItems.length > 0 ? (
          <>
            <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("disclosure.optional")}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {optionalItems.map((item) => (
                <li key={item.kind}>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={optional.includes(item.kind)}
                      onChange={() => toggleOptional(item.kind)}
                      className="h-4 w-4 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    {pt(item.labelKey)}
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sp-recipient" className="block text-sm font-medium text-foreground">
            {pt("disclosure.recipient")}
          </label>
          <input
            id="sp-recipient"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={pt("disclosure.recipientPlaceholder")}
            className="mt-1.5 block h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        <div>
          <label htmlFor="sp-expiry" className="block text-sm font-medium text-foreground">
            {pt("disclosure.expiry")}
          </label>
          <select
            id="sp-expiry"
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
            className="mt-1.5 block h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {ALLOWED_EXPIRY_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} {pt("disclosure.expiryDays")}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
            {pt("recipient.expiresOn")}: {request.expiresOn}
          </p>
        </div>
      </section>

      <section>
        <h3
          className="text-lg font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("disclosure.review")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{pt("disclosure.reviewLead")}</p>
        <div className="mt-4">
          <DisclosurePayloadView payload={payload} viewingJurisdiction={viewingJurisdiction} />
        </div>
      </section>
    </div>
  );
}
