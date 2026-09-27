import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n/context";

// A card is a promise that there is something to read.
//
// The `tag` prop this used to take existed for exactly one value: "Under
// utveckling". Half the catalogue rendered with it, which made an unfinished
// stub look like a finished guide with a small caveat rather than like
// something that should not have been linked at all. Only published guides
// are carded now, so the badge has nothing left to say and is gone.
//
// What replaced it is `level`, which is information a reader actually uses to
// decide whether to open the guide.
//
// ── WHAT THE PILOT PASS ADDED, AND THE ONE THING IT DID NOT ────────────
//
// `family` (which corner of the industry this is) and the FIRST formal
// requirement (what stands between the reader and the role) — the two facts
// that decide whether a card is worth opening and that a title alone cannot
// carry.
//
// The card deliberately shows one requirement, not all of them. A card is a
// decision aid; the complete, sourced list belongs on the guide. And when a
// role records none, the card says "inga formella krav registrerade" rather
// than staying silent: absence is information here, and silence would let a
// reader assume we simply had not looked.

export function ProfessionCard({
  slug,
  title,
  description,
  icon: Icon,
  level,
  family,
  formalRequirement,
  headingLevel = 3,
  onOpen,
}: {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  level?: string;
  /** The profession family, in the reader's language. */
  family?: string;
  /** The single most structural formal requirement, verbatim from the guide.
   *  Undefined means the guide records none — which the card states. */
  formalRequirement?: string;
  /** The title's level, so the outline nests under whatever section the
   *  card is listed in. */
  headingLevel?: 3 | 4 | 5;
  onOpen?: (slug: string) => void;
}) {
  const { t } = useT();
  const Heading = `h${headingLevel}` as "h3" | "h4" | "h5";
  return (
    <Link
      to="/career-center/$profession"
      params={{ profession: slug }}
      onClick={() => onOpen?.(slug)}
      // The results grid used to be a seamless sheet -- `gap-px` over a
      // `bg-border` container, so the gaps read as hairlines. With ten guides
      // in a three-column grid that leaves two empty cells in the last row,
      // rendered as bare grey blocks beside the final card. Bordered cards in
      // a normally gapped grid have no such artifact at any count, and match
      // the entry-path and reference cards elsewhere on the page.
      className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-6"
    >
      {/* Level and area on one line: the two facts a reader scans a list
          by. The icon is decoration and gives its width to the title on a
          phone. */}
      <div className="flex items-start gap-3">
        <span className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-accent transition-colors group-hover:bg-accent/10 sm:inline-flex">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {level && (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {level}
              </span>
            )}
            {family && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {family}
              </span>
            )}
          </div>
          <Heading className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
            {title}
          </Heading>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:line-clamp-none">
        {description}
      </p>

      <div className="mt-3 border-t border-border pt-3 sm:mt-4">
        {/* On a phone the list is for finding the profession; its first
            formal requirement, a clause of law cut to one line, helped
            nobody there. The guide lists every requirement in full. */}
        <div className="hidden sm:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("cc.card.formal")}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground">
            {formalRequirement ?? t("cc.card.formal.none")}
          </p>
        </div>
        {/* The same words as every other way into a profession: "Läs om
            {yrke}". The whole card is the link; this is its visible label. */}
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent transition-colors group-hover:text-[color:var(--accent-hover)] sm:mt-3">
          {t("cc.info.read").replace("{role}", title)}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}
