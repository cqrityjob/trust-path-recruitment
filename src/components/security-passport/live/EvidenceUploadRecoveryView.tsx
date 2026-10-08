import type {
  EvidenceRecoveryResult,
  EvidenceUploadAttempt,
} from "@/lib/security-passport/evidence-upload-recovery";

export function EvidenceUploadRecoveryView({
  attempts,
  loading,
  failed,
  busy,
  message,
  lang,
  onReload,
  onResume,
  onCleanup,
}: {
  readonly attempts: readonly EvidenceUploadAttempt[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly busy: string | null;
  readonly message: EvidenceRecoveryResult["status"] | null;
  readonly lang: "sv" | "en";
  readonly onReload: () => void;
  readonly onResume: (id: string) => void;
  readonly onCleanup: (id: string) => void;
}) {
  const sv = lang === "sv";
  const messages: Record<EvidenceRecoveryResult["status"], string> = sv
    ? {
        registered: "Underlaget är registrerat. Kontrollera det bland dina sparade underlag.",
        unknown:
          "Resultatet kunde inte bekräftas. Försöket är bevarat. Läs in och kontrollera igen.",
        file_missing:
          "Filen hittades inte. Välj borttagning för att avsluta försöket innan du laddar upp igen.",
        integrity_mismatch:
          "Filen motsvarar inte den ursprungliga uppladdningen. Den har inte registrerats. Du kan ta bort den oregistrerade filen.",
        attachment_rejected:
          "Underlaget kunde inte registreras på den ursprungliga meriten. Försöket är bevarat; du kan välja borttagning.",
        cleanup_pending:
          "Borttagningen är inte bekräftad. Försöket är bevarat och kan kontrolleras eller tas bort igen.",
        cleaned: "Den oregistrerade filens borttagning är bekräftad. Du kan nu ladda upp på nytt.",
      }
    : {
        registered: "The documentation is registered. Check it among your saved documents.",
        unknown:
          "The result could not be confirmed. The attempt is preserved. Reload and check again.",
        file_missing:
          "The file was not found. Choose cleanup to close the attempt before uploading again.",
        integrity_mismatch:
          "The file does not match the original upload. It has not been registered. You can remove the unregistered file.",
        attachment_rejected:
          "The documentation could not be registered on the original entry. The attempt is preserved; you can choose cleanup.",
        cleanup_pending:
          "Removal is not confirmed. The attempt is preserved and can be checked or removed again.",
        cleaned: "Removal of the unregistered file is confirmed. You can now upload again.",
      };
  if (!loading && !failed && attempts.length === 0 && !message) return null;
  return (
    <section data-upload-recovery className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-semibold">
        {sv ? "Kontrollera tidigare uppladdning" : "Check an earlier upload"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {sv
          ? "Kontrollera ett kvarstående försök innan du laddar upp igen. Återupptagning använder den ursprungliga filen och meriten. Borttagning kontrollerar först att filen inte är registrerad."
          : "Check an unresolved attempt before uploading again. Resume uses the original file and entry. Cleanup first checks that the file is not registered."}
      </p>
      {loading && (
        <p role="status" className="mt-3">
          {sv ? "Läser uppladdningar…" : "Loading uploads…"}
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-3">
          {sv
            ? "Tidigare försök kunde inte läsas. Ladda inte upp igen förrän kontrollen lyckas."
            : "Earlier attempts could not be read. Wait for a successful check before uploading again."}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3">
          {messages[message]}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {attempts.map((a) => (
          <li key={a.id} data-upload-attempt={a.id} className="rounded-lg border p-3">
            <p className="break-all text-sm font-medium">{a.fileName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {a.status === "cleanup_pending"
                ? sv
                  ? "Borttagning behöver bekräftas"
                  : "Removal needs confirmation"
                : sv
                  ? "Uppladdningen behöver kontrolleras"
                  : "Upload needs a check"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {a.status !== "cleanup_pending" && (
                <button
                  type="button"
                  disabled={busy !== null || loading}
                  onClick={() => onResume(a.id)}
                  className="min-h-11 rounded-md border px-3 text-sm disabled:opacity-50"
                >
                  {sv ? "Kontrollera och återuppta" : "Check and resume"}
                </button>
              )}
              <button
                type="button"
                disabled={busy !== null || loading}
                onClick={() => onCleanup(a.id)}
                className="min-h-11 rounded-md border px-3 text-sm disabled:opacity-50"
              >
                {a.status === "cleanup_pending"
                  ? sv
                    ? "Försök borttagning igen"
                    : "Retry cleanup"
                  : sv
                    ? "Ta bort oregistrerad fil"
                    : "Remove unregistered file"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy !== null || loading}
        onClick={onReload}
        className="mt-3 min-h-11 rounded-md border px-3 text-sm disabled:opacity-50"
      >
        {sv ? "Läs in sparade försök" : "Reload saved attempts"}
      </button>
    </section>
  );
}
