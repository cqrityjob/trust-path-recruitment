import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { saveWorkAnalysis } from "@/lib/security-work/analysis.functions";
import { initialContext, type AnalysisType } from "@/lib/security-work/analysis-model";
import { useSecurityWorkspace } from "./context";
import {
  EmptyState,
  Field,
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
  formatDate,
} from "./ui";
import {
  SaveStatus,
  usePortfolio,
  useSavedOperation,
  useWorkText,
  WorkStatus,
} from "./analysis-ui";
import { useT } from "@/i18n/context";

export function SecurityAnalyses() {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace, profile, canEdit } = useSecurityWorkspace();
  const portfolio = usePortfolio();
  const save = useServerFn(saveWorkAnalysis);
  const operation = useSavedOperation();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [creating, setCreating] = useState(Boolean(search.new));
  const [id, setId] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<AnalysisType>("rsa");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [scope, setScope] = useState("");
  const [horizon, setHorizon] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const row = await operation.run(() =>
      save({
        data: {
          workspaceId: workspace.id,
          id,
          version: null,
          analysis_type: type,
          title,
          purpose,
          scope,
          horizon,
          context_snapshot: initialContext(
            profile
              ? [
                  profile.sector,
                  profile.decisions_supported,
                  ...profile.critical_operations,
                  ...profile.assets,
                ]
                  .filter(Boolean)
                  .join("\n")
              : "",
          ),
          situation: "",
          affected_activity: "",
          assets: "",
          threat: "",
          vulnerability: "",
          existing_controls: "",
          uncertainty: "",
          assumptions: "",
          proposed_measures: "",
          professional_conclusion: "",
          likelihood: null,
          consequence: null,
        },
      }),
    );
    if (row) {
      setId(crypto.randomUUID());
      await navigate({
        to: "/security-work/$workspaceId/analyses/$analysisId",
        params: { workspaceId: workspace.id, analysisId: row.id },
      });
    }
  }
  return (
    <>
      <PageHeading
        title={l("Analyser", "Analyses")}
        body={l(
          "Från granskat underlag till beslut och uppföljning.",
          "From reviewed evidence to decisions and follow-up.",
        )}
        action={
          canEdit && (
            <WorkButton onClick={() => setCreating(!creating)}>
              <Plus aria-hidden="true" />
              {l("Ny analys", "New analysis")}
            </WorkButton>
          )
        }
      />
      {creating && (
        <form onSubmit={create} className={`${panelClass} space-y-5`}>
          <h2 className="font-display text-xl font-semibold">
            {l("Vad behöver du bedöma?", "What do you need to assess?")}
          </h2>
          <Field label={l("Analystyp", "Analysis type")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={type}
                onChange={(e) => setType(e.target.value as AnalysisType)}
              >
                <option value="rsa">
                  {l("Risk- och sårbarhetsanalys", "Risk and vulnerability analysis")}
                </option>
                <option value="monitoring">{l("Omvärldsanalys", "Monitoring analysis")}</option>
                <option value="legacy_security">
                  {l(
                    "Säkerhetsbedömning — åttadelad rapport",
                    "Security assessment — eight-section report",
                  )}
                </option>
              </select>
            )}
          </Field>
          <TextField
            label={l("Namn", "Title")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={500}
          />
          <TextAreaField
            label={l(
              "Syfte och beslut som analysen ska stödja",
              "Purpose and decisions this analysis should support",
            )}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            required
            maxLength={16000}
          />
          <TextAreaField
            label={l("Omfattning och avgränsningar", "Scope and boundaries")}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            required
            maxLength={16000}
          />
          <TextField
            label={l("Tidshorisont", "Time horizon")}
            hint={l(
              "Ange perioden som bedömningarna gäller. Ingen period antas automatiskt.",
              "Specify the period covered by the assessment. No period is assumed.",
            )}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            required
            maxLength={2000}
          />
          <WorkError code={operation.error} />
          <div className="flex flex-wrap items-center gap-3">
            <WorkButton type="submit" disabled={operation.state === "saving"}>
              {l("Skapa och fortsätt", "Create and continue")}
            </WorkButton>
            <WorkButton type="button" variant="outline" onClick={() => setCreating(false)}>
              {l("Avbryt", "Cancel")}
            </WorkButton>
            <SaveStatus state={operation.state} />
          </div>
        </form>
      )}
      {portfolio.isPending ? (
        <LoadingState />
      ) : portfolio.isError ? (
        <WorkError code={portfolio.error.message} onRetry={() => void portfolio.refetch()} />
      ) : !portfolio.data?.analyses.length ? (
        <EmptyState
          title={l("Börja med en konkret fråga", "Start with a specific question")}
          body={l(
            "Skapa din första analys. Verksamhetsprofilen följer med som en kopia som du kan korrigera för just detta uppdrag.",
            "Create your first analysis. Your organisation profile is copied so you can adapt it to this assignment.",
          )}
        />
      ) : (
        <div className={panelClass}>
          <ul className="divide-y divide-border">
            {portfolio.data.analyses.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <Link
                    className="inline-flex min-h-11 items-center break-words font-semibold text-accent underline-offset-4 hover:underline"
                    to="/security-work/$workspaceId/analyses/$analysisId"
                    params={{ workspaceId: workspace.id, analysisId: row.id }}
                  >
                    {row.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(row.updated_at, lang)} · v{row.version}
                  </p>
                </div>
                <WorkStatus status={row.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
