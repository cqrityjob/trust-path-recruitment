// One BESKT assignment, whichever entrance it came through: who it is about,
// for what purpose and role, who is responsible, what the candidate submitted
// (their own words, their neutral states, their later corrections), and the
// way on to the interview case under Intervjuer.
//
// A security vetting reaches this page for the appointed security function
// only. For anyone else the database returns nothing and the page says the
// assignment is not available -- never "there is nothing here".

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, MessageSquare, SkipForward, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { AnswerValue } from "@/components/beskt/BesktApplicationPanel";
import { BesktCaseLinkSection } from "@/components/beskt/BesktCaseLinkSection";
import { purposeKey, topicReasonKey } from "@/components/beskt/BesktModulePanels";
import { getBesktEmployerReadback } from "@/lib/beskt/candidate-preparation.functions";
import { listBesktAssignments, listBesktSupplements } from "@/lib/beskt/complete.functions";

const STATE: Record<string, TranslationKey> = {
  assigned: "beskt.readback.state.assigned",
  notice_acknowledged: "beskt.readback.state.notice_acknowledged",
  in_progress: "beskt.readback.state.in_progress",
  submitted: "beskt.readback.state.submitted",
  cancelled: "beskt.readback.state.cancelled",
};

export function BesktAssignmentView({
  employerId,
  employerSlug,
  assignmentId,
}: {
  readonly employerId: string;
  readonly employerSlug: string;
  readonly assignmentId: string;
}) {
  const { t, lang } = useT();
  const listFn = useServerFn(listBesktAssignments);
  const readbackFn = useServerFn(getBesktEmployerReadback);
  const supplementsFn = useServerFn(listBesktSupplements);

  const rows = useQuery({
    queryKey: ["beskt", "assignments", employerId],
    queryFn: () => listFn({ data: { employerId } }),
    retry: false,
  });
  const row = rows.data?.find((r) => r.assignmentId === assignmentId) ?? null;
  const readback = useQuery({
    queryKey: ["beskt", "readback", assignmentId],
    queryFn: () => readbackFn({ data: { assignmentId } }),
    enabled: Boolean(row),
    retry: false,
  });
  const supplements = useQuery({
    queryKey: ["beskt", "supplements", assignmentId],
    queryFn: () => supplementsFn({ data: { assignmentId } }),
    enabled: Boolean(row) && readback.data?.isSubmitted === true,
    retry: false,
  });

  if (rows.isPending)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {t("beskt.library.loading")}
      </p>
    );
  if (rows.isError)
    return (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />
        <AlertDescription>{t("beskt.library.error")}</AlertDescription>
      </Alert>
    );
  if (!row)
    return (
      <Alert data-testid="beskt-assignment-unavailable">
        <AlertTitle>{t("beskt.assignment.unavailableTitle")}</AlertTitle>
        <AlertDescription>{t("beskt.assignment.unavailableBody")}</AlertDescription>
      </Alert>
    );

  const d = readback.data;
  return (
    <article data-testid="beskt-assignment" data-mode={row.mode}>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">BESKT</p>
        <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">
          {row.candidateDisplayName} — {row.roleTitle ?? "—"}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline" className="font-normal" data-testid="beskt-assignment-purpose">
            {t(purposeKey(row.mode))}
          </Badge>
          <Badge variant="secondary" data-testid="beskt-readback-state">
            {t(STATE[row.lifecycleState] ?? STATE.assigned)}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {row.applicationId ? t("beskt.module.fromApplication") : t("beskt.module.byInvitation")}
          </Badge>
        </div>
      </header>

      <section className="mt-6" data-testid="beskt-application-panel">
        {readback.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("beskt.library.loading")}
          </p>
        ) : readback.isError || !d ? (
          <Alert variant="destructive">
            <AlertDescription>{t("beskt.library.error")}</AlertDescription>
          </Alert>
        ) : d.answers === null ? (
          <Alert data-testid="beskt-readback-draft-private">
            <AlertTitle>{t("beskt.readback.notSubmittedTitle")}</AlertTitle>
            <AlertDescription>{t("beskt.readback.notSubmittedBody")}</AlertDescription>
          </Alert>
        ) : (
          <>
            <h2 className="text-sm font-semibold">{t("beskt.readback.answers")}</h2>
            <ul className="mt-3 space-y-3" data-testid="beskt-readback-answers">
              {d.answers.map((a) => (
                <li key={a.itemKey} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {(lang === "sv" ? a.wordingSv : (a.wordingEn ?? a.wordingSv)) ?? a.itemKey}
                  </p>
                  <p className="mt-1.5 text-sm">
                    <AnswerValue answer={a} />
                  </p>
                </li>
              ))}
            </ul>
            {d.topicsForInterview && d.topicsForInterview.length > 0 ? (
              <div className="mt-6">
                <h2 className="text-sm font-semibold">{t("beskt.readback.topics")}</h2>
                <ul className="mt-3 space-y-2" data-testid="beskt-readback-topics">
                  {d.topicsForInterview.map((topic) => (
                    <li
                      key={topic.itemKey}
                      className="flex flex-wrap items-start gap-2 rounded-lg border p-3"
                    >
                      <Badge variant="outline" className="gap-1.5 font-normal">
                        {topic.reason === "omitted" ? (
                          <SkipForward aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : topic.reason === "discuss_orally" ? (
                          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {t(topicReasonKey(topic.reason))}
                      </Badge>
                      <span className="min-w-0 flex-1 text-sm">
                        {(lang === "sv" ? topic.wordingSv : (topic.wordingEn ?? topic.wordingSv)) ??
                          topic.itemKey}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(supplements.data ?? []).length > 0 ? (
              <div className="mt-6" data-testid="beskt-readback-supplements">
                <h2 className="text-sm font-semibold">{t("beskt.supplement.employerHeading")}</h2>
                <ul className="mt-3 space-y-2">
                  {supplements.data!.map((x) => (
                    <li key={x.supplementId} className="rounded-lg border p-3 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {t(
                          x.kind === "correction"
                            ? "beskt.supplement.correction"
                            : "beskt.supplement.addition",
                        )}{" "}
                        ·{" "}
                        {new Date(x.submittedAt).toLocaleString(lang === "sv" ? "sv-SE" : "en-GB")}
                        {x.itemKey ? ` · ${x.itemKey}` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{x.body}</p>
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
        {row.lifecycleState === "submitted" ? (
          <BesktCaseLinkSection
            assignmentId={assignmentId}
            applicationId={row.applicationId}
            employerSlug={employerSlug}
          />
        ) : null}
      </section>
    </article>
  );
}
