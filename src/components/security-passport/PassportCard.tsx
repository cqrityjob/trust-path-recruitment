// The Passport Card — a locked credential artifact.
//
// ── HOW IT DIFFERS FROM CAREER CARD, CONCRETELY ────────────────────────
//
// Career Card is an expressive, shareable-to-social artifact: navy
// gradient, normalised dimension bars, a fit tier. This is a credential
// wallet, and it borrows none of that vocabulary. No bar, no meter, no
// percentage, no normalised indicator, no overall rating, no suitability
// language, no decorative achievement art.
//
// What it uses instead: a document surface, hairline rules, uppercase
// micro-labels, tabular dates, explicit attribution and explicit state.
// The two artifacts should be distinguishable at a glance by someone who
// has never been told they are different products.
//
// ── EVERY FIELD IS DERIVED ─────────────────────────────────────────────
//
// The component takes a `PassportCardModel` built by
// lib/security-passport/card.ts and a share overlay state. It exposes no
// prop that could set an assertion level, lifecycle state, issuer,
// verifier, date, jurisdiction or recognition, so "the holder cannot
// rewrite the facts" is a property of the type signature rather than a
// convention.

import { Ban, Clock, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatExpiry, formatNameList } from "@/lib/security-passport/format";
import { mayShowBadge } from "@/lib/security-passport/recognition";
import type { PassportCardModel, ShareOverlayState } from "@/lib/security-passport/card";
import { AssertionChip } from "./AssertionChip";
import { LifecycleChip } from "./LifecycleChip";
import { RecognitionBadge } from "./RecognitionBadges";

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function ShareOverlayNotice({ state }: { state: Exclude<ShareOverlayState, "none"> }) {
  const { pt } = usePassportCopy();
  const expired = state === "share_expired";
  const Icon = expired ? Clock : Ban;
  return (
    <div
      className={cn(
        "mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
        expired
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {expired ? pt("card.shareExpired") : pt("card.shareRevoked")}
    </div>
  );
}

export function PassportCard({
  card,
  shareOverlay = "none",
  className,
}: {
  card: PassportCardModel;
  shareOverlay?: ShareOverlayState;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const profession = lang === "sv" ? card.professionTitleSv : card.professionTitleEn;
  const jurisdiction =
    card.jurisdictionCode === "SE" ? pt("jurisdiction.SE") : card.jurisdictionCode;

  return (
    <article
      className={cn(
        // A document, not a poster: flat surface, firm border, no gradient.
        "mx-auto w-full max-w-md rounded-xl border-2 border-primary/20 bg-card p-5 shadow-sm",
        className,
      )}
      aria-label={pt("card.title")}
    >
      {shareOverlay !== "none" ? <ShareOverlayNotice state={shareOverlay} /> : null}

      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <MicroLabel>{pt("card.title")}</MicroLabel>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {pt("card.subtitle")}
        </p>
      </header>

      {card.state === "empty" ? (
        <div className="py-8 text-center">
          <ShieldQuestion aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">{pt("card.emptyState")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{pt("card.emptyBody")}</p>
        </div>
      ) : (
        <>
          <div className="pt-4">
            <h3
              className="text-xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {card.holderDisplayName}
            </h3>
            <p className="mt-1 text-sm text-foreground">
              {profession} · {jurisdiction}
            </p>
          </div>

          {mayShowBadge(card.recognition) ? (
            <div className="mt-4">
              <RecognitionBadge years={card.recognition.earnedYears as number} className="w-full" />
            </div>
          ) : null}

          {card.credentials.length > 0 ? (
            <section className="mt-5 border-t border-border pt-4">
              <MicroLabel>{pt("overview.sectionClaims")}</MicroLabel>
              <ul className="mt-2 space-y-2.5">
                {card.credentials.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"
                  >
                    <div className="min-w-0 flex-1">
                      {/* Wraps rather than truncates: a credential whose
                          name a reader cannot finish is not a credential.
                          The metadata line below may still truncate — a
                          clipped issuer is recoverable, a clipped title
                          is not. */}
                      <p className="text-sm font-medium text-balance text-foreground">
                        {lang === "sv" ? c.titleSv : c.titleEn}
                      </p>
                      <p className="truncate text-xs tabular-nums text-muted-foreground">
                        {c.issuerName} · {formatExpiry(c.validUntil, lang)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <AssertionChip level={c.assertionLevel} size="sm" />
                      <LifecycleChip state={c.lifecycleState} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {card.attributions.length > 0 ? (
            <section className="mt-4 border-t border-border pt-3">
              <MicroLabel>{pt("claims.verifier")}</MicroLabel>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNameList(card.attributions, lang)}
              </p>
            </section>
          ) : null}

          {card.containsExpired || card.containsDisputed ? (
            <ul className="mt-4 space-y-1">
              {card.containsExpired ? (
                <li className="text-xs text-amber-700 dark:text-amber-400">
                  {pt("card.containsExpired")}
                </li>
              ) : null}
              {card.containsDisputed ? (
                <li className="text-xs text-amber-700 dark:text-amber-400">
                  {pt("card.containsDisputed")}
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      )}

      <footer className="mt-5 border-t border-border pt-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{pt("card.locked")}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {pt("card.notVerifiedIdentity")}
        </p>
      </footer>
    </article>
  );
}

/** The card's own state, named in words. Rendered beside the card in the
 *  review harness so a reviewer can see which of the eight states they are
 *  looking at without inferring it. */
export function PassportCardStateLabel({
  card,
  shareOverlay,
}: {
  card: PassportCardModel;
  shareOverlay: ShareOverlayState;
}) {
  const { pt } = usePassportCopy();
  const parts: string[] = [];

  if (card.state === "empty") parts.push(pt("card.emptyState"));
  if (card.state === "self_declared_only") parts.push(pt("assertion.self_declared"));
  if (card.state === "partially_verified")
    parts.push(`${pt("assertion.verified")} (${pt("totals.documented")})`);
  if (card.state === "verified") parts.push(pt("assertion.verified"));
  if (card.containsExpired) parts.push(pt("card.containsExpired"));
  if (card.containsDisputed) parts.push(pt("card.containsDisputed"));
  if (shareOverlay === "share_expired") parts.push(pt("card.shareExpired"));
  if (shareOverlay === "share_revoked") parts.push(pt("card.shareRevoked"));

  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-semibold uppercase tracking-widest">{pt("card.state")}: </span>
      {parts.join(" · ")}
    </p>
  );
}
