import { Link } from "@tanstack/react-router";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

// A card is a promise that there is something to read.
//
// The `tag` prop this used to take existed for exactly one value: "Under
// utveckling". Half the catalogue rendered with it, which made an unfinished
// stub look like a finished guide with a small caveat rather than like
// something that should not have been linked at all. Only published guides
// are carded now, so the badge has nothing left to say and is gone.
//
// What replaced it is `level`, which is information a reader actually uses to
// decide whether to open the guide.

export function ProfessionCard({
  slug,
  title,
  description,
  icon: Icon,
  level,
  onOpen,
}: {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  level?: string;
  onOpen?: (slug: string) => void;
}) {
  return (
    <Link
      to="/career-center/$profession"
      params={{ profession: slug }}
      onClick={() => onOpen?.(slug)}
      // The results grid used to be a seamless sheet -- `gap-px` over a
      // `bg-border` container, so the gaps read as hairlines. With ten guides
      // in a three-column grid that leaves two empty cells in the last row,
      // rendered as bare grey blocks beside the final card. Bordered cards in
      // a normally gapped grid have no such artifact at any count, and match
      // the entry-path and trust cards elsewhere on the page.
      className="group relative flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-accent transition-colors group-hover:bg-accent/10">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex items-center gap-2">
          {level && (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {level}
            </span>
          )}
          <ArrowUpRight
            className="h-4 w-4 text-muted-foreground/50 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
            aria-hidden
          />
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
