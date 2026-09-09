import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SplitHero({
  copy,
  scene,
  className,
}: {
  copy: ReactNode;
  scene: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid items-center gap-10 lg:grid-cols-12 lg:gap-8 xl:gap-10", className)}>
      <div className="lg:col-span-7 lg:max-w-[560px]">{copy}</div>
      <div className="lg:col-span-5">{scene}</div>
    </div>
  );
}
