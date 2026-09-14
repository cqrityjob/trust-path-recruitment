/**
 * Image 1's "Passportkort" — the real Passport card, on Överskt.
 *
 * ── WHY IT IS HERE AND NOT DUPLICATED ──────────────────────────────────
 *
 * The card presentation already existed and already had two mount points
 * (/passport/card and the Passport page's side column). This is a third
 * mount of the SAME `buildPassportCard` + `DirectionC`, off the SAME
 * canonical `getMyPassport` read. No second Passport model, no second
 * builder, no writer of any kind — this component only reads.
 *
 * ── AND WHY IT DOES NOT REPEAT PassportSummary ─────────────────────────
 *
 * PassportSummary is directly above this on Överskt and owns the FIGURES:
 * three labelled merit counts from the one merit counter. So this renders
 * the card and nothing else — no counts, no verification state, no
 * percentage. Two components stating the same number differently on one
 * page is the contradiction the Overview already refuses elsewhere, and
 * the owner's correction asks for one summary and one card, not two
 * summaries.
 *
 * Nothing here is hard-coded: the holder, the merits and the recognition
 * all come out of the snapshot, and a person with an empty Passport gets
 * the card the builder produces for an empty Passport.
 *
 * ── STATES ─────────────────────────────────────────────────────────────
 *
 * A read still in flight is a skeleton, never an empty card. A failed read
 * says so and offers the Passport itself; it does NOT fall back to a blank
 * card, which would tell somebody with merits that they have none. A
 * holder with no Passport profile yet renders nothing at all — the
 * Overview's recommended next step is already asking them to open one, and
 * an empty card beside it would be a second, quieter ask.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { buildPassportCard } from "@/lib/security-passport/card";
import { DirectionC } from "@/components/security-passport/card/DirectionC";
import {
  getMyPassport,
  type PassportSnapshot,
} from "@/lib/security-passport/passport.functions";
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
      <section className={className} data-overview-passport-card="loading" aria-busy="true">
        <div className="h-[210px] w-full animate-pulse rounded-xl border border-border bg-muted/40" />
      </section>
    );
  }

  if (state.status === "failed") {
    return (
      <section className={className} data-overview-passport-card="failed">
        {/* The same failure primitive and the same message PassportSummary
            uses, so one unreadable Passport does not get described two
            different ways on one page. */}
        <Failed message={L(PASSPORT.unreadable, lang)} href="/passport" hrefLabel={L(PASSPORT.open, lang)} />
      </section>
    );
  }

  // No Passport profile yet: the recommended next step is already asking
  // for one. A blank card beside it would be a second, quieter ask.
  if (!state.snapshot.profile) return null;

  const card = buildPassportCard(state.snapshot.holder, today);

  return (
    <section className={className} data-overview-passport-card="ready">
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
        <DirectionC card={card} verifyUrl="cqrityjob.se/passport" />
      </div>
      <Link to="/passport/card" data-cta="overview-open-card" className={`${LINK} mt-2`}>
        {pt("side.openCard")}
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
