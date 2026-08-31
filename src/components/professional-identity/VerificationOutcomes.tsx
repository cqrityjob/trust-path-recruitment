// What a verification decision means to the holder, on screen.
//
// ── THE SENTENCE THIS COMPONENT EXISTS TO STOP BEING FALSE ─────────────
//
// "Inget väntar på dig." An employer had answered a request for
// confirmation with "we cannot confirm this", and written the holder a
// message saying why, and the Passport said nothing was waiting — because
// the summary behind it only ever looked at OPEN reviews, and a decision
// closes one. The candidate could reach the outcome only by remembering
// which entry they had submitted and opening it.
//
// ── WHY FOUR GROUPS AND NOT A BADGE ────────────────────────────────────
//
// Because "3 things need your attention" is false about at least one of
// them. A refusal asks the holder to decide something; an approval asks
// nothing at all and merely deserves to be seen; an open review asks for
// patience and should say so rather than sit silent. Rolling those into one
// count would trade one untruth for another. The grouping is
// `deriveVerificationAttention`'s, unchanged and unreordered — this file
// draws it and decides nothing.
//
// ── WHAT IT MAY NOT PRINT ──────────────────────────────────────────────
//
// `holderMessage` and nothing else. The reviewer's internal note is not
// selected by the read behind this, the reviewer's identity has no field on
// the request at all, and evidence paths never leave the Passport. There is
// no prop on this component that could carry any of them, which is the
// point: the boundary is held by there being nothing to render, not by
// remembering not to.

import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Clock, Info } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  attentionDemandCount,
  type AttentionNextStep,
  type VerificationAttention,
  type VerificationAttentionItem,
} from "@/lib/professional-identity/verification-attention";
import { c, L, type Copy, type Lang } from "./copy";

const COPY = {
  heading: c("Det här behöver du veta", "What you need to know"),

  clear: c("Inget väntar på dig just nu.", "Nothing is waiting for you right now."),
  // Said instead of `clear` when the read failed. "We could not check" and
  // "you are up to date" are different sentences about somebody's own
  // record, and only one of them is honest here.
  unavailable: c(
    "Vi kunde inte hämta dina verifieringar just nu. Det betyder inte att något har ändrats.",
    "We could not load your verifications right now. It does not mean anything has changed.",
  ),

  actionRequired: c("Du behöver svara", "You need to respond"),
  actionRequiredHint: c(
    "En granskare har bett dig om mer information.",
    "A reviewer has asked you for more information.",
  ),

  outcomes: c("Ett beslut har fattats", "A decision has been made"),
  outcomesHint: c(
    "Uppgiften är inte verifierad. Det du själv har angett står kvar.",
    "The entry is not verified. What you stated yourself still stands.",
  ),

  information: c("Nyligen verifierat", "Recently verified"),
  informationHint: c(
    "Godkänt av en behörig granskare. Du behöver inte göra något.",
    "Approved by an authorised reviewer. There is nothing for you to do.",
  ),

  waiting: c("Under granskning", "Being reviewed"),
  waitingHint: c(
    "Någon annan tittar på det. Du behöver inte göra något.",
    "Somebody else is looking at it. There is nothing for you to do.",
  ),

  employerCouldNotConfirm: c(
    "Arbetsgivaren kunde inte bekräfta den här anställningen.",
    "The employer could not confirm this employment.",
  ),
  reviewRejected: c(
    "Granskningen ledde inte till en verifiering.",
    "The review did not result in a verification.",
  ),
  approved: c("Godkänt.", "Approved."),
  awaitingReview: c("Inskickat och väntar på granskning.", "Submitted and awaiting review."),

  /** What the decider wrote for the holder, introduced so the quoted text is
   *  obviously theirs rather than the product's. */
  messageLabel: c("Meddelande till dig", "Message to you"),

  openEntry: c("Öppna uppgiften", "Open the entry"),
} as const;

const NEXT_STEP: Readonly<Record<AttentionNextStep, Copy | null>> = {
  respond_to_reviewer: c(
    "Öppna uppgiften och fyll i det som efterfrågas.",
    "Open the entry and add what was asked for.",
  ),
  correct_and_resubmit: c(
    "Du kan rätta uppgiften och skicka in den igen.",
    "You can correct the entry and submit it again.",
  ),
  // Deliberately does not offer to contact the employer for them. External
  // employer invitations are not built, and naming a route that does not
  // exist is the same defect as a next best action nobody can complete.
  try_document_review: c(
    "Du kan rätta uppgiften, eller be CQrityjob granska dokumentation i stället.",
    "You can correct the entry, or ask CQrityjob to review documentation instead.",
  ),
  none: null,
};

