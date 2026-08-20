// Security Passport — the share panel, restructured around three blocks.
//
// ── WHAT CHANGED, AND WHAT DID NOT ─────────────────────────────────────
//
// Not the backend. Not the token, the 30-day expiry, revocation, the
// read-only recipient page, the privacy controls or the generated images —
// every one of those is the same contract, called through the same
// functions. What changed is what the holder meets first.
//
// The previous panel led with "Länken är klar" and a row of buttons for
// managing a URL. But a holder on this screen is not managing a URL; they
// are handing a professional record to someone who has to believe it. So the
// panel now leads with the one action that carries that meaning —
//
//   1. VERIFIERA PASSPORT — open the live, read-only page a recipient sees;
//   2. Dela i flöde — a scannable vertical list of channels, LinkedIn first;
//   3. Lägg till i LinkedIn-profil — a permanent profile entry, not a post;
//
// — and everything that is genuinely supporting (the four image formats, the
// platform-retention caveat, the raw link, the one-time-display warning)
// moved below into disclosures. None of it was deleted. It stopped being the
// first thing.
//
// ── NO PARALLEL SHARE LOGIC ────────────────────────────────────────────
//
// Channel destinations come from share-channels.ts and image rendering from
// share-image.ts, both shared with the surfaces that already used them. This
// component contains no URL construction and no SVG.

import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  ChevronDown,
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Share2,
  ShieldCheck,
  X as XIcon,
} from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { SocialCardModel } from "@/lib/security-passport/social";
import type { PassportHolder } from "@/lib/security-passport/types";
import {
  FEED_CHANNELS,
  shareIntentUrl,
  type ShareChannel,
} from "@/lib/security-passport/share-channels";
import { downloadBlob, renderShareImage } from "@/lib/security-passport/share-image";
import { SHARE_FORMATS } from "@/lib/security-passport/social-export";
import type { ShareFormat } from "@/lib/security-passport/design/trust-system";
import { LinkedInProfileSection } from "./LinkedInProfileSection";

/** Platform marks, tinted only so a row is recognisable at a glance. The
 *  surface, type and spacing around them stay CQrityjob's own. */
const CHANNEL_ICON: Readonly<
  Record<ShareChannel, { readonly Icon: typeof Linkedin; readonly colour: string | null }>
> = {
  linkedin: { Icon: Linkedin, colour: "#0A66C2" },
  facebook: { Icon: Facebook, colour: "#1877F2" },
  x: { Icon: XIcon, colour: null },
  email: { Icon: Mail, colour: null },
  instagram: { Icon: Instagram, colour: "#C13584" },
  whatsapp: { Icon: MessageCircle, colour: "#25D366" },
  copy_link: { Icon: Copy, colour: null },
  native: { Icon: Share2, colour: null },
};

export interface SharePanelProps {
  readonly shareUrl: string;
  readonly model: SocialCardModel;
  readonly holder: PassportHolder;
  readonly qrDataUrl: string | null;
}

