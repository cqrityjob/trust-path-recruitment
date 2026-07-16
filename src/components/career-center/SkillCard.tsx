import type { LucideIcon } from "lucide-react";

export function SkillCard({
  name,
  desc,
  icon: Icon,
  badge,
  critical,
}: {
  name: string;
  desc: string;
  icon: LucideIcon;
  badge?: string;
  critical?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-5">
      <div className="flex items-start justify-between">
        <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
        {critical && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-foreground">
            Critical
          </span>
        )}
      </div>
      <div>
        <h4 className="text-sm font-semibold tracking-tight text-foreground">{name}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
        {badge && (
          <p className="mt-3 text-[11px] font-medium uppercase tracking-widest text-accent">{badge}</p>
        )}
      </div>
    </div>
  );
}
