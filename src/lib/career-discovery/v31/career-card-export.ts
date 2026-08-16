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
