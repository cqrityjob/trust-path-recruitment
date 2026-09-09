import { Award, Briefcase, FileCheck2, GraduationCap } from "lucide-react";
import { ProductScene } from "../ProductScene";

export function PassportEntriesScene({ caption, lang }: { caption: string; lang: "sv" | "en" }) {
  const rows =
    lang === "sv"
      ? ([
          [Briefcase, "Erfarenhet", "Registrerat"],
          [Award, "Behörighet", "Ej källbekräftat"],
          [GraduationCap, "Utbildning", "Registrerat"],
          [FileCheck2, "Intyg", "Källbekräftat"],
        ] as const)
      : ([
          [Briefcase, "Experience", "Recorded"],
          [Award, "Authorisation", "Not source-confirmed"],
          [GraduationCap, "Training", "Recorded"],
          [FileCheck2, "Written confirmation", "Source-confirmed"],
        ] as const);
  return (
    <ProductScene caption={caption}>
      <div className="space-y-3">
        {rows.map(([Icon, title, status]) => (
          <div
            key={title}
            className="flex items-center gap-3 rounded-[var(--cq-radius-md)] border border-[var(--cq-border)] bg-white p-3"
          >
            <span className="cq-scene-icon">
              <Icon />
            </span>
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs text-[var(--cq-text-muted)]">{status}</div>
            </div>
          </div>
        ))}
      </div>
    </ProductScene>
  );
}
