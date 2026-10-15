import { useT } from "@/i18n/context";

/** Shared by the public and employer shells; appears only on keyboard focus. */
export function SkipToContent() {
  const { t } = useT();
  return (
    <a
      href="#main-content"
      className="no-print sr-only fixed left-4 top-4 z-[100] rounded-md bg-background px-4 py-3 font-semibold text-foreground shadow-lg focus:not-sr-only focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      onClick={(event) => {
        const main = document.getElementById("main-content");
        if (!main) return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      {t("ui.skipToContent")}
    </a>
  );
}
