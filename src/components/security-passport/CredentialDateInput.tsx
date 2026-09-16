import { isCalendarDate } from "@/lib/security-passport/dates";
import { useEffect, useRef } from "react";

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
  min?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const valid = !value || (isCalendarDate(value) && (!min || value >= min));
    input.current?.setCustomValidity(
      valid
        ? ""
        : lang === "sv"
          ? "Ange ett giltigt datum (ÅÅÅÅ-MM-DD), tidigast utfärdandedatumet."
          : "Enter a valid date (YYYY-MM-DD), on or after the issue date.",
    );
  }, [value, min, lang]);
  return (
    <input
      ref={input}
      type="text"
      lang={lang}
      inputMode="numeric"
      placeholder={lang === "sv" ? "ÅÅÅÅ-MM-DD" : "YYYY-MM-DD"}
      maxLength={10}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      className={className}
    />
  );
}
