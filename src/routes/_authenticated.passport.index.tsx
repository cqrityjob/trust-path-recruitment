import { AttentionPanel } from "@/components/security-passport/AttentionPanel";
import { ScrollToHashOnceReady } from "@/components/security-passport/ScrollToHashOnceReady";
import { attentionFor } from "@/lib/security-passport/attention";
import { VerificationOutcomes } from "@/components/professional-identity/VerificationOutcomes";
import {
  deriveVerificationAttention,
  VERIFICATION_ATTENTION_UNAVAILABLE,
  type VerificationAttention,
} from "@/lib/professional-identity/verification-attention";
import { isPassportCredential } from "@/lib/security-passport/credential-passport";
import type { ReviewReadState } from "@/lib/security-passport/workspace";
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import {
  getInternationalPassportMetadata,
  type InternationalPassportMetadata,
} from "@/lib/security-passport/international.functions";
import { listMyVerificationRequests } from "@/lib/security-passport/verification.functions";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { CredentialWallet } from "@/components/security-passport/CredentialWallet";
import { PassportSideColumn } from "@/components/security-passport/PassportSideColumn";

export const Route = createFileRoute("/_authenticated/passport/")({
  ssr: false,
  component: PassportWorkspaceRoute,
});
function PassportWorkspaceRoute() {
  const { lang, pt } = usePassportCopy();
  const navigate = useNavigate();
  const load = useServerFn(getMyPassport);
  const loadMetadata = useServerFn(getInternationalPassportMetadata);
  const loadReviews = useServerFn(listMyVerificationRequests);
  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [metadata, setMetadata] = useState<InternationalPassportMetadata | null>(null);
  const [reviews, setReviews] = useState<ReadonlyMap<string, string> | null>(null);
  const [attention, setAttention] = useState<VerificationAttention | null>(null);
  const [reviewState, setReviewState] = useState<ReviewReadState>("loading");
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setError(false);
    let currentSnapshot: PassportSnapshot | null = null;
    try {
      const [s, m] = await Promise.all([
        load({ data: undefined }),
        loadMetadata({ data: undefined }),
      ]);
      currentSnapshot = s;
      setSnapshot(s);
      setMetadata(m);
    } catch {
      setError(true);
    }
    setReviewState("loading");
    try {
      const r = await loadReviews({ data: undefined });
      setReviewState("available");
      const owned = new Set(
        currentSnapshot?.holder.claims.filter(isPassportCredential).map((c) => c.id) ?? [],
      );
      setAttention(
        deriveVerificationAttention(r.requests.filter((r) => r.claimId && owned.has(r.claimId))),
      );
      setReviews(
        new Map(
          r.requests
            .filter(
              (v) =>
                v.claimId && (v.status === "pending" || v.status === "clarification_requested"),
            )
            .map((v) => [v.claimId!, v.status]),
        ),
      );
    } catch {
      setReviewState("failed");
      setAttention(VERIFICATION_ATTENTION_UNAVAILABLE);
      setReviews(null);
    }
  }, [load, loadMetadata, loadReviews]);
  useEffect(() => {
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    if (snapshot && !snapshot.profile) void navigate({ to: "/passport/onboarding", replace: true });
  }, [snapshot, navigate]);
  if (error)
    return (
      <div role="alert">
        <p>{pt("live.readError")}</p>
        <button className="mt-3 min-h-11 rounded-md border px-4" onClick={() => void refresh()}>
          {pt("live.retry")}
        </button>
      </div>
    );
  if (!snapshot || !metadata || !snapshot.profile)
    return <p role="status">{lang === "sv" ? "Läser meriter…" : "Loading credentials…"}</p>;
  return (
    <div data-passport-workspace className="mx-auto max-w-[1280px]">
      <div className="min-w-0 flex flex-col gap-6">
        <ScrollToHashOnceReady />
        <CredentialWallet
          snapshot={snapshot}
          metadata={metadata}
          reviews={reviews}
          reviewState={reviewState}
          now={new Date().toISOString().slice(0, 10)}
          // The action panel's lower half. Passed as a slot so the wallet renders
          // card, panel, collection in that order at every width, while this
          // route keeps owning every read.
          panel={
            <PassportSideColumn
              part="steps"
              metadata={metadata}
              snapshot={snapshot}
              reviews={reviews}
              today={new Date().toISOString().slice(0, 10)}
            />
          }
          underCard={
            <PassportSideColumn
              part="privacy"
              metadata={metadata}
              snapshot={snapshot}
              reviews={reviews}
              today={new Date().toISOString().slice(0, 10)}
            />
          }
        />
        <section id="attention" aria-labelledby="attention-heading" tabIndex={-1}>
          <h2 id="attention-heading" className="sr-only">
            {pt("att.title")}
          </h2>
          <VerificationOutcomes
            attention={attention ?? VERIFICATION_ATTENTION_UNAVAILABLE}
            showClear={false}
            showUnavailable={false}
            titleOf={(item) =>
              snapshot.holder.claims.find((c) => c.id === item.subjectId)?.[
                lang === "sv" ? "titleSv" : "titleEn"
              ] ?? pt("att.entryRemoved")
            }
            hrefOf={(item) => `/passport/entry/claim/${item.subjectId}`}
          />
          <AttentionPanel
            summary={attentionFor(
              snapshot.holder.claims.filter(isPassportCredential),
              [],
              new Date().toISOString().slice(0, 10),
            )}
            buckets={["expired", "expiring"]}
            otherAttention
            onOpenEntry={(kind, entryId) =>
              void navigate({ to: "/passport/entry/$kind/$entryId", params: { kind, entryId } })
            }
          />
        </section>
      </div>
    </div>
  );
}
