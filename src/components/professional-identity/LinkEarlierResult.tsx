// "Link an earlier test result" — an action with an outcome.
//
// A person who completed an employer-assigned assessment before they had an
// account can bind that completion to the account they now have. Linking
// creates an `assessment_runs` row through `save_career_report`, so what
// they get is a CAREER REPORT — opened at /my-career/reports/$runId, which
// is the route that reads `assessment_runs`. It is not an `scp_attempts`
// id and must never be routed to /academy/$attemptId.
//
// ── AN OUTCOME, ALWAYS ─────────────────────────────────────────────────
//
// The first version of this control changed nothing visible on click. Each
// row now owns its state: pending while the claim runs, a success line with
// a direct link to the report it just created, or an inline error with a
// retry — announced to assistive technology either way.
//
// ── SUCCESS IS A RUN ID, NOT A FLAG ────────────────────────────────────
//
// `linkAssignmentRun` can fail to create the run (no published assessment
// version, or the RPC refused). A response carrying no run id is therefore
// a FAILURE however its flag reads: there is nothing to open, and telling
// somebody their result is linked when no report exists is the same class
// of untruth as a confident zero.
//
// Nothing here touches the Passport: a linked result is the employer's
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
  /** The report that now exists. Null until one does. */
  const [linkedRunId, setLinkedRunId] = useState<string | null>(null);
  const claim = useMutation({
    mutationFn: async () => {
      const result = await claimFn({ data: { assignmentId: row.id } });
      // The run id IS the success. A response without one is a failure,
      // whatever `linked` says — thrown so the mutation's own error state
      // renders it, rather than a success line with nothing behind it.
      if (!result.linked || !result.runId) throw new Error("LINK_PRODUCED_NO_REPORT");
      return result.runId;
    },
    onSuccess: (runId) => {
      setLinkedRunId(runId);
      onLinked();
    },
  });
  const name = l === "sv" ? row.assessmentNameSv : row.assessmentNameEn;

  return (
    <li className="py-2" data-linkable-row={row.id} data-link-state={claim.status}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-foreground">{name}</span>
        {linkedRunId === null && (
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
      {linkedRunId !== null && (
        <p role="status" className="mt-1 text-sm text-foreground" data-link-success>
          {L(LINK_EARLIER.success, l)}{" "}
          <Link
            to="/my-career/reports/$runId"
            params={{ runId: linkedRunId }}
            className={LINK}
            data-link-open
          >
            {L(LINK_EARLIER.open, l)}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </p>
      )}
      {claim.isError && linkedRunId === null && (
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
