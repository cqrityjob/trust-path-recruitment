// One BESKT method version: its content, its lifecycle, and who may use it.
//
// Mounted on two surfaces (see ./surface.tsx): the admin console and the
// governance surface for editors, reviewers and publishers.
//
// ── THE REVISION IS THE WHOLE CONCURRENCY STORY ─────────────────────────
//
// Every governed mutation names the revision the editor was looking at, and
// the database compares and swaps. So this screen sends
// `workspace.version.revision` — the value it actually rendered — and never
// a freshly-read one. Re-reading before writing would defeat the safeguard
// exactly when it matters: two editors on the same draft.
//
// A refusal for a stale revision is shown and the workspace is refetched.
// It is not retried, because a retry would apply this editor's text on top
// of a version they have not seen.
//
// ── WHY THE TABS ARE TABS AND NOT ONE LONG PAGE ─────────────────────────
//
// Content, lifecycle and access are three different jobs done by three
// different people — an editor, five reviewers and a publisher, and a
// platform admin. One page would put a publish button under a form an
// editor is halfway through.
//
// ── WHAT THIS SCREEN CANNOT DO, BY CONSTRUCTION ─────────────────────────
//
// Write a table. Every action here is a governed RPC, and the two authority
// tables are SELECT-only for every client role, service_role included.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  BesktMethodsLink,
  BesktSurfaceShell,
  BesktVersionLink,
  type BesktSurface,
  type BesktVersionTab,
} from "@/components/admin/beskt/surface";
import { useT } from "@/i18n/context";
import { BesktTestActivationPanel } from "@/components/admin/beskt/BesktInternalTestAdmin";
import type { TranslationKey } from "@/i18n/dictionaries";
import { AsyncState, NoticePanel, StateBadge } from "@/components/admin/interview/PackGovernanceUi";
import { BesktContentEditor } from "@/components/admin/beskt/BesktContentEditor";
import {
  BesktLifecyclePanel,
  BesktStatusBadge,
} from "@/components/admin/beskt/BesktLifecyclePanel";
import { BesktGovernanceGrants, BesktPilotGrants } from "@/components/admin/beskt/BesktGrantsPanel";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  BESKT_CONTENT_FAMILIES,
  authorBesktActivationRequirement,
  authorBesktEvidenceAnchor,
  authorBesktExposureProfile,
  authorBesktItem,
  authorBesktObservationField,
  authorBesktPrompt,
  authorBesktRoutingRule,
  authorBesktSection,
  deleteBesktContent,
  getBesktVersionWorkspace,
  grantBesktGovernance,
  grantBesktPilot,
  listBesktGovernanceGrants,
  listBesktPilotGrants,
  publishBesktVersion,
  recordBesktReview,
  retireBesktVersion,
  revokeBesktGovernance,
  revokeBesktPilot,
  submitBesktForReview,
  suspendBesktVersion,
  validateBesktVersion,
  type BesktAuthorPayload,
  type BesktContentFamily,
  type BesktContentRow,
  type BesktGate,
  type BesktGrantKind,
} from "@/lib/beskt/governance.functions";

/**
 * The access tab grants review mandates and employer pilot grants, which only
 * a platform admin may do. It is drawn on the admin surface only: offering it
 * to an editor or reviewer would be offering actions the database refuses.
 */
const TABS_BY_SURFACE: Record<BesktSurface, readonly BesktVersionTab[]> = {
  admin: ["content", "lifecycle", "access"],
  governance: ["content", "lifecycle"],
};

const TAB_BUTTON =
  "inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const TAB_ACTIVE =
  "inline-flex min-h-[44px] items-center rounded-md border border-transparent bg-foreground px-4 py-2 text-sm font-medium text-background";

/**
 * A fresh operation id per attempt, reused while an attempt is still failing.
 *
 * The database answers a replayed operation id with the first attempt's
 * result BEFORE writing anything, so a retry after a dropped response cannot
 * write twice — but only if the retry carries the SAME id.
 */
function useOperationId(): { take: () => string; clear: () => void } {
  const [id, setId] = useState<string | null>(null);
  return {
    take: () => {
      if (id !== null) return id;
      const next = crypto.randomUUID();
      setId(next);
      return next;
    },
    clear: () => setId(null),
  };
}

