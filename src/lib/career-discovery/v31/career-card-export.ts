// Career Card export — rasterisation, native share, download. All
// browser-only (canvas, Image, navigator.share); nothing here runs on the
// server or in a test environment, which is why it is a separate module
// from career-card.ts's pure data shaping.

import QRCode from "qrcode";
import { DISCOVER_URL_PATH } from "./career-card";

/** A QR pointing at the public assessment landing page — never a private
 *  result URL (Execution Mandate §13, §25). */
export async function generateDiscoverQrDataUrl(origin: string): Promise<string> {
  const url = `${origin}${DISCOVER_URL_PATH}`;
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 256,
    color: { dark: "#0B1420", light: "#F4F7FBEE" },
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** Rasterises hand-assembled SVG markup to a PNG blob at its native
 *  dimensions. The SVG's only embedded resource is a data: URI (the QR
 *  code), so this never taints the canvas — everything is same-origin by
 *  construction. */
export async function svgToPngBlob(
  svgMarkup: string,
  width: number,
  height: number,
): Promise<Blob> {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("canvas export failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type ShareOutcome = "shared" | "cancelled" | "unsupported";

/** Web Share API with a file attachment, where the platform actually
 *  supports sharing files (Execution Mandate §11) — never a claim that a
 *  browser can post directly into Instagram/TikTok; that decision belongs
 *  to the OS share sheet the API hands off to. */
export async function shareCardImage(
  blob: Blob,
  filename: string,
  text: string,
): Promise<ShareOutcome> {
  if (typeof navigator === "undefined" || !navigator.share) return "unsupported";
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && !nav.canShare({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], text });
    return "shared";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "cancelled";
    throw err;
  }
}

/** What this browser can actually do with a Career Card.
 *
 *  ── WHY THIS EXISTS (2026-08-29, hosted UAT) ─────────────────────────
 *
 *  The card used to have one share button that called `navigator.share`
 *  and hoped. On a phone that is exactly right. On desktop Chrome/macOS
 *  `navigator.share` also EXISTS and also accepts files — so the button
 *  worked, and handed the candidate an OS sheet offering AirDrop, Mail
 *  and Messages. Technically correct Web Share behaviour, and useless for
 *  a card whose entire purpose is LinkedIn/Instagram/TikTok.
 *
 *  So capability alone is not enough to decide the experience: `canShare`
 *  is true in both places and means something different in each. The
 *  device class is the second half of the answer, and it is the ONLY
 *  reason `isMobileLike` exists — it never gates what the card contains,
 *  never gates the export, and never gates a social network. It picks
 *  between "hand off to the OS sheet, which on a phone really does list
 *  Instagram and TikTok" and "show our own panel".
 */
export interface CardShareCapabilities {
  /** Hand the PNG to the OS share sheet — a real social hand-off only on
   *  a phone, which is why the device class is part of this. */
  readonly canShareFiles: boolean;
  /** Put the PNG itself on the clipboard (async Clipboard API + image
   *  ClipboardItem). Absent in Firefox before 127 and in every insecure
   *  context. */
  readonly canCopyImage: boolean;
  /** Put the public link on the clipboard. */
  readonly canCopyLink: boolean;
}

/** The raw readings `detectCardShareCapabilities` takes off the platform,
 *  split out from the reading itself so the decision table below is a pure
 *  function that a test can drive through the whole matrix (see
 *  career-card-check.ts §9) without a browser. */
export interface ShareEnvironmentProbe {
  readonly hasShare: boolean;
  /** `navigator.canShare({ files })` said yes — or the browser has
   *  `share` but no `canShare` to ask, which we take at its word and let
   *  the call itself fail into the download fallback. */
  readonly canShareFiles: boolean;
  readonly hasClipboardWrite: boolean;
  readonly hasClipboardItem: boolean;
  readonly hasClipboardWriteText: boolean;
  readonly isSecureContext: boolean;
  /** Phone or tablet. Deliberately coarse — see the note above. */
  readonly isMobileLike: boolean;
}

/**
 * The decision table. Pure: same probe in, same capabilities out.
 *
 * Every clipboard capability is gated on a secure context because the async
 * Clipboard API simply does not exist off HTTPS/localhost, and a button
 * that throws on click is worse than a button that was never offered.
 */
export function shareCapabilitiesFrom(probe: ShareEnvironmentProbe): CardShareCapabilities {
  return {
    canShareFiles: probe.hasShare && probe.canShareFiles && probe.isMobileLike,
    canCopyImage: probe.isSecureContext && probe.hasClipboardWrite && probe.hasClipboardItem,
    canCopyLink: probe.isSecureContext && probe.hasClipboardWriteText,
  };
}

interface UaDataLike {
  readonly mobile?: boolean;
}

