import { useEffect, useRef, useState } from "react";
import {
  EMPTY_REQUEST,
  REQUEST_LIMITS,
  requestErrorMessage,
  requestStatusLabel,
  validateCatalogueRequest,
  type CatalogueRequestDraft,
  type PickerLang,
  type RequestField,
} from "@/lib/security-passport/credential-picker";
import type {
  CatalogueRequestInput,
  MyCatalogueRequest,
} from "@/lib/security-passport/catalogue-requests.functions";

export interface RequestSeed {
  /** Changes every time the holder asks about a specific record: it re-opens and re-fills the panel. */
  readonly nonce: number;
  readonly name: string;
  readonly issuer: string;
  readonly abbreviation: string;
  readonly researchId: string | null;
}

/**
 * "Cannot find your certification?" — the holder's way to ask for a missing
 * certification to be considered.
 *
 * ── WHAT SENDING DOES, AND DOES NOT ────────────────────────────────────
 *
 * It records the text the holder typed as a REQUEST for an administrator to
 * read. It adds no credential to the Passport, creates no definition or issuer,
 * changes nothing selectable and verifies nothing. The panel says so before the
 * holder sends, and says what happened after.
 *
 * Deliberately not a form element: it sits beside the wizard and must never be
 * nested in, or submit, the credential form. Nothing the holder typed is lost when it is closed, the
 * request fails, or the wizard moves on; a double click sends one request (the
 * database also refuses a second open request for the same name and issuer).
 */
