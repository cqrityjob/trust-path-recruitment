/**
 * Image 2's section row for /passport/information.
 *
 * ── LINKS, NOT TABS ────────────────────────────────────────────────────
 *
 * Deliberately not a tab widget. Tabs would hide every section but one,
 * and this page's sections are load-bearing as DOCUMENT content:
 *
 *   * `#sp-credentials` and `#sp-employment` are real ids other surfaces
 *     link to — the Passport workspace's add-a-merit chooser among them;
 *   * PR #246 redirects the retired `#sp-education`, `#sp-languages` and
 *     `#sp-skills` onto this page's anchors, and a redirect that lands on
 *     a hidden panel is a redirect that silently fails;
 *   * ScrollToHashOnceReady scrolls to an arriving fragment once the
 *     sections exist, which requires that they exist.
 *
 * So every section stays in the document and this is a row of in-page
 * links. Nothing is hidden, nothing is unmounted, and Ctrl-F still finds
 * a certificate the holder is looking for.
 *
 * ── REFLECTING WHERE YOU ARE ───────────────────────────────────────────
 *
 * The current hash marks its link with `aria-current="location"` — the
 * right token for "this is the part of the page you are in", where
 * `page` would claim the link leads somewhere else. With no hash nothing
 * is marked, rather than guessing that the reader is at the top.
 *
 * Reading the hash from the router rather than `window.location` is what
 * makes back and forward update the marker: a hash change is a navigation
 * the router knows about, and reading `window` directly would leave the
 * marker on whichever section was current when the component mounted.
 */
import { Link, useLocation } from "@tanstack/react-router";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export type PassportSectionLink = {
  /** The element id on this page, without the leading "#". */
  readonly anchor: string;
  readonly titleKey: PassportCopyKey;
};

export function PassportSectionNav({
  sections,
  label,
}: {
  readonly sections: readonly PassportSectionLink[];
  readonly label: string;
}) {
  const { pt } = usePassportCopy();
  const location = useLocation();
  // TanStack gives the hash without "#"; normalise either shape.
  const current = (location.hash ?? "").replace(/^#/, "");

  return (
    <nav aria-label={label} data-passport-section-nav className="overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 border-b border-border pb-px">
        {sections.map((s) => {
          const active = current === s.anchor;
          return (
            <li key={s.anchor}>
              <Link
                to="/passport/information"
                hash={s.anchor}
                data-section-link={s.anchor}
                aria-current={active ? "location" : undefined}
                className={[
                  "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {pt(s.titleKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
