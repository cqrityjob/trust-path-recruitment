// The themes this conversation still has to cover, and the interviewer's own
// record against each one.
//
// ── WHERE THE THEMES COME FROM ───────────────────────────────────────────
//
// From the database, and from nowhere else. PR 4 froze them when the
// preparation was linked to this case: one theme per governed item the
// candidate skipped or asked to take orally, in the method's own order,
// carrying the method's own wording, the method's own purpose, the item key
// and the method version.
//
// Nothing on this screen invents a theme, reorders them, merges two, or adds
// a "suggested follow-up". There is no model in this path at all. If the list
// is empty it is because the candidate answered everything, and the screen
// says exactly that rather than manufacturing something to do.
//
// The item key and the method version are shown, not hidden: they are how
// anyone later establishes that the theme discussed was the governed item it
// claims to be, in the version it claims to be from.

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/context";
import type {
  BesktConductEntry,
  BesktConductPrompts,
  BesktConductTopic,
  BesktPrompt,
  BesktVerificationState,
} from "@/lib/beskt/interview-conduct.functions";
import { BUTTON, Chip, Panel } from "@/components/employer/interview/InterviewUi";
import {
  SENSITIVITY_LABEL,
  TOPIC_REASON_LABEL,
  TOUCH,
  VerificationChip,
  governedText,
} from "./BesktConductUi";
import { BesktEntryForm, type BesktEntryFields } from "./BesktEntryForm";
import { BesktEntryHistory } from "./BesktEntryHistory";
import { BesktVerificationForm } from "./BesktVerificationForm";
import { BesktPromptsUnavailable, BesktThemePrompts } from "./BesktPrompts";

/**
 * The prompts for one item, pulled out of the whole answer.
 *
 * Returns an empty array — never undefined — so a caller has one shape to
 * render and no branch where "still loading" and "none authored" look the
 * same. Unavailable resolves to empty too: the explanation is rendered once
 * at the top of the section, not repeated beside every theme.
 */
function promptsForItem(
  prompts: BesktConductPrompts | null,
  itemKey: string,
): readonly BesktPrompt[] {
  if (prompts === null || !prompts.available) return [];
  return prompts.topics.find((tp) => tp.itemKey === itemKey)?.prompts ?? [];
}

export interface BesktThemeActions {
  /** True only when the reader's OWN position exists and is still open. */
  readonly canWrite: boolean;
  readonly pendingItemKey: string | null;
  readonly savedItemKey: string | null;
  readonly saveError: unknown;
  readonly verifyPendingEntryId: string | null;
  /** Set from the SERVER'S answer, so a form closes on a confirmed write. */
  readonly verifiedEntryId: string | null;
  readonly verifyError: unknown;
  readonly saveEntry: (input: {
    itemKey: string;
    topicId: string | null;
    fields: BesktEntryFields;
    correctsEntryId: string | null;
    correctionReason: string | null;
  }) => void;
  readonly recordVerification: (input: {
    entryId: string;
    newState: BesktVerificationState;
    source: string | null;
    note: string | null;
  }) => void;
}

export function BesktThemes({
  sessionId,
  methodVersionId,
  topics,
  entries,
  prompts,
  actions,
}: {
  sessionId: string;
  methodVersionId: string;
  topics: readonly BesktConductTopic[];
  entries: readonly BesktConductEntry[];
  /**
   * The governed wordings, or null while they are still being fetched.
   *
   * Null and "unavailable" are different answers and are rendered
   * differently: null shows nothing at all, because a reader who is told the
   * wordings are unavailable half a second before they arrive has been told
   * something false.
   */
  prompts: BesktConductPrompts | null;
  actions: BesktThemeActions;
}) {
  const { t, lang } = useT();
  const byItemKey = new Map(entries.map((e) => [e.itemKey, e]));

  return (
    <section
      data-testid="beskt-themes"
      className="rounded-lg border border-border p-4"
      aria-labelledby="beskt-themes-h"
    >
      <h2 id="beskt-themes-h" className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.themes.heading")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.conduct.themes.lede")}
      </p>
      {prompts !== null && !prompts.available && (
        <div className="mt-3">
          <BesktPromptsUnavailable reason={prompts.reason} />
        </div>
      )}

      {topics.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("beskt.conduct.themes.empty")}</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {topics.map((topic) => (
            <Theme
              key={topic.topicId}
              sessionId={sessionId}
              methodVersionId={methodVersionId}
              topic={topic}
              entry={byItemKey.get(topic.itemKey) ?? null}
              prompts={promptsForItem(prompts, topic.itemKey)}
              actions={actions}
              lang={lang}
            />
          ))}
        </ol>
      )}

      {/* Entries the interviewer recorded against a governed item that is not
          one of the derived themes still belong on the screen. Hiding them
          would make the record look smaller than it is. */}
      <ExtraEntries topics={topics} entries={entries} sessionId={sessionId} actions={actions} />
    </section>
  );
}

