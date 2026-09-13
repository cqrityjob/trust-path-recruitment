// The interviewer's own position: reviewing it, locking it, and only then
// seeing anybody else's.
//
// ── THE INDEPENDENCE RULE, AND WHERE IT LIVES ────────────────────────────
//
// Two people forming a view of the same conversation have to form it
// separately, or the second one is forming a view of the first one's view.
// The database is what enforces that: `bcp_conduct_positions` and
// `bcp_conduct_entries` are invisible to a reader whose own position is not
// yet locked, and the workspace RPC therefore returns `others_visible: false`
// with an empty list.
//
// This component takes `others` as NULL, not as an empty array, when the
// positions are withheld. That is deliberate and structural: a component
// handed `[]` can only say "nobody has recorded anything", which is false and
// would mislead. Handed `null` it says what is true — that something is being
// withheld, and why — and there is no branch in which it could render a
// position it was not given. The route passes `null` whenever
// `othersVisible` is false, so the withholding survives a refactor of either
// side.
//
// ── AND WHAT IS NEVER DONE WITH THEM ─────────────────────────────────────
//
// Once visible, two positions are shown side by side and described factually:
// documented by both, documented only by one. There is no agreement score, no
// percentage, no "consensus" figure, no average and no total anywhere in this
// file, because none of those is a thing this method produces.

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/context";
import type {
  BesktConductEntry,
  BesktConductTopic,
  BesktOtherPosition,
} from "@/lib/beskt/interview-conduct.functions";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  BUTTON,
  Chip,
  FIELD,
  Panel,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import {
  Fact,
  POSITION_ROLE_LABEL,
  POSITION_STATE_LABEL,
  TOUCH,
  VerificationChip,
} from "./BesktConductUi";

export interface BesktMyPosition {
  readonly positionId: string;
  readonly state: string;
  readonly positionRole: string;
  readonly revision: number;
  readonly lockedAt: string | null;
  readonly reopenCount: number;
}

export function BesktPositionSection({
  position,
  entries,
  topics,
  others,
  lockBusy,
  lockError,
  reopenBusy,
  reopenError,
  onLock,
  onReopen,
}: {
  position: BesktMyPosition;
  entries: readonly BesktConductEntry[];
  topics: readonly BesktConductTopic[];
  /** NULL while the database withholds them. Never an empty array in that case. */
  others: readonly BesktOtherPosition[] | null;
  lockBusy: boolean;
  lockError: unknown;
  reopenBusy: boolean;
  reopenError: unknown;
  onLock: () => void;
  onReopen: (reason: string) => void;
}) {
  const { t } = useT();
  const locked = position.state === "locked";

  const documented = new Set(entries.map((e) => e.itemKey));
  const undocumented = topics.filter((x) => !documented.has(x.itemKey));

  return (
    <section className="rounded-lg border border-border p-4" aria-labelledby="beskt-position-h">
      <h2 id="beskt-position-h" className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.position.heading")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.conduct.position.lede")}
      </p>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("beskt.conduct.position.role")}>
          {POSITION_ROLE_LABEL[position.positionRole]
            ? t(POSITION_ROLE_LABEL[position.positionRole])
            : position.positionRole}
        </Fact>
        <Fact label={t("beskt.conduct.position.state")}>
          <Chip tone={locked ? "confirmed" : "work"}>
            {POSITION_STATE_LABEL[position.state]
              ? t(POSITION_STATE_LABEL[position.state])
              : position.state}
          </Chip>
        </Fact>
        <Fact label={t("beskt.conduct.position.entryCount")}>{String(entries.length)}</Fact>
        <Fact label={t("beskt.conduct.position.revision")}>{String(position.revision)}</Fact>
      </dl>

      {locked ? (
        <LockedState
          position={position}
          reopenBusy={reopenBusy}
          reopenError={reopenError}
          onReopen={onReopen}
        />
      ) : (
        <OpenState
          entryCount={entries.length}
          undocumentedCount={undocumented.length}
          busy={lockBusy}
          error={lockError}
          onLock={onLock}
        />
      )}

      <OthersSection others={others} entries={entries} />
    </section>
  );
}

