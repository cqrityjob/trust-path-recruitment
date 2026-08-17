// Mocked authenticated candidate home — TWO ADJACENT PRODUCTS.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ───────────────────────────────────
//
// A mock, rendered only inside the dev-only prototype, so the owner can
// evaluate discoverability and hierarchy. The live /my-career route is not
// touched, not imported and not modified by Phase 1.
//
// The Career Discovery side is a REFERENCE ONLY: a title, a tagline and a
// note that it is unchanged. The real Career Card modal is not reproduced,
// not redesigned and not opened, and no Career Discovery module is imported
// anywhere in this tree — enforced by
// scripts/passport-separation-check.ts.
//
// ── WHY THE TWO ENTRIES LOOK PARALLEL BUT READ DIFFERENTLY ─────────────
//
// One is a result, one is an identity. Neither is presented as a step
// toward the other, because a holder may have a Passport and never take
// Career Discovery, or the reverse. Presenting them as a funnel would be a
// product claim nobody has made.

import { Compass, IdCard, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportHolder } from "@/lib/security-passport/types";

function ActionChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground">
      {children}
    </span>
  );
}

export function CandidateHomeMock({
  holder,
  onOpenPassport,
  className,
}: {
  holder: PassportHolder;
  onOpenPassport: () => void;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const hasPassport = holder.periods.length > 0 || holder.claims.length > 0;

  return (
    <div className={cn("mx-auto w-full max-w-4xl", className)}>
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("home.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{pt("home.intro")}</p>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Career Discovery / Career Card — adjacent product, untouched. */}
        <section className="flex flex-col rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <Compass aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {pt("home.careerCard.title")}
              </h3>
              <p className="mt-1 text-sm text-foreground">{pt("home.careerCard.tagline")}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{pt("home.careerCard.body")}</p>

          <div className="mt-4 flex-1">
            {holder.hasCareerDiscoveryResult ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground">
                <Lock aria-hidden="true" className="h-3 w-3" />
                {pt("home.careerCard.unchanged")}
              </span>
            ) : (
              <p className="text-sm text-muted-foreground">{pt("home.careerCard.none")}</p>
            )}
          </div>
        </section>

        {/* Security Passport — the product this prototype is about. */}
        <section className="flex flex-col rounded-xl border-2 border-primary/25 bg-card p-5">
          <div className="flex items-start gap-3">
            <IdCard aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {pt("home.passport.title")}
              </h3>
              <p className="mt-1 text-sm text-foreground">{pt("home.passport.tagline")}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{pt("home.passport.body")}</p>

          <div className="mt-4 flex flex-1 flex-wrap items-start gap-2">
            {hasPassport ? (
              <>
                <ActionChip>{pt("home.passport.addExperience")}</ActionChip>
                <ActionChip>{pt("home.passport.addTraining")}</ActionChip>
                <ActionChip>{pt("home.passport.manageShares")}</ActionChip>
              </>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpenPassport}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {hasPassport ? pt("home.passport.continue") : pt("home.passport.start")}
          </button>
        </section>
      </div>
    </div>
  );
}
