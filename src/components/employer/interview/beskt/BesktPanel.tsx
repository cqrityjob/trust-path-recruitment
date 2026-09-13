// The panel: locked positions side by side, and a record of how the people in
// the room handled the differences.
//
// ── WHAT A PANEL IS FOR HERE ─────────────────────────────────────────────
//
// Not to produce a joint verdict. Not to average two views into one number.
// Not to decide who was right. It exists so that a disagreement between two
// interviewers is WRITTEN DOWN rather than resolved by whoever spoke last,
// and so that the minority view survives in the record with its own words.
//
// That is why `disagreed` is a first-class outcome carrying a divergent
// statement, and why the database refuses to record one without it. A panel
// that could only record agreement would quietly delete every dissent, which
// is the exact failure this structure exists to prevent.
//
// ── WHAT IT NEVER TOUCHES ────────────────────────────────────────────────
//
// The assessors' own positions. A resolution is a new row in its own table;
// nothing here can write into `bcp_conduct_entries`, and the screen says so
// in words so nobody has to take it on trust.

import { useId, useState, type FormEvent } from "react";
import { useT } from "@/i18n/context";
import type {
  BesktConductEntry,
  BesktConductWorkspace,
  BesktOtherPosition,
  BesktResolutionKind,
} from "@/lib/beskt/interview-conduct.functions";
import { BESKT_RESOLUTION_KINDS } from "@/lib/beskt/interview-conduct.functions";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  BUTTON,
  Chip,
  FIELD,
  Panel,
  PRIMARY_BUTTON,
} from "@/components/employer/interview/InterviewUi";
import { Fact, PANEL_STATE_LABEL, RESOLUTION_KIND_LABEL, TOUCH } from "./BesktConductUi";

export function BesktPanelSection({
  panel,
  myEntries,
  others,
  openBusy,
  openError,
  revealBusy,
  revealError,
  resolutionBusy,
  resolutionError,
  onOpen,
  onReveal,
  onRecord,
}: {
  panel: BesktConductWorkspace["panel"];
  myEntries: readonly BesktConductEntry[];
  /** NULL while the database withholds them, exactly as on the position screen. */
  others: readonly BesktOtherPosition[] | null;
  openBusy: boolean;
  openError: unknown;
  revealBusy: boolean;
  revealError: unknown;
  resolutionBusy: boolean;
  resolutionError: unknown;
  onOpen: () => void;
  onReveal: (panelId: string, revision: number) => void;
  onRecord: (input: {
    panelId: string;
    revision: number;
    itemKey: string;
    resolutionKind: BesktResolutionKind;
    agreedStatement: string | null;
    divergentStatement: string | null;
    rationale: string;
  }) => void;
}) {
  const { t } = useT();

  return (
    <section className="rounded-lg border border-border p-4" aria-labelledby="beskt-panel-h">
      <h2 id="beskt-panel-h" className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.panel.heading")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.conduct.panel.lede")}
      </p>
      <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.conduct.panel.noTotal")}
      </p>

      {panel === null ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">{t("beskt.conduct.panel.none")}</p>
          {openError != null && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t(besktErrorKey(openError))}
            </p>
          )}
          <button
            type="button"
            className={`${PRIMARY_BUTTON} ${TOUCH} mt-3`}
            disabled={openBusy}
            onClick={onOpen}
          >
            {openBusy ? t("beskt.conduct.panel.opening") : t("beskt.conduct.panel.open")}
          </button>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Fact label={t("beskt.conduct.panel.state")}>
              <Chip tone={panel.state === "revealed" ? "confirmed" : "work"}>
                {PANEL_STATE_LABEL[panel.state] ? t(PANEL_STATE_LABEL[panel.state]) : panel.state}
              </Chip>
            </Fact>
            {panel.revealedAt && (
              <Fact label={t("beskt.conduct.panel.state.revealed")}>
                {panel.revealedAt.slice(0, 16).replace("T", " ")}
              </Fact>
            )}
          </dl>

          {panel.state === "open" && (
            <div className="mt-4">
              <p className="max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
                {t("beskt.conduct.panel.revealNote")}
              </p>
              {revealError != null && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {t(besktErrorKey(revealError))}
                </p>
              )}
              <button
                type="button"
                className={`${PRIMARY_BUTTON} ${TOUCH} mt-3`}
                disabled={revealBusy}
                onClick={() => onReveal(panel.panelId, panel.revision)}
              >
                {revealBusy ? t("beskt.conduct.panel.revealing") : t("beskt.conduct.panel.reveal")}
              </button>
            </div>
          )}

          {panel.state !== "open" && <Comparison myEntries={myEntries} others={others} />}

          <p className="mt-4 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.panel.preservesPositions")}
          </p>

          {panel.state !== "open" && (
            <ResolutionForm
              busy={resolutionBusy}
              error={resolutionError}
              itemKeys={allItemKeys(myEntries, others)}
              onSubmit={(input) =>
                onRecord({ panelId: panel.panelId, revision: panel.revision, ...input })
              }
            />
          )}

          <RecordedResolutions resolutions={panel.resolutions} />
        </>
      )}
    </section>
  );
}

