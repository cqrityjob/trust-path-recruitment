import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { inView, type QueueKind, type RoleView } from "@/lib/security-work/suppliers/model";
import { useSecurityWorkspace } from "../context";
import { panelClass } from "../ui";
import { useSupplierText, useWorkQueue } from "./supplier-ui";

const VIEW_KEY = "cqrityjob.sw.view";

/**
 * What needs someone now, in the plan's order. Every row opens the step that
 * resolves it. The professional view only filters; it never widens access,
 * and every count comes from records this person may already read.
 */
export function WorkQueue() {
  const query = useWorkQueue();
  const { l } = useSupplierText();
  const { workspace, user } = useSecurityWorkspace();
  const [view, setView] = useState<RoleView>("all");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "security" || saved === "cyber" || saved === "all") setView(saved);
    } catch {
      /* a per-viewer convenience only */
    }
  }, []);
  const choose = (next: RoleView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const label: Record<QueueKind, string> = {
    needs_assessment: l("Behöver din bedömning", "Needs your assessment"),
    awaiting_decision: l("Väntar på beslut", "Awaiting a decision"),
    supplier_response_missing: l("Leverantörssvar som saknas", "Missing supplier responses"),
    needs_verification: l("Underlag att verifiera", "Evidence to verify"),
    overdue_action: l("Försenade åtgärder", "Overdue actions"),
    coverage_gap: l("Bevakningsluckor", "Monitoring gaps"),
  };
  const items = (query.data?.items ?? []).filter((i) => inView(view, i.categories));
  const kinds = [...new Set(items.map((i) => i.kind))];
  return (
    <section
      className={`${panelClass} space-y-4`}
      data-testid="sw-work-queue"
      aria-labelledby="sw-queue-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="sw-queue-heading" className="font-display text-lg font-semibold">
          {l("Att göra nu", "To do now")}
        </h2>
        <div role="group" aria-label={l("Vy", "View")} className="flex flex-wrap gap-1">
          {(
            [
              ["all", l("Alla", "All")],
              ["security", l("Säkerhetschef", "Security manager")],
              ["cyber", l("CISO", "CISO")],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              data-testid={`sw-view-${value}`}
              onClick={() => choose(value)}
              className={`min-h-11 rounded-md border px-3 text-sm ${view === value ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">{l("Hämtar…", "Loading…")}</p>
      ) : query.error ? (
        <p className="text-sm text-destructive">
          {l(
            "Arbetslistan kunde inte hämtas. Ladda om sidan.",
            "The work list could not be loaded. Reload the page.",
          )}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="sw-work-queue-empty">
          {l(
            "Inget väntar på er i den här vyn just nu.",
            "Nothing is waiting for you in this view right now.",
          )}
        </p>
      ) : (
        <div className="space-y-4">
          {kinds.map((kind) => (
            <div key={kind} data-testid="sw-queue-group" data-kind={kind}>
              <h3 className="text-sm font-semibold">
                {label[kind]} ({items.filter((i) => i.kind === kind).length})
              </h3>
              <ul className="mt-1 space-y-1">
                {items
                  .filter((i) => i.kind === kind)
                  .slice(0, 8)
                  .map((i) => (
                    <li key={`${i.kind}-${i.id}`} className="text-sm">
                      <Link
                        to={`/security-work/$workspaceId${i.to}` as never}
                        params={{ workspaceId: workspace.id } as never}
                        className="text-primary underline"
                        data-testid="sw-queue-item"
                      >
                        {i.title ||
                          (i.kind === "coverage_gap"
                            ? l(
                                "Ingen officiell källa är ansluten",
                                "No official source is connected",
                              )
                            : "—")}
                      </Link>
                      {i.due && <span className="text-muted-foreground"> · {i.due}</span>}
                      {i.owner === user.id && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {l("du ansvarar", "you own it")}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
