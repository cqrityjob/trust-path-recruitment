import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ProductScene({
  children,
  caption,
  className,
}: {
  children: ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={cn("cq-product-scene", className)} aria-hidden="true">
      {children}
      {caption && (
        <figcaption className="cq-caption mt-4 text-[var(--cq-text-muted)]">{caption}</figcaption>
      )}
    </figure>
  );
}
