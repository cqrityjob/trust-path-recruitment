// "Show exactly what the candidate sees."
//
// ── WHY A PREVIEW AND NOT A DESCRIPTION ─────────────────────────────────
//
// An employer who has just shared an assessment result — or who is asked, six
// weeks later, what the candidate was told — had no way to look. The employer
// document is not the candidate's document, and the participant entry point
// admits the participant and nobody else.
//
// The two ways of closing that gap without a governed read are both worse than
// this. Re-deriving the candidate's wording in TypeScript produces a SECOND
// account of what was shared, kept in step with the first by nobody. Writing
// the boundary out in authored copy produces a promise the product cannot
// check. Both drift, and both drift silently.
//
// So this fetches the participant document through
// scp_participant_report_for_issuer (20261105090000), which returns the same
// projection as the candidate's own read — the database suite asserts the two
// are byte-for-byte identical — and renders it with the SAME component the
// candidate's page renders. Nothing here is written for the preview.
//
// ── THE THREE ANSWERS IT DISTINGUISHES ──────────────────────────────────
//
// The point of the read is to be trustworthy, so its unhappy answers are kept
// apart rather than collapsed into one "nothing to show":
//
//   loading      the read is in flight
//   failed       the read broke. Says nothing about whether a document exists,
//                because it does not know — the whole defect class this
//                codebase keeps correcting is a failed read rendered as a zero
//   null         there is genuinely no released participant document for this
//                caller to read
//
// ── AND WHAT IT IS HONEST ABOUT NOT SHOWING ─────────────────────────────
//
// The candidate's page carries two further sections that are NOT part of the
// released document and not this employer's to read: development modules
// suggested for that person, and their own history across attempts. The
// preview says they exist rather than implying the document is the whole page.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  CandidateReportDocument,
  CandidateReportRights,
} from "@/components/academy/CandidateReportDocument";
import { getParticipantReportAsIssuer } from "@/lib/security-competency/academy-employer.functions";

export function CandidateCopyPreview({
  attemptId,
  onClose,
}: {
  attemptId: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const previewFn = useServerFn(getParticipantReportAsIssuer);
  const preview = useQuery({
    // Its own key, and deliberately not the candidate's
    // ["academy","report",attemptId,"participant"]: the two reads have
    // different callers and different authority, and sharing a cache entry
    // between them would let one caller's refusal be served to the other.
    queryKey: ["academy", "participant-preview", attemptId],
    queryFn: () => previewFn({ data: { attemptId } }),
    retry: false,
  });

  return (
    <section
      aria-label={t("academy.participants.preview.title")}
      className="mt-4 rounded-[14px] border border-border bg-[color:var(--surface-subtle)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {t("academy.participants.preview.title")}
          </h3>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.participants.preview.lede")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-4 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {t("academy.participants.preview.close")}
        </button>
      </div>

      {preview.isLoading && (
        <p className="mt-4 text-[13px] text-muted-foreground">
          {t("academy.participants.preview.loading")}
        </p>
      )}

      {/* A failed read is not an absent document, and this is the one place a
          reader would be most inclined to believe it was. */}
      {preview.isError && (
        <p role="alert" className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
          {t("academy.participants.preview.unavailable")}
        </p>
      )}

      {!preview.isLoading && !preview.isError && !preview.data && (
        <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
          {t("academy.participants.preview.notReleased")}
        </p>
      )}

      {preview.data && (
        <div className="mt-4 rounded-[12px] border border-border bg-card p-5">
          <CandidateReportDocument report={preview.data} />
          <CandidateReportRights report={preview.data} />
        </div>
      )}
    </section>
  );
}
