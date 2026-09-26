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
  const status = (loading: boolean, error: boolean, enabled?: boolean) =>
    loading
      ? l("kontrollerar…", "checking…")
      : error
        ? l("kunde inte kontrolleras", "could not be checked")
        : enabled && canEdit
          ? l("tillgängligt", "available")
          : l("inte tillgängligt", "unavailable");
  return (
    <div className="space-y-2 text-sm" data-testid="sw-assistance-status">
      <p className="flex flex-wrap gap-x-5 gap-y-1" role="status">
        <span>
          {l("AI-stöd", "AI assistance")}:{" "}
          <strong>{status(ai.isPending, ai.isError, ai.data?.enabled)}</strong>
        </span>
        <span>
          {l("PDF/DOCX till text", "PDF/DOCX to text")}:{" "}
          <strong>
            {status(processing.isPending, processing.isError, processing.data?.enabled)}
          </strong>
        </span>
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {canEdit
          ? l(
              "Du kan alltid arbeta med manuellt registrerade utdrag och egna bedömningar. När AI är tillgängligt kan det föreslå kunskapsluckor, frågor, källbelagda utkast och åtgärder. Du väljer vad som förs in och godkänner rapporten separat.",
              "You can work with manually entered extracts and your own assessments. When available, AI can suggest gaps, questions, sourced drafts and actions. You choose what to apply and approve the report separately.",
            )
          : l(
              "Du har läsbehörighet. Du kan granska sparat arbete; en ägare eller redaktör kan lägga till underlag och begära AI-stöd när det är tillgängligt.",
              "You have read-only access. You can review saved work; an owner or editor can add evidence and request AI assistance when available.",
            )}
      </p>
      {(ai.isError || processing.isError) && (
        <WorkError
          code={ai.error?.message ?? processing.error?.message}
          onRetry={() => {
            void ai.refetch();
            void processing.refetch();
          }}
        />
      )}
    </div>
  );
}
