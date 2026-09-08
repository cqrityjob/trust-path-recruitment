import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "accent";

const base =
  "inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold tracking-tight transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const styles: Record<Variant, string> = {
  primary: `${base} bg-primary text-primary-foreground shadow-sm hover:bg-[color:var(--primary-hover)] hover:shadow-md active:translate-y-px`,
  accent: `${base} bg-accent text-accent-foreground shadow-sm hover:bg-[color:var(--accent-hover)] hover:shadow-md active:translate-y-px`,
  ghost: `${base} border border-border bg-background text-foreground hover:bg-secondary hover:border-[color:var(--accent)]/40`,
};

export const PrimaryButton = forwardRef<
  HTMLButtonElement,
  { variant?: Variant } & ComponentPropsWithoutRef<"button">
>(function PrimaryButton({ variant = "primary", className, ...rest }, ref) {
  return <button ref={ref} className={cn(styles[variant], className)} {...rest} />;
});

export function PrimaryLink({
  to,
  search,
  hash,
  variant = "primary",
  className,
  children,
  onClick,
}: {
  to: string;
  /** Query parameters for the destination.
   *
   *  `to` alone cannot carry them: the router does not parse a query string
   *  out of `to`, so "/signup?redirect=/passport" navigates to a literal
   *  path containing "?" and silently loses the parameter — the same defect
   *  splitReturnPath() exists to prevent on the way back. The homepage's
   *  primary action needs it, because "?redirect=" is how the intent to
   *  build a Passport survives account creation. */
  search?: Record<string, string>;
  /** Fragment for the destination. Same reason as `search`: the router does
   *  not parse a "#" out of `to`, so a primary action that scrolls to a
   *  section on the current page needs it as its own prop rather than as
   *  string concatenation that silently becomes part of the path. */
  hash?: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
  /** Fired alongside navigation -- used for fire-and-forget funnel tracking,
   *  which must never delay or block the click it is measuring. */
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      hash={hash}
      className={cn(styles[variant], className)}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
