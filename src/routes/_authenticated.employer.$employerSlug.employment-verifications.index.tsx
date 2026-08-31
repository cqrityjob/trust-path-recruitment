// Employer OS — employment verification requests for one organisation.
//
// ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────
//
// The employer side of employment confirmation already worked end to end:
// the queue function, the authorisation, the decision path and the
// attribution have all been in place since Phase 5. What did not exist was
// any way to FIND it. `/passport-attestations` was documented as reachable
// "by the link that accompanies the request", and no such link was ever
// sent — no email, no in-app task, no dashboard row. A candidate could ask
// an employer to confirm their employment and the employer would never learn
// that they had been asked.
//
// So this page is deliberately not new machinery. It is the existing
// `sp_employer_attestation_queue`, in the workspace the employer actually
// signs into, reachable from the "Att göra idag" row on their overview.
//
// ── WHY IT IS NOT IN THE SIDEBAR ───────────────────────────────────────
//
// Only an owner or an admin may answer these — `has_employer_role(uid,
// employer, owner|admin)`, checked in the database, not here. A permanent
// nav item would be shown to every member, most of whom would open an
// organisation-scoped surface that refuses them, and would sit there
// permanently for organisations nobody has ever asked to confirm anything.
// The dashboard row appears when there is work and disappears when there is
// not, which is the honest shape for a feature that is occasional by nature.
//
// ── THREE LISTS, NOT ONE ───────────────────────────────────────────────
//
// Waiting on the employer, waiting on the candidate, and answered. They are
// different obligations and the dashboard count is only the first of them:
// a correction the employer already asked for is not work the employer can
// do, and putting it in the same number would send somebody to a queue where
// everything is somebody else's turn.

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatPeriodRange } from "@/lib/security-passport/format";
import {
  listEmployerAttestations,
  type EmployerAttestationItem,
} from "@/lib/security-passport/verification.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/employment-verifications/",
)({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: EmploymentVerificationsPage,
  errorComponent: EmployerErrorState,
});

function EmploymentVerificationsPage() {
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
      <VerificationList employerId={ws.workspace.employerId} employerSlug={employerSlug} />
    </EmployerAppShell>
  );
}

function VerificationList({
  employerId,
  employerSlug,
}: {
  employerId: string;
  employerSlug: string;
}) {
  const { pt, lang } = usePassportCopy();
  const load = useServerFn(listEmployerAttestations);
  const [expanded, setExpanded] = useState(false);

  // Shared cache key with the overview's count, deliberately: one fetch, one
  // set of rows, and the dashboard can never quote a number this list cannot
  // account for.
  const query = useQuery({
    queryKey: ["passport", "employer-attestations", employerId],
    queryFn: () => load({ data: { employerId } }),
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  // `isSelf` is separated first, not filtered out. The request exists, the
  // employer can see it, and hiding it would leave a candidate waiting on an
  // answer nobody in the organisation has been told to give. It simply is not
  // work THIS reader can do.
  const open = items.filter((i) => i.status === "pending" && !i.isSelf);
  const selfBlocked = items.filter(
    (i) => i.isSelf && (i.status === "pending" || i.status === "clarification_requested"),
  );
  const waiting = items.filter((i) => i.status === "clarification_requested" && !i.isSelf);
  const answered = items.filter(
    (i) => i.status === "approved" || i.status === "rejected" || i.status === "withdrawn",
  );

  return (
    <div className="max-w-3xl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <ShieldCheck aria-hidden="true" className="h-6 w-6 shrink-0" />
          {pt("empv.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("empv.lead")}</p>
      </div>

      {/* Scope, before any request. An employer who does not know what they
          can see will assume they can see everything. */}
      <section className="mt-5 rounded-xl border border-border bg-secondary/40 p-5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {pt("emp.scopeTitle")}
        </h2>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
          <li>{pt("emp.scope1")}</li>
          <li>{pt("emp.scope2")}</li>
          <li>{pt("emp.scope3")}</li>
        </ul>
      </section>

      {query.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">{pt("common.loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {pt("vq.error.queue")}
        </p>
      ) : items.length === 0 ? (
        // A small, contextual empty state inside the dedicated area — never a
        // permanent empty workspace on the overview.
        <div className="mt-6 rounded-xl border border-dashed border-border p-6">
          <p className="text-sm font-medium text-foreground">{pt("empv.emptyTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("empv.emptyBody")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <Group
            heading={pt("empv.openHeading")}
            items={open}
            employerSlug={employerSlug}
            lang={lang}
          />
          <Group
            heading={pt("empv.selfTitle")}
            items={selfBlocked}
            employerSlug={employerSlug}
            lang={lang}
          />
          <Group
            heading={pt("empv.waitingHeading")}
            items={waiting}
            employerSlug={employerSlug}
            lang={lang}
          />
          {answered.length > 0 ? (
            <section aria-labelledby="empv-answered">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span id="empv-answered">
                  {pt("empv.answeredHeading")} ({answered.length})
                </span>
              </button>
              {expanded ? (
                <ul className="mt-3 space-y-2">
                  {answered.map((item) => (
                    <RequestRow key={item.id} item={item} employerSlug={employerSlug} lang={lang} />
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Group({
  heading,
  items,
  employerSlug,
  lang,
}: {
  heading: string;
  items: readonly EmployerAttestationItem[];
  employerSlug: string;
  lang: "sv" | "en";
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {heading}
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <RequestRow key={item.id} item={item} employerSlug={employerSlug} lang={lang} />
        ))}
      </ul>
    </section>
  );
}

function RequestRow({
  item,
  employerSlug,
  lang,
}: {
  item: EmployerAttestationItem;
  employerSlug: string;
  lang: "sv" | "en";
}) {
  const { pt } = usePassportCopy();
  return (
    <li>
      {/* The whole row is the link: a request described as reviewable and then
          needing a second, smaller target to review is one the reader has to
          aim at. Same rule as the overview's action rows. */}
      <Link
        to="/employer/$employerSlug/employment-verifications/$requestId"
        params={{ employerSlug, requestId: item.id }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:border-accent/60 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">
            {item.holderName || pt("common.notStated")}
          </span>
          <span className="block text-sm text-muted-foreground">
            {item.roleTitle} · {formatPeriodRange(item.startedOn, item.endedOn, lang)}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
          {pt("empv.review")}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}
