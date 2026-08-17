// Security Passport — the holder's sharing centre.
//
// ── THE HOLDER DECIDES WHETHER, NOT WHAT ───────────────────────────────
//
// Whether to share, which package, to whom, for how long, and whether to
// revoke — all theirs. The CONTENTS of a package are not, and this page
// says so in words rather than leaving it to be discovered. A free-form
// builder would make the holder responsible for the integrity of their own
// disclosure, and somebody acting in complete good faith can still assemble
// something technically true and materially misleading: a licence without
// its expiry, a role without its jurisdiction.
//
// ── THE PAGE NEVER FILTERS ─────────────────────────────────────────────
//
// Nothing here reads a full profile and hides part of it. The payload a
// recipient receives is assembled by `sp_get_disclosure` from the package
// code. What this page renders is a DESCRIPTION of that contract, so a
// holder can read what they are about to hand over before they hand it
// over.
//
// ── THE LINK IS SHOWN ONCE ─────────────────────────────────────────────
//
// Only the token's hash is stored, so nobody — not this application, not
// CQrityjob, not a database backup — can recover the link afterwards. The
// page states that plainly at the moment it matters, because a holder who
// closes the tab expecting to find it later needs to know now.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, Link2, ShieldCheck, X } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import {
  createDisclosure,
  listMyDisclosures,
  revokeDisclosure,
  type DisclosureRecord,
} from "@/lib/security-passport/disclosure.functions";
import { LIVE_PACKAGES, type DisclosurePackageCode } from "@/lib/security-passport/packages";
import { buildSocialCard } from "@/lib/security-passport/social";
import { useQrDataUrl } from "@/lib/security-passport/use-qr";
import { SocialFrame } from "@/components/security-passport/social/SocialFrame";
import { LiveShareActions } from "@/components/security-passport/live/LiveShareActions";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export const Route = createFileRoute("/_authenticated/passport/share")({
  ssr: false,
  component: PassportShareRoute,
});

const EXPIRY_CHOICES: readonly { days: number | null; labelKey: PassportCopyKey }[] = [
  { days: 7, labelKey: "sc.expiry.7" },
  { days: 30, labelKey: "sc.expiry.30" },
  { days: 90, labelKey: "sc.expiry.90" },
  { days: null, labelKey: "sc.expiry.never" },
];

