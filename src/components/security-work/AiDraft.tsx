import { createContext, useContext, useEffect, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
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
            "AI använder accepterade utdrag, analysens sammanhang och dina svar. Förslag är inte godkända bedömningar. Okända uppgifter och motsägelser ska granskas.",
            "AI uses accepted extracts, the analysis context and your answers. Proposals are not approved assessments. Review unknown information and contradictions.",
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
              "AI är inte aktiverat för arbetsytan. Systemansvarig behöver godkänna leverantör, exakt modell och databehandling samt konfigurera åtkomsten. Du kan slutföra analysen och rapporten manuellt.",
              "AI is not activated for this workspace. The system owner must approve the provider, exact model and data processing and configure access. You can complete the analysis and report manually.",
            )}
          </p>
        ) : (
          editable &&
          !uncertain && (
            <WorkButton
              disabled={dirty || op.state === "saving"}
              onClick={async () => {
                const result = await op.run(() =>
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
        {stale && (
          <p role="status" className="text-sm text-muted-foreground">
            {l(
              "Analysen har ändrats sedan detta AI-utkast skapades. Utkastet kan läsas men inte föras in i den nya versionen.",
              "The analysis has changed since this AI draft was created. You can read the draft, but cannot apply it to the new version.",
            )}
          </p>
        )}
        <WorkError code={op.error} />
        <SaveStatus state={op.state} />
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
                    if (result) setConsent(false);
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
