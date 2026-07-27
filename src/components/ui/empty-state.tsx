import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable empty state — icon + title + description + optional action.
 * Presentation only; consumers pass their own copy and CTA.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}