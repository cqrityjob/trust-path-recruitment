import { cn } from "@/lib/utils";

export type TrustPathStage = { title: string; body: string };

export function TrustPath({
  stages,
  onDark = false,
}: {
  stages: readonly TrustPathStage[];
  onDark?: boolean;
}) {
  return (
    <ol className={cn("cq-trust-path", onDark && "cq-trust-path--dark")}>
      {stages.map((stage, index) => (
        <li key={stage.title} className="cq-trust-path__stage">
          <span className="cq-trust-path__node" aria-hidden="true">
            {index + 1}
          </span>
          <div>
            <h3 className="cq-h3">{stage.title}</h3>
            <p
              className={cn(
                "cq-caption mt-2",
                onDark ? "text-[var(--cq-on-navy-muted)]" : "text-[var(--cq-text-muted)]",
              )}
            >
              {stage.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
