// The assessment shell.
//
// Presentation only. It frames the v3.1 public assessment in a distraction-free
// surface that still reads as CQrityjob: the same brand mark, the same navy,
// the same language control as the public site — but without the full site
// navigation, which competes with finishing twenty-six questions.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { cn } from "@/lib/utils";

export function AssessmentShell({
  children,
  showExit = false,
  wide = false,
}: {
  children: ReactNode;
  /** Only shown once a run is in progress — there is nothing to leave before that. */
  showExit?: boolean;
  wide?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--surface-subtle)]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-[1040px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 sm:px-8">
          <Link
            to="/"
            className="inline-flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span
                className="block truncate text-sm font-semibold tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                CQrityjob
              </span>
              <span className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:block">
                {t("cd.public.shellEyebrow")}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            {showExit && (
              <Link
                to="/career-center"
                className="rounded-md px-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {t("cd.public.exit")}
              </Link>
            )}
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-8 sm:px-8 sm:py-12">
        <div className={cn("mx-auto w-full", wide ? "max-w-[1040px]" : "max-w-[880px]")}>
          {children}
        </div>
      </main>

      <footer className="border-t border-border bg-background/60 px-5 py-5 sm:px-8">
        <p className="mx-auto max-w-[1040px] text-[11px] leading-relaxed text-muted-foreground">
          {t("careerDiscovery.dashboard.internalTestNote")}
        </p>
      </footer>
    </div>
  );
}

/** A calm centred panel for the short-lived states: loading, saving, errors. */
export function AssessmentPanel({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-border bg-card p-6 shadow-[var(--shadow-xs)] sm:p-8",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}