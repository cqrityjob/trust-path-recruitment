import type { ReactNode } from "react";
import { PublicShell } from "@/components/patterns/PublicShell";

export function SiteLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
