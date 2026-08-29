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

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { translateFor } from "@/i18n/context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CareerCardPreview, cardAltText, renderCareerCardSvg } from "./CareerCard";
import {
  buildCareerCardData,
  CARD_DIMENSIONS,
  type CardDimensionScore,
  type CareerCardFormat,
} from "@/lib/career-discovery/v31/career-card";
import {
  downloadBlob,
  generateDiscoverQrDataUrl,
  shareCardImage,
  svgToPngBlob,
} from "@/lib/career-discovery/v31/career-card-export";
import type { RankedProfession } from "@/lib/career-discovery/v31/professions";

const FORMAT_ORDER: readonly CareerCardFormat[] = ["story", "square", "linkedin"];

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
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [shareResult, setShareResult] = useState<"shared" | "saved" | "unsupported" | null>(null);

  useEffect(() => {
    if (open) {
      onEvent?.("career_card_opened");
      setShareResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleShare() {
    setBusy("share");
    onEvent?.("share_initiated", { format });
    try {
      const blob = await exportPng();
      // Share the IMAGE file, not a bare URL: the card is the thing worth
      // sharing, and a downloaded/reposted PNG carries its own CQrityjob
      // branding and QR so it still means something out of context.
      const outcome = await shareCardImage(
        blob,
        `cqrityjob-career-card-${format}.png`,
        t("careerDiscovery.report.v31.card.shareText"),
      );
      if (outcome === "shared") setShareResult("shared");
      else if (outcome === "unsupported") {
        // Every desktop browser without file sharing lands here. Saving the
        // image is the honest fallback — no network-specific upload hacks.
        downloadBlob(blob, `cqrityjob-career-card-${format}.png`);
        onEvent?.("image_saved", { format, reason: "share_unsupported" });
        setShareResult("unsupported");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    setBusy("save");
    try {
      const blob = await exportPng();
      downloadBlob(blob, `cqrityjob-career-card-${format}.png`);
      onEvent?.("image_saved", { format });
      setShareResult("saved");
    } finally {
      setBusy(null);
    }
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

          {shareResult === "unsupported" && (
            <p className="text-sm text-muted-foreground">
              {t("careerDiscovery.report.v31.card.savedFallback")}
            </p>
          )}
          {shareResult === "shared" && (
            <p className="text-sm text-muted-foreground">
              {t("careerDiscovery.report.v31.card.shared")}
            </p>
          )}
          {shareResult === "saved" && (
            <p className="text-sm text-muted-foreground">
              {t("careerDiscovery.report.v31.card.savedFallback")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy !== null}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-subtle)] disabled:opacity-60"
          >
            {busy === "save" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {t("careerDiscovery.report.v31.card.saveImage")}
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={busy !== null}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] disabled:opacity-60"
          >
            {busy === "share" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Share2 className="h-4 w-4" aria-hidden="true" />
            )}
            {t("careerDiscovery.report.v31.card.share")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
