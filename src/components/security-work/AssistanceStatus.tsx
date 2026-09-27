import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkAiStatus } from "@/lib/security-work/ai.functions";
import { getWorkProcessingStatus } from "@/lib/security-work/documents.functions";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityWorkspace } from "./context";
import { useWorkText } from "./analysis-ui";
import { WorkError } from "./ui";

export function useProcessingStatus() {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getWorkProcessingStatus);
  return useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "processing-status"],
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data;
    },
  });
}

export function AssistanceStatus() {
  const l = useWorkText();
  const { user, workspace, canEdit } = useSecurityWorkspace();
  const readAi = useServerFn(getWorkAiStatus);
  const processing = useProcessingStatus();
  const ai = useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "ai-status"],
    retry: false,
    queryFn: async () => {
      const result = await readAi({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data;
    },
  });
  // ── WHAT THE TWO LINES MAY SAY (MVP text specification §9.2) ─────────
  //
  // Each state is read from the existing server check and said as a whole
  // sentence. A failed read is its own state — never "not available" — and
  // "available" means the switch is on for this workspace, not that the
  // provider is healthy right now, so nothing here says "AI fungerar".
  // A reader without edit rights cannot request either, so for them both
  // read as not available here, beside the read-only line below.
  const aiLine = ai.isPending
    ? l("Kontrollerar tillgänglighet…", "Checking availability…")
    : ai.isError
      ? l(
          "AI-stödets tillgänglighet kunde inte kontrolleras. Försök igen.",
          "AI availability could not be checked. Try again.",
        )
      : ai.data?.enabled && canEdit
        ? l(
            "AI-stöd är tillgängligt i den här arbetsytan.",
            "AI assistance is available in this workspace.",
          )
        : l(
            "AI-stöd är inte tillgängligt här just nu. Du kan fortsätta med egna underlag, bedömningar och rapporter.",
            "AI assistance is not available here right now. You can continue with your own evidence, assessments and reports.",
          );
  const documentLine = processing.isPending
    ? l("Kontrollerar tillgänglighet…", "Checking availability…")
    : processing.isError
      ? l(
          "Tillgängligheten för textutvinning kunde inte kontrolleras. Försök igen.",
          "Text extraction availability could not be checked. Try again.",
        )
      : processing.data?.enabled && canEdit
        ? l(
            "Textutvinning från PDF och DOCX är tillgänglig. Granska utdragen innan du använder dem.",
            "Text extraction from PDF and DOCX is available. Review the extracts before using them.",
          )
        : l(
            "Automatisk textutvinning är inte tillgänglig här just nu. Du kan registrera relevanta utdrag manuellt.",
            "Automatic text extraction is not available here right now. You can enter relevant extracts manually.",
          );
  return (
    <div className="space-y-2 text-sm" data-testid="sw-assistance-status">
      <div className="space-y-1" role="status">
        <p data-sw-status="ai">{aiLine}</p>
        <p data-sw-status="documents">{documentLine}</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {canEdit
          ? l(
              "AI kan föreslå frågor, kunskapsluckor, utkast och åtgärder. Du granskar förslagen, väljer vad du använder och godkänner rapporten separat.",
              "AI can suggest questions, information gaps, drafts and actions. You review the suggestions, choose what to use and approve the report separately.",
            )
          : l(
              "Du har läsbehörighet i arbetsytan. Du kan granska sparat arbete; en ägare eller redaktör kan lägga till underlag och begära AI-stöd.",
              "You have read-only access to this workspace. You can review saved work; an owner or editor can add evidence and request AI assistance.",
            )}
      </p>
      {(ai.isError || processing.isError) && (
        <WorkError
          code={ai.error?.message ?? processing.error?.message}
          // A failed status READ is not a failed save: the generic fallback
          // ("could not be saved") would misreport it. Access keeps its own
          // message.
          message={
            (ai.error?.message ?? processing.error?.message) === "ACCESS_DENIED"
              ? undefined
              : l(
                  "Uppgifterna kunde inte hämtas just nu. Försök igen.",
                  "The information could not be loaded right now. Try again.",
                )
          }
          onRetry={() => {
            void ai.refetch();
            void processing.refetch();
          }}
        />
      )}
    </div>
  );
}
