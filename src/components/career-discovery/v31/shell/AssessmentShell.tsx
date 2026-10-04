// The assessment shell.
//
// Presentation only. It frames the v3.1 public assessment in a distraction-free
// surface that still reads as CQrityjob: the same brand mark, the same navy,
// the same language control as the public site — but without the full site
// navigation, which competes with finishing the whole run.
//
// ── THE SHELL SAYS NOTHING ABOUT ANY ONE PRODUCT ───────────────────────
//
// It is also the frame for employer-assigned assessments, the Academy's
// training and practice runs, the reviewer workspace and the retired invite
// page. Two things used to be hard-wired to Career Discovery and were
// therefore wrong everywhere else: the footer ("this is guidance, not a test")
// and the exit link ("Avsluta vägledningen" → /career-center). A person
// sitting an employer's assessment was told it is not a test and offered a way
// out into the career centre.
//
// Both are props now. The shell renders no footer and no exit unless a caller
// supplies one, and the Career Discovery wording lives in CareerDiscoveryShell,
// which only the Career Discovery flow uses.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/site/BrandLogo";
import { useT } from "@/i18n/context";
import type { Lang } from "@/i18n/dictionaries";
import { LanguageSwitcher } from "@/components/site/LanguageSwitcher";
import { cn } from "@/lib/utils";

/** Where "leave the run" goes, and what it says. Supplied by the caller — the
 *  right destination and the right words belong to the product being run, not
 *  to the shell. The two parameterless targets are the only places a run is
 *  ever left to; the programme page needs the assignment it belongs to. */
export type AssessmentShellExit = { label: string } & (
  | { to: "/career-center" | "/academy" }
  | { to: "/academy/training/$assignmentId"; params: { assignmentId: string } }
);

const EXIT_LINK_CLASS =
  "min-h-11 rounded-md px-1 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function AssessmentShell({
  children,
  exit,
  footerNote,
  wide = false,
  deliveryLanguage,
  onExit,
  notice,
}: {
  children: ReactNode;
  /** Only passed once a run is in progress — there is nothing to leave before
   *  that. Absent means no exit link, never a default one. */
  exit?: AssessmentShellExit;
  onExit?: () => void;
  notice?: ReactNode;
  /** A short standing note for the foot of the page, already translated. Absent
   *  means no footer at all: a note about one product must not appear under
   *  another. */
  footerNote?: string;
  wide?: boolean;
  /** Set by an assigned assessment attempt, which is delivered in the language
   *  the employer chose and is not switchable from inside the run. When set,
   *  the header shows that language as a fact instead of offering the site
   *  toggle — a toggle that changed nothing on the page would be worse than
   *  none. Absent for the public Career Discovery run, which keeps the
   *  switcher exactly as before. */
  deliveryLanguage?: Lang;
}) {
  const { t } = useT();
  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--surface-subtle)]">
      <header className="relative z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-[1040px] grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5 py-3 sm:px-8">
          <Link
            to="/"
            className="inline-flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <BrandLogo className="w-24 sm:w-32" />
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {exit &&
              (onExit ? (
                <button type="button" className={EXIT_LINK_CLASS} onClick={onExit}>
                  {exit.label}
                </button>
              ) : exit.to === "/academy/training/$assignmentId" ? (
                <Link to={exit.to} params={exit.params} className={EXIT_LINK_CLASS}>
                  {exit.label}
                </Link>
              ) : (
                <Link to={exit.to} className={EXIT_LINK_CLASS}>
                  {exit.label}
                </Link>
              ))}
            {deliveryLanguage ? (
              <span
                className="inline-flex h-8 items-center rounded-full border border-border bg-background/60 px-3 text-xs font-medium text-foreground"
                title={t("academy.language.lockedNote")}
              >
                <span aria-hidden="true">{t(`academy.language.name.${deliveryLanguage}`)}</span>
                <span className="sr-only">
                  {t("academy.language.deliveredIn")}{" "}
                  {t(`academy.language.name.${deliveryLanguage}`)}
                  {". "}
                  {t("academy.language.lockedNote")}
                </span>
              </span>
            ) : (
              <LanguageSwitcher />
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-8 sm:px-8 sm:py-12">
        <div className={cn("mx-auto w-full", wide ? "max-w-[1040px]" : "max-w-[880px]")}>
          {notice && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-destructive p-4 text-sm text-destructive"
            >
              {notice}
            </div>
          )}
          {children}
        </div>
      </main>

      {footerNote && (
        <footer className="border-t border-border bg-background/60 px-5 py-5 sm:px-8">
          <p className="mx-auto max-w-[1040px] text-[11px] leading-relaxed text-muted-foreground">
            {footerNote}
          </p>
        </footer>
      )}
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
