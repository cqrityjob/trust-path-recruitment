import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost";

const styles: Record<Variant, string> = {
  primary:
    "inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
  ghost:
    "inline-flex h-11 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted",
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