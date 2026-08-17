// Security Passport — real share actions for a real disclosure.
//
// The Phase 1B `ShareActions` is a prototype that records which button was
// pressed and contacts nothing. This is its live counterpart, and the
// difference is the point: every channel here acts, so each one had to be
// decided honestly.
//
// ── WHAT IS SHARED IS A LINK, NOT A CLAIM ──────────────────────────────
//
// Every channel carries the /p/<token> URL. None of them carries the
// payload: platforms cache what you hand them, and a cached credential
// cannot be revoked. A link can — and the page behind it is re-checked on
// every open.
//
// ── INSTAGRAM ──────────────────────────────────────────────────────────
//
// There is no web publishing path. A "Share to Instagram" button would
// promise something the platform does not allow, so what is offered is the
// correctly sized Story image to download and post from the app, labelled
// as exactly that.
//
// ── OPEN GRAPH ─────────────────────────────────────────────────────────
//
// The link preview a platform shows is the recipient page's own generic,
// branded metadata — never the holder's name, credentials or milestone.
// Per-holder Open Graph images would require rendering a personalised image
// at a public, crawler-reachable URL, which means a public asset that
// outlives revocation. The downloadable image below is the personalised
// artifact, and the holder attaches it deliberately.

import { useState } from "react";
import {
  Copy,
  Download,
  Facebook,
  Linkedin,
  Mail,
  MessageCircle,
  Share2,
  X as XIcon,
} from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { SocialCardModel } from "@/lib/security-passport/social";
import { SHARE_FORMATS, buildSocialSvg, svgToPngBlob } from "@/lib/security-passport/social-export";
import type { ShareFormat } from "@/lib/security-passport/design/trust-system";

export interface LiveShareActionsProps {
  readonly shareUrl: string;
  readonly model: SocialCardModel;
  readonly qrDataUrl: string | null;
}

type Channel = "copy_link" | "native" | "linkedin" | "facebook" | "x" | "whatsapp" | "email";

const CHANNEL_META: readonly {
  readonly id: Channel;
  readonly labelKey: PassportCopyKey;
  readonly Icon: typeof Linkedin;
}[] = [
  { id: "copy_link", labelKey: "share.channel.copy_link", Icon: Copy },
  { id: "native", labelKey: "share.channel.native", Icon: Share2 },
  { id: "linkedin", labelKey: "share.channel.linkedin", Icon: Linkedin },
  { id: "facebook", labelKey: "share.channel.facebook", Icon: Facebook },
  { id: "x", labelKey: "share.channel.x", Icon: XIcon },
  { id: "whatsapp", labelKey: "share.channel.whatsapp", Icon: MessageCircle },
  { id: "email", labelKey: "share.channel.email", Icon: Mail },
];

function intentUrl(channel: Channel, shareUrl: string, subject: string): string | null {
  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(subject);
  switch (channel) {
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "whatsapp":
      return `https://wa.me/?text=${t}%20${u}`;
    case "email":
      return `mailto:?subject=${t}&body=${u}`;
    default:
      return null;
  }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on the next tick: revoking synchronously races the click in
  // Safari and produces an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LiveShareActions({ shareUrl, model, qrDataUrl }: LiveShareActionsProps) {
  const { pt, lang } = usePassportCopy();
  const [copied, setCopied] = useState(false);
  const [busyFormat, setBusyFormat] = useState<ShareFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subject = pt("rec.title");

  async function act(channel: Channel) {
    setError(null);
    try {
      if (channel === "copy_link") {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      }
      if (channel === "native") {
        if (navigator.share) {
          await navigator.share({ title: subject, url: shareUrl });
        } else {
          await navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }
        return;
      }
      const url = intentUrl(channel, shareUrl, subject);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      // An aborted native share is a user decision, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[passport] share action failed", err);
      setError(pt("common.error"));
    }
  }

  async function exportFormat(format: ShareFormat) {
    setBusyFormat(format);
    setError(null);
    try {
      const spec = SHARE_FORMATS.find((f) => f.id === format)!;
      const svg = buildSocialSvg(
        model,
        format,
        lang,
        {
          brand: pt("card.brand"),
          professionLine: `${lang === "sv" ? model.professionTitleSv : model.professionTitleEn} · ${model.jurisdictionCode}`,
          verifiedLabel: pt("assertion.verified"),
          yearsLabel: pt("recognition.years"),
          verifyAtSource: pt("card.verifyAtSource"),
          noVerifiedYet: pt("card.noVerifiedYet"),
          staleWarning: model.staleWarning ? pt("card.shareExpired") : null,
        },
        qrDataUrl,
      );

      const blob = await svgToPngBlob(svg, spec.width, spec.height);
      download(blob, `cqrityjob-passport-${format}.png`);
    } catch (err) {
      console.error("[passport] social export failed", err);
      setError(pt("common.error"));
    } finally {
      setBusyFormat(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold tracking-tight text-foreground">
        {pt("share.channels")}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {CHANNEL_META.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => void act(id)}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {id === "copy_link" && copied ? pt("sc.copied") : pt(labelKey)}
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-base font-semibold tracking-tight text-foreground">
        {pt("sc.imagesTitle")}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt("sc.imagesNote")}</p>

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

      <p className="mt-3 text-sm text-muted-foreground">{pt("share.instagramNote")}</p>

      {/* Platforms keep what they are given — said where the images are
          downloaded, not discovered after a revocation does less than the
          holder expected. */}
      <p className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        {pt("sc.retentionNote")}
      </p>

      <div className="mt-5 border-t border-border pt-4">
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

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
