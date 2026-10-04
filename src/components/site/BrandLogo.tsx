import { cn } from "@/lib/utils";

/** The supplied wordmark, with its original proportions and accessible name. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/cqrityjob-logo.svg"
      alt="CQrityjob"
      width={1958}
      height={479}
      className={cn("block h-auto w-32 shrink-0 dark:brightness-0 dark:invert", className)}
    />
  );
}
