import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionBand({
  children,
  tone = "ivory",
  id,
  className,
}: {
  children: ReactNode;
  tone?: "ivory" | "ice" | "navy";
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "cq-section-band",
        tone === "ivory" && "bg-[var(--cq-ivory)] text-[var(--cq-text)]",
        tone === "ice" && "bg-[var(--cq-ice)] text-[var(--cq-text)]",
        tone === "navy" && "bg-[var(--cq-navy)] text-[var(--cq-ivory)]",
        className,
      )}
    >
      <div className="cq-page">{children}</div>
    </section>
  );
}
