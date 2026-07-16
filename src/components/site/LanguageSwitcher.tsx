import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-background/60 p-0.5 text-xs",
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
            "rounded-full px-2.5 py-1 font-medium uppercase tracking-wide transition-colors",
            lang === l
              ? "bg-primary text-primary-foreground"
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