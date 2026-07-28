import type { LucideIcon } from "lucide-react";

export function CategoryCard({
  name,
  desc,
  icon: Icon,
  active,
  onClick,
}: {
  name: string;
  desc: string;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "group flex w-full flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-accent bg-accent/[0.06] shadow-sm"
          : "border-border bg-card hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md",
      ].join(" ")}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-accent transition-colors group-hover:bg-accent/10">
        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
      </span>
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{name}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}
