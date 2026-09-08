import { Link } from "@tanstack/react-router";
import { Info, Split } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { L, careerRoutes, type CareerRoute } from "@/lib/career-center";
import { TransitionCard } from "./TransitionCard";

// "Karriärvägar" — one origin, several independent directions.
//
// ── WHY THIS IS NOT A CHAIN ────────────────────────────────────────────
//
// It was. Väktare → Ordningsvakt | Skyddsvakt → Säkerhetssamordnare →
// Säkerhetschef, rendered as numbered stages down a column with arrows
// between them. Every pair was backed by a recorded relationship, so the
// invariant held and the picture was still false: a sequence of stages tells
// a reader that each one comes after the last, and neither of those two
// statutory appointments is a step towards coordinating security. They are
// separate roles under separate Acts.
//
// So a route renders as an ORIGIN and a row of independent destinations, with
// one sentence saying in words what the layout says in shape. Where a further
// direction genuinely exists out of one of those destinations, it is its own
// route with its own origin — never a fourth rung on this one. The route
// validator refuses any arrangement where one branch leads to another,
// because that is a sequence in disguise.
//
// Each branch is a TransitionCard: the same component, the same evidence
// rules and the same words as the profession guides, so the two surfaces
// cannot describe the same move differently.

export function CareerRoutes({ onProfessionOpen }: { onProfessionOpen?: (slug: string) => void }) {
  const { t } = useT();

  if (careerRoutes.length === 0) return null;

  return (
    <div>
      <div className="space-y-10">
        {careerRoutes.map((route) => (
          <RouteGroup key={route.id} route={route} onProfessionOpen={onProfessionOpen} />
        ))}
      </div>
      <p className="mt-10 flex items-start gap-2.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        {t("cc.routes.disclaimer")}
      </p>
    </div>
  );
}

function RouteGroup({
  route,
  onProfessionOpen,
}: {
  route: CareerRoute;
  onProfessionOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  const originTitle = lang === "sv" ? route.origin.titleSv : route.origin.titleEn;

  return (
    <section
      data-career-route={route.id}
      data-route-origin={route.origin.slug}
      data-route-branches={route.branches.length}
      className="rounded-xl border border-border bg-card p-6 shadow-xs md:p-8"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold tracking-tight text-foreground">
          <Split className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("cc.routes.origin")}
        </span>
        <Link
          to="/career-center/$profession"
          params={{ profession: route.origin.slug }}
          onClick={() => onProfessionOpen?.(route.origin.slug)}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {originTitle}
        </Link>
        <span className="text-xs text-muted-foreground">
          {t(`cc.level.${route.origin.level}` as TranslationKey)}
        </span>
      </div>

      <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
        {L(route.name, lang)}
      </h3>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {L(route.direction, lang)}
      </p>

      {/* The independence claim, in words as well as in layout. A reader who
          skims the cards and not the paragraph above still sees it. */}
      {route.branches.length > 1 && (
        <p
          data-route-independent
          className="mt-3 max-w-[70ch] text-xs font-medium leading-relaxed text-foreground"
        >
          {t("cc.routes.independent")}
        </p>
      )}

      <ul className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {route.branches.map((branch) => (
          <li key={branch.transition.to.slug}>
            <TransitionCard
              transition={branch.transition}
              direction="onward"
              headingLevel={4}
              onOpen={onProfessionOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
