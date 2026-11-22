import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  approveSecuritySupplierShare,
  changeSecuritySupplierDue,
  recordSecuritySupplierDispatch,
  recordSecuritySupplierResponse,
  reopenSecuritySupplierRequest,
  setSecurityAssetImpact,
  updateSecuritySupplierRequest,
  verifySecuritySupplierResponse,
  withdrawSecuritySupplierRequest,
} from "@/lib/security-work/suppliers/functions";
import {
  mayVerify,
  nextStep,
  requestTimes,
  shareToMarkdown,
  shareToPrintHtml,
  type ShareContent,
} from "@/lib/security-work/suppliers/model";
import type { RequestDetail as Detail } from "@/lib/security-work/suppliers/services";
import { useSecurityWorkspace } from "../context";
import {
  Field,
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  formatDate,
  panelClass,
  selectClass,
} from "../ui";
import { DecisionLog } from "./DecisionLog";
import {
  RequestStatusBadge,
  useSupplierCommand,
  useSupplierRequest,
  useSupplierText,
  useSupplierWrite,
} from "./supplier-ui";

const today = () => new Date().toISOString().slice(0, 10);
const localNow = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const asIso = (local: string) => new Date(local).toISOString();

function Panel({
  title,
  testId,
  children,
}: {
  title: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${panelClass} space-y-3`} data-testid={testId}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SecuritySupplierRequest({ requestId }: { requestId: string }) {
  const query = useSupplierRequest(requestId);
  const text = useSupplierText();
  const { l } = text;
  const { workspace } = useSecurityWorkspace();
  if (query.isPending) return <LoadingState />;
  if (query.error || !query.data)
    return (
      <div className="space-y-4" data-testid="sw-request-missing">
        <PageHeading
          title={l("Begäran hittades inte", "Request not found")}
          body={text.error("NOT_FOUND")}
        />
        <Link
          to="/security-work/$workspaceId/suppliers"
          params={{ workspaceId: workspace.id }}
          className="text-sm text-primary underline"
        >
          {l("Till leverantörer", "To suppliers")}
        </Link>
      </div>
    );
  return <RequestView detail={query.data} />;
}

function RequestView({ detail }: { detail: Detail }) {
  const { lang } = useT();
  const text = useSupplierText();
  const { l } = text;
  const { workspace, membership, canEdit, user } = useSecurityWorkspace();
  const r = detail.request;
  const step = nextStep(r, today());
  const canApprove = Boolean(membership.can_approve);
  const canShare = Boolean((membership as { can_share_external?: boolean }).can_share_external);
  const latestDone =
    [...detail.responses].reverse().find((x) => x.kind === "done" && x.cycle === r.cycle) ?? null;
  const verifier = mayVerify(r, latestDone, { id: user.id, canApprove });
  const times = requestTimes(
    r,
    detail.events,
    detail.responses,
    detail.verifications,
    new Date().toISOString(),
  );
  const share = detail.shares.at(-1) ?? null;
  const owner = detail.members.find((m) => m.user_id === r.internal_owner_id);
  const open = !["accepted", "withdrawn"].includes(r.status);

  const nowText: Record<string, string> = {
    approve_share: l(
      "Granska innehållet och godkänn den externa versionen. Endast det godkända lämnar plattformen.",
      "Review the content and approve the external version. Only what is approved leaves the platform.",
    ),
    reapprove_share: l(
      "Innehållet har ändrats efter godkännandet. Den delade versionen är inaktuell tills en ny version godkänns.",
      "The content changed after approval. The shared version is out of date until a new version is approved.",
    ),
    record_dispatch: l(
      "Skicka den godkända versionen genom er vanliga kanal och registrera när, hur och till vem.",
      "Send the approved version through your usual channel and record when, how and to whom.",
    ),
    await_supplier: l(
      "Väntar på leverantören. Registrera svar när de kommer in.",
      "Waiting for the supplier. Record responses as they come in.",
    ),
    await_revision: l(
      "Komplettering begärd. Registrera leverantörens nya svar.",
      "Revision requested. Record the supplier's new response.",
    ),
    verify: l(
      "Leverantören uppger att det är klart. Kontrollera underlaget mot kriterierna innan något godkänns.",
      "The supplier reports it done. Check the evidence against the criteria before anything is accepted.",
    ),
    done: l(
      "Verifierad och godkänd. Kvarstående avvikelse och risk syns nedan.",
      "Verified and accepted. Any remaining deviation and risk is shown below.",
    ),
    withdrawn: l("Begäran är återkallad.", "The request is withdrawn."),
  };

  return (
    <div className="space-y-6" data-testid="sw-supplier-request" data-status={r.status}>
      <div className="space-y-2">
        {detail.supplier && (
          <Link
            to="/security-work/$workspaceId/suppliers/$assetId"
            params={{ workspaceId: workspace.id, assetId: detail.supplier.id }}
            className="text-sm text-primary underline"
          >
            ← {detail.supplier.name}
          </Link>
        )}
        <PageHeading
          title={r.title}
          body={`${r.reference} · ${text.basis(r.basis_kind)}${
            detail.action ? ` · ${l("åtgärd", "action")}: ${detail.action.title}` : ""
          }`}
          action={<RequestStatusBadge status={r.status} />}
        />
        <p className="text-xs text-muted-foreground">
          {l("Intern ansvarig", "Internal owner")}: {owner?.label ?? "—"}
          {r.requires_separate_verifier &&
            ` · ${l("kräver separat verifierare", "needs a separate verifier")}`}
          {r.cycle > 1 && ` · ${l("omgång", "cycle")} ${r.cycle}`}
        </p>
      </div>

      <section
        className={`${panelClass} space-y-3 border-primary/40`}
        data-testid="sw-request-now"
        data-step={step.step}
      >
        <h2 className="font-display text-lg font-semibold">{l("Nästa steg", "Next step")}</h2>
        <p className="text-sm">{nowText[step.step]}</p>
        {"overdue" in step && step.overdue && (
          <p className="text-sm font-medium text-destructive" data-testid="sw-request-overdue">
            {l(
              `Leverantörens svar är försenat (gäller till ${r.agreed_due ?? r.requested_due}).`,
              `The supplier's response is overdue (held to ${r.agreed_due ?? r.requested_due}).`,
            )}
          </p>
        )}
        {(step.step === "approve_share" || step.step === "reapprove_share") &&
          (canShare ? (
            <ApproveShare detail={detail} />
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="sw-share-right-missing">
              {text.error("SHARE_RIGHT_REQUIRED")}
            </p>
          ))}
        {step.step === "record_dispatch" && canEdit && <Dispatch detail={detail} />}
        {(step.step === "await_supplier" || step.step === "await_revision") && canEdit && (
          <RecordResponse detail={detail} />
        )}
        {step.step === "verify" &&
          (verifier && latestDone ? (
            <Verify detail={detail} responseId={latestDone.id} />
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="sw-verifier-missing">
              {canApprove
                ? text.error("SEPARATE_VERIFIER_REQUIRED")
                : l(
                    "Verifiering kräver godkännanderätt. Be en godkännare kontrollera svaret.",
                    "Verification needs the approval right. Ask an approver to check the response.",
                  )}
            </p>
          ))}
        {step.step === "verify" && canEdit && <RecordResponse detail={detail} compact />}
        {step.step === "done" && canApprove && <Reopen detail={detail} />}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Panel title={l("Extern version", "External version")} testId="sw-request-share">
            {share ? (
              <ShareView detail={detail} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {l(
                  "Ingen extern version är godkänd ännu. Inget har lämnat plattformen.",
                  "No external version is approved yet. Nothing has left the platform.",
                )}
              </p>
            )}
          </Panel>

          <Panel
            title={l("Svar och verifiering", "Responses and verification")}
            testId="sw-request-responses"
          >
            {detail.responses.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {l("Inga svar registrerade.", "No responses recorded.")}
              </p>
            )}
            <ol className="space-y-3">
              {detail.responses.map((resp) => {
                const v = detail.verifications.find((x) => x.response_id === resp.id);
                return (
                  <li
                    key={resp.id}
                    className="rounded-lg border border-border p-3 text-sm"
                    data-testid="sw-response"
                    data-kind={resp.kind}
                  >
                    <p className="font-medium">
                      {text.response(resp.kind)} · {resp.author_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l("Mottaget", "Received")} {formatDate(resp.received_at, lang, true)} (
                      {text.origin(resp.origin)}) · {l("registrerat av", "recorded by")}{" "}
                      {detail.members.find((m) => m.user_id === resp.recorded_by)?.label ?? "—"}
                      {resp.cycle > 1 && ` · ${l("omgång", "cycle")} ${resp.cycle}`}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words">{resp.body}</p>
                    {resp.evidence_source_ids.length > 0 && (
                      <p className="mt-1 text-xs">
                        {l("Underlag", "Evidence")}:{" "}
                        {resp.evidence_source_ids
                          .map((id) => detail.sources.find((s) => s.id === id)?.name ?? id)
                          .join(", ")}
                      </p>
                    )}
                    {v && (
                      <p
                        className="mt-2 rounded-md bg-secondary p-2 text-xs"
                        data-testid="sw-verification"
                        data-outcome={v.outcome}
                      >
                        <strong>
                          {v.outcome === "accepted"
                            ? l("Godkänt", "Accepted")
                            : l("Komplettering begärd", "Revision requested")}
                        </strong>{" "}
                        {l("av", "by")}{" "}
                        {detail.members.find((m) => m.user_id === v.verified_by)?.label ?? "—"} ·{" "}
                        {v.criteria_checked}
                        {v.remaining_deviation &&
                          ` · ${l("kvarstår", "remaining")}: ${v.remaining_deviation}`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </Panel>

          <DecisionLog
            subjectKind="supplier_request"
            subjectId={r.id}
            decisions={detail.decisions}
            members={detail.members}
            hint={l(
              "En invändning eller en offert ändrar inte er kvarstående risk. Dokumentera beslut om omfattning, kostnad eller tillfälligt skydd här.",
              "An objection or a quote does not change your remaining risk. Record decisions on scope, cost or temporary protection here.",
            )}
          />

          {detail.impacts.length > 0 && <Impacts detail={detail} />}

          {canEdit && open && <EditContent detail={detail} />}

          <Panel title={l("Historik", "History")} testId="sw-request-history">
            <ol className="space-y-1 text-sm">
              {detail.events.map((e) => (
                <li key={e.id} data-testid="sw-request-event" data-event={e.event}>
                  <span className="text-muted-foreground">
                    {formatDate(e.created_at, lang, true)}
                  </span>{" "}
                  · {text.event(e.event)}
                  {e.event === "due_changed" &&
                    ` (${String((e.details as { from?: string }).from ?? "—")} → ${String(
                      (e.details as { to?: string }).to ?? "—",
                    )}: ${String((e.details as { reason?: string }).reason ?? "")})`}
                  {e.event === "dispatched" &&
                    ` (${text.origin(String((e.details as { channel?: string }).channel))}, ${String(
                      (e.details as { recipient?: string }).recipient,
                    )})`}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <Panel title={l("Datum", "Dates")} testId="sw-request-dates">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{l("Er begäran", "Requested")}</dt>
              <dd>{r.requested_due}</dd>
              <dt className="text-muted-foreground">
                {l("Leverantörens förslag", "Supplier proposes")}
              </dt>
              <dd>{r.supplier_proposed_due ?? "—"}</dd>
              <dt className="text-muted-foreground">{l("Överenskommet", "Agreed")}</dt>
              <dd>{r.agreed_due ?? l("inte överenskommet", "not agreed")}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              {l(
                "Kalenderdagar. En intern deadline är inte ett avtalat SLA.",
                "Calendar days. An internal deadline is not a contractual SLA.",
              )}
            </p>
            {canEdit && open && (
              // Follows the supplier's latest proposal as the suggested date.
              <ChangeDue key={r.supplier_proposed_due ?? "none"} detail={detail} />
            )}
          </Panel>
          <Panel title={l("Tid per part", "Time per party")} testId="sw-request-times">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">
                {l("Leverantörens första svar", "Supplier's first response")}
              </dt>
              <dd>
                {times.firstResponseHours === null
                  ? l("underlag saknas", "no data")
                  : `${times.firstResponseHours} h`}
              </dd>
              <dt className="text-muted-foreground">{l("Er verifiering", "Your verification")}</dt>
              <dd>
                {times.verificationWaitHours === null
                  ? l("underlag saknas", "no data")
                  : `${times.verificationWaitHours} h${
                      times.verificationPending ? ` (${l("pågår", "ongoing")})` : ""
                    }`}
              </dd>
              <dt className="text-muted-foreground">{l("Kompletteringar", "Revisions")}</dt>
              <dd>{times.revisions}</dd>
            </dl>
          </Panel>
          {detail.siblings.length > 0 && (
            <Panel title={l("Fler begäranden i åtgärden", "More requests in the action")}>
              <ul className="space-y-1 text-sm">
                {detail.siblings.map((s) => (
                  <li key={s.id}>
                    <Link
                      to="/security-work/$workspaceId/supplier-requests/$requestId"
                      params={{ workspaceId: workspace.id, requestId: s.id }}
                      className="text-primary underline"
                    >
                      {s.reference}
                    </Link>{" "}
                    · {text.status(s.status)}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {l(
                  "Åtgärden kan avslutas först när varje begäran är verifierad eller återkallad.",
                  "The action can be completed only when every request is verified or withdrawn.",
                )}
              </p>
            </Panel>
          )}
          {canEdit && open && <Withdraw detail={detail} />}
        </aside>
      </div>
    </div>
  );
}

function ShareView({ detail }: { detail: Detail }) {
  const { lang } = useT();
  const { l } = useSupplierText();
  const share = detail.shares.at(-1)!;
  const content = share.content as unknown as ShareContent;
  const markdown = shareToMarkdown(
    content,
    {
      shareVersion: share.share_version,
      recipient: share.recipient,
      approvedAt: share.approved_at,
    },
    lang,
  );
  // Printed from its own frame holding only the approved version: the
  // request page around it (decisions, criteria, history) is never printed.
  const print = () => {
    document.getElementById("sw-share-print")?.remove();
    const frame = document.createElement("iframe");
    frame.id = "sw-share-print";
    frame.name = "sw-share-print";
    frame.title = content.reference;
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    frame.onload = () => frame.contentWindow?.print();
    frame.srcdoc = shareToPrintHtml(
      content,
      {
        shareVersion: share.share_version,
        recipient: share.recipient,
        approvedAt: share.approved_at,
      },
      lang,
    );
    document.body.appendChild(frame);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${content.reference}-v${share.share_version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      {detail.request.share_stale && (
        <p
          className="text-sm font-medium text-amber-800 dark:text-amber-200"
          data-testid="sw-share-stale"
        >
          {l(
            "Innehållet har ändrats sedan denna version godkändes. Mottagaren har den här versionen; den ändras inte i efterhand.",
            "The content has changed since this version was approved. The recipient has this version; it never changes afterwards.",
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {l("Version", "Version")} {share.share_version} · {l("till", "to")} {share.recipient} ·{" "}
        {share.purpose} · {l("godkänd", "approved")} {formatDate(share.approved_at, lang, true)}
      </p>
      <pre
        className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-3 text-xs"
        data-testid="sw-share-preview"
      >
        {markdown}
      </pre>
      <div className="flex flex-wrap gap-2">
        <WorkButton variant="outline" onClick={download} data-testid="sw-share-download">
          {l("Ladda ner (Markdown)", "Download (Markdown)")}
        </WorkButton>
        <WorkButton variant="outline" onClick={print} data-testid="sw-share-print">
          {l("Skriv ut extern version", "Print external version")}
        </WorkButton>
      </div>
    </div>
  );
}

function ApproveShare({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  const last = detail.shares.at(-1);
  const [recipient, setRecipient] = useState(last?.recipient ?? "");
  const [purpose, setPurpose] = useState(last?.purpose ?? "");
  const run = useSupplierCommand(useServerFn(approveSecuritySupplierShare));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    run.mutate({
      workspaceId: workspace.id,
      requestId: detail.request.id,
      version: detail.request.version,
      recipient,
      purpose,
    });
  };
  return (
    <form className="space-y-3" onSubmit={submit} data-testid="sw-approve-share">
      <TextField
        label={l("Mottagare", "Recipient")}
        hint={l(
          "Vem versionen delas med, t.ex. leverantörens support.",
          "Who the version is shared with, e.g. the supplier's support.",
        )}
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        required
      />
      <TextField
        label={l("Ändamål", "Purpose")}
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        required
      />
      <WorkError code={run.error?.message} message={error(run.error?.message)} />
      <WorkButton type="submit" disabled={run.isPending}>
        {l("Godkänn extern version", "Approve external version")}
      </WorkButton>
    </form>
  );
}

function Dispatch({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  const [channel, setChannel] = useState("email");
  const [recipient, setRecipient] = useState(detail.shares.at(-1)?.recipient ?? "");
  const [sentAt, setSentAt] = useState(localNow());
  const run = useSupplierCommand(useServerFn(recordSecuritySupplierDispatch));
  return (
    <form
      className="space-y-3"
      data-testid="sw-record-dispatch"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate({
          workspaceId: workspace.id,
          requestId: detail.request.id,
          version: detail.request.version,
          channel: channel as never,
          recipient,
          sentAt: asIso(sentAt),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={l("Kanal", "Channel")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {["email", "letter", "phone", "meeting", "other"].map((c) => (
                <option key={c} value={c}>
                  {channelLabel(c, l)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <TextField
          label={l("Skickat till", "Sent to")}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          required
        />
        <TextField
          label={l("Skickat", "Sent")}
          type="datetime-local"
          value={sentAt}
          onChange={(e) => setSentAt(e.target.value)}
          required
        />
      </div>
      <WorkError code={run.error?.message} message={error(run.error?.message)} />
      <WorkButton type="submit" disabled={run.isPending}>
        {l("Registrera utskick", "Record dispatch")}
      </WorkButton>
    </form>
  );
}
const channelLabel = (c: string, l: (sv: string, en: string) => string) =>
  ({
    email: l("E-post", "Email"),
    letter: l("Brev", "Letter"),
    phone: l("Telefon", "Phone"),
    meeting: l("Möte", "Meeting"),
    other: l("Annat", "Other"),
  })[c] ?? c;

function RecordResponse({ detail, compact = false }: { detail: Detail; compact?: boolean }) {
  const text = useSupplierText();
  const { l } = text;
  const { workspace } = useSecurityWorkspace();
  const [kind, setKind] = useState(compact ? "question" : "plan");
  const [authorName, setAuthor] = useState("");
  const [origin, setOrigin] = useState("email");
  const [body, setBody] = useState("");
  const [receivedAt, setReceivedAt] = useState(localNow());
  const [claimedDoneAt, setClaimed] = useState("");
  const [proposedDue, setProposed] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const run = useSupplierCommand(useServerFn(recordSecuritySupplierResponse));
  const form = (
    <form
      className="space-y-3"
      data-testid="sw-record-response"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate(
          {
            workspaceId: workspace.id,
            requestId: detail.request.id,
            version: detail.request.version,
            kind: kind as never,
            authorName,
            origin: origin as never,
            body,
            receivedAt: asIso(receivedAt),
            claimedDoneAt: kind === "done" && claimedDoneAt ? asIso(claimedDoneAt) : null,
            proposedDue: proposedDue || null,
            evidenceSourceIds: evidence,
          },
          {
            onSuccess: () => {
              setBody("");
              setEvidence([]);
              setClaimed("");
            },
          },
        );
      }}
    >
      <p className="text-xs text-muted-foreground">
        {l(
          "Svaret togs emot utanför plattformen. Du registrerar det; leverantören är inte inloggad här.",
          "The response was received outside the platform. You record it; the supplier is not signed in here.",
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={l("Typ av svar", "Kind of response")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {["acknowledged", "plan", "question", "objection", "done"].map((k) => (
                <option key={k} value={k}>
                  {text.response(k)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <TextField
          label={l("Avsändare enligt svaret", "Sender as stated")}
          value={authorName}
          onChange={(e) => setAuthor(e.target.value)}
          required
        />
        <Field label={l("Kom via", "Came by")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              {["email", "phone", "meeting", "letter", "other"].map((k) => (
                <option key={k} value={k}>
                  {text.origin(k)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <TextAreaField
        label={l("Vad leverantören svarade", "What the supplier said")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label={l("Mottaget", "Received")}
          type="datetime-local"
          value={receivedAt}
          onChange={(e) => setReceivedAt(e.target.value)}
          required
        />
        {kind === "done" && (
          <TextField
            label={l("Uppgivet utfört", "Stated as done")}
            type="datetime-local"
            value={claimedDoneAt}
            onChange={(e) => setClaimed(e.target.value)}
          />
        )}
        <TextField
          label={l("Leverantörens föreslagna datum", "Supplier's proposed date")}
          type="date"
          value={proposedDue}
          onChange={(e) => setProposed(e.target.value)}
        />
      </div>
      {detail.sources.length > 0 && (
        <Field
          label={l("Bifogat underlag", "Attached evidence")}
          hint={l(
            "Lägg först till underlaget under Underlag.",
            "Add the evidence under Evidence first.",
          )}
        >
          {(id, hint) => (
            <select
              id={id}
              aria-describedby={hint}
              multiple
              className={`${selectClass} min-h-24`}
              value={evidence}
              onChange={(e) => setEvidence([...e.target.selectedOptions].map((o) => o.value))}
            >
              {detail.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {kind === "done" && (
        <p className="text-xs text-muted-foreground">
          {l(
            "”Klart” avslutar ingenting. Det går till verifiering hos er.",
            "“Done” closes nothing. It goes to your verification.",
          )}
        </p>
      )}
      <WorkError code={run.error?.message} message={text.error(run.error?.message)} />
      <WorkButton type="submit" disabled={run.isPending}>
        {l("Registrera svar", "Record response")}
      </WorkButton>
    </form>
  );
  return compact ? (
    <details>
      <summary className="cursor-pointer text-sm text-primary">
        {l("Registrera ytterligare svar", "Record another response")}
      </summary>
      <div className="mt-3">{form}</div>
    </details>
  ) : (
    form
  );
}

function Verify({ detail, responseId }: { detail: Detail; responseId: string }) {
  const { l, error } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  const [criteria, setCriteria] = useState("");
  const [evidence, setEvidence] = useState("");
  const [remaining, setRemaining] = useState("");
  const run = useSupplierCommand(useServerFn(verifySecuritySupplierResponse));
  const send = (outcome: "accepted" | "needs_revision") =>
    run.mutate({
      workspaceId: workspace.id,
      requestId: detail.request.id,
      version: detail.request.version,
      responseId,
      outcome,
      criteriaChecked: criteria,
      checkedEvidence: evidence,
      remainingDeviation: remaining,
    });
  return (
    <form className="space-y-3" data-testid="sw-verify" onSubmit={(e) => e.preventDefault()}>
      <div className="rounded-md bg-secondary p-3 text-sm">
        <p className="font-semibold">{l("Kriterier", "Criteria")}</p>
        <p className="whitespace-pre-wrap">{detail.request.verification_criteria}</p>
      </div>
      <TextAreaField
        label={l("Vad du kontrollerade mot kriterierna", "What you checked against the criteria")}
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        required
      />
      <TextField
        label={l("Kontrollerat underlag", "Evidence checked")}
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
      />
      <TextField
        label={l("Kvarstående avvikelse", "Remaining deviation")}
        value={remaining}
        onChange={(e) => setRemaining(e.target.value)}
      />
      <WorkError code={run.error?.message} message={error(run.error?.message)} />
      <div className="flex flex-wrap gap-2">
        <WorkButton
          type="button"
          disabled={run.isPending || !criteria.trim()}
          onClick={() => send("accepted")}
          data-testid="sw-verify-accept"
        >
          {l("Godkänn svaret", "Accept the response")}
        </WorkButton>
        <WorkButton
          type="button"
          variant="outline"
          disabled={run.isPending || !criteria.trim()}
          onClick={() => send("needs_revision")}
          data-testid="sw-verify-revise"
        >
          {l("Begär komplettering", "Request a revision")}
        </WorkButton>
      </div>
    </form>
  );
}

function ReasonForm({
  label,
  action,
  testId,
  run,
}: {
  label: string;
  action: string;
  testId: string;
  run: { mutate: (reason: string) => void; isPending: boolean; error: Error | null };
}) {
  const { error } = useSupplierText();
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-2"
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate(reason);
      }}
    >
      <TextField
        label={label}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
      />
      <WorkError code={run.error?.message} message={error(run.error?.message)} />
      <WorkButton type="submit" variant="outline" disabled={run.isPending}>
        {action}
      </WorkButton>
    </form>
  );
}

function Reopen({ detail }: { detail: Detail }) {
  const { l } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  const run = useSupplierCommand(useServerFn(reopenSecuritySupplierRequest));
  return (
    <details>
      <summary className="cursor-pointer text-sm text-primary">{l("Återöppna", "Reopen")}</summary>
      <div className="mt-3">
        <ReasonForm
          testId="sw-reopen"
          label={l("Varför återöppnas begäran?", "Why reopen the request?")}
          action={l("Återöppna i ny omgång", "Reopen in a new cycle")}
          run={{
            ...run,
            mutate: (reason) =>
              run.mutate({
                workspaceId: workspace.id,
                requestId: detail.request.id,
                version: detail.request.version,
                reason,
              }),
          }}
        />
      </div>
    </details>
  );
}

function Withdraw({ detail }: { detail: Detail }) {
  const { l } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  const run = useSupplierCommand(useServerFn(withdrawSecuritySupplierRequest));
  return (
    <section className={`${panelClass} space-y-2`}>
      <details>
        <summary className="cursor-pointer text-sm">
          {l("Återkalla begäran", "Withdraw the request")}
        </summary>
        <div className="mt-3">
          <ReasonForm
            testId="sw-withdraw"
            label={l("Motivering", "Reason")}
            action={l("Återkalla", "Withdraw")}
            run={{
              ...run,
              mutate: (reason) =>
                run.mutate({
                  workspaceId: workspace.id,
                  requestId: detail.request.id,
                  version: detail.request.version,
                  reason,
                }),
            }}
          />
        </div>
      </details>
    </section>
  );
}

function ChangeDue({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  const [which, setWhich] = useState<"agreed" | "requested">("agreed");
  const [due, setDue] = useState(detail.request.supplier_proposed_due ?? "");
  const [reason, setReason] = useState("");
  const run = useSupplierCommand(useServerFn(changeSecuritySupplierDue));
  return (
    <details>
      <summary className="cursor-pointer text-sm text-primary">
        {l("Ändra datum", "Change a date")}
      </summary>
      <form
        className="mt-3 space-y-2"
        data-testid="sw-change-due"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate({
            workspaceId: workspace.id,
            requestId: detail.request.id,
            version: detail.request.version,
            which,
            due: due || null,
            reason,
          });
        }}
      >
        <Field label={l("Vilket datum", "Which date")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={which}
              onChange={(e) => setWhich(e.target.value as "agreed" | "requested")}
            >
              <option value="agreed">{l("Överenskommet", "Agreed")}</option>
              <option value="requested">{l("Er begäran", "Requested")}</option>
            </select>
          )}
        </Field>
        <TextField
          label={l("Nytt datum", "New date")}
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          required
        />
        <TextField
          label={l("Motivering", "Reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        <WorkError code={run.error?.message} message={error(run.error?.message)} />
        <WorkButton type="submit" variant="outline" disabled={run.isPending}>
          {l("Spara datum", "Save date")}
        </WorkButton>
      </form>
    </details>
  );
}

function Impacts({ detail }: { detail: Detail }) {
  const text = useSupplierText();
  const { l } = text;
  const { workspace, canEdit } = useSecurityWorkspace();
  const run = useSupplierWrite(useServerFn(setSecurityAssetImpact));
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <Panel title={l("Berörd verksamhet", "Affected business")} testId="sw-request-impacts">
      <ul className="space-y-3">
        {detail.impacts.map((i) => (
          <li
            key={i.id}
            className="space-y-1 text-sm"
            data-testid="sw-impact"
            data-status={i.impact_status}
          >
            <p>
              <strong>{i.asset}</strong> · {text.impact(i.impact_status)}
              {i.impact_note && ` · ${i.impact_note}`}
            </p>
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <TextField
                  label={l("Vad kontrollerades", "What was checked")}
                  value={notes[i.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })}
                />
                {(["confirmed", "ruled_out"] as const).map((status) => (
                  <WorkButton
                    key={status}
                    variant="outline"
                    disabled={run.isPending}
                    onClick={() =>
                      run.mutate({
                        workspaceId: workspace.id,
                        linkId: i.id,
                        status,
                        note: notes[i.id] ?? "",
                      })
                    }
                  >
                    {status === "confirmed"
                      ? l("Bekräfta påverkan", "Confirm impact")
                      : l("Utesluten", "Rule out")}
                  </WorkButton>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <WorkError code={run.error?.message} message={text.error(run.error?.message)} />
    </Panel>
  );
}

function EditContent({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  const r = detail.request;
  const [f, setF] = useState({
    title: r.title,
    task: r.task,
    expectedResult: r.expected_result,
    responseInstruction: r.response_instruction,
    verificationCriteria: r.verification_criteria,
    internalOwnerId: r.internal_owner_id,
    requiresSeparateVerifier: r.requires_separate_verifier,
  });
  const run = useSupplierCommand(useServerFn(updateSecuritySupplierRequest));
  return (
    <section className={`${panelClass} space-y-3`}>
      <details>
        <summary className="cursor-pointer font-display text-lg font-semibold">
          {l("Innehåll", "Content")}
        </summary>
        <form
          className="mt-3 space-y-3"
          data-testid="sw-edit-request"
          onSubmit={(e) => {
            e.preventDefault();
            run.mutate({ workspaceId: workspace.id, requestId: r.id, version: r.version, ...f });
          }}
        >
          {r.share_version !== null && (
            <p className="text-xs text-muted-foreground">
              {l(
                "Ändrar du det som delas externt blir den delade versionen inaktuell och behöver godkännas på nytt.",
                "Changing what is shared externally makes the shared version out of date; it then needs approval again.",
              )}
            </p>
          )}
          <TextField
            label={l("Rubrik", "Title")}
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            required
          />
          <TextAreaField
            label={l("Uppgift (delas)", "Task (shared)")}
            value={f.task}
            onChange={(e) => setF({ ...f, task: e.target.value })}
            required
          />
          <TextAreaField
            label={l("Förväntat resultat (delas)", "Expected result (shared)")}
            value={f.expectedResult}
            onChange={(e) => setF({ ...f, expectedResult: e.target.value })}
            required
          />
          <TextField
            label={l("Svarsinstruktion (delas)", "Response instruction (shared)")}
            value={f.responseInstruction}
            onChange={(e) => setF({ ...f, responseInstruction: e.target.value })}
          />
          <TextAreaField
            label={l("Verifieringskriterier (internt)", "Verification criteria (internal)")}
            value={f.verificationCriteria}
            onChange={(e) => setF({ ...f, verificationCriteria: e.target.value })}
            required
          />
          <Field label={l("Intern ansvarig", "Internal owner")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={f.internalOwnerId}
                onChange={(e) => setF({ ...f, internalOwnerId: e.target.value })}
              >
                {detail.members
                  .filter((m) => m.role !== "viewer")
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.label}
                    </option>
                  ))}
              </select>
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.requiresSeparateVerifier}
              onChange={(e) => setF({ ...f, requiresSeparateVerifier: e.target.checked })}
            />
            {l(
              "Kritiskt ärende: kräver separat verifierare",
              "Critical: needs a separate verifier",
            )}
          </label>
          <WorkError code={run.error?.message} message={error(run.error?.message)} />
          <WorkButton type="submit" disabled={run.isPending}>
            {l("Spara innehåll", "Save content")}
          </WorkButton>
        </form>
      </details>
    </section>
  );
}
