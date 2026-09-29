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
// image shows. Nothing is posted on the holder's behalf.
//
// The image itself is drawn in the shared card's vocabulary from the selected
// credentials' own presentation (SocialCardSvg), and the preview is the
// download.
//
// ── WHERE THE IMAGE GOES WHEN THE HOLDER PRESSES SHARE ─────────────────
//
// The image is what is being shared, so every way out hands it over, and
// says truthfully how:
//
//   * the device's share sheet (the Web Share API with files) is given the
//     PNG file itself -- the one path that attaches the image, and the only
//     one that says so;
//   * a platform button downloads the exact image, opens the platform where
//     there is a page to post from, and says to add the image to the post. No
//     web address can carry a file, so it never claims the image went along.
//
// The PNGs are made ahead of the press from exactly the SVGs on screen, so a
// press hands them over while the browser still counts it as the holder's own
// action (a share sheet and a new tab both need that), and so what is shared
// is, pixel for pixel, what the preview shows.
//
// ── ONE HOLDER, ONE PASSPORT, ONE IMAGE ────────────────────────────────
//
// Whatever the holder selects is ONE Passport image: four credentials, six,
// eleven. The drawing groups them by where they apply and adapts its density
// (SocialCardSvg); nothing selected is dropped, and nothing is ever split
// into "image 1 of 2". One preview, one PNG, one file to the share sheet.
// The previous version drew three to an image and a larger selection as a
// set; that mistook the drawing's columns for a product rule.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Download, Share2 } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { passportT, type PassportCopyKey, type PassportLang } from "@/lib/security-passport/i18n";
import type { SocialCardModel } from "@/lib/security-passport/social";
import type { PassportHolder } from "@/lib/security-passport/types";
import { SHARE_FORMATS, svgToPngBlob } from "@/lib/security-passport/social-export";
import { shareFormat, type ShareFormat } from "@/lib/security-passport/design/trust-system";
import { downloadBlob, socialImageFileName } from "@/lib/security-passport/share-image";
import {
  deviceShareData,
  FEED_CHANNELS,
  platformPlan,
  type ImageDelivery,
  type PlatformPlan,
  type ShareChannel,
} from "@/lib/security-passport/share-channels";
import { SocialFrame } from "../social/SocialFrame";
import { PassportGroupList } from "../PassportGroups";
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

/** The PNG made from exactly the SVG the preview shows. */
interface Prepared {
  readonly svg: string;
  readonly file: File;
}

/** What the holder was told about the last hand-over, and where it was said. */
interface Notice {
  readonly key: PassportCopyKey;
  readonly delivery: ImageDelivery;
}

/** Whether the frame's SVG is the Passport in this format. A frame still
 *  showing the previous format does not count. */
function isCurrent(svg: string | null, format: ShareFormat): svg is string {
  return svg !== null && svg.includes(`data-social-card="${format}"`);
}

/** Whether the drawing reports that the whole Passport fits this format at
 *  the readability floor. The image is complete either way; this decides
 *  whether the page says the format is crowded. */
function drawingFits(svg: string): boolean {
  return !svg.includes('data-passport-fits="false"');
}

