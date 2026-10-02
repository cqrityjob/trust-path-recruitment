import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/context";
import { saveSecurityAsset } from "@/lib/security-work/programme/programme.functions";
import type { ProtectedAsset } from "@/lib/security-work/programme/types";
import { useSecurityWorkspace } from "./context";
import { SaveStatus, useSavedOperation, useWorkText } from "./analysis-ui";
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

export const ASSET_CATEGORIES = [
  "people",
  "operations",
  "facilities",
  "information",
  "systems",
  "suppliers",
  "reputation",
  "other",
] as const;
export function categoryLabel(category: string, lang: "sv" | "en") {
  const labels: Record<string, [string, string]> = {
    people: ["Personer", "People"],
    operations: ["Verksamhet / kritiska processer", "Operations / critical processes"],
    facilities: ["Lokaler och anläggningar", "Facilities"],
    information: ["Information", "Information"],
    systems: ["System och teknik", "Systems / technology"],
    suppliers: ["Leverantörer och tredje part", "Suppliers / third parties"],
    reputation: ["Anseende", "Reputation"],
    other: ["Övrigt", "Other"],
  };
  const pair = labels[category];
  return pair ? (lang === "sv" ? pair[0] : pair[1]) : category;
}
const consequenceLabels: Record<number, [string, string]> = {
  1: ["1 · Försumbar", "1 · Negligible"],
  2: ["2 · Begränsad", "2 · Limited"],
  3: ["3 · Betydande", "3 · Significant"],
  4: ["4 · Allvarlig", "4 · Serious"],
  5: ["5 · Kritisk", "5 · Critical"],
};

type Draft = {
  id: string;
  version: number | null;
  name: string;
  description: string;
  category: (typeof ASSET_CATEGORIES)[number];
  owner_id: string | null;
  owner_label: string;
  business_importance: "low" | "medium" | "high" | "critical";
  consequence_level: number | null;
  consequence_description: string;
  status: "active" | "retired";
  review_date: string;
};
const draftFrom = (asset?: ProtectedAsset): Draft => ({
  id: asset?.id ?? crypto.randomUUID(),
  version: asset?.version ?? null,
  name: asset?.name ?? "",
  description: asset?.description ?? "",
  category: (asset?.category as Draft["category"]) ?? "operations",
  owner_id: asset?.owner_id ?? null,
  owner_label: asset?.owner_label ?? "",
  business_importance: (asset?.business_importance as Draft["business_importance"]) ?? "medium",
  consequence_level: asset?.consequence_level ?? null,
  consequence_description: asset?.consequence_description ?? "",
  status: (asset?.status as Draft["status"]) ?? "active",
  review_date: asset?.review_date ?? "",
});

