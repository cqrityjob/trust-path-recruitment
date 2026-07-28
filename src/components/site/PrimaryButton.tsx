import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "accent";

const base =
  "inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-semibold tracking-tight transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const styles: Record<Variant, string> = {
  primary:
    `${base} bg-primary text-primary-foreground shadow-sm hover:bg-[color:var(--primary-hover)] hover:shadow-md active:translate-y-px`,
  accent:
    `${base} bg-accent text-accent-foreground shadow-sm hover:bg-[color:var(--accent-hover)] hover:shadow-md active:translate-y-px`,
  ghost:
    `${base} border border-border bg-background text-foreground hover:bg-secondary hover:border-[color:var(--accent)]/40`,
};

export const PrimaryButton = forwardRef<
  HTMLButtonElement,
  { variant?: Variant } & ComponentPropsWithoutRef<"button">
>(function PrimaryButton({ variant = "primary", className, ...rest }, ref) {
  return <button ref={ref} className={cn(styles[variant], className)} {...rest} />;
});

export function PrimaryLink({
  to,
  variant = "primary",
  className,
  children,
}: {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cn(styles[variant], className)}>
      {children}
    </Link>
  );
}