export function BesktVersionPage({
  surface,
  methodVersionId,
  tab: requestedTab,
}: {
  readonly surface: BesktSurface;
  readonly methodVersionId: string;
  readonly tab: BesktVersionTab | undefined;
}) {
  const TABS = TABS_BY_SURFACE[surface];
  const tab: BesktVersionTab =
    requestedTab && TABS.includes(requestedTab) ? requestedTab : "content";
  const { t, lang } = useT();
  const queryClient = useQueryClient();

  const workspaceFn = useServerFn(getBesktVersionWorkspace);
  const validateFn = useServerFn(validateBesktVersion);
  const govGrantsFn = useServerFn(listBesktGovernanceGrants);
  const pilotGrantsFn = useServerFn(listBesktPilotGrants);

  const workspaceKey = ["admin", "beskt-version", methodVersionId] as const;

  const workspaceQ = useQuery({
    queryKey: workspaceKey,
    queryFn: () => workspaceFn({ data: { methodVersionId } }),
    retry: false,
  });

  const validationQ = useQuery({
    queryKey: ["admin", "beskt-validate", methodVersionId],
    queryFn: async () => {
      const [content, publish] = await Promise.all([
        validateFn({ data: { methodVersionId, requireReviews: false } }),
        validateFn({ data: { methodVersionId, requireReviews: true } }),
      ]);
      return { content, publish };
    },
    retry: false,
  });

  const govGrantsQ = useQuery({
    queryKey: ["admin", "beskt-governance-grants"],
    queryFn: () => govGrantsFn(),
    enabled: tab === "access" && surface === "admin",
    retry: false,
  });

  const pilotGrantsQ = useQuery({
    queryKey: ["admin", "beskt-pilot-grants", methodVersionId],
    queryFn: () => pilotGrantsFn({ data: { methodVersionId } }),
    enabled: tab === "access" && surface === "admin",
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: workspaceKey });
    await queryClient.invalidateQueries({ queryKey: ["admin", "beskt-validate", methodVersionId] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "beskt-methods"] });
  };

  const authorOp = useOperationId();
  const deleteOp = useOperationId();
  const lifecycleOp = useOperationId();
  const grantOp = useOperationId();
  const pilotOp = useOperationId();

  const authorFns = {
    exposure_profile: useServerFn(authorBesktExposureProfile),
    section: useServerFn(authorBesktSection),
    item: useServerFn(authorBesktItem),
    prompt: useServerFn(authorBesktPrompt),
    routing_rule: useServerFn(authorBesktRoutingRule),
    evidence_anchor: useServerFn(authorBesktEvidenceAnchor),
    observation_field: useServerFn(authorBesktObservationField),
    activation_requirement: useServerFn(authorBesktActivationRequirement),
  } as const;

  const deleteFn = useServerFn(deleteBesktContent);
  const submitFn = useServerFn(submitBesktForReview);
  const reviewFn = useServerFn(recordBesktReview);
  const publishFn = useServerFn(publishBesktVersion);
  const suspendFn = useServerFn(suspendBesktVersion);
  const retireFn = useServerFn(retireBesktVersion);
  const grantGovFn = useServerFn(grantBesktGovernance);
  const revokeGovFn = useServerFn(revokeBesktGovernance);
  const grantPilotFn = useServerFn(grantBesktPilot);
  const revokePilotFn = useServerFn(revokeBesktPilot);

  const [activeFamily, setActiveFamily] = useState<BesktContentFamily | null>(null);

  const revision = workspaceQ.data?.version.revision ?? 1;

  const author = useMutation({
    mutationFn: (input: { family: BesktContentFamily; payload: BesktAuthorPayload }) =>
      authorFns[input.family]({
        data: {
          operationId: authorOp.take(),
          methodVersionId,
          expectedRevision: revision,
          payload: input.payload,
        },
      }),
    onSuccess: async () => {
      authorOp.clear();
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (input: { family: BesktContentFamily; key: string }) =>
      deleteFn({
        data: {
          operationId: deleteOp.take(),
          methodVersionId,
          expectedRevision: revision,
          family: input.family,
          key: input.key,
        },
      }),
    onSuccess: async () => {
      deleteOp.clear();
      await invalidate();
    },
  });

  const lifecycle = useMutation({
    mutationFn: async (
      action:
        | { kind: "submit" }
        | {
            kind: "review";
            gate: BesktGate;
            decision: "approved" | "rejected";
            rationale: string;
          }
        | { kind: "publish"; reason: string | null }
        | { kind: "suspend"; reason: string }
        | { kind: "retire"; reason: string },
    ) => {
      const base = {
        operationId: lifecycleOp.take(),
        methodVersionId,
        expectedRevision: revision,
      };
      if (action.kind === "submit") return submitFn({ data: base });
      if (action.kind === "review")
        return reviewFn({
          data: {
            ...base,
            gate: action.gate,
            decision: action.decision,
            rationale: action.rationale,
          },
        });
      if (action.kind === "publish") return publishFn({ data: { ...base, reason: action.reason } });
      if (action.kind === "suspend") return suspendFn({ data: { ...base, reason: action.reason } });
      return retireFn({ data: { ...base, reason: action.reason } });
    },
    onSuccess: async () => {
      lifecycleOp.clear();
      await invalidate();
    },
  });

  const governanceGrant = useMutation({
    mutationFn: async (
      action:
        | {
            kind: "grant";
            userId: string;
            grantKind: BesktGrantKind;
            sourceReference: string;
            validUntil: string | null;
          }
        | { kind: "revoke"; grantId: string; reason: string },
    ) =>
      action.kind === "grant"
        ? grantGovFn({
            data: {
              operationId: grantOp.take(),
              userId: action.userId,
              grantKind: action.grantKind,
              sourceReference: action.sourceReference,
              validUntil: action.validUntil,
            },
          })
        : revokeGovFn({
            data: { operationId: grantOp.take(), grantId: action.grantId, reason: action.reason },
          }),
    onSuccess: async () => {
      grantOp.clear();
      await queryClient.invalidateQueries({ queryKey: ["admin", "beskt-governance-grants"] });
    },
  });

  const pilotGrant = useMutation({
    mutationFn: async (
      action:
        | { kind: "grant"; employerId: string; sourceReference: string; expiresOn: string }
        | { kind: "revoke"; employerId: string; reason: string },
    ) =>
      action.kind === "grant"
        ? grantPilotFn({
            data: {
              operationId: pilotOp.take(),
              employerId: action.employerId,
              methodVersionId,
              sourceReference: action.sourceReference,
              expiresOn: action.expiresOn,
            },
          })
        : revokePilotFn({
            data: {
              operationId: pilotOp.take(),
              employerId: action.employerId,
              methodVersionId,
              reason: action.reason,
            },
          }),
    onSuccess: async () => {
      pilotOp.clear();
      await queryClient.invalidateQueries({
        queryKey: ["admin", "beskt-pilot-grants", methodVersionId],
      });
    },
  });

  const shell = (children: React.ReactNode) => (
    <BesktSurfaceShell surface={surface}>{children}</BesktSurfaceShell>
  );

  if (workspaceQ.isLoading) return shell(<AsyncState state="loading" />);
  if (workspaceQ.isError)
    return shell(<AsyncState state="error" message={t(besktErrorKey(workspaceQ.error))} />);

  const w = workspaceQ.data!;
  const v = w.version;
  const editable = v.contentStatus === "draft";

  const familyRows: Record<BesktContentFamily, readonly BesktContentRow[]> = {
    exposure_profile: w.exposureProfiles,
    section: w.sections,
    item: w.items,
    prompt: w.prompts,
    routing_rule: w.routingRules,
    evidence_anchor: w.evidenceAnchors,
    observation_field: w.observationFields,
    activation_requirement: w.activationRequirements,
  };

  return shell(
    <>
      <header>
        <BesktMethodsLink
          surface={surface}
          className="text-sm text-muted-foreground underline underline-offset-2"
        >
          {t("beskt.admin.version.backToList")}
        </BesktMethodsLink>
        <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
          {lang === "en" ? (w.method.nameEn ?? w.method.nameSv) : w.method.nameSv}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BesktStatusBadge status={v.contentStatus} />
          <StateBadge tone="neutral" srPrefix={t("beskt.admin.list.version")}>
            {t("beskt.admin.list.version")} {v.versionNumber}
          </StateBadge>
          <StateBadge tone="neutral" srPrefix={t("beskt.admin.list.revision")}>
            {t("beskt.admin.list.revision")} {v.revision}
          </StateBadge>
          <StateBadge
            tone={v.validationLabel === "pilot_hypothesis" ? "attention" : "confirmed"}
            srPrefix={t("beskt.admin.version.validationLabel")}
          >
            {t(`beskt.admin.value.${v.validationLabel}` as TranslationKey)}
          </StateBadge>
          <code className="break-all font-mono text-xs text-muted-foreground">{w.method.slug}</code>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {w.method.purposeSv}
        </p>
      </header>

      <div className="mt-4">
        <NoticePanel tone="work" title={t("beskt.admin.version.releaseScopeTitle")}>
          <p>{t("beskt.admin.version.releaseScopeBody")}</p>
        </NoticePanel>
      </div>

      {v.contentHash && (
        <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
          <span className="sr-only">{t("beskt.admin.version.contentHash")}: </span>
          {v.contentHash}
        </p>
      )}

      <nav aria-label={t("beskt.admin.version.tabsAria")} className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((x) => (
            <li key={x}>
              <BesktVersionLink
                surface={surface}
                methodVersionId={methodVersionId}
                tab={x}
                current={tab === x}
                className={tab === x ? TAB_ACTIVE : TAB_BUTTON}
              >
                {t(`beskt.admin.tab.${x}` as TranslationKey)}
              </BesktVersionLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 space-y-4">
        {tab === "content" && (
          <>
            {!editable && (
              <NoticePanel tone="attention" title={t("beskt.admin.version.frozenTitle")}>
                <p>{t("beskt.admin.version.frozenBody")}</p>
              </NoticePanel>
            )}

            <nav aria-label={t("beskt.admin.version.familyNavAria")}>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <button
                    type="button"
                    className={activeFamily === null ? TAB_ACTIVE : TAB_BUTTON}
                    onClick={() => setActiveFamily(null)}
                  >
                    {t("beskt.admin.version.allFamilies")}
                  </button>
                </li>
                {BESKT_CONTENT_FAMILIES.map((family) => (
                  <li key={family}>
                    <button
                      type="button"
                      className={activeFamily === family ? TAB_ACTIVE : TAB_BUTTON}
                      onClick={() => setActiveFamily(family)}
                    >
                      {t(`beskt.admin.family.${family}` as TranslationKey)}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {BESKT_CONTENT_FAMILIES.filter(
              (family) => activeFamily === null || activeFamily === family,
            ).map((family) => (
              <BesktContentEditor
                key={family}
                family={family}
                rows={familyRows[family]}
                editable={editable}
                busy={author.isPending || remove.isPending}
                error={author.isError ? author.error : remove.isError ? remove.error : null}
                onSave={(payload) => author.mutate({ family, payload })}
                onDelete={(key) => remove.mutate({ family, key })}
              />
            ))}
          </>
        )}

        {tab === "lifecycle" && (
          <BesktLifecyclePanel
            workspace={w}
            contentFindings={validationQ.data?.content ?? []}
            publishFindings={validationQ.data?.publish ?? []}
            actions={{
              busy: lifecycle.isPending,
              error: lifecycle.isError ? lifecycle.error : null,
              submit: () => lifecycle.mutate({ kind: "submit" }),
              recordReview: (gate, decision, rationale) =>
                lifecycle.mutate({ kind: "review", gate, decision, rationale }),
              publish: (reason) => lifecycle.mutate({ kind: "publish", reason }),
              suspend: (reason) => lifecycle.mutate({ kind: "suspend", reason }),
              retire: (reason) => lifecycle.mutate({ kind: "retire", reason }),
            }}
          />
        )}

        {tab === "access" && surface === "admin" && (
          <>
            <BesktTestActivationPanel methodVersionId={methodVersionId} />
            <BesktGovernanceGrants
              grants={govGrantsQ.data ?? []}
              now={new Date()}
              actions={{
                busy: governanceGrant.isPending,
                error: governanceGrant.isError ? governanceGrant.error : null,
                grant: (input) => governanceGrant.mutate({ kind: "grant", ...input }),
                revoke: (grantId, reason) =>
                  governanceGrant.mutate({ kind: "revoke", grantId, reason }),
              }}
            />
            <BesktPilotGrants
              grants={pilotGrantsQ.data ?? []}
              today={new Date().toISOString().slice(0, 10)}
              actions={{
                busy: pilotGrant.isPending,
                error: pilotGrant.isError ? pilotGrant.error : null,
                // A pilot grant is refused for anything but a published,
                // candidate-safe version. Offering it on a draft would be
                // offering an action that is always refused.
                canGrant: v.contentStatus === "published",
                grant: (input) => pilotGrant.mutate({ kind: "grant", ...input }),
                revoke: (employerId, reason) =>
                  pilotGrant.mutate({ kind: "revoke", employerId, reason }),
              }}
            />
          </>
        )}
      </div>
    </>,
  );
}
