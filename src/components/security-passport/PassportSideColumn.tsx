// The Passport overview's side column — what to do next, and who can see it.
//
// ── THERE IS EXACTLY ONE PASSPORT ON THIS PAGE ─────────────────────────
//
// This column used to open with a complete second Passport: the compact
// card, with the holder's name, title and brand mark, directly beside the
// large identity surface that already states all three. Two Passports on
// the page that IS the Passport — and the second one was empty, asking the
// reader to "choose the credentials to include" where nothing can be chosen.
//
// The recipient-style rendering belongs to Preview and share, where a
// selection exists for it to show. So this column carries no Passport card
// at all, and a guard asserts it stays that way. What it carries instead is
// the two things the wallet beside it does not say:
//
//   1. THE NEXT STEP  one action, derived from the same credential statuses
//                     the wallet prints — never a second opinion about them.
//   2. WHO CAN SEE IT the privacy mode, reported here and changed on the page
//                     that owns it, and the way into Preview and share.
//
// ── ONE LINK PER CREDENTIAL, AND IT IS THE ROW'S ───────────────────────
//
// This column is mounted INSIDE the wallet, beside the credential rows. Each
// row already carries the one claim-specific link for its credential ("Add
// evidence", "Provide information", "View credential"). A second link to the
// same claim from here put two identical actions on one screen, and which of
// the two a reader — or a test — meant became a guess.
//
// So nothing in this column links to a claim ROUTE. The next step names the
// credential and takes the reader to THAT CREDENTIAL'S ROW on this page
// (`credentialRowAnchor`), labelled "View credential" because locating the
// record is all it does. It used to point at `#attention`, which renders
// nothing for a self-reported credential with no review outcome — a visible
// button that led to an empty region. What needs attention names the
// credential and its date, as text. A guard asserts all of it.
//
// ── NO SERVER TIER ─────────────────────────────────────────────────────
//
// The route owns every read, as every Passport component does and as
// `passport-separation-check` enforces. This receives finished values.

import type { InternationalPassportMetadata } from "@/lib/security-passport/international.functions";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Compass, Eye, Lock } from "lucide-react";
import { credentialDate } from "@/lib/security-passport/international";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  credentialPassportHolder,
  credentialRowAnchor,
} from "@/lib/security-passport/credential-passport";
import { goToHash } from "@/lib/security-passport/hash-arrival";
import { credentialProductStatus } from "@/lib/security-passport/product-status";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const PRIMARY =
  "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type NextStep =
  | { kind: "first" }
  | { kind: "clarify"; claimId: string; title: string }
  | { kind: "evidence"; claimId: string; title: string; count: number }
  | { kind: "share" };

