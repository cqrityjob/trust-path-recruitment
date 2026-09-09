import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({
  tone = "primary",
  variant = "lockup",
  className,
}: {
  tone?: "primary" | "reversed";
  variant?: "lockup" | "mark";
  className?: string;
}) {
  const colour = tone === "reversed" ? "text-[var(--cq-ivory)]" : "text-[var(--cq-navy)]";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center",
        variant === "lockup" ? "h-6 w-[132px] gap-2" : "h-6 w-6 justify-center",
        colour,
        className,
      )}
      role="img"
      aria-label="CQrityjob"
    >
      <ShieldCheck
        className="h-6 w-6 shrink-0 text-[var(--cq-blue)]"
        strokeWidth={1.8}
        aria-hidden="true"
      />
      {variant === "lockup" && (
        <span className="whitespace-nowrap font-[Sora] text-[18px] font-semibold leading-none tracking-[-0.025em]">
          CQrityjob
        </span>
      )}
    </span>
  );
}
