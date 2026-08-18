// Security Passport — the sharing centre, rebuilt around one action.
//
// ── WHAT THIS REPLACED, AND WHY ────────────────────────────────────────
//
// The previous screen asked an ordinary holder to understand CQrityjob's
// internal disclosure model before they could send anybody anything: five
// package cards with includes/excludes lists, an expiry select, purpose and
// recipient fields, then — after creation — a raw 64-character token as the
// hero element, a QR block, four image formats, seven social buttons and the
// same cache warning three times.
//
// Every one of those controls maps to something real, and the security
// contracts behind them are unchanged. What changed is that a holder no
// longer has to meet them to do the ordinary thing. The default is:
//
//   1. look at the Passport you are about to share;
//   2. press "Dela mitt Passport".
//
// Two actions, and the result is explained in one sentence: 30 days,
// revocable. Everything else — a different expiry, the QR code, the image
// downloads, the package choice, recipient labels, and managing existing
// links — lives under "Fler alternativ", which is collapsed by default.
//
// ── THE PACKAGE IS CHOSEN FOR THEM, NOT REMOVED ────────────────────────
//
// `public_card` is the safe default: verified content only, no employer
// history, no documents, no reference numbers. The other four packages are
// still real server-side contracts and are still selectable under advanced
// options — this screen simply stops making the taxonomy a prerequisite.
//
// ── THE TOKEN IS NOT THE HERO ──────────────────────────────────────────
//
// The link is what gets shared, so the actions that share it are prominent
// and the 64-character string itself sits in a copyable field under details.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Copy, Eye, Link2, Share2, ShieldCheck } from "lucide-react";
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
import { buildPassportCard } from "@/lib/security-passport/card";
import { DirectionC } from "@/components/security-passport/card/DirectionC";
import { SocialFrame } from "@/components/security-passport/social/SocialFrame";
import { LiveShareActions } from "@/components/security-passport/live/LiveShareActions";
import { LinkedInShareSection } from "@/components/security-passport/live/LinkedInShareSection";
import { buildSocialSvg, svgToPngBlob } from "@/lib/security-passport/social-export";
import { shareFormat } from "@/lib/security-passport/design/trust-system";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export const Route = createFileRoute("/_authenticated/passport/share")({
  ssr: false,
  component: PassportShareRoute,
});

/** The safe default. Verified content only; no employers, documents or
 *  reference numbers. Chosen for the holder so the taxonomy is not a
 *  prerequisite for sharing. */
const DEFAULT_PACKAGE: DisclosurePackageCode = "public_card";

/** Recommended, and applied without asking. A holder who wants something
 *  else finds it under advanced options. */