export function PassportSideColumn({
  snapshot,
  today,
  metadata,
  reviews = null,
  part,
  className = "",
}: {
  snapshot: PassportSnapshot;
  /** Injected so the guard can render a fixed day rather than "now". */
  today: string;
  metadata?: InternationalPassportMetadata;
  /** Open review requests by claim id. Null while unread or unreadable, in
   *  which case no step that depends on them is offered. */
  reviews?: ReadonlyMap<string, string> | null;
  /** Which half to draw. The Passport overview mounts the two halves in two
   *  places — steps in the action panel, privacy under the card — from this
   *  one component, so the step and the status still come from one reading
   *  of the same rows. Omitted draws both, in order. */
  part?: "steps" | "privacy";
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const copy = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const profile = snapshot.profile;
  if (!profile) return null;

  // The SAME status function the wallet rows use, over the same claims, so
  // the step offered here can never disagree with the chip printed there.
  const rows = credentialPassportHolder(snapshot.holder).claims.map((c) =>
    credentialProductStatus(c, metadata?.verificationEvents ?? [], today, reviews?.get(c.id)),
  );
  const titleOf = (row: (typeof rows)[number]) =>
    lang === "sv" ? row.claim.titleSv : row.claim.titleEn || row.claim.titleSv;
  const clarify = rows.find((r) => r.status === "clarification");
  const registered = rows.filter((r) => r.status === "registered");
  // The wallet header's own window: active rows lapsing within 30 days.
  const horizon = new Date(new Date(today).getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const expiring = rows
    .filter((r) => r.lifecycle === "active" && r.claim.validUntil && r.claim.validUntil <= horizon)
    .sort((a, b) => a.claim.validUntil!.localeCompare(b.claim.validUntil!));

  // A reviewer's question first: it is the only step with somebody waiting.
  const next: NextStep =
    rows.length === 0
      ? { kind: "first" }
      : clarify
        ? { kind: "clarify", claimId: clarify.claim.id, title: titleOf(clarify) }
        : registered.length > 0
          ? {
              kind: "evidence",
              claimId: registered[0].claim.id,
              title: titleOf(registered[0]),
              count: registered.length,
            }
          : { kind: "share" };

  const viewCredential =
    next.kind === "clarify" || next.kind === "evidence" ? (
      <>
        {/* Locates the record; it does not act on it. So it says "View
            credential", and goes to that credential's own row — where
            the one real action for it lives — never to a generic region
            that may have nothing in it. The click re-runs the arrival,
            because a second press leaves the fragment unchanged and the
            router then has nothing to announce. */}
        <Link
          to="/passport"
          hash={credentialRowAnchor(next.claimId)}
          onClick={() => {
            const anchor = credentialRowAnchor(next.claimId);
            requestAnimationFrame(() => goToHash(anchor));
          }}
          className={`${PRIMARY} mt-4`}
          data-cta="next-step"
          data-next-step-target={credentialRowAnchor(next.claimId)}
        >
          {copy("Visa meriten", "View credential")}
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </>
    ) : null;

  return (
    <aside
      data-passport-side-column={part ?? "both"}
      aria-label={
        part === "privacy"
          ? copy("Delning och integritet", "Sharing and privacy")
          : part === "steps"
            ? copy("Nästa steg", "Next step")
            : copy("Nästa steg och delning", "Next step and sharing")
      }
      className={`${part === "privacy" ? "" : "mt-5"} w-full space-y-5 ${className}`}
    >
      {/* ── The next step ───────────────────────────────────────────── */}
      {part !== "privacy" && (
        <section
          aria-labelledby="sp-side-next-heading"
          data-passport-next-step={next.kind}
          className="border-t border-border pt-5"
        >
          <h2
            id="sp-side-next-heading"
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            <Compass aria-hidden="true" className="h-3.5 w-3.5" />
            {copy("Nästa steg", "Next step")}
          </h2>

          {next.kind === "first" && (
            <>
              <p className="mt-3 text-base font-semibold tracking-tight text-foreground">
                {copy("Lägg till din första merit", "Add your first credential")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {copy(
                  "Välj en certifiering, licens eller behörighet ur katalogen. Den är privat tills du delar den.",
                  "Choose a certification, licence or authorisation from the catalogue. It stays private until you share it.",
                )}
              </p>
            </>
          )}

          {next.kind === "clarify" && (
            <>
              <p className="mt-3 text-base font-semibold tracking-tight text-foreground">
                {copy("En granskare har en fråga", "A reviewer has a question")}
              </p>
              <p className="mt-1.5 break-words text-sm leading-relaxed text-muted-foreground">
                {next.title}
              </p>
              {viewCredential}
            </>
          )}

          {next.kind === "evidence" && (
            <>
              <p className="mt-3 text-base font-semibold tracking-tight text-foreground">
                {copy("Lägg till underlag", "Add evidence")}
              </p>
              <p className="mt-1.5 break-words text-sm leading-relaxed text-muted-foreground">
                {next.count === 1
                  ? copy(
                      `${next.title} är en egen uppgift. Med ett dokument kan den granskas.`,
                      `${next.title} is self-reported. With a document it can be reviewed.`,
                    )
                  : copy(
                      `${next.count} meriter är egna uppgifter. Börja med ${next.title}.`,
                      `${next.count} credentials are self-reported. Start with ${next.title}.`,
                    )}
              </p>
              {viewCredential}
            </>
          )}

          {next.kind === "share" && (
            <>
              <p className="mt-3 text-base font-semibold tracking-tight text-foreground">
                {copy("Redo att delas", "Ready to share")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {copy(
                  "Välj meriter, se exakt vad mottagaren ser och skapa en tidsbegränsad länk.",
                  "Select credentials, see exactly what the recipient sees and create a time-limited link.",
                )}
              </p>
              <Link to="/passport/share" className={`${PRIMARY} mt-4`} data-cta="next-step">
                {copy("Förhandsvisa och dela", "Preview and share")}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </section>
      )}

      {/* ── Expiring within 30 days ──────────────────────────────────────
          The wallet's header prints this as a COUNT; this says which ones.
          The same window over the same active rows, so the two cannot
          disagree. States the date and nothing else — "renew" would be the
          wrong instruction for a record nobody has checked. Not rendered at
          all when nothing is expiring. */}
      {part !== "privacy" && expiring.length > 0 ? (
        <section
          aria-labelledby="sp-side-expiring-heading"
          data-passport-expiring
          className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4"
        >
          <h2
            id="sp-side-expiring-heading"
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold tracking-tight text-foreground"
          >
            <CalendarClock
              aria-hidden="true"
              className="h-4 w-4 text-amber-700 dark:text-amber-400"
            />
            {copy("Behöver uppmärksamhet", "Needs attention")}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {expiring.length === 1
                ? copy("1 merit utgår inom 30 dagar", "1 credential expires within 30 days")
                : copy(
                    `${expiring.length} meriter utgår inom 30 dagar`,
                    `${expiring.length} credentials expire within 30 days`,
                  )}
            </span>
          </h2>
          <ul className="mt-2 space-y-1.5">
            {expiring.map((row) => (
              <li key={row.claim.id} className="rounded-md bg-card px-3">
                <p
                  data-passport-expiring-item={row.claim.id}
                  className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-foreground"
                >
                  <span className="min-w-0 break-words">{titleOf(row)}</span>
                  <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                    {copy("Utgår", "Expires")} {credentialDate(row.claim.validUntil!, lang)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Integrity, privacy and sharing ───────────────────────────── */}
      {part !== "steps" && (
        <section
          aria-labelledby="sp-side-privacy-heading"
          className={part === "privacy" ? "" : "border-t border-border pt-5"}
          data-passport-privacy-summary
        >
          <h2
            id="sp-side-privacy-heading"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
          >
            <Lock aria-hidden="true" className="h-3.5 w-3.5" />
            {pt("privacy.title")}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {pt("privacy.defaultBody")}
          </p>

          {/* The one fact that decides what a recipient is told about who the
            holder is. Reported here, changed on the page that owns it. */}
          <dl className="mt-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {pt("share.privacyMode")}
            </dt>
            <dd data-privacy-mode={profile.privacyMode} className="mt-0.5 text-sm text-foreground">
              {pt(`share.privacy.${profile.privacyMode}` as PassportCopyKey)}
            </dd>
          </dl>

          <div className="mt-3 flex flex-col gap-1">
            {/* Where the recipient's view lives. Not repeated when it is
              already the next step above. */}
            {next.kind !== "share" && (
              <Link to="/passport/share" data-cta="open-preview-share" className={LINK}>
                <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                {copy("Förhandsvisa och dela", "Preview and share")}
              </Link>
            )}
            <Link to="/passport/privacy" data-cta="open-privacy" className={LINK}>
              {pt("side.openPrivacy")}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      )}
    </aside>
  );
}
