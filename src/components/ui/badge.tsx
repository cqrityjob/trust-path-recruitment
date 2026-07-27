import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:text-primary-foreground",
        secondary:
          "border-border/70 bg-muted text-foreground hover:bg-muted/70",
        destructive:
          "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15",
        outline: "border-border text-foreground",
        success:
          "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning:
          "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
        info:
          "border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300",
        neutral:
          "border-border/70 bg-muted/60 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
