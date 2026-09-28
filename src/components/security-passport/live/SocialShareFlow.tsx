// Security Passport — "Dela på sociala medier", on the sharing page.
//
// ── WHAT THIS RECONNECTS ───────────────────────────────────────────────
//
// Nothing here is new machinery. The image pipeline (SocialFrame, the four
// SHARE_FORMATS, `svgToPngBlob`, `downloadBlob`), the platform list and its
// intents (share-channels.ts, SharePanel's channel marks), the Story image
// behind "Instagram", the device share with the image attached and the
// LinkedIn profile entry were all built for the sharing page and fell out of
// it when the page became choose-preview-send (1a732ebd). They come back as
// the second of the page's two choices.
//
// ── WHAT CHANGED ABOUT THEM, AND WHY ───────────────────────────────────
//
// They used to put the private share link and its QR code into every image
// and every post. A public post is not addressed to anyone, and a platform
// keeps what it is given after the link is revoked. So an image carries no
// link unless the holder creates one FOR it, sees it drawn in the preview and
// ticks the box that puts it there -- and that link opens exactly what the
// image shows. Every platform button opens a composer or a page for the holder
// to post from; nothing is posted on their behalf.
//
// The image itself is drawn in the shared card's vocabulary from the selected
// credentials' own presentation (SocialCardSvg), and the preview is the
// download.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Download, Share2 } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { passportT, type PassportCopyKey, type PassportLang } from "@/lib/security-passport/i18n";
import type { SocialCardModel } from "@/lib/security-passport/social";
import type { PassportHolder } from "@/lib/security-passport/types";
import { SHARE_FORMATS, svgToPngBlob } from "@/lib/security-passport/social-export";
import { shareFormat, type ShareFormat } from "@/lib/security-passport/design/trust-system";
import { downloadBlob } from "@/lib/security-passport/share-image";
import {
  FEED_CHANNELS,
  shareIntentUrl,
  type ShareChannel,
} from "@/lib/security-passport/share-channels";
import { SocialFrame } from "../social/SocialFrame";
import { CHANNEL_ICON } from "./channel-icons";
import { LinkedInProfileSection } from "./LinkedInProfileSection";

type LoadState = "loading" | "ready" | "failed";

export interface SocialLinkControls {
  /** The link created for this image, while its selection still matches. */
  readonly url: string | null;
  /** A link exists but was created for a different selection. */
  readonly stale: boolean;
  readonly include: boolean;
  readonly onInclude: (include: boolean) => void;
  readonly expiryDays: number;
  readonly expiryChoices: readonly { readonly days: number; readonly labelKey: PassportCopyKey }[];
  readonly recommendedDays: number;
  readonly onExpiry: (days: number) => void;
  readonly creating: boolean;
  readonly error: PassportCopyKey | null;
  readonly onCreate: () => void;
}