/** The one line that says what happened. Never a raw status code. */
function outcomeLine(item: VerificationAttentionItem, l: Lang): string {
  switch (item.status) {
    case "rejected":
      return L(
        item.kind === "employer_attestation" ? COPY.employerCouldNotConfirm : COPY.reviewRejected,
        l,
      );
    case "approved":
      return L(COPY.approved, l);
    case "pending":
      return L(COPY.awaitingReview, l);
    default:
      return "";
  }
}

function Item({
  item,
  title,
  href,
  lang,
}: {
  item: VerificationAttentionItem;
  title: string;
  href: string;
  lang: Lang;
}) {
  const next = NEXT_STEP[item.nextStep];
  return (
    <li className="py-2.5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {outcomeLine(item, lang) ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{outcomeLine(item, lang)}</p>
      ) : null}

      {/* The decider's own words to the holder. Rendered as a quotation with
          a label, so it reads as something a person wrote to them rather
          than as the product's own verdict. */}
      {item.holderMessage ? (
        <figure className="mt-2 border-l-2 border-border pl-3">
          <figcaption className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {L(COPY.messageLabel, lang)}
          </figcaption>
          <blockquote className="mt-1 text-sm leading-relaxed text-foreground">
            {item.holderMessage}
          </blockquote>
        </figure>
      ) : null}

      {next ? <p className="mt-2 text-sm text-muted-foreground">{L(next, lang)}</p> : null}

      <Link
        to={href}
        className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
      >
        {L(COPY.openEntry, lang)}
      </Link>
    </li>
  );
}

function Group({
  title,
  hint,
  icon,
  items,
  rule,
  titleOf,
  hrefOf,
  lang,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  items: readonly VerificationAttentionItem[];
  rule: string;
  titleOf: (item: VerificationAttentionItem) => string;
  hrefOf: (item: VerificationAttentionItem) => string;
  lang: Lang;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`border-l-2 pl-4 ${rule}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      <ul className="mt-1 divide-y divide-border">
        {items.map((item) => (
          <Item
            key={item.requestId}
            item={item}
            title={titleOf(item)}
            href={hrefOf(item)}
            lang={lang}
          />
        ))}
      </ul>
    </div>
  );
}

export function VerificationOutcomes({
  attention,
  /** The entry's own title, resolved by the surface that has the rows. A
   *  fallback is deliberately NOT invented here: a heading of "claim
   *  a1b2c3" is worse than the caller being made to answer. */
  titleOf,
  /** Where this entry lives. The Passport passes its own entry route; My
   *  Career passes the Passport. */
  hrefOf,
  /** Suppress the "nothing waiting" line — for a surface that shows other
   *  attention of its own and would otherwise contradict itself. */
  showClear = true,
  className,
}: {
  attention: VerificationAttention;
  titleOf: (item: VerificationAttentionItem) => string;
  hrefOf: (item: VerificationAttentionItem) => string;
  showClear?: boolean;
  className?: string;
}) {
  const { lang } = useT();
  const l = lang as Lang;

  // A failed read is not an empty one. Said before anything else, because
  // every list below is empty in both cases and only this sentence tells
  // them apart.
  if (attention.unavailable) {
    return (
      <section className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`}>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {L(COPY.heading, l)}
        </h2>
        <p role="status" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {L(COPY.unavailable, l)}
        </p>
      </section>
    );
  }

  if (attention.clear && !showClear) return null;

  const shared = { titleOf, hrefOf, lang: l };

  return (
    <section
      data-verification-attention={attentionDemandCount(attention) > 0 ? "demands" : "quiet"}
      className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`}
    >
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {L(COPY.heading, l)}
      </h2>

      {attention.clear ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{L(COPY.clear, l)}</p>
      ) : (
        <div className="mt-4 space-y-5">
          <Group
            {...shared}
            title={L(COPY.actionRequired, l)}
            hint={L(COPY.actionRequiredHint, l)}
            icon={<AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />}
            items={attention.actionRequired}
            rule="border-amber-500/60"
          />
          <Group
            {...shared}
            title={L(COPY.outcomes, l)}
            hint={L(COPY.outcomesHint, l)}
            icon={<Info className="h-4 w-4 text-amber-500" aria-hidden="true" />}
            items={attention.outcomes}
            rule="border-amber-500/60"
          />
          <Group
            {...shared}
            title={L(COPY.information, l)}
            hint={L(COPY.informationHint, l)}
            icon={<CheckCircle2 className="h-4 w-4 text-[color:var(--gold)]" aria-hidden="true" />}
            items={attention.information}
            rule="border-border"
          />
          <Group
            {...shared}
            title={L(COPY.waiting, l)}
            hint={L(COPY.waitingHint, l)}
            icon={<Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            items={attention.waiting}
            rule="border-border"
          />
        </div>
      )}
    </section>
  );
}
