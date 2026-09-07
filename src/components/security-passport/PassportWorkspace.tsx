// Security Passport — the workspace a holder returns to.
//
// ── WHAT CHANGED, AND WHY ──────────────────────────────────────────────
//
// The overview this replaces on the live route answered a first visit: an
// explanatory banner, a catalogue of what could be added, an experience
// panel, a recognition panel, a timeline, a claims inventory and a
// jurisdiction notice — eleven boxes, most of them speaking at once. It read
// as a database of the person rather than a place where they get something
// done, and a holder who had just recorded their first merit had no way to
// see what they had, what it was worth, or what to do next without reading
// all of it.
//
// This page answers five questions in the order somebody actually asks them:
//
//   what is this            → the heading and two lines, once
//   what have I got         → the status overview
//   what should I do        → exactly one recommended step
//   show me my merits       → one list, grouped by what each merit needs
//   what is it good for     → three real destinations
//
// ── FLAT, NOT A CARD WALL ──────────────────────────────────────────────
//
// One card on the page: the recommended step. Everything else is a titled
// group of rows under a hairline, in the product's display face — the same
// language the career home uses, so the two halves of the product read as
// one. Fewer boxes was not a style preference; it is what makes the one box
// that IS a card mean something.
//
// ── IT INVENTS NO TRUST ────────────────────────────────────────────────
//
// Every status word and every count comes from `buildPassportWorkspace`,
// which gets them from the shared merit labeller. This file chooses type,
// weight and order. It does not decide what anything is worth, and there is
// deliberately no prop by which a caller could tell it to.

import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, Lock, Plus, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { isArchivedMerit, type LifecycleState } from "@/lib/security-passport/types";
import { formatPeriodRange } from "@/lib/security-passport/format";
import type {
  PassportWorkspace as Workspace,
  WorkspaceMerit,
  WorkspaceMeritStatus,
  WorkspaceNextStep,
} from "@/lib/security-passport/workspace";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON_PRIMARY =
  "inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-xs)] transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON_SECONDARY =
  "inline-flex h-11 items-center gap-1.5 rounded-md border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A titled group under a hairline. Not a card: the page is one document. */
