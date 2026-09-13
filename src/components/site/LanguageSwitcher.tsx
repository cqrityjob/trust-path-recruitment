import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

/** The two-letter language toggle.
 *
 *  `tone` is presentation only. "onDark" exists because the switcher now sits
 *  in the navy utility bar at the top of the public header, where the default
 *  light border/foreground pair has too little contrast to read as a control.
 *  Every other caller keeps the default and is untouched.
 *
 *  ── 44 x 44, INCLUDING THE TWO-LETTER BUTTONS (2026-09-13) ───────────
 *
 *  A two-character label is the easiest control in a design system to leave
 *  at 28px, and this one was: it was named in the public homepage suite as a
 *  deliberate exception, "a mouse target on a >=1024px viewport". The
 *  Platform Entry Specification §12 does not allow the exception -- every
 *  control carries a 44px minimum -- so each button now reserves a real
 *  44 x 44 box and the group's padding is what shrank instead. The visual
 *  pill is unchanged in weight; only the hit area grew. */
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
        "inline-flex items-center rounded-full border p-0 text-xs",
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
            "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-2.5 font-semibold uppercase tracking-wide transition-colors",
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
