/**
 * Overview mounts the canonical compact Passport card from getMyPassport.
 * The card owns its bounded credential preview; the route renders no second list.
 * Loading and failure remain distinct from an empty or unopened Passport.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { CompactPassportCard } from "@/components/security-passport/CompactPassportCard";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { L, type Lang } from "./copy";
import { PASSPORT } from "./home-copy";
import { Failed } from "./home-primitives";

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; snapshot: PassportSnapshot };

export function OverviewPassportCard({
  lang,
  /** Injected so a guard can render a fixed day rather than "now". */
  today = new Date().toISOString().slice(0, 10),
  className = "",
}: {
  lang: Lang;
  today?: string;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const load = useServerFn(getMyPassport);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void load()
      .then((snapshot) => {
        if (alive) setState({ status: "ready", snapshot: snapshot as PassportSnapshot });
      })
      .catch(() => {
        if (alive) setState({ status: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [load]);

  if (state.status === "loading") {
    return (
      <section
        aria-label={pt("side.cardTitle")}
        className={className}
        data-overview-passport-card="loading"
        aria-busy="true"
      >
        <div className="h-[210px] w-full animate-pulse rounded-xl border border-border bg-muted/40" />
      </section>
    );
  }

  if (state.status === "failed") {
    return (
      <section
        aria-label={pt("side.cardTitle")}
        className={className}
        data-overview-passport-card="failed"
      >
        {/* The same failure primitive and the same message PassportSummary
            uses, so one unreadable Passport does not get described two
            different ways on one page. */}
        <Failed
          message={L(PASSPORT.unreadable, lang)}
          href="/passport"
          hrefLabel={L(PASSPORT.open, lang)}
        />
      </section>
    );
  }

  // No Passport profile yet: the recommended next step is already asking
  // for one. A blank card beside it would be a second, quieter ask.
  if (!state.snapshot.profile) return null;

  return (
    <section
      aria-labelledby="overview-passport-card-heading"
      className={className}
      data-overview-passport-card="ready"
    >
      <h2
        id="overview-passport-card-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        {pt("side.cardTitle")}
      </h2>
      {/* No live token. A token belongs to a SHARE, not to the holder, and
          minting one here would create a durable public address nobody
          chose to create — the same reasoning /passport/card records. */}
      <div className="mt-2">
        <CompactPassportCard snapshot={state.snapshot} today={today} />
      </div>
      <Link to="/passport/card" data-cta="overview-open-card" className={`${LINK} mt-2`}>
        {pt("side.openCard")}
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
