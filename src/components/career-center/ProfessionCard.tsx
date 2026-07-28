import { Link } from "@tanstack/react-router";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export function ProfessionCard({
  slug,
  title,
  description,
  icon: Icon,
  tag,
}: {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tag?: string;
}) {
  return (
    <Link
      to="/career-center/$profession"
      params={{ profession: slug }}
      className="group relative flex flex-col gap-4 bg-card p-6 transition-all duration-200 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-accent transition-colors group-hover:bg-accent/10">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="flex items-center gap-2">
          {tag && (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {tag}
            </span>
          )}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
