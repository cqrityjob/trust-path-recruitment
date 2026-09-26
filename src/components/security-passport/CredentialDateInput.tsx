import {
  normaliseCalendarDateInput,
  isStrictlyAfter,
  type CalendarDateInput,
} from "@/lib/security-passport/dates";
import { useEffect, useRef } from "react";

// ── WHAT THIS FIELD ACCEPTS ────────────────────────────────────────────
//
// The placeholder says ÅÅÅÅ-MM-DD, but a holder copying a date off a
// certificate writes it the way it is printed there, and Swedish documents
// print both 2020-05-09 and 20200509. Owner report: the field must read
// both, with or without the hyphens. So the field accepts every unambiguous
// typed form (see normaliseCalendarDateInput) and stores ONE: the ISO form.
//
// The draft is normalised as soon as a complete form is typed (ten characters
// with dashes, or eight digits), and again on blur for the unpadded dashed
// form -- "2020-5-9" cannot be normalised while it is being typed, because
// "2020-05-1" may still become "2020-05-19".

export type DateInputProblem = "shape" | "impossible" | "before_min";

/** What, if anything, is wrong with `value` in a field whose earliest
 *  allowed date is `min` (exclusive: the value must be strictly after it,
 *  the rule the database applies to valid_until against issued_on). */
export function dateInputProblem(value: string, min?: string): DateInputProblem | null {
  const read: CalendarDateInput = normaliseCalendarDateInput(value);
  if (read.kind === "empty") return null;
  if (read.kind === "invalid") return read.reason;
  if (min && normaliseCalendarDateInput(min).kind === "valid" && !isStrictlyAfter(read.iso, min))
    return "before_min";
  return null;
}

export function dateInputMessage(
  problem: DateInputProblem,
  lang: "sv" | "en",
  min?: string,
): string {
  const earliest = min ? normaliseCalendarDateInput(min) : null;
  const issued = earliest?.kind === "valid" ? earliest.iso : (min ?? "");
  if (lang === "sv") {
    if (problem === "shape")
      return "Ange datumet som ÅÅÅÅ-MM-DD eller ÅÅÅÅMMDD, till exempel 2020-05-09 eller 20200509.";
    if (problem === "impossible")
      return "Det datumet finns inte. Kontrollera månad (01–12) och dag, till exempel har februari aldrig 30 dagar.";
    return `Giltig till måste vara efter utfärdandedatumet (${issued}).`;
  }
  if (problem === "shape")
    return "Enter the date as YYYY-MM-DD or YYYYMMDD, for example 2020-05-09 or 20200509.";
  if (problem === "impossible")
    return "That date does not exist. Check the month (01–12) and the day; February never has 30 days, for example.";
  return `Valid until must be after the issue date (${issued}).`;
}

/** A typed value that is complete enough to normalise while typing: the two
 *  fixed-width forms. The unpadded dashed form waits for blur. */
const COMPLETE = /^(\d{4}-\d{2}-\d{2}|\d{8})$/;

/** ISO dates are also the Swedish numeric date format. A text control avoids
 * OS/browser language overriding the language explicitly chosen in Passport. */
export function CredentialDateInput({
  value,
  onChange,
  lang,
  min,
  required,
  disabled,
  className,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  lang: "sv" | "en";
  /** The date this one must be strictly after (valid_until against issued_on). */
  min?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const problem = dateInputProblem(value ?? "", min);
    input.current?.setCustomValidity(problem ? dateInputMessage(problem, lang, min) : "");
  }, [value, min, lang]);
  const settle = (raw: string, whileTyping: boolean) => {
    if (whileTyping && !COMPLETE.test(raw.trim())) return raw;
    const read = normaliseCalendarDateInput(raw);
    return read.kind === "valid" ? read.iso : raw;
  };
  return (
    <input
      ref={input}
      type="text"
      lang={lang}
      inputMode="numeric"
      placeholder={lang === "sv" ? "ÅÅÅÅ-MM-DD" : "YYYY-MM-DD"}
      maxLength={10}
      value={value ?? ""}
      onChange={(e) => onChange(settle(e.target.value, true))}
      onBlur={(e) => {
        const settled = settle(e.target.value, false);
        if (settled !== e.target.value) onChange(settled);
      }}
      required={required}
      disabled={disabled}
      className={className}
    />
  );
}
