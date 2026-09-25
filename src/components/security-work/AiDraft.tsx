import { createContext, useContext, useEffect, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getWorkAiStatus, requestWorkAiDraft } from "@/lib/security-work/ai.functions";
import { applyWorkAiDraft } from "@/lib/security-work/analysis.functions";
import {
  analysisOutputSchema,
  type AnalysisNarrative,
} from "@/lib/security-work/processing/contracts";
import type {
  AnalysisInput,
  AnalysisQuestion,
  ProcessingJob,
} from "@/lib/security-work/analysis-types";
import type { SourceItem } from "@/lib/security-work/types";
import { reportSections } from "@/lib/security-work/analysis-model";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityWorkspace } from "./context";
import { WorkButton, WorkError, panelClass } from "./ui";
import { RiskRating, SaveStatus, useSavedOperation, useWorkText } from "./analysis-ui";
import { reportDate } from "@/lib/security-work/report-export";
import { useT } from "@/i18n/context";

const SourceContext = createContext<{ sources: SourceItem[]; locators: Map<string, string> }>({
  sources: [],
  locators: new Map(),
});
function AiCitation({ citation }: { citation: AnalysisNarrative["citations"][number] }) {
  const l = useWorkText();
  const { lang } = useT();
  const { sources, locators } = useContext(SourceContext);
  const source = sources.find((row) => row.id === citation.sourceItemId);
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm text-accent">
        {l("Visa stödjande utdrag", "Show supporting extract")}
        {source ? ` - ${source.original_title}` : ""}
      </summary>
      <blockquote className="whitespace-pre-wrap break-words text-sm">{citation.quote}</blockquote>
      <p className="mt-2 text-xs text-muted-foreground">
        {source?.publisher} ·{" "}
        {locators.get(citation.sourceItemId) || l("Hänvisning saknas", "Locator unknown")} ·{" "}
        {reportDate(source?.published_at, lang)}
      </p>
    </details>
  );
}

