import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  addSecurityDependency,
  addSecuritySupplierContract,
  addSecuritySupplierObligation,
  changeSecurityDependency,
  changeSecuritySupplierObligation,
  createSecuritySupplierRequest,
  saveSecuritySupplierProfile,
  saveSecuritySupplierReview,
  verifySecuritySupplierContract,
} from "@/lib/security-work/suppliers/functions";
import {
  dueDate,
  isOpen,
  supplierFigures,
  supplierOverdue,
  type Ratio,
} from "@/lib/security-work/suppliers/model";
import type { SupplierDetail as Detail } from "@/lib/security-work/suppliers/services";
import { useSecurityWorkspace } from "../context";
import {
  Field,
  LoadingState,
  PageHeading,
  TextAreaField,
  TextField,
  WorkButton,
  WorkError,
  panelClass,
  selectClass,
} from "../ui";
import {
  RequestStatusBadge,
  useSupplier,
  useSupplierCommand,
  useSupplierText,
  useSupplierWrite,
} from "./supplier-ui";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function Section({
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

export function SecuritySupplier({ assetId }: { assetId: string }) {
  const query = useSupplier(assetId);
  const { l } = useSupplierText();
  const { workspace } = useSecurityWorkspace();
  if (query.isPending) return <LoadingState />;
  if (!query.data)
    return (
      <div className="space-y-4" data-testid="sw-supplier-missing">
        <PageHeading
          title={l("Leverantören hittades inte", "Supplier not found")}
          body={l(
            "Den finns inte eller är inte tillgänglig för dig.",
            "It does not exist or is not available to you.",
          )}
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
  return <SupplierView detail={query.data} />;
}

function SupplierView({ detail }: { detail: Detail }) {
  const text = useSupplierText();
  const { l } = text;
  const { workspace } = useSecurityWorkspace();
  const today = iso(new Date());
  const assetName = (id: string) => detail.assets.find((a) => a.id === id)?.name ?? "—";
  return (
    <div className="space-y-6" data-testid="sw-supplier-detail">
      <Link
        to="/security-work/$workspaceId/suppliers"
        params={{ workspaceId: workspace.id }}
        className="text-sm text-primary underline"
      >
        ← {l("Leverantörer", "Suppliers")}
      </Link>
      <PageHeading title={detail.asset.name} body={detail.profile?.services || undefined} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section title={l("Begäranden", "Requests")} testId="sw-supplier-requests">
            {detail.requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {l(
                  "Inga begäranden ännu. Skapa en från en befintlig åtgärd nedan.",
                  "No requests yet. Create one from an existing action below.",
                )}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {detail.requests.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                    data-testid="sw-supplier-request-row"
                  >
                    <div className="min-w-0">
                      <Link
                        to="/security-work/$workspaceId/supplier-requests/$requestId"
                        params={{ workspaceId: workspace.id, requestId: r.id }}
                        className="font-medium text-primary underline"
                      >
                        {r.reference} · {r.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {text.basis(r.basis_kind)} · {l("gäller till", "held to")} {dueDate(r)}
                        {supplierOverdue(r, today) && (
                          <span className="font-semibold text-destructive">
                            {" "}
                            · {l("försenat", "overdue")}
                          </span>
                        )}
                      </p>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
            <NewRequest detail={detail} />
          </Section>
          <Contracts detail={detail} />
          <Obligations detail={detail} />
          <Reviews detail={detail} />
        </div>
        <aside className="min-w-0 space-y-6">
          <Profile detail={detail} />
          <Figures detail={detail} />
          <Section title={l("Relationer", "Relations")} testId="sw-supplier-relations">
            {detail.dependencies.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {l("Inga relationer registrerade.", "No relations recorded.")}
              </p>
            )}
            <ul className="space-y-2 text-sm">
              {detail.dependencies.map((d) => (
                <Relation
                  key={d.id}
                  detail={detail}
                  dependency={d}
                  label={`${assetName(d.from_asset_id)} ${text.relation(d.relation)} ${assetName(d.to_asset_id)}`}
                />
              ))}
            </ul>
            <AddRelation detail={detail} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Profile({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const p = detail.profile;
  const [f, setF] = useState({
    internalOwnerId: p?.internal_owner_id ?? "",
    contactRoute: p?.contact_route ?? "",
    services: p?.services ?? "",
    status: (p?.status ?? "active") as "active" | "ended",
  });
  const run = useSupplierWrite(useServerFn(saveSecuritySupplierProfile));
  return (
    <Section title={l("Profil", "Profile")} testId="sw-supplier-profile">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate({
            workspaceId: workspace.id,
            assetId: detail.asset.id,
            name: "",
            ...f,
            internalOwnerId: f.internalOwnerId || null,
          });
        }}
      >
        <Field label={l("Intern ansvarig", "Internal owner")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              disabled={!canEdit}
              value={f.internalOwnerId}
              onChange={(e) => setF({ ...f, internalOwnerId: e.target.value })}
            >
              <option value="">{l("Ingen utsedd", "None assigned")}</option>
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
        <TextField
          label={l("Kontaktväg", "Contact route")}
          disabled={!canEdit}
          value={f.contactRoute}
          onChange={(e) => setF({ ...f, contactRoute: e.target.value })}
        />
        <TextAreaField
          label={l("Levererade tjänster", "Services delivered")}
          disabled={!canEdit}
          value={f.services}
          onChange={(e) => setF({ ...f, services: e.target.value })}
        />
        <Field label={l("Status", "Status")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              disabled={!canEdit}
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value as "active" | "ended" })}
            >
              <option value="active">{l("Aktiv", "Active")}</option>
              <option value="ended">{l("Avslutad", "Ended")}</option>
            </select>
          )}
        </Field>
        <WorkError code={run.error?.message} message={error(run.error?.message)} />
        {canEdit && (
          <WorkButton type="submit" variant="outline" disabled={run.isPending}>
            {l("Spara profil", "Save profile")}
          </WorkButton>
        )}
      </form>
    </Section>
  );
}

function Relation({
  detail,
  dependency,
  label,
}: {
  detail: Detail;
  dependency: Detail["dependencies"][number];
  label: string;
}) {
  const { l } = useSupplierText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const run = useSupplierWrite(useServerFn(changeSecurityDependency));
  void detail;
  return (
    <li className="space-y-1" data-testid="sw-relation" data-confirmed={dependency.confirmed}>
      <p>
        {label} ·{" "}
        {dependency.confirmed
          ? `${l("bekräftad", "confirmed")} ${dependency.last_verified_at?.slice(0, 10) ?? ""}`
          : l("obekräftad", "unconfirmed")}
      </p>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <WorkButton
            variant="outline"
            size="sm"
            onClick={() =>
              run.mutate({
                workspaceId: workspace.id,
                dependencyId: dependency.id,
                confirmed: true,
              })
            }
          >
            {dependency.confirmed ? l("Bekräfta igen", "Re-confirm") : l("Bekräfta", "Confirm")}
          </WorkButton>
          <WorkButton
            variant="ghost"
            size="sm"
            onClick={() => run.mutate({ workspaceId: workspace.id, dependencyId: dependency.id })}
          >
            {l("Ta bort", "Remove")}
          </WorkButton>
        </div>
      )}
    </li>
  );
}

function AddRelation({ detail }: { detail: Detail }) {
  const text = useSupplierText();
  const { l } = text;
  const { workspace, canEdit } = useSecurityWorkspace();
  const [from, setFrom] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const run = useSupplierWrite(useServerFn(addSecurityDependency));
  if (!canEdit) return null;
  return (
    <form
      className="space-y-2 border-t border-border pt-3"
      data-testid="sw-add-relation"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate(
          {
            workspaceId: workspace.id,
            fromAssetId: from,
            toAssetId: detail.asset.id,
            relation: "supplied_by",
            sourceNote: note,
            confirmed,
          },
          { onSuccess: () => setFrom("") },
        );
      }}
    >
      <Field
        label={l(
          "Skyddsvärde som levereras av denna leverantör",
          "Asset supplied by this supplier",
        )}
      >
        {(id) => (
          <select
            id={id}
            className={selectClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          >
            <option value="">{l("Välj…", "Choose…")}</option>
            {detail.assets
              .filter((a) => a.id !== detail.asset.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        )}
      </Field>
      <TextField
        label={l("Källa för uppgiften", "Source of the information")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {l("Jag har bekräftat relationen", "I have confirmed the relation")}
      </label>
      <WorkError code={run.error?.message} message={text.error(run.error?.message)} />
      <WorkButton type="submit" variant="outline" disabled={run.isPending}>
        {l("Lägg till relation", "Add relation")}
      </WorkButton>
    </form>
  );
}

function Contracts({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace, canEdit, membership } = useSecurityWorkspace();
  const [f, setF] = useState({
    contractKey: "",
    title: "",
    validFrom: "",
    validTo: "",
    documentRef: "",
    summary: "",
  });
  const add = useSupplierWrite(useServerFn(addSecuritySupplierContract));
  const verify = useSupplierWrite(useServerFn(verifySecuritySupplierContract));
  return (
    <Section title={l("Avtal", "Contracts")} testId="sw-supplier-contracts">
      {detail.contracts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {l(
            "Inga avtal registrerade. Utan verifierat avtal kan en begäran bara bygga på information, avvikelse eller beställning.",
            "No contracts recorded. Without a verified contract a request can only rest on information, a deviation or an order.",
          )}
        </p>
      )}
      <ul className="space-y-2 text-sm">
        {detail.contracts.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2"
            data-testid="sw-contract"
            data-verified={c.verified}
          >
            <span>
              {c.contract_key} v{c.contract_version} · {c.title}
              {c.document_ref && ` · ${c.document_ref}`} ·{" "}
              {c.verified ? l("verifierat", "verified") : l("ej verifierat", "not verified")}
            </span>
            {!c.verified && membership.can_approve && (
              <WorkButton
                variant="outline"
                size="sm"
                disabled={verify.isPending}
                onClick={() => verify.mutate({ workspaceId: workspace.id, contractId: c.id })}
              >
                {l("Verifiera", "Verify")}
              </WorkButton>
            )}
          </li>
        ))}
      </ul>
      <WorkError code={verify.error?.message} message={error(verify.error?.message)} />
      {canEdit && (
        <details>
          <summary className="cursor-pointer text-sm text-primary">
            {l("Registrera avtal eller ny version", "Record a contract or a new version")}
          </summary>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            data-testid="sw-add-contract"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate({
                workspaceId: workspace.id,
                supplierAssetId: detail.asset.id,
                ...f,
                validFrom: f.validFrom || null,
                validTo: f.validTo || null,
              });
            }}
          >
            <TextField
              label={l("Avtalsbeteckning", "Contract key")}
              hint={l("Samma beteckning ger en ny version.", "The same key gives a new version.")}
              value={f.contractKey}
              onChange={(e) => setF({ ...f, contractKey: e.target.value })}
              required
            />
            <TextField
              label={l("Titel", "Title")}
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              required
            />
            <TextField
              label={l("Gäller från", "Valid from")}
              type="date"
              value={f.validFrom}
              onChange={(e) => setF({ ...f, validFrom: e.target.value })}
            />
            <TextField
              label={l("Gäller till", "Valid to")}
              type="date"
              value={f.validTo}
              onChange={(e) => setF({ ...f, validTo: e.target.value })}
            />
            <TextField
              label={l("Dokumentreferens", "Document reference")}
              value={f.documentRef}
              onChange={(e) => setF({ ...f, documentRef: e.target.value })}
            />
            <WorkError code={add.error?.message} message={error(add.error?.message)} />
            <div className="sm:col-span-2">
              <WorkButton type="submit" variant="outline" disabled={add.isPending}>
                {l("Registrera", "Record")}
              </WorkButton>
            </div>
          </form>
        </details>
      )}
    </Section>
  );
}