/** Coarse device class, best signal first:
 *
 *   1. `navigator.userAgentData.mobile` — the standardised replacement for
 *      UA sniffing, and the only one of these that is not a heuristic.
 *   2. The UA string, for Safari/Firefox, which ship no userAgentData.
 *   3. iPadOS 13+, which deliberately claims to be a Mac and is only
 *      distinguishable by having touch points.
 *
 * A wrong answer degrades gracefully in both directions: a phone misread as
 * desktop still gets Save/Copy/LinkedIn, and a desktop misread as a phone
 * gets the OS sheet it used to get anyway. */
function detectMobileLike(nav: Navigator): boolean {
  const uaData = (nav as Navigator & { userAgentData?: UaDataLike }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  const ua = nav.userAgent ?? "";
  if (/Android|iPhone|iPod|iPad|Mobile Safari|Opera Mini|IEMobile/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

/** Reads the live platform. Browser-only; returns an all-false probe
 *  anywhere `navigator` does not exist, so the panel degrades to
 *  "save the image", which always works. */
export function probeShareEnvironment(): ShareEnvironmentProbe {
  if (typeof navigator === "undefined") {
    return {
      hasShare: false,
      canShareFiles: false,
      hasClipboardWrite: false,
      hasClipboardItem: false,
      hasClipboardWriteText: false,
      isSecureContext: false,
      isMobileLike: false,
    };
  }
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const hasShare = typeof nav.share === "function";
  let canShareFiles = hasShare;
  if (hasShare && typeof nav.canShare === "function" && typeof File !== "undefined") {
    // A one-byte probe file. `canShare` inspects the type and count, not the
    // bytes, so this answers the same question the real card would.
    try {
      canShareFiles = nav.canShare({
        files: [new File([new Uint8Array(1)], "probe.png", { type: "image/png" })],
      });
    } catch {
      canShareFiles = false;
    }
  }
  return {
    hasShare,
    canShareFiles,
    hasClipboardWrite: typeof nav.clipboard?.write === "function",
    hasClipboardItem: typeof ClipboardItem !== "undefined",
    hasClipboardWriteText: typeof nav.clipboard?.writeText === "function",
    isSecureContext: typeof window === "undefined" ? false : window.isSecureContext !== false,
    isMobileLike: detectMobileLike(nav),
  };
}

export function detectCardShareCapabilities(): CardShareCapabilities {
  return shareCapabilitiesFrom(probeShareEnvironment());
}

/**
 * Put the rendered card on the clipboard as an image.
 *
 * Takes the blob as a PROMISE, not a blob, because Safari only honours a
 * clipboard write that is still inside the originating user gesture —
 * `await`ing the PNG first and writing second loses the gesture and the
 * write is rejected. `ClipboardItem` accepts a promise for exactly this,
 * so the rasterisation happens inside the write instead of before it.
 * Browsers that reject a promise value get a second, awaited attempt.
 *
 * Never throws: a refusal is reported as `false` and the caller says so and
 * points at "Save image", which needs no permission anywhere.
 */
export async function copyCardImageToClipboard(blob: Promise<Blob>): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof ClipboardItem === "undefined") {
    void blob.catch(() => undefined);
    return false;
  }
  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.write !== "function") {
    void blob.catch(() => undefined);
    return false;
  }
  try {
    await clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    try {
      await clipboard.write([new ClipboardItem({ "image/png": await blob })]);
      return true;
    } catch {
      return false;
    }
  }
}

/** Copy a bare URL. Same never-throws contract as the image copy. */
export async function copyLinkToClipboard(url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function linkedInShareUrl(pageUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`;
}

/**
 * Text-only share for the anonymous result, available before any profession
 * has cleared matching (unlike shareCardImage, which needs a rasterised
 * card) — Final Candidate Result Delivery & Save Flow Fix, section 3.
 *
 * Never the private report URL: `url` is always the public assessment
 * landing page (DISCOVER_URL_PATH), the same page a QR code on the Career
 * Card points at. There is no per-candidate report URL to share, by design
 * — see the Career Card's own privacy note.
 */
export async function shareResultText(
  title: string,
  text: string,
  url: string,
): Promise<ShareOutcome> {
  if (typeof navigator === "undefined" || !navigator.share) return "unsupported";
  try {
    await navigator.share({ title, text, url });
    return "shared";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "cancelled";
    throw err;
  }
}

/**
 * Fallback for shareResultText when the Web Share API is unavailable
 * (desktop browsers, mostly) — copies the same text+url to the clipboard so
 * the candidate can paste it wherever they like. Never throws: a clipboard
 * failure (permissions, insecure context) degrades to "nothing happened",
 * which the caller surfaces as a calm retry state, not a crash.
 */
export async function copyResultTextToClipboard(text: string, url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return true;
  } catch {
    return false;
  }
}
