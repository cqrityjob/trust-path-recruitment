import { useId, useRef, type ReactNode, type ComponentProps } from "react";
import { useBlocker } from "@tanstack/react-router";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

export const controlClass = "min-h-11 min-w-11";
export const panelClass = "rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6";
export const selectClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";

export function WorkButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      size="lg"
      className={cn(controlClass, "whitespace-normal motion-reduce:transition-none", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string, hintId?: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {children(id, hint ? `${id}-hint` : undefined)}
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {(id, hintId) => (
        <Input
          {...props}
          id={id}
          aria-describedby={hintId}
          className={cn(controlClass, props.className)}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  ...props
}: ComponentProps<typeof Textarea> & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {(id, hintId) => (
        <Textarea
          {...props}
          id={id}
          aria-describedby={hintId}
          className={cn("min-h-24", props.className)}
        />
      )}
    </Field>
  );
}

export function PageHeading({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0">
        <h1 className="break-words font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {body && (
          <p className="mt-2 max-w-2xl break-words text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-6 sm:p-8">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-2xl break-words text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function SafetyNotice() {
  const { t } = useT();
  return (
    <aside className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-4 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{t("sw.notice")}</p>
    </aside>
  );
}

export function LoadingState() {
  const { t } = useT();
  return (
    <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {t("sw.loading")}
    </p>
  );
}

export function WorkError({ code, onRetry }: { code?: string | null; onRetry?: () => void }) {
  const { t } = useT();
  if (!code) return null;
  const message =
    code === "ACCESS_DENIED"
      ? t("sw.error.accessBody")
      : code === "CONFLICT" || code === "IDEMPOTENCY_CONFLICT"
        ? t("sw.error.conflict")
        : code === "REQUIREMENT_IN_USE"
          ? t("sw.error.linked")
          : code === "INBOX_PENDING"
            ? t("sw.error.partial")
            : code === "REFERENCE_CHANGED"
              ? t("sw.error.reference")
              : code === "INVALID_INPUT"
                ? t("sw.error.invalid")
                : code === "SOURCE_INACTIVE"
                  ? t("sw.sources.inactive")
                  : t("sw.error.save");
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <p className="flex gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </p>
      {onRetry && (
        <WorkButton variant="outline" onClick={onRetry}>
          {code === "CONFLICT" ? t("sw.reload") : t("sw.retry")}
        </WorkButton>
      )}
    </div>
  );
}

export function useUnsavedWarning(dirty: boolean) {
  const { t } = useT();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useBlocker({
    shouldBlockFn: () => dirtyRef.current && !window.confirm(t("sw.unsaved.leave")),
    enableBeforeUnload: () => dirtyRef.current,
  });
  // Save-and-return can navigate before React renders the clean state.
  return () => {
    dirtyRef.current = false;
  };
}

export const splitLines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
export function formatDate(value: string | null, lang: "sv" | "en", includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "sv" ? "sv-SE" : "en-GB", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}