function AssetEditor({
  asset,
  members,
  onDone,
}: {
  asset?: ProtectedAsset;
  members: { user_id: string; role: string }[];
  onDone: () => void;
}) {
  const { lang } = useT();
  const l = useWorkText();
  const { workspace, canEdit } = useSecurityWorkspace();
  const save = useServerFn(saveSecurityAsset);
  const op = useSavedOperation();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(asset));
  const [dirty, setDirty] = useState(false);
  const clearWarning = useUnsavedWarning(dirty);
  const patch = (value: Partial<Draft>) => {
    setDraft((old) => ({ ...old, ...value }));
    setDirty(true);
    op.clear();
  };
  return (
    <form
      className={`${panelClass} space-y-4`}
      data-testid="sw-asset-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canEdit || op.state === "saving") return;
        const saved = await op.run(() =>
          save({
            data: { workspaceId: workspace.id, ...draft, review_date: draft.review_date || null },
          }),
        );
        if (saved) {
          setDirty(false);
          clearWarning();
          onDone();
        }
      }}
    >
      <fieldset disabled={!canEdit || op.state === "saving"} className="space-y-4">
        <h3 className="text-lg font-semibold">
          {asset
            ? l("Redigera skyddsvärde", "Edit protected asset")
            : l("Nytt skyddsvärde", "New protected asset")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={l("Namn", "Name")}
            required
            maxLength={300}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <Field label={l("Kategori", "Category")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.category}
                onChange={(e) => patch({ category: e.target.value as Draft["category"] })}
              >
                {ASSET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category, lang)}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <OwnerSelect
            label={l("Ägare i arbetsytan", "Owner in the workspace")}
            value={draft.owner_id}
            members={members}
            onChange={(owner_id) => patch({ owner_id })}
          />
          <TextField
            label={l(
              "Ägare utanför arbetsytan (namn eller funktion)",
              "Owner outside the workspace (name or function)",
            )}
            maxLength={200}
            value={draft.owner_label}
            onChange={(e) => patch({ owner_label: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={l("Betydelse för verksamheten", "Business importance")}>
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.business_importance}
                onChange={(e) =>
                  patch({ business_importance: e.target.value as Draft["business_importance"] })
                }
              >
                {(["low", "medium", "high", "critical"] as const).map((value) => (
                  <option key={value} value={value}>
                    {
                      {
                        low: l("Låg", "Low"),
                        medium: l("Medel", "Medium"),
                        high: l("Hög", "High"),
                        critical: l("Kritisk", "Critical"),
                      }[value]
                    }
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label={l(
              "Konsekvens om det inte fungerar eller komprometteras",
              "Consequence if unavailable or compromised",
            )}
            hint={l(
              "Din bedömning. AI föreslår aldrig nivån.",
              "Your judgement. AI never suggests the level.",
            )}
          >
            {(id, hintId) => (
              <select
                id={id}
                aria-describedby={hintId}
                className={selectClass}
                value={draft.consequence_level ?? ""}
                onChange={(e) =>
                  patch({ consequence_level: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">{l("Inte bedömd", "Not assessed")}</option>
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    {lang === "sv" ? consequenceLabels[level][0] : consequenceLabels[level][1]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <TextAreaField
          label={l("Beskriv konsekvensen", "Describe the consequence")}
          value={draft.consequence_description}
          maxLength={8000}
          onChange={(e) => patch({ consequence_description: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            type="date"
            label={l("Granskningsdatum", "Review date")}
            value={draft.review_date}
            onChange={(e) => patch({ review_date: e.target.value })}
          />
          <Field label="Status">
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.status}
                onChange={(e) => patch({ status: e.target.value as Draft["status"] })}
              >
                <option value="active">{l("Aktivt", "Active")}</option>
                <option value="retired">{l("Avvecklat", "Retired")}</option>
              </select>
            )}
          </Field>
        </div>
      </fieldset>
      <WorkError
        code={op.error}
        onRetry={op.error === "CONFLICT" ? () => window.location.reload() : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <WorkButton type="submit" disabled={!canEdit || op.state === "saving"}>
          {l("Spara skyddsvärde", "Save protected asset")}
        </WorkButton>
        <WorkButton type="button" variant="ghost" onClick={onDone}>
          {l("Stäng", "Close")}
        </WorkButton>
        <SaveStatus state={op.state} />
      </div>
    </form>
  );
}

export function SecurityAssetsPage() {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const programme = useProgramme();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) });
  const selectedAsset = programme.data?.assets.find((asset) => asset.id === selected) ?? null;
  useAssistantContext({
    kind: "asset",
    id: selectedAsset?.id ?? null,
    title: selectedAsset?.name ?? t("sw.prog.nav.assets"),
  });
  if (programme.isPending) return <LoadingState />;
  if (programme.isError || !programme.data)
    return (
      <WorkError
        code={programme.error?.message ?? "SAVE_FAILED"}
        onRetry={() => void programme.refetch()}
      />
    );
  const { assets, risks, riskAssets, members, evidenceLinks } = programme.data;
  const byCategory = ASSET_CATEGORIES.map((category) => ({
    category,
    assets: assets.filter((asset) => asset.category === category && asset.status === "active"),
  })).filter((group) => group.assets.length);
  const retired = assets.filter((asset) => asset.status === "retired");
  const addButton =
    canEdit && editing !== "new" ? (
      <WorkButton onClick={() => setEditing("new")} data-testid="sw-add-asset">
        <Plus aria-hidden="true" />
        {l("Lägg till skyddsvärde", "Add protected asset")}
      </WorkButton>
    ) : null;
  return (
    <>
      <PageHeading
        title={t("sw.prog.nav.assets")}
        body={l(
          "Vad måste organisationen skydda eller hålla igång? Varje skyddsvärde behöver en ägare och en konsekvensnivå som du bedömer.",
          "What must the organisation protect or keep running? Every asset needs an owner and a consequence level that you decide.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            {addButton}
            <AssistantButton />
          </div>
        }
      />
      {editing === "new" && (
        <AssetEditor
          members={members}
          onDone={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
      {assets.length === 0 && editing !== "new" && (
        <EmptyState
          title={l(
            "Börja med det som inte får sluta fungera",
            "Start with what must never stop working",
          )}
          body={l(
            "Personer, verksamhet, lokaler, information, system, leverantörer och anseende. Lägg till de fem till tio viktigaste först. Security AI kan föreslå utifrån er verksamhetsbeskrivning – du godkänner varje förslag.",
            "People, operations, facilities, information, systems, suppliers and reputation. Add the five to ten most important first. Security AI can suggest from your organisation description; you approve each suggestion.",
          )}
        >
          {addButton}
        </EmptyState>
      )}
      {byCategory.map((group) => (
        <section
          key={group.category}
          className="space-y-2"
          data-testid={`sw-assets-${group.category}`}
        >
          <h2 className="font-display text-lg font-semibold">
            {categoryLabel(group.category, lang)}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {group.assets.map((asset) => {
              const linked = riskAssets.filter((link) => link.asset_id === asset.id).length;
              const owned = Boolean(asset.owner_id) || asset.owner_label.trim() !== "";
              return (
                <li key={asset.id} className="space-y-3 p-4" data-testid="sw-asset-row">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => setSelected(selected === asset.id ? null : asset.id)}
                      aria-expanded={selected === asset.id}
                    >
                      <span className="block break-words font-semibold">{asset.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {l("Ägare", "Owner")}:{" "}
                          {ownerName(asset.owner_id, asset.owner_label, user.id, t)}
                        </span>
                        <span>
                          · {l("Konsekvens", "Consequence")}:{" "}
                          {asset.consequence_level ?? l("inte bedömd", "not assessed")}
                        </span>
                        <span>
                          · {linked} {l("risker", "risks")}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {!owned && <Tag tone="warn">{t("sw.prog.owner.unassigned")}</Tag>}
                      {asset.consequence_level === null && (
                        <Tag tone="warn">{l("Konsekvens saknas", "No consequence level")}</Tag>
                      )}
                      {asset.review_date && asset.review_date < programme.data.today && (
                        <Tag tone="warn">{l("Granskning försenad", "Review overdue")}</Tag>
                      )}
                      {canEdit && (
                        <WorkButton
                          variant="outline"
                          className="min-h-10"
                          onClick={() => setEditing(editing === asset.id ? null : asset.id)}
                        >
                          {editing === asset.id ? l("Stäng", "Close") : l("Redigera", "Edit")}
                        </WorkButton>
                      )}
                    </div>
                  </div>
                  {selected === asset.id && (
                    <div className="space-y-3 border-t border-border pt-3 text-sm">
                      {asset.description && (
                        <p className="whitespace-pre-wrap">{asset.description}</p>
                      )}
                      {asset.consequence_description && (
                        <p className="whitespace-pre-wrap text-muted-foreground">
                          {asset.consequence_description}
                        </p>
                      )}
                      <div>
                        <p className="font-semibold">{l("Kopplade risker", "Linked risks")}</p>
                        {linked === 0 ? (
                          <p className="text-muted-foreground">
                            {l("Inga risker är kopplade ännu.", "No risks linked yet.")}
                          </p>
                        ) : (
                          <ul className="list-disc pl-5">
                            {riskAssets
                              .filter((link) => link.asset_id === asset.id)
                              .map((link) => {
                                const risk = risks.find(
                                  (candidate) => candidate.id === link.risk_id,
                                );
                                return <li key={link.id}>{risk?.title ?? link.risk_id}</li>;
                              })}
                          </ul>
                        )}
                        {canEdit && (
                          <WorkButton asChild variant="ghost" className="px-0">
                            <Link
                              to="/security-work/$workspaceId/risks"
                              params={{ workspaceId: workspace.id }}
                              search={{ new: true, assetId: asset.id }}
                            >
                              {l("Ny risk för detta skyddsvärde", "New risk for this asset")}
                            </Link>
                          </WorkButton>
                        )}
                      </div>
                      <EvidenceLinks
                        targetKind="asset"
                        targetId={asset.id}
                        links={evidenceLinks}
                        onChanged={() => void refresh()}
                      />
                    </div>
                  )}
                  {editing === asset.id && (
                    <AssetEditor
                      key={asset.version}
                      asset={asset}
                      members={members}
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
        </section>
      ))}
      {retired.length > 0 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer font-semibold">
            {l("Avvecklade skyddsvärden", "Retired assets")} ({retired.length})
          </summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">
            {retired.map((asset) => (
              <li key={asset.id}>{asset.name}</li>
            ))}
          </ul>
        </details>
      )}
      <Explain title={l("Vad räknas som skyddsvärde?", "What counts as a protected asset?")}>
        <p>
          {l(
            "Allt som organisationen inte kan vara utan eller inte får förlora: nyckelpersoner, kritiska processer, lokaler, information, system, leverantörer och anseende.",
            "Anything the organisation cannot do without or must not lose: key people, critical processes, facilities, information, systems, suppliers and reputation.",
          )}
        </p>
        <p>
          {l(
            "Konsekvensnivån avgör hur risker prioriteras. Den är alltid din bedömning.",
            "The consequence level drives how risks are prioritised. It is always your judgement.",
          )}
        </p>
      </Explain>
    </>
  );
}
