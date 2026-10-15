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
// ── THE NEXT STEP GOES WHERE THE STEP IS DONE (2026-10-13) ─────────────
//
// It used to take the reader to the credential's ROW on this page, labelled
// "View credential", so that each credential had exactly one claim link.
// Launch testing showed that as one click too many: the owner asked for the
// next step to open the right credential AT the right action. So the step
// now links to that credential's page, at the section that does the step —
// `#sp-entry-evidence` to add a document, `#sp-entry-verification` to answer
// a reviewer — and is labelled with that action and the credential's name.
// What needs attention still names the credential and its date, as text.
//
// ── THE SAME STEP AS THE CREDENTIAL'S OWN PAGE (workshop 2026-10-15) ───
//
// Each credential's step is `entryNextStep` -- the function the credential's
// page uses -- over the same facts: the open review from the holder's request
// list, the latest recorded decision, whether a document is there (the
// assertion level moves to document_provided with the first upload) and the
// validity window. `overviewNextStep` then picks the most pressing one, in a
// documented order, and the words are the page's own (NEXT_STEP_COPY). A step
// that needs the request list is not offered while that list is unreadable.
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
  ENTRY_EVIDENCE_ANCHOR,
  ENTRY_VERIFICATION_ANCHOR,
} from "@/lib/security-passport/credential-passport";
import { credentialProductStatus } from "@/lib/security-passport/product-status";
import {
  entryNextStep,
  entryNextStepAnchor,
  NEXT_STEP_COPY,
  overviewNextStep,
  overviewReviewState,
  type EntryNextStep,
} from "@/lib/security-passport/entry-next-step";
import { validityOf } from "@/lib/security-passport/validity";
import type { PassportSnapshot } from "@/lib/security-passport/passport.functions";

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const PRIMARY =
  "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type NextStep =
  | { kind: "first" }
  | { kind: "unknown" }
  | { kind: EntryNextStep; claimId: string; title: string; count: number };

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
  // The wallet row's own name: the catalogue's, else the entered title.
  const titleOf = (row: (typeof rows)[number]) => {
    const definition = metadata?.definitions?.find((d) => d.code === row.claim.credentialCode);
    return definition
      ? definition[lang === "sv" ? "name_sv" : "name_en"]
      : lang === "sv"
        ? row.claim.titleSv
        : row.claim.titleEn || row.claim.titleSv;
  };
  // The wallet header's own window: active rows lapsing within 30 days.
  const horizon = new Date(new Date(today).getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const expiring = rows
    .filter((r) => r.lifecycle === "active" && r.claim.validUntil && r.claim.validUntil <= horizon)
    .sort((a, b) => a.claim.validUntil!.localeCompare(b.claim.validUntil!));

  // Every credential's own step, by the function its page uses.
  const events = metadata?.verificationEvents ?? [];
  const steps = rows.flatMap((row) => {
    const c = row.claim;
    const validity = validityOf(c.lifecycleState, c.validUntil, today);
    const latest = events
      .filter((e) => e.claimId === c.id)
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
    const step = entryNextStep({
      kind: "claim",
      assertionLevel: c.assertionLevel,
      hasActiveEvidence:
        c.assertionLevel === "document_provided" || c.assertionLevel === "verified",
      reviewState: overviewReviewState(reviews?.get(c.id), latest?.result),
      hasExpired: validity.hasExpired,
      expiresSoon: validity.expiresSoon,
    });
    // Without the request list a review may already be open: do not ask for one.
    if (reviews === null && step === "request_review") return [];
    return [{ claimId: c.id, title: titleOf(row), step }];
  });
  const picked = overviewNextStep(steps);
  const next: NextStep =
    rows.length === 0
      ? { kind: "first" }
      : picked.entry === null
        ? { kind: "unknown" }
        : {
            kind: picked.step as EntryNextStep,
            claimId: picked.entry.claimId,
            title: picked.entry.title,
            count: picked.count,
          };
  const stepCopy =
    next.kind === "first" || next.kind === "unknown" ? null : NEXT_STEP_COPY[next.kind];
  const anchor =
    next.kind === "first" || next.kind === "unknown" ? null : entryNextStepAnchor(next.kind);

  // The step is DONE where it is done: on that credential's own page, at the
  // section that does it -- the documents for an upload or a renewal, the
  // review panel for a review, an answer or a decision. Labelled with the
  // page's own action and the credential, so a reader (and a screen reader)
  // knows where it goes.
  const stepAction =
    next.kind !== "first" && next.kind !== "unknown" && stepCopy?.action && anchor ? (
      <Link
        to="/passport/entry/$kind/$entryId"
        params={{ kind: "claim", entryId: next.claimId }}
        hash={anchor === "verification" ? ENTRY_VERIFICATION_ANCHOR : ENTRY_EVIDENCE_ANCHOR}
        className={`${PRIMARY} mt-4`}
        data-cta="next-step"
        data-next-step-target={`${next.claimId}#${
          anchor === "verification" ? ENTRY_VERIFICATION_ANCHOR : ENTRY_EVIDENCE_ANCHOR
        }`}
        aria-label={`${pt(stepCopy.action)}: ${next.title}`}
      >
        {pt(stepCopy.action)}
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
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

          {next.kind === "unknown" && (
            <>
              <p className="mt-3 text-base font-semibold tracking-tight text-foreground">
                {copy("Nästa steg kunde inte läsas", "The next step could not be read")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {copy(
                  "Dina granskningsärenden kunde inte hämtas just nu. Öppna en merit för att se dess läge.",
                  "Your review cases could not be loaded right now. Open a credential to see where it stands.",
                )}
              </p>
            </>
          )}

          {next.kind !== "first" && next.kind !== "unknown" && stepCopy && (
            <>
              <p className="mt-3 text-base font-semibold tracking-tight text-foreground">
                {pt(stepCopy.title)}
              </p>
              <p
                data-passport-next-step-entry={next.claimId}
                className="mt-1 break-words text-sm font-medium text-foreground"
              >
                {next.title}
                {next.count > 1 ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    {copy(`och ${next.count - 1} till`, `and ${next.count - 1} more`)}
                  </span>
                ) : null}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {pt(stepCopy.body)}
              </p>
              {stepAction}
              {next.kind === "done" ? (
                <div className="mt-4 flex flex-col gap-2">
                  <Link to="/passport/discoverability" className={PRIMARY} data-cta="next-step">
                    {pt("next.done.discover")}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                  <Link to="/passport/share" className={LINK}>
                    {pt("next.done.share")}
                  </Link>
                </div>
              ) : null}
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
            {next.kind !== "done" && (
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
