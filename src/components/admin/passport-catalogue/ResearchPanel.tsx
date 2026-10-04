import { useMemo, useState } from "react";
import type {
  AdminResearchDecisionInput,
  AdminResearchRecord,
} from "@/lib/job-intelligence/admin-catalogue-research.functions";
import {
  APPROVAL_IS_A_MIGRATION,
  evidenceLevelLabel,
  researchAreaLabel,
  researchDecisionLabel,
  researchKindLabel,
  researchOutcomeLabel,
  researchScopeLabel,
  RESEARCH_AREA,
  RESEARCH_KIND,
  RESEARCH_OUTCOME,
  type Lang,
} from "@/lib/security-passport/catalogue-research-labels";
import {
  UNAVAILABLE_REASONS,
  unavailableReasonLabel,
} from "@/lib/security-passport/credential-picker";

const HOLDER_REASONS = Object.keys(UNAVAILABLE_REASONS).filter((k) => k !== "not_offered");

/** What the database's refusal means, for an administrator. An unknown one is shown as itself. */
function decisionError(code: string, l: Lang): string {
  const say = (sv: string, en: string) => (l === "sv" ? sv : en);
  if (code === "SP_RESEARCH_RECORD_IS_PUBLISHED")
    return say(
      "Posten är redan en publicerad definition: att ändra eller dra tillbaka den sker genom granskad migration.",
      "This record is already a published definition: changing or withdrawing it is a reviewed migration.",
    );
  if (code === "SP_RESEARCH_ISSUE_REQUIRED")
    return say(
      "Att behålla en post kräver det olösta problemet, åtgärden och orsaken som innehavaren ser.",
      "Retaining a record needs the unresolved issue, the action and the reason the holder sees.",
    );
  if (code === "SP_RESEARCH_REASON_REQUIRED")
    return say("Ett beslut behöver en motivering.", "A decision needs a reason.");
  if (code === "SP_RESEARCH_DECISION_INVALID")
    return say(
      "Godkännande och publicering sker genom granskad migration, inte här.",
      "Approval and publication are reviewed migrations, not made here.",
    );
  if (code === "FORBIDDEN_ADMIN_REQUIRED" || code === "SP_CATALOGUE_ADMIN_REQUIRED")
    return say(
      "Bara en plattformsadministratör får fatta beslutet.",
      "Only a platform administrator may decide.",
    );
  return say(`Beslutet kunde inte sparas (${code}).`, `The decision could not be saved (${code}).`);
}

