// The Career Card, as a destination of its own.
//
// ── WHY THIS ROUTE EXISTS ──────────────────────────────────────────────
//
// The Career Card is the shareable form of somebody's professional
// identity, and until now the only way to reach it was to open a Career
// Discovery report and find a button inside it. That made a first-class
// product read as a report export: people who had finished the assessment
// weeks earlier had no idea it was there, and nothing in the personal home
// or the profile mentioned it.
//
// So it gets a route, and the personal home and the identity header link to
// it. Nothing about the card itself changes.
//
// ── WHAT IS NOT DUPLICATED ─────────────────────────────────────────────
//
// No second card renderer, no second data model, no second copy of the
// card's rules. This route resolves WHICH report is the active one, loads
// that snapshot, and mounts the existing `CareerCardCreator` with the
// canonical `professions.ranked` and `outputA.dimensions` from it — exactly
// the two props the report view passes. The card and the report therefore
// cannot disagree about who is #1, which is the property
// scripts/career-discovery-career-card-check.ts already pins.
//
// ── AND IT IS HONEST WHEN THERE IS NO CARD ─────────────────────────────
//
// A card is possible only when the report NAMES careers — `ranked`
// non-empty — which is a different fact from the report existing, and the
// report view applies exactly this condition before offering the card. Both
// the "no assessment yet" and the "assessment done, no ranking" states say
// so in words and offer the thing that would actually help, rather than
// rendering an empty canvas.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { CareerCardCreator } from "@/components/career-discovery/v31/CareerCardCreator";
import { c, L, type Lang } from "@/components/professional-identity/copy";
import { useT } from "@/i18n/context";
import { getActiveCareerReport } from "@/lib/career-discovery/active-report.functions";
import { getStoredDiscoveryReport } from "@/lib/career-discovery/stored-report.functions";
import { getMyProfessionalIdentity } from "@/lib/professional-identity/identity.functions";
import { summariseTrust } from "@/lib/professional-identity/trust-summary";
import { careerCardTrustLine } from "@/lib/career-discovery/v31/career-card";

export const Route = createFileRoute("/_authenticated/my-career/career-card")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Career Card — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CareerCardPage,
});

const COPY = {
  back: c("Min karriär", "My Career"),
  title: c("Ditt Career Card", "Your Career Card"),
  lede: c(
    "Din profil som ett kort du kan dela. Det byggs av din senaste Karriäranalys — du väljer format och om ditt förnamn ska stå med, inget annat.",
    "Your profile as a card you can share. It is built from your latest Career Analysis — you choose the format and whether your first name appears, nothing else.",
  ),
  loading: c("Hämtar ditt kort…", "Loading your card…"),
  failed: c(
    "Kortet kunde inte hämtas just nu. Ladda om sidan för att försöka igen.",
    "The card could not be loaded right now. Reload the page to try again.",
  ),
  open: c("Öppna kortet", "Open the card"),

  noReportTitle: c(
    "Du har inte gjort Career Discovery ännu",
    "You have not taken Career Discovery yet",
  ),
  noReportBody: c(
    "Kortet bygger på din Karriäranalys från Career Discovery. Den tar ungefär 15 minuter.",
    "The card is built on the Career Discovery result. It takes about 15 minutes.",
  ),
  startDiscovery: c("Gör Career Discovery", "Take Career Discovery"),

  noRankingTitle: c(
    "Din rapport namnger inga yrken ännu",
    "Your report does not name any professions yet",
  ),
  noRankingBody: c(
    "Ett Career Card presenterar dina tre främsta yrkesmatchningar. Din senaste rapport innehåller ingen sådan rangordning, så det finns inget att sätta på kortet.",
    "A Career Card presents your top three profession matches. Your latest report contains no such ranking, so there is nothing to put on the card.",
  ),
  openReport: c("Öppna rapporten", "Open the report"),
} as const;

