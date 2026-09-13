// Moving one entry's verification along.
//
// A verification is a piece of WORK, recorded as work: what needs checking,
// where the answer came from, and what the check produced. Every transition
// appends to a history that nothing can rewrite, so "it was requested, then it
// stalled, then it came back inconclusive" stays readable a year later.
//
// The two states that look like conclusions are not conclusions, and the
// screen says so where it matters rather than in a help page:
//
//   not_verified   the check could not be carried out
//   inconclusive   what came back did not settle it
//
// Neither is a statement about the candidate's honesty, and nothing in this
// product derives one from them. There is no rule anywhere that turns an
// unverified entry into a negative outcome, because there is no outcome.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useT } from "@/i18n/context";
import {
  BESKT_VERIFICATION_STATES,
  type BesktConductEntry,
  type BesktVerificationState,
} from "@/lib/beskt/interview-conduct.functions";
import { besktErrorKey } from "@/lib/beskt/errors";
import { BUTTON, FIELD } from "@/components/employer/interview/InterviewUi";
import { TOUCH, VERIFICATION_LABEL } from "./BesktConductUi";

/** The states where naming a source is what makes the record worth anything. */
const SOURCE_REQUIRED: readonly BesktVerificationState[] = [
  "verified",
  "not_verified",
  "inconclusive",
];

export function BesktVerificationForm({
  entry,
  busy,
  error,
  confirmedEntryId,
  onSubmit,
}: {
  entry: BesktConductEntry;
  busy: boolean;
  error: unknown;
  /** The entry the SERVER last confirmed a verification for. */
  confirmedEntryId: string | null;
  onSubmit: (newState: BesktVerificationState, source: string | null, note: string | null) => void;
}) {
  const { t } = useT();
  const base = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<BesktVerificationState>(entry.verificationState);
  const [source, setSource] = useState(entry.verificationSource ?? "");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const id = (n: string) => `${base}-${n}`;

  // Closed on the server's confirmation, never on the click. Same reasoning as
  // the documentation form: a request that has been sent is not a request that
  // has been accepted, and a stale revision is refused after it leaves.
  const lastConfirmed = useRef<string | null>(confirmedEntryId);
  useEffect(() => {
    if (confirmedEntryId !== lastConfirmed.current) {
      lastConfirmed.current = confirmedEntryId;
      if (confirmedEntryId === entry.entryId) setOpen(false);
    }
  }, [confirmedEntryId, entry.entryId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (SOURCE_REQUIRED.includes(state) && source.trim() === "") {
      setLocalError(t("beskt.conduct.verify.sourceRequired"));
      return;
    }
    setLocalError(null);
    onSubmit(
      state,
      source.trim() === "" ? null : source.trim(),
      note.trim() === "" ? null : note.trim(),
    );
  };

  const message = localError ?? (error ? t(besktErrorKey(error)) : null);

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          className={`${BUTTON} ${TOUCH}`}
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          {t("beskt.conduct.verify.heading")}
        </button>
      </div>
    );
  }

  return (
    <form className="mt-3 rounded-md border border-border p-3" onSubmit={submit}>
      <h5 className="text-sm font-semibold text-foreground">{t("beskt.conduct.verify.heading")}</h5>
      <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.conduct.verification.openNote")}
      </p>

      {message && (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
        >
          {message}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id("state")} className="text-sm font-medium text-foreground">
            {t("beskt.conduct.verify.newState")}
          </label>
          <select
            id={id("state")}
            className={`${FIELD} ${TOUCH}`}
            value={state}
            onChange={(e) => setState(e.target.value as BesktVerificationState)}
          >
            {BESKT_VERIFICATION_STATES.map((s) => (
              <option key={s} value={s}>
                {t(VERIFICATION_LABEL[s])}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id("source")} className="text-sm font-medium text-foreground">
            {t("beskt.conduct.verify.source")}
          </label>
          <input
            id={id("source")}
            type="text"
            className={`${FIELD} ${TOUCH}`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={id("note")} className="text-sm font-medium text-foreground">
          {t("beskt.conduct.verify.note")}
        </label>
        <textarea
          id={id("note")}
          rows={2}
          className={`${FIELD} ${TOUCH}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={`${BUTTON} ${TOUCH}`}>
          {busy ? t("beskt.conduct.verify.saving") : t("beskt.conduct.verify.save")}
        </button>
        <button type="button" className={`${BUTTON} ${TOUCH}`} onClick={() => setOpen(false)}>
          {t("beskt.conduct.entry.cancel")}
        </button>
      </div>
    </form>
  );
}
