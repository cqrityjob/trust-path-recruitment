// A checkbox that is checked when everything in `keys` is selected, empty when
// nothing is and indeterminate in between. Clicking it selects everything it
// governs, or clears it when everything is already selected.

import { useEffect, useRef } from "react";
import { nextOnClick, type SelectState } from "@/lib/security-passport/merit-selection";

export function SelectAllBox({
  state,
  label,
  count,
  onChange,
  idPrefix,
  dataAttr,
  className,
}: {
  readonly state: SelectState;
  readonly label: string;
  /** Printed beside the label: how many merits this governs. */
  readonly count: number;
  readonly onChange: (on: boolean) => void;
  readonly idPrefix: string;
  readonly dataAttr: string;
  readonly className?: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // `indeterminate` is a DOM property with no attribute.
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  const id = `${idPrefix}-select-all`;
  return (
    <label
      htmlFor={id}
      className={
        className ??
        "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md py-2 text-sm font-medium text-foreground"
      }
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        {...{ [dataAttr]: state }}
        checked={state === "all"}
        aria-checked={state === "some" ? "mixed" : state === "all"}
        onChange={() => onChange(nextOnClick(state))}
        className="h-5 w-5 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <span>
        {label} <span className="tabular-nums text-muted-foreground">({count})</span>
      </span>
    </label>
  );
}
