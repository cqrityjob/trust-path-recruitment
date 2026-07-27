import { Badge } from "./badge";
import { cn } from "@/lib/utils";

/**
 * Semantic status badge — maps common status tokens (draft, published, pending,
 * approved, rejected, archived, active, inactive, completed, in_progress, pilot,
 * expired, cancelled, sent, failed) to a consistent tone.
 *
 * Rendering only — no data changes. Pass the localized `label` from existing
 * i18n; the component just picks the visual tone.
 */
export type StatusTone =
  | "default"
  | "success"
  | "warning"
  | "info"
  | "destructive"
  | "neutral"
  | "secondary";

const STATUS_TONE: Record<string, StatusTone> = {
  draft: "neutral",
  pending: "warning",
  in_review: "warning",
  review: "warning",
  submitted: "info",
  sent: "info",
  in_progress: "info",
  invited: "info",
  active: "success",
  approved: "success",
  published: "success",
  completed: "success",
  succeeded: "success",
  ok: "success",
  pilot: "info",
  rejected: "destructive",
  failed: "destructive",
  cancelled: "destructive",
  canceled: "destructive",
  expired: "neutral",
  archived: "neutral",
  inactive: "neutral",
};

function toneFor(status: string): StatusTone {
  return STATUS_TONE[status.toLowerCase().replace(/[\s-]+/g, "_")] ?? "neutral";
}

const DOT_TONE: Record<StatusTone, string> = {
  default: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground/60",
  secondary: "bg-foreground/50",
};

export function StatusBadge({
  status,
  label,
  tone,
  showDot = true,
  className,
}: {
  status: string;
  label: string;
  tone?: StatusTone;
  showDot?: boolean;
  className?: string;
}) {
  const resolved = tone ?? toneFor(status);
  const variant =
    resolved === "success"
      ? "success"
      : resolved === "warning"
        ? "warning"
        : resolved === "info"
          ? "info"
          : resolved === "destructive"
            ? "destructive"
            : resolved === "secondary"
              ? "secondary"
              : "neutral";
  return (
    <Badge variant={variant as never} className={cn("gap-1.5", className)}>
      {showDot ? (
        <span className={cn("h-1.5 w-1.5 rounded-full", DOT_TONE[resolved])} aria-hidden="true" />
      ) : null}
      {label}
    </Badge>
  );
}