export function SocialShareFlow({
  chooser,
  hasCandidates,
  selectedCount,
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

  // The one SVG the frame shows.
  const [drawn, setDrawn] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  /** A platform press waiting for its format to be drawn: Instagram posts the
   *  Story image, switched into the preview first and handed over as drawn. */
  const [pending, setPending] = useState<PlatformPlan | null>(null);

  const onImage = useCallback(
    (svg: string | null) => setDrawn((prev) => (prev === svg ? prev : svg)),
    [],
  );
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

  const svg = isCurrent(drawn, format) ? drawn : null;

  // Rasterise exactly that SVG once, ahead of any press.
  useEffect(() => {
    if (!svg) return;
    if (prepared && prepared.svg === svg) return;
    let alive = true;
    const spec = shareFormat(format);
    void svgToPngBlob(svg, spec.width, spec.height)
      .then((blob) => {
        if (!alive) return;
        setPrepared({
          svg,
          file: new File([blob], socialImageFileName(format), { type: "image/png" }),
        });
      })
      .catch((err) => {
        console.error("[passport] social image export failed", err);
        if (alive) setError(pt("common.error"));
      });
    return () => {
      alive = false;
    };
  }, [svg, format, prepared, pt]);

  /** The file of the image on screen, or null while it is being made. */
  const file = svg && prepared && prepared.svg === svg ? prepared.file : null;
  const crowded = svg !== null && !drawingFits(svg);

  // A new image -- another selection, format, language or link -- and what
  // was said about the previous one no longer holds.
  useEffect(() => {
    setDownloaded(false);
    setNotice(null);
  }, [file]);

  function download() {
    if (!file) return;
    setError(null);
    downloadBlob(file, file.name);
    setDownloaded(true);
  }

  async function shareFromDevice(which: File) {
    setError(null);
    setNotice(null);
    const data = deviceShareData(which, postText, model?.verifyUrl ?? null);
    if (!navigator.canShare?.(data)) {
      setError(pt("common.error"));
      return;
    }
    try {
      await navigator.share(data);
      setNotice({ key: "social.device.done", delivery: "attached" });
    } catch (err) {
      // An aborted share sheet is a decision, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[passport] device share failed", err);
      setError(pt("common.error"));
    }
  }

  /** The image to the holder, then the platform, then the truth about it. */
  const deliver = useCallback((plan: PlatformPlan, which: File) => {
    downloadBlob(which, which.name);
    setDownloaded(true);
    if (plan.url) {
      if (plan.url.startsWith("mailto:")) window.location.href = plan.url;
      else window.open(plan.url, "_blank", "noopener,noreferrer");
    }
    setNotice({ key: plan.noticeKey, delivery: plan.delivery });
  }, []);

  useEffect(() => {
    if (!pending || !file || format !== pending.format) return;
    setPending(null);
    deliver(pending, file);
  }, [pending, file, format, deliver]);

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
    if (channel === "copy_link") {
      void copyLink();
      return;
    }
    if (channel === "native") return;
    const plan = platformPlan(channel, model?.verifyUrl ?? null, postText);
    if (plan.format && plan.format !== format) {
      setNotice(null);
      setFormat(plan.format);
      setPending(plan);
      return;
    }
    if (!file) return;
    deliver(plan, file);
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
      </section>

      {/* ── 2 · The image, as it will be shared ────────────────────── */}
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
              // ONE Passport: one frame, whatever the selection's size.
              <figure data-social-passport className="min-w-0">
                <SocialFrame
                  model={model}
                  format={format}
                  previewWidth={format === "story" ? 360 : 560}
                  lang={imageLang}
                  onImage={onImage}
                />
                {/* The same Passport in words: every group and every
                    credential, so a reader who cannot see the drawing is told
                    exactly what it shows. */}
                <figcaption>
                  <PassportGroupList
                    credentials={model.credentials}
                    lang={imageLang}
                    className="mt-4"
                  />
                </figcaption>
              </figure>
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
          {crowded ? (
            <p
              role="status"
              data-social-crowded={format}
              className="mt-1 text-sm leading-relaxed text-amber-700 dark:text-amber-300"
            >
              {pt("social.notFitting")}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── 3 · The image to the post ──────────────────────────────── */}
      {selectedCount > 0 && model ? (
        <section aria-labelledby="soc-share" data-social-share>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            03
          </p>
          <h2 id="soc-share" className="mt-1 text-lg font-semibold text-foreground">
            {pt("social.step.share")}
          </h2>

          {/* The device's share sheet: the one path that attaches the image. */}
          {canShareFiles ? (
            <div className="mt-3">
              <button
                type="button"
                data-social-device
                onClick={() => file && void shareFromDevice(file)}
                disabled={!file}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
              >
                <Share2 aria-hidden="true" className="h-4 w-4" />
                {pt("social.device")}
              </button>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {pt("social.device.hint")}
              </p>
              {notice?.delivery === "attached" ? (
                <p
                  role="status"
                  data-social-notice="attached"
                  className="mt-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
                >
                  {pt(notice.key)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-social-download
              onClick={download}
              disabled={!file}
              className={
                canShareFiles
                  ? "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
                  : "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
              }
            >
              {downloaded ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Download aria-hidden="true" className="h-4 w-4" />
              )}
              {downloaded ? pt("social.downloaded") : pt("social.download")}
            </button>
          </div>
          {!file && previewState !== "failed" ? (
            <p role="status" data-social-preparing className="mt-2 text-sm text-muted-foreground">
              {pt("social.preparing")}
            </p>
          ) : null}

          {/* A platform: the image as a download, the platform's page, and
              what the holder still has to do. */}
          <h3 className="mt-6 text-sm font-semibold text-foreground">
            {pt("social.platforms.title")}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("social.platformsHint")}
          </p>
          <ul
            data-social-platforms
            className="mt-3 overflow-hidden rounded-xl border border-border bg-card"
          >
            {channels.map(({ id, labelKey }, i) => {
              const { Icon, colour } = CHANNEL_ICON[id];
              const switchesFormat = id === "instagram" && format !== "story";
              return (
                <li key={id} className={i > 0 ? "border-t border-border" : undefined}>
                  <button
                    type="button"
                    data-social-channel={id}
                    onClick={() => open(id)}
                    disabled={pending !== null || (id !== "copy_link" && !file && !switchesFormat)}
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
          {notice?.delivery === "added_by_holder" ? (
            <p
              role="status"
              data-social-notice="added_by_holder"
              className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
            >
              {pt(notice.key)}
            </p>
          ) : null}
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
