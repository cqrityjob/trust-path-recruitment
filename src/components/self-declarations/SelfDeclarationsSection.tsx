// Voluntary self-declarations — the section on /my-career/profile.
//
// THE CONTRACT THIS SCREEN KEEPS (scripts/self-declarations-check.ts):
//
//   * Everything is optional and nothing is pre-selected: the affirmation box
//     starts unticked every time the form opens, and there is no "no" answer
//     to give -- a holder either makes the statement or leaves it.
//   * A kind the server reports as closed renders NO input of any sort.
//     Criminal history is always closed here.
//   * The only labels are the three provenance levels. There is no badge,
//     score, progress figure or completeness contribution.
//   * Withdraw, delete, renew and remove are reported from the server's
//     answer. "Erased" is said only when no file is owed any more; an owed or
//     failed cleanup stays on screen with a retry.
//
// It owns its own reads and writes and is mounted unconditionally by the
// route, like the other Profile editors. It contributes nothing to the
// professional-identity query, on purpose.

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { L, Lf, type Copy, type Lang } from "@/components/professional-identity/copy";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useT } from "@/i18n/context";
import {
  CLEANUP,
  CLOSED,
  DOCUMENT,
  DOCUMENT_TYPE,
  KIND_TITLE,
  LEGAL_BASIS,
  PANEL,
  PROVENANCE,
  SECTION,
  STATEMENTS,
  errorCopy,
} from "@/lib/self-declarations/copy";
import {
  deleteSelfDeclaration,
  getMySelfDeclarations,
  readSelfDeclarationDocument,
  removeSelfDeclarationDocument,
  retrySelfDeclarationCleanup,
  saveSelfDeclaration,
  setSelfDeclarationReviewRequest,
  uploadSelfDeclarationDocument,
  withdrawSelfDeclaration,
  type SelfDeclarationsResult,
} from "@/lib/self-declarations/declarations.functions";
import {
  DOCUMENT_ALLOWED_MIME,
  fileProblem,
  selfDeclarationErrorCode,
  todayIso,
  type DocumentMime,
  type DocumentType,
  type PanelView,
} from "@/lib/self-declarations/model";

