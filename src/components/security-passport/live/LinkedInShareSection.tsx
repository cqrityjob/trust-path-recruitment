// Security Passport — the LinkedIn sharing experience.
//
// The evaluated-and-deferred preferred path (LinkedIn rendering the personal
// card as the link preview) is documented in
// docs/architecture/passport-linkedin-preview-evaluation.md. What ships here
// is the fallback, built to be honest rather than apologetic:
//
//   1. the holder previews the EXACT card LinkedIn's format needs (1200×630);
//   2. downloads it with one action;
//   3. copies or opens the live share link;
//   4. follows three plain steps to attach the image to the post.
//
// Two truths are stated instead of implied: the link's automatic preview is
// CQrityjob's generic branded card, not the personal one — attaching the
// image is a manual step this section never claims to automate — and social
// platforms may retain published or cached images after the link is
// withdrawn, which is exactly why the image says "verify at source".

import { useState } from "react";
import { Copy, Download, ExternalLink, Linkedin } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { SocialCardModel } from "@/lib/security-passport/social";
import { buildSocialSvg, svgToPngBlob } from "@/lib/security-passport/social-export";
import { shareFormat } from "@/lib/security-passport/design/trust-system";
import { SocialFrame } from "../social/SocialFrame";

export function LinkedInShareSection({
  shareUrl,
  model,
  qrDataUrl,
}: {
  shareUrl: string;
  model: SocialCardModel;
  qrDataUrl: string | null;
}) {
  const { pt, lang } = usePassportCopy();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadImage() {
    setBusy(true);
    setError(null);
    try {
      const spec = shareFormat("og");
      const svg = buildSocialSvg(
        model,
        "og",
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cqrityjob-passport-linkedin.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch (err) {
      console.error("[passport] linkedin image export failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("[passport] copy failed", err);
      setError(pt("common.error"));
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <Linkedin aria-hidden="true" className="h-4 w-4" />
        {pt("li.title")}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt("li.lead")}</p>

      {/* The exact artifact, at LinkedIn's own aspect ratio. */}
      <div className="mt-4">
        <SocialFrame model={model} format="og" previewWidth={480} />
      </div>

      <ol className="mt-5 space-y-4">
        <li className="flex flex-wrap items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground"
          >
            1
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{pt("li.step1")}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void downloadImage()}
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {downloaded ? pt("li.step1Done") : pt("li.step1Action")}
            </button>
          </div>
        </li>

        <li className="flex flex-wrap items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground"
          >
            2
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{pt("li.step2")}</p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              {copied ? pt("sc.copied") : pt("sc.copy")}
            </button>
          </div>
        </li>

        <li className="flex flex-wrap items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground"
          >
            3
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{pt("li.step3")}</p>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              {pt("li.step3Action")}
            </a>
          </div>
        </li>
      </ol>

      {/* What LinkedIn will actually show, stated rather than discovered. */}
      <p className="mt-5 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
        {pt("li.previewNote")}
      </p>

      {/* Platforms keep what they are given. Said before publishing. */}
      <p className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        {pt("sc.retentionNote")}
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
