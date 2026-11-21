import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  applySecurityBrief,
  resolveSecurityFlag,
  reviseSecurityBrief,
  transitionSecurityBrief,
  updateSecurityBrief,
} from "@/lib/security-work/impact/functions";
import {
  briefEvidence,
  briefToMarkdown,
  followUpStatusLabel,
  proposedActions,
} from "@/lib/security-work/impact/export";
import type { BriefDetail, ChangeBrief } from "@/lib/security-work/impact/services";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";
import {
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
  splitLines,
} from "../ui";
import { BriefStatusBadge, useBrief, useImpactMutation } from "./impact-ui";

/**
 * One impact brief from draft to follow-up. The database decides who may do
 * what (an approver approves, the evidence is built from cited items, content
 * is frozen once submitted); this page only offers the next step the person
 * may take and says plainly when someone else must take it.
 */
export function SecurityBriefDetail({ briefId }: { briefId: string }) {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace, canEdit, membership } = useSecurityWorkspace();
  const brief = useBrief(briefId);
  if (brief.isPending) return <LoadingState />;
  if (brief.isError)
    return (
      <div className="space-y-4">
        <WorkError
          code={brief.error.message}
          message={
            brief.error.message === "ACCESS_DENIED"
              ? l(
                  "Bedömningen finns inte eller så har du inte tillgång till den.",
                  "The brief does not exist or you do not have access to it.",
                )
              : undefined
          }
          onRetry={() => void brief.refetch()}
        />
        <BackLink />
      </div>
    );
  const detail = brief.data;
  const row = detail.brief;
  const openFlags = detail.flags.filter((flag) => flag.status === "open");
  const evidence = briefEvidence(row.evidence);
  return (
    <div className="space-y-6" data-testid="sw-brief" data-status={row.status}>
      <BackLink />
      <PageHeading
        title={row.title}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <BriefStatusBadge status={row.status} />
            <ExportButtons detail={detail} />
          </div>
        }
      />
      <p className="text-xs text-muted-foreground">
        {l("Version", "Version")} {row.version} ·{" "}
        {row.operating_profile_version === null
          ? l("bedömd utan verksamhetsprofil", "assessed without an operating profile")
          : l(
              `bedömd mot verksamhetsprofil v${row.operating_profile_version}`,
              `assessed against operating profile v${row.operating_profile_version}`,
            )}
        {row.approved_at && ` · ${l("godkänd", "approved")} ${formatDate(row.approved_at, lang)}`}
        {row.decision_note && ` · ${row.decision_note}`}
      </p>

      {openFlags.length > 0 && <Flags detail={detail} />}

      {row.status === "draft" && canEdit ? (
        <EditBrief brief={row} />
      ) : (
        <section className={`${panelClass} space-y-4`} aria-label={l("Bedömning", "Assessment")}>
          <Part title={l("Vad har förändrats", "What changed")} body={row.what_changed} />
          <Part title={l("Vad vet vi", "What is known")} body={row.known} />
          <Part
            title={l("Varför det spelar roll för er", "Why it matters to you")}
            body={row.why_it_matters}
          />
          <Part title={l("Vad är osäkert", "What is uncertain")} body={row.uncertain} />
          <div>
            <h2 className="text-sm font-semibold">
              {l("Föreslagna åtgärder", "Proposed actions")}
            </h2>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {proposedActions(row.proposed_actions).map((action, index) => (
                <li key={index}>{action.title}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className={`${panelClass} space-y-2`} aria-labelledby="sw-brief-sources">
        <h2 id="sw-brief-sources" className="font-semibold">
          {l("Källor", "Sources")}
        </h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="sw-brief-evidence">
          {evidence.map((item) => (
            <li key={item.sourceItemId}>
              <span className="font-medium">{item.publisher}</span>: {item.title}{" "}
              <span className="text-xs text-muted-foreground">
                ({l("publicerad", "published")} {formatDate(item.publishedAt ?? null, lang)},{" "}
                {l("hämtad", "retrieved")} {formatDate(item.retrievedAt ?? null, lang, true)})
              </span>{" "}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-4 hover:underline print:hidden"
                >
                  {l("öppna", "open")}
                </a>
              )}
            </li>
          ))}
        </ol>
      </section>

      <Review brief={row} canApprove={membership.can_approve} canEdit={canEdit} />

      {row.status === "approved" && !detail.application && canEdit && <ApplyBrief brief={row} />}
      {detail.application && <FollowUp detail={detail} />}

      {detail.revisions.length > 0 && (
        <section className={`${panelClass} space-y-1 text-sm`}>
          <h2 className="font-semibold">{l("Senare versioner", "Later versions")}</h2>
          {detail.revisions.map((revision) => (
            <p key={revision.id}>
              <Link
                to="/security-work/$workspaceId/impact/$briefId"
                params={{ workspaceId: workspace.id, briefId: revision.id }}
                className="text-accent underline-offset-4 hover:underline"
              >
                {revision.title}
              </Link>{" "}
              <BriefStatusBadge status={revision.status} />
            </p>
          ))}
        </section>
      )}
      {row.supersedes_id && (
        <p className="text-sm">
          <Link
            to="/security-work/$workspaceId/impact/$briefId"
            params={{ workspaceId: workspace.id, briefId: row.supersedes_id }}
            className="text-accent underline-offset-4 hover:underline"
          >
            {l("Föregående version", "Previous version")}
          </Link>
        </p>
      )}
    </div>
  );
}

function BackLink() {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  return (
    <Link
      to="/security-work/$workspaceId/impact"
      params={{ workspaceId: workspace.id }}
      className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline print:hidden"
    >
      ← {l("Förändringar som berör er", "Changes that affect you")}
    </Link>
  );
}

function Part({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{body.trim() || "—"}</p>
    </div>
  );
}

function ExportButtons({ detail }: { detail: BriefDetail }) {
  const l = useWorkText();
  const { lang } = useT();
  return (
    <>
      <WorkButton
        variant="outline"
        data-testid="sw-brief-export"
        onClick={() => {
          const blob = new Blob([briefToMarkdown(detail, lang)], {
            type: "text/markdown;charset=utf-8",
          });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${detail.brief.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "brief"}-v${detail.brief.version}.md`;
          anchor.click();
          URL.revokeObjectURL(url);
        }}
      >
        {l("Exportera", "Export")}
      </WorkButton>
      <WorkButton variant="ghost" onClick={() => window.print()}>
        {l("Skriv ut", "Print")}
      </WorkButton>
    </>
  );
}

function EditBrief({ brief }: { brief: ChangeBrief }) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const update = useImpactMutation(useServerFn(updateSecurityBrief));
  const [form, setForm] = useState({
    title: brief.title,
    whatChanged: brief.what_changed,
    known: brief.known,
    whyItMatters: brief.why_it_matters,
    uncertain: brief.uncertain,
    actions: proposedActions(brief.proposed_actions)
      .map((action) => action.title)
      .join("\n"),
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));
  return (
    <form
      className={`${panelClass} space-y-3`}
      data-testid="sw-brief-edit"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({
          data: {
            workspaceId: workspace.id,
            briefId: brief.id,
            version: brief.version,
            title: form.title,
            whatChanged: form.whatChanged,
            known: form.known,
            whyItMatters: form.whyItMatters,
            uncertain: form.uncertain,
            proposedActions: splitLines(form.actions).map((title) => ({ title, description: "" })),
            evidenceItemIds: brief.evidence_item_ids,
            relevance: (brief.relevance ?? {}) as Record<string, unknown>,
          },
        });
      }}
    >
      <TextField label={l("Rubrik", "Title")} value={form.title} required onChange={set("title")} />
      <TextAreaField
        label={l("Vad har förändrats", "What changed")}
        value={form.whatChanged}
        onChange={set("whatChanged")}
      />
      <TextAreaField
        label={l("Vad vet vi", "What is known")}
        value={form.known}
        onChange={set("known")}
      />
      <TextAreaField
        label={l("Varför det spelar roll för er", "Why it matters to you")}
        value={form.whyItMatters}
        onChange={set("whyItMatters")}
      />
      <TextAreaField
        label={l("Vad är osäkert", "What is uncertain")}
        value={form.uncertain}
        onChange={set("uncertain")}
      />
      <TextAreaField
        label={l("Föreslagna åtgärder (en per rad)", "Proposed actions (one per line)")}
        value={form.actions}
        onChange={set("actions")}
      />
      <WorkError code={update.error?.message} />
      <WorkButton type="submit" data-testid="sw-brief-save" disabled={update.isPending}>
        {update.isPending ? l("Sparar…", "Saving…") : l("Spara utkast", "Save draft")}
      </WorkButton>
    </form>
  );
}

function Review({
  brief,
  canApprove,
  canEdit,
}: {
  brief: ChangeBrief;
  canApprove: boolean;
  canEdit: boolean;
}) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const transition = useImpactMutation(useServerFn(transitionSecurityBrief));
  const [note, setNote] = useState("");
  const move = (status: "draft" | "in_review" | "approved" | "rejected") =>
    transition.mutate({
      data: {
        workspaceId: workspace.id,
        briefId: brief.id,
        version: brief.version,
        status,
        decisionNote: note,
      },
    });
  if (brief.status === "draft" && canEdit)
    return (
      <section className={`${panelClass} space-y-2 print:hidden`}>
        <p className="text-sm text-muted-foreground">
          {l(
            "När utkastet skickas för granskning låses innehållet. En godkännare beslutar.",
            "Submitting the draft for review locks its content. An approver decides.",
          )}
        </p>
        <WorkError code={transition.error?.message} />
        <WorkButton
          data-testid="sw-brief-submit"
          disabled={transition.isPending}
          onClick={() => move("in_review")}
        >
          {l("Skicka för granskning", "Submit for review")}
        </WorkButton>
      </section>
    );
  if (brief.status !== "in_review") return null;
  return (
    <section className={`${panelClass} space-y-3 print:hidden`} data-testid="sw-brief-review">
      <h2 className="font-semibold">{l("Granskning", "Review")}</h2>
      {canApprove ? (
        <>
          <TextAreaField
            label={l("Beslutsanteckning", "Decision note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <WorkError code={transition.error?.message} />
          <div className="flex flex-wrap gap-2">
            <WorkButton
              data-testid="sw-brief-approve"
              disabled={transition.isPending}
              onClick={() => move("approved")}
            >
              {l("Godkänn", "Approve")}
            </WorkButton>
            <WorkButton
              variant="outline"
              data-testid="sw-brief-reject"
              disabled={transition.isPending}
              onClick={() => move("rejected")}
            >
              {l("Avslå", "Reject")}
            </WorkButton>
            <WorkButton
              variant="ghost"
              disabled={transition.isPending}
              onClick={() => move("draft")}
            >
              {l("Tillbaka till utkast", "Back to draft")}
            </WorkButton>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="sw-brief-awaiting-approver">
            {l(
              "Väntar på en person som får godkänna. Du kan inte godkänna din egen eller andras bedömningar.",
              "Waiting for a person who may approve. You cannot approve your own or others' briefs.",
            )}
          </p>
          {canEdit && (
            <WorkButton
              variant="ghost"
              disabled={transition.isPending}
              onClick={() => move("draft")}
            >
              {l("Tillbaka till utkast", "Back to draft")}
            </WorkButton>
          )}
        </>
      )}
    </section>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function ApplyBrief({ brief }: { brief: ChangeBrief }) {
  const l = useWorkText();
  const { workspace } = useSecurityWorkspace();
  const apply = useImpactMutation(useServerFn(applySecurityBrief));
  // One request id per form: a retry of the same apply returns its receipt.
  const [requestId] = useState(() => crypto.randomUUID());
  const [withRisk, setWithRisk] = useState(true);
  const [risk, setRisk] = useState({
    title: brief.title,
    description: brief.why_it_matters,
    threatScenario: brief.what_changed,
  });
  const [actions, setActions] = useState(
    proposedActions(brief.proposed_actions).map((action) => ({
      title: action.title,
      priority: "medium" as "low" | "medium" | "high" | "urgent",
      dueDate: "",
    })),
  );
  return (
    <form
      className={`${panelClass} space-y-3 print:hidden`}
      data-testid="sw-brief-apply"
      onSubmit={(event) => {
        event.preventDefault();
        apply.mutate({
          data: {
            workspaceId: workspace.id,
            briefId: brief.id,
            version: brief.version,
            requestId,
            risk: withRisk ? risk : null,
            actions: actions
              .filter((action) => action.title.trim())
              .map((action) => ({
                title: action.title,
                description: "",
                priority: action.priority,
                dueDate: action.dueDate || null,
              })),
          },
        });
      }}
    >
      <h2 className="font-semibold">
        {l("För in i risker och åtgärder", "Record as risk and actions")}
      </h2>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={withRisk}
          onChange={(event) => setWithRisk(event.target.checked)}
        />
        {l("Skapa en risk", "Create a risk")}
      </label>
      {withRisk && (
        <>
          <TextField
            label={l("Riskens rubrik", "Risk title")}
            value={risk.title}
            onChange={(event) => setRisk({ ...risk, title: event.target.value })}
          />
          <TextAreaField
            label={l("Hotscenario", "Threat scenario")}
            value={risk.threatScenario}
            onChange={(event) => setRisk({ ...risk, threatScenario: event.target.value })}
          />
        </>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{l("Åtgärder", "Actions")}</h3>
        {actions.map((action, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_9rem_10rem]">
            <TextField
              label={l("Åtgärd", "Action")}
              value={action.title}
              onChange={(event) =>
                setActions(
                  actions.map((a, i) => (i === index ? { ...a, title: event.target.value } : a)),
                )
              }
            />
            <label className="space-y-2 text-sm">
              <span className="block font-semibold">{l("Prioritet", "Priority")}</span>
              <select
                className={selectClass}
                value={action.priority}
                onChange={(event) =>
                  setActions(
                    actions.map((a, i) =>
                      i === index ? { ...a, priority: event.target.value as typeof a.priority } : a,
                    ),
                  )
                }
              >
                <option value="low">{l("Låg", "Low")}</option>
                <option value="medium">{l("Medel", "Medium")}</option>
                <option value="high">{l("Hög", "High")}</option>
                <option value="urgent">{l("Brådskande", "Urgent")}</option>
              </select>
            </label>
            <TextField
              label={l("Senast", "Due")}
              type="date"
              min={today()}
              value={action.dueDate}
              onChange={(event) =>
                setActions(
                  actions.map((a, i) => (i === index ? { ...a, dueDate: event.target.value } : a)),
                )
              }
            />
          </div>
        ))}
        <WorkButton
          type="button"
          variant="ghost"
          onClick={() => setActions([...actions, { title: "", priority: "medium", dueDate: "" }])}
        >
          {l("Lägg till åtgärd", "Add action")}
        </WorkButton>
      </div>
      <WorkError code={apply.error?.message} />
      <WorkButton
        type="submit"
        data-testid="sw-brief-apply-submit"
        disabled={apply.isPending || (!withRisk && !actions.some((a) => a.title.trim()))}
      >
        {l("För in", "Record")}
      </WorkButton>
    </form>
  );
}

function FollowUp({ detail }: { detail: BriefDetail }) {
  const l = useWorkText();
  const { lang } = useT();
  const { workspace } = useSecurityWorkspace();
  const { risk, actions } = detail.followUp;
  return (
    <section className={`${panelClass} space-y-2`} data-testid="sw-brief-followup">
      <h2 className="font-semibold">{l("Uppföljning", "Follow-up")}</h2>
      <p className="text-xs text-muted-foreground">
        {l("Infört", "Recorded")} {formatDate(detail.application?.applied_at ?? null, lang, true)}
      </p>
      {risk && (
        <p className="text-sm">
          {l("Risk", "Risk")}: <span className="font-medium">{risk.title}</span> (
          {followUpStatusLabel(risk.status, lang)})
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {actions.map((action) => (
          <li key={action.id} data-testid="sw-followup-action" data-status={action.status}>
            {action.title} · {followUpStatusLabel(action.status, lang)} · {l("senast", "due")}{" "}
            {formatDate(action.due_date, lang)}
          </li>
        ))}
      </ul>
      <Link
        to="/security-work/$workspaceId/risks"
        params={{ workspaceId: workspace.id }}
        className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline print:hidden"
      >
        {l("Till risker och åtgärder", "To risks and actions")}
      </Link>
    </section>
  );
}

function Flags({ detail }: { detail: BriefDetail }) {
  const l = useWorkText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const navigate = useNavigate();
  const revise = useImpactMutation(useServerFn(reviseSecurityBrief));
  const resolve = useImpactMutation(useServerFn(resolveSecurityFlag));
  const [note, setNote] = useState("");
  const open = detail.flags.filter((flag) => flag.status === "open");
  const revising = detail.revisions.some((r) => r.status === "draft" || r.status === "in_review");
  return (
    <section
      role="status"
      className="space-y-3 rounded-xl border border-amber-600/40 bg-amber-600/10 p-5 print:hidden"
      data-testid="sw-brief-flags"
    >
      <h2 className="font-semibold">
        {l("Ny information sedan godkännandet", "New information since approval")}
      </h2>
      <p className="text-sm">
        {l(
          `${open.length} ny${open.length === 1 ? "" : "a"} post${open.length === 1 ? "" : "er"} i samma händelse. Bedömningen gäller tills den revideras, men kan vara inaktuell.`,
          `${open.length} new item${open.length === 1 ? "" : "s"} in the same story. The brief stands until revised, but may be out of date.`,
        )}
      </p>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          {!revising && (
            <WorkButton
              data-testid="sw-brief-revise"
              disabled={revise.isPending}
              onClick={() =>
                revise.mutate(
                  { data: { workspaceId: workspace.id, briefId: detail.brief.id } },
                  {
                    onSuccess: (next) =>
                      void navigate({
                        to: "/security-work/$workspaceId/impact/$briefId",
                        params: { workspaceId: workspace.id, briefId: (next as ChangeBrief).id },
                      }),
                  },
                )
              }
            >
              {l("Revidera bedömningen", "Revise the brief")}
            </WorkButton>
          )}
          <div className="min-w-64 flex-1">
            <TextField
              label={l("Eller: varför ändrar det inget?", "Or: why does it change nothing?")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <WorkButton
            variant="outline"
            disabled={!note.trim() || resolve.isPending}
            onClick={() =>
              Promise.all(
                open.map((flag) =>
                  resolve.mutateAsync({
                    data: { workspaceId: workspace.id, flagId: flag.id, note },
                  }),
                ),
              ).catch(() => undefined)
            }
          >
            {l("Markera som hanterad", "Mark as handled")}
          </WorkButton>
        </div>
      )}
      <WorkError code={revise.error?.message ?? resolve.error?.message} />
    </section>
  );
}
