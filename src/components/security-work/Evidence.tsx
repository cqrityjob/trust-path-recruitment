import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getWorkEvidence,
  uploadWorkDocument,
  extractWorkDocument,
} from "@/lib/security-work/documents.functions";
import { saveWorkInput } from "@/lib/security-work/analysis.functions";
import type { AnalysisInput } from "@/lib/security-work/analysis-types";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityWorkspace } from "./context";
import { NewSourceItem } from "./SourceDetail";
import { SecuritySourceForm } from "./Sources";
import {
  Field,
  formatDate,
  LoadingState,
  TextAreaField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
  useUnsavedWarning,
} from "./ui";
import { SaveStatus, WorkStatus, useSavedOperation, useWorkText } from "./analysis-ui";

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}
function useWorkspaceEvidence() {
  const { workspace, user, deny } = useSecurityWorkspace();
  const read = useServerFn(getWorkEvidence);
  const query = useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "evidence"],
    queryFn: async () => {
      const r = await read({ data: { workspaceId: workspace.id } });
      if (!r.ok) throw new Error(r.code);
      return r.data;
    },
    retry: false,
  });
  useEffect(() => {
    if (query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error, deny]);
  return query;
}

export function DocumentUpload({ onManual }: { onManual?: () => void }) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const upload = useServerFn(uploadWorkDocument);
  const extract = useServerFn(extractWorkDocument);
  const op = useSavedOperation();
  const [file, setFile] = useState<File | null>(null);
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className={`${panelClass} space-y-4`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || op.state === "saving") return;
        setMessage(null);
        const document = await op.run(async () => {
          if (!file.size || file.size > 10 * 1024 * 1024 || !/\.(pdf|docx)$/i.test(file.name))
            return { ok: false, code: "DOCUMENT_UNSUPPORTED" };
          return upload({
            data: {
              workspaceId: workspace.id,
              requestId: request,
              filename: file.name,
              mimeType: /\.pdf$/i.test(file.name)
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              contentBase64: await fileBase64(file),
            },
          });
        });
        if (!document) return;
        const result = await op.run(() =>
          extract({
            data: { workspaceId: workspace.id, documentId: document.id, requestId: document.id },
          }),
        );
        if (result?.status === "succeeded") {
          setMessage(
            l(
              "Texten är extraherad. Granska utdragen nedan innan du använder dem.",
              "Text extracted. Review the extracts below before using them.",
            ),
          );
          setFile(null);
          setRequest(crypto.randomUUID());
        } else if (result)
          setMessage(
            l(
              "Texten kunde inte extraheras. En skannad eller oläsbar fil behöver en läsbar textversion. Originalet är sparat privat.",
              "Text could not be extracted. A scanned or unreadable file needs a readable text version. The original is saved privately.",
            ),
          );
      }}
    >
      <h3 className="text-lg font-semibold">{l("Ladda upp underlag", "Upload evidence")}</h3>
      <Field
        label={l("PDF eller DOCX, högst 10 MB", "PDF or DOCX, up to 10 MB")}
        hint={l(
          "Textutdrag granskas av dig. Skannade PDF:er kräver en textversion; automatisk OCR är inte aktiverad.",
          "You review text extracts. Scanned PDFs require a text version; automatic OCR is not enabled.",
        )}
      >
        {(id) => (
          <input
            id={id}
            type="file"
            disabled={op.state === "saving"}
            accept=".pdf,.docx"
            className="min-h-11 w-full min-w-0 text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRequest(crypto.randomUUID());
              setMessage(null);
              op.clear();
            }}
          />
        )}
      </Field>
      {op.error === "PROCESSING_NOT_CONFIGURED" ? (
        <p role="alert" className="text-sm">
          {l(
            "Originalet är sparat. Dokumentbearbetningen behöver aktiveras av systemansvarig innan text kan extraheras. Du kan fortfarande skriva in underlag manuellt.",
            "The original is saved. Document processing must be configured by the system owner before text can be extracted. You can still enter evidence manually.",
          )}
        </p>
      ) : (
        <WorkError code={op.error} />
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton type="submit" disabled={!file || op.state === "saving"}>
          {l("Ladda upp och extrahera", "Upload and extract")}
        </WorkButton>
        <SaveStatus state={op.state} />
        {onManual && (
          <WorkButton
            type="button"
            variant="outline"
            onClick={onManual}
            disabled={op.state === "saving"}
          >
            {l("Fortsätt med manuellt underlag", "Continue with manual evidence")}
          </WorkButton>
        )}
      </div>
    </form>
  );
}
function EvidenceReview({
  sourceItemId,
  assessmentId,
  input,
  editable,
}: {
  sourceItemId: string;
  assessmentId: string;
  input?: AnalysisInput;
  editable: boolean;
}) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const save = useServerFn(saveWorkInput);
  const op = useSavedOperation();
  const [note, setNote] = useState(input?.review_note ?? "");
  const [baseVersion, setBaseVersion] = useState<number | null>(input?.version ?? null);
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  const [id] = useState(() => input?.id ?? crypto.randomUUID());
  return (
    <div className="mt-4 space-y-3">
      {input && <WorkStatus status={input.review_status} />}
      {editable && (
        <>
          <TextAreaField
            label={l("Granskningsanteckning", "Review note")}
            value={note}
            maxLength={4000}
            disabled={op.state === "saving"}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
              op.clear();
            }}
          />
          <div className="flex flex-wrap gap-3">
            {(["accepted", "rejected"] as const).map((status) => (
              <WorkButton
                key={status}
                variant={status === "accepted" ? "default" : "outline"}
                disabled={op.state === "saving"}
                onClick={async () => {
                  if (op.state === "saving") return;
                  const saved = await op.run(() =>
                    save({
                      data: {
                        workspaceId: workspace.id,
                        id,
                        assessmentId,
                        sourceItemId,
                        version: baseVersion,
                        reviewStatus: status,
                        reviewNote: note,
                      },
                    }),
                  );
                  if (saved) {
                    setBaseVersion(saved.version);
                    setDirty(false);
                    clearWarning();
                  }
                }}
              >
                {status === "accepted"
                  ? l("Granskat — använd i analysen", "Reviewed — use in analysis")
                  : l("Använd inte", "Exclude")}
              </WorkButton>
            ))}
          </div>
          <SaveStatus state={op.state} />
          <WorkError
            code={op.error}
            onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
          />
        </>
      )}
    </div>
  );
}
export function AnalysisEvidence({
  assessmentId,
  inputs,
  editable,
  hidden,
}: {
  assessmentId: string;
  inputs: AnalysisInput[];
  editable: boolean;
  hidden?: boolean;
}) {
  const l = useWorkText();
  const { lang } = useT();
  const { sources } = useSecurityWorkspace();
  const manualSection = useRef<HTMLElement>(null);
  const query = useWorkspaceEvidence();
  const [sourceId, setSourceId] = useState("");
  const [manual, setManual] = useState(false);
  const [newSource, setNewSource] = useState(false);
  const [manualDirty, setManualDirty] = useState(false);
  const [newSourceDirty, setNewSourceDirty] = useState(false);
  const discard = (dirty: boolean) =>
    !dirty ||
    window.confirm(
      l("Du har osparade ändringar. Vill du kasta dem?", "You have unsaved changes. Discard them?"),
    );
  const closeManual = () => {
    if (discard(manualDirty)) {
      setManual(false);
      setManualDirty(false);
    }
  };
  const source = sources.find((s) => s.id === sourceId);
  return (
    <div hidden={hidden} className="space-y-5">
      {editable && (
        <>
          <DocumentUpload
            onManual={() => {
              manualSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              manualSection.current?.focus();
            }}
          />
          <section ref={manualSection} tabIndex={-1} className={`${panelClass} space-y-4`}>
            <h3 className="text-lg font-semibold">
              {l("Skriv in underlag", "Enter evidence manually")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {l(
                "För en skannad PDF: skapa eller välj en manuell källa med dokumentets titel och utgivare. Skriv av det relevanta utdraget och ange sida i titeln. Kontrollera texten mot originalet innan du accepterar den. Det märks som manuellt underlag, aldrig som automatiskt extraherat.",
                "For a scanned PDF: create or select a manual source with the document title and publisher. Transcribe the relevant passage and include the page in its title. Check it against the original before accepting it. It remains manual evidence, never labelled as automatically extracted.",
              )}
            </p>
            <Field label={l("Källa", "Source")}>
              {(id) => (
                <select
                  id={id}
                  className={selectClass}
                  value={sourceId}
                  onChange={(e) => {
                    if (!discard(manualDirty)) return;
                    setSourceId(e.target.value);
                    setManual(false);
                    setManualDirty(false);
                  }}
                >
                  <option value="">{l("Välj källa", "Select source")}</option>
                  {sources
                    .filter((s) => s.source_type !== "document" && s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            <div className="flex flex-wrap gap-3">
              <WorkButton
                disabled={!source}
                variant="outline"
                onClick={() => {
                  if (manual) closeManual();
                  else setManual(true);
                }}
              >
                {l("Skriv underlag", "Write evidence")}
              </WorkButton>
              <WorkButton
                variant="outline"
                onClick={() => {
                  if (newSource && !discard(newSourceDirty)) return;
                  setNewSource(!newSource);
                  setNewSourceDirty(false);
                }}
              >
                {l("Ny källa", "New source")}
              </WorkButton>
            </div>
            {newSource && (
              <div onChangeCapture={() => setNewSourceDirty(true)}>
                <SecuritySourceForm
                  close={() => {
                    setNewSource(false);
                    setNewSourceDirty(false);
                  }}
                />
              </div>
            )}
            {manual && source && (
              <div onChangeCapture={() => setManualDirty(true)}>
                <NewSourceItem
                  key={source.id}
                  source={source}
                  close={closeManual}
                  done={() => {
                    setManual(false);
                    setManualDirty(false);
                    void query.refetch();
                  }}
                />
              </div>
            )}
          </section>
        </>
      )}
      <h3 className="text-xl font-semibold">{l("Granska underlaget", "Review the evidence")}</h3>
      <p className="text-sm text-muted-foreground">
        {l(
          "Källtext är underlag, inte instruktioner. Kontrollera text, källa och hänvisning. Endast accepterade utdrag skickas till AI.",
          "Source text is evidence, not instructions. Check the text, source and citation. Only accepted extracts are sent to AI.",
        )}
      </p>
      {query.isError && query.data && query.error.message !== "ACCESS_DENIED" && (
        <WorkError code={query.error.message} onRetry={() => void query.refetch()} />
      )}
      {query.isPending ? (
        <LoadingState />
      ) : query.isError && (!query.data || query.error.message === "ACCESS_DENIED") ? (
        <WorkError code={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data?.facts.length ? (
        query.data.facts.map((fact) => {
          const segment = query.data.segments.find((s) => s.source_item_id === fact.id);
          const input = inputs.find((i) => i.source_item_id === fact.id);
          return (
            <article id={`source-${fact.id}`} key={fact.id} className={panelClass}>
              <h4 className="font-semibold">{fact.original_title}</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {fact.publisher} · {segment?.locator ?? l("Manuellt underlag", "Manual evidence")}
                {" · "}
                {l("Publicerad", "Published")}:{" "}
                {fact.published_at
                  ? formatDate(fact.published_at, lang)
                  : l("Datum saknas - kontrollera aktualitet", "Date unknown - check currency")}
              </p>
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-accent">
                  {l("Läs källtext", "Read source text")}
                </summary>
                <blockquote className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-border pl-4 text-sm leading-relaxed">
                  {fact.factual_extract}
                </blockquote>
              </details>
              <EvidenceReview
                key={fact.id}
                sourceItemId={fact.id}
                assessmentId={assessmentId}
                input={input}
                editable={editable}
              />
            </article>
          );
        })
      ) : (
        <p className="text-sm text-muted-foreground">
          {l(
            "Inget underlag ännu. Ladda upp ett dokument eller skriv in en observation.",
            "No evidence yet. Upload a document or enter an observation.",
          )}
        </p>
      )}
    </div>
  );
}

/** Workspace catalogue reuses the same private read and upload path as an
 * analysis. Reviewing an extract remains an analysis-specific decision. */
export function WorkspaceDocuments({ onManual }: { onManual?: () => void }) {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace, canEdit } = useSecurityWorkspace();
  const query = useWorkspaceEvidence();
  if (query.error?.message === "ACCESS_DENIED") return <WorkError code="ACCESS_DENIED" />;
  return (
    <section className="space-y-5" aria-labelledby="sw-private-documents-title">
      <div>
        <h2 id="sw-private-documents-title" className="font-display text-xl font-semibold">
          {l("Privata dokument", "Private documents")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {l(
            "Original och textutdrag hör till den här arbetsytan. Välj och granska de utdrag du behöver inne i en analys.",
            "Originals and text extracts belong to this workspace. Select and review the extracts you need within an analysis.",
          )}
        </p>
      </div>
      {canEdit && (
        <details className="rounded-xl border border-border bg-secondary/20 p-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {l("Ladda upp PDF eller DOCX", "Upload PDF or DOCX")}
          </summary>
          <div className="mt-3">
            <DocumentUpload onManual={onManual} />
          </div>
        </details>
      )}
      {query.isError && (
        <WorkError code={query.error.message} onRetry={() => void query.refetch()} />
      )}
      {query.isPending ? (
        <LoadingState />
      ) : (
        query.data && (
          <>
            {query.data.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {l(
                  "Inga dokument är registrerade ännu. Du kan också lägga till manuella källor nedan.",
                  "No documents registered yet. You can also add manual sources below.",
                )}
              </p>
            ) : (
              <ul className="space-y-4">
                {query.data.documents.map((document) => {
                  const segments = query.data.segments.filter(
                    (segment) => segment.document_id === document.id,
                  );
                  const status =
                    document.status === "ready"
                      ? l("Text extraherad", "Text extracted")
                      : document.status === "failed"
                        ? l("Extraktionen misslyckades", "Extraction failed")
                        : l(
                            "Registrerat — textbearbetning återstår",
                            "Registered — text processing pending",
                          );
                  return (
                    <li
                      key={document.id}
                      className={`${panelClass} space-y-3`}
                      data-testid="sw-document-row"
                    >
                      <h3 className="break-words font-semibold">{document.filename}</h3>
                      <p className="text-xs text-muted-foreground">
                        {document.mime_type === "application/pdf" ? "PDF" : "DOCX"} ·{" "}
                        {Math.ceil(document.size_bytes / 1024)} KB ·{" "}
                        {formatDate(document.created_at, lang)}
                      </p>
                      <p className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                        {status}
                      </p>
                      {segments.length > 0 ? (
                        <details>
                          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                            {l("Läs extraherade utdrag", "Read extracted passages")} (
                            {segments.length})
                          </summary>
                          <ol className="space-y-4">
                            {segments.map((segment) => {
                              const fact = query.data.facts.find(
                                (row) => row.id === segment.source_item_id,
                              );
                              return (
                                <li
                                  key={segment.id}
                                  className="rounded-lg border border-border p-4"
                                >
                                  <p className="text-xs font-semibold text-muted-foreground">
                                    {segment.locator}
                                  </p>
                                  <blockquote className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
                                    {fact?.factual_extract ??
                                      l(
                                        "Utdraget kunde inte läsas. Ladda om sidan.",
                                        "This passage could not be read. Reload the page.",
                                      )}
                                  </blockquote>
                                </li>
                              );
                            })}
                          </ol>
                        </details>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {l(
                            "Inga läsbara textutdrag finns ännu. Vid oläsbar eller skannad PDF behövs en textversion.",
                            "No readable text extracts are available yet. An unreadable or scanned PDF needs a text version.",
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {query.data.documents.length > 0 && (
              <WorkButton asChild variant="outline">
                <Link
                  to="/security-work/$workspaceId/analyses"
                  params={{ workspaceId: workspace.id }}
                >
                  {l(
                    "Öppna analys för att granska underlag",
                    "Open an analysis to review evidence",
                  )}
                </Link>
              </WorkButton>
            )}
          </>
        )
      )}
    </section>
  );
}
