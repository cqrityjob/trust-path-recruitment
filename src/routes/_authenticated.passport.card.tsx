import {
  getInternationalPassportMetadata,
  type InternationalPassportMetadata,
} from "@/lib/security-passport/international.functions";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { credentialPassportHolder } from "@/lib/security-passport/credential-passport";
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
    <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2 lg:items-start">
      <div className="w-full lg:sticky lg:top-28">
        <CompactPassportCard
          selectedIds={selectedIds}
          metadata={metadata ?? undefined}
          snapshot={snapshot}
          today={new Date().toISOString().slice(0, 10)}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-4">
        <header>
          <p className="text-xs uppercase tracking-[.16em] text-muted-foreground">
            Security Passport
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Trust Card</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {lang === "sv"
              ? "Förhandsvisa ditt urval. Välj sedan uppgifter, mottagarvy och giltighetstid i delningsflödet."
              : "Preview your selection. Then choose fields, recipient preview and expiry in the sharing flow."}
          </p>
        </header>
        <fieldset className="rounded-2xl border border-border bg-card p-5">
          <legend className="px-2 text-sm font-semibold">
            {lang === "sv" ? "Välj för privat förhandsvisning" : "Select for private preview"}
          </legend>
          <div className="divide-y divide-border">
            {credentialPassportHolder(snapshot.holder).claims.map((c) => (
              <label key={c.id} className="flex min-h-14 items-center gap-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={(e) =>
                    setSelectedIds(
                      e.target.checked
                        ? [...selectedIds, c.id]
                        : selectedIds.filter((id) => id !== c.id),
                    )
                  }
                />
                <span className="break-words">
                  {lang === "sv" ? c.titleSv : c.titleEn || c.titleSv}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
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
