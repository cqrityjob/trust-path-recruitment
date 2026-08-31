// Employer OS — one employment confirmation request.
//
// ── WHY THERE IS NO DETAIL RPC ─────────────────────────────────────────
//
// The request is found in `sp_employer_attestation_queue`, the same function
// the list uses, and matched by id in the browser. That is not laziness: a
// second read would be a second place to get "may this principal see this
// request" right, and the existing one already answers it — it refuses a
// caller who is not an owner or admin of the employer, and it returns only
// requests addressed to that employer. A request belonging to another
// organisation is therefore not merely hidden here; it is not in the
// response, so there is nothing to hide.
//
// That is also what makes "not found" the honest answer for a request that
// exists but is somebody else's: this page cannot tell the difference, and
// must not be able to.
//
// ── WHAT THIS PAGE IS NOT ──────────────────────────────────────────────
//
// It is not the Passport reviewer's credential-review screen. There is no
// evidence list, no document viewer, no assertion level, no validity window
// and no internal note, because an employer is not reviewing a certificate —
// they are answering whether facts about their own employment records are
// right. Those two jobs look superficially alike and share nothing.

import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  decisionErrorCodeFrom,
  type DecisionErrorCode,
} from "@/lib/security-passport/decision-errors";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  decideVerification,
  listEmployerAttestations,
} from "@/lib/security-passport/verification.functions";
import {
  EmploymentVerificationReview,
  type EmployerDecision,
} from "@/components/security-passport/live/EmploymentVerificationReview";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/employment-verifications/$requestId",
)({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: EmploymentVerificationDetailPage,
  errorComponent: EmployerErrorState,
});

/** The reviewer workspace's map, reused unchanged. A refusal means the same
 *  thing to an employer as it does to a CQrityjob reviewer, and two copies of
 *  this table would eventually say two different things about one code. */
const DECLINE_KEY: Record<DecisionErrorCode, PassportCopyKey> = {
  self_verification: "vq.decline.self_verification",
  not_authorised: "vq.decline.not_authorised",
  already_decided: "vq.decline.already_decided",
  not_found: "vq.decline.not_found",
  method_required: "vq.decline.method_required",
  holder_message_required: "vq.decline.holder_message_required",
  invalid_validity: "vq.decline.invalid_validity",
  issuer_required: "vq.decline.issuer_required",
  entry_not_active: "vq.decline.entry_not_active",
  unknown: "vq.decline.unknown",
};

function EmploymentVerificationDetailPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const ws = useEmployerWorkspace(employerSlug);

  if (!ws.portalEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-foreground">
          {t("employer.comingSoon.heading")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("employer.comingSoon.body")}</p>
      </div>
    );
  }
  if (ws.isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }
  if (ws.isError || !ws.workspace) {
    return <EmployerAccessDenied workspaces={ws.workspaces} />;
  }

  return (
    <EmployerAppShell
      employerSlug={ws.workspace.employerSlug}
      employerName={ws.workspace.employerName}
      role={ws.workspace.role}
      status={ws.workspace.employerStatus}
      activeSection="employmentVerifications"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      <Detail employerId={ws.workspace.employerId} employerSlug={employerSlug} />
    </EmployerAppShell>
  );
}

function Detail({ employerId, employerSlug }: { employerId: string; employerSlug: string }) {
  const { requestId } = Route.useParams();
  const { pt } = usePassportCopy();
  const router = useRouter();
  const load = useServerFn(listEmployerAttestations);
  const decide = useServerFn(decideVerification);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["passport", "employer-attestations", employerId],
    queryFn: () => load({ data: { employerId } }),
  });

  const item = useMemo(
    () => (query.data ?? []).find((r) => r.id === requestId) ?? null,
    [query.data, requestId],
  );

  async function onDecide(decision: EmployerDecision, holderMessage: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await decide({
        data: {
          requestId,
          decision,
          // An employer confirms employment they have direct knowledge of.
          // That is the method, it is the only one they can record, and it is
          // what keeps "confirmed by Company X" distinguishable from
          // "document reviewed by CQrityjob" everywhere it is later rendered.
          method: decision === "approved" ? "employer_confirmation" : null,
          // Internal reviewer reasoning. An employer has none and is offered
          // no field for one; the candidate-facing message is the only text
          // this surface can write.
          decisionNote: null,
          holderMessage,
          validFrom: null,
          validUntil: null,
        },
      });
      setNotice(pt("emp.done"));
      // Refetch rather than patch: the decision is the database's to describe,
      // and an optimistically flipped row would state an outcome before the
      // one function allowed to decide it had agreed.
      await query.refetch();
      await router.invalidate();
    } catch (err) {
      console.error("[passport] employment verification decision failed", err);
      setError(pt(DECLINE_KEY[decisionErrorCodeFrom(err)]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      {/* `min-h-11` rather than a bare inline link: measured at 375px during
          signed-in acceptance this was a 20px-tall tap target, which is under
          both the 24px WCAG minimum and the 44px this product uses everywhere
          a control is a control. It is not a link inside a sentence, so the
          inline-text exception does not apply to it. The visual weight is
          unchanged; only the hit area grows. */}
      <Link
        to="/employer/$employerSlug/employment-verifications"
        params={{ employerSlug }}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {pt("empv.back")}
      </Link>

      {query.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{pt("common.loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {pt("vq.error.queue")}
        </p>
      ) : !item ? (
        // Not in this employer's queue. That covers a withdrawn request, a
        // mistyped id and a request belonging to another organisation, and
        // this page cannot tell them apart -- which is the correct amount for
        // it to know.
        <p className="mt-6 text-sm text-muted-foreground">{pt("empv.notFound")}</p>
      ) : (
        <div className="mt-5">
          {notice ? (
            <p role="status" className="mb-4 text-sm font-medium text-foreground">
              {notice}
            </p>
          ) : null}
          <EmploymentVerificationReview item={item} busy={busy} error={error} onDecide={onDecide} />
        </div>
      )}
    </div>
  );
}
