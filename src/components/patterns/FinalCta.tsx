import type { ReactNode } from "react";

export function FinalCta({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[640px] text-center">{children}</div>;
}
