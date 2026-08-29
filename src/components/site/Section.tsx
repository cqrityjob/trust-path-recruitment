import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./Container";

export function Section({
  children,
  className,
  containerClassName,
  as: Tag = "section",
  bordered = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  as?: "section" | "div" | "header" | "footer";
  bordered?: boolean;
  /** Anchor target. The Career Center hub's "Utforska yrken" CTA scrolls to
   *  its own explorer section rather than to an empty marker div. */
  id?: string;
}) {
  return (
    <Tag id={id} className={cn("py-20 md:py-28", bordered && "border-t border-border", className)}>
      <Container className={containerClassName}>{children}</Container>
    </Tag>
  );
}
