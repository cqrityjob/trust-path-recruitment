import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type {
  AdminCatalogueRequest,
  AdminResearchRecord,
  AdminResolveRequestInput,
} from "@/lib/job-intelligence/admin-catalogue-research.functions";
import {
  REQUEST_STATUS_ADMIN,
  requestStatusAdminLabel,
  type Lang,
} from "@/lib/security-passport/catalogue-research-labels";

export interface RequestDefinitionOption {
  readonly code: string;
  readonly name: string;
}

function resolveError(code: string, l: Lang): string {
  const say = (sv: string, en: string) => (l === "sv" ? sv : en);
  if (code === "SP_REQUEST_DEFINITION_REQUIRED")
    return say("Välj en befintlig definition.", "Choose an existing definition.");
  if (code === "SP_REQUEST_RECORD_REQUIRED")
    return say("Välj en forskningspost.", "Choose a research record.");
  if (code === "SP_REQUEST_REASON_REQUIRED")
    return say(
      "Skriv en motivering som innehavaren kan läsa.",
      "Write a reason the holder can read.",
    );
  if (code === "SP_REQUEST_LIMIT")
    return say(
      "Innehavaren har redan tio öppna förfrågningar. Besvara en av dem innan du öppnar den här igen.",
      "The holder already has ten open requests. Answer one of them before reopening this one.",
    );
  if (code === "SP_REQUEST_NOTE_INVALID")
    return say(
      "Anteckningen får vara högst 300 tecken.",
      "The note can be at most 300 characters.",
    );
  if (code === "FORBIDDEN_ADMIN_REQUIRED" || code === "SP_CATALOGUE_ADMIN_REQUIRED")
    return say(
      "Bara en plattformsadministratör får besvara en förfrågan.",
      "Only a platform administrator may answer a request.",
    );
  return say(`Svaret kunde inte sparas (${code}).`, `The answer could not be saved (${code}).`);
}

/** Words shared by two strings: a cheap, honest "looks like" to put likely matches first. */
function overlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s
        .toLocaleLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1),
    );
  const x = words(a);
  let n = 0;
  for (const w of words(b)) if (x.has(w)) n += 1;
  return n;
}

