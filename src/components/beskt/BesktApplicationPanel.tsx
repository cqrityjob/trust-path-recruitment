// BESKT on one application: start a preparation, and read back what the
// candidate submitted.
//
// ── WHAT THIS PANEL MAY SAY ─────────────────────────────────────────────
//
// The candidate's own words, their explicit omitted / discuss-orally states,
// the method and version used, and the governed topics the interview still
// needs to cover. That is a RESTATEMENT of what the candidate said.
//
// ── WHAT IT MUST NEVER SAY ──────────────────────────────────────────────
//
// Anything the candidate did not say. No score, no level, no ranking, no
// completeness judgement, no suitability, credibility or truthfulness signal,
// no recommendation, no report, no colour that reads as risk. The database
// has no column for any of it and this panel has no place to put it.
//
// Omission is presented as a NEUTRAL state and grouped with "to cover in the
// interview", never as a gap, a warning or a flag — PR 1 section 7 forbids
// reading a voluntary omission as negative evidence, and a red badge would be
// exactly that, in CSS.
//
// ── THE DRAFT BOUNDARY ──────────────────────────────────────────────────
//
// While a preparation is unsubmitted the readback returns `answers: null` —
// absent, not empty. The panel renders that as "nothing to read yet" and
// cannot accidentally show a partial draft, because it was never sent one.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ClipboardList,
  Info,
  Loader2,
  MessageSquare,
  SkipForward,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n/context";
import {
  getBesktEmployerReadback,
  listAssignableBesktExposureProfiles,
  listAssignableBesktMethods,
  listEmployerBesktPreparations,
  startBesktPreparation,
  type BesktLifecycleState,
  type BesktSubmittedAnswer,
} from "@/lib/beskt/candidate-preparation.functions";

const STATE_KEY = {
  assigned: "beskt.readback.state.assigned",
  notice_acknowledged: "beskt.readback.state.notice_acknowledged",
  in_progress: "beskt.readback.state.in_progress",
  submitted: "beskt.readback.state.submitted",
  cancelled: "beskt.readback.state.cancelled",
} as const satisfies Record<BesktLifecycleState, string>;

