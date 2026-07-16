import { useMemo, useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  computeMatches,
  dimensionById,
  professionProfileById,
  professionProfiles,
  runPersonaTests,
  runValidation,
  testPersonas,
  type EngineResult,
  type MatchResult,
  type TestPersona,
} from "@/lib/career-assessment";
import { getProfession } from "@/lib/career-center";

const IS_DEV = !!import.meta.env?.DEV;

export const Route = createFileRoute("/dev/career-assessment-calibration")({
  beforeLoad: () => {
    if (!IS_DEV) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Career Assessment Calibration (dev)" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CalibrationView,
});

function CalibrationView() {
  const [personaId, setPersonaId] = useState<string>(testPersonas[0]?.id ?? "");
  const [compareA, setCompareA] = useState<string>(professionProfiles[0]?.professionId ?? "");
  const [compareB, setCompareB] = useState<string>(professionProfiles[1]?.professionId ?? "");

  const persona = useMemo<TestPersona | undefined>(
    () => testPersonas.find((p) => p.id === personaId),
    [personaId],
  );
  const engine: EngineResult | null = useMemo(
    () => (persona ? computeMatches(persona.answers) : null),
    [persona],
  );
  const validation = useMemo(() => runValidation(), []);
  const personaTests = useMemo(() => runPersonaTests(), []);

  if (!IS_DEV) return null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 font-mono text-sm text-foreground">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Career Assessment — Calibration (dev)</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Read-only view. Not linked from public navigation. Adjust weights in code.
        </p>
      </header>

      <section className="mb-8 rounded-md border border-border p-4">
        <h2 className="mb-3 text-base font-semibold">Validation</h2>
        <p>
          Issues: <b>{validation.length}</b> · Diversity{" "}
          <b>{personaTests.diversityPassed ? "PASS" : "FAIL"}</b> · Distinct #1{" "}
          <b>{new Set(personaTests.outcomes.map((o) => o.top5[0]?.professionId)).size}</b>
        </p>
        {validation.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {validation.map((v, i) => (
              <li key={i}>
                <span className={v.severity === "error" ? "text-red-500" : "text-amber-500"}>
                  [{v.severity}]
                </span>{" "}
                {v.code}: {v.message}
              </li>
            ))}
          </ul>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            All persona outcomes
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2">Persona</th>
                <th className="py-1 pr-2">Result</th>
                <th className="py-1 pr-2">Top 5</th>
                <th className="py-1 pr-2">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {personaTests.outcomes.map((o) => (
                <tr key={o.personaId} className="border-t border-border/60 align-top">
                  <td className="py-1 pr-2">{o.personaId}</td>
                  <td className="py-1 pr-2">
                    <span className={o.passed ? "text-emerald-500" : "text-red-500"}>
                      {o.passed ? "OK" : "FAIL"}
                    </span>
                  </td>
                  <td className="py-1 pr-2">
                    {o.top5
                      .map((m) => `${m.professionId}:${m.displayedMatch}(${m.confidence[0]})`)
                      .join("  ·  ")}
                  </td>
                  <td className="py-1 pr-2 text-red-400">{o.reasons.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="mb-8 rounded-md border border-border p-4">
        <h2 className="mb-3 text-base font-semibold">Persona inspector</h2>
        <label className="text-xs text-muted-foreground">Persona&nbsp;</label>
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1"
        >
          {testPersonas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>

        {engine && persona && (
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold">Answers ({engine.answeredCount} answered)</h3>
              <pre className="max-h-56 overflow-auto rounded bg-muted/40 p-2 text-xs">
                {JSON.stringify(persona.answers, null, 2)}
              </pre>
              <h3 className="mb-2 mt-4 font-semibold">
                User dimensions ({engine.observedDimensions.length} observed,{" "}
                {engine.unobservedDimensions.length} unobserved)
              </h3>
              <table className="w-full text-xs">
                <tbody>
                  {engine.userVector.map((v) => (
                    <tr key={v.dimension} className="border-t border-border/40">
                      <td className="py-0.5 pr-2">{v.dimension}</td>
                      <td className="py-0.5 pr-2 text-right tabular-nums">
                        {v.observed ? Math.round(v.normalized) : "—"}
                      </td>
                      <td className="py-0.5 pr-2 text-muted-foreground">
                        {v.observed ? `ev ${v.evidence}` : "unobserved"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">All profession similarities</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2">Profession</th>
                    <th className="py-1 pr-2 text-right">Disp</th>
                    <th className="py-1 pr-2 text-right">Raw</th>
                    <th className="py-1 pr-2">Conf</th>
                    <th className="py-1 pr-2">Gate</th>
                    <th className="py-1 pr-2">Cov</th>
                    <th className="py-1 pr-2">Mis</th>
                  </tr>
                </thead>
                <tbody>
                  {engine.matches.map((m) => (
                    <MatchRow key={m.professionId} m={m} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-md border border-border p-4">
        <h2 className="mb-3 text-base font-semibold">Compare two profiles</h2>
        <div className="flex flex-wrap gap-3">
          <select
            value={compareA}
            onChange={(e) => setCompareA(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1"
          >
            {professionProfiles.map((p) => (
              <option key={p.professionId} value={p.professionId}>
                {p.professionId}
              </option>
            ))}
          </select>
          <span className="self-center text-muted-foreground">vs</span>
          <select
            value={compareB}
            onChange={(e) => setCompareB(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1"
          >
            {professionProfiles.map((p) => (
              <option key={p.professionId} value={p.professionId}>
                {p.professionId}
              </option>
            ))}
          </select>
        </div>
        <CompareTable a={compareA} b={compareB} />
      </section>
    </main>
  );
}

function MatchRow({ m }: { m: MatchResult }) {
  const cc = getProfession(m.professionId);
  return (
    <tr className="border-t border-border/40 align-top">
      <td className="py-0.5 pr-2">
        {m.professionId}
        <span className="ml-1 text-[10px] uppercase text-muted-foreground">
          [{cc?.status ?? "—"}]
        </span>
      </td>
      <td className="py-0.5 pr-2 text-right tabular-nums">{m.displayedMatch}</td>
      <td className="py-0.5 pr-2 text-right tabular-nums">{m.rawSimilarity.toFixed(3)}</td>
      <td className="py-0.5 pr-2">{m.confidence}</td>
      <td className={`py-0.5 pr-2 ${m.gatePassed ? "" : "text-red-500"}`}>
        {m.gatePassed ? "ok" : "fail"}
      </td>
      <td className="py-0.5 pr-2 tabular-nums">{m.distinguishingCoverage.toFixed(2)}</td>
      <td className="py-0.5 pr-2 tabular-nums">{m.mismatchPenalty.toFixed(2)}</td>
    </tr>
  );
}

function CompareTable({ a, b }: { a: string; b: string }) {
  const pa = professionProfileById[a];
  const pb = professionProfileById[b];
  if (!pa || !pb) return null;
  const dims = Array.from(
    new Set([...Object.keys(pa.targets), ...Object.keys(pb.targets)]),
  );
  return (
    <table className="mt-3 w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 pr-2">Dimension</th>
          <th className="py-1 pr-2">{a}</th>
          <th className="py-1 pr-2">{b}</th>
        </tr>
      </thead>
      <tbody>
        {dims.map((d) => {
          const sa = (pa.targets as Record<string, { target: number; importance: number } | undefined>)[d];
          const sb = (pb.targets as Record<string, { target: number; importance: number } | undefined>)[d];
          return (
            <tr key={d} className="border-t border-border/40">
              <td className="py-0.5 pr-2">{dimensionById[d as keyof typeof dimensionById]?.name.en ?? d}</td>
              <td className="py-0.5 pr-2">{sa ? `${sa.target} · imp ${sa.importance}` : "—"}</td>
              <td className="py-0.5 pr-2">{sb ? `${sb.target} · imp ${sb.importance}` : "—"}</td>
            </tr>
          );
        })}
        <tr className="border-t border-border/60">
          <td className="py-1 pr-2 font-semibold">Gate</td>
          <td className="py-1 pr-2">{pa.gate}</td>
          <td className="py-1 pr-2">{pb.gate}</td>
        </tr>
        <tr className="border-t border-border/40">
          <td className="py-1 pr-2 font-semibold">Distinguishing</td>
          <td className="py-1 pr-2">{pa.distinguishing.join(", ")}</td>
          <td className="py-1 pr-2">{pb.distinguishing.join(", ")}</td>
        </tr>
        <tr className="border-t border-border/40">
          <td className="py-1 pr-2 font-semibold">Mismatch</td>
          <td className="py-1 pr-2">{(pa.potentialMismatch ?? []).join(", ") || "—"}</td>
          <td className="py-1 pr-2">{(pb.potentialMismatch ?? []).join(", ") || "—"}</td>
        </tr>
      </tbody>
    </table>
  );
}