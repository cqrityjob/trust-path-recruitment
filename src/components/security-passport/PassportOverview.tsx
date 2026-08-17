// The private Passport overview.
//
// ── NO COMPLETION SCORE ────────────────────────────────────────────────
//
// Deliberately no "your Passport is 60% complete". A completion percentage
// attached to a professional record is read as a rating of the
// professional, and there is no honest way to prevent that reading. Where
// guidance is useful, it is a plain list of what has not been added yet —
// which is more actionable than a number anyway.
//
// ── PRIVATE MEANS PRIVATE, AND SAYS SO ─────────────────────────────────
//
// The page states that only the holder sees it. Passport asks for a career
// history before it has earned any trust; saying plainly who can see the
// answer is the cheapest way to earn some.

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { totalsByEvidenceLevel } from "@/lib/security-passport/experience";
import { recognitionFor } from "@/lib/security-passport/recognition";
import type { Claim, ClaimType, PassportHolder } from "@/lib/security-passport/types";
import { AssertionLegend } from "./AssertionChip";
import { ClaimList } from "./ClaimRow";
import { ExperienceTimeline } from "./ExperienceTimeline";
import { ExperienceTotalsPanel } from "./ExperienceTotals";
import { JurisdictionNotice } from "./JurisdictionNotice";
import { RecognitionPanel } from "./RecognitionBadges";

const CLAIM_GROUPS: readonly ClaimType[] = [
  "licence",
  "certification",
  "training",
  "specialisation",
  "education",
  "professional_membership",
];

function SectionHeading({ children }: { children: string }) {
  return (
    <h3
      className="text-lg font-semibold tracking-tight text-foreground"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </h3>
  );
}

export function PassportOverview({
  holder,
  evaluationOn,
  viewingJurisdiction,
  onContinue,
  onOpenCard,
  onShare,
  /** Optional: the fixture prototype has nowhere to navigate to, so it does
   *  not pass this and no entry becomes clickable there. The live overview
   *  passes it and every entry gains a route into its own trust journey. */
  onOpenEntry,
  className,
}: {
  holder: PassportHolder;
  evaluationOn: string;
  viewingJurisdiction: string;
  onContinue: () => void;
  onOpenCard: () => void;
  onShare: () => void;
  onOpenEntry?: (kind: "claim" | "experience", id: string) => void;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const totals = totalsByEvidenceLevel(holder.periods, evaluationOn);
  const recognition = recognitionFor(totals);

  const isEmpty = holder.periods.length === 0 && holder.claims.length === 0;
  const isPartial = !isEmpty && (holder.periods.length === 0 || holder.claims.length < 2);

  const grouped = CLAIM_GROUPS.map((type) => ({
    type,
    claims: holder.claims.filter((c: Claim) => c.claimType === type),
  })).filter((g) => g.claims.length > 0);

  const profession = lang === "sv" ? holder.professionTitleSv : holder.professionTitleEn;

  return (
    <div className={cn("mx-auto w-full max-w-3xl space-y-6", className)}>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
            <Lock aria-hidden="true" className="h-3 w-3" />
            {pt("overview.privateNote")}
          </span>
        </div>
        <h2
          className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("overview.title")}
        </h2>
        <p className="mt-2 text-sm text-foreground">
          {holder.displayName} · {profession} ·{" "}
          {holder.jurisdictionCode === "SE" ? pt("jurisdiction.SE") : holder.jurisdictionCode}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onOpenCard}
            className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("overview.viewCard")}
          </button>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("overview.share")}
          </button>
        </div>
      </header>

      {isEmpty || isPartial ? (
        <section className="rounded-xl border border-dashed border-border bg-secondary/40 p-5">
          <SectionHeading>
            {isEmpty ? pt("overview.emptyTitle") : pt("overview.partialTitle")}
          </SectionHeading>
          <p className="mt-2 text-sm text-muted-foreground">
            {isEmpty ? pt("overview.emptyBody") : pt("overview.partialBody")}
          </p>
          <button
            type="button"
            onClick={onContinue}
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("overview.continue")}
          </button>
        </section>
      ) : null}

      {!isEmpty ? (
        <>
          <AssertionLegend />

          <section className="space-y-4">
            <SectionHeading>{pt("overview.sectionExperience")}</SectionHeading>
            <ExperienceTotalsPanel totals={totals} periods={holder.periods} />
            <ExperienceTimeline periods={holder.periods} evaluationOn={evaluationOn} />

            {onOpenEntry && holder.periods.length > 0 ? (
              <ul className="space-y-2">
                {holder.periods.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <span className="min-w-0 text-sm text-foreground">
                      {p.roleTitle} · {p.employerName}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenEntry("experience", p.id)}
                      className="inline-flex h-11 shrink-0 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pt("claim.openDetail")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* No outer heading: the panel titles itself, and the two strings
              are the same word. The experience section above carries one
              because it groups two differently-named panels. */}
          <section>
            <RecognitionPanel recognition={recognition} />
          </section>

          <section className="space-y-4">
            <SectionHeading>{pt("overview.sectionClaims")}</SectionHeading>
            {grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">{pt("overview.noClaims")}</p>
            ) : (
              grouped.map((g) => (
                <div key={g.type}>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {pt(`claims.type.${g.type}` as const)}
                  </h4>
                  <ClaimList
                    claims={g.claims}
                    emptyLabel={pt("overview.noClaims")}
                    showType={false}
                    onOpenClaim={
                      onOpenEntry ? (claimId) => onOpenEntry("claim", claimId) : undefined
                    }
                  />
                </div>
              ))
            )}
          </section>

          <JurisdictionNotice
            credentialJurisdiction={holder.jurisdictionCode}
            viewingJurisdiction={viewingJurisdiction}
          />
        </>
      ) : null}
    </div>
  );
}
