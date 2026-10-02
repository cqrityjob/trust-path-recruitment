import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X } from "lucide-react";
import { useT } from "@/i18n/context";
import { getWorkAiStatus } from "@/lib/security-work/ai.functions";
import {
  capabilitiesFor,
  parseSuggestionContent,
  type AssistantContextKind,
  type CapabilityId,
  type SuggestionKind,
} from "@/lib/security-work/programme/assistant-capabilities";
import {
  REPORT_SECTIONS,
  REPORT_SECTION_TITLES,
} from "@/lib/security-work/programme/management-report";
import {
  decideSecuritySuggestion,
  requestSecuritySuggestion,
} from "@/lib/security-work/programme/programme.functions";
import type { AiSuggestion } from "@/lib/security-work/programme/types";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { cn } from "@/lib/utils";
import { useSecurityWorkspace } from "./context";
import { useWorkText } from "./analysis-ui";
import { programmeKey, useProgramme } from "./programme-ui";
import { TextAreaField, WorkButton, WorkError, panelClass } from "./ui";

/**
 * CQrityjob Security AI: one assistant for the whole workspace. A page sets
 * its context (which record is open); the panel shows the capabilities for
 * that context, proposals already made there, and the explicit approve /
 * reject decision. Without AI the panel still opens and shows the
 * deterministic help for each capability.
 */
export type AssistantContext = {
  kind: AssistantContextKind;
  id: string | null;
  title: string;
  /** What the approving user may create from an approved proposal. */
  apply?: {
    mandateVersion?: number;
    riskId?: string;
    riskVersion?: number;
    gapId?: string;
    reportId?: string;
    reportVersion?: number;
  };
};
type AssistantState = {
  context: AssistantContext;
  setContext: (context: AssistantContext) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};
const AssistantStateContext = createContext<AssistantState | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AssistantContext>({
    kind: "workspace",
    id: null,
    title: "",
  });
  const [open, setOpen] = useState(false);
  return (
    <AssistantStateContext.Provider value={{ context, setContext, open, setOpen }}>
      {children}
    </AssistantStateContext.Provider>
  );
}
function useAssistantState() {
  const state = useContext(AssistantStateContext);
  if (!state) throw new Error("Security AI assistant context is missing");
  return state;
}
/** Pages call this to say what the assistant should understand right now. */
export function useAssistantContext(context: AssistantContext) {
  const { setContext } = useAssistantState();
  const key = JSON.stringify(context);
  useEffect(() => {
    setContext(JSON.parse(key) as AssistantContext);
    return () => setContext({ kind: "workspace", id: null, title: "" });
  }, [key, setContext]);
}
export function AssistantButton({ className, label }: { className?: string; label?: string }) {
  const { t } = useT();
  const { setOpen } = useAssistantState();
  return (
    <WorkButton
      variant="outline"
      className={className}
      onClick={() => setOpen(true)}
      data-testid="sw-ai-open"
    >
      <Sparkles aria-hidden="true" />
      {label ?? t("sw.prog.ai.open")}
    </WorkButton>
  );
}
export function useAiAvailability() {
  const { user, workspace, canEdit } = useSecurityWorkspace();
  const read = useServerFn(getWorkAiStatus);
  const query = useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "ai-status"],
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data;
    },
  });
  return { ...query, available: Boolean(query.data?.enabled) && canEdit };
}

function SuggestionBody({ suggestion }: { suggestion: AiSuggestion }) {
  const { lang } = useT();
  const parsed = parseSuggestionContent(suggestion.kind as SuggestionKind, suggestion.content);
  if (!parsed.success) return null;
  const content = parsed.data as Record<string, unknown>;
  const list = (items: unknown) =>
    Array.isArray(items) && items.length > 0 ? (
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={index}>{String(item)}</li>
        ))}
      </ul>
    ) : null;
  switch (suggestion.kind) {
    case "mandate_draft":
      return (
        <>
          <p className="whitespace-pre-wrap">{String(content.text)}</p>
          {list(content.caveats)}
        </>
      );
    case "asset_suggestions":
      return (
        <ul className="space-y-2">
          {(content.assets as { name: string; category: string; reason: string }[]).map((asset) => (
            <li key={asset.name}>
              <span className="font-semibold">{asset.name}</span>{" "}
              <span className="text-xs text-muted-foreground">({asset.category})</span>
              <p className="text-muted-foreground">{asset.reason}</p>
            </li>
          ))}
        </ul>
      );
    case "risk_scenario":
      return (
        <>
          <p className="font-semibold">{String(content.threat_scenario)}</p>
          <p className="whitespace-pre-wrap">{String(content.description)}</p>
          {list(content.missing_information)}
          {list(content.questions)}
        </>
      );
    case "gap_action":
      return (
        <ul className="space-y-2">
          {(content.actions as { title: string; description: string; why: string }[]).map(
            (action) => (
              <li key={action.title}>
                <span className="font-semibold">{action.title}</span>
                <p>{action.description}</p>
                <p className="text-muted-foreground">{action.why}</p>
              </li>
            ),
          )}
        </ul>
      );
    case "report_narrative":
      return (
        <>
          {Object.entries(content.sections as Record<string, string>).map(([id, text]) => (
            <section key={id}>
              <h4 className="font-semibold">
                {REPORT_SECTION_TITLES[id as keyof typeof REPORT_SECTION_TITLES]?.[lang] ?? id}
              </h4>
              <p className="whitespace-pre-wrap">{text}</p>
            </section>
          ))}
          {list(content.caveats)}
        </>
      );
    case "question_list":
      return list(content.questions);
    default:
      return <p className="whitespace-pre-wrap">{String(content.text)}</p>;
  }
}

