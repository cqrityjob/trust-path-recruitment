// Security Passport — the holder's workspace, live data.
//
// ── WHAT THIS ROUTE IS FOR ─────────────────────────────────────────────
//
// One question: what does a person see when they come back to their
// Passport after recording their first merit? Everything the page shows is
// derived from two reads and one pure function, so the answer is the same
// on every load and can be tested without a browser.
//
// ── THE READS ARE INDEPENDENT, AND THAT IS THE POINT ───────────────────
//
// The Passport, the verification requests and the market catalogue used to
// share one `Promise.all`, so a failed verification read took the whole
// record with it: a holder whose merits were perfectly intact saw "we could
// not fetch your Security Passport". They are three separate reads now.
//
//   * the PASSPORT failing is the only failure that has no page. Nothing
//     can be shown without it, and the retry is the whole page.
//   * the VERIFICATION state failing costs the review-derived figures and
//     the recommended step — which then say so, rather than showing zero
//     and "nothing needs you" over an unread clarification.
//   * the MARKET catalogue failing costs nothing on this page at all.
//
// ── IT DECIDES NO TRUST ────────────────────────────────────────────────
//
// `buildPassportWorkspace` does, and it in turn asks the shared merit
// labeller. This file wires reads to a component and owns navigation.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { PassportWorkspace } from "@/components/security-passport/PassportWorkspace";
import { needsWorkLocationConfirmation } from "@/lib/security-passport/onboarding";
import { deriveFirstRunState } from "@/lib/security-passport/first-run";
import { FirstRunLoading } from "@/components/security-passport/FirstRunJourney";
import { ScrollToHashOnceReady } from "@/components/security-passport/ScrollToHashOnceReady";
import { AttentionPanel } from "@/components/security-passport/AttentionPanel";
import { attentionFor, type OpenReviews } from "@/lib/security-passport/attention";
import { buildPassportWorkspace, type ReviewReadState } from "@/lib/security-passport/workspace";
import { listMyVerificationRequests } from "@/lib/security-passport/verification.functions";
import { VerificationOutcomes } from "@/components/professional-identity/VerificationOutcomes";
import {
  deriveVerificationAttention,
  VERIFICATION_ATTENTION_UNAVAILABLE,
  type VerificationAttention,
} from "@/lib/professional-identity/verification-attention";

export const Route = createFileRoute("/_authenticated/passport/")({
  ssr: false,
  component: PassportWorkspaceRoute,
});