/** The candidate's own value, rendered exactly as they gave it. */
function AnswerValue({ answer }: { readonly answer: BesktSubmittedAnswer }) {
  const { t, lang } = useT();
  if (answer.responseState === "omitted") {
    return <span className="text-muted-foreground">{t("beskt.readback.reason.omitted")}</span>;
  }
  if (answer.responseState === "discuss_orally") {
    return (
      <span className="text-muted-foreground">{t("beskt.readback.reason.discuss_orally")}</span>
    );
  }
  if (answer.optionLabels.length > 0) {
    return (
      <span>
        {answer.optionLabels
          .map((o) => (lang === "sv" ? o.labelSv : (o.labelEn ?? o.labelSv)) ?? o.optionKey)
          .join(", ")}
      </span>
    );
  }
  if (answer.valueBoolean !== null) {
    return <span>{answer.valueBoolean ? t("beskt.answer.yes") : t("beskt.answer.no")}</span>;
  }
  if (answer.valueDate !== null) return <span>{answer.valueDate}</span>;
  if (answer.valueText !== null)
    return <span className="whitespace-pre-wrap">{answer.valueText}</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function BesktApplicationPanel({
  employerId,
  applicationId,
}: {
  readonly employerId: string;
  readonly applicationId: string;
}) {
  const { t, lang } = useT();
  const queryClient = useQueryClient();

  const listMethods = useServerFn(listAssignableBesktMethods);
  const listProfiles = useServerFn(listAssignableBesktExposureProfiles);
  const listPreparations = useServerFn(listEmployerBesktPreparations);
  const readback = useServerFn(getBesktEmployerReadback);
  const start = useServerFn(startBesktPreparation);

  const [profileId, setProfileId] = useState<string>("");
  const [startError, setStartError] = useState<string | null>(null);

  const preparations = useQuery({
    queryKey: ["beskt", "employer-preparations", employerId],
    queryFn: () => listPreparations({ data: { employerId } }),
    retry: false,
  });

  const existing = useMemo(
    () =>
      (preparations.data ?? []).find(
        (p) => p.applicationId === applicationId && p.lifecycleState !== "cancelled",
      ),
    [preparations.data, applicationId],
  );

  const methods = useQuery({
    queryKey: ["beskt", "assignable-methods", employerId],
    queryFn: () => listMethods({ data: { employerId } }),
    retry: false,
    enabled: !existing && !preparations.isPending,
  });

  const method = methods.data?.[0] ?? null;

  const profiles = useQuery({
    queryKey: ["beskt", "exposure-profiles", employerId, method?.methodVersionId],
    queryFn: () => listProfiles({ data: { employerId, methodVersionId: method!.methodVersionId } }),
    retry: false,
    enabled: Boolean(method),
  });

  const detail = useQuery({
    queryKey: ["beskt", "readback", existing?.assignmentId],
    queryFn: () => readback({ data: { assignmentId: existing!.assignmentId } }),
    retry: false,
    enabled: Boolean(existing),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!method) throw new Error("BCP_NOT_ASSIGNABLE");
      return start({
        data: {
          operationId: crypto.randomUUID(),
          applicationId,
          methodVersionId: method.methodVersionId,
          exposureProfileId: profileId,
          expectedContentHash: method.contentHash,
          noticeVersion: "beskt-prep-notice-1",
        },
      });
    },
    onSuccess: async () => {
      setStartError(null);
      await queryClient.invalidateQueries({ queryKey: ["beskt", "employer-preparations"] });
    },
    onError: (e: unknown) => setStartError(e instanceof Error ? e.message : String(e)),
  });

  return (
    <section
      aria-labelledby="beskt-application-heading"
      className="rounded-xl border bg-card p-5 sm:p-6"
      data-testid="beskt-application-panel"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
        >
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="beskt-application-heading" className="text-base font-semibold tracking-tight">
            {t("beskt.start.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("beskt.start.lede")}</p>
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        {preparations.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.library.loading")}
          </p>
        ) : preparations.isError ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>{t("beskt.library.error")}</AlertDescription>
          </Alert>
        ) : existing ? (
          <div data-testid="beskt-readback">
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("beskt.readback.status")}</dt>
                <dd className="mt-0.5">
                  <Badge variant="secondary" data-testid="beskt-readback-state">
                    {t(STATE_KEY[existing.lifecycleState])}
                  </Badge>
                </dd>
              </div>
              {existing.submittedAt ? (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t("beskt.readback.submittedAt")}
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {new Date(existing.submittedAt).toLocaleString(
                      lang === "sv" ? "sv-SE" : "en-GB",
                    )}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">{t("beskt.readback.method")}</dt>
                <dd className="mt-0.5 font-medium">
                  {(lang === "sv"
                    ? existing.methodNameSv
                    : (existing.methodNameEn ?? existing.methodNameSv)) ?? "—"}{" "}
                  · v{existing.methodVersionNumber}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("beskt.readback.hash")}</dt>
                <dd className="mt-0.5 truncate font-mono text-xs">{existing.contentHash}</dd>
              </div>
            </dl>

            <div className="mt-5">
              {detail.isPending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  {t("beskt.library.loading")}
                </p>
              ) : detail.isError ? (
                <Alert variant="destructive">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                  <AlertDescription>{t("beskt.library.error")}</AlertDescription>
                </Alert>
              ) : detail.data.answers === null ? (
                <Alert data-testid="beskt-readback-draft-private">
                  <Info aria-hidden="true" className="h-4 w-4" />
                  <AlertTitle>{t("beskt.readback.notSubmittedTitle")}</AlertTitle>
                  <AlertDescription>{t("beskt.readback.notSubmittedBody")}</AlertDescription>
                </Alert>
              ) : (
                <>
                  <h3 className="text-sm font-semibold">{t("beskt.readback.answers")}</h3>
                  <ul className="mt-3 space-y-3" data-testid="beskt-readback-answers">
                    {detail.data.answers.map((a) => (
                      <li key={a.itemKey} className="rounded-lg border p-3">
                        <p className="text-sm font-medium">
                          {(lang === "sv" ? a.wordingSv : (a.wordingEn ?? a.wordingSv)) ??
                            a.itemKey}
                        </p>
                        <p className="mt-1.5 text-sm">
                          <AnswerValue answer={a} />
                        </p>
                      </li>
                    ))}
                  </ul>

                  {detail.data.topicsForInterview && detail.data.topicsForInterview.length > 0 ? (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold">{t("beskt.readback.topics")}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("beskt.readback.topicsLede")}
                      </p>
                      <ul className="mt-3 space-y-2" data-testid="beskt-readback-topics">
                        {detail.data.topicsForInterview.map((topic) => (
                          <li
                            key={topic.itemKey}
                            className="flex flex-wrap items-start gap-2 rounded-lg border p-3"
                          >
                            <Badge variant="outline" className="gap-1.5 font-normal">
                              {topic.reason === "omitted" ? (
                                <SkipForward aria-hidden="true" className="h-3.5 w-3.5" />
                              ) : (
                                <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
                              )}
                              {t(
                                topic.reason === "omitted"
                                  ? "beskt.readback.reason.omitted"
                                  : "beskt.readback.reason.discuss_orally",
                              )}
                            </Badge>
                            <span className="min-w-0 flex-1 text-sm">
                              {(lang === "sv"
                                ? topic.wordingSv
                                : (topic.wordingEn ?? topic.wordingSv)) ?? topic.itemKey}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <p className="mt-5 text-xs text-muted-foreground">
                    {t("beskt.readback.noInterpretation")}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : methods.isPending || profiles.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.library.loading")}
          </p>
        ) : !method || (profiles.data ?? []).length === 0 ? (
          <Alert data-testid="beskt-start-unavailable">
            <Info aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>{t("beskt.start.noMethod")}</AlertDescription>
          </Alert>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              startMutation.mutate();
            }}
          >
            <div>
              <Label htmlFor="beskt-exposure-profile">{t("beskt.start.chooseProfile")}</Label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger
                  id="beskt-exposure-profile"
                  className="mt-1.5 min-h-[44px] w-full max-w-md"
                >
                  <SelectValue placeholder={t("beskt.start.chooseProfile")} />
                </SelectTrigger>
                <SelectContent>
                  {(profiles.data ?? []).map((p) => (
                    <SelectItem key={p.exposureProfileId} value={p.exposureProfileId}>
                      {(lang === "sv" ? p.dutiesSv : (p.dutiesEn ?? p.dutiesSv)) ?? p.profileKey}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {startError ? (
              <Alert variant="destructive" role="alert">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                <AlertTitle>{t("beskt.start.failed")}</AlertTitle>
                <AlertDescription className="font-mono text-xs">{startError}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="min-h-[44px]"
              disabled={!profileId || startMutation.isPending}
              data-testid="beskt-start-submit"
            >
              {startMutation.isPending ? t("beskt.start.starting") : t("beskt.start.action")}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
