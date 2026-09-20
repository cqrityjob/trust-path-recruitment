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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import { BesktCaseLinkSection } from "@/components/beskt/BesktCaseLinkSection";
import { BesktStartDialog } from "@/components/beskt/BesktStartDialog";
import { getMyBesktStanding } from "@/lib/beskt/complete.functions";
import { topicReasonKey } from "@/components/beskt/BesktModulePanels";
import type { TranslationKey } from "@/i18n/dictionaries";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  cancelBesktPreparation,
  getBesktEmployerReadback,
  listAssignableBesktMethods,
  listEmployerBesktPreparations,
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
export function AnswerValue({ answer }: { readonly answer: BesktSubmittedAnswer }) {
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
  employerSlug,
  applicationId,
}: {
  readonly employerId: string;
  /** When given, a submitted preparation offers its link to Intervjuer. */
  readonly employerSlug?: string;
  readonly applicationId: string;
}) {
  const { t, lang } = useT();
  const queryClient = useQueryClient();

  const listMethods = useServerFn(listAssignableBesktMethods);
  const listPreparations = useServerFn(listEmployerBesktPreparations);
  const readback = useServerFn(getBesktEmployerReadback);
  const standingFn = useServerFn(getMyBesktStanding);
  const cancel = useServerFn(cancelBesktPreparation);

  // ── 0.3 — THE METHOD IS CHOSEN, NOT ASSUMED ──────────────────────────
  //
  // This used to be `methods.data?.[0]`: whatever the database happened to
  // return first, silently, with no way for the employer to see what was
  // picked or to pick anything else. With one method admitted that is
  // invisible; with two it is wrong, and wrong in the way that matters --
  // the method determines the questions a candidate is asked.
  const [startOpen, setStartOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<TranslationKey | null>(null);

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

  const standing = useQuery({
    queryKey: ["beskt", "standing", employerId],
    queryFn: () => standingFn({ data: { employerId } }),
    retry: false,
  });

  const detail = useQuery({
    queryKey: ["beskt", "readback", existing?.assignmentId],
    queryFn: () => readback({ data: { assignmentId: existing!.assignmentId } }),
    retry: false,
    enabled: Boolean(existing),
  });

  // ── 0.6 — CANCELLING A PREPARATION THAT SHOULD NOT HAVE BEEN SENT ────
  //
  // The RPC existed and nothing could reach it, so an employer who picked the
  // wrong method had no way out: bcp_assign refuses a second live assignment
  // on the same application with BCP_ASSIGNMENT_EXISTS, and the first one was
  // unreachable. The correct preparation could not be created at all.
  //
  // Cancelling is a governed state transition, not a delete. The row stays,
  // the reason is recorded on the append-only ledger, and the candidate's
  // draft is not erased -- it becomes read-only under a cancelled assignment.
  // That is why the reason is mandatory: it is the only explanation anyone
  // reading the history afterwards will have.
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("BCP_ASSIGNMENT_NOT_FOUND");
      return cancel({
        data: {
          operationId: crypto.randomUUID(),
          assignmentId: existing.assignmentId,
          reason: cancelReason.trim(),
        },
      });
    },
    onSuccess: async () => {
      setCancelError(null);
      setCancelOpen(false);
      setCancelReason("");
      await queryClient.invalidateQueries({ queryKey: ["beskt", "employer-preparations"] });
    },
    onError: (e: unknown) => setCancelError(besktErrorKey(e)),
  });

  // Only while the preparation is still live. A submitted preparation is the
  // candidate's completed work and the database refuses to cancel it; showing
  // a control that always fails would be worse than showing none.
  const cancellable =
    existing !== undefined &&
    existing.lifecycleState !== "submitted" &&
    existing.lifecycleState !== "cancelled";

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
                              {t(topicReasonKey(topic.reason))}
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

            {existing.lifecycleState === "submitted" && employerSlug ? (
              <BesktCaseLinkSection
                assignmentId={existing.assignmentId}
                applicationId={applicationId}
                employerSlug={employerSlug}
              />
            ) : null}

            {cancellable ? (
              <div className="mt-6 border-t pt-5">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  data-testid="beskt-cancel-open"
                  onClick={() => {
                    setCancelError(null);
                    setCancelOpen(true);
                  }}
                >
                  {t("beskt.cancel.action")}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">{t("beskt.cancel.lede")}</p>
              </div>
            ) : null}
          </div>
        ) : methods.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.library.loading")}
          </p>
        ) : (methods.data ?? []).length === 0 ? (
          <Alert data-testid="beskt-start-unavailable">
            <Info aria-hidden="true" className="h-4 w-4" />
            <AlertDescription>{t("beskt.start.noMethod")}</AlertDescription>
          </Alert>
        ) : (
          <div data-testid="beskt-start-from-application">
            <Button
              type="button"
              className="min-h-[44px]"
              onClick={() => setStartOpen(true)}
              data-testid="beskt-start-open"
            >
              {t("beskt.module.start")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">{t("beskt.start.dialogHint")}</p>
          </div>
        )}
      </div>

      {startOpen && employerSlug && methods.data ? (
        <BesktStartDialog
          open
          onOpenChange={(o) => {
            setStartOpen(o);
            if (!o) void queryClient.invalidateQueries({ queryKey: ["beskt"] });
          }}
          employerId={employerId}
          employerSlug={employerSlug}
          methods={methods.data}
          isSecurityOfficer={Boolean(standing.data?.isSecurityOfficer)}
          fixedApplicationId={applicationId}
        />
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent data-testid="beskt-cancel-dialog">
          <DialogHeader>
            <DialogTitle>{t("beskt.cancel.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("beskt.cancel.confirmBody")}</DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="beskt-cancel-reason">{t("beskt.cancel.reasonLabel")}</Label>
            <Textarea
              id="beskt-cancel-reason"
              className="mt-1.5 min-h-[88px]"
              value={cancelReason}
              maxLength={500}
              onChange={(e) => setCancelReason(e.target.value)}
              data-testid="beskt-cancel-reason"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t("beskt.cancel.reasonHint")}</p>
          </div>

          {cancelError ? (
            <Alert variant="destructive" role="alert">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              <AlertDescription data-testid="beskt-cancel-error">{t(cancelError)}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => setCancelOpen(false)}
              data-testid="beskt-cancel-dismiss"
            >
              {t("beskt.cancel.keep")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-[44px]"
              disabled={cancelReason.trim().length < 3 || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              data-testid="beskt-cancel-confirm"
            >
              {cancelMutation.isPending ? t("beskt.cancel.cancelling") : t("beskt.cancel.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