function Theme({
  sessionId,
  methodVersionId,
  topic,
  entry,
  prompts,
  actions,
  lang,
}: {
  sessionId: string;
  methodVersionId: string;
  topic: BesktConductTopic;
  entry: BesktConductEntry | null;
  prompts: readonly BesktPrompt[];
  actions: BesktThemeActions;
  lang: string;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<"view" | "create" | "correct">("view");
  const [historyOpen, setHistoryOpen] = useState(false);
  const busy = actions.pendingItemKey === topic.itemKey;

  return (
    <li
      data-testid={`beskt-theme-${topic.itemKey}`}
      className="rounded-md border border-border p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-medium text-foreground">
          {governedText(lang, topic.wordingSv, topic.wordingEn)}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="neutral" srPrefix={t("beskt.conduct.themes.reason")}>
            {t(TOPIC_REASON_LABEL[topic.reason])}
          </Chip>
          <Chip tone={entry ? "confirmed" : "neutral"}>
            {entry ? t("beskt.conduct.themes.documented") : t("beskt.conduct.themes.notDocumented")}
          </Chip>
        </div>
      </div>

      <dl className="mt-3 space-y-1">
        <dt className="text-xs text-muted-foreground">{t("beskt.conduct.themes.purpose")}</dt>
        <dd className="text-xs leading-relaxed text-muted-foreground">
          {governedText(lang, topic.purposeSv, topic.purposeEn)}
        </dd>
        <dt className="text-xs text-muted-foreground">{t("beskt.conduct.themes.origin")}</dt>
        <dd className="font-mono text-xs text-muted-foreground">
          <span className="sr-only">{t("beskt.conduct.themes.itemKey")}: </span>
          {topic.itemKey}
          {" · "}
          <span className="sr-only">{t("beskt.conduct.themes.methodVersion")}: </span>
          {methodVersionId}
        </dd>
      </dl>

      <BesktThemePrompts prompts={prompts} />

      <EntryBlock
        sessionId={sessionId}
        itemKey={topic.itemKey}
        topicId={topic.topicId}
        entry={entry}
        actions={actions}
        busy={busy}
        mode={mode}
        setMode={setMode}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
      />
    </li>
  );
}

/**
 * The read-only view, the forms, and the controls that switch between them.
 *
 * Shared by the derived themes and by any extra item the interviewer recorded
 * against, so the record of one entry looks identical wherever it appears.
 */
function EntryBlock({
  sessionId,
  itemKey,
  topicId,
  entry,
  actions,
  busy,
  mode,
  setMode,
  historyOpen,
  setHistoryOpen,
}: {
  sessionId: string;
  itemKey: string;
  topicId: string | null;
  entry: BesktConductEntry | null;
  actions: BesktThemeActions;
  busy: boolean;
  mode: "view" | "create" | "correct";
  setMode: (m: "view" | "create" | "correct") => void;
  historyOpen: boolean;
  setHistoryOpen: (b: boolean) => void;
}) {
  const { t } = useT();
  const saved = actions.savedItemKey === itemKey;

  // ── WHY A FORM CLOSES HERE AND NOT IN ITS OWN SUBMIT HANDLER ──────────
  //
  // Because a submit handler only knows that a request was SENT. Closing there
  // would tell the interviewer their correction had been recorded at the
  // moment it left the browser, which is exactly the claim this product must
  // not make about work that may still be refused for a stale revision.
  //
  // `savedItemKey` is set in the mutation's onSuccess, from the item key the
  // SERVER returned. Watching it change is therefore watching the write be
  // confirmed. The ref is what makes it a transition rather than a state: once
  // set, the key stays set, and without it a deliberate reopening of the
  // correction form would be closed again the instant it opened.
  const lastConfirmed = useRef<string | null>(actions.savedItemKey);
  useEffect(() => {
    if (actions.savedItemKey !== lastConfirmed.current) {
      lastConfirmed.current = actions.savedItemKey;
      if (actions.savedItemKey === itemKey) setMode("view");
    }
  }, [actions.savedItemKey, itemKey, setMode]);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <h4 className="text-sm font-semibold text-foreground">{t("beskt.conduct.entry.heading")}</h4>

      {entry && mode === "view" && <EntryReadOnly entry={entry} />}

      {!entry && mode === "view" && (
        <p className="mt-2 text-sm text-muted-foreground">
          {actions.canWrite
            ? t("beskt.conduct.themes.notDocumented")
            : t("beskt.conduct.entry.readOnly")}
        </p>
      )}

      {mode === "view" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.canWrite && !entry && (
            <button
              type="button"
              className={`${BUTTON} ${TOUCH}`}
              onClick={() => setMode("create")}
            >
              {t("beskt.conduct.entry.new")}
            </button>
          )}
          {actions.canWrite && entry && (
            <button
              type="button"
              className={`${BUTTON} ${TOUCH}`}
              onClick={() => setMode("correct")}
            >
              {t("beskt.conduct.entry.edit")}
            </button>
          )}
          {entry && (
            <button
              type="button"
              className={`${BUTTON} ${TOUCH}`}
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              {historyOpen ? t("beskt.conduct.history.hide") : t("beskt.conduct.history.show")}
            </button>
          )}
        </div>
      )}

      {saved && mode === "view" && (
        <p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
          {t("beskt.conduct.save.saved")}
        </p>
      )}

      {mode !== "view" && (
        <BesktEntryForm
          itemKey={itemKey}
          correcting={mode === "correct"}
          existing={entry}
          busy={busy}
          error={actions.saveError}
          onCancel={() => setMode("view")}
          onSubmit={(fields, correctionReason) =>
            actions.saveEntry({
              itemKey,
              topicId,
              fields,
              correctsEntryId: mode === "correct" && entry ? entry.entryId : null,
              correctionReason,
            })
          }
        />
      )}

      {entry && historyOpen && (
        <div className="mt-3">
          <h5 className="text-sm font-semibold text-foreground">
            {t("beskt.conduct.history.heading")}
          </h5>
          <BesktEntryHistory sessionId={sessionId} entryId={entry.entryId} />
        </div>
      )}

      {entry && actions.canWrite && mode === "view" && (
        <BesktVerificationForm
          entry={entry}
          busy={actions.verifyPendingEntryId === entry.entryId}
          error={actions.verifyError}
          confirmedEntryId={actions.verifiedEntryId}
          onSubmit={(newState, source, note) =>
            actions.recordVerification({ entryId: entry.entryId, newState, source, note })
          }
        />
      )}
    </div>
  );
}

