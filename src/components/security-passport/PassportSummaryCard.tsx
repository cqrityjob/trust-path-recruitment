// The Security Passport card on the candidate home — the primary card.
//
// ── WHY THIS REPLACED THE STATELESS ENTRY CARD ─────────────────────────
//
// MyPassportEntryCard deliberately fetched nothing: it was one entry among
// many on a page that already made a queue of requests, and personalising a
// button was not worth another round trip.
//
// The approved dashboard makes the Passport the candidate's primary
// professional asset — the first and visually dominant thing on the page. A
// card in that position that cannot say how many credentials the holder has,
// or which country they are being read against, is a link dressed as a
// dashboard. So this one fetches, and MyPassportEntryCard stays for the
// surfaces that still want the cheap entry.
//
// ── WHAT IT WILL NOT SHOW ──────────────────────────────────────────────
//
// No trust score. No candidate rank. No "profile 72% complete".
//
// The approved mockup sketched a completeness meter, and it is the one thing
// from that sketch this card does not build. A percentage implies a
// denominator — complete against WHAT? There is no governed definition of a
// finished Passport, so any number here would be invented, and an invented
// number about a person's professional standing is the exact failure mode
// this product exists to avoid. Counts are facts; a score would not be.
//
// ── ONE LABEL, ONE NUMBER ──────────────────────────────────────────────
//
// The counts here used to be jurisdiction-relevant while the professional
// identity header two rems above counted the holder's whole Passport. Both
// said "Verifierade". A holder with three verified Swedish credentials who
// had stated Dubai as their work location therefore read "3 verifierade" and
// "0 Verifierade" on one screen, under the same word.
//
// Neither number was wrong. The label was: they answer different questions.
// So the headline figure is now what the holder HAS — every verified record,
// which is the same thing the header counts and can never contradict it —
// and relevance is stated as its own sentence, with the market named:
//
//     3 verifierade
//     2 verifierade gäller för Dubai, Förenade Arabemiraten
//
// ── JURISDICTION-FIRST, STILL ──────────────────────────────────────────
//
// Relevance is not softened, only separated from the total. The split still
// comes from jurisdiction-relevance.ts, the "other records" line still names
// the countries, and nothing is hidden or deleted: a holder who moves from
// Stockholm to Dubai keeps every Swedish credential, and simply stops being
// told that Swedish credentials are what Dubai reads.

