// Development Programmes.
//
// A programme is the long-lived thing: role → competencies → modules →
// reassessment. The assessment is one input to it, which is why this page shows
// modules and honest development status rather than a list of tests.
//
// Programmes still in development are listed as such. The page states what a
// programme does NOT measure as prominently as what it does, because that
// boundary is the thing most likely to be assumed wrongly.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Hammer } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import { listAcademyLibrary } from "@/lib/security-competency/academy-employer.functions";
import { listLearningModules } from "@/lib/security-competency/academy-learning.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/programmes",
)({
  ssr: false,
  component: ProgrammesRoute,
  errorComponent: EmployerErrorState,
});

function ProgrammesRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => <Programmes employerId={ws.employerId} />}
    </AcademyPage>
  );
}

function Programmes({ employerId }: { employerId: string }) {
  const { t, lang } = useT();
  const libraryFn = useServerFn(listAcademyLibrary);
  const modulesFn = useServerFn(listLearningModules);

  const library = useQuery({
    queryKey: ["academy", "library", employerId],
    queryFn: () => libraryFn({ data: { employerId } }),
  });
  const modules = useQuery({
    queryKey: ["academy", "modules"],
    queryFn: () => modulesFn(),
  });

  const inDevelopment = (library.data ?? []).filter((e) => !e.assignable);

  return (
    <>
      <AcademyHeading title={t("academy.programmes.title")} lede={t("academy.programmes.lede")} />

      <section className="rounded-[14px] border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("academy.programmes.modules")}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.programmes.modulesLede")}
        </p>

        {(modules.data?.length ?? 0) === 0 ? (
          <div className="mt-4">
            <NoEvidenceState
              title={t("academy.programmes.noModulesTitle")}
              body={t("academy.programmes.noModulesBody")}
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {(modules.data ?? []).map((m: any) => (
              <li key={m.moduleVersionId} className="rounded-[10px] border border-border p-4">
                <p className="text-sm font-semibold text-foreground">
                  {lang === "en" ? m.nameEn : m.nameSv}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {lang === "en" ? m.summaryEn : m.summarySv}
                </p>
                {m.estimatedMinutes && (
                  <p className="mt-2 text-xs text-muted-foreground">{m.estimatedMinutes} min</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {inDevelopment.length > 0 && (
        <section className="mt-6 rounded-[14px] border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Hammer className="h-4 w-4 text-accent" aria-hidden="true" />
            {t("academy.programmes.inDevelopment")}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.programmes.inDevelopmentLede")}
          </p>
          <ul className="mt-4 space-y-3">
            {inDevelopment.map((e) => (
              <li key={e.assessmentVersionId} className="rounded-[10px] border border-border p-4">
                <p className="text-sm font-semibold text-foreground">
                  {lang === "en" ? e.nameEn : e.nameSv}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {t("academy.programmes.status")}: {t("academy.status.development")} ·{" "}
                  {t("academy.programmes.notValidated")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
