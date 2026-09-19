// The responsible human's stance, and the follow-up actions (§6 points 6-8).
//
// Written by a person, never generated: there is no default text and no
// suggestion. The stance is recorded after every independent position is
// locked, by the assignment's responsible interviewer, its security owner or
// the employer's owner or admin -- the database refuses anyone else -- and a
// report cannot be finalised until it exists. A change is a new version that
// says why; the earlier one stays in the record.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  getBesktDecision,
  recordBesktAction,
  recordBesktStance,
  type BesktAction,
} from "@/lib/beskt/complete.functions";
import { BUTTON, FIELD, Panel, PRIMARY_BUTTON } from "@/components/employer/interview/InterviewUi";
import { TOUCH } from "./BesktConductUi";

const STATUSES = ["planned", "in_progress", "done", "cancelled"] as const;

export function BesktDecisionPanel({ sessionId }: { sessionId: string }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getBesktDecision);
  const stanceFn = useServerFn(recordBesktStance);
  const actionFn = useServerFn(recordBesktAction);
  const key = ["beskt", "conduct", "decision", sessionId];
  const decision = useQuery({
    queryKey: key,
    queryFn: () => getFn({ data: { sessionId } }),
    retry: false,
  });

  const [editing, setEditing] = useState(false);
  const [sufficiency, setSufficiency] = useState<"sufficient" | "more_information_required">(
    "sufficient",
  );
  const [sufficiencyReason, setSufficiencyReason] = useState("");
  const [stance, setStance] = useState("");
  const [rationale, setRationale] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [correction, setCorrection] = useState("");
  const [stanceOp, setStanceOp] = useState(() => crypto.randomUUID());

  const [actDescription, setActDescription] = useState("");
  const [actResponsible, setActResponsible] = useState("");
  const [actDue, setActDue] = useState("");
  const [actReview, setActReview] = useState("");
  const [actOp, setActOp] = useState(() => crypto.randomUUID());

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["beskt"] });
  const recordStance = useMutation({
    mutationFn: () =>
      stanceFn({
        data: {
          operationId: stanceOp,
          sessionId,
          expectedVersion: decision.data?.stanceVersion ?? 0,
          sufficiency,
          sufficiencyReason: sufficiencyReason.trim(),
          stance: stance.trim(),
          rationale: rationale.trim(),
          decidedByName: name.trim(),
          decidedRole: role.trim(),
          correctionReason: (decision.data?.stanceVersion ?? 0) > 0 ? correction.trim() : null,
        },
      }),
    onSuccess: async () => {
      setEditing(false);
      setStanceOp(crypto.randomUUID());
      await refresh();
    },
  });
  const recordAction = useMutation({
    mutationFn: (input: { action?: BesktAction; status?: BesktAction["status"] }) =>
      actionFn({
        data: {
          operationId: actOp,
          sessionId,
          actionKey: input.action?.actionKey ?? null,
          expectedVersion: input.action?.version ?? 0,
          description: input.action?.description ?? actDescription.trim(),
          responsible: input.action?.responsible ?? actResponsible.trim(),
          dueOn: input.action ? input.action.dueOn : actDue || null,
          status: input.status ?? "planned",
          reviewOn: input.action ? input.action.reviewOn : actReview || null,
          note: null,
        },
      }),
    onSuccess: async () => {
      setActOp(crypto.randomUUID());
      setActDescription("");
      setActResponsible("");
      setActDue("");
      setActReview("");
      await refresh();
    },
  });

  if (decision.isPending || decision.isError) return null;
  const d = decision.data;
  const current = d.stance;
  const showForm = d.mayRecord && (editing || current === null);
  const stanceReady =
    sufficiencyReason.trim().length >= 10 &&
    stance.trim().length >= 10 &&
    rationale.trim().length >= 10 &&
    name.trim().length >= 2 &&
    role.trim().length >= 2 &&
    (current === null || correction.trim().length >= 3);

  return (
    <section
      className="rounded-lg border border-border p-4 print:hidden"
      aria-labelledby="beskt-decision-h"
      data-testid="beskt-decision"
    >
      <h2 id="beskt-decision-h" className="text-sm font-semibold text-foreground">
        {t("beskt.decision.heading")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.decision.lede")}
      </p>

      {current ? (
        <div
          className="mt-3 rounded-md border border-border p-3 text-sm"
          data-testid="beskt-decision-current"
        >
          <p className="font-medium">
            {t(
              current.sufficiency === "sufficient"
                ? "beskt.decision.sufficient"
                : "beskt.decision.moreInformation",
            )}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{current.stance}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {current.decidedByName} · {current.decidedRole} · v{current.version}
          </p>
          {d.mayRecord && !editing ? (
            <button
              type="button"
              className={`${BUTTON} ${TOUCH} mt-2`}
              onClick={() => setEditing(true)}
            >
              {t("beskt.decision.change")}
            </button>
          ) : null}
        </div>
      ) : !d.mayRecord ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.decision.notResponsible")}</p>
      ) : null}

      {showForm ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (stanceReady) recordStance.mutate();
          }}
          data-testid="beskt-decision-form"
        >
          <fieldset>
            <legend className="text-sm font-medium">{t("beskt.decision.sufficiency")}</legend>
            <div className="mt-1 flex flex-wrap gap-4 text-sm">
              {(["sufficient", "more_information_required"] as const).map((v) => (
                <label key={v} className={`flex items-center gap-2 ${TOUCH}`}>
                  <input
                    type="radio"
                    name="beskt-sufficiency"
                    checked={sufficiency === v}
                    onChange={() => setSufficiency(v)}
                    data-testid={`beskt-sufficiency-${v}`}
                  />
                  {t(
                    v === "sufficient"
                      ? "beskt.decision.sufficient"
                      : "beskt.decision.moreInformation",
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          {(
            [
              [
                "beskt-decision-sufficiency-reason",
                "beskt.decision.sufficiencyReason",
                sufficiencyReason,
                setSufficiencyReason,
                2,
              ],
              ["beskt-decision-stance", "beskt.decision.stance", stance, setStance, 3],
              ["beskt-decision-rationale", "beskt.decision.rationale", rationale, setRationale, 4],
            ] as const
          ).map(([id, label, value, setter, rows]) => (
            <div key={id}>
              <label htmlFor={id} className="text-sm font-medium">
                {t(label as TranslationKey)}
              </label>
              <textarea
                id={id}
                rows={rows}
                className={`${FIELD} ${TOUCH}`}
                value={value}
                onChange={(e) => setter(e.target.value)}
              />
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="beskt-decision-name" className="text-sm font-medium">
                {t("beskt.decision.name")}
              </label>
              <input
                id="beskt-decision-name"
                className={`${FIELD} ${TOUCH}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="beskt-decision-role" className="text-sm font-medium">
                {t("beskt.decision.role")}
              </label>
              <input
                id="beskt-decision-role"
                className={`${FIELD} ${TOUCH}`}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>
          {current ? (
            <div>
              <label htmlFor="beskt-decision-correction" className="text-sm font-medium">
                {t("beskt.decision.correctionReason")}
              </label>
              <input
                id="beskt-decision-correction"
                className={`${FIELD} ${TOUCH}`}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
              />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("beskt.decision.noScoreHint")}</p>
          {recordStance.isError ? (
            <p role="alert" className="text-sm text-destructive" data-testid="beskt-decision-error">
              {t(besktErrorKey(recordStance.error))}
            </p>
          ) : null}
          <button
            type="submit"
            className={`${PRIMARY_BUTTON} ${TOUCH}`}
            disabled={!stanceReady || recordStance.isPending}
            data-testid="beskt-decision-submit"
          >
            {t("beskt.decision.record")}
          </button>
        </form>
      ) : null}

      <h3 className="mt-5 text-sm font-semibold">{t("beskt.decision.actions")}</h3>
      {d.actions.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("beskt.decision.noActions")}</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="beskt-decision-actions">
          {d.actions.map((a) => (
            <li key={a.actionKey} className="rounded-md border border-border p-2 text-sm">
              <p>{a.description}</p>
              <p className="text-xs text-muted-foreground">
                {t("beskt.decision.responsible")}: {a.responsible} · {t("beskt.decision.due")}:{" "}
                {a.dueOn ?? "—"} · {t(`beskt.decision.status.${a.status}` as TranslationKey)}
              </p>
              {d.mayRecord ? (
                <label className="mt-1 flex items-center gap-2 text-xs">
                  {t("beskt.decision.status")}
                  <select
                    className={`${FIELD} ${TOUCH} max-w-[12rem]`}
                    value={a.status}
                    onChange={(e) =>
                      recordAction.mutate({
                        action: a,
                        status: e.target.value as BesktAction["status"],
                      })
                    }
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {t(`beskt.decision.status.${st}` as TranslationKey)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {d.mayRecord ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (actDescription.trim().length >= 3 && actResponsible.trim().length >= 2)
              recordAction.mutate({});
          }}
          data-testid="beskt-action-form"
        >
          <div className="sm:col-span-2">
            <label htmlFor="beskt-action-description" className="text-xs font-medium">
              {t("beskt.decision.actionDescription")}
            </label>
            <input
              id="beskt-action-description"
              className={`${FIELD} ${TOUCH}`}
              value={actDescription}
              onChange={(e) => setActDescription(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="beskt-action-responsible" className="text-xs font-medium">
              {t("beskt.decision.responsible")}
            </label>
            <input
              id="beskt-action-responsible"
              className={`${FIELD} ${TOUCH}`}
              value={actResponsible}
              onChange={(e) => setActResponsible(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="beskt-action-due" className="text-xs font-medium">
              {t("beskt.decision.due")}
            </label>
            <input
              id="beskt-action-due"
              type="date"
              className={`${FIELD} ${TOUCH}`}
              value={actDue}
              onChange={(e) => setActDue(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="beskt-action-review" className="text-xs font-medium">
              {t("beskt.decision.review")}
            </label>
            <input
              id="beskt-action-review"
              type="date"
              className={`${FIELD} ${TOUCH}`}
              value={actReview}
              onChange={(e) => setActReview(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className={`${BUTTON} ${TOUCH}`}
              disabled={
                actDescription.trim().length < 3 ||
                actResponsible.trim().length < 2 ||
                recordAction.isPending
              }
              data-testid="beskt-action-submit"
            >
              {t("beskt.decision.addAction")}
            </button>
          </div>
          {recordAction.isError ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {t(besktErrorKey(recordAction.error))}
            </p>
          ) : null}
        </form>
      ) : null}
      {current === null ? null : (
        <Panel tone="neutral" title={t("beskt.decision.inReportTitle")}>
          <p>{t("beskt.decision.inReportBody")}</p>
        </Panel>
      )}
    </section>
  );
}
