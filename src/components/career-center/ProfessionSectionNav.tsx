import { useT } from "@/i18n/context";

// "På den här sidan" — an index of a long profession page.
//
// Plain same-page anchors in a horizontally scrollable strip: keyboard
// operable by construction, no scroll-spy script, and it wraps into a
// swipeable row on a phone instead of a wall of links. Sticky under the site
// header so the reader can jump between sections from anywhere on the page.

export interface SectionLink {
  readonly id: string;
  readonly label: string;
}

export function ProfessionSectionNav({ sections }: { sections: readonly SectionLink[] }) {
  const { t } = useT();
  if (sections.length < 2) return null;
  return (
    <nav
      aria-label={t("cc.nav.onPage")}
      data-profession-section-nav
      className="sticky top-16 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 md:px-6">
        {sections.map((s) => (
          <li key={s.id} className="flex-shrink-0">
            <a
              href={`#${s.id}`}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
