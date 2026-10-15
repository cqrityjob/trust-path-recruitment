// Security Passport — a review case in order: what was asked, what was
// answered, what was decided, and the current state on top.
//
// Shared by the holder's entry page and the reviewer's workspace. The data is
// the database's (sp_review_thread): the internal note arrives only for a
// reviewer, so this component cannot show it to a holder even if asked to.
//
// A failed read is said as a failure with a retry, never as an empty history.

import { useState } from "react";
import { MessageSquare, RotateCw } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type {
  ReviewCurrent,
  ReviewThread as Thread,
  ReviewThreadEvent,
} from "@/lib/security-passport/review-thread.functions";
import {
  REPLY_MAX_LENGTH,
  type ReplyErrorCode,
} from "@/lib/security-passport/review-thread.functions";

export type ThreadLoad =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly thread: Thread };

const CURRENT_KEY: Record<ReviewCurrent["state"], PassportCopyKey> = {
  none: "ver.current.none",
  pending: "ver.current.pending",
  clarification_requested: "ver.current.clarification_requested",
  approved: "ver.current.approved",
  rejected: "ver.current.rejected",
  revoked: "ver.current.revoked",
  withdrawn: "ver.current.withdrawn",
};

const DECISION_KEY: Record<
  Extract<ReviewThreadEvent, { type: "decision" }>["decision"],
  PassportCopyKey
> = {
  approved: "ver.thread.decision.approved",
  rejected: "ver.thread.decision.rejected",
  clarification_requested: "ver.thread.decision.clarification_requested",
  revoked: "ver.thread.decision.revoked",
};

function day(iso: string): string {
  return iso.slice(0, 10);
}

export function ReviewCurrentState({ current }: { readonly current: ReviewCurrent }) {
  const { pt } = usePassportCopy();
  return (
    <div
      data-review-current={current.state}
      className="rounded-lg border border-border bg-secondary/40 p-3"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {pt("ver.current.label")}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">
        {pt(CURRENT_KEY[current.state])}
        {current.since ? (
          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
            {day(current.since)}
          </span>
        ) : null}
      </p>
      {current.state === "approved" ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {pt("ver.current.reviewNotIssuer")}
        </p>
      ) : null}
    </div>
  );
}

export function ReviewThreadHistory({
  load,
  audience,
  onRetry,
}: {
  readonly load: ThreadLoad;
  readonly audience: "holder" | "reviewer";
  readonly onRetry: () => void;
}) {
  const { pt } = usePassportCopy();
  if (load.status === "loading") {
    return (
      <p className="mt-2 text-sm text-muted-foreground" aria-busy="true">
        …
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <div role="alert" className="mt-2 text-sm text-foreground">
        <p>{pt("ver.thread.loadError")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
          {pt("ver.thread.retry")}
        </button>
      </div>
    );
  }
  if (!load.thread.installed) return null;
  const events = load.thread.events;
  if (events.length === 0)
    return <p className="mt-2 text-sm text-muted-foreground">{pt("ver.thread.empty")}</p>;
  return (
    <ol data-review-thread className="mt-2 space-y-3">
      {events.map((e, i) =>
        e.type === "reply" ? (
          <li
            key={`r${i}`}
            data-thread-event="reply"
            className="rounded-md border border-border p-3"
          >
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="font-semibold text-foreground">
                {pt(audience === "holder" ? "ver.thread.reply" : "ver.thread.replyReviewer")}
              </span>
              <span className="tabular-nums">{day(e.at)}</span>
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {e.body}
            </p>
          </li>
        ) : (
          <li
            key={`d${i}`}
            data-thread-event={e.decision}
            className="rounded-md border border-border p-3"
          >
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{pt(DECISION_KEY[e.decision])}</span>
              <span className="tabular-nums">{day(e.at)}</span>
              {e.organisation ? (
                <span>
                  {pt("ver.thread.by")} {e.organisation}
                </span>
              ) : null}
            </p>
            {e.holderMessage ? (
              <div className="mt-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {pt("ver.thread.message")}
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {e.holderMessage}
                </p>
              </div>
            ) : null}
            {audience === "reviewer" && e.internalNote ? (
              <div className="mt-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {pt("ver.thread.internalNote")}
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {e.internalNote}
                </p>
              </div>
            ) : null}
          </li>
        ),
      )}
    </ol>
  );
}

const REPLY_ERROR_KEY: Record<ReplyErrorCode, PassportCopyKey> = {
  SP_REVIEW_STALE: "ver.reply.stale",
  SP_REQUEST_NOT_AWAITING_REPLY: "ver.reply.notAwaiting",
  SP_REQUEST_NOT_FOUND: "ver.reply.notAwaiting",
  SP_REPLY_INVALID: "ver.reply.invalid",
  REPLY_NOT_INSTALLED: "ver.reply.failed",
  REPLY_FAILED: "ver.reply.failed",
};

/** The holder's text answer to a clarification. The text is kept on any
 *  refusal; it is cleared only when the answer was recorded. */
export function ClarificationReplyForm({
  onReply,
}: {
  readonly onReply: (body: string) => Promise<void>;
}) {
  const { pt } = usePassportCopy();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PassportCopyKey | null>(null);
  const [sent, setSent] = useState(false);
  const remaining = REPLY_MAX_LENGTH - body.length;
  return (
    <form
      data-clarification-reply
      className="mt-4 space-y-2 border-t border-border pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const text = body.trim();
        if (text.length === 0 || text.length > REPLY_MAX_LENGTH) {
          setError("ver.reply.invalid");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await onReply(text);
          setSent(true);
          setBody("");
        } catch (cause) {
          const code = (cause instanceof Error ? cause.message : "REPLY_FAILED") as ReplyErrorCode;
          setError(REPLY_ERROR_KEY[code] ?? "ver.reply.failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label
        htmlFor="sp-clarification-reply"
        className="block text-sm font-semibold text-foreground"
      >
        {pt("ver.reply.label")}
      </label>
      <p id="sp-clarification-reply-help" className="text-sm text-muted-foreground">
        {pt("ver.reply.help")}
      </p>
      <textarea
        id="sp-clarification-reply"
        rows={4}
        maxLength={REPLY_MAX_LENGTH}
        value={body}
        aria-describedby="sp-clarification-reply-help sp-clarification-reply-count"
        aria-invalid={error === "ver.reply.invalid" ? true : undefined}
        onChange={(e) => {
          setBody(e.target.value);
          setSent(false);
        }}
        className="w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <p id="sp-clarification-reply-count" className="text-xs tabular-nums text-muted-foreground">
        {remaining} {pt("ver.reply.count")}
      </p>
      <button
        type="submit"
        disabled={busy || body.trim().length === 0}
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {busy ? pt("ver.reply.submitting") : pt("ver.reply.submit")}
      </button>
      {sent ? (
        <p role="status" className="text-sm text-foreground">
          {pt("ver.reply.sent")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {pt(error)}
        </p>
      ) : null}
    </form>
  );
}
