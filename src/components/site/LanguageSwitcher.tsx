import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

/** The two-letter language toggle.
 *
 *  `tone` is presentation only. "onDark" is for a navy surface, where the
 *  default light border/foreground pair has too little contrast to read as a
 *  control. The public header's navy utility bar, its first caller, is gone:
 *  SV / EN now sits on the right of the one header row (locked navigation,
 *  2026-09-30).
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
  compact = false,
  menu = false,
}: {
  className?: string;
  tone?: "default" | "onDark";
  /** ONE 44 x 44 button that switches to the other language, for the public
   *  header between 1024 and 1279px: the locked navigation, the full SV / EN
   *  pair and both account actions do not fit side by side there. It names
   *  the language it switches TO, and says so in its accessible name. */
  compact?: boolean;
  /** Accessible radio items when the language control lives in the account menu. */
  menu?: boolean;
}) {
  const { lang, setLang, t } = useT();
  const onDark = tone === "onDark";
  if (menu) {
    return (
      <>
        <DropdownMenuLabel>{t("lang.switch")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={lang}
          onValueChange={(value) => {
            if (value === "sv" || value === "en") setLang(value);
          }}
          aria-label={t("lang.switch")}
        >
          <DropdownMenuRadioItem value="sv" lang="sv" className="min-h-11 cursor-pointer">
            Svenska
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en" lang="en" className="min-h-11 cursor-pointer">
            English
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </>
    );
  }
  if (compact) {
    const next = lang === "sv" ? "en" : "sv";
    return (
      <button
        type="button"
        onClick={() => setLang(next)}
        lang={next}
        aria-label={t(next === "en" ? "lang.switchToEn" : "lang.switchToSv")}
        className={cn(
          "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-border bg-background/60 px-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          className,
        )}
      >
        {next}
      </button>
    );
  }
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