const STATE_KEY: Readonly<Record<DisclosureRecord["state"], PassportCopyKey>> = {
  active: "sc.state.active",
  expired: "sc.state.expired",
  revoked: "sc.state.revoked",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function PassportShareRoute() {
  const { pt } = usePassportCopy();

  const loadPassport = useServerFn(getMyPassport);
  const loadShares = useServerFn(listMyDisclosures);
  const doCreate = useServerFn(createDisclosure);
  const doRevoke = useServerFn(revokeDisclosure);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [shares, setShares] = useState<readonly DisclosureRecord[]>([]);
  const [packageCode, setPackageCode] = useState<DisclosurePackageCode>("public_card");
  const [expiryDays, setExpiryDays] = useState<number | null>(30);
  const [purpose, setPurpose] = useState("");
  const [recipientHint, setRecipientHint] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [snap, list] = await Promise.all([
        loadPassport({ data: undefined }),
        loadShares({ data: undefined }),
      ]);
      setSnapshot(snap);
      setShares(list);
    } catch (err) {
      console.error("[passport] sharing centre load failed", err);
      setError(pt("common.error"));
    }
  }, [loadPassport, loadShares, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shareUrl = useMemo(
    () => (token && typeof window !== "undefined" ? `${window.location.origin}/p/${token}` : null),
    [token],
  );

  const qrDataUrl = useQrDataUrl(shareUrl ?? "");

  const socialModel = useMemo(() => {
    if (!snapshot?.profile || !shareUrl) return null;
    return buildSocialCard(snapshot.holder, today(), {
      privacyMode: snapshot.profile.privacyMode,
      anonymousLabel: pt("share.anonymousLabel"),
      verifyUrl: shareUrl,
    });
  }, [snapshot, shareUrl, pt]);

  const hasVerified = useMemo(() => {
    if (!snapshot) return false;
    return (
      snapshot.holder.claims.some(
        (c) => c.assertionLevel === "verified" && c.lifecycleState === "active",
      ) ||
      snapshot.holder.periods.some(
        (p) => p.assertionLevel === "verified" && p.lifecycleState === "active",
      )
    );
  }, [snapshot]);

  const chosen = LIVE_PACKAGES.find((p) => p.code === packageCode)!;

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const result = await doCreate({
        data: {
          packageCode,
          expiresDays: expiryDays,
          purpose: purpose.trim() || null,
          recipientHint: recipientHint.trim() || null,
        },
      });
      setToken(result.token);
      await refresh();
    } catch (err) {
      console.error("[passport] create disclosure failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm(pt("sc.revokeConfirm"))) return;
    setBusy(true);
    try {
      await doRevoke({ data: { disclosureId: id } });
      await refresh();
    } catch (err) {
      console.error("[passport] revoke failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) return <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>;
  if (!snapshot.profile) {
    return <p className="text-sm text-muted-foreground">{pt("sc.needPassport")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("sc.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("sc.lead")}</p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* Nothing verified: a share would be an empty page. Saying so is
          kinder and more honest than letting somebody send a blank link. */}
      {!hasVerified ? (
        <section className="rounded-xl border border-dashed border-border bg-secondary/40 p-5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {pt("sc.nothingVerifiedTitle")}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("sc.nothingVerifiedBody")}
          </p>
        </section>
      ) : null}

      {/* ── Package choice ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("sc.choosePackage")}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {pt("sc.packagesAreFixed")}
        </p>

        <fieldset className="mt-4">
          <legend className="sr-only">{pt("sc.choosePackage")}</legend>
          <div className="space-y-2">
            {LIVE_PACKAGES.map((p) => (
              <label
                key={p.code}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent/5"
              >
                <input
                  type="radio"
                  name="sp-package"
                  value={p.code}
                  checked={packageCode === p.code}
                  onChange={() => setPackageCode(p.code)}
                  className="mt-1 h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{pt(p.nameKey)}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {pt(p.purposeKey)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("sc.includes")}
            </p>
            <ul className="mt-2 space-y-1">
              {chosen.includesKeys.map((k) => (
                <li key={k} className="flex items-start gap-2 text-sm text-foreground">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {pt(k)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("sc.excludes")}
            </p>
            <ul className="mt-2 space-y-1">
              {chosen.excludesKeys.map((k) => (
                <li key={k} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <X aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {pt(k)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-4 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground">
          {pt("sc.verifiedOnlyNote")}
        </p>
      </section>

      {/* ── Terms of the share ──────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div>
            <label htmlFor="sp-expiry" className="block text-sm font-medium text-foreground">
              {pt("sc.expiry")}
            </label>
            <select
              id="sp-expiry"
              value={String(expiryDays)}
              onChange={(e) =>
                setExpiryDays(e.target.value === "null" ? null : Number(e.target.value))
              }
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-64"
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={String(c.days)} value={String(c.days)}>
                  {pt(c.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sp-purpose" className="block text-sm font-medium text-foreground">
              {pt("sc.purpose")}{" "}
              <span className="font-normal text-muted-foreground">({pt("common.optional")})</span>
            </label>
            <input
              id="sp-purpose"
              type="text"
              maxLength={200}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={pt("sc.purposePlaceholder")}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>

          <div>
            <label htmlFor="sp-recipient" className="block text-sm font-medium text-foreground">
              {pt("sc.recipientHint")}{" "}
              <span className="font-normal text-muted-foreground">({pt("common.optional")})</span>
            </label>
            <input
              id="sp-recipient"
              type="text"
              maxLength={200}
              value={recipientHint}
              aria-describedby="sp-recipient-help"
              onChange={(e) => setRecipientHint(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <p id="sp-recipient-help" className="mt-1 text-xs text-muted-foreground">
              {pt("sc.recipientHintHelp")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Link2 aria-hidden="true" className="h-4 w-4" />
            {busy ? pt("sc.creating") : pt("sc.create")}
          </button>
        </div>
      </section>

      {/* ── The link, shown once ────────────────────────────────────── */}
      {shareUrl ? (
        <>
          <section className="rounded-xl border border-accent/40 bg-secondary/40 p-5">
            <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              {pt("sc.createdTitle")}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{pt("sc.onceOnly")}</p>

            <p className="mt-3 break-all rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground">
              {shareUrl}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  });
                }}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Copy aria-hidden="true" className="h-4 w-4" />
                {copied ? pt("sc.copied") : pt("sc.copy")}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("sc.openRecipient")}
              </a>
            </div>

            {qrDataUrl ? (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {pt("sc.qrTitle")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{pt("sc.qrBody")}</p>
                <img
                  src={qrDataUrl}
                  alt={pt("sc.qrTitle")}
                  className="mt-2 h-40 w-40 rounded-md border border-border bg-white p-2"
                />
                <a
                  href={qrDataUrl}
                  download="cqrityjob-passport-qr.png"
                  className="mt-2 inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                  {pt("sc.qrDownload")}
                </a>
              </div>
            ) : null}
          </section>

          {socialModel ? (
            <>
              <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {pt("share.title")}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {pt("share.lead")}
                </p>
                <div className="mt-4">
                  <SocialFrame model={socialModel} format="square" previewWidth={340} />
                </div>
              </section>

              <LiveShareActions shareUrl={shareUrl} model={socialModel} qrDataUrl={qrDataUrl} />
            </>
          ) : null}
        </>
      ) : null}

      {/* ── History ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {pt("sc.historyTitle")}
        </h3>
        {shares.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{pt("sc.historyEmpty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {shares.map((s) => {
              const meta = LIVE_PACKAGES.find((p) => p.code === s.packageCode);
              return (
                <li key={s.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {meta ? pt(meta.nameKey) : s.packageCode}
                      </p>
                      {s.purpose ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">{s.purpose}</p>
                      ) : null}
                      {s.recipientHint ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.recipientHint}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                      {pt(STATE_KEY[s.state])}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("sc.created")}
                      </dt>
                      <dd className="text-sm tabular-nums text-foreground">
                        {s.createdAt.slice(0, 10)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("sc.expiresOn")}
                      </dt>
                      <dd className="text-sm tabular-nums text-foreground">
                        {s.expiresAt ? s.expiresAt.slice(0, 10) : pt("sc.expiry.never")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {pt("sc.opened")}
                      </dt>
                      <dd className="text-sm tabular-nums text-foreground">
                        {s.accessCount} {pt("sc.timesShort")}
                      </dd>
                    </div>
                  </dl>

                  {s.state !== "revoked" ? (
                    <button
                      type="button"
                      onClick={() => void onRevoke(s.id)}
                      disabled={busy}
                      className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {busy ? pt("sc.revoking") : pt("sc.revoke")}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