const DEFAULT_EXPIRY_DAYS = 30;

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
  const { pt, lang } = usePassportCopy();

  const loadPassport = useServerFn(getMyPassport);
  const loadShares = useServerFn(listMyDisclosures);
  const doCreate = useServerFn(createDisclosure);
  const doRevoke = useServerFn(revokeDisclosure);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [shares, setShares] = useState<readonly DisclosureRecord[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced, all pre-filled with the defaults the primary action uses.
  const [packageCode, setPackageCode] = useState<DisclosurePackageCode>(DEFAULT_PACKAGE);
  const [expiryDays, setExpiryDays] = useState<number | null>(DEFAULT_EXPIRY_DAYS);
  const [purpose, setPurpose] = useState("");
  const [recipientHint, setRecipientHint] = useState("");

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

  const card = useMemo(
    () => (snapshot ? buildPassportCard(snapshot.holder, today()) : null),
    [snapshot],
  );

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

  const activeShares = shares.filter((s) => s.state === "active");

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

  /** The card image, rendered from the SAME safe social model the recipient
   *  page uses. It carries no credential reference, no document, no employer
   *  history, no contact detail and no internal note — buildSocialCard decides
   *  that, and the fixture check proves it across every persona and privacy
   *  mode. Nothing here can widen it. */
  async function cardImageFile(): Promise<File | null> {
    if (!socialModel || !shareUrl) return null;
    try {
      const spec = shareFormat("og");
      const svg = buildSocialSvg(
        socialModel,
        "og",
        lang,
        {
          brand: pt("card.brand"),
          professionLine: `${lang === "sv" ? socialModel.professionTitleSv : socialModel.professionTitleEn} · ${socialModel.jurisdictionCode}`,
          verifiedLabel: pt("assertion.verified"),
          yearsLabel: pt("recognition.years"),
          verifyAtSource: pt("card.verifyAtSource"),
          noVerifiedYet:
            socialModel.verifiedCredentials.length > 0
              ? pt("card.noVerifiedExperience")
              : pt("card.noVerifiedYet"),
          staleWarning: socialModel.staleWarning ? pt("card.shareExpired") : null,
        },
        qrDataUrl,
      );
      const blob = await svgToPngBlob(svg, spec.width, spec.height);
      return new File([blob], "cqrityjob-passport.png", { type: "image/png" });
    } catch (err) {
      // A failed render must not block sharing the link, which is the part
      // that actually verifies. The image is the nicety.
      console.error("[passport] card image render failed", err);
      return null;
    }
  }

  async function onShare() {
    if (!shareUrl) return;
    // Three tiers, best first:
    //
    //   1. the card IMAGE plus the link, where the browser supports sharing
    //      files — this is what makes a post look like a Passport rather than
    //      a bare URL;
    //   2. the link alone through the native sheet;
    //   3. a copy, because a button that silently does nothing is worse than
    //      one that tells you what it did.
    try {
      const file = await cardImageFile();
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: pt("rec.title"),
          text: pt("li.shareText"),
          url: shareUrl,
          files: [file],
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: pt("rec.title"), url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[passport] share failed", err);
    }
  }

  async function onCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("share2.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("share2.lead")}</p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* ── The thing being shared, first ───────────────────────────── */}
      {card ? (
        <div className="mx-auto w-full max-w-sm">
          <DirectionC
            card={card}
            verifyUrl={shareUrl ?? "cqrityjob.se/passport"}
            className="min-h-[460px]"
          />
        </div>
      ) : null}

      {!hasVerified ? (
        <section className="rounded-xl border border-dashed border-border bg-secondary/40 p-5">
          <p className="text-sm leading-relaxed text-foreground">{pt("share2.nothingVerified")}</p>
        </section>
      ) : null}

      {/* ── One primary action, then the result ─────────────────────── */}
      {!shareUrl ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
          >
            <Link2 aria-hidden="true" className="h-4 w-4" />
            {busy ? pt("share2.creating") : pt("share2.primary")}
          </button>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {pt("share2.whatIsShared")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{pt("share2.terms")}</p>
        </section>
      ) : (
        <section className="rounded-xl border border-accent/40 bg-secondary/40 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            {pt("share2.ready")}
          </h2>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onShare()}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Share2 aria-hidden="true" className="h-4 w-4" />
              {pt("share2.share")}
            </button>
            <button
              type="button"
              onClick={() => void onCopy()}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
              {copied ? pt("share2.copied") : pt("share2.copy")}
            </button>
            {/* The third and last primary action: see it as the recipient
                sees it. A holder who cannot check what they just handed over
                has to trust us about it, which is the opposite of the point.
                A plain link, not a button, because it navigates. */}
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Eye aria-hidden="true" className="h-4 w-4" />
              {pt("share2.view")}
            </a>
          </div>

          {/* One sentence, once. Not the same warning three times. */}
          <p className="mt-3 text-sm text-muted-foreground">{pt("share2.terms")}</p>

          {/* The token is available, but it is not the hero. */}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {pt("sc.onceOnly")}
            </summary>
            <p className="mt-2 break-all rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground">
              {shareUrl}
            </p>
          </details>
        </section>
      )}

      {/* ── Everything else, collapsed ──────────────────────────────── */}
      <details
        className="rounded-xl border border-border bg-card"
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer items-center gap-2 p-5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
          {pt("share2.more")}
          <span className="font-normal text-muted-foreground">— {pt("share2.moreHint")}</span>
        </summary>

        <div className="space-y-6 border-t border-border p-5">
          {/* Package choice, for the holder who needs a different contract. */}
          <div>
            <p className="text-sm font-medium text-foreground">{pt("sc.choosePackage")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{pt("sc.packagesAreFixed")}</p>
            <div className="mt-3 space-y-2">
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
                    <span className="block text-sm font-medium text-foreground">
                      {pt(p.nameKey)}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {pt(p.purposeKey)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

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

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          {/* QR, images and LinkedIn only exist once a link does. */}
          {shareUrl && socialModel ? (
            <>
              {qrDataUrl ? (
                <div>
                  <p className="text-sm font-medium text-foreground">{pt("sc.qrTitle")}</p>
                  <img
                    src={qrDataUrl}
                    alt={pt("sc.qrTitle")}
                    className="mt-2 h-36 w-36 rounded-md border border-border bg-white p-2"
                  />
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium text-foreground">{pt("share.title")}</p>
                <div className="mt-3">
                  <SocialFrame model={socialModel} format="square" previewWidth={300} />
                </div>
              </div>

              {/* The one place the caching caveat is stated: where an image
                  is actually produced. */}
              <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
                {pt("share2.cacheNote")}
              </p>

              <LiveShareActions shareUrl={shareUrl} model={socialModel} qrDataUrl={qrDataUrl} />
              <LinkedInShareSection shareUrl={shareUrl} model={socialModel} qrDataUrl={qrDataUrl} />
            </>
          ) : null}

          {/* Active links and revocation. */}
          <div>
            <p className="text-sm font-medium text-foreground">
              {pt("share2.activeLinks")}{" "}
              <span className="font-normal tabular-nums text-muted-foreground">
                ({activeShares.length})
              </span>
            </p>
            {shares.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{pt("sc.historyEmpty")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {shares.map((s) => {
                  const meta = LIVE_PACKAGES.find((p) => p.code === s.packageCode);
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {meta ? pt(meta.nameKey) : s.packageCode}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {pt(STATE_KEY[s.state])} · {pt("sc.created")} {s.createdAt.slice(0, 10)} ·{" "}
                          {s.accessCount} {pt("sc.timesShort")}
                        </p>
                      </div>
                      {s.state !== "revoked" ? (
                        <button
                          type="button"
                          onClick={() => void onRevoke(s.id)}
                          disabled={busy}
                          className="inline-flex h-11 shrink-0 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {busy ? pt("sc.revoking") : pt("sc.revoke")}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
