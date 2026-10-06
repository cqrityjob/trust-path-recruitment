import { useId } from "react";
import type { Cell, Question } from "@/lib/sentinel/types";
export function Figure({ cell, label }: { cell: Cell | null; label: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
      className="h-full w-full text-foreground"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {cell?.map((a, i) => (
          <pattern
            key={i}
            id={`${id}-${i}`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform={`scale(${a.reflected ? -1 : 1} 1) rotate(${35 - a.rotation * 45})`}
          >
            <path d="M0 0V5" stroke="currentColor" strokeWidth="2" />
          </pattern>
        ))}
      </defs>
      {cell === null ? (
        <text x="50" y="64" textAnchor="middle" fill="currentColor" fontSize="42" fontWeight="500">
          ?
        </text>
      ) : (
        cell.map((a, i) => {
          const x = 22 + (a.position % 3) * 28,
            y = 22 + Math.floor(a.position / 3) * 28;
          const fill =
            a.fill === "solid"
              ? "currentColor"
              : a.fill === "striped"
                ? `url(#${id}-${i})`
                : "none";
          return (
            <g
              key={i}
              transform={`translate(${x} ${y}) rotate(${a.rotation * 45}) scale(${a.reflected ? -1 : 1} 1)`}
              stroke="currentColor"
              strokeWidth="1.8"
              fill={fill}
              strokeLinejoin="round"
            >
              {a.shape === "circle" ? (
                <circle r="9" />
              ) : a.shape === "square" ? (
                <rect x="-9" y="-9" width="18" height="18" />
              ) : a.shape === "triangle" ? (
                <path d="M0 -10L10 8H-10Z" />
              ) : a.shape === "flag" ? (
                <path d="M-8 10V-10H9L3 -2H-8" />
              ) : (
                <path d="M-11 -5H1V-10L12 0L1 10V5H-11Z" />
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}
export function Matrix({ question, sv }: { question: Question; sv: boolean }) {
  return (
    <div
      className="mx-auto grid w-full max-w-[390px] grid-cols-3 gap-2 rounded-2xl border bg-muted/20 p-3"
      aria-label={sv ? "Matris med nio rutor" : "Nine-cell matrix"}
    >
      {question.matrix.map((c, i) => (
        <div
          key={i}
          className={`aspect-square rounded-lg border ${c === null ? "border-dashed border-accent bg-accent/5" : "bg-background"}`}
        >
          <Figure
            cell={c}
            label={`${sv ? "Ruta" : "Cell"} ${i + 1}${c === null ? (sv ? ", saknad figur" : ", missing figure") : ""}`}
          />
        </div>
      ))}
    </div>
  );
}
export function Options({
  question,
  sv,
  selected,
  onSelect,
  disabled,
}: {
  question: Question;
  sv: boolean;
  selected?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="mt-6">
      <legend className="mb-3 text-sm font-medium">
        {sv ? "Välj figuren som saknas" : "Choose the missing figure"}
      </legend>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {question.options.map((o, i) => (
          <label
            key={o.id}
            className={`relative cursor-pointer rounded-xl border-2 p-2 transition-colors focus-within:ring-2 focus-within:ring-accent ${selected === o.id ? "border-accent bg-accent/10" : "border-border bg-background hover:border-accent/50"}`}
          >
            <input
              type="radio"
              name={question.id}
              className="sr-only"
              value={o.id}
              checked={selected === o.id}
              onChange={() => onSelect(o.id)}
              aria-label={`${sv ? "Alternativ" : "Option"} ${String.fromCharCode(65 + i)}`}
            />
            <div className="aspect-square">
              <Figure
                cell={o.cell}
                label={`${sv ? "Alternativ" : "Option"} ${String.fromCharCode(65 + i)}`}
              />
            </div>
            <span aria-hidden className="block text-center text-xs font-semibold">
              {String.fromCharCode(65 + i)}
              {selected === o.id ? " ✓" : ""}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
