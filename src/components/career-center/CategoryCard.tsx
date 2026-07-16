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
      className={[
        "flex w-full flex-col items-start gap-3 rounded-lg border p-5 text-left transition-colors",
        active
          ? "border-accent bg-accent/5"
          : "border-border bg-background hover:bg-muted/40",
      ].join(" ")}
    >
      <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{name}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}