function Narrative({ value }: { value: AnalysisNarrative }) {
  const l = useWorkText();
  const labels = {
    source_fact: l("Källuppgift", "Source fact"),
    user_interpretation: l("Användaruppgift", "User information"),
    assumption: l("Antagande", "Assumption"),
    ai_proposal: l("AI-förslag", "AI proposal"),
  };
  return (
    <div className="space-y-2 border-l-2 border-border pl-4">
      <p className="text-xs font-semibold text-muted-foreground">{labels[value.kind]}</p>
      <p className="whitespace-pre-wrap text-sm">{value.statement}</p>
      {value.uncertainty && <p className="text-sm text-muted-foreground">{value.uncertainty}</p>}
      {value.citations.map((c, index) => (
        <AiCitation key={`${c.segmentId}:${index}`} citation={c} />
      ))}
    </div>
  );
}
export function AiDraft({
  assessmentId,
  analysisType,
  version,
  jobs,
  inputs,
  questions,
  sources,
  editable,
  dirty,
}: {
  assessmentId: string;
  analysisType: string;
  version: number;
  jobs: ProcessingJob[];
  inputs: AnalysisInput[];
  questions: AnalysisQuestion[];
  sources: SourceItem[];
  editable: boolean;
  dirty: boolean;
}) {
  const l = useWorkText();
  const { workspace, user } = useSecurityWorkspace();
  const statusFn = useServerFn(getWorkAiStatus);
  const draft = useServerFn(requestWorkAiDraft);
  const apply = useServerFn(applyWorkAiDraft);
  const op = useSavedOperation();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [applyId, setApplyId] = useState(() => crypto.randomUUID());
  const [consent, setConsent] = useState(false);
  const [appliedJobId, setAppliedJobId] = useState<string | null>(null);
  const [appliedReportId, setAppliedReportId] = useState<string | null>(null);
  const hasEvidence = inputs.some((input) => input.review_status === "accepted");
  const pendingEvidence = inputs.some((input) => input.review_status === "pending");
  const status = useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "ai-status"],
    retry: false,
    queryFn: async () => {
      const result = await statusFn({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data;
    },
  });
  const latest = jobs.find((job) => job.kind === "ai");
  const parsed =
    latest?.status === "succeeded" ? analysisOutputSchema.safeParse(latest.output) : null;
  const output = parsed?.success ? parsed.data : null;
  const inputRevision = JSON.stringify([
    inputs.map((input) => [input.id, input.version, input.review_status]).sort(),
    questions.map((question) => [question.id, question.version]).sort(),
  ]);
  useEffect(() => {
    setRequestId(crypto.randomUUID());
    setConsent(false);
  }, [assessmentId, version, inputRevision]);
  useEffect(() => {
    setApplyId(crypto.randomUUID());
    setConsent(false);
  }, [latest?.id]);
  const uncertain = latest && ["dispatched", "outcome_unknown"].includes(latest.status);
  const manifest = z
    .object({
      sources: z.array(
        z.object({
          sourceItemId: z.string(),
          reviewVersion: z.number(),
          locator: z.string().optional(),
        }),
      ),
      questions: z.array(z.object({ id: z.string(), version: z.number() })),
    })
    .safeParse(latest?.input_manifest);
  const stale =
    latest &&
    (latest.expected_version !== version ||
      !manifest.success ||
      JSON.stringify(
        manifest.data.sources.map((source) => [source.sourceItemId, source.reviewVersion]).sort(),
      ) !==
        JSON.stringify(
          inputs
            .filter((input) => input.review_status === "accepted")
            .map((input) => [input.source_item_id, input.version])
            .sort(),
        ) ||
      JSON.stringify(
        manifest.data.questions.map((question) => [question.id, question.version]).sort(),
      ) !== JSON.stringify(questions.map((question) => [question.id, question.version]).sort()));
  return (
    <SourceContext.Provider
      value={{
        sources,
        locators: new Map(
          manifest.success
            ? manifest.data.sources.map((source) => [source.sourceItemId, source.locator ?? ""])
            : [],
        ),
      }}
    >
      <section className={`${panelClass} space-y-5`}>
        <h2 className="text-xl font-semibold">
          {l("AI-stöd för analysen", "AI support for your analysis")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {l(
            "AI föreslår kompletteringsfrågor, risker, åtgärder och rapporttext från granskat underlag. Du granskar och för in förslaget i ett redigerbart utkast innan rapporten godkänns separat.",
            "AI suggests follow-up questions, risks, actions and report text from reviewed evidence. You review and apply the proposal to an editable draft before approving the report separately.",
          )}
        </p>
        {status.isPending ? (
          <p role="status" className="text-sm">
            {l("Kontrollerar AI-konfiguration…", "Checking AI configuration…")}
          </p>
        ) : status.isError ? (
          <WorkError code={status.error.message} onRetry={() => void status.refetch()} />
        ) : !status.data?.enabled ? (
          <p role="status" className="rounded-lg bg-secondary p-4 text-sm">
            {l(
              "AI är inte aktiverat för arbetsytan. Kontakta pilotansvarig för åtkomst. Du kan fortsätta manuellt; nya AI-utkast kan inte skapas just nu.",
              "AI is not activated for this workspace. Contact the pilot lead for access. You can continue manually; new AI drafts cannot be generated right now.",
            )}
          </p>
        ) : (
          editable &&
          !uncertain && (
            <WorkButton
              disabled={!hasEvidence || pendingEvidence || dirty || op.state === "saving"}
              onClick={async () => {
                await op.run(() =>
                  draft({
                    data: {
                      workspaceId: workspace.id,
                      assessmentId,
                      version,
                      requestId,
                    },
                  }),
                );
              }}
            >
              {l(
                "Skapa AI-utkast från granskat underlag",
                "Create AI draft from reviewed evidence",
              )}
            </WorkButton>
          )
        )}
        {editable && !hasEvidence && (
          <p role="status" className="text-sm">
            {l(
              "Börja i 2. Underlag: läs och acceptera minst ett utdrag innan du begär AI-stöd.",
              "Start in 2. Evidence: read and accept at least one extract before requesting AI support.",
            )}
          </p>
        )}
        {editable && pendingEvidence && (
          <p role="status" className="text-sm">
            {l(
              "Granska alla väntande utdrag i 2. Underlag. Välj använd eller använd inte innan du begär AI-stöd.",
              "Review all pending extracts in 2. Evidence. Choose use or do not use before requesting AI support.",
            )}
          </p>
        )}
        {editable && dirty && (
          <p role="status" className="text-sm">
            {l(
              "Spara osparade frågor, bedömningar och åtgärder innan du använder AI-stödet.",
              "Save unsaved questions, assessments and actions before using AI support.",
            )}
          </p>
        )}
        {appliedJobId === latest?.id && (
          <div className="space-y-3 rounded-lg bg-secondary p-4 text-sm">
            <p role="status">
              {l(
                "Förslagen har förts in. Besvara frågorna i 3. Komplettera och öppna rapportutkastet i 5. Rapport. Inget är godkänt ännu.",
                "The proposals have been applied. Answer the questions in 3. Follow-ups and open the draft in 5. Report. Nothing is approved yet.",
              )}
            </p>
            {appliedReportId && (
              <WorkButton asChild variant="outline">
                <Link
                  to="/security-work/$workspaceId/reports/$reportId"
                  params={{ workspaceId: workspace.id, reportId: appliedReportId }}
                >
                  {l(
                    "Öppna rapportutkastet från detta förslag",
                    "Open the report draft from this proposal",
                  )}
                </Link>
              </WorkButton>
            )}
          </div>
        )}
        {uncertain && (
          <p role="status" className="rounded-lg border border-border p-4 text-sm">
            {l(
              "Körningen har skickats, men resultatet är inte bekräftat. Vi skickar inte om den automatiskt eftersom det kan orsaka en ny kostnad. Kontakta systemansvarig för att utreda körningen.",
              "The request was dispatched, but its outcome is not confirmed. It is not automatically resent because that could incur another charge. Contact the system owner to investigate.",
            )}
          </p>
        )}
        {latest?.status === "failed" && (
          <p role="alert" className="text-sm">
            {l(
              "AI-körningen misslyckades. Inga förslag har lagts in i analysen.",
              "The AI run failed. No proposals have been added to the analysis.",
            )}
          </p>
        )}
        {stale && appliedJobId !== latest?.id && (
          <p role="status" className="text-sm text-muted-foreground">
            {l(
              "Analysen har ändrats sedan detta AI-utkast skapades. Utkastet kan läsas men inte föras in i den nya versionen.",
              "The analysis has changed since this AI draft was created. You can read the draft, but cannot apply it to the new version.",
            )}
          </p>
        )}
        <WorkError
          code={op.error}
          message={
            op.error === "AI_BUDGET_EXCEEDED"
              ? l(
                  "Arbetsytans AI-budget är förbrukad. Kontakta pilotansvarig; inga nya AI-anrop skickas med denna begäran.",
                  "The workspace AI budget is exhausted. Contact the pilot lead; this request sends no new AI call.",
                )
              : op.error === "AI_INPUT_INVALID"
                ? l(
                    "Underlaget kunde inte användas för AI-utkastet. Kontrollera accepterade utdrag och uppdraget med pilotansvarig.",
                    "The evidence could not be used for the AI draft. Check the accepted extracts and assignment with the pilot lead.",
                  )
                : op.error?.startsWith("AI_")
                  ? l(
                      "AI-stödet är inte tillgängligt. Kontakta pilotansvarig för att kontrollera åtkomst och aktivering.",
                      "AI support is unavailable. Contact the pilot lead to check access and activation.",
                    )
                  : op.error === "SAVE_FAILED"
                    ? l(
                        "Resultatet kunde inte bekräftas. Ladda om för att kontrollera sparat arbete och kontakta pilotansvarig innan du begär ett nytt AI-utkast.",
                        "The result could not be confirmed. Reload to check saved work and contact the pilot lead before requesting a new AI draft.",
                      )
                    : undefined
          }
        />
        {op.state !== "error" && <SaveStatus state={op.state} />}
        {output && (
          <div className="space-y-5" data-testid="sw-ai-proposal">
            <h3 className="text-lg font-semibold">
              {l("Granska AI-förslaget", "Review the AI proposal")}
            </h3>
            {[
              ...output.facts,
              ...output.userInterpretations,
              ...output.assumptions,
              ...output.proposals,
            ].map((value, index) => (
              <Narrative key={index} value={value} />
            ))}
            <p className="whitespace-pre-wrap text-sm">{output.uncertainty}</p>
            {output.contradictions.length > 0 && (
              <section>
                <h4 className="font-semibold">
                  {l("Motsägande uppgifter", "Contradictory information")}
                </h4>
                {output.contradictions.map((c, index) => (
                  <article key={index} className="mt-3 space-y-2">
                    <p className="text-sm">{c.statement}</p>
                    <p className="text-sm text-muted-foreground">{c.uncertainty}</p>
                    {c.citations.map((citation, n) => (
                      <AiCitation key={n} citation={citation} />
                    ))}
                  </article>
                ))}
              </section>
            )}
            {output.risks.map((risk, index) => (
              <section key={index} className="space-y-3">
                <h4 className="font-semibold">{risk.title}</h4>
                <RiskRating
                  likelihood={risk.likelihood}
                  consequence={risk.consequence}
                  colourOverride={analysisType === "rsa" ? undefined : null}
                />
                <Narrative value={risk.description} />
                <Narrative value={risk.rationale} />
                <h5 className="font-semibold">
                  {l(
                    "Befintliga skyddsåtgärder enligt underlaget",
                    "Existing controls supported by evidence",
                  )}
                </h5>
                {risk.currentControls?.length ? (
                  risk.currentControls.map((control, n) => <Narrative key={n} value={control} />)
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {l("Okänt — inget verifierat underlag.", "Unknown — no verified evidence.")}
                  </p>
                )}
                <h5 className="font-semibold">{l("Föreslagna åtgärder", "Proposed actions")}</h5>
                {risk.proposedActions.map((action, n) => (
                  <Narrative key={n} value={action} />
                ))}
              </section>
            ))}
            {output.followups.length > 0 && (
              <section className="space-y-3">
                <h4 className="font-semibold">
                  {l("Föreslagna kompletteringsfrågor", "Proposed follow-up questions")}
                </h4>
                {output.followups.map((question, n) => (
                  <Narrative key={n} value={question} />
                ))}
              </section>
            )}
            {output.report && (
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                  {l("Visa rapportförslag", "Show report proposal")}
                </summary>
                <div className="space-y-4">
                  {output.report.sections.map((section) => (
                    <section key={section.key} className="space-y-3">
                      <h4 className="font-semibold">
                        {(() => {
                          const labels = reportSections[output.report!.kind].find(
                            ([key]) => key === section.key,
                          );
                          return labels ? l(labels[1], labels[2]) : section.key;
                        })()}
                      </h4>
                      {section.content.map((value, index) => (
                        <Narrative key={index} value={value} />
                      ))}
                      {section.missingInformation && (
                        <p className="text-sm text-muted-foreground">
                          {section.missingInformation}
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              </details>
            )}
            {editable && !stale && (
              <>
                <p className="text-sm text-muted-foreground">
                  {l(
                    "Införandet lägger till frågor, risker, åtgärder och ett nytt rapportutkast. Tidigare utkast och egna bedömningar finns kvar.",
                    "Applying adds questions, risks, actions and a new report draft. Previous drafts and your own assessments are preserved.",
                  )}
                </p>
                <label className="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    className="mt-1 size-5 shrink-0"
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  {l(
                    "Jag vill föra in dessa förslag i ett redigerbart utkast. Jag behöver fortfarande granska och godkänna rapporten separat.",
                    "I want to apply these proposals to an editable draft. I must still review and approve the report separately.",
                  )}
                </label>
                <WorkButton
                  disabled={!consent || dirty || op.state === "saving"}
                  onClick={async () => {
                    const result = await op.run(() =>
                      apply({
                        data: {
                          workspaceId: workspace.id,
                          jobId: latest!.id,
                          version,
                          requestId: applyId,
                        },
                      }),
                    );
                    if (result) {
                      setConsent(false);
                      setAppliedJobId(latest!.id);
                      const receipt = z
                        .object({ report_id: z.string().uuid().nullable() })
                        .safeParse(result);
                      setAppliedReportId(receipt.success ? receipt.data.report_id : null);
                    }
                  }}
                >
                  {l("För in i analysutkast", "Apply to analysis draft")}
                </WorkButton>
              </>
            )}
          </div>
        )}
      </section>
    </SourceContext.Provider>
  );
}