export const SELF_DECLARATIONS_QUERY_KEY = ["self-declarations"] as const;

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-[color:var(--primary-hover)]`;
const SECONDARY = `${BTN} border border-border bg-background text-foreground hover:bg-secondary`;
const DANGER = `${BTN} border border-destructive/40 bg-background text-destructive hover:bg-destructive/10`;
const FIELD =
  "mt-1 block min-h-11 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LABEL = "block text-sm font-medium text-foreground";

type Notice = { readonly tone: "ok" | "error"; readonly text: Copy };
type Apply = (result: SelfDeclarationsResult) => void;

function isoDay(value: string): string {
  return value.slice(0, 10);
}

function minDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 31);
  return todayIso(d);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function SelfDeclarationsSection() {
  const { lang } = useT();
  const l = lang as Lang;
  const queryClient = useQueryClient();
  const load = useServerFn(getMySelfDeclarations);
  const retry = useServerFn(retrySelfDeclarationCleanup);
  const [dirtyKinds, setDirtyKinds] = useState<readonly string[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [retryNotice, setRetryNotice] = useState<Notice | null>(null);
  useUnsavedChanges(dirtyKinds.length > 0);

  const query = useQuery({
    queryKey: SELF_DECLARATIONS_QUERY_KEY,
    queryFn: () => load(),
    retry: false,
  });

  const apply: Apply = (result) => {
    queryClient.setQueryData(SELF_DECLARATIONS_QUERY_KEY, result);
  };
  const setDirty = (kind: string, dirty: boolean) => {
    setDirtyKinds((current) =>
      dirty
        ? current.includes(kind)
          ? current
          : [...current, kind]
        : current.filter((k) => k !== kind),
    );
  };

  async function retryCleanup() {
    setRetrying(true);
    setRetryNotice(null);
    try {
      const result = await retry();
      apply(result);
      setRetryNotice(
        result.fileDeletion === "confirmed"
          ? { tone: "ok", text: CLEANUP.done }
          : { tone: "error", text: CLEANUP.stillOwed },
      );
    } catch {
      setRetryNotice({ tone: "error", text: CLEANUP.stillOwed });
    } finally {
      setRetrying(false);
    }
  }

  const view = query.data?.view ?? null;

  return (
    <section aria-labelledby="self-declarations-heading" data-self-declarations>
      <h2
        id="self-declarations-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(SECTION.heading, l)}
      </h2>
      <div className="mt-1.5 max-w-2xl space-y-2 text-sm text-muted-foreground">
        <p>{L(SECTION.lede, l)}</p>
        <p>{L(SECTION.whatItIs, l)}</p>
        <p>{L(SECTION.privacy, l)}</p>
      </div>

      {query.isPending ? (
        <p role="status" className="mt-5 text-sm text-muted-foreground" data-vsd-loading>
          {L(SECTION.loading, l)}
        </p>
      ) : query.isError || !view ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-border bg-card p-5"
          data-vsd-failed
        >
          <p className="text-sm text-destructive">{L(SECTION.loadFailed, l)}</p>
          <button
            type="button"
            className={`${SECONDARY} mt-3`}
            onClick={() => void query.refetch()}
          >
            {L(SECTION.retry, l)}
          </button>
        </div>
      ) : (
        <>
          {view.cleanupOwed || retryNotice ? (
            <div
              className="mt-5 rounded-xl border border-border bg-card p-5"
              data-vsd-cleanup={view.cleanupOwed ? "owed" : "clear"}
            >
              {view.cleanupOwed ? (
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={retrying}
                  onClick={() => void retryCleanup()}
                  data-vsd-cleanup-retry
                >
                  {L(retrying ? CLEANUP.retrying : CLEANUP.retry, l)}
                </button>
              ) : null}
              {retryNotice ? (
                <p
                  role={retryNotice.tone === "error" ? "alert" : "status"}
                  className={`text-sm ${view.cleanupOwed ? "mt-3" : ""} ${
                    retryNotice.tone === "error" ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {L(retryNotice.text, l)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 space-y-6">
            {view.panels.map((panel) => (
              <Panel
                key={panel.kind}
                panel={panel}
                lang={l}
                apply={apply}
                refetch={() => void query.refetch()}
                setDirty={(dirty) => setDirty(panel.kind, dirty)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Panel({
  panel,
  lang: l,
  apply,
  refetch,
  setDirty,
}: {
  readonly panel: PanelView;
  readonly lang: Lang;
  readonly apply: Apply;
  readonly refetch: () => void;
  readonly setDirty: (dirty: boolean) => void;
}) {
  const save = useServerFn(saveSelfDeclaration);
  const withdraw = useServerFn(withdrawSelfDeclaration);
  const remove = useServerFn(deleteSelfDeclaration);
  const headingId = useId();
  const [form, setForm] = useState<null | { asOfDate: string; affirmed: boolean }>(null);
  const [confirm, setConfirm] = useState<null | "withdraw" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const declaration = panel.declaration;
  const authorization = panel.authorization;
  const statement = authorization ? STATEMENTS[authorization.statementVersion] : undefined;
  // What a saved statement says is the wording it was saved under.
  const savedStatement = declaration ? STATEMENTS[declaration.statementVersion] : undefined;

  function openForm() {
    // Never pre-ticked, whatever was saved before.
    setForm({ asOfDate: todayIso(), affirmed: false });
    setConfirm(null);
    setNotice(null);
  }
  function closeForm() {
    setForm(null);
    setDirty(false);
  }

  // `done` reads the server's answer: nothing is called finished that the
  // server did not confirm.
  async function run(
    action: () => Promise<SelfDeclarationsResult>,
    done: (result: SelfDeclarationsResult) => Copy | null,
  ) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      apply(result);
      closeForm();
      setConfirm(null);
      const text = done(result);
      setNotice(text ? { tone: "ok", text } : null);
    } catch (error) {
      const code = selfDeclarationErrorCode(error instanceof Error ? error.message : "");
      setNotice({ tone: "error", text: errorCopy(code) });
      // The screen was stale: show what is actually there.
      if (
        code === "VSD_STALE_REVISION" ||
        code === "VSD_DECLARATION_EXISTS" ||
        code === "VSD_DECLARATION_NOT_FOUND" ||
        code === "VSD_PROCESSING_NOT_AUTHORIZED"
      ) {
        closeForm();
        setConfirm(null);
        refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-card p-5 md:p-6"
      data-vsd-panel={panel.kind}
      data-vsd-state={panel.state}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 id={headingId} className="text-base font-semibold tracking-tight text-foreground">
          {L(KIND_TITLE[panel.kind], l)}
        </h3>
        {panel.state === "closed" ? (
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {L(CLOSED.chip, l)}
          </span>
        ) : declaration?.provenance ? (
          <span
            className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground"
            data-vsd-provenance={declaration.provenance}
          >
            {L(PROVENANCE[declaration.provenance].label, l)}
          </span>
        ) : null}
      </div>

      {panel.state === "closed" ? (
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          {L(panel.kind === "criminal_history" ? CLOSED.criminal : CLOSED.financial, l)}
        </p>
      ) : null}

      {panel.state === "declared" && declaration && savedStatement ? (
        <div className="mt-3">
          <p className="max-w-[65ch] text-sm leading-relaxed text-foreground" data-vsd-statement>
            {Lf(savedStatement.statement, l, declaration.asOfDate)}
          </p>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            {L(savedStatement.scope, l)}
          </p>
          {declaration.provenance ? (
            <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
              {L(PROVENANCE[declaration.provenance].hint, l)}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {Lf(PANEL.declaredOn, l, isoDay(declaration.declaredAt))}
            {" · "}
            {Lf(PANEL.keptUntil, l, isoDay(declaration.retainUntil))}
          </p>
        </div>
      ) : null}

      {panel.state === "withdrawn" && declaration ? (
        <p className="mt-3 text-sm text-muted-foreground" data-vsd-withdrawn>
          {Lf(PANEL.withdrawn, l, isoDay(declaration.withdrawnAt ?? declaration.declaredAt))}
        </p>
      ) : null}

      {panel.state === "open" ? (
        <p className="mt-2 text-sm text-muted-foreground">{L(PANEL.notDeclared, l)}</p>
      ) : null}

      {authorization && panel.state !== "closed" ? (
        <details className="mt-3 text-sm text-muted-foreground" data-vsd-processing>
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {L(PANEL.aboutProcessing, l)}
          </summary>
          <dl className="mt-2 space-y-1.5">
            <div>
              <dt className="inline font-medium text-foreground">{L(PANEL.operator, l)}: </dt>
              <dd className="inline">
                {authorization.operatorName} ({authorization.operatorRegistration})
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">{L(PANEL.purpose, l)}: </dt>
              <dd className="inline">{authorization.purpose}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">{L(PANEL.legalBasis, l)}: </dt>
              <dd className="inline">
                {L(LEGAL_BASIS[authorization.legalBasis], l)}. {authorization.legalBasisDetail}
              </dd>
            </div>
            <div>
              <dd>{Lf(PANEL.retention, l, authorization.retentionDays)}</dd>
            </div>
          </dl>
        </details>
      ) : null}

      {/* ── The form: declare, change or renew ─────────────────────────── */}
      {form && authorization && statement ? (
        <form
          className="mt-4 rounded-lg border border-border p-4"
          data-vsd-form
          onSubmit={(event) => {
            event.preventDefault();
            if (!form.affirmed) {
              setNotice({ tone: "error", text: errorCopy("VSD_AFFIRMATION_REQUIRED") });
              return;
            }
            void run(
              () =>
                save({
                  data: {
                    kind: panel.kind,
                    asOfDate: form.asOfDate,
                    affirmed: true,
                    expectedRevision: declaration ? declaration.revision : null,
                  },
                }),
              () => PANEL.saved,
            );
          }}
        >
          {declaration ? (
            <p className="text-sm font-semibold text-foreground">{L(PANEL.renewHeading, l)}</p>
          ) : null}
          {declaration?.status === "active" ? (
            <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
              {L(PANEL.renewWarning, l)}
            </p>
          ) : null}
          <label className={`${LABEL} ${declaration ? "mt-3" : ""}`}>
            {L(PANEL.asOfLabel, l)}
            <input
              type="date"
              required
              className={FIELD}
              value={form.asOfDate}
              min={minDateIso()}
              max={todayIso()}
              onChange={(event) => {
                setForm({ ...form, asOfDate: event.target.value });
                setDirty(true);
              }}
            />
          </label>
          <p
            className="mt-3 max-w-[65ch] text-sm leading-relaxed text-foreground"
            data-vsd-statement-draft
          >
            {Lf(statement.statement, l, form.asOfDate || "…")}
          </p>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{L(statement.scope, l)}</p>
          <label className="mt-3 flex min-h-11 items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 rounded border-input"
              checked={form.affirmed}
              onChange={(event) => {
                setForm({ ...form, affirmed: event.target.checked });
                setDirty(true);
              }}
              data-vsd-affirm
            />
            <span>{L(PANEL.affirm, l)}</span>
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              className={PRIMARY}
              disabled={busy || !form.affirmed}
              data-vsd-save
            >
              {L(busy ? PANEL.saving : PANEL.save, l)}
            </button>
            <button type="button" className={SECONDARY} disabled={busy} onClick={closeForm}>
              {L(PANEL.cancel, l)}
            </button>
          </div>
        </form>
      ) : null}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      {!form && panel.state !== "closed" ? (
        <div className="mt-4 flex flex-wrap gap-2" data-vsd-actions>
          {authorization && statement && panel.state === "open" ? (
            <button type="button" className={PRIMARY} onClick={openForm} data-vsd-declare>
              {L(PANEL.declare, l)}
            </button>
          ) : null}
          {authorization && statement && panel.state === "declared" ? (
            <button type="button" className={SECONDARY} onClick={openForm} data-vsd-renew>
              {L(PANEL.renew, l)}
            </button>
          ) : null}
          {authorization && statement && panel.state === "withdrawn" ? (
            <button type="button" className={SECONDARY} onClick={openForm} data-vsd-declare>
              {L(PANEL.declareAgain, l)}
            </button>
          ) : null}
          {panel.state === "declared" ? (
            <button
              type="button"
              className={SECONDARY}
              onClick={() => {
                setConfirm("withdraw");
                setNotice(null);
              }}
              data-vsd-withdraw
            >
              {L(PANEL.withdraw, l)}
            </button>
          ) : null}
          {declaration ? (
            <button
              type="button"
              className={DANGER}
              onClick={() => {
                setConfirm("delete");
                setNotice(null);
              }}
              data-vsd-delete
            >
              {L(PANEL.remove, l)}
            </button>
          ) : null}
        </div>
      ) : null}

      {confirm && declaration ? (
        <div
          role="group"
          className="mt-3 rounded-lg border border-border p-4"
          data-vsd-confirm={confirm}
        >
          <p className="max-w-[65ch] text-sm text-foreground">
            {L(confirm === "withdraw" ? PANEL.withdrawConfirm : PANEL.removeConfirm, l)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={DANGER}
              disabled={busy}
              data-vsd-confirm-yes
              onClick={() =>
                void run(
                  () =>
                    confirm === "withdraw"
                      ? withdraw({ data: { declarationId: declaration.id } })
                      : remove({ data: { declarationId: declaration.id } }),
                  // A withdrawal shows itself in the panel. A deletion is only
                  // "deleted" once no file is owed; until then the owed
                  // cleanup below is what the holder is told.
                  (result) =>
                    confirm === "delete" && result.fileDeletion === "confirmed"
                      ? PANEL.removed
                      : null,
                )
              }
            >
              {L(
                busy ? PANEL.working : confirm === "withdraw" ? PANEL.withdrawYes : PANEL.removeYes,
                l,
              )}
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              {L(PANEL.cancel, l)}
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 text-sm ${notice.tone === "error" ? "text-destructive" : "text-foreground"}`}
          data-vsd-notice={notice.tone}
        >
          {L(notice.text, l)}
        </p>
      ) : null}

      {/* ── Optional supporting document ───────────────────────────────── */}
      {panel.state === "declared" && declaration && authorization && !form ? (
        authorization.documentTypes.length > 0 ||
        declaration.document ||
        declaration.unfinishedUploadId ? (
          <DocumentArea
            panel={panel}
            lang={l}
            apply={apply}
            refetch={refetch}
            setDirty={setDirty}
          />
        ) : null
      ) : null}

      {/* ── Owed cleanup: never hidden, never called done early ────────── */}
      {panel.deletionPending ? (
        <p role="status" className="mt-4 text-sm text-foreground" data-vsd-deletion-pending>
          {L(CLEANUP.deletionPending, l)}
        </p>
      ) : null}
      {panel.cleanups.length > 0 ? (
        <ul className="mt-3 space-y-1.5" data-vsd-cleanups>
          {panel.cleanups.map((cleanup) => (
            <li
              key={cleanup.documentId}
              className={`text-sm ${cleanup.failed ? "text-destructive" : "text-muted-foreground"}`}
              data-vsd-cleanup-item={cleanup.failed ? "failed" : "pending"}
            >
              {Lf(cleanup.failed ? CLEANUP.failed : CLEANUP.pending, l, cleanup.fileName)}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function DocumentArea({
  panel,
  lang: l,
  apply,
  refetch,
  setDirty,
}: {
  readonly panel: PanelView;
  readonly lang: Lang;
  readonly apply: Apply;
  readonly refetch: () => void;
  readonly setDirty: (dirty: boolean) => void;
}) {
  const upload = useServerFn(uploadSelfDeclarationDocument);
  const removeDocument = useServerFn(removeSelfDeclarationDocument);
  const readDocument = useServerFn(readSelfDeclarationDocument);
  const setReview = useServerFn(setSelfDeclarationReviewRequest);
  const [file, setFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  // One id per chosen file, so a retry after a lost response is the same upload.
  const [uploadId, setUploadId] = useState<string>(() => crypto.randomUUID());
  const [inputKey, setInputKey] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const declaration = panel.declaration;
  const types = panel.authorization?.documentTypes ?? [];
  if (!declaration) return null;
  const document = declaration.document;
  const chosenType: DocumentType | "" = types.length === 1 ? types[0] : documentType;

  function reset() {
    setFile(null);
    setIssueDate("");
    setDocumentType("");
    setUploadId(crypto.randomUUID());
    setInputKey((n) => n + 1);
    setDirty(false);
  }

  async function run(action: () => Promise<SelfDeclarationsResult>, done: Copy | null) {
    setBusy(true);
    setNotice(null);
    try {
      apply(await action());
      reset();
      setConfirmRemove(false);
      setNotice(done ? { tone: "ok", text: done } : null);
    } catch (error) {
      const code = selfDeclarationErrorCode(error instanceof Error ? error.message : "");
      // No answer, or an answer that could not confirm: the upload may have
      // been saved. Keep the same upload id, so trying again resumes it
      // rather than starting a second one. A definite refusal ends this id.
      const unconfirmed = code === "VSD_WRITE_FAILED" || code === "VSD_UPLOAD_UNCONFIRMED";
      if (!unconfirmed) setUploadId(crypto.randomUUID());
      setNotice({ tone: "error", text: errorCopy(unconfirmed ? "VSD_UPLOAD_UNCONFIRMED" : code) });
      // Whatever happened, show what is really stored.
      refetch();
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!file || !declaration) return;
    const problem = fileProblem(file);
    if (problem) {
      setNotice({
        tone: "error",
        text:
          problem === "type"
            ? DOCUMENT.problemType
            : problem === "size"
              ? DOCUMENT.problemSize
              : DOCUMENT.problemEmpty,
      });
      return;
    }
    if (!issueDate || issueDate > todayIso() || chosenType === "") {
      setNotice({ tone: "error", text: DOCUMENT.problemDate });
      return;
    }
    const contentBase64 = await fileToBase64(file);
    await run(
      () =>
        upload({
          data: {
            uploadId,
            declarationId: declaration.id,
            declarationRevision: declaration.revision,
            documentType: chosenType,
            issueDate,
            fileName: file.name,
            mimeType: file.type as DocumentMime,
            contentBase64,
          },
        }),
      DOCUMENT.attached,
    );
  }

  // There is no link to the file. Each press asks the server, which asks the
  // database whether this document may be read right now, and the bytes are
  // handed to the browser as a download that lives only in this page.
  async function download() {
    if (!document) return;
    setBusy(true);
    setNotice(null);
    try {
      const file = await readDocument({ data: { documentId: document.id } });
      const binary = atob(file.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = file.fileName;
      link.rel = "noopener";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setNotice({ tone: "error", text: errorCopy("VSD_DOCUMENT_NOT_FOUND") });
      refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-4" data-vsd-document-area>
      <h4 className="text-sm font-semibold text-foreground">{L(DOCUMENT.heading, l)}</h4>

      {document ? (
        <div className="mt-2" data-vsd-document={document.id}>
          <p className="text-sm text-foreground">
            <span className="break-all font-medium">{document.fileName}</span>
            {" · "}
            {L(DOCUMENT_TYPE[document.documentType], l)}
            {", "}
            {Lf(DOCUMENT.issued, l, document.issueDate)}
          </p>
          {document.reviewOutcome === "not_confirmed" ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {L(DOCUMENT.reviewNotConfirmed, l)}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={SECONDARY}
              disabled={busy}
              onClick={() => void download()}
              data-vsd-document-open
            >
              {L(DOCUMENT.download, l)}
            </button>
            <button
              type="button"
              className={DANGER}
              disabled={busy}
              onClick={() => {
                setConfirmRemove(true);
                setNotice(null);
              }}
              data-vsd-document-remove
            >
              {L(DOCUMENT.removeDoc, l)}
            </button>
          </div>
          {confirmRemove ? (
            <div role="group" className="mt-3 rounded-lg border border-border p-4">
              <p className="text-sm text-foreground">{L(DOCUMENT.removeDocConfirm, l)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={DANGER}
                  disabled={busy}
                  data-vsd-document-remove-yes
                  onClick={() =>
                    // Whether the file is gone is shown by the owed-cleanup list.
                    void run(() => removeDocument({ data: { documentId: document.id } }), null)
                  }
                >
                  {L(busy ? PANEL.working : DOCUMENT.removeDocYes, l)}
                </button>
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={busy}
                  onClick={() => setConfirmRemove(false)}
                >
                  {L(PANEL.cancel, l)}
                </button>
              </div>
            </div>
          ) : null}

          {declaration.reviewAvailable && document.reviewOutcome === null ? (
            <div className="mt-3">
              {document.reviewRequested ? (
                <>
                  <p className="max-w-[65ch] text-sm text-muted-foreground">
                    {L(DOCUMENT.reviewRequested, l)}
                  </p>
                  <button
                    type="button"
                    className={`${SECONDARY} mt-2`}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => setReview({ data: { documentId: document.id, requested: false } }),
                        null,
                      )
                    }
                  >
                    {L(DOCUMENT.reviewCancel, l)}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={SECONDARY}
                  disabled={busy}
                  data-vsd-review-request
                  onClick={() =>
                    void run(
                      () => setReview({ data: { documentId: document.id, requested: true } }),
                      null,
                    )
                  }
                >
                  {L(DOCUMENT.reviewRequest, l)}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {declaration.unfinishedUploadId ? (
        <div className="mt-3" data-vsd-unfinished>
          <p className="text-sm text-muted-foreground">{L(DOCUMENT.unfinished, l)}</p>
          <button
            type="button"
            className={`${SECONDARY} mt-2`}
            disabled={busy}
            onClick={() => {
              const id = declaration.unfinishedUploadId;
              if (id) void run(() => removeDocument({ data: { documentId: id } }), null);
            }}
          >
            {L(DOCUMENT.unfinishedRemove, l)}
          </button>
        </div>
      ) : null}

      {types.length > 0 ? (
        <form
          className="mt-3"
          data-vsd-upload-form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {L(document ? DOCUMENT.replaceWarning : DOCUMENT.lede, l)}
          </p>
          {types.length > 1 ? (
            <label className={`${LABEL} mt-3`}>
              {L(DOCUMENT.typeLabel, l)}
              <select
                className={FIELD}
                value={documentType}
                required
                onChange={(event) => setDocumentType(event.target.value as DocumentType | "")}
              >
                {/* No type is chosen for the holder. */}
                <option value="">—</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {L(DOCUMENT_TYPE[type], l)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-3 text-sm text-foreground">
              {L(DOCUMENT.typeLabel, l)}: {L(DOCUMENT_TYPE[types[0]], l)}
            </p>
          )}
          <label className={`${LABEL} mt-3`}>
            {L(DOCUMENT.fileLabel, l)}
            <input
              key={inputKey}
              type="file"
              accept={DOCUMENT_ALLOWED_MIME.join(",")}
              className="mt-1 block w-full max-w-md text-sm text-foreground file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border file:bg-background file:px-4 file:text-sm file:font-semibold"
              data-vsd-file
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                setUploadId(crypto.randomUUID());
                setNotice(null);
                setDirty(next !== null);
              }}
            />
          </label>
          <label className={`${LABEL} mt-3`}>
            {L(DOCUMENT.issueDateLabel, l)}
            <input
              type="date"
              className={FIELD}
              value={issueDate}
              max={todayIso()}
              data-vsd-issue-date
              onChange={(event) => setIssueDate(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className={`${SECONDARY} mt-4`}
            disabled={busy || !file}
            data-vsd-upload
          >
            {L(busy ? DOCUMENT.uploading : document ? DOCUMENT.replace : DOCUMENT.upload, l)}
          </button>
        </form>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 text-sm ${notice.tone === "error" ? "text-destructive" : "text-foreground"}`}
          data-vsd-document-notice={notice.tone}
        >
          {L(notice.text, l)}
        </p>
      ) : null}
    </div>
  );
}
