// The one place an Admin Portal mutation failure is rendered.
//
// Every admin action that can fail should show this rather than assembling its
// own string, so that "what an admin is told when something goes wrong" is one
// decision in one file instead of thirteen scattered `setError(e.message)`
// calls -- which is how an internal constant ended up on screen.
//
// It renders nothing for a null error, so a caller can mount it unconditionally
// next to the control it belongs to.

import { adminErrorCode, ADMIN_ERROR_COPY } from "@/lib/admin/admin-error";
import { useT } from "@/i18n/context";

export function AdminActionError({ error, className }: { error: unknown; className?: string }) {
  const { t } = useT();
  if (error === null || error === undefined) return null;

  const { code, raw } = adminErrorCode(error);
  const copy = t(ADMIN_ERROR_COPY[code]);

  // Only the unrecognised case quotes an identifier, and it quotes the code and
  // nothing else -- never the database's message, which can carry a constraint
  // name, a column list or the contents of the row that failed.
  const text = code === "unknown_error" ? copy.replace("{code}", raw) : copy;

  return (
    <p
      role="alert"
      className={className ?? "mt-1 text-xs text-destructive"}
      data-admin-error-code={code}
    >
      {text}
    </p>
  );
}
