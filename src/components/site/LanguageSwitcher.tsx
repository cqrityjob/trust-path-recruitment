import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

/** The two-letter language toggle.
 *
 *  `tone` is presentation only. "onDark" exists because the switcher now sits
 *  in the navy utility bar at the top of the public header, where the default
 *  light border/foreground pair has too little contrast to read as a control.
 *  Every other caller keeps the default and is untouched. */
export function LanguageSwitcher({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "onDark";
}) {
  const { lang, setLang, t } = useT();
  const onDark = tone === "onDark";
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border p-0.5 text-xs",
        onDark
          ? "border-primary-foreground/25 bg-primary-foreground/5"
          : "border-border bg-background/60",
        className,
      )}
      role="group"
      aria-label={t("lang.switch")}
    >
      {(["sv", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            "rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            onDark ? "focus-visible:ring-offset-primary" : "focus-visible:ring-offset-background",
            lang === l
              ? onDark
                ? "bg-primary-foreground text-primary"
                : "bg-primary text-primary-foreground"
              : onDark
                ? "text-primary-foreground/70 hover:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
