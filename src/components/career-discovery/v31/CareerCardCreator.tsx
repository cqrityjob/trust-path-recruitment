// The Career Card creator — "Create my Career Card" (Execution Mandate §16,
// §20).
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────
//
// It is not a profession picker, and it is not a design editor. Until
// 2026-08-29 it opened on "Välj riktning" and asked the candidate to choose
// which of their recommendations the card should announce, plus a toggle for
// whether to show their Career DNA at all. Both were configuration of the
// RESULT, which is not the candidate's to configure: a card built from rank 3
// makes a claim the report does not make, and the two surfaces could then
// disagree about the same assessment.
//
// The card now derives from the canonical `professions.ranked` — the same
// Top 3, in the same order, that the report itself renders — so there is
// nothing about the result left to choose. What remains is genuinely
// presentational: an optional first name, and which canvas to export.
//
// ── AND IT IS NOT AN OS SHARE SHEET (2026-08-29, hosted UAT) ────────────
//
// It used to be, everywhere. One "Dela" button called `navigator.share`
// with the PNG attached, which is precisely right on a phone and precisely
// wrong on desktop Chrome/macOS — where the same API exists, accepts the
// same file, and opens a sheet offering AirDrop, Mail and Messages. Valid
// Web Share behaviour; not a career card being shared to LinkedIn.
//
// So the share sheet is now the MOBILE path only (see
// career-card-export.ts's CardShareCapabilities for why capability alone
// cannot make that call), and every platform gets a CQrityjob panel built
// out of things the browser can actually do: save the PNG, copy the PNG,
// copy the public link, open LinkedIn's own share flow with that link.
//
// ── WHAT THE PANEL IS NOT ALLOWED TO SAY ────────────────────────────────
//
// No button here posts to a social network, because no public, key-less
// mechanism to do that exists — LinkedIn's share-offsite endpoint takes a
// URL and nothing else, and Instagram and TikTok have no web share target
// at all. Adding an SDK or an OAuth scope to change that is out of scope
// by instruction and would be a much larger product decision besides.
// LinkedIn therefore opens with the LINK and says, in the same panel, that
// the image is not attached; Instagram and TikTok are plain guidance text
// with nothing to click, so no control can appear to work and do nothing.

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Link2, Linkedin, Loader2, Share2 } from "lucide-react";
import { translateFor } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CareerCardPreview, cardAltText, renderCareerCardSvg } from "./CareerCard";
import {
  buildCareerCardData,
  CARD_DIMENSIONS,
  DISCOVER_URL_PATH,
  type CardDimensionScore,
  type CareerCardFormat,
} from "@/lib/career-discovery/v31/career-card";
import {
  copyCardImageToClipboard,
  copyLinkToClipboard,
  detectCardShareCapabilities,
  downloadBlob,
  generateDiscoverQrDataUrl,
  linkedInShareUrl,
  shareCardImage,
  svgToPngBlob,
  type CardShareCapabilities,
} from "@/lib/career-discovery/v31/career-card-export";
import type { RankedProfession } from "@/lib/career-discovery/v31/professions";

const FORMAT_ORDER: readonly CareerCardFormat[] = ["story", "square", "linkedin"];

const K = "careerDiscovery.report.v31.card";

/** Every panel button is the same button. Declared once so a new action
 *  cannot quietly arrive styled — or sized — differently from the rest. */
const ACTION_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-subtle)] disabled:opacity-60";
const ACTION_PRIMARY_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] disabled:opacity-60";

type Busy = "share" | "save" | "copyImage" | "copyLink" | null;

