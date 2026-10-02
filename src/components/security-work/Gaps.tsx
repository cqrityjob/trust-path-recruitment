import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  BASELINE_QUESTIONS,
  SECURITY_DOMAINS,
  baselineQuestions,
  domainTitle,
} from "@/lib/security-work/programme/content/baseline-v1";
import {
  gapHasAction,
  potentialGapsFromBaseline,
  type PotentialGap,
} from "@/lib/security-work/programme/gaps";
import { answerMap } from "@/lib/security-work/programme/maturity";
import { saveSecurityGap } from "@/lib/security-work/programme/programme.functions";
import type { Gap, Market, SecurityDomainId } from "@/lib/security-work/programme/types";
import { useSecurityWorkspace } from "./context";
import { SaveStatus, WorkStatus, useSavedOperation, useWorkText } from "./analysis-ui";
import {
  EvidenceLinks,
  Explain,
  OwnerSelect,
  Tag,
  ownerName,
  programmeKey,
  useProgramme,
} from "./programme-ui";
import { AssistantButton, useAssistantContext } from "./SecurityAssistant";
import {
  EmptyState,
  Field,
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
  useUnsavedWarning,
} from "./ui";

type Draft = {
  id: string;
  version: number | null;
  source_kind: Gap["source_kind"] extends string
    ? "baseline" | "risk" | "monitoring" | "analysis" | "incident" | "manual"
    : never;
  domain: SecurityDomainId | null;
  title: string;
  description: string;
  evidence_note: string;
  business_impact: "low" | "medium" | "high";
  related_asset_id: string | null;
  related_risk_id: string | null;
  related_assessment_id: string | null;
  baselineId: string | null;
  baselineQuestionId: string | null;
  suggested_action: string;
  owner_id: string | null;
  status: "open" | "in_progress" | "resolved" | "accepted";
  resolution_note: string;
};
const sourceLabels: Record<Draft["source_kind"], [string, string]> = {
  baseline: ["Säkerhetsnuläge", "Security baseline"],
  risk: ["Riskbedömning", "Risk assessment"],
  monitoring: ["Omvärldsbevakning", "Monitoring"],
  analysis: ["Analys", "Analysis"],
  incident: ["Incidentgenomgång", "Incident review"],
  manual: ["Manuellt", "Manual entry"],
};
const impactLabels = {
  low: ["Låg", "Low"],
  medium: ["Medel", "Medium"],
  high: ["Hög", "High"],
} as const;
const draftFrom = (gap?: Gap, seed?: Partial<Draft>): Draft => ({
  id: gap?.id ?? crypto.randomUUID(),
  version: gap?.version ?? null,
  source_kind: (gap?.source_kind as Draft["source_kind"]) ?? "manual",
  domain: (gap?.domain as SecurityDomainId | null) ?? null,
  title: gap?.title ?? "",
  description: gap?.description ?? "",
  evidence_note: gap?.evidence_note ?? "",
  business_impact: (gap?.business_impact as Draft["business_impact"]) ?? "medium",
  related_asset_id: gap?.related_asset_id ?? null,
  related_risk_id: gap?.related_risk_id ?? null,
  related_assessment_id: gap?.related_assessment_id ?? null,
  baselineId: gap?.baseline_id ?? null,
  baselineQuestionId: gap?.baseline_question_id ?? null,
  suggested_action: gap?.suggested_action ?? "",
  owner_id: gap?.owner_id ?? null,
  status: (gap?.status as Draft["status"]) ?? "open",
  resolution_note: gap?.resolution_note ?? "",
  ...seed,
});

