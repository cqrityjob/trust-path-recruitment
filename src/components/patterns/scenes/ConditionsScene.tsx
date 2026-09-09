import { Building2, FileText, PencilLine } from "lucide-react";
import { ProductScene } from "../ProductScene";

export function ConditionsScene({ caption, lang }: { caption: string; lang: "sv" | "en" }) {
  const rows =
    lang === "sv"
      ? ([
          [PencilLine, "Registrerat av dig"],
          [FileText, "Ej källbekräftat"],
          [Building2, "Bekräftat av namngiven arbetsgivare"],
        ] as const)
      : ([
          [PencilLine, "Recorded by you"],
          [FileText, "Not source-confirmed"],
          [Building2, "Confirmed by a named employer"],
        ] as const);
  return (
    <ProductScene caption={caption}>
      <div className="space-y-3">
        {rows.map(([Icon, label], index) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-[var(--cq-radius-md)] border border-[var(--cq-border)] bg-white p-3"
          >
            <span className="cq-scene-icon">
              <Icon />
            </span>
            <span className="text-sm font-medium">{label}</span>
            <span className="ml-auto text-xs font-semibold text-[var(--cq-blue-ink)]">
              0{index + 1}
            </span>
          </div>
        ))}
      </div>
    </ProductScene>
  );
}
