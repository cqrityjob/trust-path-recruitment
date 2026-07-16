import type { ReactNode } from "react";

export function ResultSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-6">
      <h4 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {title}
      </h4>
      <div className="mt-3 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}
