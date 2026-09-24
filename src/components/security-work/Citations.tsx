import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveWorkCitation } from "@/lib/security-work/analysis.functions";
import type { SourceItem } from "@/lib/security-work/types";
import { useSecurityWorkspace } from "./context";
import { Field, TextAreaField, WorkButton, WorkError, panelClass, selectClass } from "./ui";
import { SaveStatus, useSavedOperation, useWorkText } from "./analysis-ui";

export function CitationEditor({
  targetId,
  targetType,
  sources,
}: {
  targetId: string;
  targetType: "assessment" | "report" | "risk";
  sources: SourceItem[];
}) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const save = useServerFn(saveWorkCitation);
  const op = useSavedOperation();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [sourceId, setSourceId] = useState("");
  const [claim, setClaim] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const source = sources.find((s) => s.id === sourceId);
  return (
    <form
      className={`${panelClass} space-y-4`}
      onSubmit={async (e) => {
        e.preventDefault();
        const row = await op.run(() =>
          save({
            data: {
              workspaceId: workspace.id,
              id,
              targetId,
              targetType,
              sourceItemId: sourceId,
              claim,
              excerpt,
              locator: source?.original_title ?? "",
            },
          }),
        );
        if (row) {
          setId(crypto.randomUUID());
          setClaim("");
          setExcerpt("");
        }
      }}
    >
      <h3 className="text-lg font-semibold">
        {l("Knyt ett påstående till dess källa", "Link a statement to its source")}
      </h3>
      <Field label={l("Granskat underlag", "Reviewed evidence")}>
        {(id) => (
          <select
            id={id}
            className={selectClass}
            required
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setExcerpt("");
            }}
          >
            <option value="">{l("Välj källa", "Select source")}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.original_title}
              </option>
            ))}
          </select>
        )}
      </Field>
      {source && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
            {l("Visa källtext", "Show source text")}
          </summary>
          <blockquote className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm">
            {source.factual_extract}
          </blockquote>
        </details>
      )}
      <TextAreaField
        label={l("Påstående i analysen eller rapporten", "Statement in the analysis or report")}
        required
        maxLength={4000}
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
      />
      <TextAreaField
        label={l("Exakt utdrag som stöder påståendet", "Exact extract supporting the statement")}
        hint={l(
          "Kopiera den relevanta formuleringen från källtexten. Utdraget kontrolleras mot det sparade underlaget.",
          "Copy the relevant wording from the source. The extract is checked against the saved evidence.",
        )}
        required
        maxLength={8000}
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
      />
      {op.error === "INVALID_CITATION" ? (
        <p role="alert" className="text-sm text-destructive">
          {l(
            "Utdraget återfinns inte ordagrant i den valda källan.",
            "The extract does not occur verbatim in the selected source.",
          )}
        </p>
      ) : (
        <WorkError code={op.error} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton type="submit" disabled={!source || op.state === "saving"}>
          {l("Spara källhänvisning", "Save citation")}
        </WorkButton>
        <SaveStatus state={op.state} />
      </div>
    </form>
  );
}
