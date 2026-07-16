import type { ReactNode } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { cn } from "@/lib/utils";

export function AssessmentLayout({
  children,
  className,
  narrow = false,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <SiteLayout>
      <div className={cn("py-14 md:py-20", className)}>
        <Container className={narrow ? "max-w-3xl" : undefined}>{children}</Container>
      </div>
    </SiteLayout>
  );
}
