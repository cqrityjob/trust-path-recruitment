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
      className="group flex flex-col gap-4 bg-background p-6 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between">
        <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
        <div className="flex items-center gap-2">
          {tag && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {tag}
            </span>
          )}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
