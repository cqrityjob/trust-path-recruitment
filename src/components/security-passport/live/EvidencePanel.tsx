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

import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { EvidenceRecord } from "@/lib/security-passport/evidence.functions";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/heic"];
const MAX_BYTES = 8 * 1024 * 1024;

export interface EvidencePanelProps {
  readonly evidence: readonly EvidenceRecord[];
  readonly canModify: boolean;
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
  canModify,
  onUpload,
  onOpen,
  onWithdraw,
}: EvidencePanelProps) {
  const { pt } = usePassportCopy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | string>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

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
    try {
      const contentBase64 = await readAsBase64(file);
      await onUpload({ fileName: file.name, mimeType: file.type, contentBase64 });
    } catch (err) {
      console.error("[passport] evidence upload failed", err);
      setError(pt("ev.failed"));
    } finally {
      setBusy(null);
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
              {canModify ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(pt("ev.withdrawConfirm"))) return;
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

      <p className="mt-2 text-xs text-muted-foreground">{pt("ev.linkShort")}</p>

      {canModify ? (
        <div className="mt-4">
          <label
            htmlFor="sp-evidence-file"
            className="inline-flex h-11 cursor-pointer items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
          >
            {busy === "upload" ? pt("ev.uploading") : pt("ev.add")}
          </label>
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
            className="ml-3 text-sm text-muted-foreground file:hidden"
          />
          <p id="sp-evidence-limits" className="mt-2 text-xs text-muted-foreground">
            {pt("ev.limits")}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{pt("ev.underReview")}</p>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