export function CatalogueRequestPanel({
  lang,
  suggestedName,
  seed,
  onRequest,
  onList,
}: {
  lang: PickerLang;
  /** What the holder searched for: offered as the name, never forced. */
  suggestedName: string;
  seed: RequestSeed | null;
  onRequest?: (input: CatalogueRequestInput) => Promise<{ id: string }>;
  onList?: () => Promise<readonly MyCatalogueRequest[]>;
}) {
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogueRequestDraft>(EMPTY_REQUEST);
  const [researchId, setResearchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [problem, setProblem] = useState<{ field: RequestField | null; message: string } | null>(
    null,
  );
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<readonly MyCatalogueRequest[]>([]);
  const seenNonce = useRef(0);

  const refresh = () => {
    void onList?.()
      .then(setMine)
      .catch(() => undefined);
  };
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!seed || seed.nonce === seenNonce.current) return;
    seenNonce.current = seed.nonce;
    setDraft({
      ...EMPTY_REQUEST,
      requested_name: seed.name,
      requested_issuer: seed.issuer,
      requested_abbreviation: seed.abbreviation,
    });
    setResearchId(seed.researchId);
    setSent(false);
    setProblem(null);
    setOpen(true);
  }, [seed]);

  if (!onRequest) return null;
  const set = (field: RequestField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSent(false);
    setProblem(null);
  };
  const submit = async () => {
    if (sending.current) return;
    const invalid = validateCatalogueRequest(draft, lang);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    sending.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await onRequest({
        requested_name: draft.requested_name,
        requested_issuer: draft.requested_issuer,
        requested_abbreviation: draft.requested_abbreviation,
        source_url: draft.source_url,
        note: draft.note,
        ...(researchId ? { research_id: researchId } : {}),
      });
      setSent(true);
      setDraft(EMPTY_REQUEST);
      setResearchId(null);
      refresh();
    } catch (cause) {
      // The draft stays exactly as typed: only the sent state and the message change.
      setProblem({
        field: null,
        message: requestErrorMessage(cause instanceof Error ? cause.message : "", lang),
      });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const input =
    "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const fieldProblem = (field: RequestField) =>
    problem?.field === field ? (
      <span role="alert" className="mt-1 block text-xs text-destructive">
        {problem.message}
      </span>
    ) : null;

  return (
    <details
      data-catalogue-request
      open={open}
      onToggle={(e) => {
        const isOpen = e.currentTarget.open;
        setOpen(isOpen);
        if (isOpen && !draft.requested_name && suggestedName.trim().length >= 3)
          set("requested_name", suggestedName.trim().slice(0, REQUEST_LIMITS.nameMax));
      }}
      className="rounded-lg border border-border bg-secondary/20"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">
        {copy("Hittar du inte din certifiering?", "Cannot find your certification?")}
      </summary>
      <div className="space-y-4 p-4 pt-1">
        <p className="text-sm text-muted-foreground" data-request-explanation>
          {copy(
            "Skicka en förfrågan så tar CQrityjob ställning till om certifieringen ska läggas till i katalogen. En förfrågan lägger inte till någon merit i ditt Passport, verifierar ingenting och gör ingenting valbart av sig själv.",
            "Send a request and CQrityjob will consider adding the certification to the catalogue. A request adds no credential to your Passport, verifies nothing and makes nothing selectable by itself.",
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            {copy("Certifieringens fullständiga namn", "Full name of the certification")}
            <input
              data-field="request-name"
              className={input}
              maxLength={REQUEST_LIMITS.nameMax}
              value={draft.requested_name}
              onChange={(e) => set("requested_name", e.target.value)}
            />
            {fieldProblem("requested_name")}
          </label>
          <label>
            {copy("Organisationen som utfärdar den", "Awarding organisation")}
            <input
              data-field="request-issuer"
              className={input}
              maxLength={REQUEST_LIMITS.issuerMax}
              value={draft.requested_issuer}
              onChange={(e) => set("requested_issuer", e.target.value)}
            />
            {fieldProblem("requested_issuer")}
          </label>
          <label>
            {copy("Förkortning (valfritt)", "Abbreviation (optional)")}
            <input
              data-field="request-abbreviation"
              className={input}
              maxLength={REQUEST_LIMITS.abbreviationMax}
              value={draft.requested_abbreviation}
              onChange={(e) => set("requested_abbreviation", e.target.value)}
            />
            {fieldProblem("requested_abbreviation")}
          </label>
          <label className="sm:col-span-2">
            {copy("Länk till utfärdarens sida (valfritt)", "Link to the issuer's page (optional)")}
            <input
              type="url"
              inputMode="url"
              data-field="request-url"
              className={input}
              maxLength={REQUEST_LIMITS.urlMax}
              placeholder="https://"
              value={draft.source_url}
              onChange={(e) => set("source_url", e.target.value)}
            />
            {fieldProblem("source_url")}
          </label>
          <label className="sm:col-span-2">
            {copy("Anteckning (valfritt)", "Note (optional)")}
            <textarea
              data-field="request-note"
              className={`${input} min-h-24 py-2`}
              maxLength={REQUEST_LIMITS.noteMax}
              value={draft.note}
              onChange={(e) => set("note", e.target.value)}
            />
            {fieldProblem("note")}
          </label>
        </div>
        {problem && problem.field === null && (
          <p role="alert" className="text-sm text-destructive" data-request-error>
            {problem.message}
          </p>
        )}
        {sent && (
          <p role="status" className="text-sm" data-request-sent>
            {copy(
              "Förfrågan är skickad. Du ser svaret här. Din merit är inte registrerad än — sök igen när certifieringen finns i katalogen.",
              "Request sent. You will see the answer here. Your credential is not registered yet — search again once the certification is in the catalogue.",
            )}
          </p>
        )}
        <button
          type="button"
          data-request-submit
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 rounded-md border border-input bg-background px-4 text-sm font-medium disabled:opacity-50"
          onClick={() => void submit()}
        >
          {busy ? copy("Skickar…", "Sending…") : copy("Skicka förfrågan", "Send request")}
        </button>
        {mine.length > 0 && (
          <div data-my-requests>
            <h4 className="text-sm font-semibold">{copy("Dina förfrågningar", "Your requests")}</h4>
            <ul className="mt-2 space-y-2">
              {mine.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <p className="break-words font-medium">
                    {r.abbreviation ? `${r.abbreviation} — ${r.name}` : r.name}
                  </p>
                  <p className="break-words text-muted-foreground">{r.issuer}</p>
                  <p className="mt-1 text-xs" data-request-status={r.status}>
                    {requestStatusLabel(r.status, lang)}
                    {r.resolutionNote ? ` — ${r.resolutionNote}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
