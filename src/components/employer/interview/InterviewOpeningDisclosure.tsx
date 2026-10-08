import { useT } from "@/i18n/context";

/** What actually happened to this plan, rather than the organisation's
 * current AI switch. Recording and transcription are a separate disclosure. */
export function InterviewOpeningDisclosure({ aiUsed }: { aiUsed: boolean }) {
  const { t } = useT();
  return (
    <div className="space-y-3 text-xs leading-relaxed" data-testid="iv-opening-disclosure">
      <div>
        <h3 className="font-medium text-foreground">{t("iiu.opening.preparation.title")}</h3>
        <p className="mt-1 text-muted-foreground">
          {t(aiUsed ? "iiu.opening.preparation.ai" : "iiu.opening.preparation.manual")}
        </p>
      </div>
      <div>
        <h3 className="font-medium text-foreground">{t("iiu.opening.recording.title")}</h3>
        <p className="mt-1 text-muted-foreground">{t("iiu.opening.recording.body")}</p>
      </div>
    </div>
  );
}
