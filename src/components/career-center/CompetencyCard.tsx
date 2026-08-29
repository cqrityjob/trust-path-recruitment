import type { LucideIcon } from "lucide-react";
import { useT } from "@/i18n/context";
import type { ProficiencyLevel } from "@/lib/career-center";

// One required competency, with its demanded level.
//
// ── TWO THINGS THIS FIXES ──────────────────────────────────────────────
//
// 1. The badge read "Critical" — a hard-coded English word, in a Swedish
//    interface, that also told the reader nothing about what "critical"
//    meant. It now reads "Kritisk kompetens" / "Critical competence" from the
//    dictionary, with a sentence that says what the label is claiming.
//
// 2. The level was a bare "Nivå 3 · Kompetent" with no scale to read it
//    against, so a 3 could equally have been out of three or out of ten. The
//    five-step indicator makes the denominator visible.
//
// The indicator is decorative and marked `aria-hidden`; the same information
// is carried in text beside it, so a screen reader hears "Nivå 3 av 5" rather
// than five unlabelled shapes.

const SCALE_MAX = 5;

export function CompetencyCard({
  name,
  definition,
  icon: Icon,
  level,
  levelLabel,
  critical,
}: {
  name: string;
  definition: string;
  icon: LucideIcon;
  level: ProficiencyLevel;
  /** The authored word for this rung — "Kompetent", "Skicklig", … */
  levelLabel: string;
  critical?: boolean;
}) {
  const { t } = useT();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-2">
        <Icon className="h-5 w-5 flex-shrink-0 text-accent" strokeWidth={1.5} aria-hidden />
        {critical && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground">
            {t("cc.p.competencies.critical")}
          </span>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold tracking-tight text-foreground">{name}</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{definition}</p>
      </div>

      <div className="mt-auto pt-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex gap-1">
            {Array.from({ length: SCALE_MAX }, (_, i) => (
              <span
                key={i}
                className={["h-1.5 w-5 rounded-full", i < level ? "bg-accent" : "bg-border"].join(
                  " ",
                )}
              />
            ))}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("cc.p.competencies.level")} <span className="tabular-nums">{level}</span>{" "}
            {t("cc.p.competencies.of")}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
          {levelLabel}
        </p>
      </div>
    </div>
  );
}
