import { Award } from "lucide-react";

export function CertificationCard({
  name,
  provider,
  tag,
}: {
  name: string;
  provider?: string;
  tag?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-background p-5">
      <Award className="mt-0.5 h-5 w-5 text-accent" strokeWidth={1.5} />
      <div className="flex-1">
        <h4 className="text-sm font-semibold tracking-tight text-foreground">{name}</h4>
        {provider && <p className="mt-1 text-xs text-muted-foreground">{provider}</p>}
      </div>
      {tag && (
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {tag}
        </span>
      )}
    </div>
  );
}
