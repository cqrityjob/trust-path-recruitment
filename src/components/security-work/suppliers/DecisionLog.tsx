import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { recordSecurityDecision } from "@/lib/security-work/suppliers/functions";
import { APPROVER_DECISIONS, type DecisionKind } from "@/lib/security-work/suppliers/model";
import type { Decision, Member } from "@/lib/security-work/suppliers/services";
import { useSecurityWorkspace } from "../context";
import {
  Field,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
} from "../ui";
import { useSupplierText, useSupplierWrite } from "./supplier-ui";

const KINDS: DecisionKind[] = [
  "investigate",
  "remediate",
  "defer",
  "accept_risk",
  "no_action",
  "scope_cost",
  "temporary_protection",
  "close_with_deviation",
];

/**
 * Append-only decisions on one subject. Who decided and when is the
 * database's stamp; earlier decisions are never edited, only followed by
 * newer ones. Decisions needing the approval right are offered only to it.
 */
export function DecisionLog({
  subjectKind,
  subjectId,
  decisions,
  members,
  hint,
}: {
  subjectKind: "intelligence_item" | "change_brief" | "risk" | "action" | "supplier_request";
  subjectId: string;
  decisions: Decision[];
  members: Member[];
  hint?: string;
}) {
  const { lang } = useT();
  const text = useSupplierText();
  const { l } = text;
  const { workspace, canEdit, membership } = useSecurityWorkspace();
  const canApprove = Boolean(membership.can_approve);
  const kinds = KINDS.filter((k) => canApprove || !APPROVER_DECISIONS.includes(k));
  const [decision, setDecision] = useState<DecisionKind>("investigate");
  const [rationale, setRationale] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("SEK");
  const [costScope, setCostScope] = useState("");
  const [mandate, setMandate] = useState("");
  const run = useSupplierWrite(useServerFn(recordSecurityDecision));
  return (
    <section className={`${panelClass} space-y-3`} data-testid="sw-decisions">
      <h2 className="font-display text-lg font-semibold">{l("Beslut", "Decisions")}</h2>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {decisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {l("Inga beslut dokumenterade.", "No decisions documented.")}
        </p>
      ) : (
        <ol className="space-y-2">
          {decisions.map((d) => (
            <li
              key={d.id}
              className="rounded-md border border-border p-3 text-sm"
              data-testid="sw-decision"
              data-decision={d.decision}
            >
              <p className="font-medium">
                {text.decision(d.decision)}
                {d.subject_kind !== subjectKind && ` (${l("på åtgärden", "on the action")})`}
              </p>
              <p className="whitespace-pre-wrap break-words">{d.rationale}</p>
              <p className="text-xs text-muted-foreground">
                {members.find((m) => m.user_id === d.decided_by)?.label ?? "—"} ·{" "}
                {formatDate(d.decided_at, lang, true)}
                {d.review_at && ` · ${l("omprövas", "review")} ${d.review_at}`}
                {d.amount !== null &&
                  ` · ${d.amount} ${d.currency} · ${d.cost_scope} · ${l("mandat", "mandate")}: ${d.mandate}`}
              </p>
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <form
          className="space-y-3 border-t border-border pt-3"
          data-testid="sw-decision-form"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate(
              {
                workspaceId: workspace.id,
                subjectKind,
                subjectId,
                decision,
                rationale,
                reviewAt: reviewAt || null,
                amount: decision === "scope_cost" && amount ? Number(amount) : null,
                currency: decision === "scope_cost" ? currency : null,
                costScope: decision === "scope_cost" ? costScope : null,
                mandate: decision === "scope_cost" ? mandate : null,
              },
              { onSuccess: () => setRationale("") },
            );
          }}
        >
          <Field label={l("Beslut", "Decision")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={decision}
                onChange={(e) => setDecision(e.target.value as DecisionKind)}
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {text.decision(k)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <TextAreaField
            label={l("Motivering", "Rationale")}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            required
          />
          {(decision === "defer" || decision === "accept_risk") && (
            <TextField
              label={l("Omprövas senast", "Review by")}
              type="date"
              value={reviewAt}
              onChange={(e) => setReviewAt(e.target.value)}
              required={decision === "defer"}
            />
          )}
          {decision === "scope_cost" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={l("Belopp", "Amount")}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                required
              />
              <TextField
                label={l("Valuta", "Currency")}
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                required
              />
              <TextField
                label={l("Omfattning", "Scope")}
                value={costScope}
                onChange={(e) => setCostScope(e.target.value)}
                required
              />
              <TextField
                label={l("Mandat", "Mandate")}
                hint={l("Vem som har rätt att fatta beslutet.", "Who has authority to decide.")}
                value={mandate}
                onChange={(e) => setMandate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {l(
                  "Beslutet registreras. Ingen beställning eller betalning görs av plattformen.",
                  "The decision is recorded. The platform places no order and makes no payment.",
                )}
              </p>
            </div>
          )}
          <WorkError code={run.error?.message} message={text.error(run.error?.message)} />
          <WorkButton type="submit" disabled={run.isPending}>
            {l("Dokumentera beslut", "Document decision")}
          </WorkButton>
        </form>
      )}
    </section>
  );
}
