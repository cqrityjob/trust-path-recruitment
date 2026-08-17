// Security Passport — employer employment attestation.
//
// ── WHY THIS LIVES IN THE PASSPORT, NOT THE EMPLOYER PORTAL CHROME ─────
//
// Authorisation is the Employer Portal's: `has_employer_role(uid, employer,
// owner|admin)`, the same helper every employer surface uses, checked in the
// database rather than here. What is deliberately NOT reused is the portal's
// navigation shell, for two reasons:
//
//   * a nav entry needs a key in the central dictionary, which the Passport
//     is not permitted to edit and which the connected Lovable environment
//     rewrites continuously;
//   * this is a Passport surface. An employer answering a question about
//     somebody's Passport is not doing recruitment work, and filing it under
//     the recruitment chrome would blur the product separation the whole
//     architecture rests on.
//
// The representative reaches it by the link that accompanies the request.
//
// ── THE NARROWEST READ IN THE PRODUCT ──────────────────────────────────
//
// One employment period and a name. No qualifications, no other employment,
// no documents, no Passport, and no way to enumerate holders — because the
// only read is `sp_employer_attestation_queue`, which returns those fields
// and cannot be asked for others. Everything absent from this page is
// absent from the payload too; nothing is hidden in the browser.
//
// ── WHAT THE EMPLOYER IS BEING ASKED ───────────────────────────────────
//
// Whether stated facts are correct. Not whether the person is any good.
// That distinction is written on the page, because an attestation screen
// that felt like a reference request would collect opinions the product has
// no right to hold and no way to substantiate.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, HelpCircle, X } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  decideVerification,
  listEmployerAttestations,
  type EmployerAttestationItem,
} from "@/lib/security-passport/verification.functions";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";

export const Route = createFileRoute("/_authenticated/passport-attestations")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Passport — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PassportAttestationsRoute,
});

const STATUS_KEY: Readonly<Record<string, PassportCopyKey>> = {
  pending: "ver.status.pending",
  approved: "ver.status.approved",
  rejected: "ver.status.rejected",
  clarification_requested: "ver.status.clarification_requested",
  withdrawn: "ver.status.withdrawn",
};

const EMPLOYMENT_KEY: Readonly<Record<string, PassportCopyKey>> = {
  full_time: "timeline.employmentType.full_time",
  part_time: "timeline.employmentType.part_time",
  hourly: "timeline.employmentType.hourly",
  temporary: "timeline.employmentType.temporary",
};

function PassportAttestationsRoute() {
  const { pt } = usePassportCopy();

  const loadWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const loadQueue = useServerFn(listEmployerAttestations);
  const decide = useServerFn(decideVerification);

  const workspaces = useQuery({
    queryKey: ["passport", "attestation-workspaces"],
    queryFn: () => loadWorkspaces(),
  });

  const [items, setItems] = useState<readonly EmployerAttestationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  // Only owners and admins may attest. The database enforces it; filtering
  // here just avoids asking on behalf of a membership that will be refused.
  const eligibleIds = useMemo(
    () =>
      (workspaces.data ?? [])
        .filter((w) => w.role === "owner" || w.role === "admin")
        .map((w) => w.employerId),
    [workspaces.data],
  );

  const refresh = useCallback(async () => {
    if (eligibleIds.length === 0) return;
    try {
      const all = await Promise.all(
        eligibleIds.map((employerId) => loadQueue({ data: { employerId } })),
      );
      setItems(all.flat());
    } catch (err) {
      console.error("[passport] attestation queue failed", err);
      setError(pt("common.error"));
    }
  }, [eligibleIds, loadQueue, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function answer(
    item: EmployerAttestationItem,
    decision: "approved" | "rejected" | "clarification_requested",
  ) {
    if (!window.confirm(`${pt("emp.confirmTitle")}\n\n${pt("emp.confirmBody")}`)) return;
    setBusy(true);
    setError(null);
    try {
      await decide({
        data: {
          requestId: item.id,
          decision,
          // An employer confirms employment they have direct knowledge of.
          // That is the method, and it is the only one they can record.
          method: decision === "approved" ? "employer_confirmation" : null,
          decisionNote: null,
          holderMessage: messages[item.id]?.trim() || null,
          validFrom: null,
          validUntil: null,
        },
      });
      setNotice(pt("emp.done"));
      await refresh();
    } catch (err) {
      console.error("[passport] attestation decision failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteLayout>
      <Section>
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <header>
            <h1
              className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <Building2 aria-hidden="true" className="h-6 w-6" />
              {pt("emp.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("emp.lead")}</p>
          </header>

          {/* Scope, before any request. An employer who does not know what
              they can see will assume they can see everything. */}
          <section className="rounded-xl border border-border bg-secondary/40 p-5">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {pt("emp.scopeTitle")}
            </h2>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
              <li>{pt("emp.scope1")}</li>
              <li>{pt("emp.scope2")}</li>
              <li>{pt("emp.scope3")}</li>
            </ul>
          </section>

          {notice ? (
            <p role="status" className="text-sm font-medium text-foreground">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {workspaces.isLoading ? (
            <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{pt("emp.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const open = item.status === "pending" || item.status === "clarification_requested";
                return (
                  <li key={item.id} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <h2 className="text-base font-semibold tracking-tight text-foreground">
                        {item.holderName || "—"}
                      </h2>
                      <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                        {pt(STATUS_KEY[item.status] ?? "ver.status.pending")}
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {pt("emp.role")}
                        </dt>
                        <dd className="mt-0.5 text-sm text-foreground">{item.roleTitle}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {pt("emp.period")}
                        </dt>
                        <dd className="mt-0.5 text-sm tabular-nums text-foreground">
                          {item.startedOn} – {item.endedOn ?? pt("common.present")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {pt("emp.employmentType")}
                        </dt>
                        <dd className="mt-0.5 text-sm text-foreground">
                          {pt(EMPLOYMENT_KEY[item.employmentType] ?? "common.notStated")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {pt("vq.submittedAt")}
                        </dt>
                        <dd className="mt-0.5 text-sm tabular-nums text-foreground">
                          {item.submittedAt.slice(0, 10)}
                        </dd>
                      </div>
                    </dl>

                    {open ? (
                      <div className="mt-5 border-t border-border pt-4">
                        <p className="text-sm font-medium text-foreground">{pt("emp.question")}</p>

                        <label
                          htmlFor={`sp-msg-${item.id}`}
                          className="mt-3 block text-sm font-medium text-foreground"
                        >
                          {pt("emp.message")}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({pt("common.optional")})
                          </span>
                        </label>
                        <textarea
                          id={`sp-msg-${item.id}`}
                          rows={2}
                          value={messages[item.id] ?? ""}
                          onChange={(e) =>
                            setMessages((m) => ({ ...m, [item.id]: e.target.value }))
                          }
                          className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void answer(item, "approved")}
                            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <Check aria-hidden="true" className="h-4 w-4" />
                            {pt("emp.confirm")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void answer(item, "rejected")}
                            className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <X aria-hidden="true" className="h-4 w-4" />
                            {pt("emp.reject")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void answer(item, "clarification_requested")}
                            className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <HelpCircle aria-hidden="true" className="h-4 w-4" />
                            {pt("emp.correction")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        {pt("emp.decided")} {item.decidedAt ? item.decidedAt.slice(0, 10) : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>
    </SiteLayout>
  );
}