export function SecurityAssistantPanel() {
  const { t, lang } = useT();
  const l = useWorkText();
  const { workspace, user, canEdit } = useSecurityWorkspace();
  const queryClient = useQueryClient();
  const programme = useProgramme();
  const suggestions = programme.data?.suggestions ?? [];
  const onChanged = () =>
    void queryClient.invalidateQueries({ queryKey: programmeKey(user.id, workspace.id) });
  const { context, open, setOpen } = useAssistantState();
  const availability = useAiAvailability();
  const request = useServerFn(requestSecuritySuggestion);
  const decide = useServerFn(decideSecuritySuggestion);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<CapabilityId | null>(null);
  const capabilities = capabilitiesFor(context.kind);
  const here = suggestions.filter(
    (suggestion) =>
      suggestion.context_kind === context.kind &&
      (context.id === null ||
        suggestion.context_id === context.id ||
        suggestion.context_id === null),
  );
  useEffect(() => {
    setFallback(null);
    setError(null);
  }, [context.kind, context.id]);
  if (!open) return null;
  const ask = async (capability: CapabilityId) => {
    setError(null);
    if (!availability.available) {
      setFallback(capability);
      return;
    }
    setBusy(capability);
    try {
      const result = await request({
        data: {
          workspaceId: workspace.id,
          capability,
          contextKind: context.kind,
          contextId: context.id,
          requestText: question,
          requestId: crypto.randomUUID(),
        },
      });
      if (!result.ok) setError(result.code);
      else {
        setQuestion("");
        onChanged();
      }
    } finally {
      setBusy(null);
    }
  };
  const decideOn = async (
    suggestion: AiSuggestion,
    status: "approved" | "rejected",
    apply: Parameters<typeof decide>[0]["data"]["apply"],
  ) => {
    setBusy(suggestion.id);
    setError(null);
    try {
      const result = await decide({
        data: {
          workspaceId: workspace.id,
          suggestionId: suggestion.id,
          version: suggestion.version,
          status,
          decision_note: "",
          apply,
        },
      });
      if (!result.ok) setError(result.code);
      else onChanged();
    } finally {
      setBusy(null);
    }
  };
  const applyOptions = (
    suggestion: AiSuggestion,
  ): { label: string; apply: Parameters<typeof decide>[0]["data"]["apply"] }[] => {
    const parsed = parseSuggestionContent(suggestion.kind as SuggestionKind, suggestion.content);
    if (!parsed.success) return [];
    const content = parsed.data as Record<string, unknown>;
    if (suggestion.kind === "mandate_draft" && context.apply?.mandateVersion)
      return [
        {
          label: l("Godkänn och använd som uppdragstext", "Approve and use as mandate text"),
          apply: { kind: "mandate_document", version: context.apply.mandateVersion },
        },
      ];
    if (suggestion.kind === "asset_suggestions")
      return [
        {
          label: l(
            "Godkänn och lägg till alla som skyddsvärden",
            "Approve and add all as protected assets",
          ),
          apply: {
            kind: "assets",
            assets: (content.assets as { name: string; category: string; reason: string }[]).map(
              (asset) => ({
                name: asset.name,
                category: asset.category as "other",
                description: asset.reason,
              }),
            ),
          },
        },
      ];
    if (suggestion.kind === "risk_scenario" && context.apply?.riskId && context.apply.riskVersion)
      return [
        {
          label: l(
            "Godkänn och fyll i scenario och beskrivning",
            "Approve and fill in scenario and description",
          ),
          apply: {
            kind: "risk_scenario",
            riskId: context.apply.riskId,
            version: context.apply.riskVersion,
          },
        },
      ];
    if (suggestion.kind === "gap_action" && context.apply?.gapId)
      return [
        {
          label: l(
            "Godkänn och skapa åtgärderna (utan ägare och datum)",
            "Approve and create the actions (no owner or date yet)",
          ),
          apply: {
            kind: "actions",
            gapId: context.apply.gapId,
            actions: (content.actions as { title: string; description: string }[]).map(
              (action) => ({ title: action.title, description: action.description }),
            ),
          },
        },
      ];
    if (
      suggestion.kind === "report_narrative" &&
      context.apply?.reportId &&
      context.apply.reportVersion
    )
      return [
        {
          label: l(
            "Godkänn och lägg in som AI-utkast i rapporten",
            "Approve and place as AI draft in the report",
          ),
          apply: {
            kind: "report_narrative",
            reportId: context.apply.reportId,
            version: context.apply.reportVersion,
            sections: Object.keys(content.sections as object).filter(
              (id): id is (typeof REPORT_SECTIONS)[number] =>
                (REPORT_SECTIONS as readonly string[]).includes(id),
            ),
          },
        },
      ];
    return [];
  };
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="sw-ai-title"
      data-testid="sw-ai-panel"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[85dvh] overflow-y-auto border-t border-border bg-background shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:border-l lg:border-t-0"
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2
            id="sw-ai-title"
            className="flex items-center gap-2 font-display text-base font-semibold"
          >
            <Sparkles className="size-4 text-accent" aria-hidden="true" />
            {t("sw.prog.ai.name")}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {context.title || workspace.name}
          </p>
        </div>
        <WorkButton
          variant="ghost"
          className="p-2"
          aria-label={t("sw.nav.close")}
          onClick={() => setOpen(false)}
        >
          <X aria-hidden="true" />
        </WorkButton>
      </div>
      <div className="space-y-4 px-4 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{t("sw.prog.ai.notice")}</p>
        {!availability.isPending && !availability.available && (
          <p
            role="status"
            className="rounded-lg border border-border bg-secondary/40 p-3 text-sm"
            data-testid="sw-ai-unavailable"
          >
            {t("sw.prog.ai.unavailable")}
          </p>
        )}
        {canEdit && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t("sw.prog.ai.ask")}</p>
            <div className="flex flex-wrap gap-2">
              {capabilities.map((capability) => (
                <WorkButton
                  key={capability.id}
                  variant={fallback === capability.id ? "default" : "outline"}
                  className="text-left"
                  disabled={busy !== null}
                  onClick={() => void ask(capability.id)}
                  data-testid={`sw-ai-${capability.id}`}
                >
                  {capability.label[lang]}
                </WorkButton>
              ))}
            </div>
            {availability.available && (
              <TextAreaField
                label={l("Egen fråga eller precisering", "Your own question or detail")}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={2000}
                className="min-h-16"
              />
            )}
            {busy && capabilities.some((capability) => capability.id === busy) && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("sw.prog.ai.working")}
              </p>
            )}
            {fallback && (
              <div className={cn(panelClass, "text-sm")} data-testid="sw-ai-fallback">
                <p className="font-semibold">
                  {capabilities.find((capability) => capability.id === fallback)?.label[lang]}
                </p>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {capabilities.find((capability) => capability.id === fallback)?.fallback[lang]}
                </p>
              </div>
            )}
          </div>
        )}
        <WorkError
          code={error}
          message={error && error !== "ACCESS_DENIED" ? t("sw.prog.error.ai") : undefined}
        />
        {here.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t("sw.prog.ai.history")}</h3>
            {here.map((suggestion) => (
              <article
                key={suggestion.id}
                className={cn(panelClass, "space-y-3 text-sm")}
                data-testid="sw-ai-suggestion"
                data-status={suggestion.status}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      suggestion.status === "approved"
                        ? "bg-emerald-100 text-emerald-950"
                        : suggestion.status === "rejected"
                          ? "bg-secondary"
                          : "bg-amber-100 text-amber-950",
                    )}
                  >
                    {t(`sw.prog.ai.${suggestion.status as "proposed" | "approved" | "rejected"}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {suggestion.model} · {suggestion.prompt_version}
                  </span>
                </div>
                {suggestion.request_text && (
                  <p className="text-xs text-muted-foreground">“{suggestion.request_text}”</p>
                )}
                <SuggestionBody suggestion={suggestion} />
                <details className="text-xs text-muted-foreground">
                  <summary className="min-h-8 cursor-pointer">{t("sw.prog.ai.sources")}</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {(suggestion.source_records as { table: string; id: string }[]).map(
                      (record) => (
                        <li key={`${record.table}:${record.id}`}>
                          {record.table} · {record.id.slice(0, 8)}
                        </li>
                      ),
                    )}
                    {(suggestion.source_records as unknown[]).length === 0 && (
                      <li>{l("Endast frågetexten", "The question text only")}</li>
                    )}
                  </ul>
                </details>
                {canEdit && suggestion.status === "proposed" && (
                  <div className="flex flex-wrap gap-2">
                    {applyOptions(suggestion).map((option) => (
                      <WorkButton
                        key={option.label}
                        disabled={busy !== null}
                        onClick={() => void decideOn(suggestion, "approved", option.apply)}
                        data-testid="sw-ai-approve-apply"
                      >
                        {option.label}
                      </WorkButton>
                    ))}
                    <WorkButton
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void decideOn(suggestion, "approved", { kind: "none" })}
                      data-testid="sw-ai-approve"
                    >
                      {t("sw.prog.ai.approve")}
                    </WorkButton>
                    <WorkButton
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void decideOn(suggestion, "rejected", { kind: "none" })}
                      data-testid="sw-ai-reject"
                    >
                      {t("sw.prog.ai.reject")}
                    </WorkButton>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