/** Before the lock: what still stands in the way, then the lock itself. */
function OpenState({
  entryCount,
  undocumentedCount,
  busy,
  error,
  onLock,
}: {
  entryCount: number;
  undocumentedCount: number;
  busy: boolean;
  error: unknown;
  onLock: () => void;
}) {
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);

  // The database refuses a lock with nothing in it; everything else is a
  // completeness note rather than a bar, because an interviewer who has
  // decided a theme did not come up is entitled to lock without it.
  const blockers: string[] = [];
  if (entryCount === 0) blockers.push(t("beskt.conduct.position.blocker.noEntries"));

  const notes: string[] = [];
  if (undocumentedCount > 0) {
    notes.push(`${t("beskt.conduct.position.blocker.undocumentedThemes")} (${undocumentedCount})`);
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.position.review")}
      </h3>

      {blockers.length > 0 ? (
        <Panel tone="attention" title={t("beskt.conduct.position.blockers")}>
          <ul className="list-disc space-y-1 pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Panel>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("beskt.conduct.position.ready")}</p>
      )}

      {notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {error != null && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {t(besktErrorKey(error))}
        </p>
      )}

      <button
        type="button"
        className={`${PRIMARY_BUTTON} ${TOUCH} mt-4`}
        disabled={blockers.length > 0 || busy}
        onClick={() => setConfirming(true)}
      >
        {busy ? t("beskt.conduct.position.locking") : t("beskt.conduct.position.lock")}
      </button>

      {confirming && (
        <LockDialog
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onLock();
          }}
        />
      )}
    </div>
  );
}

/**
 * The confirmation. Not a `window.confirm`, because that cannot be translated,
 * cannot be read by a screen reader in the page's own language and cannot say
 * what locking actually changes — which is the entire reason to ask.
 */
function LockDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="beskt-lock-title"
        aria-describedby="beskt-lock-body"
        className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
      >
        <h3 id="beskt-lock-title" className="text-base font-semibold text-foreground">
          {t("beskt.conduct.position.lockDialog.title")}
        </h3>
        <p id="beskt-lock-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("beskt.conduct.position.lockDialog.body")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            ref={confirmRef}
            type="button"
            className={`${PRIMARY_BUTTON} ${TOUCH}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {t("beskt.conduct.position.lockDialog.confirm")}
          </button>
          <button type="button" className={`${BUTTON} ${TOUCH}`} onClick={onCancel}>
            {t("beskt.conduct.position.lockDialog.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** After the lock: the read-only facts, and the way back with a reason. */
function LockedState({
  position,
  reopenBusy,
  reopenError,
  onReopen,
}: {
  position: BesktMyPosition;
  reopenBusy: boolean;
  reopenError: unknown;
  onReopen: (reason: string) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const message = localError ?? (reopenError ? t(besktErrorKey(reopenError)) : null);

  return (
    <div className="mt-4">
      <Panel tone="confirmed" title={t("beskt.conduct.position.readOnly")}>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {position.lockedAt && (
            <Fact label={t("beskt.conduct.position.lockedAt")}>
              {position.lockedAt.slice(0, 16).replace("T", " ")}
            </Fact>
          )}
          <Fact label={t("beskt.conduct.position.revision")}>{String(position.revision)}</Fact>
          <Fact label={t("beskt.conduct.position.reopenCount")}>
            {String(position.reopenCount)}
          </Fact>
        </dl>
      </Panel>

      <p className="mt-3 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.conduct.position.reopenNote")}
      </p>

      {!open ? (
        <button type="button" className={`${BUTTON} ${TOUCH} mt-3`} onClick={() => setOpen(true)}>
          {t("beskt.conduct.position.reopen")}
        </button>
      ) : (
        <form
          className="mt-3 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) {
              setLocalError(t("beskt.error.conductReopenReasonRequired"));
              return;
            }
            setLocalError(null);
            onReopen(reason.trim());
          }}
        >
          {message && (
            <p
              role="alert"
              className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
            >
              {message}
            </p>
          )}
          <label htmlFor="beskt-reopen-reason" className="text-sm font-medium text-foreground">
            {t("beskt.conduct.position.reopenReason")}
          </label>
          <textarea
            id="beskt-reopen-reason"
            rows={2}
            required
            className={`${FIELD} ${TOUCH}`}
            aria-describedby="beskt-reopen-help"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p id="beskt-reopen-help" className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.position.reopenReasonHelp")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className={`${BUTTON} ${TOUCH}`} disabled={reopenBusy}>
              {reopenBusy
                ? t("beskt.conduct.position.reopening")
                : t("beskt.conduct.position.reopenConfirm")}
            </button>
            <button type="button" className={`${BUTTON} ${TOUCH}`} onClick={() => setOpen(false)}>
              {t("beskt.conduct.entry.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Other people's positions, or the reason there are none on the screen.
 *
 * `others === null` is the withheld case and has no branch that renders a
 * position. `others === []` genuinely means nobody else holds one.
 */
function OthersSection({
  others,
  entries,
}: {
  others: readonly BesktOtherPosition[] | null;
  entries: readonly BesktConductEntry[];
}) {
  const { t } = useT();

  // Withheld and empty are different answers and are answered differently.
  // `visible` is the ONLY list this component can render from, and it is empty
  // by construction while the database is withholding.
  const withheld = others === null;
  const visible: readonly BesktOtherPosition[] = others ?? [];

  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">{t("beskt.conduct.others.heading")}</h3>

      {withheld ? (
        <div className="mt-2">
          <Panel tone="neutral" title={t("beskt.conduct.others.hidden.title")}>
            <p>{t("beskt.conduct.others.hidden.body")}</p>
          </Panel>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("beskt.conduct.others.empty")}</p>
      ) : (
        <>
          <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.others.noAggregation")}
          </p>
          <ol className="mt-3 space-y-4">
            {visible.map((o) => (
              <OtherPosition key={o.positionId} other={o} mine={entries} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function OtherPosition({
  other,
  mine,
}: {
  other: BesktOtherPosition;
  mine: readonly BesktConductEntry[];
}) {
  const { t } = useT();
  const myKeys = new Set(mine.map((e) => e.itemKey));
  const theirKeys = new Set(other.entries.map((e) => e.itemKey));
  const onlyMine = mine.filter((e) => !theirKeys.has(e.itemKey));

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="work" srPrefix={t("beskt.conduct.position.role")}>
          {POSITION_ROLE_LABEL[other.positionRole]
            ? t(POSITION_ROLE_LABEL[other.positionRole])
            : other.positionRole}
        </Chip>
        <Chip tone={other.state === "locked" ? "confirmed" : "neutral"}>
          {POSITION_STATE_LABEL[other.state] ? t(POSITION_STATE_LABEL[other.state]) : other.state}
        </Chip>
        {other.lockedAt && (
          <span className="text-xs text-muted-foreground">
            {t("beskt.conduct.position.lockedAt")}: {other.lockedAt.slice(0, 16).replace("T", " ")}
          </span>
        )}
      </div>

      <ol className="mt-3 space-y-3">
        {other.entries.map((e) => (
          <li key={e.entryId} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="break-all font-mono text-xs text-foreground">{e.itemKey}</span>
              <div className="flex flex-wrap items-center gap-2">
                <VerificationChip state={e.verificationState} />
                <Chip tone="neutral">
                  {myKeys.has(e.itemKey)
                    ? t("beskt.conduct.others.matches")
                    : t("beskt.conduct.others.onlyOther")}
                </Chip>
              </div>
            </div>
            <dl className="mt-2 space-y-2">
              <OtherRow label={t("beskt.conduct.entry.observableFact")} value={e.observableFact} />
              <OtherRow
                label={t("beskt.conduct.entry.candidateExplanation")}
                value={e.candidateExplanation}
              />
              <OtherRow
                label={t("beskt.conduct.entry.interviewerInterpretation")}
                value={e.interviewerInterpretation}
              />
              <OtherRow
                label={t("beskt.conduct.entry.alternativeExplanation")}
                value={e.alternativeExplanation}
              />
              <OtherRow
                label={t("beskt.conduct.entry.protectiveFactor")}
                value={e.protectiveFactor}
              />
            </dl>
          </li>
        ))}
      </ol>

      {onlyMine.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">{t("beskt.conduct.others.onlyMine")}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {onlyMine.map((e) => (
              <li key={e.entryId}>
                <Chip tone="neutral">{e.itemKey}</Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function OtherRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}
