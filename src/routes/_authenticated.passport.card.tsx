import {
  getInternationalPassportMetadata,
  type InternationalPassportMetadata,
} from "@/lib/security-passport/international.functions";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { CompactPassportCard } from "@/components/security-passport/CompactPassportCard";

export const Route = createFileRoute("/_authenticated/passport/card")({
  ssr: false,
  component: PassportCardRoute,
});

function PassportCardRoute() {
  const { pt, lang } = usePassportCopy();
  const load = useServerFn(getMyPassport);
  const loadMetadata = useServerFn(getInternationalPassportMetadata);
  const [metadata, setMetadata] = useState<InternationalPassportMetadata | null>(null);
  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([load({ data: undefined }), loadMetadata({ data: undefined })])
      .then(([s, m]) => {
        if (alive) {
          setSnapshot(s);
          setMetadata(m);
        }
      })
      .catch(() => {
        if (alive) setError(pt("live.error"));
      });
    return () => {
      alive = false;
    };
  }, [load, loadMetadata, pt]);

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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:items-start">
      <div className="w-full lg:w-[380px] lg:shrink-0">
        <CompactPassportCard
          metadata={metadata ?? undefined}
          snapshot={snapshot}
          today={new Date().toISOString().slice(0, 10)}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <section className="rounded-xl border border-border bg-card p-5">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
            <Lock aria-hidden="true" className="h-3 w-3" />
            {pt("overview.privateNote")}
          </span>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {lang === "sv"
              ? "Sammanfattningen visar yrkesbevis. Ditt aktuella yrke kommer från Profil och är en egen uppgift."
              : "This summary shows credentials. Your current professional title comes from Profile and is self-reported."}
          </p>
          <Link
            to="/passport/share"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("livecard.shareCta")}
          </Link>
        </section>

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
