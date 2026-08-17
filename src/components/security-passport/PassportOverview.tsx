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

import { Lock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { totalsByEvidenceLevel } from "@/lib/security-passport/experience";
import { recognitionFor } from "@/lib/security-passport/recognition";
import type { Claim, ClaimType, PassportHolder } from "@/lib/security-passport/types";
import { AssertionLegend } from "./AssertionChip";
import { ClaimList } from "./ClaimRow";
import { CredentialSymbol } from "./CredentialSymbol";
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
  /** Opens the credential form. Optional so the fixture prototype, which
   *  has no router, simply hides the actions. */
  onAddCredential,
  /** Resumes one saved credential draft in the form. */
  onResumeDraft,
  className,
}: {
  holder: PassportHolder;
  evaluationOn: string;
  viewingJurisdiction: string;
  onContinue: () => void;
  onOpenCard: () => void;
  onShare: () => void;
  onOpenEntry?: (kind: "claim" | "experience", id: string) => void;
  onAddCredential?: (code?: string) => void;
  onResumeDraft?: (claimId: string) => void;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const totals = totalsByEvidenceLevel(holder.periods, evaluationOn);
  const recognition = recognitionFor(totals);

  // A draft is unfinished, private work — it resumes in the form rather
  // than posing as a recorded entry in the lists below.
  const draftClaims = holder.claims.filter((c) => c.lifecycleState === "draft");
  const liveClaims = holder.claims.filter((c) => c.lifecycleState !== "draft");

  const isEmpty = holder.periods.length === 0 && liveClaims.length === 0;
  const isPartial = !isEmpty && (holder.periods.length === 0 || liveClaims.length < 2);

  const grouped = CLAIM_GROUPS.map((type) => ({
    type,
    claims: liveClaims.filter((c: Claim) => c.claimType === type),
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
          {onAddCredential ? (
            <button
              type="button"
              onClick={() => onAddCredential()}
              className="inline-flex h-11 items-center gap-1.5 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {pt("cred.addAction")}
            </button>
          ) : null}
        </div>
      </header>

      {/* ── Unfinished credential drafts, resumable from where they show ── */}
      {onResumeDraft && draftClaims.length > 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-secondary/40 p-5">
          <SectionHeading>{pt("cred.drafts.title")}</SectionHeading>
          <p className="mt-1 text-sm text-muted-foreground">{pt("cred.drafts.lead")}</p>
          <ul className="mt-3 space-y-2">
            {draftClaims.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <CredentialSymbol
                    code={d.credentialCode}
                    state="draft"
                    name={lang === "sv" ? d.titleSv : d.titleEn}
                    size={36}
                    className="shrink-0"
                  />
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {lang === "sv" ? d.titleSv : d.titleEn}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onResumeDraft(d.id)}
                  className="inline-flex h-11 shrink-0 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {pt("cred.action.resume")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* What can be added, shown as the four marks — visible whether the
          Passport is empty or full, because "understand what can be added"
          is exactly what a first visit needs. */}
      {onAddCredential ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <SectionHeading>{pt("cred.overview.title")}</SectionHeading>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("cred.overview.body")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["VU1", "VU2", "OV", "SV"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onAddCredential(code)}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CredentialSymbol
                  code={code}
                  state="self_declared"
                  name={code}
                  size={28}
                  decorative
                />
                {code}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onAddCredential()}
              className="inline-flex h-11 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {pt("cred.addAction")}
            </button>
          </div>
        </section>
      ) : null}

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
