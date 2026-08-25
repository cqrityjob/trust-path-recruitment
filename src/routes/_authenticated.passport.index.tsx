// Security Passport — private overview, live data.
//
// The whole point of Phase 2: real rows, the same calculations the fixture
// prototype was reviewed against, and an honest picture of what a
// self-reported Passport actually looks like.
//
// ── WHY IT REUSES THE PROTOTYPE COMPONENTS VERBATIM ────────────────────
//
// PassportOverview, ExperienceTotalsPanel and the rest take plain domain
// objects. Feeding them live rows rather than fixtures means the reviewed
// presentation and the reviewed calculations are the ones that ship — not a
// second implementation that agrees with them today and drifts next month.
//
// ── WHAT A PHASE 2 HOLDER WILL ACTUALLY SEE ────────────────────────────
//
// Self-reported totals, no verified milestone, no seal. That is the honest
// state, and the page says so in words rather than leaving an empty
// recognition panel to imply something is missing or broken.

import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldQuestion } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  ensureMyPassport,
  getMyPassport,
  type PassportSnapshot,
} from "@/lib/security-passport/passport.functions";
import { PassportOverview } from "@/components/security-passport/PassportOverview";
import { needsWorkLocationConfirmation } from "@/lib/security-passport/onboarding";
import { AttentionPanel } from "@/components/security-passport/AttentionPanel";
import { attentionFor, type OpenReviews } from "@/lib/security-passport/attention";
import { listMyVerificationRequests } from "@/lib/security-passport/verification.functions";

export const Route = createFileRoute("/_authenticated/passport/")({
  ssr: false,
  component: PassportOverviewRoute,
});

/** Today, as an ISO date. The calculations take the evaluation date as an
 *  argument precisely so it is explicit rather than implicit. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function PassportOverviewRoute() {
  const { pt } = usePassportCopy();
  const navigate = useNavigate();
  const load = useServerFn(getMyPassport);
  const create = useServerFn(ensureMyPassport);
  const loadRequests = useServerFn(listMyVerificationRequests);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  // Which entries have a review open. The overview cannot say "waiting on you"
  // without it, and the holder's own requests are the only honest source.
  const [openReviews, setOpenReviews] = useState<OpenReviews>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [snap, reqs] = await Promise.all([
        load({ data: undefined }),
        loadRequests({ data: undefined }),
      ]);
      setSnapshot(snap);
      const open = new Map<string, "pending" | "clarification_requested">();
      for (const r of reqs.requests) {
        if (r.status !== "pending" && r.status !== "clarification_requested") continue;
        const subject = r.claimId ?? r.periodId;
        if (subject) open.set(subject, r.status);
      }
      setOpenReviews(open);
    } catch (err) {
      // The message is logged, not shown: a raw PostgREST error reads as a
      // crash and can leak schema detail.
      console.error("[passport] load failed", err);
      setError(pt("live.error"));
    }
  }, [load, loadRequests, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate() {
    setBusy(true);
    try {
      await create({ data: undefined });
      await refresh();
    } catch (err) {
      console.error("[passport] create failed", err);
      setError(pt("live.error"));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("live.retry")}
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return <p className="text-sm text-muted-foreground">{pt("live.loading")}</p>;
  }

  // No Passport yet: an explicit, private-by-default invitation rather than
  // creating one silently on first visit. A professional record should begin
  // with a decision.
  if (!snapshot.profile) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6">
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("live.startTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("live.startBody")}</p>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={busy}
          className="mt-5 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("live.creating") : pt("live.start")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stated once, at the top, in the holder's language: everything here
          is self-reported and verification does not exist yet. Leaving that
          to be inferred from chip colours would be the single easiest way
          for this product to mislead someone. */}
      <section className="rounded-xl border border-border bg-secondary/40 p-5">
        <div className="flex items-start gap-3">
          <ShieldQuestion
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
          />
          <div>
            <p className="text-sm leading-relaxed text-foreground">{pt("live.selfReportedOnly")}</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {pt("live.noVerificationYet")}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("live.noVerificationBody")}
            </p>
          </div>
        </div>
      </section>

      {/* What needs doing comes before the inventory of what exists. A holder
          who opens this page wants to know whether anything is on them. */}
      <AttentionPanel
        summary={attentionFor(
          snapshot.holder.claims,
          snapshot.holder.periods,
          today(),
          openReviews,
        )}
        onOpenEntry={(kind, id) =>
          void navigate({
            to: "/passport/entry/$kind/$entryId",
            params: { kind, entryId: id },
          })
        }
        className="mb-5"
      />

      <PassportOverview
        holder={snapshot.holder}
        evaluationOn={today()}
        viewingJurisdiction={snapshot.holder.jurisdictionCode}
        // Asked once, of anyone whose work location nobody has confirmed —
        // both the brand-new Passport and the legacy row still carrying the
        // old `DEFAULT 'SE'`. Deliberately the same prompt, because it is the
        // same question: the product does not know where this person works.
        needsWorkLocation={needsWorkLocationConfirmation(snapshot.profile)}
        onConfirmWorkLocation={() => void navigate({ to: "/passport/onboarding" })}
        onContinue={() => void navigate({ to: "/passport/onboarding" })}
        onOpenCard={() => void navigate({ to: "/passport/card" })}
        onShare={() => void navigate({ to: "/passport/share" })}
        onOpenEntry={(kind, id) =>
          void navigate({
            to: "/passport/entry/$kind/$entryId",
            params: { kind, entryId: id },
          })
        }
        onAddCredential={(code) =>
          void navigate({
            to: "/passport/credentials/new",
            search: code ? { code } : {},
          })
        }
        onResumeDraft={(claimId) =>
          void navigate({
            to: "/passport/credentials/new",
            search: { draft: claimId },
          })
        }
      />
    </div>
  );
}
