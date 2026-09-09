import type { ReactNode } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { cn } from "@/lib/utils";

export function AssessmentLayout({
  children,
  className,
  narrow = false,
  chrome = true,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
  /** Whether this layout supplies the site chrome itself.
   *
   *  It does everywhere except inside a shell that already has: the My
   *  Career shell mounts <SiteLayout> for every route under /my-career, so
   *  the saved career report — which lives there and takes this layout's
   *  rhythm — would otherwise render a second header and a second footer.
   *  Padding and width are unaffected either way. */
  chrome?: boolean;
}) {
  const body = (
    <div className={cn("py-14 md:py-20", className)}>
      <Container className={narrow ? "max-w-3xl" : undefined}>{children}</Container>
    </div>
  );
  return chrome ? <SiteLayout>{body}</SiteLayout> : body;
}