/** Every governed item anyone documented. Sorted, so the list is stable. */
function allItemKeys(
  mine: readonly BesktConductEntry[],
  others: readonly BesktOtherPosition[] | null,
): readonly string[] {
  const keys = new Set(mine.map((e) => e.itemKey));
  for (const o of others ?? []) for (const e of o.entries) keys.add(e.itemKey);
  return [...keys].sort();
}

/**
 * Where the positions agree on having covered something, and where they do
 * not.
 *
 * "Common" here means the same governed item was documented by everyone — a
 * statement about coverage, not about content, and worded that way. Nothing
 * compares two interpretations and pronounces them the same, because two
 * people describing the same moment in different words have not disagreed.
 */
function Comparison({
  myEntries,
  others,
}: {
  myEntries: readonly BesktConductEntry[];
  others: readonly BesktOtherPosition[] | null;
}) {
  const { t } = useT();

  if (others === null) {
    return (
      <div className="mt-4">
        <Panel tone="neutral" title={t("beskt.conduct.others.hidden.title")}>
          <p>{t("beskt.conduct.others.hidden.body")}</p>
        </Panel>
      </div>
    );
  }

  const mineKeys = new Set(myEntries.map((e) => e.itemKey));
  const sets = [mineKeys, ...others.map((o) => new Set(o.entries.map((e) => e.itemKey)))];
  const union = allItemKeys(myEntries, others);
  const common = union.filter((k) => sets.every((s) => s.has(k)));
  const divergent = union.filter((k) => !sets.every((s) => s.has(k)));

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("beskt.conduct.panel.common")}</h3>
        {common.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("beskt.conduct.panel.noCommon")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {common.map((k) => (
              <li key={k}>
                <Chip tone="confirmed">{k}</Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {t("beskt.conduct.panel.divergent")}
        </h3>
        {divergent.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("beskt.conduct.panel.noDivergent")}
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {divergent.map((k) => (
              <li key={k}>
                <Chip tone="attention">{k}</Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResolutionForm({
  busy,
  error,
  itemKeys,
  onSubmit,
}: {
  busy: boolean;
  error: unknown;
  itemKeys: readonly string[];
  onSubmit: (input: {
    itemKey: string;
    resolutionKind: BesktResolutionKind;
    agreedStatement: string | null;
    divergentStatement: string | null;
    rationale: string;
  }) => void;
}) {
  const { t } = useT();
  const base = useId();
  const [itemKey, setItemKey] = useState(itemKeys[0] ?? "");
  const [kind, setKind] = useState<BesktResolutionKind>("agreed");
  const [agreed, setAgreed] = useState("");
  const [divergent, setDivergent] = useState("");
  const [rationale, setRationale] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const id = (n: string) => `${base}-${n}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (itemKey === "") return;
    if (kind === "agreed" && agreed.trim() === "") {
      setLocalError(t("beskt.error.conductAgreementRequired"));
      return;
    }
    if (kind === "disagreed" && divergent.trim() === "") {
      setLocalError(t("beskt.error.conductDivergenceRequired"));
      return;
    }
    if (rationale.trim().length < 3) {
      setLocalError(t("beskt.error.conductRationaleRequired"));
      return;
    }
    setLocalError(null);
    onSubmit({
      itemKey,
      resolutionKind: kind,
      agreedStatement: agreed.trim() === "" ? null : agreed.trim(),
      divergentStatement: divergent.trim() === "" ? null : divergent.trim(),
      rationale: rationale.trim(),
    });
  };

  const message = localError ?? (error ? t(besktErrorKey(error)) : null);

  if (itemKeys.length === 0) return null;

  return (
    <form className="mt-6 rounded-md border border-border p-4" onSubmit={submit}>
      <h3 className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.panel.resolution.heading")}
      </h3>

      {message && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {message}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id("item")} className="text-sm font-medium text-foreground">
            {t("beskt.conduct.panel.resolution.item")}
          </label>
          <select
            id={id("item")}
            className={`${FIELD} ${TOUCH}`}
            value={itemKey}
            onChange={(e) => setItemKey(e.target.value)}
          >
            {itemKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id("kind")} className="text-sm font-medium text-foreground">
            {t("beskt.conduct.panel.resolution.kind")}
          </label>
          <select
            id={id("kind")}
            className={`${FIELD} ${TOUCH}`}
            value={kind}
            onChange={(e) => setKind(e.target.value as BesktResolutionKind)}
          >
            {BESKT_RESOLUTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(RESOLUTION_KIND_LABEL[k])}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={id("agreed")} className="text-sm font-medium text-foreground">
          {t("beskt.conduct.panel.resolution.agreed")}
        </label>
        <textarea
          id={id("agreed")}
          rows={2}
          className={`${FIELD} ${TOUCH}`}
          aria-describedby={id("agreed-help")}
          value={agreed}
          onChange={(e) => setAgreed(e.target.value)}
        />
        <p id={id("agreed-help")} className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("beskt.conduct.panel.resolution.agreedHelp")}
        </p>
      </div>

      <div className="mt-3">
        <label htmlFor={id("divergent")} className="text-sm font-medium text-foreground">
          {t("beskt.conduct.panel.resolution.divergent")}
        </label>
        <textarea
          id={id("divergent")}
          rows={2}
          className={`${FIELD} ${TOUCH}`}
          aria-describedby={id("divergent-help")}
          value={divergent}
          onChange={(e) => setDivergent(e.target.value)}
        />
        <p
          id={id("divergent-help")}
          className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground"
        >
          {t("beskt.conduct.panel.resolution.divergentHelp")}
        </p>
      </div>

      <div className="mt-3">
        <label htmlFor={id("rationale")} className="text-sm font-medium text-foreground">
          {t("beskt.conduct.panel.resolution.rationale")}
        </label>
        <textarea
          id={id("rationale")}
          rows={2}
          required
          className={`${FIELD} ${TOUCH}`}
          aria-describedby={id("rationale-help")}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
        <p id={id("rationale-help")} className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("beskt.conduct.panel.resolution.rationaleHelp")}
        </p>
      </div>

      <button type="submit" className={`${PRIMARY_BUTTON} ${TOUCH} mt-4`} disabled={busy}>
        {busy
          ? t("beskt.conduct.panel.resolution.saving")
          : t("beskt.conduct.panel.resolution.save")}
      </button>
    </form>
  );
}

function RecordedResolutions({
  resolutions,
}: {
  resolutions: NonNullable<BesktConductWorkspace["panel"]>["resolutions"];
}) {
  const { t } = useT();
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-foreground">
        {t("beskt.conduct.panel.resolution.recorded")}
      </h3>
      {resolutions.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {t("beskt.conduct.panel.resolution.empty")}
        </p>
      ) : (
        <ol className="mt-2 space-y-3">
          {resolutions.map((r) => (
            <li key={r.resolutionId} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all font-mono text-xs text-foreground">{r.itemKey}</span>
                <Chip tone={r.resolutionKind === "agreed" ? "confirmed" : "attention"}>
                  {t(RESOLUTION_KIND_LABEL[r.resolutionKind])}
                </Chip>
                <span className="text-xs text-muted-foreground">
                  {r.recordedAt.slice(0, 16).replace("T", " ")}
                </span>
              </div>
              <dl className="mt-2 space-y-2">
                {r.agreedStatement && (
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("beskt.conduct.panel.resolution.agreed")}
                    </dt>
                    <dd className="whitespace-pre-wrap text-sm text-foreground">
                      {r.agreedStatement}
                    </dd>
                  </div>
                )}
                {r.divergentStatement && (
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("beskt.conduct.panel.resolution.divergent")}
                    </dt>
                    <dd className="whitespace-pre-wrap text-sm text-foreground">
                      {r.divergentStatement}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t("beskt.conduct.panel.resolution.rationale")}
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm text-foreground">{r.rationale}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