function Obligations({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace, canEdit, membership } = useSecurityWorkspace();
  const empty = {
    contractId: "",
    clause: "",
    basisNote: "",
    scope: "",
    expectedResult: "",
    verificationMethod: "",
    timeRule: "",
    responseDays: "",
  };
  const [f, setF] = useState(empty);
  const add = useSupplierWrite(useServerFn(addSecuritySupplierObligation));
  const change = useSupplierWrite(useServerFn(changeSecuritySupplierObligation));
  return (
    <Section title={l("Krav", "Requirements")} testId="sw-supplier-obligations">
      <p className="text-xs text-muted-foreground">
        {l(
          "Ett krav blir bindande först när en godkännare har bekräftat klausul, tolkning och tidsregel. Ett uppladdat avtal eller ett AI-förslag är aldrig ett fastställt krav.",
          "A requirement binds only once an approver has confirmed clause, interpretation and time rule. An uploaded contract or an AI suggestion is never an established requirement.",
        )}
      </p>
      <ul className="space-y-2 text-sm">
        {detail.obligations.map((o) => {
          const c = detail.contracts.find((x) => x.id === o.contract_id);
          return (
            <li
              key={o.id}
              className="rounded-md border border-border p-3"
              data-testid="sw-obligation"
              data-confirmed={o.confirmed}
            >
              <p className="font-medium">
                {c
                  ? `${c.contract_key} v${c.contract_version} § ${o.clause}`
                  : l("Intern kravgrund", "Internal basis")}{" "}
                · {o.scope}
              </p>
              <p className="text-xs text-muted-foreground">
                {o.expected_result} · {l("verifieras genom", "verified by")}:{" "}
                {o.verification_method}
                {o.time_rule && ` · ${o.time_rule}`}
                {o.response_days &&
                  ` · ${l("svar inom", "respond within")} ${o.response_days} ${l("dagar", "days")}`}{" "}
                ·{" "}
                {o.status === "retired"
                  ? l("upphört", "retired")
                  : o.confirmed
                    ? l("bekräftat", "confirmed")
                    : l("ej bekräftat", "not confirmed")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {!o.confirmed && membership.can_approve && (
                  <WorkButton
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      change.mutate({
                        workspaceId: workspace.id,
                        obligationId: o.id,
                        change: "confirm",
                      })
                    }
                  >
                    {l("Bekräfta krav", "Confirm requirement")}
                  </WorkButton>
                )}
                {o.status === "active" && canEdit && (
                  <WorkButton
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      change.mutate({
                        workspaceId: workspace.id,
                        obligationId: o.id,
                        change: "retire",
                      })
                    }
                  >
                    {l("Upphör", "Retire")}
                  </WorkButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <WorkError code={change.error?.message} message={error(change.error?.message)} />
      {canEdit && (
        <details>
          <summary className="cursor-pointer text-sm text-primary">
            {l("Registrera krav", "Record a requirement")}
          </summary>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            data-testid="sw-add-obligation"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(
                {
                  workspaceId: workspace.id,
                  supplierAssetId: detail.asset.id,
                  contractId: f.contractId || null,
                  clause: f.clause,
                  basisNote: f.basisNote,
                  scope: f.scope,
                  expectedResult: f.expectedResult,
                  verificationMethod: f.verificationMethod,
                  timeRule: f.timeRule,
                  responseDays: f.responseDays ? Number(f.responseDays) : null,
                  completionDays: null,
                },
                { onSuccess: () => setF(empty) },
              );
            }}
          >
            <Field label={l("Avtal", "Contract")}>
              {(id) => (
                <select
                  id={id}
                  className={selectClass}
                  value={f.contractId}
                  onChange={(e) => setF({ ...f, contractId: e.target.value })}
                >
                  <option value="">
                    {l("Intern kravgrund (inget avtal)", "Internal basis (no contract)")}
                  </option>
                  {detail.contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contract_key} v{c.contract_version}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {f.contractId ? (
              <TextField
                label={l("Klausul", "Clause")}
                value={f.clause}
                onChange={(e) => setF({ ...f, clause: e.target.value })}
                required
              />
            ) : (
              <TextField
                label={l("Intern kravgrund", "Internal basis")}
                value={f.basisNote}
                onChange={(e) => setF({ ...f, basisNote: e.target.value })}
                required
              />
            )}
            <TextField
              label={l("Omfattning", "Scope")}
              value={f.scope}
              onChange={(e) => setF({ ...f, scope: e.target.value })}
              required
            />
            <TextField
              label={l("Förväntat resultat", "Expected result")}
              value={f.expectedResult}
              onChange={(e) => setF({ ...f, expectedResult: e.target.value })}
              required
            />
            <TextField
              label={l("Hur det verifieras", "How it is verified")}
              value={f.verificationMethod}
              onChange={(e) => setF({ ...f, verificationMethod: e.target.value })}
              required
            />
            <TextField
              label={l("Tidsregel", "Time rule")}
              value={f.timeRule}
              onChange={(e) => setF({ ...f, timeRule: e.target.value })}
            />
            <TextField
              label={l("Svarstid (kalenderdagar)", "Response time (calendar days)")}
              inputMode="numeric"
              value={f.responseDays}
              onChange={(e) => setF({ ...f, responseDays: e.target.value.replace(/\D/g, "") })}
            />
            <WorkError code={add.error?.message} message={error(add.error?.message)} />
            <div className="sm:col-span-2">
              <WorkButton type="submit" variant="outline" disabled={add.isPending}>
                {l("Registrera krav", "Record requirement")}
              </WorkButton>
            </div>
          </form>
        </details>
      )}
    </Section>
  );
}

function NewRequest({ detail }: { detail: Detail }) {
  const text = useSupplierText();
  const { l } = text;
  const { workspace, canEdit, user } = useSecurityWorkspace();
  const navigate = useNavigate();
  const usable = detail.obligations.filter(
    (o) =>
      o.confirmed &&
      o.status === "active" &&
      detail.contracts.find((c) => c.id === o.contract_id)?.verified,
  );
  const costDecisions = detail.decisions.filter((d) => d.decision === "scope_cost");
  const due = new Date();
  due.setDate(due.getDate() + 10);
  const [f, setF] = useState({
    actionId: "",
    basisKind: "information" as
      | "information"
      | "contract_obligation"
      | "deviation"
      | "change_order",
    obligationId: "",
    basisNote: "",
    changeDecisionId: "",
    title: "",
    task: "",
    expectedResult: "",
    responseInstruction: "",
    verificationCriteria: "",
    internalOwnerId: detail.profile?.internal_owner_id ?? user.id,
    requestedDue: iso(due),
    requiresSeparateVerifier: false,
  });
  const run = useSupplierCommand(useServerFn(createSecuritySupplierRequest));
  if (!canEdit || detail.profile?.status === "ended") return null;
  if (detail.openActions.length === 0)
    return (
      <p className="text-sm text-muted-foreground" data-testid="sw-new-request-needs-action">
        {l(
          "En begäran utgår alltid från en befintlig åtgärd. Skapa åtgärden under Risker och åtgärder först.",
          "A request always starts from an existing action. Create the action under Risks and actions first.",
        )}
      </p>
    );
  return (
    <details className="border-t border-border pt-3">
      <summary
        className="cursor-pointer text-sm font-semibold text-primary"
        data-testid="sw-new-request-open"
      >
        {l("Ny leverantörsbegäran", "New supplier request")}
      </summary>
      <form
        className="mt-3 space-y-3"
        data-testid="sw-new-request"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate(
            {
              workspaceId: workspace.id,
              supplierAssetId: detail.asset.id,
              ...f,
              obligationId: f.basisKind === "contract_obligation" ? f.obligationId || null : null,
              changeDecisionId: f.basisKind === "change_order" ? f.changeDecisionId || null : null,
            },
            {
              onSuccess: (created) =>
                void navigate({
                  to: "/security-work/$workspaceId/supplier-requests/$requestId",
                  params: { workspaceId: workspace.id, requestId: (created as { id: string }).id },
                }),
            },
          );
        }}
      >
        <Field
          label={l("Åtgärd", "Action")}
          hint={l(
            "Begäran är leverantörsdelen av en befintlig åtgärd. Ingen ny åtgärd skapas.",
            "The request is the supplier part of an existing action. No new action is created.",
          )}
        >
          {(id, hint) => (
            <select
              id={id}
              aria-describedby={hint}
              className={selectClass}
              value={f.actionId}
              onChange={(e) => setF({ ...f, actionId: e.target.value })}
              required
            >
              <option value="">{l("Välj åtgärd…", "Choose an action…")}</option>
              {detail.openActions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={l("Kravgrund", "Basis")}>
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={f.basisKind}
              onChange={(e) => setF({ ...f, basisKind: e.target.value as typeof f.basisKind })}
            >
              {(["information", "contract_obligation", "deviation", "change_order"] as const).map(
                (k) => (
                  <option
                    key={k}
                    value={k}
                    disabled={
                      (k === "contract_obligation" && usable.length === 0) ||
                      (k === "change_order" && costDecisions.length === 0)
                    }
                  >
                    {text.basis(k)}
                  </option>
                ),
              )}
            </select>
          )}
        </Field>
        {f.basisKind === "contract_obligation" && (
          <Field label={l("Bekräftat krav", "Confirmed requirement")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={f.obligationId}
                onChange={(e) => setF({ ...f, obligationId: e.target.value })}
                required
              >
                <option value="">{l("Välj…", "Choose…")}</option>
                {usable.map((o) => (
                  <option key={o.id} value={o.id}>
                    § {o.clause} · {o.scope}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {f.basisKind === "deviation" && (
          <TextAreaField
            label={l(
              "Observerad skillnad mot specificerat krav",
              "Observed difference from the specified requirement",
            )}
            value={f.basisNote}
            onChange={(e) => setF({ ...f, basisNote: e.target.value })}
            required
          />
        )}
        {f.basisKind === "change_order" && (
          <Field label={l("Omfattnings- och kostnadsbeslut", "Scope and cost decision")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={f.changeDecisionId}
                onChange={(e) => setF({ ...f, changeDecisionId: e.target.value })}
                required
              >
                <option value="">{l("Välj…", "Choose…")}</option>
                {costDecisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.cost_scope} · {d.amount} {d.currency}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <TextField
          label={l("Rubrik (delas)", "Title (shared)")}
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
        <div className="grid gap-3 sm:grid-cols-2">
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
          <TextField
            label={l("Svar önskas senast", "Response requested by")}
            type="date"
            value={f.requestedDue}
            onChange={(e) => setF({ ...f, requestedDue: e.target.value })}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.requiresSeparateVerifier}
            onChange={(e) => setF({ ...f, requiresSeparateVerifier: e.target.checked })}
          />
          {l("Kritiskt ärende: kräver separat verifierare", "Critical: needs a separate verifier")}
        </label>
        <WorkError code={run.error?.message} message={text.error(run.error?.message)} />
        <WorkButton type="submit" disabled={run.isPending}>
          {l("Skapa utkast", "Create draft")}
        </WorkButton>
      </form>
    </details>
  );
}

function RatioText({ value, missing }: { value: Ratio | null; missing: string }) {
  return value ? (
    <span>
      {value.numerator}/{value.denominator}
    </span>
  ) : (
    <span className="text-muted-foreground">{missing}</span>
  );
}

function Figures({ detail, from, to }: { detail: Detail; from?: string; to?: string }) {
  const { l } = useSupplierText();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const period = { from: from ?? iso(start), to: to ?? iso(new Date()) };
  const f = supplierFigures(
    detail.requests.map((r) => ({
      ...r,
      responseDays: detail.obligations.find((o) => o.id === r.obligation_id)?.response_days ?? null,
    })),
    detail.events,
    detail.responses,
    detail.verifications,
    period,
    new Date().toISOString(),
  );
  const missing = l("underlag saknas", "no data");
  return (
    <Section title={l("Uppföljning", "Follow-up")} testId="sw-supplier-figures">
      <p className="text-xs text-muted-foreground">
        {period.from} – {period.to} · {f.requests} {l("begäranden", "requests")} ·{" "}
        {l(
          "kalenderdagar, ingen avtalskalender tillämpad",
          "calendar days, no contract calendar applied",
        )}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt>{l("Svar i tid (enligt kravets svarstid)", "Responded on time (per requirement)")}</dt>
        <dd data-testid="sw-figure-responded">
          <RatioText value={f.respondedOnTime} missing={missing} />
        </dd>
        <dt>{l("Klart i tid (enligt överenskommet datum)", "Done on time (per agreed date)")}</dt>
        <dd>
          <RatioText value={f.doneOnTime} missing={missing} />
        </dd>
        <dt>{l("Godkänt vid första verifieringen", "Accepted at first verification")}</dt>
        <dd>
          <RatioText value={f.acceptedFirstTime} missing={missing} />
        </dd>
        <dt>{l("Kompletteringar", "Revisions")}</dt>
        <dd>{f.revisions}</dd>
        <dt>{l("Återöppningar", "Reopenings")}</dt>
        <dd>{f.reopenings}</dd>
        <dt>{l("Försenade svar nu", "Overdue responses now")}</dt>
        <dd>{f.overdueNow}</dd>
        <dt>{l("Väntar på er verifiering", "Awaiting your verification")}</dt>
        <dd>{f.awaitingOurVerification}</dd>
        <dt>{l("Median, leverantörens första svar", "Median, supplier's first response")}</dt>
        <dd>{f.medianFirstResponseHours === null ? missing : `${f.medianFirstResponseHours} h`}</dd>
        <dt>{l("Median, er verifieringstid", "Median, your verification time")}</dt>
        <dd>
          {f.medianVerificationWaitHours === null ? missing : `${f.medianVerificationWaitHours} h`}
        </dd>
      </dl>
    </Section>
  );
}

function Reviews({ detail }: { detail: Detail }) {
  const { l, error } = useSupplierText();
  const { workspace, canEdit, membership } = useSecurityWorkspace();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  const [f, setF] = useState({
    periodStart: iso(start),
    periodEnd: iso(new Date()),
    findings: "",
    decisionsText: "",
    requirementChanges: "",
    nextReviewAt: "",
  });
  const run = useSupplierWrite(useServerFn(saveSecuritySupplierReview));
  const open = detail.requests.filter((r) => isOpen(r.status));
  return (
    <Section title={l("Avstämningar", "Reviews")} testId="sw-supplier-reviews">
      <p className="text-xs text-muted-foreground">
        {l(
          "Siffrorna räknas fram när avstämningen visas, ur det du har rätt att se. Avstämningen sparar bara era bedömningar och beslut.",
          "Figures are computed when the review is shown, from what you may see. The review stores only your findings and decisions.",
        )}
      </p>
      {detail.reviews.map((r) => (
        <article
          key={r.id}
          className="space-y-2 rounded-md border border-border p-3 text-sm"
          data-testid="sw-review"
          data-status={r.status}
        >
          <p className="font-medium">
            {r.period_start} – {r.period_end} ·{" "}
            {r.status === "approved" ? l("godkänd", "approved") : l("utkast", "draft")}
            {r.next_review_at && ` · ${l("nästa", "next")} ${r.next_review_at}`}
          </p>
          {r.findings && (
            <p className="whitespace-pre-wrap">
              <strong>{l("Iakttagelser", "Findings")}:</strong> {r.findings}
            </p>
          )}
          {r.decisions_text && (
            <p className="whitespace-pre-wrap">
              <strong>{l("Beslut", "Decisions")}:</strong> {r.decisions_text}
            </p>
          )}
          {r.requirement_changes && (
            <p className="whitespace-pre-wrap">
              <strong>{l("Förslag till kravändringar", "Proposed requirement changes")}:</strong>{" "}
              {r.requirement_changes}
            </p>
          )}
          <Figures detail={detail} from={r.period_start} to={r.period_end} />
          {r.status === "draft" && membership.can_approve && (
            <WorkButton
              variant="outline"
              size="sm"
              disabled={run.isPending}
              onClick={() =>
                run.mutate({
                  workspaceId: workspace.id,
                  supplierAssetId: detail.asset.id,
                  reviewId: r.id,
                  periodStart: r.period_start,
                  periodEnd: r.period_end,
                  findings: r.findings,
                  decisionsText: r.decisions_text,
                  requirementChanges: r.requirement_changes,
                  nextReviewAt: r.next_review_at,
                  approve: true,
                })
              }
            >
              {l("Godkänn avstämning", "Approve review")}
            </WorkButton>
          )}
        </article>
      ))}
      {canEdit && (
        <details>
          <summary className="cursor-pointer text-sm text-primary">
            {l("Ny avstämning", "New review")}
          </summary>
          <form
            className="mt-3 space-y-3"
            data-testid="sw-add-review"
            onSubmit={(e) => {
              e.preventDefault();
              run.mutate({
                workspaceId: workspace.id,
                supplierAssetId: detail.asset.id,
                reviewId: null,
                ...f,
                nextReviewAt: f.nextReviewAt || null,
                approve: false,
              });
            }}
          >
            <p className="text-xs text-muted-foreground">
              {l(
                `${open.length} öppna begäranden ingår i underlaget.`,
                `${open.length} open requests are part of the basis.`,
              )}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={l("Period från", "Period from")}
                type="date"
                value={f.periodStart}
                onChange={(e) => setF({ ...f, periodStart: e.target.value })}
                required
              />
              <TextField
                label={l("Period till", "Period to")}
                type="date"
                value={f.periodEnd}
                onChange={(e) => setF({ ...f, periodEnd: e.target.value })}
                required
              />
            </div>
            <TextAreaField
              label={l(
                "Iakttagelser och återkommande brister",
                "Findings and recurring shortcomings",
              )}
              value={f.findings}
              onChange={(e) => setF({ ...f, findings: e.target.value })}
            />
            <TextAreaField
              label={l("Beslut", "Decisions")}
              value={f.decisionsText}
              onChange={(e) => setF({ ...f, decisionsText: e.target.value })}
            />
            <TextAreaField
              label={l("Förslag till kravändringar", "Proposed requirement changes")}
              value={f.requirementChanges}
              onChange={(e) => setF({ ...f, requirementChanges: e.target.value })}
            />
            <TextField
              label={l("Nästa avstämning", "Next review")}
              type="date"
              value={f.nextReviewAt}
              onChange={(e) => setF({ ...f, nextReviewAt: e.target.value })}
            />
            <WorkError code={run.error?.message} message={error(run.error?.message)} />
            <WorkButton type="submit" variant="outline" disabled={run.isPending}>
              {l("Spara avstämning", "Save review")}
            </WorkButton>
          </form>
        </details>
      )}
    </Section>
  );
}