function CareerCardPage() {
  const { lang } = useT();
  const l = lang as Lang;
  const [open, setOpen] = useState(false);

  const loadActive = useServerFn(getActiveCareerReport);
  const active = useQuery({
    queryKey: ["career", "active-report"],
    queryFn: () => loadActive(),
    staleTime: 60_000,
  });

  const snapshotId =
    active.data && (active.data.kind === "discovery_v3_0" || active.data.kind === "discovery_v3_1")
      ? active.data.snapshotId
      : null;

  const loadReport = useServerFn(getStoredDiscoveryReport);
  const report = useQuery({
    queryKey: ["discovery", "report", snapshotId],
    queryFn: () => loadReport({ data: { snapshotId: snapshotId! } }),
    enabled: snapshotId !== null,
    staleTime: 5 * 60 * 1000,
  });

  // The first name is a prefill the person may remove; nothing else from
  // the profile reaches the card.
  const loadIdentity = useServerFn(getMyProfessionalIdentity);
  const identity = useQuery({
    queryKey: ["professional-identity"],
    queryFn: () => loadIdentity(),
    staleTime: 60_000,
  });
  const firstName = (identity.data?.displayName ?? "").trim().split(/\s+/)[0] || null;

  // ── THE TRUST LINE ──────────────────────────────────────────────────
  //
  // From the identity query THIS ROUTE ALREADY MAKES for the first name --
  // no second Passport read, no second query key, no duplicate network
  // round trip (§24, §25). The counts come from `summariseTrust`, which My
  // Career's career journey also calls, so the card and the home page cannot
  // disagree about how many things are verified.
  //
  // Null while the query is still loading and null if it failed, so a card
  // opened during a slow or broken identity read carries no trust claim at
  // all rather than a claim built on partial data.
  // A function of locale rather than a value, because the card is rendered
  // in the SNAPSHOT's language, not the site's, and that is only in scope at
  // the mount below. Same reason `CareerCardCreator` binds `locale` there.
  const trustLineFor = (cardLocale: "sv" | "en") =>
    identity.data ? careerCardTrustLine(summariseTrust(identity.data), cardLocale) : null;

  // Narrowed once, so every use below carries the v3.1 branch's own fields
  // (snapshot, generatedAt, versions) rather than the union's.
  const v31 = report.data && report.data.status === "v3.1" ? report.data : null;
  const snapshot = v31?.snapshot ?? null;
  const ranked = snapshot?.professions?.ranked ?? [];

  const pending = active.isPending || (snapshotId !== null && report.isPending);
  const failed = active.isError || report.isError;

  return (
    <SiteLayout>
      <Container className="py-10 md:py-14">
        <Link
          to="/my-career"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {L(COPY.back, l)}
        </Link>

        <h1
          className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {L(COPY.title, l)}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {L(COPY.lede, l)}
        </p>

        {pending && <p className="mt-8 text-sm text-muted-foreground">{L(COPY.loading, l)}</p>}
        {failed && (
          <p role="alert" className="mt-8 text-sm text-destructive">
            {L(COPY.failed, l)}
          </p>
        )}

        {!pending && !failed && snapshotId === null && (
          <div className="mt-8 max-w-2xl rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground">{L(COPY.noReportTitle, l)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{L(COPY.noReportBody, l)}</p>
            <Link
              to="/security-career-assessment"
              className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
            >
              {L(COPY.startDiscovery, l)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        {!pending && !failed && snapshotId && ranked.length === 0 && (
          <div className="mt-8 max-w-2xl rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold text-foreground">{L(COPY.noRankingTitle, l)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{L(COPY.noRankingBody, l)}</p>
            <Link
              to="/security-career-assessment/report/$snapshotId"
              params={{ snapshotId }}
              className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              {L(COPY.openReport, l)}
            </Link>
          </div>
        )}

        {!pending && !failed && v31 && snapshotId && snapshot && ranked.length > 0 && (
          <div className="mt-8">
            <PrimaryButton type="button" onClick={() => setOpen(true)}>
              {L(COPY.open, l)}
            </PrimaryButton>

            <CareerCardCreator
              open={open}
              onOpenChange={setOpen}
              ranked={ranked.slice(0, 3)}
              dimensions={snapshot.outputA.dimensions}
              locale={snapshot.locale === "en" ? "en" : "sv"}
              definitionVersion={snapshot.versions.definitionVersion}
              generatedAt={snapshot.completedAt ?? v31.generatedAt}
              suggestedFirstName={firstName}
              trustLine={trustLineFor(snapshot.locale === "en" ? "en" : "sv")}
            />

            <Link
              to="/security-career-assessment/report/$snapshotId"
              params={{ snapshotId }}
              className="mt-6 block text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {L(COPY.openReport, l)}
            </Link>
          </div>
        )}
      </Container>
    </SiteLayout>
  );
}