export function RequestsPanel({
  l,
  requests,
  failed,
  definitions,
  research,
  onResolve,
}: {
  l: Lang;
  requests: readonly AdminCatalogueRequest[] | null;
  failed: boolean;
  definitions: readonly RequestDefinitionOption[];
  research: readonly AdminResearchRecord[];
  onResolve: (input: AdminResolveRequestInput) => Promise<void>;
}) {
  const copy = (sv: string, en: string) => (l === "sv" ? sv : en);
  const [status, setStatus] = useState("open");
  const [open, setOpen] = useState<string | null>(null);
  const shown = (requests ?? []).filter((r) => !status || r.status === status);
  const counts = (requests ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  if (failed)
    return (
      <p role="alert" className="text-sm text-destructive" data-requests-unavailable>
        {copy(
          "Förfrågningarna kunde inte läsas. Schemat för certifieringsforskningen kanske inte är tillämpat ännu.",
          "The requests could not be read. The certification research schema may not be applied yet.",
        )}
      </p>
    );
  if (!requests) return <p role="status">{copy("Läser förfrågningarna…", "Loading requests…")}</p>;
  return (
    <div className="space-y-5" data-requests-panel>
      <p className="max-w-3xl text-sm text-muted-foreground" data-requests-boundary>
        {copy(
          "En förfrågan är text som en innehavare skrivit. Den är ingen definition och ingen merit, den ändrar ingenting som går att välja och den verifierar ingen. Du kan peka den mot en befintlig definition eller en forskningspost, eller avböja den med ett skäl som innehavaren kan läsa. Att lägga till en definition sker genom granskad migration.",
          "A request is text a holder wrote. It is not a definition and not a credential, it changes nothing that can be selected and verifies nobody. You can point it at an existing definition or a research record, or decline it with a reason the holder can read. Adding a definition is a reviewed migration.",
        )}
      </p>
      <dl className="grid gap-3 sm:grid-cols-4" data-requests-counts>
        {(Object.keys(REQUEST_STATUS_ADMIN) as (keyof typeof REQUEST_STATUS_ADMIN)[]).map((s) => (
          <div key={s} className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{requestStatusAdminLabel(s, l)}</dt>
            <dd className="mt-1 text-xl font-semibold" data-request-count={s}>
              {counts[s] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
      <label className="block text-sm">
        {copy("Status", "Status")}
        <select
          data-requests-filter="status"
          className="mt-1 block min-h-11 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{copy("Alla", "All")}</option>
          {Object.keys(REQUEST_STATUS_ADMIN).map((s) => (
            <option key={s} value={s}>
              {requestStatusAdminLabel(s, l)}
            </option>
          ))}
        </select>
      </label>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-requests-empty>
          {copy("Inga förfrågningar med den statusen.", "No requests with that status.")}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border bg-card p-4 text-sm"
              data-request-row={r.id}
              data-request-status={r.status}
            >
              <p className="font-medium">
                {r.abbreviation ? `${r.abbreviation} — ` : ""}
                {r.name}
              </p>
              <p className="text-muted-foreground">{r.issuer}</p>
              {r.sourceUrl && (
                <a
                  className="text-accent underline"
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {new URL(r.sourceUrl).hostname}
                </a>
              )}
              {r.note && <p className="mt-1 whitespace-pre-wrap">{r.note}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {copy("Skickad", "Sent")} {r.createdAt.slice(0, 10)} ·{" "}
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: r.holderUserId }}
                  className="underline"
                >
                  {copy("innehavaren", "the holder")}
                </Link>
              </p>
              <p className="mt-1 text-xs font-medium">
                {requestStatusAdminLabel(r.status, l)}
                {r.answeredCredentialCode ? ` · ${r.answeredCredentialCode}` : ""}
                {r.resolutionNote ? ` — ${r.resolutionNote}` : ""}
              </p>
              {open === r.id ? (
                <ResolveForm
                  l={l}
                  request={r}
                  definitions={definitions}
                  research={research}
                  onCancel={() => setOpen(null)}
                  onResolve={async (input) => {
                    await onResolve(input);
                    setOpen(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  data-request-answer
                  className="mt-2 min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                  onClick={() => setOpen(r.id)}
                >
                  {r.status === "open"
                    ? copy("Besvara", "Answer")
                    : copy("Ändra svar", "Change the answer")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResolveForm({
  l,
  request,
  definitions,
  research,
  onCancel,
  onResolve,
}: {
  l: Lang;
  request: AdminCatalogueRequest;
  definitions: readonly RequestDefinitionOption[];
  research: readonly AdminResearchRecord[];
  onCancel: () => void;
  onResolve: (input: AdminResolveRequestInput) => Promise<void>;
}) {
  const copy = (sv: string, en: string) => (l === "sv" ? sv : en);
  const [status, setStatus] = useState<AdminResolveRequestInput["status"]>(
    request.status === "open"
      ? "answered_existing"
      : (request.status as AdminResolveRequestInput["status"]),
  );
  const [note, setNote] = useState(request.resolutionNote ?? "");
  const text = `${request.name} ${request.issuer} ${request.abbreviation ?? ""}`;
  const likelyDefinitions = useMemo(
    () => [...definitions].sort((a, b) => overlap(text, b.name) - overlap(text, a.name)),
    [definitions, text],
  );
  const likelyRecords = useMemo(
    () =>
      research
        .filter((r) => r.credentialCode === null)
        .sort(
          (a, b) =>
            overlap(text, `${b.officialName} ${b.issuerName}`) -
            overlap(text, `${a.officialName} ${a.issuerName}`),
        ),
    [research, text],
  );
  const [code, setCode] = useState("");
  const [recordId, setRecordId] = useState(request.researchRecordId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field =
    "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <div
      className="mt-3 space-y-3 rounded-md border border-border bg-secondary/20 p-3"
      data-request-form
    >
      <label className="block text-xs">
        {copy("Svar", "Answer")}
        <select
          data-request-field="status"
          className={field}
          value={status}
          onChange={(e) => setStatus(e.target.value as AdminResolveRequestInput["status"])}
        >
          {(["answered_existing", "in_research", "declined", "open"] as const).map((s) => (
            <option key={s} value={s}>
              {requestStatusAdminLabel(s, l)}
            </option>
          ))}
        </select>
      </label>
      {status === "answered_existing" && (
        <label className="block text-xs">
          {copy("Befintlig definition", "Existing definition")}
          <select
            data-request-field="definition"
            className={field}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          >
            <option value="">{copy("Välj…", "Choose…")}</option>
            {likelyDefinitions.slice(0, 80).map((d) => (
              <option key={d.code} value={d.code}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </label>
      )}
      {status === "in_research" && (
        <label className="block text-xs">
          {copy("Forskningspost", "Research record")}
          <select
            data-request-field="record"
            className={field}
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
          >
            <option value="">{copy("Välj…", "Choose…")}</option>
            {likelyRecords.slice(0, 80).map((r) => (
              <option key={r.id} value={r.id}>
                {r.officialName} — {r.issuerName}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-xs">
        {status === "declined"
          ? copy("Skäl som innehavaren läser (krävs)", "Reason the holder reads (required)")
          : copy("Anteckning som innehavaren läser (valfri)", "Note the holder reads (optional)")}
        <textarea
          data-request-field="note"
          className="mt-1 block min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive" data-request-error>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-request-save
          disabled={busy}
          className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            setError(null);
            void onResolve({
              requestId: request.id,
              status,
              ...(note.trim() ? { note } : {}),
              ...(status === "answered_existing" && code ? { credentialCode: code } : {}),
              ...(status === "in_research" && recordId ? { researchRecordId: recordId } : {}),
            })
              .catch((cause: unknown) =>
                setError(resolveError(cause instanceof Error ? cause.message : "", l)),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? copy("Sparar…", "Saving…") : copy("Spara svar", "Save answer")}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md border border-input px-4 text-sm"
          onClick={onCancel}
        >
          {copy("Avbryt", "Cancel")}
        </button>
      </div>
    </div>
  );
}
