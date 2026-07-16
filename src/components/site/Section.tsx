import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./Container";

export function Section({
  children,
  className,
  containerClassName,
  as: Tag = "section",
  bordered = false,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  as?: "section" | "div" | "header" | "footer";
  bordered?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "py-20 md:py-28",
        bordered && "border-t border-border",
        className,
      )}
    >
      <Container className={containerClassName}>{children}</Container>
    </Tag>
  );
}