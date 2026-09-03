// Explore and grow — the career tools, below everything that needs the
// person.
//
// Career Discovery, the Career Card, the CV, the profession explorer and
// the profile are valuable and none of them is urgent. They used to sit
// in the same row as a released report; here they sit under "Bygg vidare
// på din karriär", where a person who came to read their report can scroll
// past them and a person with a quiet week can find them.
//
// The rows come from the presentation model: the engine's remaining
// suggestions first, in its order and in its words, then the standing
// destinations it had nothing to say about. Each destination appears once.

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";
import type { ExploreItem } from "@/lib/professional-identity/home-presentation";
import { L, type Lang } from "./copy";
import { EXPLORE, EXPLORE_DESTINATION } from "./home-copy";
import { reasonFor, wordsFor } from "./next-action-copy";

export function ExploreAndGrow({
  items,
  children,
  className,
}: {
  items: readonly ExploreItem[];
  /** Collapsed supporting content the route owns: the onboarding status
   *  strip for a new account, the legacy report history. */
  children?: React.ReactNode;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  if (items.length === 0 && !children) return null;

  return (
    <section aria-labelledby="explore-heading" className={className} data-explore-and-grow>
      <h2
        id="explore-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        {L(EXPLORE.heading, l)}
      </h2>
      {items.length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const words = item.action ? wordsFor(item.action.kind, item.action.section) : null;
            const title = words
              ? L(words.title, l)
              : L(EXPLORE_DESTINATION[item.destination].title, l);
            const body =
              item.action && words
                ? `${reasonFor(item.action, l)} ${L(words.outcome, l)}`
                : L(EXPLORE_DESTINATION[item.destination].body, l);
            const cta = words
              ? L(words.verb, l)
              : L(EXPLORE_DESTINATION[item.destination].title, l);
            return (
              <li key={item.id}>
                <Link
                  to={item.href}
                  data-next-action={item.action ? "more" : undefined}
                  data-explore={item.destination}
                  className="group flex h-full min-h-11 flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="text-sm font-semibold text-foreground group-hover:underline">
                    {title}
                  </span>
                  <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-accent">
                    {cta}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {children}
    </section>
  );
}