/** The live version of one entry, field by field and labelled field by field. */
function EntryReadOnly({ entry }: { entry: BesktConductEntry }) {
  const { t } = useT();
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <VerificationChip state={entry.verificationState} />
        <Chip tone="neutral" srPrefix={t("beskt.conduct.entry.sensitivityClass")}>
          {t(SENSITIVITY_LABEL[entry.sensitivityClass])}
        </Chip>
        <span className="text-xs text-muted-foreground">
          {t("beskt.conduct.entry.version")} {entry.entryVersion}
        </span>
        {entry.recordedAt && (
          <span className="text-xs text-muted-foreground">
            {t("beskt.conduct.entry.recordedAt")}: {entry.recordedAt.slice(0, 16).replace("T", " ")}
          </span>
        )}
      </div>

      <dl className="mt-3 space-y-2">
        <Row label={t("beskt.conduct.entry.observableFact")} value={entry.observableFact} />
        <Row
          label={t("beskt.conduct.entry.candidateExplanation")}
          value={entry.candidateExplanation}
        />
        <Row
          label={t("beskt.conduct.entry.interviewerInterpretation")}
          value={entry.interviewerInterpretation}
        />
        <Row
          label={t("beskt.conduct.entry.alternativeExplanation")}
          value={entry.alternativeExplanation}
        />
        <Row label={t("beskt.conduct.entry.protectiveFactor")} value={entry.protectiveFactor} />
        <Row label={t("beskt.conduct.entry.verificationNeed")} value={entry.verificationNeed} />
        <Row label={t("beskt.conduct.entry.verificationSource")} value={entry.verificationSource} />
      </dl>

      {entry.verificationState === "not_verified" && (
        <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
          {t("beskt.conduct.verification.notVerifiedMeaning")}
        </p>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

/** Entries whose item is not one of the derived themes. */
function ExtraEntries({
  topics,
  entries,
  sessionId,
  actions,
}: {
  topics: readonly BesktConductTopic[];
  entries: readonly BesktConductEntry[];
  sessionId: string;
  actions: BesktThemeActions;
}) {
  const themeKeys = new Set(topics.map((x) => x.itemKey));
  const extra = entries.filter((e) => !themeKeys.has(e.itemKey));
  if (extra.length === 0) return null;
  return (
    <ol className="mt-4 space-y-4">
      {extra.map((e) => (
        <ExtraEntry key={e.entryId} entry={e} sessionId={sessionId} actions={actions} />
      ))}
    </ol>
  );
}

function ExtraEntry({
  entry,
  sessionId,
  actions,
}: {
  entry: BesktConductEntry;
  sessionId: string;
  actions: BesktThemeActions;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<"view" | "create" | "correct">("view");
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <li className="rounded-md border border-border p-3">
      <h3 className="font-mono text-sm text-foreground">
        <span className="sr-only">{t("beskt.conduct.themes.itemKey")}: </span>
        {entry.itemKey}
      </h3>
      <EntryBlock
        sessionId={sessionId}
        itemKey={entry.itemKey}
        topicId={entry.topicId}
        entry={entry}
        actions={actions}
        busy={actions.pendingItemKey === entry.itemKey}
        mode={mode}
        setMode={setMode}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
      />
    </li>
  );
}

/** Exported so the position review can reuse the same "not documented" wording
 *  rather than inventing a second phrase for the same fact. */
export function BesktThemeGap({ count }: { count: number }) {
  const { t } = useT();
  if (count === 0) return null;
  return (
    <Panel tone="attention" title={t("beskt.conduct.position.blocker.undocumentedThemes")}>
      <p>
        {count} · {t("beskt.conduct.themes.notDocumented")}
      </p>
    </Panel>
  );
}
