// The candidate's answer to a supplement request, written in the app
// (slot 20270314100000). Sits under the SENT request in the candidate's
// inbox: what they already answered, a field for the next answer, and the
// saved confirmation. The reply is kept with the application and read by the
// reviewer there; it is not an e-mail, cannot be edited afterwards, carries
// no attachment and changes neither the CV nor the original answers.
//
// The database decides what may be answered (a sent request on the
// candidate's own open application, while the request is unresolved); this
// component only says its refusals in words.

import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { CheckCircle2, MessageSquareReply } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  REPLY_MAX_LENGTH,
  replyToSupplementRequest,
  type CandidateReply,
  type CandidateReplyErrorCode,
  type CandidateReplyReceipt,
} from "@/lib/recruitment/candidate-reply.functions";
import { formatStamp } from "@/lib/recruitment/format";

const ERROR_KEYS: Record<CandidateReplyErrorCode, TranslationKey> = {
  MESSAGE_NOT_FOUND: "rec.inbox.supplement.error.notFound",
  REPLY_NOT_ALLOWED: "rec.inbox.supplement.error.notAllowed",
  APPLICATION_NOT_OPEN: "rec.inbox.supplement.error.notOpen",
  REPLY_BODY_INVALID: "rec.inbox.supplement.error.body",
  SUPPLEMENT_ALREADY_RESOLVED: "rec.inbox.supplement.resolved",
  REPLY_NOT_INSTALLED: "rec.inbox.supplement.notAvailable",
  RECRUITMENT_ACTION_FAILED: "rec.inbox.respondFailed",
};

function codeOf(error: unknown): CandidateReplyErrorCode {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const known = (Object.keys(ERROR_KEYS) as CandidateReplyErrorCode[]).find((c) =>
    message.includes(c),
  );
  return known ?? "RECRUITMENT_ACTION_FAILED";
}

export function CandidateSupplementReply({
  messageId,
  replies,
  replyInApp,
  onReplied,
}: {
  messageId: string;
  replies: CandidateReply[];
  /** false where the slot is not installed on this database: the candidate
   *  is told to answer the way the message says instead of being shown a
   *  form that cannot save. */
  replyInApp: boolean;
  onReplied: () => void;
}) {
  const { t, lang } = useT();
  const replyFn = useServerFn(replyToSupplementRequest);
  const fieldId = useId();
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState<CandidateReplyReceipt | null>(null);
  const [resolved, setResolved] = useState(false);
  const mutation = useMutation({
    mutationFn: (text: string) =>
      replyFn({ data: { messageId, body: text, language: lang === "en" ? "en" : "sv" } }),
    onSuccess: (receipt) => {
      setSaved(receipt);
      setBody("");
      onReplied();
    },
    onError: (error) => {
      if (codeOf(error) === "SUPPLEMENT_ALREADY_RESOLVED") setResolved(true);
    },
  });
  const trimmed = body.trim();
  const errorCode = mutation.isError ? codeOf(mutation.error) : null;

  return (
    <div
      className="mt-3 border-t border-border pt-3"
      data-testid="candidate-supplement-reply"
      data-replies={replies.length}
    >
      {replies.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("rec.inbox.supplement.yourAnswers")}
          </p>
          <ul className="mt-1 space-y-2">
            {replies.map((r) => (
              <li
                key={r.replyId}
                className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                data-testid="candidate-reply"
              >
                <p className="whitespace-pre-wrap break-words">{r.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatStamp(r.createdAt, lang)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {saved && (
        <p
          role="status"
          className="mb-3 flex items-start gap-2 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm"
          data-testid="candidate-reply-saved"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>
            {t("rec.inbox.supplement.saved").replace("{time}", formatStamp(saved.createdAt, lang))}
          </span>
        </p>
      )}

      {!replyInApp ? (
        <p className="text-sm text-muted-foreground" data-testid="candidate-reply-not-installed">
          {t("rec.inbox.supplement.notAvailable")}
        </p>
      ) : resolved ? (
        <p className="text-sm text-muted-foreground" data-testid="candidate-reply-resolved">
          {t("rec.inbox.supplement.resolved")}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed || mutation.isPending) return;
            mutation.mutate(trimmed);
          }}
        >
          <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
            {t("rec.inbox.supplement.answerLabel")}
          </label>
          <textarea
            id={fieldId}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, REPLY_MAX_LENGTH))}
            rows={4}
            maxLength={REPLY_MAX_LENGTH}
            disabled={mutation.isPending}
            aria-describedby={`${fieldId}-hint`}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            data-testid="candidate-reply-body"
          />
          <p id={`${fieldId}-hint`} className="mt-1 text-xs text-muted-foreground">
            {t("rec.inbox.supplement.hint")}{" "}
            <span data-testid="candidate-reply-counter">
              {t("rec.inbox.supplement.counter")
                .replace("{n}", String(body.length))
                .replace("{max}", String(REPLY_MAX_LENGTH))}
            </span>
          </p>
          {errorCode && !resolved && (
            <p
              role="alert"
              className="mt-2 text-sm text-destructive"
              data-testid="candidate-reply-error"
            >
              {t(ERROR_KEYS[errorCode])}
            </p>
          )}
          <button
            type="submit"
            disabled={!trimmed || mutation.isPending}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            data-testid="candidate-reply-send"
          >
            <MessageSquareReply className="h-4 w-4" aria-hidden="true" />
            {mutation.isPending
              ? t("rec.inbox.supplement.sending")
              : t("rec.inbox.supplement.send")}
          </button>
        </form>
      )}
    </div>
  );
}
