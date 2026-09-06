// "Link an earlier test result" — an action with an outcome.
//
// A person who took an employer-assigned test before they had an account
// can bind that result to the account they now have. The previous version
// of this control changed nothing visible on click: no pending state, no
// success, no error, no way to open what was just linked. A click that
// appears to do nothing is the product lying about what happened.
//
// Now each row owns its own state: pending while the claim runs, a success
// line with a direct link to the linked test, or an inline error with a
// retry — and the outcome is announced to assistive technology. Nothing
// here touches the Passport: a linked test result is the employer's
// material in that process, and the copy says so.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { claimAssessmentAssignment } from "@/lib/job-intelligence/assessment-assignments.functions";
import { L, type Lang } from "./copy";
import { LINK_EARLIER } from "./home-copy";
import { LINK } from "./home-format";

export interface LinkableRow {
  readonly id: string;
  readonly assessmentNameSv: string;
  readonly assessmentNameEn: string;
}

function Row({ row, onLinked }: { row: LinkableRow; onLinked: () => void }) {
  const { lang } = useT();
  const l = lang as Lang;
  const claimFn = useServerFn(claimAssessmentAssignment);
  const [linkedRunId, setLinkedRunId] = useState<string | null | undefined>(undefined);
  const claim = useMutation({
    mutationFn: () => claimFn({ data: { assignmentId: row.id } }),
    onSuccess: (r) => {
      setLinkedRunId(r.linked ? r.runId : null);
      onLinked();
    },
  });
  const name = l === "sv" ? row.assessmentNameSv : row.assessmentNameEn;

  return (
    <li className="py-2" data-linkable-row={row.id} data-link-state={claim.status}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-foreground">{name}</span>
        {linkedRunId === undefined && (
          <button
            type="button"
            disabled={claim.isPending}
            aria-busy={claim.isPending}
            onClick={() => claim.mutate()}
            className={`${LINK} disabled:opacity-60`}
            data-link-earlier-cta
          >
            {claim.isPending
              ? L(LINK_EARLIER.pending, l)
              : claim.isError
                ? L(LINK_EARLIER.retry, l)
                : L(LINK_EARLIER.cta, l)}
            {!claim.isPending && <ArrowRight className="h-3 w-3" aria-hidden="true" />}
          </button>
        )}
      </div>
      {/* The outcome, announced. role=status for success, role=alert for
          failure, so a screen reader hears what a sighted person sees. */}
      {linkedRunId !== undefined && (
        <p role="status" className="mt-1 text-sm text-foreground" data-link-success>
          {L(LINK_EARLIER.success, l)}{" "}
          {linkedRunId && (
            <Link
              to="/academy/$attemptId"
              params={{ attemptId: linkedRunId }}
              className={LINK}
              data-link-open
            >
              {L(LINK_EARLIER.open, l)}
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </p>
      )}
      {claim.isError && linkedRunId === undefined && (
        <p role="alert" className="mt-1 text-sm text-destructive" data-link-error>
          {L(LINK_EARLIER.failed, l)}
        </p>
      )}
    </li>
  );
}

export function LinkEarlierResult({
  rows,
  onLinked,
}: {
  rows: readonly LinkableRow[];
  onLinked: () => void;
}) {
  const { lang } = useT();
  const l = lang as Lang;
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 border-t border-dashed border-border pt-3" data-link-earlier>
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {L(LINK_EARLIER.title, l)}
      </h4>
      <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">{L(LINK_EARLIER.body, l)}</p>
      <ul className="mt-1 divide-y divide-border">
        {rows.map((r) => (
          <Row key={r.id} row={r} onLinked={onLinked} />
        ))}
      </ul>
    </div>
  );
}
