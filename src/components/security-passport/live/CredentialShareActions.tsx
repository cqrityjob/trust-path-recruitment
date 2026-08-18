// Security Passport — sharing ONE credential, and putting it on LinkedIn.
//
// ── TWO DISTINCT ACTIONS, NOT ONE VAGUE ONE ────────────────────────────
//
// "Share this credential" mints a focused, revocable link to the live
// verification page. "Add to LinkedIn" is a different thing: it prepares the
// fields LinkedIn's own form asks for and opens that form.
//
// ── WHAT LINKEDIN ACTUALLY DOES, STATED HONESTLY ───────────────────────
//
// LinkedIn's third-party "Add to Profile" flow no longer autofills
// certification fields for arbitrary issuers. Claiming otherwise would set a
// holder up to press a button, see an empty LinkedIn form, and conclude the
// product is broken. So the panel says plainly that LinkedIn does not fill
// them in, shows exactly the values their form asks for, and offers one
// action to copy them all before opening LinkedIn.
//
// The credential URL handed to LinkedIn is the live verification page. That
// is deliberate: a LinkedIn entry links to something that is re-checked on
// every open and stops working when the holder revokes it, rather than to a
// static image that would outlive the credential.
//
// The identifier offered is the SHARE's public token, never the holder's
// private certificate or decision number — that is documented PRIVATE and
// must not travel to a third party.

import { useState } from "react";
import { Copy, Check, ExternalLink, Link2, Share2 } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export interface CredentialShareSubject {
  readonly title: string;
  readonly issuer: string | null;
  readonly issuedOn: string | null;
  readonly validUntil: string | null;
  /** True only for a verified, currently-active credential. */
  readonly shareable: boolean;
}

/** LinkedIn's form takes month and year, not a full date. */
function monthYear(iso: string | null): { month: string; year: string } | null {
  if (!iso) return null;
  const [year, month] = iso.split("-");
  if (!year || !month) return null;
  return { month: String(Number(month)), year };
}

/**
 * LinkedIn's documented static "Add to Profile" entry point for licences and
 * certifications. Parameters are passed as a convenience for the versions of
 * the flow that still read them; the panel above never promises they will be
 * applied.
 */
function addToProfileUrl(subject: CredentialShareSubject, credentialUrl: string): string {
  const issued = monthYear(subject.issuedOn);
  const expires = monthYear(subject.validUntil);
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: subject.title,
    organizationName: subject.issuer ?? "CQrityjob",
    certUrl: credentialUrl,
  });
  if (issued) {
    params.set("issueYear", issued.year);
    params.set("issueMonth", issued.month);
  }
  if (expires) {
    params.set("expirationYear", expires.year);
    params.set("expirationMonth", expires.month);
  }
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

export function CredentialShareActions({
  subject,
  shareUrl,
  busy,
  onCreateLink,
}: {
  subject: CredentialShareSubject;
  /** Null until the holder has minted a link. */
  shareUrl: string | null;
  busy: boolean;
  onCreateLink: () => void;
}) {
  const { pt } = usePassportCopy();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);

  if (!subject.shareable) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-secondary/40 p-5">
        <p className="text-sm leading-relaxed text-foreground">{pt("cw.notShareable")}</p>
      </section>
    );
  }

  const issued = monthYear(subject.issuedOn);
  const expires = monthYear(subject.validUntil);
  // The share token is the public identifier. The holder's own reference
  // number is private and never leaves the database.
  const credentialId = shareUrl ? (shareUrl.split("/p/")[1] ?? "").slice(0, 12) : "";

  const rows: readonly { labelKey: PassportCopyKey; value: string }[] = [
    { labelKey: "cw.liName", value: subject.title },
    { labelKey: "cw.liOrg", value: subject.issuer ?? "CQrityjob" },
    { labelKey: "cw.liIssued", value: issued ? `${issued.month}/${issued.year}` : "—" },
    { labelKey: "cw.liExpires", value: expires ? `${expires.month}/${expires.year}` : "—" },
    { labelKey: "cw.liId", value: credentialId || "—" },
    { labelKey: "cw.liUrl", value: shareUrl ?? "—" },
  ];

  async function copyDetails() {
    const text = rows.map((r) => `${pt(r.labelKey)}: ${r.value}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedDetails(true);
    setTimeout(() => setCopiedDetails(false), 2500);
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  async function shareLink() {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: subject.title, url: shareUrl });
        return;
      }
      await copyLink();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[passport] credential share failed", err);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {pt("cw.shareCredential")}
      </h3>

      {!shareUrl ? (
        <button
          type="button"
          onClick={onCreateLink}
          disabled={busy}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Link2 aria-hidden="true" className="h-4 w-4" />
          {busy ? pt("cw.creating") : pt("cw.shareCredential")}
        </button>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void shareLink()}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Share2 aria-hidden="true" className="h-4 w-4" />
              {pt("share2.share")}
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {copiedLink ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
              {copiedLink ? pt("share2.copied") : pt("share2.copy")}
            </button>
          </div>

          {/* ── LinkedIn ──────────────────────────────────────────────── */}
          <div className="mt-5 border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-foreground">{pt("cw.linkedInPanel")}</h4>
            {/* Stated before the button, not after a disappointing result. */}
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("cw.linkedInHow")}
            </p>

            <dl className="mt-3 grid gap-2 rounded-lg border border-border bg-secondary/30 p-3 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.labelKey} className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {pt(r.labelKey)}
                  </dt>
                  <dd className="mt-0.5 break-all text-sm text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyDetails()}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {copiedDetails ? (
                  <Check aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Copy aria-hidden="true" className="h-4 w-4" />
                )}
                {copiedDetails ? pt("cw.copied") : pt("cw.copyDetails")}
              </button>
              <a
                href={addToProfileUrl(subject, shareUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                {pt("cw.openLinkedIn")}
              </a>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
