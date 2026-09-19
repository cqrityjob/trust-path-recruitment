// "Visa innehåll" — the questions a candidate would get, with why each is
// asked, before anything is started.
//
// Security-vetting questions are shown to the appointed security function
// only; anyone else sees each domain and how many questions it holds, never
// the wording. That is the database's decision (bcp_method_preview), and this
// component shows exactly what came back.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  listAssignableBesktExposureProfiles,
  type BesktAssignableMethod,
} from "@/lib/beskt/candidate-preparation.functions";
import { getBesktMethodPreview, type BesktMode } from "@/lib/beskt/complete.functions";

export function BesktQuestionPreview({
  employerId,
  methodVersionId,
  exposureProfileId,
}: {
  readonly employerId: string;
  readonly methodVersionId: string;
  readonly exposureProfileId: string;
}) {
  const { t, lang } = useT();
  const previewFn = useServerFn(getBesktMethodPreview);
  const preview = useQuery({
    queryKey: ["beskt", "preview", employerId, methodVersionId, exposureProfileId],
    queryFn: () => previewFn({ data: { employerId, methodVersionId, exposureProfileId } }),
    retry: false,
  });

  if (preview.isPending)
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {t("beskt.library.loading")}
      </p>
    );
  if (preview.isError)
    return (
      <Alert variant="destructive" className="mt-3">
        <AlertDescription>{t(besktErrorKey(preview.error))}</AlertDescription>
      </Alert>
    );

  const total = preview.data.sections.reduce((n, s) => n + s.itemCount, 0);
  return (
    <div className="mt-3 space-y-4" data-testid="beskt-question-preview">
      <p className="text-xs text-muted-foreground">
        {t("beskt.preview.count").replace("{n}", String(total))} · {t("beskt.preview.followUpNote")}
      </p>
      {!preview.data.wordingVisible ? (
        <Alert>
          <Lock aria-hidden="true" className="h-4 w-4" />
          <AlertDescription>{t("beskt.preview.vettingWithheld")}</AlertDescription>
        </Alert>
      ) : null}
      {preview.data.sections.map((s) => (
        <section key={s.sectionKey} data-testid={`beskt-preview-section-${s.sectionKey}`}>
          <h4 className="text-sm font-semibold">
            {(lang === "sv" ? s.titleSv : (s.titleEn ?? s.titleSv)) ?? s.sectionKey}{" "}
            <span className="font-normal text-muted-foreground">({s.itemCount})</span>
          </h4>
          {s.items.length > 0 ? (
            <ol className="mt-2 space-y-2">
              {s.items.map((i) => (
                <li key={i.itemKey} className="rounded-md border p-2.5 text-sm">
                  <p>
                    {i.isFollowUp ? (
                      <Badge variant="outline" className="mr-1.5 font-normal">
                        {t("beskt.preview.followUp")}
                      </Badge>
                    ) : null}
                    {(lang === "sv" ? i.wordingSv : (i.wordingEn ?? i.wordingSv)) ?? i.itemKey}
                  </p>
                  {(lang === "sv" ? i.purposeSv : (i.purposeEn ?? i.purposeSv)) ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("beskt.preview.why")}:{" "}
                      {lang === "sv" ? i.purposeSv : (i.purposeEn ?? i.purposeSv)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function BesktPreviewDialog({
  open,
  onOpenChange,
  employerId,
  methods,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly employerId: string;
  readonly methods: readonly BesktAssignableMethod[];
}) {
  const { t, lang } = useT();
  const profilesFn = useServerFn(listAssignableBesktExposureProfiles);
  const modes = Array.from(new Set(methods.map((m) => m.mode as BesktMode)));
  const [mode, setMode] = useState<BesktMode>(modes[0] ?? "recruitment_support");
  const method = methods.find((m) => m.mode === mode) ?? null;
  const profiles = useQuery({
    queryKey: ["beskt", "preview", "profiles", employerId, method?.methodVersionId],
    queryFn: () => profilesFn({ data: { employerId, methodVersionId: method!.methodVersionId } }),
    enabled: open && Boolean(method),
    retry: false,
  });
  const profile = profiles.data?.[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto"
        data-testid="beskt-preview-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("beskt.preview.title")}</DialogTitle>
          <DialogDescription>{t("beskt.preview.lede")}</DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label={t("beskt.startDialog.purpose")}
        >
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`min-h-[44px] rounded-md border px-3 text-sm ${
                mode === m ? "border-foreground font-medium" : "border-border"
              }`}
              onClick={() => setMode(m)}
              data-testid={`beskt-preview-purpose-${m}`}
            >
              {t(
                m === "recruitment_support"
                  ? "beskt.purpose.recruitment"
                  : "beskt.purpose.securityVetting",
              )}
            </button>
          ))}
        </div>
        {method ? (
          <p className="text-xs text-muted-foreground">
            {(lang === "sv" ? method.nameSv : (method.nameEn ?? method.nameSv)) ?? method.packSlug}{" "}
            · v{method.versionNumber}
          </p>
        ) : null}
        {method && profile ? (
          <BesktQuestionPreview
            employerId={employerId}
            methodVersionId={method.methodVersionId}
            exposureProfileId={profile.exposureProfileId}
          />
        ) : profiles.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.library.loading")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
