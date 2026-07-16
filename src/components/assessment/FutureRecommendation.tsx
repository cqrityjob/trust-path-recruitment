import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function FutureRecommendation({
  title,
  body,
  to,
  icon,
  soon = false,
}: {
  title: string;
  body: string;
  to?: string;
  icon: ReactNode;
  soon?: boolean;
}) {
  const inner = (
    <div className="group flex h-full flex-col gap-4 rounded-lg border border-border bg-background p-6 transition-colors hover:border-accent/60 hover:bg-muted/40">
      <div className="flex items-start justify-between">
        <span className="text-accent">{icon}</span>
        {soon ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Coming soon
          </span>
        ) : (
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
        )}
      </div>
      <div>
        <h4 className="text-base font-semibold tracking-tight text-foreground">{title}</h4>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
  if (to && !soon) {
    return (
      <Link to={to} className={cn("block h-full")}>
        {inner}
      </Link>
    );
  }
  return <div className={cn("h-full", soon && "cursor-not-allowed opacity-80")}>{inner}</div>;
}
