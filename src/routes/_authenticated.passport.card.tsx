// Security Passport — the private Passport Card, live.
//
// Direction C ("CQrityjob Signature"), the owner-approved visual system,
// rendered from the holder's real rows.
//
// ── IT MUST BE HONEST ABOUT AN EMPTY PASSPORT ──────────────────────────
//
// A Phase 2 holder has only self-reported entries, so `buildPassportCard`
// yields no milestone and no seal — and the card renders that state
// deliberately rather than dressing it up. Alongside it, in words: what
// verification will be, and that it does not exist yet.
//
// Showing a gold seal here "so the card looks finished" would be the single
// most damaging thing this product could do, because the card is the
// artifact people screenshot.
//
// ── THE CARD IS LOCKED ─────────────────────────────────────────────────
//
// The holder chooses whether to share it. They do not choose what it says:
// profession, jurisdiction, verified status, expiry, recognition, verifier
// identity and which credentials appear are all derived by
// `buildPassportCard` from their entries and the decisions made about them.
// There is no control on this page for any of it, and no prop that could
// carry one.
//
// Sharing lives in the sharing centre, where a package and an expiry are
// chosen and a revocable link is created. This page links there rather than
// producing a link of its own, so every share that exists is one the holder
// created deliberately and can revoke.

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { buildPassportCard } from "@/lib/security-passport/card";
import { DirectionC } from "@/components/security-passport/card/DirectionC";

export const Route = createFileRoute("/_authenticated/passport/card")({
  ssr: false,
  component: PassportCardRoute,
});

function PassportCardRoute() {
  const { pt } = usePassportCopy();
  const load = useServerFn(getMyPassport);
  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void load({ data: undefined })
      .then((s) => {
        if (alive) setSnapshot(s);
      })
      .catch((err: unknown) => {
        console.error("[passport] card load failed", err);
        if (alive) setError(pt("live.error"));
      });
    return () => {
      alive = false;
    };
  }, [load, pt]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!snapshot) return <p className="text-sm text-muted-foreground">{pt("live.loading")}</p>;
  if (!snapshot.profile) {
    return <p className="text-sm text-muted-foreground">{pt("live.startBody")}</p>;
  }

  const card = buildPassportCard(snapshot.holder, new Date().toISOString().slice(0, 10));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:items-start">
      <div className="w-full lg:w-[380px] lg:shrink-0">
        {/* The private card carries no live token. A token belongs to a
            SHARE, not to the holder — issuing one here would create a
            durable public address nobody chose to create and nobody would
            think to revoke. The QR block renders the product's own
            verification address so the layout is honest; the real,
            revocable /p/<token> URL is minted in the sharing centre. */}
        <DirectionC card={card} verifyUrl="cqrityjob.se/passport" className="min-h-[560px]" />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <section className="rounded-xl border border-border bg-card p-5">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
            <Lock aria-hidden="true" className="h-3 w-3" />
            {pt("overview.privateNote")}
          </span>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {pt("livecard.lockedNote")}
          </p>
          <Link
            to="/passport/share"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("livecard.shareCta")}
          </Link>
        </section>

        {/* The honest empty state. A card with nothing verified shows no
            seal and no milestone, and says why — rather than looking
            unfinished or, far worse, being dressed up so it looks
            finished. */}
        {card.state === "self_declared_only" || card.state === "empty" ? (
          <section className="rounded-xl border border-border bg-secondary/40 p-5">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {pt("livecard.selfReportedTitle")}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("livecard.selfReportedBody")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {pt("live.noVerificationBody")}
            </p>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {pt("jurisdiction.title")}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("jurisdiction.experienceVsEligibility")}
          </p>
        </section>
      </div>
    </div>
  );
}