export function CareerCardCreator({
  open,
  onOpenChange,
  ranked,
  dimensions,
  locale,
  definitionVersion,
  generatedAt,
  suggestedFirstName,
  onEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The canonical top 3 from the candidate's own frozen snapshot. Never a
   *  filtered, re-sorted or hand-picked list — see career-card.ts. */
  ranked: readonly RankedProfession[];
  /** `outputA.dimensions` from that same snapshot. */
  dimensions: readonly CardDimensionScore[];
  locale: "sv" | "en";
  definitionVersion: string;
  generatedAt: string;
  /** Prefilled into the name field when the account already knows a first
   *  name (Execution Mandate §9/§26). Always editable and always removable —
   *  the field is opt-OUT once prefilled, never a silent disclosure, and
   *  nothing else from the profile reaches the card. */
  suggestedFirstName?: string | null;
  /** Privacy-safe funnel events (Execution Mandate §34) — the host decides
   *  how/whether to record them; this component never tracks on its own. */
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
}) {
  // Bound to the `locale` prop, not the live site toggle — see
  // FeedbackForm.tsx / V31ReportView.tsx for why.
  const t = translateFor(locale);
  const [firstName, setFirstName] = useState(suggestedFirstName?.trim() ?? "");
  const [format, setFormat] = useState<CareerCardFormat>("story");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  /** The one place the panel speaks back. Always a dictionary key, never a
   *  hand-built sentence, so both locales stay in step — and every action
   *  below sets it on BOTH outcomes, which is what makes "clicked something
   *  and nothing happened" impossible. */
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  /** Null until the browser has been asked. Rendering the panel from `null`
   *  (server, first paint) offers only "Save image", which needs no
   *  capability at all, so nothing can flash in and out on hydration. */
  const [capabilities, setCapabilities] = useState<CardShareCapabilities | null>(null);
  /** The PUBLIC assessment page — the same URL the card's QR encodes, and
   *  deliberately never a per-candidate report link (there is none, by
   *  design; see career-card-export.ts and the report's own privacy note). */
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (open) {
      onEvent?.("career_card_opened");
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    setCapabilities(detectCardShareCapabilities());
    setShareUrl(`${window.location.origin}${DISCOVER_URL_PATH}`);
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let alive = true;
    void generateDiscoverQrDataUrl(window.location.origin).then((url) => {
      if (alive) setQrDataUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const cardData = useMemo(
    () =>
      buildCareerCardData({
        ranked,
        dimensions,
        locale,
        definitionVersion,
        generatedAt,
        firstName,
      }),
    [ranked, dimensions, locale, definitionVersion, generatedAt, firstName],
  );

  // Nothing to share without a recommendation. The host already gates on
  // this; belt and braces, so the modal can never render an empty card.
  if (ranked.length === 0) return null;

  async function exportPng(): Promise<Blob> {
    const { width, height } = CARD_DIMENSIONS[format];
    // The exported image is rasterised from the EXACT markup the preview
    // renders — same function, same data, same format — so "what you saw" and
    // "what you shared" cannot diverge.
    const svg = renderCareerCardSvg(cardData, format, qrDataUrl);
    return svgToPngBlob(svg, width, height);
  }

  const filename = `cqrityjob-career-card-${format}.png`;

  /** MOBILE ONLY. Offered when `canShareFiles` is true, which requires both
   *  a Web Share implementation that accepts files AND a phone/tablet —
   *  because on desktop the same sheet lists AirDrop and Mail, not the
   *  networks this card exists for. */
  async function handleShare() {
    setBusy("share");
    setNotice(null);
    onEvent?.("share_initiated", { format });
    try {
      const blob = await exportPng();
      // Share the IMAGE file, not a bare URL: the card is the thing worth
      // sharing, and a downloaded/reposted PNG carries its own CQrityjob
      // branding and QR so it still means something out of context.
      const outcome = await shareCardImage(blob, filename, t(`${K}.shareText` as TranslationKey));
      if (outcome === "shared") {
        setNotice(`${K}.shared` as TranslationKey);
      } else if (outcome === "unsupported") {
        // The capability probe said yes and the call disagreed. Rare, and
        // the honest answer is the same as everywhere else: save the image.
        downloadBlob(blob, filename);
        onEvent?.("image_saved", { format, reason: "share_unsupported" });
        setNotice(`${K}.savedFallback` as TranslationKey);
      }
      // "cancelled" says nothing on purpose — the candidate closed their own
      // sheet, and a notice about it would be the app narrating their click.
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setBusy("save");
    setNotice(null);
    try {
      const blob = await exportPng();
      downloadBlob(blob, filename);
      onEvent?.("image_saved", { format });
      setNotice(`${K}.savedFallback` as TranslationKey);
    } finally {
      setBusy(null);
    }
  }

  /** The PNG onto the clipboard, ready to paste into a LinkedIn post box or
   *  a message. Note what is NOT awaited here: `exportPng()` is handed over
   *  as a promise so the clipboard write still happens inside this click's
   *  user gesture — Safari rejects a write that resumes after an await. */
  async function handleCopyImage() {
    setBusy("copyImage");
    setNotice(null);
    const copied = await copyCardImageToClipboard(exportPng());
    if (copied) onEvent?.("card_image_copied", { format });
    setNotice((copied ? `${K}.imageCopied` : `${K}.imageCopyFailed`) as TranslationKey);
    setBusy(null);
  }

  async function handleCopyLink() {
    setBusy("copyLink");
    setNotice(null);
    const copied = await copyLinkToClipboard(shareUrl);
    if (copied) onEvent?.("card_link_copied", { format });
    setNotice((copied ? `${K}.linkCopied` : `${K}.linkCopyFailed`) as TranslationKey);
    setBusy(null);
  }

  /** LinkedIn's own public share flow, opened with the public link.
   *
   *  `share-offsite` is the current documented key-less mechanism and it
   *  accepts ONE parameter, a URL — there is no field for an image, so the
   *  PNG cannot ride along and the panel says so rather than letting the
   *  candidate assume it did. Attaching it for real would need the Share
   *  API and an OAuth scope, which this product has deliberately not added.
   *
   *  A blocked pop-up is reported, not swallowed: the whole point of this
   *  change is that no control here can look like it worked and do nothing. */
  function handleLinkedIn() {
    onEvent?.("card_linkedin_opened", { format });
    const opened =
      typeof window === "undefined"
        ? null
        : window.open(linkedInShareUrl(shareUrl), "_blank", "noopener,noreferrer");
    setNotice((opened ? `${K}.linkedInOpened` : `${K}.linkedInBlocked`) as TranslationKey);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("careerDiscovery.report.v31.card.title")}</DialogTitle>
          <DialogDescription>{t("careerDiscovery.report.v31.card.lede")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Preview first. The card is already complete the moment this
              opens — the fields below refine it, they do not build it. */}
          <div>
            <CareerCardPreview data={cardData} format={format} qrDataUrl={qrDataUrl} />
            <p className="sr-only">{cardAltText(cardData)}</p>
          </div>

          <div>
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("careerDiscovery.report.v31.card.format")}
            </span>
            <Tabs
              value={format}
              onValueChange={(v) => setFormat(v as CareerCardFormat)}
              className="mt-2"
            >
              <TabsList className="grid w-full grid-cols-3">
                {FORMAT_ORDER.map((f) => (
                  <TabsTrigger key={f} value={f}>
                    {t(`careerDiscovery.report.v31.card.format.${f}` as never)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div>
            <label
              htmlFor="career-card-first-name"
              className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
            >
              {t("careerDiscovery.report.v31.card.firstNameLabel")}
            </label>
            <Input
              id="career-card-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("careerDiscovery.report.v31.card.firstNamePlaceholder")}
              maxLength={40}
              className="mt-2"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("careerDiscovery.report.v31.card.firstNameHint")}
            </p>
          </div>

          {/* ── THE SHARE PANEL ────────────────────────────────────────
              Present on every platform, and the ONLY sharing surface on
              desktop. Actions appear when the browser can actually perform
              them; the two networks with no web mechanism at all appear as
              guidance, with nothing to click. */}
          <section className="rounded-xl border border-border bg-[color:var(--surface-subtle)] p-4">
            <h3 className="text-sm font-semibold text-foreground">{t(`${K}.share.panel`)}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t(`${K}.share.panelHint`)}</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {capabilities?.canShareFiles && (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={busy !== null}
                  className={ACTION_PRIMARY_CLASS}
                >
                  {busy === "share" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t(`${K}.share`)}
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy !== null}
                className={capabilities?.canShareFiles ? ACTION_CLASS : ACTION_PRIMARY_CLASS}
              >
                {busy === "save" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden="true" />
                )}
                {t(`${K}.saveImage`)}
              </button>

              {capabilities?.canCopyImage && (
                <button
                  type="button"
                  onClick={() => void handleCopyImage()}
                  disabled={busy !== null}
                  className={ACTION_CLASS}
                >
                  {busy === "copyImage" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t(`${K}.copyImage`)}
                </button>
              )}

              {capabilities?.canCopyLink && (
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  disabled={busy !== null}
                  className={ACTION_CLASS}
                >
                  {busy === "copyLink" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t(`${K}.copyLink`)}
                </button>
              )}

              <button
                type="button"
                onClick={handleLinkedIn}
                disabled={busy !== null || shareUrl === ""}
                className={ACTION_CLASS}
              >
                <Linkedin className="h-4 w-4" aria-hidden="true" />
                {t(`${K}.shareOnLinkedIn`)}
              </button>
            </div>

            {/* Said before the click, not after it — the candidate decides
                whether to save the image first knowing it will not travel
                with the post. */}
            <p className="mt-3 text-xs text-muted-foreground">{t(`${K}.linkedInHint`)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{t(`${K}.appGuidance`)}</p>
            {/* The link in full, always readable: a browser with no
                clipboard permission still leaves the candidate able to take
                it, and it shows exactly where the link goes. */}
            <p className="mt-2 text-xs text-muted-foreground">
              {t(`${K}.linkHint`)}{" "}
              <span className="break-all font-medium text-foreground">{shareUrl}</span>
            </p>

            <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-foreground">
              {notice ? t(notice) : ""}
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
