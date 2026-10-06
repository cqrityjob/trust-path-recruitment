import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/i18n/context";
import { sentinelReview } from "@/lib/sentinel/sentinel.functions";
import { Matrix, Options } from "./Figure";
export function SentinelReviewGallery() {
  const { lang } = useT();
  const sv = lang !== "en";
  const load = useServerFn(sentinelReview);
  const q = useQuery({ queryKey: ["sentinel", "private-review"], queryFn: () => load() });
  const [onlyForm, setOnlyForm] = useState(true);
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold">
        Sentinel · {sv ? "Innehållsgranskning" : "Content review"}
      </h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {sv
          ? "Skyddad förhandsgranskning. Automatisk regelkontroll är genomförd. Ägarens innehållsgodkännande och integritetsgranskning är separata releasekrav. Inga ägargodkännanden har registrerats."
          : "Protected preview. Automated rule checks are complete. Owner content approval and privacy review are separate release prerequisites. No owner approvals have been recorded."}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {(sv
          ? [
              "Kontrollera att en tydlig regel förklarar hela matrisen.",
              "Kontrollera att exakt ett alternativ är visuellt korrekt.",
              "Kontrollera alternativa rimliga tolkningar och ledtrådar i distraktorerna.",
              "Granska läsbarhet på mobil, tangentbord och vid förstoring.",
              "Godkänn SV/EN, instruktioner, rapportbegränsningar och pilotens databehandling.",
            ]
          : [
              "Check that a clear rule explains the whole matrix.",
              "Check that exactly one option is visually correct.",
              "Check alternative plausible interpretations and distractor clues.",
              "Review readability on mobile, keyboard and at zoom.",
              "Approve SV/EN, instructions, report limitations and pilot data handling.",
            ]
        ).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" checked={onlyForm} onChange={(e) => setOnlyForm(e.target.checked)} />
        {sv ? "Visa endast föreslagna 20 testuppgifter" : "Show only the proposed 20 scored items"}
      </label>
      {q.isPending && <p>{sv ? "Hämtar…" : "Loading…"}</p>}
      {q.isError && (
        <p role="alert">
          {sv
            ? "Granskningsinnehållet kunde inte hämtas. Innehållsbehörighet krävs."
            : "Review content could not be loaded. Content author permissions are required."}
          <button className="ml-3 underline" onClick={() => void q.refetch()}>
            {sv ? "Försök igen" : "Retry"}
          </button>
        </p>
      )}
      {(q.data ?? []).map((f) => (
        <div key={f.version} className="space-y-6">
          <p className="font-semibold">
            {f.version} · {sv ? "Ägargodkännande" : "Owner approval"}:{" "}
            {f.owner_approved_at ?? (sv ? "väntar" : "pending")}
          </p>
          {f.bank
            .filter((i) => !onlyForm || f.items.some((x) => x.question.id === i.question.id))
            .map((i) => (
              <article key={i.question.id} className="rounded-2xl border bg-card p-5">
                <h2 className="mb-4 font-semibold">
                  {i.family} · {i.question.id}
                </h2>
                <Matrix question={i.question} sv={sv} />
                <Options
                  question={i.question}
                  sv={sv}
                  selected={i.key}
                  onSelect={() => {}}
                  disabled
                />
                <div className="mt-4 space-y-1 text-sm">
                  <p>{i.explanation[sv ? "sv" : "en"]}</p>
                  <p>
                    Template {i.templateId} / {i.templateVersion} · generator {i.generatorVersion} ·
                    seed {i.seed}
                  </p>
                  <p>
                    {sv ? "Designsvårighet" : "Design difficulty"}: {i.designDifficulty} ·{" "}
                    {sv ? "Observerad svårighet: ej mätt" : "Observed difficulty: not measured"}
                  </p>
                  <p>{i.engineeringReview}</p>
                  <p>
                    {sv
                      ? "Innehåll och tvetydighet: väntar på visuell granskning"
                      : "Content and ambiguity: visual review pending"}
                  </p>
                </div>
              </article>
            ))}
        </div>
      ))}
    </section>
  );
}