function Group({
  id,
  title,
  lead,
  action,
  children,
  ...rest
}: {
  id: string;
  title: string;
  lead?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="border-t border-border pt-6"
      id={id}
      tabIndex={-1}
      {...rest}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={`${id}-heading`}
          className="text-lg font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
        {action}
      </div>
      {lead ? <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">{lead}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A sub-heading inside a group. Rendered only when the group has something
 *  under it — an empty category is not a category. */
function Subhead({ children, help }: { children: string; help?: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </h3>
      {help ? <p className="mt-0.5 text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status overview                                                     */
/* ------------------------------------------------------------------ */

/**
 * The four figures, as ONE band rather than four cards.
 *
 * ── WHY THIS IS NOT A GRID OF BOXES ────────────────────────────────────
 *
 * Four bordered cards give four numbers the same visual weight as the one
 * recommended action below them, and a page where everything is a card is a
 * page with no hierarchy at all. One band, split by hairlines, reads as a
 * single summary of one thing — which is what it is.
 *
 * The explanation under each figure is VISIBLE rather than behind a tooltip.
 * A tooltip needs a second interaction on touch and is the first thing a
 * screen reader skips, and the difference between these four is the whole
 * product.
 *
 * A null count is "could not be loaded" — never 0. Printing zero for a
 * number nobody could read is the same lie the rest of this codebase spends
 * its comments refusing.
 */
function StatusFigure({
  count,
  label,
  help,
  unknownLabel,
  unknownHelp,
  testid,
}: {
  count: number | null;
  label: string;
  help: string;
  unknownLabel: string;
  unknownHelp: string;
  testid: string;
}) {
  const known = count !== null;
  return (
    <div
      className="min-w-0 px-4 py-3 sm:px-5 sm:py-4"
      data-status-tile={testid}
      data-count={known ? String(count) : "unknown"}
    >
      <p
        className="text-2xl font-semibold tabular-nums tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {known ? count : "—"}
      </p>
      <p className="mt-0.5 text-sm font-medium text-balance text-foreground">
        {known ? label : unknownLabel}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-pretty text-muted-foreground">
        {known ? help : unknownHelp}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One merit                                                           */
/* ------------------------------------------------------------------ */

const STATUS_KEY: Readonly<Record<WorkspaceMeritStatus, PassportCopyKey>> = {
  // "We could not establish whether anybody is reviewing this." NOT a trust
  // level and not a downgrade: the holder's own statement is as true as it
  // ever was, and what is missing is the review state. The word says exactly
  // that rather than borrowing "Egen uppgift", which would let a pending
  // merit sit among the ordinary ones and read as settled.
  unknown: "ws.merit.status.unknown",
  added_by_you: "ws.merit.status.added_by_you",
  document_provided: "ws.merit.status.document_provided",
  verification_requested: "ws.merit.status.verification_requested",
  clarification_needed: "ws.merit.status.clarification_needed",
  documented: "ws.merit.status.documented",
  verified: "ws.merit.status.verified",
  expired: "ws.merit.status.expired",
};

/**
 * The status pill.
 *
 * Words first: every state is spelled out, and the tone is a border and a
 * text colour that repeat what the word already says. Nothing here is
 * legible only in colour, which is the rule the credential symbol system
 * already holds itself to.
 *
 * ── AN ARCHIVED MERIT WEARS ITS LIFECYCLE, NOT A TRUST WORD ───────────
 *
 * The shared labeller refuses every trust word to a row whose lifecycle has
 * moved on — correctly, because an expired credential is not currently a
 * verified one. What is left is `added_by_you`, and printing "Self-reported"
 * against a credential CQrityjob really did review, under a heading that
 * says the entry is archived, understates what happened to it.
 *
 * So an archived row says what is actually true of it TODAY: it expired, it
 * was revoked, it was superseded, it is disputed. No trust claim is made
 * either way, which is the honest answer for a row that has none standing.
 * The machine-readable `data-merit-status` still carries the shared label,
 * so nothing downstream has to know about this.
 */
function StatusPill({
  label,
  lifecycleState,
}: {
  label: WorkspaceMeritStatus;
  lifecycleState: LifecycleState;
}) {
  const { pt } = usePassportCopy();
  const archived = isArchivedMerit(lifecycleState);
  const tone = archived
    ? "border-border text-muted-foreground"
    : label === "verified"
      ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
      : label === "documented"
        ? "border-sky-600/40 text-sky-700 dark:text-sky-400"
        : label === "clarification_needed" || label === "expired"
          ? "border-amber-600/50 text-amber-700 dark:text-amber-400"
          : "border-border text-muted-foreground";
  return (
    <span
      data-merit-status={label}
      data-merit-lifecycle={lifecycleState}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {archived ? pt(`lifecycle.${lifecycleState}` as const) : pt(STATUS_KEY[label])}
    </span>
  );
}

/**
 * One merit as a row.
 *
 * The WHOLE row is the link. A card with a small "Open" button at the end
 * looks clickable everywhere and is clickable in one place, which is the
 * commonest way a list like this becomes a dead end for a person using a
 * phone. Minimum height is well past 44px at every width.
 */
function MeritRow({ merit }: { merit: WorkspaceMerit }) {
  const { pt, lang } = usePassportCopy();
  const title = lang === "sv" ? merit.titleSv : merit.titleEn;
  const organisation =
    merit.organisation ??
    pt(merit.kind === "experience" ? "ws.merit.employerUnknown" : "ws.merit.organisationUnknown");

  const dates =
    merit.dateKind === "period"
      ? merit.from
        ? formatPeriodRange(merit.from, merit.to, lang)
        : null
      : [
          merit.from ? `${pt("claims.issuedOn")} ${merit.from}` : null,
          merit.to ? `${pt("claims.validUntil")} ${merit.to}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null;

  return (
    <li>
      <Link
        to={merit.href}
        data-merit-row={merit.id}
        data-merit-kind={merit.kind}
        aria-label={`${pt(merit.typeKey)}: ${title} — ${
          isArchivedMerit(merit.lifecycleState)
            ? pt(`lifecycle.${merit.lifecycleState}` as const)
            : pt(STATUS_KEY[merit.label])
        }`}
        className={cn(
          // A LIST ROW, not a card. The list is one object with many entries;
          // giving every entry its own border and its own surface made the
          // page a wall of equal boxes, with the merits competing for weight
          // against the one recommended action. Separation is a hairline
          // between rows (`divide-y` on the list) and a hover tint.
          //
          // STACKED BELOW sm, SIDE BY SIDE ABOVE IT: in one row at 375px the
          // status pill left about a third of the width for the title, so
          // every credential read "Vaktarutbildnin..." and the list became
          // decoration. Nothing is truncated at any width now; the row grows
          // instead.
          "group flex min-h-[3.5rem] w-full flex-col gap-2 rounded-md px-3 py-3 transition-colors sm:flex-row sm:items-center sm:gap-4",
          "hover:bg-accent/5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {pt(merit.typeKey)}
          </span>
          <span className="mt-0.5 block text-sm font-semibold break-words text-foreground">
            {title}
          </span>
          <span className="mt-0.5 block text-xs break-words text-muted-foreground">
            {[organisation, dates].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <StatusPill label={merit.label} lifecycleState={merit.lifecycleState} />
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  );
}

/** A draft resumes IN THE FORM, at the merit it belongs to. A list the
 *  holder then has to search is them re-finding their own unfinished work. */
function DraftRow({ merit }: { merit: WorkspaceMerit }) {
  const { pt, lang } = usePassportCopy();
  const title = lang === "sv" ? merit.titleSv : merit.titleEn;
  return (
    <li>
      <Link
        to="/passport/credentials/new"
        search={{ draft: merit.id }}
        data-draft-row={merit.id}
        className={cn(
          "group flex min-h-[3.5rem] w-full flex-col gap-2 rounded-md px-3 py-3 transition-colors sm:flex-row sm:items-center sm:gap-4",
          "hover:bg-accent/5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {pt("lifecycle.draft")}
          </span>
          <span className="mt-0.5 block text-sm font-semibold break-words text-foreground">
            {title}
          </span>
        </span>
        <span className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <span className="text-sm font-semibold text-accent">{pt("cred.action.resume")}</span>
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* The one recommended step                                            */
/* ------------------------------------------------------------------ */

/**
 * Exactly one action, or an honest statement that there is none.
 *
 * Three states, and the difference between the last two is the point:
 *
 *   a step        somebody is waiting, or there is something worth doing
 *   nothing       everything is in order, said as a sentence with no demand
 *   unavailable   the review state could not be read, so nothing is claimed
 *
 * "Nothing needs you" printed over a clarification nobody could load is the
 * single worst sentence this page could produce, so it is never reachable
 * from a failed read: `unavailable` has its own branch and its own retry.
 */
function NextStepCard({
  step,
  unavailable,
  onRetry,
}: {
  step: WorkspaceNextStep | null;
  unavailable: boolean;
  onRetry?: () => void;
}) {
  const { pt } = usePassportCopy();

  const shell = (children: React.ReactNode, opts: { dark: boolean; state: string }) => (
    <section aria-labelledby="ws-next-heading" data-next-step={opts.state}>
      <h2 id="ws-next-heading" className="sr-only">
        {pt("ws.next.title")}
      </h2>
      <article
        className={cn(
          "rounded-xl p-5 md:p-6",
          opts.dark
            ? "bg-primary text-primary-foreground shadow-[var(--shadow-md)]"
            : "border border-border bg-card text-foreground shadow-[var(--shadow-xs)]",
        )}
      >
        {children}
      </article>
    </section>
  );

  if (unavailable) {
    return shell(
      <div role="alert">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("ws.next.title")}
        </p>
        <h3
          className="mt-2 text-xl font-semibold tracking-tight text-balance"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("ws.next.unavailableTitle")}
        </h3>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
          {pt("ws.next.unavailableBody")}
        </p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={cn(LINK, "mt-2")} data-retry>
            <RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" />
            {pt("live.retry")}
          </button>
        ) : null}
      </div>,
      { dark: false, state: "unavailable" },
    );
  }

  if (!step) {
    return shell(
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("ws.next.title")}
        </p>
        <h3
          className="mt-2 text-xl font-semibold tracking-tight text-balance"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("ws.next.clearTitle")}
        </h3>
        <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">{pt("ws.next.clearBody")}</p>
      </div>,
      { dark: false, state: "clear" },
    );
  }

  // Somebody else is waiting on this holder. That outranks anything the
  // product would like them to do, so it — and only it — takes the page's
  // dominant treatment; the header's "add a merit" steps down to secondary
  // in the same condition, so there is never a second dominant call.
  const dark = step.classification !== "suggestion";
  const titleKey = `ws.next.${step.kind}.title` as PassportCopyKey;
  const bodyKey = `ws.next.${step.kind}.body` as PassportCopyKey;
  const ctaKey = `ws.next.${step.kind}.cta` as PassportCopyKey;

  return shell(
    <div>
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-widest",
          dark ? "text-primary-foreground/70" : "text-muted-foreground",
        )}
      >
        {pt("ws.next.title")}
      </p>
      {/* An explicit colour, not an inherited one. The stylesheet gives
          headings their own `color`, which beats the article's inherited
          `text-primary-foreground` and painted this title near-black on the
          dark card — legible in the DOM and invisible on screen. */}
      <h3
        className={cn(
          "mt-2 text-xl font-semibold tracking-tight text-balance md:text-2xl",
          dark ? "text-primary-foreground" : "text-foreground",
        )}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pt(titleKey)}
      </h3>
      <p
        className={cn(
          "mt-2 max-w-[60ch] text-sm",
          dark ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {pt(bodyKey)}
      </p>
      <Link
        to={step.href}
        hash={step.hash ?? undefined}
        search={step.search ?? undefined}
        data-next-step-cta={step.kind}
        data-retires-when={step.retiresWhen}
        className={cn(
          "mt-4",
          dark
            ? "inline-flex h-11 items-center gap-1.5 rounded-md bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            : BUTTON_SECONDARY,
        )}
      >
        {pt(ctaKey)}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>,
    { dark, state: step.kind },
  );
}

/* ------------------------------------------------------------------ */
/* Adding a merit                                                      */
/* ------------------------------------------------------------------ */

/**
 * The three real ways into this Passport, named.
 *
 * ── WHY THIS IS NOT ONE LINK ───────────────────────────────────────────
 *
 * "Lägg till merit" used to go straight to `/passport/information#sp-employment`
 * — the employment block. A person who came to record a course landed on a
 * form for a job, having pressed a button that said neither. A generic verb
 * on a specific destination is a small lie, and it is the kind a person only
 * discovers after they have started typing.
 *
 * ── AND WHY THERE ARE EXACTLY THREE ────────────────────────────────────
 *
 * Because there are exactly three places a merit can actually be entered
 * today, and each option is one of them:
 *
 *   Employment                      /passport/information#sp-employment
 *   Education, course, certificate  /passport/information#sp-education
 *   Authorisation or appointment    /passport/credentials/new
 *
 * Nothing here promises a route that does not exist or a form that has not
 * been built. Languages and practical skills are deliberately absent: they
 * live on the same page but they are not merits, and offering them here
 * would widen the word.
 *
 * `<details>` rather than a scripted popover: it opens with a keyboard, it
 * opens without JavaScript, it is announced as expandable, and it renders
 * fully in a static render — which is how the guard can read what it offers.
 */
function AddMeritChooser({ dominant }: { dominant: boolean }) {
  const { pt } = usePassportCopy();
  const options = [
    {
      key: "employment",
      to: "/passport/information",
      hash: "sp-employment",
      title: "ws.add.employment",
      body: "ws.add.employmentBody",
    },
    {
      key: "education",
      to: "/passport/information",
      hash: "sp-education",
      title: "ws.add.education",
      body: "ws.add.educationBody",
    },
    {
      key: "credential",
      to: "/passport/credentials/new",
      hash: undefined,
      title: "ws.add.credential",
      body: "ws.add.credentialBody",
    },
  ] as const;

  return (
    <details className="group relative" data-add-merit-chooser>
      <summary
        data-primary-cta={dominant ? "add-merit" : undefined}
        data-cta="add-merit"
        className={cn(
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          dominant ? BUTTON_PRIMARY : BUTTON_SECONDARY,
        )}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {pt("ws.addMerit")}
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-open:rotate-180"
        />
      </summary>
      {/* Static below sm so a phone does not get a floating panel it has to
          dismiss; anchored under the button from sm up. */}
      <div className="z-20 mt-2 w-full rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-md)] sm:absolute sm:left-0 sm:w-[22rem]">
        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("ws.add.title")}
        </p>
        <ul className="divide-y divide-border">
          {options.map((o) => (
            <li key={o.key}>
              <Link
                to={o.to}
                hash={o.hash}
                data-add-merit={o.key}
                className="flex min-h-11 flex-col justify-center rounded-md px-3 py-3 transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="text-sm font-semibold text-foreground">{pt(o.title)}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{pt(o.body)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function PassportWorkspace({
  workspace,
  /** The `#attention` region, owned by the route because it carries the
   *  reviewer's own messages and the navigation into each entry. Rendered
   *  as the first thing under "My merits": what needs the holder comes
   *  before an inventory of what they have. */
  attention,
  needsWorkLocation,
  onConfirmWorkLocation,
  onRetry,
  className,
}: {
  workspace: Workspace;
  attention?: React.ReactNode;
  /** True while nobody has confirmed where this holder works. Asked once,
   *  quietly, and never answered on their behalf. */
  needsWorkLocation?: boolean;
  onConfirmWorkLocation?: () => void;
  onRetry?: () => void;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const { status, groups, nextStep, unavailable } = workspace;

  // One dominant call to action. When a reviewer is waiting, the recommended
  // step is it and this steps down; otherwise this is the page's primary.
  const stepIsDominant =
    !unavailable && nextStep !== null && nextStep.classification !== "suggestion";

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)} data-passport-workspace>
      {/* ── 1 · What this is, and the two things you can do with it ──── */}
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="h-3 w-3" />
          {pt("overview.privateNote")}
        </span>
        <h1
          className="mt-3 text-3xl font-semibold tracking-tight text-balance text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("overview.title")}
        </h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          {pt("ws.lead")}
        </p>

        <div className="mt-5 flex flex-wrap items-start gap-3">
          <AddMeritChooser dominant={!stepIsDominant} />
          <Link to="/passport/share" data-cta="share" className={BUTTON_SECONDARY}>
            {pt("ws.share")}
          </Link>
        </div>

        {/* The product does not know where this person works, and says so
            rather than showing a country nobody stated. One line, not a
            banner: it is a question, not a warning. */}
        {needsWorkLocation && onConfirmWorkLocation ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {pt("jurisdiction.confirmPrompt")}{" "}
            <button
              type="button"
              onClick={onConfirmWorkLocation}
              className={LINK}
              data-cta="confirm-work-location"
            >
              {pt("jurisdiction.confirmAction")}
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </p>
        ) : null}
      </header>

      {/* ── 2 · What is registered, and how well it is backed ─────────── */}
      {/* ONE band, not four cards. Every figure comes from `workspace.status`
          already decided — the component does no arithmetic, so a tile
          cannot quietly add a known number to an unknown one. */}
      <section aria-labelledby="ws-status-heading" className="mt-7" data-status-overview>
        <h2 id="ws-status-heading" className="sr-only">
          {pt("ws.status.title")}
        </h2>
        <div className="grid grid-cols-2 divide-x divide-y divide-border rounded-xl border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
          <StatusFigure
            testid="registered"
            // The BOTTOM RUNG, not the total — everything the holder stated
            // that nobody has assessed, an unreviewed attached document
            // included, because "a file exists" and "a file was checked" are
            // the two states this product most needs to keep apart.
            //
            // NULL when the review read failed: "nobody is reviewing these"
            // is exactly what could not be established.
            count={status.registered}
            label={pt("ws.status.registered")}
            help={pt("ws.status.registeredHelp")}
            unknownLabel={pt("ws.status.unknown")}
            unknownHelp={pt("ws.status.registeredUnknownHelp")}
          />
          <StatusFigure
            testid="documented"
            count={status.documented}
            label={pt("ws.status.documented")}
            help={pt("ws.status.documentedHelp")}
            unknownLabel={pt("ws.status.unknown")}
            unknownHelp={pt("ws.status.unknownHelp")}
          />
          <StatusFigure
            testid="source-confirmed"
            count={status.sourceConfirmed}
            label={pt("ws.status.sourceConfirmed")}
            help={pt("ws.status.sourceConfirmedHelp")}
            unknownLabel={pt("ws.status.unknown")}
            unknownHelp={pt("ws.status.unknownHelp")}
          />
          <StatusFigure
            testid="in-review"
            // BOTH open shapes: a review nobody has answered yet, and one
            // where the reviewer has asked the holder something. Which of
            // the two it is, and what it asks of this person, is said by the
            // merit's own status word and by the region below.
            count={status.inReview}
            label={pt("ws.status.inReview")}
            help={pt("ws.status.inReviewHelp")}
            unknownLabel={pt("ws.status.unknown")}
            unknownHelp={pt("ws.status.unknownHelp")}
          />
        </div>
        {/* A fifth figure only when there is one. A merit whose validity has
            lapsed is neither current backing nor archived history, and a
            permanent "0 expired" line would be four words of noise. */}
        {status.lapsed > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground" data-status-lapsed>
            <span className="font-medium text-foreground">
              {status.lapsed} {pt("ws.status.lapsed").toLocaleLowerCase()}
            </span>{" "}
            — {pt("ws.status.lapsedHelp")}
          </p>
        ) : null}
      </section>

      {/* ── 3 · The one thing to do next ──────────────────────────────── */}
      <div className="mt-6">
        <NextStepCard step={nextStep} unavailable={unavailable} onRetry={onRetry} />
      </div>

      {/* ── 4 · The merits themselves ─────────────────────────────────── */}
      <div className="mt-8">
        <Group id="merits" data-merits-list="true" title={pt("ws.merits.title")}>
          <div className="space-y-5">
            {/* What needs the holder, before an inventory of what they have.
                The region is the route's, so the reviewer's own messages and
                the expiry horizon stay where they are already reviewed. */}
            {attention}

            {groups.drafts.length > 0 ? (
              <div data-merit-group="drafts">
                <Subhead help={pt("ws.merits.draftsHelp")}>{pt("ws.merits.drafts")}</Subhead>
                <ul className="-mx-3 divide-y divide-border">
                  {groups.drafts.map((m) => (
                    <DraftRow key={m.id} merit={m} />
                  ))}
                </ul>
              </div>
            ) : null}

            {/* ── FAIL CLOSED, VISIBLY ────────────────────────────────
                Merits whose review state could not be read. They are NOT in
                "current merits": one of them may be pending, or may have a
                reviewer's question against it, and a heading that groups
                them with merits nobody is reviewing would answer a question
                the product could not answer. */}
            {groups.reviewUnknown.length > 0 ? (
              <div data-merit-group="review-unknown">
                <Subhead help={pt("ws.merits.reviewUnknownHelp")}>
                  {pt("ws.merits.reviewUnknown")}
                </Subhead>
                <ul className="-mx-3 divide-y divide-border">
                  {groups.reviewUnknown.map((m) => (
                    <MeritRow key={m.id} merit={m} />
                  ))}
                </ul>
              </div>
            ) : null}

            {groups.current.length > 0 ? (
              <div data-merit-group="current">
                <Subhead>{pt("ws.merits.current")}</Subhead>
                <ul className="-mx-3 divide-y divide-border">
                  {groups.current.map((m) => (
                    <MeritRow key={m.id} merit={m} />
                  ))}
                </ul>
              </div>
            ) : null}

            {groups.inReview.length > 0 ? (
              <div data-merit-group="in-review">
                <Subhead help={pt("ws.status.inReviewHelp")}>{pt("ws.merits.inReview")}</Subhead>
                <ul className="-mx-3 divide-y divide-border">
                  {groups.inReview.map((m) => (
                    <MeritRow key={m.id} merit={m} />
                  ))}
                </ul>
              </div>
            ) : null}

            {groups.archived.length > 0 ? (
              <div data-merit-group="archived">
                <Subhead help={pt("ws.merits.archivedHelp")}>{pt("ws.merits.archived")}</Subhead>
                <ul className="-mx-3 divide-y divide-border">
                  {groups.archived.map((m) => (
                    <MeritRow key={m.id} merit={m} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Group>
      </div>

      {/* ── 5 · What the Passport is for ──────────────────────────────── */}
      <div className="mt-8">
        <Group id="ws-use" title={pt("ws.use.title")}>
          <ul className="grid divide-y divide-border overflow-hidden rounded-xl border border-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
            {(
              [
                {
                  to: "/passport/share",
                  key: "share",
                  title: "ws.use.share",
                  body: "ws.use.shareBody",
                },
                { to: "/my-career/cv", key: "cv", title: "ws.use.cv", body: "ws.use.cvBody" },
                {
                  to: "/passport/card",
                  key: "card",
                  title: "ws.use.card",
                  body: "ws.use.cardBody",
                },
              ] as const
            ).map((item) => (
              <li key={item.key}>
                <Link
                  to={item.to}
                  data-use-link={item.key}
                  className="group flex h-full min-h-[3.5rem] flex-col justify-center px-4 py-4 transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {pt(item.title)}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {pt(item.body)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Group>
      </div>
    </div>
  );
}
