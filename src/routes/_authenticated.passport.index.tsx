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
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setError(false);
    try {
      const [s, m] = await Promise.all([
        load({ data: undefined }),
        loadMetadata({ data: undefined }),
      ]);
      setSnapshot(s);
      setMetadata(m);
    } catch {
      setError(true);
    }
    try {
      const r = await loadReviews({ data: undefined });
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
    return <p role="status">{lang === "sv" ? "Läser yrkesbevis…" : "Loading credentials…"}</p>;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 lg:order-2">
        <CredentialWallet
          snapshot={snapshot}
          metadata={metadata}
          reviews={reviews}
          now={new Date().toISOString().slice(0, 10)}
        />
      </div>
      <PassportSideColumn
        snapshot={snapshot}
        today={new Date().toISOString().slice(0, 10)}
        className="lg:order-1"
      />
    </div>
  );
}
