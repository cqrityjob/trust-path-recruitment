import { Link } from "@tanstack/react-router";
import { ArrowDown, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  L,
  careerRoutes,
  getCompetency,
  type CareerRoute,
  type RouteStage,
} from "@/lib/career-center";

// "Karriärvägar" — what replaced the single static chain.
//
// The old section rendered five hard-coded strings (Student → Väktare →
// Gruppledare → Säkerhetschef → Head of Security). Nothing was clickable,
// three of the five were not professions this product has guides for, and the
// shape implied one ladder for an industry that has several.
//
// Every step here is a published guide. Everything said about a transition —
// the level shift, the added orientation, the competencies that go up, the
// regulatory step — is read off the profession records rather than written
// here, so it cannot drift from the guides it links to. Where the data
// carries no timing claim, none is shown; see career-routes.ts.

export function CareerRoutes({ onProfessionOpen }: { onProfessionOpen?: (slug: string) => void }) {
  const { t } = useT();

  if (careerRoutes.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {careerRoutes.map((route) => (
          <RouteColumn key={route.id} route={route} onProfessionOpen={onProfessionOpen} />
        ))}
      </div>
      <p className="mt-10 flex items-start gap-2.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        {t("cc.routes.disclaimer")}
      </p>
    </div>
  );
}

function RouteColumn({
  route,
  onProfessionOpen,
}: {
  route: CareerRoute;
  onProfessionOpen?: (slug: string) => void;
}) {
  const { lang } = useT();
  return (
    <section className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-xs">
      <h3 className="text-lg font-semibold tracking-tight text-foreground">
        {L(route.name, lang)}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {L(route.direction, lang)}
      </p>
      <ol className="mt-6 space-y-1">
        {route.stages.map((stage, i) => (
          <li key={i}>
            {i > 0 && <StageShiftBlock stage={stage} />}
            <StageBlock stage={stage} index={i} onProfessionOpen={onProfessionOpen} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StageBlock({
  stage,
  index,
  onProfessionOpen,
}: {
  stage: RouteStage;
  index: number;
  onProfessionOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t("cc.routes.stage")} {index + 1}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {stage.professions.map((p, i) => (
          <span key={p.slug} className="flex items-baseline gap-2">
            {i > 0 && <span className="text-xs text-muted-foreground">{t("cc.routes.or")}</span>}
            <Link
              to="/career-center/$profession"
              params={{ profession: p.slug }}
              onClick={() => onProfessionOpen?.(p.slug)}
              className="text-sm font-semibold tracking-tight text-foreground underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {lang === "sv" ? p.titleSv : p.titleEn}
            </Link>
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(`cc.level.${stage.professions[0].level}` as TranslationKey)}
      </p>
    </div>
  );
}

/** What changes on the way into a stage. Each line is omitted when the data
 *  carries nothing for it, so a transition the dataset barely describes shows
 *  one line rather than four empty headings. */
function StageShiftBlock({ stage }: { stage: RouteStage }) {
  const { t, lang } = useT();
  const shift = stage.shift;
  if (!shift) return null;

  const raised = shift.raisedCompetencies.slice(0, 3);
  const hasContent =
    shift.levelTo !== undefined ||
    shift.becomesRegulated ||
    shift.addedOrientations.length > 0 ||
    raised.length > 0 ||
    shift.notes.length > 0;

  return (
    <div className="py-2 pl-4">
      <ArrowDown className="h-4 w-4 text-muted-foreground/60" aria-hidden />
      {hasContent && (
        <div className="mt-2 border-l-2 border-accent/30 pl-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            {t("cc.routes.shift.title")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {shift.levelFrom && shift.levelTo && (
              <li>
                {t("cc.routes.shift.level")}:{" "}
                <span className="text-foreground">
                  {t(`cc.level.${shift.levelFrom}` as TranslationKey)} →{" "}
                  {t(`cc.level.${shift.levelTo}` as TranslationKey)}
                </span>
              </li>
            )}
            {shift.becomesRegulated && <li>{t("cc.routes.shift.regulated")}</li>}
            {shift.addedOrientations.length > 0 && (
              <li>
                {t("cc.routes.shift.orientation")}:{" "}
                <span className="text-foreground">
                  {shift.addedOrientations
                    .map((o) => t(`cc.orientation.${o}` as TranslationKey))
                    .join(", ")}
                </span>
              </li>
            )}
            {raised.length > 0 && (
              <li>
                {t("cc.routes.shift.competencies")}:{" "}
                <span className="text-foreground">
                  {raised
                    .map((c) => {
                      const competency = getCompetency(c.id);
                      return competency ? L(competency.name, lang) : c.id;
                    })
                    .join(", ")}
                </span>
              </li>
            )}
            {/* Notes come only from an explicit careerPaths edge — they are
                the one part of this block that was written by a person about
                that specific transition. */}
            {shift.notes.map((note, i) => (
              <li key={i} className="text-foreground/80">
                {L(note, lang)}
              </li>
            ))}
            {shift.experienceRequired.map((exp, i) => (
              <li key={`exp-${i}`} className="text-foreground/80">
                {L(exp, lang)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
