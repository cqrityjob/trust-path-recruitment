import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { getWorkPortfolio } from "@/lib/security-work/analysis.functions";
import { riskColour, type RiskColour } from "@/lib/security-work/analysis-model";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useSecurityWorkspace } from "./context";

export function useWorkText() {
  const { lang } = useT();
  return (sv: string, en: string) => (lang === "sv" ? sv : en);
}
export function usePortfolio() {
  const { user, workspace, deny } = useSecurityWorkspace();
  const read = useServerFn(getWorkPortfolio);
  const query = useQuery({
    queryKey: [...securityWorkKeys.workspace(user.id, workspace.id), "portfolio"],
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data;
    },
  });
  useEffect(() => {
    if (query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error]);
  return query;
}
export function useSavedOperation() {
  const { refresh, deny } = useSecurityWorkspace();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  async function run<T>(
    operation: () => Promise<{ ok: true; data: T } | { ok: false; code: string }>,
  ): Promise<T | null> {
    setState("saving");
    setError(null);
    try {
      const result = await operation();
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") deny();
        throw new Error(result.code);
      }
      setState("saved");
      await refresh();
      return result.data;
    } catch (failure) {
      setState("error");
      setError(failure instanceof Error ? failure.message : "SAVE_FAILED");
      return null;
    }
  }
  return {
    state,
    error,
    run,
    clear: () => {
      setState("idle");
      setError(null);
    },
  };
}
export function SaveStatus({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  const l = useWorkText();
  return (
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {state === "saving"
        ? l("Sparar…", "Saving…")
        : state === "saved"
          ? l("Sparat", "Saved")
          : state === "error"
            ? l("Inte sparat. Försök igen.", "Not saved. Please retry.")
            : ""}
    </p>
  );
}
export function WorkStatus({ status }: { status: string }) {
  const l = useWorkText();
  const labels: Record<string, [string, string]> = {
    draft: ["Utkast", "Draft"],
    in_review: ["För granskning", "In review"],
    approved: ["Godkänd", "Approved"],
    archived: ["Arkiverad", "Archived"],
    exported: ["Exporterad", "Exported"],
    proposed: ["Förslag", "Proposed"],
    accepted: ["Accepterad", "Accepted"],
    closed: ["Avslutad", "Closed"],
    open: ["Öppen", "Open"],
    in_progress: ["Pågår", "In progress"],
    blocked: ["Blockerad", "Blocked"],
    completed: ["Slutförd", "Completed"],
    cancelled: ["Avbruten", "Cancelled"],
    pending: ["Att granska", "Awaiting review"],
    rejected: ["Avvisad", "Rejected"],
  };
  const label = labels[status];
  return (
    <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
      {label ? l(...label) : status}
    </span>
  );
}
export function RiskRating({
  likelihood,
  consequence,
  colourOverride,
}: {
  likelihood: number | null;
  consequence: number | null;
  colourOverride?: RiskColour | null;
}) {
  const l = useWorkText();
  const colour =
    colourOverride === undefined ? riskColour(likelihood, consequence) : colourOverride;
  const labels = {
    green: l("Grön", "Green"),
    yellow: l("Gul", "Yellow"),
    orange: l("Orange", "Orange"),
    red: l("Röd", "Red"),
  };
  const styles = {
    green: "bg-emerald-100 text-emerald-950",
    yellow: "bg-amber-100 text-amber-950",
    orange: "bg-orange-100 text-orange-950",
    red: "bg-red-100 text-red-950",
  };
  return (
    <span
      className={`inline-flex rounded-md px-3 py-1 text-sm font-medium ${colour ? styles[colour] : "bg-secondary text-foreground"}`}
    >
      {colour
        ? `${labels[colour]} · S ${likelihood} / K ${consequence}`
        : likelihood !== null && consequence !== null
          ? `S ${likelihood} / K ${consequence}`
          : l("Okänt — saknar bedömning", "Unknown — assessment missing")}
    </span>
  );
}
