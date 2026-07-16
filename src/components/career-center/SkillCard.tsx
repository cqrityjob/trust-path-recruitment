import type { LucideIcon } from "lucide-react";

export function SkillCard({
  name,
  desc,
  icon: Icon,
}: {
  name: string;
  desc: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-5">
      <Icon className="h-5 w-5 text-accent" strokeWidth={1.5} />
      <div>
        <h4 className="text-sm font-semibold tracking-tight text-foreground">{name}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
