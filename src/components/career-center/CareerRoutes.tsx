import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  FileSearch,
  Info,
  Landmark,
  MoveRight,
  ShieldAlert,
  Split,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  L,
  careerRoutes,
  type CareerRoute,
  type CareerRouteBranch,
  type TransitionKind,
} from "@/lib/career-center";

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
// ── SUMMARIES HERE, DETAIL ON THE GUIDE ────────────────────────────────
//
// This section first rendered a full TransitionCard per branch — the same
// component the profession guide and the pathFrom section use. Six of them
// stacked put roughly 3,000px on a 375px screen, for a section whose job is
// to answer "what directions exist in this industry" at a glance. A reader
// who wants to know what a move requires is one click from the guide that
// says so properly.
//
// So a branch renders as a SUMMARY: the kind, the destination, one sentence,
// and whether the move is described or still under review. Every one of those
// values comes from the same `ProfessionTransition` the detailed card reads,
// so the two surfaces still cannot describe the same move differently — they
// differ in how much they say, not in what they say.

export function CareerRoutes({ onProfessionOpen }: { onProfessionOpen?: (slug: string) => void }) {
  const { t } = useT();

  if (careerRoutes.length === 0) return null;

  // The first route is the reader's most likely starting point and stays
  // open. Four route groups unfolded put 3,000px on a 375px screen for a
  // section whose job is orientation; the rest are one keystroke away.
  const [lead, ...rest] = careerRoutes;

  return (
    <div>
      <div className="space-y-6">
        <RouteGroup route={lead} onProfessionOpen={onProfessionOpen} />
        {rest.length > 0 && (
          <details data-routes-more className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
              {t("cc.routes.showMore")}
              <span className="tabular-nums text-muted-foreground">({rest.length})</span>
              <ChevronDown
                className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="mt-6 space-y-6">
              {rest.map((route) => (
                <RouteGroup key={route.id} route={route} onProfessionOpen={onProfessionOpen} />
              ))}
            </div>
          </details>
        )}
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

      <ul className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {route.branches.map((branch) => (
          <li key={branch.transition.to.slug}>
            <BranchSummary branch={branch} onProfessionOpen={onProfessionOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const KIND_ICON: Record<TransitionKind, typeof MoveRight> = {
  adjacent: MoveRight,
  formal_gate: ShieldAlert,
  long_term: Landmark,
};

const KIND_TONE: Record<TransitionKind, string> = {
  adjacent: "border-border bg-secondary text-foreground",
  formal_gate: "border-accent/40 bg-accent/10 text-accent",
  long_term: "border-border bg-background text-muted-foreground",
};

/** One direction, at a glance. The kind badge names itself in words as well
 *  as with an icon, and an unreviewed direction says so here too — a summary
 *  that dropped the caveat would be the detailed card's caveat quietly
 *  becoming optional. */
function BranchSummary({
  branch,
  onProfessionOpen,
}: {
  branch: CareerRouteBranch;
  onProfessionOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  const { transition } = branch;
  const Icon = KIND_ICON[transition.kind];
  const underReview = branch.evidenceLevel === "under_review";
  const title = lang === "sv" ? transition.to.titleSv : transition.to.titleEn;

  return (
    <div
      data-transition
      data-transition-to={transition.to.slug}
      data-transition-from={transition.from.slug}
      data-transition-kind={transition.kind}
      data-transition-evidence={branch.evidenceLevel}
      data-transition-summary
      className="flex h-full flex-col rounded-lg border border-border bg-background p-4"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight ${KIND_TONE[transition.kind]}`}
        >
          <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
          {t(`cc.step.${transition.kind}` as TranslationKey)}
        </span>
        {underReview && (
          <span
            data-transition-under-review
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            <FileSearch className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            {t("cc.step.under_review")}
          </span>
        )}
      </div>

      <h4 className="mt-3 text-base font-semibold tracking-tight text-foreground">
        <Link
          to="/career-center/$profession"
          params={{ profession: transition.to.slug }}
          onClick={() => onProfessionOpen?.(transition.to.slug)}
          className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {title}
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
        </Link>
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {underReview
          ? t("cc.step.under_review.help")
          : t(`cc.step.${transition.kind}.help` as TranslationKey)}
      </p>
    </div>
  );
}
