import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSecuritySupplier,
  getSecuritySupplierRequest,
  getSecuritySuppliers,
  getSecurityWorkQueue,
} from "@/lib/security-work/suppliers/functions";
import type {
  RequestDetail,
  SupplierDetail,
  SuppliersOverview,
} from "@/lib/security-work/suppliers/services";
import type { QueueItem } from "@/lib/security-work/suppliers/model";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { cn } from "@/lib/utils";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";

type Outcome<T> = { ok: true; data: T } | { ok: false; code: string };

export const suppliersKey = (userId: string, workspaceId: string) =>
  [...securityWorkKeys.workspace(userId, workspaceId), "suppliers"] as const;

function useRead<T>(
  key: readonly unknown[],
  run: () => Promise<Outcome<unknown>>,
  workspaceLevel = false,
) {
  const { deny } = useSecurityWorkspace();
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async () => {
      const result = await run();
      if (!result.ok) throw new Error(result.code);
      return result.data as T;
    },
  });
  useEffect(() => {
    // Losing the workspace sends the person out; a single record out of reach does not.
    if (workspaceLevel && query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error, deny, workspaceLevel]);
  return query;
}

export function useSuppliers() {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getSecuritySuppliers);
  return useRead<SuppliersOverview>(
    suppliersKey(user.id, workspace.id),
    () => read({ data: { workspaceId: workspace.id } }),
    true,
  );
}
export function useSupplier(assetId: string) {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getSecuritySupplier);
  return useRead<SupplierDetail>(
    [...suppliersKey(user.id, workspace.id), "supplier", assetId],
    () => read({ data: { workspaceId: workspace.id, assetId } }),
  );
}
/** A request the person may not see answers exactly like one that does not exist. */
export function useSupplierRequest(requestId: string) {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getSecuritySupplierRequest);
  return useRead<RequestDetail>(
    [...suppliersKey(user.id, workspace.id), "request", requestId],
    () => read({ data: { workspaceId: workspace.id, requestId } }),
  );
}
export function useWorkQueue() {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getSecurityWorkQueue);
  return useRead<{ items: QueueItem[]; generatedAt: string }>(
    [...suppliersKey(user.id, workspace.id), "queue"],
    () => read({ data: { workspaceId: workspace.id } }),
    true,
  );
}

/**
 * A lifecycle command keeps its operation id until it succeeds: a retry after
 * a network error repeats the same operation, and the database replays it
 * instead of doing it twice. The form keeps its input on any error.
 */
export function useSupplierCommand<Full extends { operationId: string }, Output>(
  action: (input: { data: Full }) => Promise<Outcome<Output>>,
) {
  const operation = useRef<string>(crypto.randomUUID());
  return useWrite<Omit<Full, "operationId">, Output>(
    (input) => action({ data: { ...input, operationId: operation.current } as Full }),
    (succeeded, code) => {
      // Success, or a refusal that is final for this input: the next attempt is new.
      if (succeeded || code !== "SAVE_FAILED") operation.current = crypto.randomUUID();
    },
  );
}
/** A plain write (profile, contract, decision, review). */
export function useSupplierWrite<Input extends object, Output>(
  action: (input: { data: Input }) => Promise<Outcome<Output>>,
) {
  return useWrite<Input, Output>((input) => action({ data: input }));
}
function useWrite<Input, Output>(
  run: (input: Input) => Promise<Outcome<Output>>,
  settled?: (succeeded: boolean, code?: string) => void,
) {
  const queryClient = useQueryClient();
  const { user, workspace, refresh } = useSecurityWorkspace();
  return useMutation<Output, Error, Input>({
    mutationFn: async (input) => {
      const result = await run(input).catch(() => ({ ok: false as const, code: "SAVE_FAILED" }));
      if (!result.ok) throw new Error(result.code);
      return result.data;
    },
    onSuccess: async () => {
      settled?.(true);
      await queryClient.invalidateQueries({
        queryKey: securityWorkKeys.workspace(user.id, workspace.id),
      });
      await refresh();
    },
    onError: (error) => settled?.(false, error.message),
  });
}

