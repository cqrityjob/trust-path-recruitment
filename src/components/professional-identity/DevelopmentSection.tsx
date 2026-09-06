// Training and development — employer-assigned, kept apart from tests.
//
// A training programme is assigned BY an employer and is the person's own
// development history; a recruitment test is requested by an organisation
// deciding whether to hire them. Mixing the two puts "your employer" on an
// applicant's page and a selection instrument under "development". So this
// section holds training only, renders nothing when there is none, and
// says "shown above" when its one item is the recommended step.

import { Link } from "@tanstack/react-router";
import { ArrowRight, GraduationCap } from "lucide-react";
import { useT } from "@/i18n/context";
import type { EmployerWorkModel } from "@/lib/professional-identity/home-presentation";
import { L, Lf, type Lang } from "./copy";
import { CLASSIFICATION, EMPLOYER_WORK } from "./home-copy";
import { Chip, Group } from "./home-primitives";
import { LINK, formatDay } from "./home-format";

export function DevelopmentSection({
  work,
  className,
}: {
  work: EmployerWorkModel;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  if (work.state !== "ready" || work.totalTraining === 0) return null;

  return (
    <Group
      id="development"
      title={L(EMPLOYER_WORK.developmentTitle, l)}
      icon={<GraduationCap className="h-5 w-5" />}
      className={className}
      data-development=""
    >
      <ul className="mt-1 divide-y divide-border">
        {work.training.map((t) => {
          const deadline = formatDay(t.deadline, l);
          return (
            <li
              key={t.id}
              className="py-3"
              data-training-row={t.completed ? "completed" : "open"}
              data-featured-above={t.featuredAbove ? "" : undefined}
            >
              {!t.completed && <Chip label={L(CLASSIFICATION.action_required, l)} />}
              <p className="mt-1 text-sm font-medium text-balance text-foreground">
                {l === "sv" ? t.titleSv : t.titleEn}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  t.employerName ? Lf(EMPLOYER_WORK.assignedBy, l, t.employerName) : null,
                  Lf(EMPLOYER_WORK.modules, l, `${t.modulesDone}/${t.modulesTotal}`),
                  deadline && !t.completed ? Lf(EMPLOYER_WORK.deadline, l, deadline) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {t.featuredAbove ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {L(EMPLOYER_WORK.trainingFeaturedAbove, l)}
                </p>
              ) : (
                <Link to={t.href} className={`${LINK} mt-1`} data-training-link={t.assignmentId}>
                  {L(EMPLOYER_WORK.openTraining, l)}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Group>
  );
}