import { Link } from "@tanstack/react-router";
import { IdCard, Lock, ShieldCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { formatWorkLocation, formatJurisdiction } from "@/lib/security-passport/format";
import { splitByWorkLocation, countriesOf } from "@/lib/security-passport/jurisdiction-relevance";
import { deriveMarketProfiles, marketBadges } from "@/lib/security-passport/market-profiles";
import { MarketBadgeRow } from "@/components/security-passport/MarketBadgeRow";
import { isCurrentlyVerified } from "@/lib/security-passport/trust-presentation";

/** Presentational. The snapshot is fetched by the route that renders this and
 *  handed down, because a Passport COMPONENT may not reach the server tier —
 *  see scripts/passport-separation-check.ts, rule 2. Only `*.functions.ts` may
 *  import `@tanstack/react-start`, which is what keeps this tree renderable
 *  offline and testable without a database. */
export function PassportSummaryCard({
  snapshot,
  isLoading,
  isError,
  className,
}: {
  snapshot: PassportSnapshot | undefined;
  isLoading: boolean;
  isError: boolean;
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();

  const holder = snapshot?.holder;
  const claims = holder?.claims ?? [];

  const work = {
    jurisdictionCode: holder?.jurisdictionCode ?? null,
    subJurisdictionCode: holder?.subJurisdictionCode ?? null,
  };
  const split = splitByWorkLocation(claims, work);
  // "Here" plus portable records is what this jurisdiction actually reads:
  // a language or a practical capability is not a regulated authorisation and
  // does not stop at a border.
  const relevant = [...split.here, ...split.portable];

  // The headline figures count the whole Passport — what this person HAS.
  // This is the same set the professional identity header counts, which is
  // what makes the two numbers on one screen agree.
  //
  // ── CURRENTLY verified, not EVER verified ──────────────────────────
  //
  // These three asked only about the assertion level, so a REVOKED
  // credential — whose verification really happened and whose assertion
  // level therefore correctly still says `verified` — was counted here as
  // though it currently stood. The same page then showed "1 verified" in
  // this card and "0 verified" in the career journey, which reads the
  // lifecycle, about one credential.
  //
  // `isCurrentlyVerified` is the shared predicate; the comment above about
  // the two numbers agreeing is now actually true.
  const verified = claims.filter(isCurrentlyVerified).length;
  const pending = claims.filter((c) => !isCurrentlyVerified(c)).length;
  // And relevance is its own, separately labelled statement.
  const verifiedHere = relevant.filter(isCurrentlyVerified).length;
  // Only worth saying when there is a market to say it about AND something
  // verified to be relevant or not. With no stated work location every claim
  // is already "here" (see splitByWorkLocation), so the sentence would be the
  // headline figure restated.
  const showRelevance = Boolean(work.jurisdictionCode) && verified > 0;
  // Sharing sends the public_card package, which is verified content only.
  // Offering it to a holder with nothing verified is offering an empty
  // envelope — and a holder whose only verified credential has been revoked
  // has nothing current to send.
  const canShare = claims.some(isCurrentlyVerified);

  const otherCountries = countriesOf(split.elsewhere);

  // One badge per market the holder holds evidence in, current market first.
  // Derived from the same module the Passport Card uses, so the compact card
  // and the full card can never disagree about how many markets there are.
  const badges = marketBadges(deriveMarketProfiles(claims, work).profiles);

  return (
    <section
      className={cn(
        // The dark surface is what makes this the dominant card in the
        // approved dashboard: three cards sit in one row and this is the one
        // the eye lands on. Text tokens are set explicitly against it rather
        // than inherited, because `muted-foreground` is tuned for the light
        // card surface and goes unreadable here.
        "rounded-xl bg-primary p-5 text-primary-foreground md:p-6",
        className,
      )}
      aria-labelledby="sp-summary-heading"
    >
      <div className="flex items-start gap-3">
        <IdCard aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary-foreground/80" />
        <div className="min-w-0">
          <h2
            id="sp-summary-heading"
            className="text-lg font-semibold tracking-tight text-primary-foreground"
          >
            {pt("home.passport.title")}
          </h2>
          <p className="mt-1 text-sm text-primary-foreground/70">{pt("home.passport.tagline")}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-5" role="status" aria-live="polite">
          <p className="text-sm text-primary-foreground/70">{pt("home.passport.loading")}</p>
          <div className="mt-3 h-20 animate-pulse rounded-md bg-primary-foreground/10 motion-reduce:animate-none" />
        </div>
      ) : isError ? (
        // Explicitly NOT a zero-state. "0 verified" and "we could not read your
        // Passport" are different sentences, and printing the first when the
        // second is true tells a holder their credentials are gone.
        <p className="mt-5 text-sm text-primary-foreground/80" role="alert">
          {pt("home.passport.unavailable")}
        </p>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-primary-foreground/20 pt-4 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">
                {pt("home.passport.verifiedTotal")}
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-primary-foreground">
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary-foreground/70" />
                {verified}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">
                {pt("home.passport.pending")}
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-primary-foreground">
                <Clock aria-hidden="true" className="h-4 w-4 text-primary-foreground/50" />
                {pending}
              </dd>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <dt className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">
                {pt("home.passport.workLabel")}
              </dt>
              <dd className="mt-1 text-sm font-medium text-balance text-primary-foreground">
                {formatWorkLocation(work.jurisdictionCode, work.subJurisdictionCode, lang)}
              </dd>
            </div>
          </dl>

          {/* Relevance, said in words with the market named — never a second
              number under the word the total already uses. "0 currently
              relevant for Dubai" beside "3 verified" is two true facts; two
              cells both labelled "Verified" reading 3 and 0 is not. */}
          {showRelevance && (
            <p className="mt-4 text-sm text-primary-foreground/80">
              <span className="font-medium text-primary-foreground">
                {verifiedHere === 0
                  ? `${pt("home.passport.relevantVerifiedNone")} ${formatWorkLocation(
                      work.jurisdictionCode,
                      work.subJurisdictionCode,
                      lang,
                    )}.`
                  : `${verifiedHere} ${pt("home.passport.relevantVerified")} ${formatWorkLocation(
                      work.jurisdictionCode,
                      work.subJurisdictionCode,
                      lang,
                    )}.`}
              </span>{" "}
              {pt("home.passport.relevantExplainer")}
            </p>
          )}

          {relevant.length === 0 && (
            <div className="mt-4 rounded-lg border border-primary-foreground/20 bg-primary-foreground/5 p-4">
              <p className="text-sm font-medium text-primary-foreground">
                {pt("home.passport.noneHere")}
              </p>
              <p className="mt-1 text-sm text-primary-foreground/70">
                {pt("home.passport.noneHereBody")}
              </p>
            </div>
          )}

          {/* The markets themselves, before the prose below reports what is
              outside the current one. A badge row is the compact card's only
              statement about jurisdiction, so it names markets and counts —
              never credential codes beside a country. */}
          <MarketBadgeRow badges={badges} className="mt-4" onNavy />

          {/* Credentials from another jurisdiction. Reported as a count with
              their country named, never merged into the figures above — that
              merge is precisely the false transferability claim. */}
          {split.elsewhere.length > 0 && (
            <p className="mt-4 text-xs text-primary-foreground/70">
              <span className="font-medium text-primary-foreground">
                {pt("home.passport.otherCredentials")}:
              </span>{" "}
              {split.elsewhere.length}{" "}
              {split.elsewhere.length === 1
                ? pt("home.passport.credentialFrom")
                : pt("home.passport.credentialsFrom")}{" "}
              {otherCountries.map((code) => formatJurisdiction(code, lang)).join(", ")}
            </p>
          )}
        </>
      )}

      <p className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-primary-foreground/25 px-2 py-0.5 text-xs text-primary-foreground/70">
        <Lock aria-hidden="true" className="h-3 w-3" />
        {pt("overview.privateNote")}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to="/passport"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary-foreground px-4 text-sm font-medium text-primary transition-colors hover:bg-primary-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
        >
          {pt("home.passport.open")}
        </Link>
        <Link
          to="/passport/credentials/new"
          className="inline-flex h-11 items-center justify-center rounded-md border border-primary-foreground/40 px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
        >
          {pt("home.passport.addCredential")}
        </Link>
        {canShare && (
          <Link
            to="/passport/share"
            className="inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-primary-foreground/80 underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
          >
            {pt("home.passport.share")}
          </Link>
        )}
      </div>
    </section>
  );
}
