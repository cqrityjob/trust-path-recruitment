// Security Passport — the holder's evidence panel.
//
// ── THE CEILING IS STATED, NOT IMPLIED ─────────────────────────────────
//
// The sentence "uploading makes this Document provided, not Verified" is
// rendered BEFORE the file picker, not in a tooltip and not after success.
// A holder who uploads a licence and sees the entry change state will
// otherwise reasonably conclude that the change means somebody checked it.
// Nobody has. The database enforces the ceiling; this makes it legible.
//
// ── WHAT THIS COMPONENT NEVER DOES ─────────────────────────────────────
//
// It does not read the file to the browser after upload, does not render a
// preview, and does not hold a durable URL. Opening a document asks the
// server for a five-minute signed link at that moment. A preview would mean
// evidence bytes sitting in a React tree, which is a copy of a private
// document living somewhere nobody decided it should live.
//
// ── THE FIVE MINUTES BELONG TO THE LINK, NOT THE DOCUMENT ──────────────
//
// A pilot tester uploaded a document, read "Länken gäller i fem minuter"
// underneath it, and could not tell whether the file had been saved at all.
// Both facts were true and the panel had joined them into a false one: the
// signed URL expires in five minutes, the stored object does not.
//
// So the five minutes now sits beside the Open button that mints one — the
// only place it is about anything — and an upload says, in words, that the
// document is saved and stays saved. The signed-URL lifetime is unchanged;
// this is a copy and placement fix, not a weakening of evidence privacy.

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { EvidenceRecord } from "@/lib/security-passport/evidence.functions";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/heic"];
const MAX_BYTES = 8 * 1024 * 1024;

export interface EvidencePanelProps {
  readonly evidence: readonly EvidenceRecord[];
  /** Whether the holder may ATTACH a document. Was one `canModify` flag with
   *  the two below, and that conflation is what left a holder unable to
   *  answer a clarification: a reviewer asked for the page showing the
   *  certificate number, and the only surface that could supply it was
   *  switched off for the whole duration of the open request.
   *
   *  Adding and removing are not the same permission and the database has
   *  never treated them as one. `sp_evidence`'s holder policy accepts an
   *  INSERT at any time; only `sp_withdraw_evidence` refuses while a review
   *  is open, because pulling a file out from under a reviewer would leave a
   *  decision resting on something nobody can look at again. The verifier's
   *  storage read policy names `clarification_requested` explicitly, so a
   *  document attached during a clarification is one the reviewer who asked
   *  for it can actually open. */
  readonly canAdd: boolean;
  /** Whether the holder may WITHDRAW or REPLACE a document. False while any
   *  request is open — the database refuses it, and offering a control that
   *  cannot succeed is worse than not offering it. */
  readonly canRemove: boolean;
  readonly onUpload: (file: {
    fileName: string;
    mimeType: string;
    contentBase64: string;
  }) => Promise<void>;
  readonly onOpen: (evidenceId: string) => Promise<void>;
  readonly onWithdraw: (evidenceId: string) => Promise<void>;
}

