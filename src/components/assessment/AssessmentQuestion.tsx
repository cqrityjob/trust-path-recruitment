import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { Question } from "@/lib/assessment-content";
import { pickText } from "@/lib/assessment-content";

export type Answer = string | string[] | number | undefined;

export function AssessmentQuestion({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: Answer;
  onChange: (v: Answer) => void;
}) {
  const { t, lang } = useT();
  const topic = pickText(question.topic, lang);
  const prompt = pickText(question.prompt, lang);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-widest text-accent">{topic}</p>
      <h2
        className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {prompt}
      </h2>

      <div className="mt-8">
        {question.type === "single" && question.options && (
          <div className="grid grid-cols-1 gap-3">
            {question.options.map((o) => {
              const selected = value === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onChange(o.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border bg-background px-5 py-4 text-left text-sm transition-colors",
                    selected
                      ? "border-accent bg-accent/5 text-foreground"
                      : "border-border text-foreground hover:border-accent/60 hover:bg-muted/50",
                  )}
                  aria-pressed={selected}
                >
                  <span>{pickText(o.label, lang)}</span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border",
                      selected ? "border-accent bg-accent text-accent-foreground" : "border-border",
                    )}
                  >
                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {question.type === "multi" && question.options && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{t("sca.q.multi.hint")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {question.options.map((o) => {
                const arr = Array.isArray(value) ? (value as string[]) : [];
                const selected = arr.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      const next = selected ? arr.filter((x) => x !== o.id) : [...arr, o.id];
                      onChange(next);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border bg-background px-5 py-3.5 text-left text-sm transition-colors",
                      selected
                        ? "border-accent bg-accent/5 text-foreground"
                        : "border-border text-foreground hover:border-accent/60 hover:bg-muted/50",
                    )}
                    aria-pressed={selected}
                  >
                    <span>{pickText(o.label, lang)}</span>
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-sm border",
                        selected ? "border-accent bg-accent text-accent-foreground" : "border-border",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {question.type === "rating" && (
          <div>
            <div className="flex items-center gap-2">
              {Array.from({ length: (question.scaleMax ?? 5) - (question.scaleMin ?? 1) + 1 }, (_, i) => {
                const n = (question.scaleMin ?? 1) + i;
                const selected = value === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onChange(n)}
                    className={cn(
                      "flex h-14 flex-1 items-center justify-center rounded-md border text-base font-semibold transition-colors",
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-background text-foreground hover:border-accent/60 hover:bg-muted/50",
                    )}
                    aria-pressed={selected}
                    aria-label={String(n)}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {question.scaleLabels && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{pickText(question.scaleLabels.min, lang)}</span>
                <span>{pickText(question.scaleLabels.max, lang)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
