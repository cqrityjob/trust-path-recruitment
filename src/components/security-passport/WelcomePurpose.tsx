// Welcome and purpose — the first thing a holder reads.
//
// ── WHY "WHAT THIS IS NOT" GETS EQUAL WEIGHT ───────────────────────────
//
// A product that collects employment history and calls itself a "passport"
// invites two specific wrong assumptions: that it grades the person, and
// that it is some kind of background check. Both are answered here, in the
// same visual weight as the positive claims, before a single question is
// asked. Burying that in a privacy policy would be technically compliant
// and practically useless.
//
// ── THE TWO RULES ARE STATED UP FRONT ──────────────────────────────────
//
// That the holder can never verify their own entries, and that only an
// authorised third party can, are the load-bearing facts of the whole trust
// model. A holder who learns them later — at the moment they discover they
// cannot mark their own licence verified — experiences them as an
// obstruction rather than as the point.

import { Check, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

function PointList({ keys, tone }: { keys: readonly PassportCopyKey[]; tone: "is" | "isNot" }) {
  const { pt } = usePassportCopy();
  const Icon = tone === "is" ? Check : X;
  return (
    <ul className="mt-3 space-y-2.5">
      {keys.map((k) => (
        <li key={k} className="flex items-start gap-2.5">
          <Icon
            aria-hidden="true"
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              tone === "is" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          />
          <span className="text-sm leading-relaxed text-foreground">{pt(k)}</span>
        </li>
      ))}
    </ul>
  );
}

export function WelcomePurpose({
  hasProgress,
  onStart,
  className,
}: {
  hasProgress: boolean;
  onStart: () => void;
  className?: string;
}) {
  const { pt } = usePassportCopy();

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
        {pt("welcome.eyebrow")}
      </p>
      <h2
        className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pt("welcome.title")}
      </h2>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{pt("welcome.lead")}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {pt("welcome.isTitle")}
          </h3>
          <PointList keys={["welcome.is1", "welcome.is2", "welcome.is3"]} tone="is" />
        </section>

        <section className="rounded-xl border border-border bg-secondary/40 p-5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {pt("welcome.isNotTitle")}
          </h3>
          <PointList keys={["welcome.isNot1", "welcome.isNot2", "welcome.isNot3"]} tone="isNot" />
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {pt("welcome.rulesTitle")}
            </h3>
            <ol className="mt-3 space-y-2.5">
              <li className="text-sm leading-relaxed text-foreground">
                <span className="font-semibold">1. </span>
                {pt("welcome.rule1")}
              </li>
              <li className="text-sm leading-relaxed text-foreground">
                <span className="font-semibold">2. </span>
                {pt("welcome.rule2")}
              </li>
            </ol>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={onStart}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {hasProgress ? pt("welcome.resume") : pt("welcome.start")}
      </button>
    </div>
  );
}
