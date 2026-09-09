import { Compass, FileSearch, ShieldCheck } from "lucide-react";
import { ProductScene } from "../ProductScene";

export function ExplorerScene({ caption, lang }: { caption: string; lang: "sv" | "en" }) {
  const labels =
    lang === "sv"
      ? ["Operativa roller", "Specialistroller", "Ledarskap och utveckling"]
      : ["Operational roles", "Specialist roles", "Leadership and development"];
  return (
    <ProductScene caption={caption}>
      <div className="flex items-center justify-between border-b border-[var(--cq-border)] pb-4">
        <div className="flex items-center gap-3">
          <span className="cq-scene-icon">
            <Compass />
          </span>
          <span className="font-semibold">Career Center</span>
        </div>
        <ShieldCheck className="h-5 w-5 text-[var(--cq-blue)]" />
      </div>
      <div className="mt-5 space-y-3">
        {labels.map((label, i) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-[var(--cq-radius-md)] border border-[var(--cq-border)] bg-white p-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cq-ice)] text-sm font-semibold text-[var(--cq-blue-ink)]">
              {i + 1}
            </span>
            <span className="text-sm font-medium">{label}</span>
            <FileSearch className="ml-auto h-4 w-4 text-[var(--cq-text-muted)]" />
          </div>
        ))}
      </div>
    </ProductScene>
  );
}
