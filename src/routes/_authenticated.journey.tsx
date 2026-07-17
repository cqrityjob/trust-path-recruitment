import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import {
  listTargetProfessions,
  listAssessmentRuns,
  removeTargetProfession,
} from "@/lib/journey/journey.functions";
import { getProfessionRecord } from "@/lib/knowledge-graph";

export const Route = createFileRoute("/_authenticated/journey")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Career Journey — CQrityjob" },
      { name: "description", content: "Track your saved assessment results, target profession and next career actions." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JourneyIndex,
});

function JourneyIndex() {
  const fetchTargets = useServerFn(listTargetProfessions);
  const fetchRuns = useServerFn(listAssessmentRuns);
  const removeTarget = useServerFn(removeTargetProfession);
  const qc = useQueryClient();

  const targets = useQuery({ queryKey: ["journey", "targets"], queryFn: () => fetchTargets({ data: undefined as any }) });
  const runs = useQuery({ queryKey: ["journey", "runs"], queryFn: () => fetchRuns({ data: undefined as any }) });

  const remove = useMutation({
    mutationFn: (targetId: string) => removeTarget({ data: { targetId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journey", "targets"] }),
  });

  return (
    <SiteLayout>
      <Section>
        <div className="mx-auto max-w-3xl space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Career Journey</h1>
            <p className="text-sm text-muted-foreground">
              Beta. Signals from the Career Guidance Assessment are development guidance — not verified competence.
              No readiness percentages are shown.
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Saved assessment results</h2>
            {runs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {runs.data && runs.data.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No saved results yet. <Link to="/security-career-assessment" className="underline">Take the assessment</Link>.
              </p>
            )}
            {runs.data && runs.data.length > 0 && (
              <ul className="divide-y rounded-md border">
                {runs.data.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between p-3 text-sm">
                    <span>{new Date(r.completed_at ?? r.started_at).toLocaleString()}</span>
                    <span className="text-muted-foreground">{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Target profession</h2>
            {targets.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {targets.data && targets.data.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No target chosen yet. Browse the{" "}
                <Link to="/career-center" className="underline">Career Center</Link> to pick a profession.
              </p>
            )}
            {targets.data && targets.data.map((t: any) => {
              const p = getProfessionRecord(t.profession_id);
              return (
                <div key={t.id} className="rounded-md border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium">{p?.titleSv ?? t.profession_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {p?.titleEn} · chosen {new Date(t.chosen_at).toLocaleDateString()}
                        {t.is_primary && " · primary"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to="/journey/$targetId"
                        params={{ targetId: t.id }}
                        className="text-sm underline"
                      >
                        Open plan
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove.mutate(t.id)}
                        className="text-sm text-muted-foreground underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <div>
            <Link
              to="/security-career-assessment"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Take the assessment
            </Link>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