/** FileReader gives a `data:` URL; the server wants raw base64. Splitting on
 *  the first comma is exact here because the prefix never contains one. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidencePanel({
  evidence,
  canAdd,
  canRemove,
  onUpload,
  onOpen,
  onWithdraw,
}: EvidencePanelProps) {
  const { pt } = usePassportCopy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | string>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set after a successful upload so the holder is told it worked. Cleared on
   *  the next attempt, so a stale success never sits above a fresh failure. */
  const [saved, setSaved] = useState(false);
  /** The name of the file the holder chose, kept for the whole attempt.
   *
   *  "Laddar upp …" and "Dokument uppladdat och sparat." are both true of
   *  any file, which is exactly the problem the pilot review named: the
   *  holder could not tell WHICH document the product was talking about,
   *  and on a slow connection could not tell whether their pick had
   *  registered at all. Held through success AND failure, so a retry
   *  message can name the file that failed. */
  const [selectedName, setSelectedName] = useState<string | null>(null);
  /** The document a chosen file should REPLACE, or null for a plain add.
   *  Replacement is upload-then-withdraw in that order: if the second call
   *  fails the holder is left with both documents, which is visible and
   *  fixable. The other order can lose the only copy. */
  const [replacing, setReplacing] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setSaved(false);
    // Named before anything can go wrong, so a refusal below names the file
    // it refused rather than reporting an anonymous failure.
    setSelectedName(file.name);

    // Checked here for a fast, plain-language answer; checked again in the
    // server function, in the bucket configuration and in a CHECK
    // constraint. This one is a courtesy, the others are the control.
    if (!ALLOWED.includes(file.type)) {
      setError(pt("ev.badType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(pt("ev.tooLarge"));
      return;
    }

    setBusy("upload");
    const supersedes = replacing;
    try {
      const contentBase64 = await readAsBase64(file);
      await onUpload({ fileName: file.name, mimeType: file.type, contentBase64 });
      if (supersedes) await onWithdraw(supersedes);
      setSaved(true);
    } catch (err) {
      console.error("[passport] evidence upload failed", err);
      setError(pt("ev.failed"));
    } finally {
      setBusy(null);
      setReplacing(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <Paperclip aria-hidden="true" className="h-4 w-4" />
        {pt("ev.title")}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{pt("ev.lead")}</p>

      {/* The ceiling, before the control that triggers it. */}
      <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
        {pt("ev.ceiling")}
      </p>

      {evidence.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{pt("ev.none")}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {evidence.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3"
            >
              <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 break-all text-sm text-foreground">
                {item.fileName}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatSize(item.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setBusy(item.id);
                  void onOpen(item.id).finally(() => setBusy(null));
                }}
                disabled={busy !== null}
                className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {busy === item.id ? pt("ev.opening") : pt("ev.view")}
              </button>
              {/* Replace is upload-then-withdraw, so it needs BOTH
                  permissions: offering it while withdrawal is refused would
                  leave the holder with two documents and an error. */}
              {canAdd && canRemove ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(pt("ev.replaceConfirm"))) return;
                    // Arms the picker rather than opening it directly: the file
                    // dialog must be opened by the input, and the id is what
                    // tells `handleFile` this is a replacement and not an add.
                    setReplacing(item.id);
                    setError(null);
                    setSaved(false);
                    inputRef.current?.click();
                  }}
                  disabled={busy !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                  {replacing === item.id && busy === "upload"
                    ? pt("ev.replacing")
                    : pt("ev.replace")}
                </button>
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(pt("ev.withdrawConfirm"))) return;
                    setSaved(false);
                    setBusy(item.id);
                    void onWithdraw(item.id).finally(() => setBusy(null));
                  }}
                  disabled={busy !== null}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  {pt("ev.withdraw")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* The two sentences that were one. "Stored until you remove it" is about
          the DOCUMENT; the five minutes is about the link Open mints, and is
          stated as such directly beneath the buttons that mint one. */}
      {evidence.length > 0 ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">{pt("ev.stored")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{pt("ev.linkShort")}</p>
        </>
      ) : null}

      {saved ? (
        <div
          role="status"
          data-evidence-saved
          className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground"
        >
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            {pt("ev.saved")}
          </p>
          {/* WHICH document. "Saved" is true of any file; the holder needs to
              know it was theirs. */}
          {selectedName ? (
            <p data-evidence-saved-file className="mt-1 break-all text-xs text-muted-foreground">
              {selectedName}
            </p>
          ) : null}
          {/* WHAT IT IS NOW, restated at the moment of success.
              `ev.ceiling` says this above the picker, but the sentence a
              person reads after a green tick is the one they carry away --
              and "saved" must never be heard as "checked". Naming the state
              here is what keeps the upload state and the verification state
              apart at the only moment they could be confused. */}
          <p data-evidence-saved-state className="mt-1 text-xs text-muted-foreground">
            {pt("ev.savedState")}
          </p>
        </div>
      ) : null}

      {canAdd ? (
        <div className="mt-4">
          <label
            htmlFor="sp-evidence-file"
            className="inline-flex h-11 cursor-pointer items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
          >
            {busy === "upload" ? pt("ev.uploading") : pt("ev.add")}
          </label>
          {/* The chosen file, while it is in flight. Without it the only
              feedback on a slow connection is a button that changed its
              label, which does not say whether the pick registered. */}
          {busy === "upload" && selectedName ? (
            <p
              data-evidence-uploading-file
              aria-live="polite"
              className="mt-2 break-all text-xs text-muted-foreground"
            >
              {selectedName}
            </p>
          ) : null}
          <input
            ref={inputRef}
            id="sp-evidence-file"
            type="file"
            accept={ALLOWED.join(",")}
            disabled={busy !== null}
            aria-describedby="sp-evidence-limits"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            // `file:hidden` removes the browser's own button, so what is left
            // is the filename text — and the input still sizes itself to its
            // intrinsic ~291px whatever the container is. Beside the label at
            // 375px that ran past the card and into horizontal page scroll.
            //
            // Sat on its own line and told to fill the width instead of
            // sitting `ml-3` beside the label. Pre-existing, but this panel
            // now renders during an open review too, so the state it happens
            // in is no longer a rare one.
            className="mt-2 block w-full max-w-full text-sm text-muted-foreground file:hidden"
          />
          <p id="sp-evidence-limits" className="mt-2 text-xs text-muted-foreground">
            {pt("ev.limits")}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{pt("ev.underReview")}</p>
      )}

      {/* Said where the missing buttons were, rather than left as an absence
          the holder has to interpret. Only while adding is still open — when
          nothing can be changed at all, `ev.underReview` above has already
          said so and repeating it would be noise. */}
      {canAdd && !canRemove ? (
        <p className="mt-2 text-xs text-muted-foreground">{pt("ev.addOnlyUnderReview")}</p>
      ) : null}

      {error ? (
        <div role="alert" data-evidence-error className="mt-3 text-sm text-destructive">
          <p>{error}</p>
          {selectedName ? (
            <p data-evidence-error-file className="mt-1 break-all text-xs">
              {selectedName}
            </p>
          ) : null}
          {/* A REAL retry control, not just a sentence telling the holder to
              try again. "Försök igen" with nothing to press means hunting
              for the picker, which on a refused type or an over-size file is
              the same hunt that produced the failure. Arms the same input,
              so there is still exactly one way into this flow. */}
          {canAdd ? (
            <button
              type="button"
              data-evidence-retry
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
              className="mt-2 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              {pt("ev.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