export function ResearchPanel({
  l,
  records,
  failed,
  onDecide,
}: {
  l: Lang;
  records: readonly AdminResearchRecord[] | null;
  failed: boolean;
  onDecide: (input: AdminResearchDecisionInput) => Promise<void>;
}) {
  const copy = (sv: string, en: string) => (l === "sv" ? sv : en);
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const [area, setArea] = useState("");
  const [kind, setKind] = useState("");
  const [priority, setPriority] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (records ?? []).filter(
      (r) =>
        (!outcome || r.outcome === outcome) &&
        (!area || r.area === area) &&
        (!kind || r.kind === kind) &&
        (!priority || r.priority === priority) &&
        (!needle ||
          `${r.officialName} ${r.acronym ?? ""} ${r.issuerName} ${r.credentialCode ?? ""}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [records, search, outcome, area, kind, priority]);
  const counts = (records ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const select = "mt-1 block min-h-11 rounded-md border border-input bg-background px-3 text-sm";

  if (failed)
    return (
      <p role="alert" className="text-sm text-destructive" data-research-unavailable>
        {copy(
          "Forskningsposterna kunde inte läsas. Schemat för certifieringsforskningen kanske inte är tillämpat ännu.",
          "The research records could not be read. The certification research schema may not be applied yet.",
        )}
      </p>
    );
  if (!records)
    return <p role="status">{copy("Läser forskningsposterna…", "Loading research records…")}</p>;

  return (
    <div className="space-y-5" data-research-panel>
      <p className="max-w-3xl text-sm text-muted-foreground" data-research-boundary>
        {APPROVAL_IS_A_MIGRATION[l]}
      </p>
      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" data-research-counts>
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{copy("Alla poster", "All records")}</dt>
          <dd className="mt-1 text-xl font-semibold" data-research-count="total">
            {records.length}
          </dd>
        </div>
        {(Object.keys(RESEARCH_OUTCOME) as (keyof typeof RESEARCH_OUTCOME)[]).map((o) => (
          <div key={o} className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{researchOutcomeLabel(o, l)}</dt>
            <dd className="mt-1 text-xl font-semibold" data-research-count={o}>
              {counts[o] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          {copy("Sök", "Search")}
          <input
            type="search"
            data-research-filter="search"
            className={`${select} w-56`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-sm">
          {copy("Utfall", "Outcome")}
          <select
            data-research-filter="outcome"
            className={select}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">{copy("Alla", "All")}</option>
            {Object.keys(RESEARCH_OUTCOME).map((o) => (
              <option key={o} value={o}>
                {researchOutcomeLabel(o, l)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {copy("Område", "Area")}
          <select
            data-research-filter="area"
            className={select}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">{copy("Alla", "All")}</option>
            {Object.keys(RESEARCH_AREA).map((a) => (
              <option key={a} value={a}>
                {researchAreaLabel(a, l)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {copy("Sorts intyg", "Kind")}
          <select
            data-research-filter="kind"
            className={select}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">{copy("Alla", "All")}</option>
            {Object.keys(RESEARCH_KIND).map((k) => (
              <option key={k} value={k}>
                {researchKindLabel(k, l)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {copy("Prioritet", "Priority")}
          <select
            data-research-filter="priority"
            className={select}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">{copy("Alla", "All")}</option>
            {["P1", "P2", "P3"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <p className="self-end text-sm text-muted-foreground" role="status" data-research-shown>
          {copy(
            `Visar ${shown.length} av ${records.length}`,
            `Showing ${shown.length} of ${records.length}`,
          )}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">{copy("Prio", "Pri.")}</th>
              <th className="p-3">{copy("Certifiering", "Certification")}</th>
              <th className="p-3">{copy("Sorts intyg och område", "Kind and area")}</th>
              <th className="p-3">{copy("Underlag", "Evidence")}</th>
              <th className="p-3">{copy("Utfall och skäl", "Outcome and reason")}</th>
              <th className="p-3">{copy("Beslut", "Decision")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border align-top"
                data-research-row={r.researchId}
                data-research-outcome={r.outcome}
              >
                <td className="p-3 text-xs">{r.priority}</td>
                <td className="p-3">
                  <p className="font-medium">
                    {r.acronym ? `${r.acronym} — ` : ""}
                    {r.officialName}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.issuerName}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{r.researchId}</p>
                </td>
                <td className="p-3 text-xs">
                  <p>{researchKindLabel(r.kind, l)}</p>
                  <p className="text-muted-foreground">{researchAreaLabel(r.area, l)}</p>
                  <p className="mt-1 text-muted-foreground" data-research-metadata>
                    {copy("Forskningsmetadata", "Research metadata")}:{" "}
                    {researchScopeLabel(r.researchScope, l)}
                    {r.jurisdictionContext ? ` · ${r.jurisdictionContext}` : ""}
                  </p>
                </td>
                <td className="p-3 text-xs">
                  <p>{evidenceLevelLabel(r.evidenceLevel, l)}</p>
                  <a
                    className="text-accent underline"
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {new URL(r.sourceUrl).hostname}
                  </a>
                  <p className="text-muted-foreground">
                    {copy("kontrollerad", "checked")} {r.sourceCheckedOn}
                  </p>
                  {r.researchStatus === "source_recheck_required" && (
                    <p className="mt-1 font-medium" data-research-recheck>
                      {r.recheckCheckedOn
                        ? copy(
                            `Källkontroll krävdes — omkollad ${r.recheckCheckedOn}`,
                            `Source recheck was required — rechecked ${r.recheckCheckedOn}`,
                          )
                        : copy("Källkontroll krävs", "Source recheck required")}
                    </p>
                  )}
                </td>
                <td className="p-3 text-xs">
                  <p className="font-medium">{researchOutcomeLabel(r.outcome, l)}</p>
                  {r.credentialCode && (
                    <p className="font-mono text-muted-foreground" data-research-definition>
                      {r.credentialCode}
                    </p>
                  )}
                  {r.holderReason && (
                    <p className="text-muted-foreground" data-research-holder-reason>
                      {copy("Innehavaren ser", "The holder sees")}:{" "}
                      {unavailableReasonLabel(r.holderReason, l)}
                    </p>
                  )}
                  {r.unresolvedIssue && (
                    <p className="mt-1">
                      <span className="text-muted-foreground">{copy("Olöst", "Unresolved")}: </span>
                      {r.unresolvedIssue}
                    </p>
                  )}
                  {r.requiredAction && (
                    <p className="mt-1">
                      <span className="text-muted-foreground">{copy("Åtgärd", "Action")}: </span>
                      {r.requiredAction}
                    </p>
                  )}
                  {r.decisionNote && <p className="mt-1 text-muted-foreground">{r.decisionNote}</p>}
                </td>
                <td className="p-3 text-xs">
                  <p>{researchDecisionLabel(r.decision, l)}</p>
                  {r.reviewer && (
                    <p className="text-muted-foreground">
                      {r.reviewer}
                      {r.reviewedAt ? ` · ${r.reviewedAt.slice(0, 10)}` : ""}
                    </p>
                  )}
                  {r.credentialCode ? (
                    <p className="mt-1 text-muted-foreground" data-research-locked>
                      {copy(
                        "Publicerad eller matchad: ändras genom granskad migration.",
                        "Published or matched: changed by reviewed migration.",
                      )}
                    </p>
                  ) : open === r.id ? (
                    <DecisionForm
                      l={l}
                      record={r}
                      onCancel={() => setOpen(null)}
                      onDecide={async (input) => {
                        await onDecide(input);
                        setOpen(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      data-research-decide
                      className="mt-1 min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                      onClick={() => setOpen(r.id)}
                    >
                      {copy("Registrera beslut", "Record a decision")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DecisionForm({
  l,
  record,
  onCancel,
  onDecide,
}: {
  l: Lang;
  record: AdminResearchRecord;
  onCancel: () => void;
  onDecide: (input: AdminResearchDecisionInput) => Promise<void>;
}) {
  const copy = (sv: string, en: string) => (l === "sv" ? sv : en);
  const [decision, setDecision] = useState<AdminResearchDecisionInput["decision"]>(
    record.decision === "approved"
      ? "pending"
      : (record.decision as AdminResearchDecisionInput["decision"]),
  );
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState(record.unresolvedIssue ?? "");
  const [action, setAction] = useState(record.requiredAction ?? "");
  const [reason, setReason] = useState(
    record.holderReason && record.holderReason !== "not_offered"
      ? record.holderReason
      : "awaiting_source_check",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div
      className="mt-2 space-y-2 rounded-md border border-border bg-secondary/20 p-3"
      data-research-form
    >
      <label className="block text-xs">
        {copy("Beslut", "Decision")}
        <select
          data-research-field="decision"
          className={`${field} min-h-11`}
          value={decision}
          onChange={(e) => setDecision(e.target.value as AdminResearchDecisionInput["decision"])}
        >
          {(["pending", "needs_information", "excluded"] as const).map((d) => (
            <option key={d} value={d}>
              {researchDecisionLabel(d, l)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        {copy("Motivering (krävs)", "Reason (required)")}
        <textarea
          data-research-field="note"
          className={`${field} min-h-20`}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {decision === "needs_information" && (
        <>
          <label className="block text-xs">
            {copy("Olöst problem", "Unresolved issue")}
            <textarea
              data-research-field="issue"
              className={`${field} min-h-16`}
              maxLength={2000}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            {copy("Nödvändig åtgärd", "Required action")}
            <textarea
              data-research-field="action"
              className={`${field} min-h-16`}
              maxLength={2000}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            {copy("Vad innehavaren ser", "What the holder sees")}
            <select
              data-research-field="holder-reason"
              className={`${field} min-h-11`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {HOLDER_REASONS.map((r) => (
                <option key={r} value={r}>
                  {unavailableReasonLabel(r, l)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive" data-research-error>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-research-save
          disabled={busy || !note.trim()}
          className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            setError(null);
            void onDecide({
              recordId: record.id,
              decision,
              note,
              ...(decision === "needs_information"
                ? {
                    unresolvedIssue: issue,
                    requiredAction: action,
                    holderReason: reason as NonNullable<AdminResearchDecisionInput["holderReason"]>,
                  }
                : {}),
            })
              .catch((cause: unknown) =>
                setError(decisionError(cause instanceof Error ? cause.message : "", l)),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? copy("Sparar…", "Saving…") : copy("Spara beslut", "Save decision")}
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
