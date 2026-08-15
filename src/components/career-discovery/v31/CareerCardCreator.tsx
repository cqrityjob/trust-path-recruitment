// The Career Card creator flow — "Create my Career Card" (Execution
// Mandate §16, §20).
//
// Deliberately small: pick ONE of the candidate's ACTUAL recommended
// professions (never an arbitrary one — the `matches` prop is always the
// same list the report already rendered), optional first name, optional
// indicator visibility, format tabs, preview, then Share / Save image. No
// design-editor scope creep.

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CareerCardPreview, cardAltText, renderCareerCardSvg } from "./CareerCard";
import {
  buildCareerCardData,
  CARD_DIMENSIONS,
  type CareerCardFormat,
} from "@/lib/career-discovery/v31/career-card";
import {
  downloadBlob,
  generateDiscoverQrDataUrl,
  linkedInShareUrl,
  shareCardImage,
  svgToPngBlob,
} from "@/lib/career-discovery/v31/career-card-export";
import type { DimensionId } from "@/lib/career-discovery/v31/dimensions";
import type { ProfessionMatch } from "@/lib/career-discovery/v31/professions";

const FORMAT_ORDER: readonly CareerCardFormat[] = ["story", "square", "linkedin"];

export function CareerCardCreator({
  open,
  onOpenChange,
  matches,
  initialProfessionId,
  dimensionScores,
  locale,
  definitionVersion,
  generatedAt,
  onEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only ever the candidate's own recommendations — never an arbitrary
   *  profession list. */
  matches: readonly ProfessionMatch[];
  initialProfessionId?: string;
  dimensionScores: Readonly<Record<DimensionId, number | null>>;
  locale: "sv" | "en";
  definitionVersion: string;
  generatedAt: string;
  /** Privacy-safe funnel events (Execution Mandate §34) — the host decides
   *  how/whether to record them; this component never tracks on its own. */
  onEvent?: (name: string, detail?: Record<string, unknown>) => void;
}) {
  const { t } = useT();
  const [professionId, setProfessionId] = useState(
    initialProfessionId ?? matches[0]?.professionId ?? "",
  );
  const [firstName, setFirstName] = useState("");
  const [showIndicators, setShowIndicators] = useState(true);
  const [format, setFormat] = useState<CareerCardFormat>("story");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [shareResult, setShareResult] = useState<"shared" | "saved" | "unsupported" | null>(null);

  useEffect(() => {
    if (open) {
      onEvent?.("career_card_opened");
      setProfessionId(initialProfessionId ?? matches[0]?.professionId ?? "");
      setShareResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProfessionId]);

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

  const match = matches.find((m) => m.professionId === professionId) ?? matches[0];

  const cardData = useMemo(() => {
    if (!match) return null;
    return buildCareerCardData({
      match,
      dimensionScores,
      locale,
      definitionVersion,
      generatedAt,
      firstName,
      showIndicators,
    });
  }, [match, dimensionScores, locale, definitionVersion, generatedAt, firstName, showIndicators]);

  if (!match || !cardData) return null;

  async function exportPng(): Promise<Blob> {
    const { width, height } = CARD_DIMENSIONS[format];
    const svg = renderCareerCardSvg(cardData!, format, qrDataUrl);
    return svgToPngBlob(svg, width, height);
  }

  async function handleShare() {
    setBusy("share");
    onEvent?.("share_initiated", { format });
    try {
      const blob = await exportPng();
      const outcome = await shareCardImage(
        blob,
        `cqrityjob-career-card-${format}.png`,
        t("careerDiscovery.report.v31.card.shareText"),
      );
      if (outcome === "shared") setShareResult("shared");
      else if (outcome === "unsupported") {
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
        </DialogHeader>

        <div className="space-y-5">
          {matches.length > 1 && (
            <div>
              <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("careerDiscovery.report.v31.card.chooseDirection")}
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {matches.map((m) => (
                  <button
                    key={m.professionId}
                    type="button"
                    onClick={() => setProfessionId(m.professionId)}
                    aria-pressed={m.professionId === professionId}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      m.professionId === professionId
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {locale === "sv" ? m.titleSv : m.titleEn}
                  </button>
                ))}
              </div>
            </div>
          )}

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
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="career-card-indicators" className="text-sm text-foreground">
              {t("careerDiscovery.report.v31.card.showIndicators")}
            </label>
            <Switch
              id="career-card-indicators"
              checked={showIndicators}
              onCheckedChange={setShowIndicators}
            />
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
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("careerDiscovery.report.v31.card.preview")}
            </p>
            <CareerCardPreview data={cardData} format={format} qrDataUrl={qrDataUrl} />
            <p className="sr-only">{cardAltText(cardData)}</p>
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

          <a
            href={linkedInShareUrl(
              typeof window !== "undefined"
                ? window.location.origin + "/security-career-assessment"
                : "",
            )}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onEvent?.("share_initiated", { format: "linkedin_link" })}
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            {t("careerDiscovery.report.v31.card.shareOnLinkedIn")}
          </a>
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