export function useSupplierText() {
  const l = useWorkText();
  return {
    l,
    status: (status: string) =>
      ({
        draft: l("Utkast", "Draft"),
        ready_to_send: l("Godkänd att skicka", "Approved to send"),
        awaiting_response: l("Väntar på svar", "Awaiting response"),
        in_progress: l("Pågår hos leverantören", "In progress at supplier"),
        awaiting_verification: l("Väntar på er verifiering", "Awaiting your verification"),
        needs_revision: l("Komplettering begärd", "Revision requested"),
        accepted: l("Verifierad och godkänd", "Verified and accepted"),
        withdrawn: l("Återkallad", "Withdrawn"),
      })[status] ?? status,
    basis: (kind: string) =>
      ({
        information: l("Informationsbegäran", "Request for information"),
        contract_obligation: l("Befintlig avtalsförpliktelse", "Existing contractual obligation"),
        deviation: l("Avvikelse mot krav", "Deviation from a requirement"),
        change_order: l("Ändring/ny beställning", "Change or new order"),
      })[kind] ?? kind,
    decision: (kind: string) =>
      ({
        investigate: l("Utred", "Investigate"),
        remediate: l("Åtgärda", "Remediate"),
        defer: l("Avvakta med uppföljningsdatum", "Defer with a review date"),
        accept_risk: l("Acceptera risk", "Accept risk"),
        no_action: l("Ingen åtgärd", "No action"),
        scope_cost: l("Omfattnings- och kostnadsbeslut", "Scope and cost decision"),
        temporary_protection: l("Tillfälligt skydd", "Temporary protection"),
        close_with_deviation: l(
          "Avsluta med dokumenterad avvikelse",
          "Close with a documented deviation",
        ),
      })[kind] ?? kind,
    response: (kind: string) =>
      ({
        acknowledged: l("Mottagen", "Acknowledged"),
        plan: l("Plan", "Plan"),
        question: l("Fråga", "Question"),
        objection: l("Invändning", "Objection"),
        done: l("Uppger att det är klart", "Reports it done"),
      })[kind] ?? kind,
    origin: (kind: string) =>
      ({
        email: l("e-post", "email"),
        phone: l("telefon", "phone"),
        meeting: l("möte", "meeting"),
        letter: l("brev", "letter"),
        other: l("annat", "other"),
      })[kind] ?? kind,
    relation: (kind: string) =>
      ({
        supplied_by: l("levereras av", "supplied by"),
        depends_on: l("beror på", "depends on"),
        located_at: l("finns på", "located at"),
        runs_on: l("körs på", "runs on"),
      })[kind] ?? kind,
    impact: (kind: string) =>
      ({
        unconfirmed: l("Påverkan obekräftad", "Impact unconfirmed"),
        confirmed: l("Påverkan bekräftad", "Impact confirmed"),
        ruled_out: l("Påverkan utesluten", "Impact ruled out"),
      })[kind] ?? kind,
    event: (kind: string) =>
      ({
        created: l("Begäran skapad", "Request created"),
        edited: l("Innehåll ändrat", "Content changed"),
        share_approved: l("Extern version godkänd", "External version approved"),
        dispatched: l("Utskick registrerat", "Dispatch recorded"),
        response_recorded: l("Svar registrerat", "Response recorded"),
        objection_recorded: l("Invändning registrerad", "Objection recorded"),
        verified: l("Verifierad och godkänd", "Verified and accepted"),
        needs_revision: l("Komplettering begärd", "Revision requested"),
        reopened: l("Återöppnad", "Reopened"),
        withdrawn: l("Återkallad", "Withdrawn"),
        due_changed: l("Datum ändrat", "Date changed"),
      })[kind] ?? kind,
    error: (code: string | undefined) =>
      !code
        ? undefined
        : (
            {
              SHARE_RIGHT_REQUIRED: l(
                "Bara den som har rätt att dela externt kan godkänna vad som lämnar plattformen. Be en ägare om rätten, eller be den som har den att godkänna.",
                "Only someone with the external sharing right can approve what leaves the platform. Ask an owner for the right, or ask someone who has it to approve.",
              ),
              APPROVED_SHARE_REQUIRED: l(
                "Det finns ingen godkänd extern version att skicka. Godkänn den aktuella versionen först.",
                "There is no approved external version to send. Approve the current version first.",
              ),
              SUPPLIER_VERIFICATION_REQUIRED: l(
                "Åtgärden kan inte avslutas förrän varje leverantörsbegäran är verifierad eller återkallad, eller en godkännare har dokumenterat en avvikelse.",
                "The action cannot be completed until every supplier request is verified or withdrawn, or an approver has documented a deviation.",
              ),
              SEPARATE_VERIFIER_REQUIRED: l(
                "Ärendet kräver en separat verifierare: någon annan än intern ansvarig, den som skapade begäran och den som registrerade svaret.",
                "This request needs a separate verifier: someone other than its internal owner, its creator and whoever recorded the response.",
              ),
              SEPARATE_VERIFIER_LOCKED: l(
                "Kravet på separat verifierare och intern ansvarig ligger fast för ärendet.",
                "The separate-verifier requirement and the internal owner are fixed for this request.",
              ),
              CONFIRMED_OBLIGATION_REQUIRED: l(
                "Kravet är inte bekräftat, eller avtalet inte verifierat. En godkännare behöver bekräfta det innan det kan åberopas.",
                "The requirement is not confirmed, or the contract not verified. An approver needs to confirm it before it can be relied on.",
              ),
              SCOPE_COST_DECISION_REQUIRED: l(
                "En beställning kräver ett omfattnings- och kostnadsbeslut med belopp och mandat. Registrera beslutet först.",
                "An order needs a scope and cost decision with amount and mandate. Record the decision first.",
              ),
              LATEST_DONE_RESPONSE_REQUIRED: l(
                "Det finns ett nyare svar. Verifiera det senaste svaret.",
                "There is a newer response. Verify the latest one.",
              ),
              REASON_REQUIRED: l("Ange en motivering.", "Give a reason."),
              ACTION_CLOSED: l(
                "Åtgärden är redan avslutad. Skapa en ny åtgärd för fortsatt arbete.",
                "The action is already closed. Create a new action for further work.",
              ),
              ACTIVE_SUPPLIER_REQUIRED: l(
                "Leverantören är avslutad eller saknar profil.",
                "The supplier has ended or has no profile.",
              ),
              ACTIVE_OWNER_REQUIRED: l(
                "Intern ansvarig måste vara en aktiv redigerare eller ägare i arbetsytan.",
                "The internal owner must be an active editor or owner in the workspace.",
              ),
              IMPACT_NOTE_REQUIRED: l(
                "Beskriv vad som kontrollerades.",
                "Describe what was checked.",
              ),
              EVIDENCE_NOT_IN_WORKSPACE: l(
                "Underlaget finns inte i arbetsytan.",
                "The evidence is not in this workspace.",
              ),
              SUPPLIER_ASSET_REQUIRED: l(
                "Bara ett skyddsvärde av typen leverantör kan få en leverantörsprofil.",
                "Only an asset of category supplier can have a supplier profile.",
              ),
              CONTRACT_KEY_IN_USE: l(
                "Avtalsbeteckningen används redan för en annan leverantör.",
                "The contract key is already used for another supplier.",
              ),
              OWNER_REQUIRED: l(
                "Bara en ägare av arbetsytan kan ändra delningsrätten.",
                "Only a workspace owner can change the sharing right.",
              ),
              APPROVER_REQUIRED: l(
                "Det här kräver godkännanderätt. Be en godkännare i arbetsytan.",
                "This needs the approval right. Ask an approver in the workspace.",
              ),
              IDEMPOTENCY_CONFLICT: l(
                "Åtgärden har redan registrerats på annat sätt. Ladda om sidan.",
                "This operation was already recorded differently. Reload the page.",
              ),
              NOT_FOUND: l(
                "Begäran finns inte eller är inte tillgänglig för dig.",
                "The request does not exist or is not available to you.",
              ),
            } as Record<string, string>
          )[code],
  };
}

const tone: Record<string, string> = {
  accepted:
    "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100",
  withdrawn: "bg-secondary text-muted-foreground border-border",
  awaiting_verification:
    "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100",
  needs_revision:
    "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100",
};
export function RequestStatusBadge({ status }: { status: string }) {
  const text = useSupplierText();
  return (
    <span
      data-testid="sw-request-status"
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone[status] ?? "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-100",
      )}
    >
      {text.status(status)}
    </span>
  );
}
