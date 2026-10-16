// Security Passport — the entry's one next step, at the top of the entry page.
//
// The step is derived (entry-next-step.ts) from the database's current review
// state, the evidence and validity. The control either acts (request a review)
// or moves the holder to the part of the page where the act is.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileUp,
  MessageSquare,
  RotateCw,
  ShieldAlert,
} from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  entryNextStepAnchor,
  NEXT_STEP_COPY,
  type EntryNextStep as Step,
} from "@/lib/security-passport/entry-next-step";
import {
  ENTRY_EVIDENCE_ANCHOR,
  ENTRY_VERIFICATION_ANCHOR,
} from "@/lib/security-passport/credential-passport";

const ICON: Record<Step, typeof Clock> = {
  add_evidence: FileUp,
  request_review: ArrowRight,
  waiting: Clock,
  clarification: MessageSquare,
  rejected: ShieldAlert,
  revoked: ShieldAlert,
  renew: RotateCw,
  done: CheckCircle2,
  employer_or_review: ArrowRight,
};

export function EntryNextStep({
  step,
  isPassportCredential,
  onRequestReview,
}: {
  readonly step: Step;
  /** Sharing and discoverability are for catalogue credentials. */
  readonly isPassportCredential: boolean;
  /** Present when the review can be requested from here. */
  readonly onRequestReview?: () => Promise<void>;
}) {
  const { pt } = usePassportCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = NEXT_STEP_COPY[step];
  const Icon = ICON[step];
  const anchor = entryNextStepAnchor(step);
  const anchorId =
    anchor === "evidence"
      ? ENTRY_EVIDENCE_ANCHOR
      : anchor === "verification"
        ? ENTRY_VERIFICATION_ANCHOR
        : null;
  const primary =
    "inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const secondary =
    "inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <section
      aria-labelledby="sp-next-step-title"
      data-entry-next-step={step}
      className="rounded-xl border border-accent/40 bg-accent/5 p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {pt("next.title")}
      </p>
      <h2
        id="sp-next-step-title"
        className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground"
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {pt(copy.title)}
      </h2>
      <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
        {pt(copy.body)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {step === "request_review" && onRequestReview ? (
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onRequestReview();
              } catch {
                setError(pt("common.error"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? pt("ver.submitting") : pt(copy.action!)}
          </button>
        ) : copy.action && anchorId ? (
          <a href={`#${anchorId}`} className={primary}>
            {pt(copy.action)}
          </a>
        ) : null}
        {step === "done" && isPassportCredential ? (
          <>
            <Link to="/passport/discoverability" className={primary}>
              {pt("next.done.discover")}
            </Link>
            <Link to="/passport/share" className={secondary}>
              {pt("next.done.share")}
            </Link>
          </>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