export function SocialShareFlow({
  chooser,
  hasCandidates,
  selectedCount,
  limitReached,
  previewState,
  model,
  notDrawn,
  imageLang,
  onImageLang,
  holder,
  link,
}: {
  /** The selection list, the same component the link flow uses. */
  chooser: ReactNode;
  hasCandidates: boolean;
  selectedCount: number;
  limitReached: boolean;
  previewState: LoadState;
  /** Null until the selection's presentation has been read. */
  model: SocialCardModel | null;
  /** Something selected is not drawn: it is not publishable on an image. */
  notDrawn: boolean;
  imageLang: PassportLang;
  onImageLang: (lang: PassportLang) => void;
  /** For the LinkedIn profile entry, already reduced to the selection. */
  holder: PassportHolder;
  link: SocialLinkControls;
}) {
  const { pt } = usePassportCopy();
  const [format, setFormat] = useState<ShareFormat>("square");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  /** "Instagram" was pressed: download the Story image once the frame has
   *  drawn it, so the file is the one on screen. */
  const [storyPending, setStoryPending] = useState(false);

  const onImage = useCallback((svg: string | null) => setImage(svg), []);
  const imagePt = useCallback((key: PassportCopyKey) => passportT(key, imageLang), [imageLang]);
  const postText = imagePt("social.postText");

  useEffect(() => {
    try {
      setCanShareFiles(
        typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [new File([""], "p.png", { type: "image/png" })] }),
      );
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  // A new format, selection or link is a new image; "Nedladdad" was about
  // the previous one.
  useEffect(() => setDownloaded(false), [image]);

  async function download() {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const spec = shareFormat(format);
      downloadBlob(
        await svgToPngBlob(image, spec.width, spec.height),
        `cqrityjob-passport-${format}.png`,
      );
      setDownloaded(true);
    } catch (err) {
      console.error("[passport] social image export failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  // Instagram has no web publishing path: what it gets is the Story image,
  // switched into the preview first and downloaded as drawn there.
  useEffect(() => {
    if (!storyPending || !image?.includes('data-social-card="story"')) return;
    setStoryPending(false);
    const spec = shareFormat("story");
    void svgToPngBlob(image, spec.width, spec.height)
      .then((blob) => downloadBlob(blob, "cqrityjob-passport-story.png"))
      .catch((err) => {
        console.error("[passport] story image export failed", err);
        setError(pt("common.error"));
      });
  }, [storyPending, image, pt]);

  async function shareFromDevice() {
    if (!image || !model) return;
    setError(null);
    try {
      const spec = shareFormat(format);
      const blob = await svgToPngBlob(image, spec.width, spec.height);
      const file = new File([blob], `cqrityjob-passport-${format}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: postText,
          text: postText,
          ...(model.verifyUrl ? { url: model.verifyUrl } : {}),
        });
        return;
      }
      downloadBlob(blob, file.name);
    } catch (err) {
      // An aborted share sheet is a decision, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[passport] device share failed", err);
      setError(pt("common.error"));
    }
  }

  async function copyLink() {
    if (!model?.verifyUrl) return;
    try {
      await navigator.clipboard.writeText(model.verifyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(pt("sel.copy.failed"));
    }
  }

  function open(channel: ShareChannel) {
    setError(null);
    if (channel === "instagram") {
      setFormat("story");
      setStoryPending(true);
      return;
    }
    if (channel === "copy_link") {
      void copyLink();
      return;
    }
    const url = shareIntentUrl(channel, model?.verifyUrl ?? null, postText, postText);
    if (!url) return;
    if (url.startsWith("mailto:")) window.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
  }

  const channels = FEED_CHANNELS.filter((c) => c.id !== "copy_link" || Boolean(model?.verifyUrl));

  return (
    <div data-social-flow className="space-y-7">
      {/* ── 1 · What the image shows ───────────────────────────────── */}
      <section aria-labelledby="soc-choose">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          01
        </p>
        <h2 id="soc-choose" className="mt-1 text-lg font-semibold text-foreground">
          {pt("social.step.choose")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {pt("social.onlyPublishable")}
        </p>
        {hasCandidates ? (
          chooser
        ) : (
          <p
            data-social-empty
            className="mt-3 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-sm leading-relaxed text-foreground"
          >
            {pt("social.empty")}
          </p>
        )}
        {limitReached ? (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {pt("social.limitReached")}
          </p>
        ) : null}
      </section>

      {/* ── 2 · The image, as it will be downloaded ────────────────── */}
      {selectedCount > 0 ? (
        <section aria-labelledby="soc-preview">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            02
          </p>
          <h2 id="soc-preview" className="mt-1 text-lg font-semibold text-foreground">
            {pt("social.step.preview")}
          </h2>
          <fieldset className="mt-3 min-w-0">
            <legend className="text-sm font-medium text-foreground">{pt("social.format")}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SHARE_FORMATS.map((spec) => (
                <label
                  key={spec.id}
                  data-social-format={spec.id}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                >
                  <input
                    type="radio"
                    name="soc-format"
                    value={spec.id}
                    checked={format === spec.id}
                    onChange={() => setFormat(spec.id)}
                    className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  {pt(spec.labelKey as PassportCopyKey)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4">
            {previewState === "failed" ? (
              <p role="alert" className="text-sm leading-relaxed text-foreground">
                {pt("sel.error.preview")}
              </p>
            ) : model ? (
              <SocialFrame
                model={model}
                format={format}
                previewWidth={format === "story" ? 360 : 560}
                lang={imageLang}
                onImage={onImage}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
            )}
          </div>
          <p
            data-social-link-state={model?.verifyUrl ? "included" : "none"}
            className="mt-3 text-sm leading-relaxed text-muted-foreground"
          >
            {pt(model?.verifyUrl ? "social.linkInImage" : "social.noLinkInImage")}
          </p>
          {notDrawn ? (
            <p
              role="status"
              className="mt-1 text-sm leading-relaxed text-amber-700 dark:text-amber-300"
            >
              {pt("social.notDrawn")}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── 3 · Download, then post it yourself ────────────────────── */}
      {selectedCount > 0 && model ? (
        <section aria-labelledby="soc-share">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            03
          </p>
          <h2 id="soc-share" className="mt-1 text-lg font-semibold text-foreground">
            {pt("social.step.share")}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-social-download
              onClick={() => void download()}
              disabled={!image || busy}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {downloaded ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Download aria-hidden="true" className="h-4 w-4" />
              )}
              {downloaded ? pt("social.downloaded") : pt("social.download")}
            </button>
            {canShareFiles ? (
              <button
                type="button"
                data-social-device
                onClick={() => void shareFromDevice()}
                disabled={!image}
                className="inline-flex h-12 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Share2 aria-hidden="true" className="h-4 w-4" />
                {pt("sp.deviceShare")}
              </button>
            ) : null}
          </div>

          <ul
            data-social-platforms
            className="mt-4 overflow-hidden rounded-xl border border-border bg-card"
          >
            {channels.map(({ id, labelKey }, i) => {
              const { Icon, colour } = CHANNEL_ICON[id];
              return (
                <li key={id} className={i > 0 ? "border-t border-border" : undefined}>
                  <button
                    type="button"
                    data-social-channel={id}
                    onClick={() => open(id)}
                    disabled={id === "instagram" && storyPending}
                    className="flex min-h-[52px] w-full items-center gap-4 px-5 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
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
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {pt("social.platformsHint")}
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Everything else, one disclosure down ───────────────────── */}
      {hasCandidates ? (
        <details
          data-social-more
          className="group overflow-hidden rounded-xl border border-border bg-card"
        >
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
            <span className="min-w-0 flex-1">{pt("social.more")}</span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>

          <div className="space-y-6 border-t border-border px-5 py-5">
            <fieldset>
              <legend className="text-sm font-medium text-foreground">
                {pt("social.language")}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["sv", "en"] as const).map((code) => (
                  <label
                    key={code}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                  >
                    <input
                      type="radio"
                      name="soc-lang"
                      value={code}
                      checked={imageLang === code}
                      onChange={() => onImageLang(code)}
                      className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    {pt(code === "sv" ? "sel.language.sv" : "sel.language.en")}
                  </label>
                ))}
              </div>
            </fieldset>

            <div data-social-link-section>
              <h3 className="text-sm font-semibold text-foreground">{pt("social.link.title")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pt("social.link.body")}
              </p>

              {link.url ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-foreground">{pt("social.link.created")}</p>
                  <input
                    readOnly
                    data-social-link-field
                    value={link.url}
                    aria-label={pt("sel.created.link")}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      data-social-link-include
                      checked={link.include}
                      onChange={(e) => link.onInclude(e.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    <span className="text-sm text-foreground">{pt("social.link.include")}</span>
                  </label>
                  {link.include ? (
                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {copied ? (
                        <Check aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <Copy aria-hidden="true" className="h-4 w-4" />
                      )}
                      {copied ? pt("sc.copied") : pt("sc.copy")}
                    </button>
                  ) : null}
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {pt("social.link.revoke")}
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {link.stale ? (
                    <p
                      role="status"
                      className="text-sm leading-relaxed text-amber-700 dark:text-amber-300"
                    >
                      {pt("social.link.stale")}
                    </p>
                  ) : null}
                  <fieldset>
                    <legend className="text-sm font-medium text-foreground">
                      {pt("sc.expiry")}
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {link.expiryChoices.map((c) => (
                        <label
                          key={c.days}
                          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                        >
                          <input
                            type="radio"
                            name="soc-link-expiry"
                            value={c.days}
                            checked={link.expiryDays === c.days}
                            onChange={() => link.onExpiry(c.days)}
                            className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          />
                          {pt(c.labelKey)}
                          {c.days === link.recommendedDays ? (
                            <span className="text-muted-foreground">({pt("sel.recommended")})</span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {link.error ? (
                    <p role="alert" className="text-sm leading-relaxed text-destructive">
                      {pt(link.error)}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-social-link-create
                    onClick={link.onCreate}
                    disabled={link.creating || selectedCount === 0}
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {link.creating ? pt("social.link.creating") : pt("social.link.create")}
                  </button>
                </div>
              )}
            </div>

            {/* A profile entry links to the page behind a link, so it exists
                only once there is one -- for exactly what the image shows. */}
            {link.url ? <LinkedInProfileSection holder={holder} shareUrl={link.url} /> : null}

            <div>
              <h3 className="text-sm font-semibold text-foreground">{pt("social.aboutImage")}</h3>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
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
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {pt("sc.retentionNote")}
              </p>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