export function SharePanel({ shareUrl, model, holder, qrDataUrl }: SharePanelProps) {
  const { pt, lang } = usePassportCopy();
  const [copied, setCopied] = useState(false);
  const [busyFormat, setBusyFormat] = useState<ShareFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subject = pt("rec.title");

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function exportFormat(format: ShareFormat) {
    setBusyFormat(format);
    setError(null);
    try {
      const blob = await renderShareImage(model, format, lang, pt, qrDataUrl);
      downloadBlob(blob, `cqrityjob-passport-${format}.png`);
    } catch (err) {
      console.error("[passport] social export failed", err);
      setError(pt("common.error"));
    } finally {
      setBusyFormat(null);
    }
  }

  /** The card image, rendered from the SAME safe social model the recipient
   *  page uses: no credential reference, no document, no employer history,
   *  no contact detail. `buildSocialCard` decides that upstream and nothing
   *  here can widen it. A failed render must not block sharing the link,
   *  which is the part that actually verifies. */
  async function cardImageFile(): Promise<File | null> {
    try {
      const blob = await renderShareImage(model, "og", lang, pt, qrDataUrl);
      return new File([blob], "cqrityjob-passport.png", { type: "image/png" });
    } catch (err) {
      console.error("[passport] card image render failed", err);
      return null;
    }
  }

  async function act(channel: ShareChannel) {
    setError(null);
    try {
      if (channel === "copy_link") {
        await copyLink();
        return;
      }
      if (channel === "native") {
        // Three tiers, best first — unchanged from the previous panel:
        //
        //   1. the card IMAGE plus the link, where the browser can share
        //      files, because that is what makes a post look like a Passport
        //      rather than a bare URL;
        //   2. the link alone through the native sheet;
        //   3. a copy, because a button that silently does nothing is worse
        //      than one that tells you what it did.
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
          await navigator.share({ title: subject, url: shareUrl });
          return;
        }
        await copyLink();
        return;
      }
      // Instagram has no web publishing path. What it gets is the Story
      // image, sized correctly, which the holder posts from the app.
      if (channel === "instagram") {
        await exportFormat("story");
        return;
      }
      const url = shareIntentUrl(channel, shareUrl, subject);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      // An aborted native share is a user decision, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[passport] share action failed", err);
      setError(pt("common.error"));
    }
  }

  return (
    <div className="space-y-4">
      {/* ── 1. The trust anchor ──────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 text-sm font-semibold uppercase tracking-[0.14em] text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          {pt("sp.verify")}
        </a>
        <p className="mt-3 text-balance text-center text-sm text-muted-foreground">
          {pt("sp.verifyHint")}
        </p>
        <p className="mt-1 text-balance text-center text-sm text-muted-foreground">
          {pt("share2.terms")}
        </p>
      </section>

      {/* ── 2. Dela i flöde ──────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 className="px-5 pb-3 pt-5 text-base font-semibold tracking-tight text-foreground">
          {pt("sp.feed")}
        </h2>

        <ul>
          {FEED_CHANNELS.map(({ id, labelKey }) => {
            const { Icon, colour } = CHANNEL_ICON[id];
            const busy = id === "instagram" && busyFormat === "story";
            return (
              <li key={id} className="border-t border-border">
                <button
                  type="button"
                  onClick={() => void act(id)}
                  disabled={busy}
                  className="flex min-h-[56px] w-full items-center gap-4 px-5 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                >
                  <Icon
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0"
                    style={colour ? { color: colour } : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    {id === "copy_link" && copied ? pt("sc.copied") : pt(labelKey)}
                    {id === "instagram" ? (
                      <span className="mt-0.5 block text-xs font-normal leading-relaxed text-muted-foreground">
                        {pt("share.channel.instagramHint")}
                      </span>
                    ) : null}
                  </span>
                  {id === "copy_link" && copied ? (
                    <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Secondary, and visually quieter than the channel list. */}
        <div className="border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => void act("native")}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Share2 aria-hidden="true" className="h-4 w-4" />
            {pt("sp.deviceShare")}
          </button>
        </div>
      </section>

      {/* ── 3. Lägg till i LinkedIn-profil ───────────────────────────── */}
      <LinkedInProfileSection holder={holder} shareUrl={shareUrl} />

      {/* ── 4. Supporting: the image exports, kept but demoted ───────── */}
      <details className="group overflow-hidden rounded-xl border border-border bg-card">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
          <span className="min-w-0 flex-1">{pt("sp.more")}</span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="border-t border-border px-5 py-5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {pt("sp.imagesTitle")}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("sc.imagesNote")}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {SHARE_FORMATS.map((spec) => (
              <button
                key={spec.id}
                type="button"
                onClick={() => void exportFormat(spec.id)}
                disabled={busyFormat !== null}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                {pt(spec.labelKey as PassportCopyKey)}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {spec.width}×{spec.height}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {pt("share.instagramNote")}
          </p>
        </div>
      </details>

      {/* ── 5. The security facts, stated but not shouted ────────────── */}
      <details className="group overflow-hidden rounded-xl border border-border bg-card">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
          <span className="min-w-0 flex-1">{pt("sp.securityDetails")}</span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="space-y-3 border-t border-border px-5 py-5">
          <p className="text-sm leading-relaxed text-foreground">{pt("share2.whatIsShared")}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{pt("share2.cacheNote")}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{pt("sc.retentionNote")}</p>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {pt("share.excluded")}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {(
                [
                  "share.excluded.numbers",
                  "share.excluded.documents",
                  "share.excluded.employers",
                  "share.excluded.dates",
                  "share.excluded.contact",
                ] as const
              ).map((key) => (
                <li key={key}>· {pt(key)}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">{pt("sc.onceOnly")}</p>
            <p className="mt-2 break-all rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground">
              {shareUrl}
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
              {copied ? pt("share2.copied") : pt("share2.copy")}
            </button>
          </div>
        </div>
      </details>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