/** Today, as an ISO date. The calculations take the evaluation date as an
 *  argument precisely so it is explicit rather than implicit. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function PassportWorkspaceRoute() {
  const { pt, lang } = usePassportCopy();
  const navigate = useNavigate();
  const load = useServerFn(getMyPassport);
  const loadRequests = useServerFn(listMyVerificationRequests);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  // Which entries have a review open. The workspace cannot say "waiting on
  // you" without it, and the holder's own requests are the only honest
  // source.
  const [openReviews, setOpenReviews] = useState<OpenReviews>(new Map());
  // Decided requests, which `openReviews` deliberately drops. A decision is
  // the single most important thing that happens to a request and it was the
  // one state this page could not see.
  //
  // ── LOADING IS NOT FAILURE ────────────────────────────────────────
  //
  // This used to be initialised to VERIFICATION_ATTENTION_UNAVAILABLE, so
  // for as long as a perfectly healthy request took to answer, the page said
  // the read had failed. Three states, and only one of them is an error.
  const [attention, setAttention] = useState<VerificationAttention | null>(null);
  const [reviewState, setReviewState] = useState<ReviewReadState>("loading");
  const [error, setError] = useState<string | null>(null);

  /** The verification state, on its own clock. Failing it costs the figures
   *  it feeds and nothing else — and those figures then read "could not be
   *  loaded" rather than zero. */
  const refreshVerification = useCallback(async () => {
    setReviewState("loading");
    try {
      const reqs = await loadRequests({ data: undefined });
      const open = new Map<string, "pending" | "clarification_requested">();
      for (const r of reqs.requests) {
        if (r.status !== "pending" && r.status !== "clarification_requested") continue;
        const subject = r.claimId ?? r.periodId;
        if (subject) open.set(subject, r.status);
      }
      setOpenReviews(open);
      setAttention(deriveVerificationAttention(reqs.requests));
      setReviewState("available");
    } catch (err) {
      console.error("[passport] verification state load failed", err);
      setOpenReviews(new Map());
      setAttention(VERIFICATION_ATTENTION_UNAVAILABLE);
      setReviewState("failed");
    }
  }, [loadRequests]);

  const refresh = useCallback(async () => {
    setError(null);
    void refreshVerification();

    try {
      setSnapshot(await load({ data: undefined }));
    } catch (err) {
      // The message is logged, not shown: a raw PostgREST error reads as a
      // crash and can leak schema detail.
      //
      // `live.readError` rather than the generic `live.error` because this
      // catch is REACHABLE: getMyPassport used to swallow a failed claims or
      // periods query and return an empty Passport, so a holder whose
      // credentials could not be read saw "0 verifierade" instead of this.
      // The wording a person needs at that moment is that nothing of theirs
      // has changed.
      console.error("[passport] load failed", err);
      setError(pt("live.readError"));
    }
  }, [load, refreshVerification, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── IS THERE A PASSPORT TO SHOW? ───────────────────────────────────
  //
  // Derived from the snapshot with the same function the journey itself uses,
  // so the two cannot disagree about whether this person has finished their
  // first run. `overview` is the only state this page renders; every other
  // one belongs to /passport/onboarding.
  const firstRun = snapshot
    ? deriveFirstRunState({
        profile: snapshot.profile
          ? {
              onboardingState: snapshot.profile.onboardingState,
              onboardingAnswers: snapshot.profile.onboardingAnswers,
            }
          : null,
        meritLifecycleStates: [
          ...snapshot.holder.claims.map((c) => c.lifecycleState),
          ...snapshot.holder.periods.map((p) => p.lifecycleState),
        ],
      })
    : null;

  // `replace`, so the browser's Back button does not put somebody straight
  // back onto a page that will send them here again.
  const handOff = firstRun !== null && firstRun.screen !== "overview";
  useEffect(() => {
    if (handOff) void navigate({ to: "/passport/onboarding", replace: true });
  }, [handOff, navigate]);

  // Everything the page shows, derived once from what has actually loaded.
  // `attention` carries its own `unavailable`, so a failed verification read
  // reaches the derivation as unknown rather than as "nothing outstanding".
  const workspace = useMemo(
    () =>
      snapshot
        ? buildPassportWorkspace({
            claims: snapshot.holder.claims,
            periods: snapshot.holder.periods,
            attention: reviewState === "available" ? attention : null,
            reviewState,
            now: new Date(),
          })
        : null,
    [snapshot, attention, reviewState],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <p role="alert" className="text-sm font-medium text-foreground">
          {error}
        </p>
        {/* The reassurance is a separate sentence from the failure, and is not
            destructive-red: "we could not read this" is not a warning about
            the holder's data, and colouring it as one says the opposite of
            what it means. */}
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {pt("live.readErrorBody")}
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

  if (!snapshot || !workspace) {
    return <FirstRunLoading />;
  }

  // ── THE FIRST RUN OWNS THE EMPTY PASSPORT ──────────────────────────
  //
  // This page used to answer two different questions with one screen: "here
  // is your Passport" and "you do not have one yet". Both live on, but the
  // second is a JOURNEY rather than a button — create the Passport, add a
  // merit, be told what was recorded — and it belongs at one URL so that a
  // refresh resumes it and a link can point at it.
  //
  // The condition is a CURRENT merit, decided by `deriveFirstRunState` from
  // the same lifecycle predicates My Career uses. Not `onboarding_state`: a
  // profile can say completed and hold nothing, and hosted data carries such
  // rows. Telling that holder they were finished, above an empty Passport, is
  // the single most damaging thing this page could say.
  if (!firstRun || firstRun.screen !== "overview") {
    return <FirstRunLoading />;
  }

  return (
    <>
      <ScrollToHashOnceReady />
      <PassportWorkspace
        workspace={workspace}
        // Asked once, of anyone whose work location nobody has confirmed —
        // both the brand-new Passport and the legacy row still carrying the
        // old `DEFAULT 'SE'`. Deliberately the same prompt, because it is the
        // same question: the product does not know where this person works.
        needsWorkLocation={needsWorkLocationConfirmation(snapshot.profile)}
        onConfirmWorkLocation={() =>
          void navigate({ to: "/passport/information", hash: "sp-work-country" })
        }
        onRetry={() => void refreshVerification()}
        attention={
          /* ── EVERYTHING THAT NEEDS THIS HOLDER, IN ONE REGION ──────────
             The career home links here as `/passport#attention` whenever more
             than one entry needs the holder — several reviewer questions, or
             several decisions — because there is no single entry to open. The
             anchor therefore has to be a REAL region that contains both
             panels: decisions that were made, and requests still open. It is
             `tabindex=-1` so `ScrollToHashOnceReady` can move focus here, and
             labelled so a screen-reader user who lands on it is told what it
             is rather than hearing an unnamed group. */
          <section
            id="attention"
            aria-labelledby="attention-heading"
            tabIndex={-1}
            className="scroll-mt-24"
          >
            <h2 id="attention-heading" className="sr-only">
              {pt("att.title")}
            </h2>
            <VerificationOutcomes
              attention={attention ?? VERIFICATION_ATTENTION_UNAVAILABLE}
              titleOf={(item) =>
                item.subjectKind === "claim"
                  ? ((c) => (c ? (lang === "sv" ? c.titleSv : c.titleEn) : pt("att.entryRemoved")))(
                      snapshot.holder.claims.find((c) => c.id === item.subjectId),
                    )
                  : ((p) => (p ? `${p.roleTitle} · ${p.employerName}` : pt("att.entryRemoved")))(
                      snapshot.holder.periods.find((p) => p.id === item.subjectId),
                    )
              }
              hrefOf={(item) => `/passport/entry/${item.subjectKind}/${item.subjectId}`}
              // The panel below already answers "is anything waiting" for the
              // lifecycle side. Two panels both saying "nothing waiting" is the
              // page talking to itself.
              showClear={false}
              // ── THE FAILURE IS EXPLAINED ONCE ────────────────────────
              //
              // The recommended-step card above owns that sentence and the
              // retry with it. This panel rendering its own "we could not
              // read your verifications" underneath was the same news
              // twice, in two competing blocks, about one failed request.
              showUnavailable={false}
              // DECIDED OR ASKED. The merits list below carries every open
              // review already, with the type, organisation and dates this
              // panel has no room for; repeating those titles here would be
              // the page listing one credential twice under two headings.
              groups={["actionRequired", "outcomes", "information"]}
              className="mb-4"
            />

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
              // The recommended-step card above always says something, so
              // this panel never has to print "nothing is waiting on you" —
              // and on a Passport in good order it renders nothing at all
              // rather than a box saying so.
              otherAttention
              // VALIDITY ONLY. The outcomes panel directly above owns the
              // reviewer's question and the reviewer's decision, and the
              // merits list below owns the open reviews with the type,
              // organisation and dates this panel does not carry. What is
              // left, and what nothing else on the page answers, is what has
              // lapsed and what is about to.
              buckets={["expired", "expiring"]}
            />
          </section>
        }
      />
    </>
  );
}
