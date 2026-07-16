import { ArrowDown, Circle } from "lucide-react";

export function CareerRoadmap({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={`${step}-${i}`}>
          <div className="flex items-center gap-4 rounded-lg border border-border bg-background px-5 py-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-xs font-medium text-muted-foreground">
              {i + 1}
            </div>
            <span className="text-sm font-medium text-foreground">{step}</span>
            <Circle className="ml-auto h-3 w-3 text-accent/60" strokeWidth={2} />
          </div>
          {i < steps.length - 1 && (
            <div className="my-1 flex justify-center text-muted-foreground/60">
              <ArrowDown className="h-4 w-4" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
