/**
 * The Security Passport on the career home — the third candidate surface,
 * beside the Profile and CV cards, as a read-only summary.
 *
 * Overview mounts the canonical compact Passport card from getMyPassport, in
 * its `summary` variant: the holder's name and title (which come from the
 * Profile and are edited there), the first few credentials they hold, and a
 * count of the rest. The card owns its bounded credential preview; the route
 * renders no second list. Loading and failure remain distinct from an empty
 * or unopened Passport.
 *
 * It is a PREVIEW and a shortcut. Nothing is edited here, no credential is
 * added here, and no share is created here. The one way in -- "Open Security
 * Passport" -- is PassportSummary's, directly below in the same region, so
 * this component carries no link of its own.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { IdCard } from "lucide-react";
import { SecurityPassportPreview } from "@/components/security-passport/SecurityPassportPreview";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { L, type Lang } from "./copy";
import { PASSPORT } from "./home-copy";
import { Failed } from "./home-primitives";

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
        aria-label="Security Passport"
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
        aria-label="Security Passport"
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
      {/* Same heading pattern as the Profile and CV cards beside it: the
          surface's name, then the one question it answers. */}
      <h2
        id="overview-passport-card-heading"
        className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <span className="text-accent" aria-hidden="true">
          <IdCard className="h-5 w-5" />
        </span>
        Security Passport
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{L(PASSPORT.question, lang)}</p>
      {/* No live token. A token belongs to a SHARE, not to the holder, and
          minting one here would create a durable public address nobody
          chose to create — the same reasoning the sharing flow records. */}
      <div className="mt-4">
        <SecurityPassportPreview snapshot={state.snapshot} today={today} variant="summary" />
      </div>
    </section>
  );
}