export function GapEditor({
  gap,
  seed,
  onDone,
}: {
  gap?: Gap;
  seed?: Partial<Draft>;
  onDone: () => void;
}) {
  const { lang } = useT();
  const l = useWorkText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const programme = useProgramme();
  const save = useServerFn(saveSecurityGap);
  const op = useSavedOperation();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(gap, seed));
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  const patch = (value: Partial<Draft>) => {
    setDraft((old) => ({ ...old, ...value }));
    setDirty(true);
    op.clear();
  };
  const assets = programme.data?.assets.filter((asset) => asset.status === "active") ?? [];
  const risks = programme.data?.risks.filter((risk) => risk.status !== "closed") ?? [];
  return (
    <form
      className={`${panelClass} space-y-4`}
      data-testid="sw-gap-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canEdit || op.state === "saving") return;
        const saved = await op.run(() => save({ data: { workspaceId: workspace.id, ...draft } }));
        if (saved) {
          setDirty(false);
          clearWarning();
          onDone();
        }
      }}
    >
      <fieldset disabled={!canEdit || op.state === "saving"} className="space-y-4">
        <h3 className="text-lg font-semibold">
          {gap ? l("Redigera gap", "Edit gap") : l("Registrera gap", "Record gap")}
        </h3>
        <TextField
          label={l("Gap", "Gap")}
          required
          maxLength={500}
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={l("Källa", "Source")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.source_kind}
                disabled={Boolean(draft.baselineQuestionId)}
                onChange={(e) => patch({ source_kind: e.target.value as Draft["source_kind"] })}
              >
                {(Object.keys(sourceLabels) as Draft["source_kind"][]).map((value) => (
                  <option key={value} value={value}>
                    {lang === "sv" ? sourceLabels[value][0] : sourceLabels[value][1]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={l("Säkerhetsområde", "Security domain")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.domain ?? ""}
                onChange={(e) =>
                  patch({ domain: (e.target.value || null) as SecurityDomainId | null })
                }
              >
                <option value="">—</option>
                {SECURITY_DOMAINS.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.title[lang]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label={l("Verksamhetspåverkan", "Business impact")}
            hint={l("Din bedömning.", "Your judgement.")}
          >
            {(id, hintId) => (
              <select
                id={id}
                aria-describedby={hintId}
                className={selectClass}
                value={draft.business_impact}
                onChange={(e) =>
                  patch({ business_impact: e.target.value as Draft["business_impact"] })
                }
              >
                {(["low", "medium", "high"] as const).map((value) => (
                  <option key={value} value={value}>
                    {lang === "sv" ? impactLabels[value][0] : impactLabels[value][1]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <TextAreaField
          label={l("Beskrivning", "Description")}
          value={draft.description}
          maxLength={8000}
          onChange={(e) => patch({ description: e.target.value })}
        />
        <TextAreaField
          label={l("Underlag / observation", "Evidence / observation")}
          value={draft.evidence_note}
          maxLength={4000}
          onChange={(e) => patch({ evidence_note: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={l("Berört skyddsvärde", "Related protected asset")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.related_asset_id ?? ""}
                onChange={(e) => patch({ related_asset_id: e.target.value || null })}
              >
                <option value="">—</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={l("Relaterad risk", "Related risk")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.related_risk_id ?? ""}
                onChange={(e) => patch({ related_risk_id: e.target.value || null })}
              >
                <option value="">—</option>
                {risks.map((risk) => (
                  <option key={risk.id} value={risk.id}>
                    {risk.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <TextAreaField
          label={l(
            "Föreslagen åtgärd (skapar inget automatiskt)",
            "Suggested action (creates nothing automatically)",
          )}
          value={draft.suggested_action}
          maxLength={4000}
          onChange={(e) => patch({ suggested_action: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <OwnerSelect
            label={l("Ägare", "Owner")}
            value={draft.owner_id}
            members={programme.data?.members ?? []}
            onChange={(owner_id) => patch({ owner_id })}
          />
          <Field label="Status">
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.status}
                onChange={(e) => patch({ status: e.target.value as Draft["status"] })}
              >
                {(["open", "in_progress", "resolved", "accepted"] as const).map((value) => (
                  <option key={value} value={value}>
                    {
                      {
                        open: l("Öppet", "Open"),
                        in_progress: l("Pågår", "In progress"),
                        resolved: l("Åtgärdat", "Resolved"),
                        accepted: l("Accepterat (ingen åtgärd)", "Accepted (no action)"),
                      }[value]
                    }
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {(draft.status === "resolved" || draft.status === "accepted") && (
          <TextAreaField
            label={l("Motivering", "Rationale")}
            value={draft.resolution_note}
            maxLength={4000}
            onChange={(e) => patch({ resolution_note: e.target.value })}
          />
        )}
      </fieldset>
      <WorkError
        code={op.error}
        onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton type="submit" disabled={!canEdit || op.state === "saving"}>
          {l("Spara gap", "Save gap")}
        </WorkButton>
        <WorkButton type="button" variant="ghost" onClick={onDone}>
          {l("Stäng", "Close")}
        </WorkButton>
        <SaveStatus state={op.state} />
      </div>
    </form>
  );
}

export function SecurityGapsPage() {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [seed, setSeed] = useState<Partial<Draft> | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) });
  const selectedGap = programme.data?.gaps.find((gap) => gap.id === selected) ?? null;
  useAssistantContext({
    kind: "gap",
    id: selectedGap?.id ?? null,
    title: selectedGap?.title ?? t("sw.prog.nav.gaps"),
    apply: selectedGap ? { gapId: selectedGap.id } : undefined,
  });
  if (programme.isPending) return <LoadingState />;
  if (programme.isError || !programme.data)
    return (
      <WorkError
        code={programme.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void programme.refetch()}
      />
    );
  const { gaps, actions, assets, risks, members, evidenceLinks, baseline } = programme.data;
  const questions = baseline.assessment
    ? baselineQuestions(baseline.assessment.market as Market)
    : [];
  const potential = baseline.assessment
    ? potentialGapsFromBaseline(
        questions,
        answerMap(baseline.answers),
        gaps,
        baseline.assessment.id,
      )
    : [];
  const visible = gaps.filter(
    (gap) => filter === "all" || ["open", "in_progress"].includes(gap.status),
  );
  const recordPotential = (item: PotentialGap) => {
    const question = BASELINE_QUESTIONS.find((candidate) => candidate.id === item.questionId);
    setSeed({
      source_kind: "baseline",
      domain: item.domain,
      title: question ? question.text[lang] : item.questionId,
      description: question
        ? `${l("Svar", "Answer")}: ${t(`sw.prog.answer.${item.answer}`)}. ${question.why[lang]}`
        : "",
      business_impact: item.suggestedImpact,
      baselineId: baseline.assessment?.id ?? null,
      baselineQuestionId: item.questionId,
    });
    setEditing("new");
  };
  return (
    <>
      <PageHeading
        title={t("sw.prog.nav.gaps")}
        body={l(
          "Allt som skiljer dagens skydd från det ni behöver – från nuläget, risker, bevakning, analyser och incidenter. Ett gap blir åtgärd först när du bestämmer det.",
          "Everything that separates today's protection from what you need: from the baseline, risks, monitoring, analyses and incidents. A gap becomes an action only when you decide.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            {canEdit && editing !== "new" && (
              <WorkButton
                onClick={() => {
                  setSeed(undefined);
                  setEditing("new");
                }}
                data-testid="sw-add-gap"
              >
                <Plus aria-hidden="true" />
                {l("Registrera gap", "Record gap")}
              </WorkButton>
            )}
            <AssistantButton />
          </div>
        }
      />
      {editing === "new" && (
        <GapEditor
          key={JSON.stringify(seed)}
          seed={seed}
          onDone={() => {
            setEditing(null);
            setSeed(undefined);
            void refresh();
          }}
        />
      )}
      {potential.length > 0 && (
        <section className="space-y-2" data-testid="sw-potential-gaps">
          <h2 className="font-display text-lg font-semibold">
            {l("Möjliga gap från säkerhetsnuläget", "Potential gaps from the security baseline")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {l(
              "Svar med Nej eller Delvis. Registrera dem som gap eller låt dem vara.",
              "Answers of No or Partly. Record them as gaps or leave them.",
            )}
          </p>
          <ul className="divide-y divide-border rounded-xl border border-dashed border-border">
            {potential.map((item) => {
              const question = BASELINE_QUESTIONS.find(
                (candidate) => candidate.id === item.questionId,
              );
              return (
                <li
                  key={item.questionId}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  data-testid="sw-potential-gap"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {question?.text[lang] ?? item.questionId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {domainTitle(item.domain)[lang]} · {t(`sw.prog.answer.${item.answer}`)} ·{" "}
                      {l("föreslagen påverkan", "suggested impact")}:{" "}
                      {lang === "sv"
                        ? impactLabels[item.suggestedImpact][0]
                        : impactLabels[item.suggestedImpact][1]}
                    </span>
                  </span>
                  {canEdit && (
                    <WorkButton
                      variant="outline"
                      className="min-h-10"
                      onClick={() => recordPotential(item)}
                    >
                      {l("Registrera gap", "Record gap")}
                    </WorkButton>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label={l("Filter", "Filter")}>
        {(["open", "all"] as const).map((value) => (
          <WorkButton
            key={value}
            variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value}
            className="min-h-10"
            onClick={() => setFilter(value)}
          >
            {value === "open" ? l("Öppna gap", "Open gaps") : l("Alla", "All")}
          </WorkButton>
        ))}
      </div>
      {visible.length === 0 && editing !== "new" ? (
        <EmptyState
          title={l("Inga gap att visa", "No gaps to show")}
          body={l(
            "Gap kommer från säkerhetsnuläget, riskbedömningar, bevakning, analyser, incidenter eller registreras manuellt.",
            "Gaps come from the baseline, risk assessments, monitoring, analyses, incidents, or are recorded manually.",
          )}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {visible.map((gap) => {
            const addressed = gapHasAction(gap, actions);
            return (
              <li
                key={gap.id}
                className="space-y-3 p-4"
                data-testid="sw-gap-row"
                data-status={gap.status}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    aria-expanded={selected === gap.id}
                    onClick={() => setSelected(selected === gap.id ? null : gap.id)}
                  >
                    <span className="block break-words font-semibold">{gap.title}</span>
                    <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        {lang === "sv"
                          ? sourceLabels[gap.source_kind as Draft["source_kind"]][0]
                          : sourceLabels[gap.source_kind as Draft["source_kind"]][1]}
                      </span>
                      {gap.domain && (
                        <span>· {domainTitle(gap.domain as SecurityDomainId)[lang]}</span>
                      )}
                      <span>
                        · {l("Ägare", "Owner")}: {ownerName(gap.owner_id, undefined, user.id, t)}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag
                      tone={
                        gap.business_impact === "high"
                          ? "bad"
                          : gap.business_impact === "medium"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {l("Påverkan", "Impact")}:{" "}
                      {lang === "sv"
                        ? impactLabels[gap.business_impact as "low"][0]
                        : impactLabels[gap.business_impact as "low"][1]}
                    </Tag>
                    <WorkStatus status={gap.status} />
                    {!addressed && ["open", "in_progress"].includes(gap.status) && (
                      <Tag tone="warn">{l("Ingen åtgärd", "No action")}</Tag>
                    )}
                  </div>
                </div>
                {selected === gap.id && (
                  <div className="space-y-3 border-t border-border pt-3 text-sm">
                    {gap.description && <p className="whitespace-pre-wrap">{gap.description}</p>}
                    {gap.evidence_note && (
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {gap.evidence_note}
                      </p>
                    )}
                    {gap.suggested_action && (
                      <p>
                        <span className="font-semibold">
                          {l("Föreslagen åtgärd", "Suggested action")}:{" "}
                        </span>
                        {gap.suggested_action}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {gap.related_asset_id &&
                        `${l("Skyddsvärde", "Asset")}: ${assets.find((asset) => asset.id === gap.related_asset_id)?.name ?? "—"} · `}
                      {gap.related_risk_id &&
                        `${l("Risk", "Risk")}: ${risks.find((risk) => risk.id === gap.related_risk_id)?.title ?? "—"}`}
                    </p>
                    <div>
                      <p className="font-semibold">{l("Åtgärder", "Actions")}</p>
                      <ul className="list-disc pl-5">
                        {actions
                          .filter((action) => action.gap_id === gap.id)
                          .map((action) => (
                            <li key={action.id}>
                              {action.title} · <WorkStatus status={action.status} />
                            </li>
                          ))}
                      </ul>
                      {canEdit && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <WorkButton asChild variant="outline" className="min-h-10">
                            <Link
                              to="/security-work/$workspaceId/risks"
                              params={{ workspaceId: workspace.id }}
                              search={{ new: true, gapId: gap.id }}
                              data-testid="sw-gap-create-action"
                            >
                              {l("Skapa åtgärd", "Create action")}
                            </Link>
                          </WorkButton>
                          <AssistantButton
                            label={l(
                              "Föreslå åtgärder med Security AI",
                              "Suggest actions with Security AI",
                            )}
                            className="min-h-10"
                          />
                          <WorkButton
                            variant="ghost"
                            className="min-h-10"
                            onClick={() => setEditing(editing === gap.id ? null : gap.id)}
                          >
                            {editing === gap.id
                              ? l("Stäng redigering", "Close editor")
                              : l("Redigera", "Edit")}
                          </WorkButton>
                        </div>
                      )}
                    </div>
                    <EvidenceLinks
                      targetKind="gap"
                      targetId={gap.id}
                      links={evidenceLinks}
                      onChanged={() => void refresh()}
                    />
                  </div>
                )}
                {editing === gap.id && (
                  <GapEditor
                    key={gap.version}
                    gap={gap}
                    onDone={() => {
                      setEditing(null);
                      void refresh();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Explain title={l("Gap, risk eller åtgärd?", "Gap, risk or action?")}>
        <p>
          {l(
            "Ett gap beskriver vad som saknas i dag. En risk beskriver vad som kan hända. En åtgärd beskriver vad ni gör åt det, med ägare och datum. Ett gap kan vara kopplat till både ett skyddsvärde och en risk.",
            "A gap describes what is missing today. A risk describes what could happen. An action describes what you do about it, with an owner and a date. A gap can be linked to both an asset and a risk.",
          )}
        </p>
        <p>
          {members.length > 1
            ? l("Utse en ägare för varje öppet gap.", "Assign an owner to every open gap.")
            : l(
                "Du är ensam medlem i arbetsytan; ägare kan anges som text på åtgärder.",
                "You are the only workspace member; owners can be named as text on actions.",
              )}
        </p>
      </Explain>
    </>
  );
}
