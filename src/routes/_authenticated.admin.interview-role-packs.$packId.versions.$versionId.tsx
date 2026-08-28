// Interview Intelligence — the Role Interview Pack version workspace.
//
// Six sections, in the order the UX blueprint puts them:
//
//   1. Overview and role context
//   2. Competencies and observable indicators
//   3. Core questions and approved probes
//   4. Evidence dimensions and rating anchors
//   5. Verification requirements and prohibited areas
//   6. Review, validation and publication
//
// Two properties of this screen are load-bearing and worth stating:
//
// EVIDENCE BEFORE JUDGEMENT. Every question shows what it asks and what
// evidence to seek before it shows any anchor, and the anchors are presented as
// descriptions of behaviour rather than as a scale to slide. Level 0 is drawn
// apart from 1-4 and labelled as insufficient evidence, because folding it into
// the run of levels is exactly how it becomes read as "a low score".
//
// NAVIGATION IS NOT DRAG-AND-DROP. Question order is governed content displayed
// as a number; nothing here can be reordered by pointer alone, and nothing in
// this feature requires a pointer at all.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  AsyncState,
  MappingStateBadge,
  NoticePanel,
  PackStatusBadge,
  ProbeProvenanceBadge,
  StateBadge,
  ValidationLabelBadge,
} from "@/components/admin/interview/PackGovernanceUi";
import {
  getRolePackVersion,
  publishRolePackVersion,
  recordRolePackReview,
  retireRolePackVersion,
  setRolePackPilotAvailability,
  submitRolePackForReview,
  suspendRolePackVersion,
  type PackVersionDetail,
  type ReviewGate,
} from "@/lib/interview-intelligence/role-packs.functions";

export const Route = createFileRoute(
  "/_authenticated/admin/interview-role-packs/$packId/versions/$versionId",
)({
  ssr: false,
  component: RolePackVersionPage,
});

const GATES: readonly ReviewGate[] = ["expert", "legal", "cognitive", "product"];

function RolePackVersionPage() {
  const { packId, versionId } = Route.useParams();
  const { t } = useT();
  const queryClient = useQueryClient();

  const getFn = useServerFn(getRolePackVersion);
  const q = useQuery({
    queryKey: ["admin", "interview-role-packs", versionId],
    queryFn: () => getFn({ data: { versionId } }),
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "interview-role-packs"] });

  if (q.isLoading) {
    return (
      <Frame>
        <AsyncState state="loading" />
      </Frame>
    );
  }

  if (q.isError) {
    const message = (q.error as Error).message;
    const notFound = message.includes("NOT_FOUND");
    return (
      <Frame>
        <AsyncState
          state={notFound ? "denied" : "error"}
          message={notFound ? undefined : message}
        />
        <div className="mt-4">
          <Link
            to="/admin/interview-role-packs"
            className="text-sm text-accent underline-offset-2 hover:underline"
          >
            {t("ii.detail.backToList")}
          </Link>
        </div>
      </Frame>
    );
  }

  // isLoading and isError are handled above, but React Query's types still admit
  // undefined here. Treating that as a load rather than asserting keeps the
  // screen honest if the query is ever reset underneath it.
  const d = q.data;
  if (!d) {
    return (
      <Frame>
        <AsyncState state="loading" />
      </Frame>
    );
  }

  const locked = !["draft", "expert_review", "legal_review", "cognitive_review"].includes(
    d.version.status,
  );

  return (
    <Frame>
      <nav aria-label={t("ii.a11y.breadcrumb")} className="text-sm">
        <Link
          to="/admin/interview-role-packs"
          className="text-accent underline-offset-2 hover:underline"
        >
          {t("ii.list.heading")}
        </Link>
      </nav>

      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{d.pack.nameSv}</h1>
          <span className="tabular-nums text-lg text-muted-foreground">
            v{d.version.versionNumber}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PackStatusBadge status={d.version.status} />
          <ValidationLabelBadge label={d.version.validationLabel} />
          <StateBadge tone="neutral">{d.version.locale}</StateBadge>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        {d.version.validationLabel === "pilot_hypothesis" && (
          <NoticePanel tone="attention" title={t("ii.detail.pilotTitle")}>
            <p>{t("ii.detail.pilotBody")}</p>
          </NoticePanel>
        )}

        {locked && d.version.status === "published" && (
          <NoticePanel tone="confirmed" title={t("ii.detail.publishedTitle")}>
            <p>{t("ii.detail.publishedBody")}</p>
          </NoticePanel>
        )}

        {d.version.status === "suspended" && (
          <NoticePanel tone="governance" role="alert" title={t("ii.detail.suspendedTitle")}>
            <p>{t("ii.detail.suspendedBody")}</p>
            {d.version.suspendedReason && (
              <p className="font-medium">{d.version.suspendedReason}</p>
            )}
          </NoticePanel>
        )}

        {d.version.status === "retired" && (
          <NoticePanel tone="neutral" title={t("ii.detail.retiredTitle")}>
            <p>{t("ii.detail.retiredBody")}</p>
            {d.version.retiredReason && <p className="font-medium">{d.version.retiredReason}</p>}
          </NoticePanel>
        )}
      </div>

      <SectionNav />

      {/* ---------- 1. Overview and role context ---------- */}
      <Section id="ii-overview" number={1} titleKey="ii.section.overview">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label={t("ii.detail.field.purpose")}>{d.pack.purposeSv}</Field>
          <Field label={t("ii.detail.field.roleVersion")}>
            {d.version.roleNameSv ?? d.version.roleVersionId}
          </Field>
          <Field label={t("ii.detail.field.source")}>
            {d.version.sourceReference} · {d.version.sourceDocumentVersion}
          </Field>
          <Field label={t("ii.detail.field.contentHash")}>
            <code className="break-all font-mono text-xs">{d.version.contentHash ?? "—"}</code>
          </Field>
        </dl>
        {d.version.summarySv && (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {d.version.summarySv}
          </p>
        )}
      </Section>

      {/* ---------- 2. Competencies ---------- */}
      <Section id="ii-competencies" number={2} titleKey="ii.section.competencies">
        {d.competencies.length === 0 ? (
          <AsyncState state="empty">{t("ii.detail.empty.competencies")}</AsyncState>
        ) : (
          <ul className="space-y-4">
            {d.competencies.map((c) => (
              <li key={c.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    <span className="tabular-nums text-muted-foreground">{c.code}</span> {c.nameSv}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {c.definitionSv}
                </p>

                {c.observableIndicatorsSv.length > 0 && (
                  <>
                    <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("ii.detail.indicators")}
                    </h4>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {c.observableIndicatorsSv.map((i) => (
                        <li key={i}>
                          <StateBadge tone="work">{i}</StateBadge>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("ii.detail.mapping")}
                </h4>
                {c.mappings.length === 0 ? (
                  <p className="mt-1 text-sm text-destructive">{t("ii.detail.mapping.none")}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {c.mappings.map((m) => (
                      <li key={m.id} className="rounded-md border border-border bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {m.canonicalCode ?? m.competencyVersionId}
                          </span>
                          {m.canonicalNameSv && (
                            <span className="text-muted-foreground">{m.canonicalNameSv}</span>
                          )}
                          <StateBadge tone="neutral">
                            {t(`ii.mapping.relation.${m.relation}` as TranslationKey)}
                          </StateBadge>
                          <MappingStateBadge state={m.state} />
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          {m.rationaleSv}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---------- 3 & 4. Questions, probes, dimensions, anchors ---------- */}
      <Section id="ii-questions" number={3} titleKey="ii.section.questions">
        <p className="mb-4 text-sm text-muted-foreground">{t("ii.detail.questions.intro")}</p>

        {d.generalProbes.length > 0 && (
          <div className="mb-6 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {t("ii.detail.generalProbes")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("ii.detail.generalProbes.hint")}
            </p>
            <ul className="mt-3 space-y-2">
              {d.generalProbes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                  <StateBadge tone="work">
                    {t(`ii.probe.purpose.${p.purpose}` as TranslationKey)}
                  </StateBadge>
                  <span className="text-foreground">{p.wordingSv}</span>
                  <ProbeProvenanceBadge provenance={p.provenance} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {d.questions.length === 0 ? (
          <AsyncState state="empty">{t("ii.detail.empty.questions")}</AsyncState>
        ) : (
          <ol className="space-y-6">
            {d.questions.map((qq) => (
              <li key={qq.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums text-sm font-semibold text-muted-foreground">
                    {qq.code} · {t("ii.detail.order")} {qq.displayOrder}
                  </span>
                  <StateBadge tone="neutral">
                    {t(`ii.question.type.${qq.questionType}` as TranslationKey)}
                  </StateBadge>
                  {qq.primaryCompetencyCode && (
                    <StateBadge tone="work" srPrefix={t("ii.detail.primaryCompetency")}>
                      {qq.competencyCodes.join(" + ")}
                    </StateBadge>
                  )}
                  {qq.durationMinMinutes !== null && qq.durationMaxMinutes !== null && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {qq.durationMinMinutes}–{qq.durationMaxMinutes} min
                    </span>
                  )}
                </div>

                <blockquote className="mt-3 border-l-2 border-accent pl-3 text-base leading-relaxed text-foreground">
                  {qq.promptSv}
                </blockquote>
                <p className="mt-1 text-xs text-muted-foreground">{t("ii.detail.verbatim")}</p>

                {qq.evidenceSourceNoteSv && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {qq.evidenceSourceNoteSv}
                  </p>
                )}

                {qq.probes.length > 0 && (
                  <>
                    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("ii.detail.probes")}
                    </h4>
                    <ul className="mt-2 space-y-1.5">
                      {qq.probes.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                          <StateBadge tone="work">
                            {t(`ii.probe.purpose.${p.purpose}` as TranslationKey)}
                          </StateBadge>
                          <span className="text-foreground">{p.wordingSv}</span>
                          <ProbeProvenanceBadge provenance={p.provenance} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* Evidence first... */}
                {qq.dimensions.length > 0 && (
                  <>
                    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("ii.detail.dimensions")}
                    </h4>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {qq.dimensions.map((dim) => (
                        <li key={dim.id}>
                          <StateBadge tone="neutral">{dim.labelSv}</StateBadge>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* ...then judgement. */}
                {qq.anchors.length > 0 && (
                  <>
                    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("ii.detail.anchors")}
                    </h4>
                    <AnchorList anchors={qq.anchors} />
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* ---------- 5. Verification and prohibitions ---------- */}
      <Section id="ii-boundaries" number={4} titleKey="ii.section.boundaries">
        <h3 className="text-sm font-semibold text-foreground">{t("ii.detail.verification")}</h3>
        {d.verificationRules.length === 0 ? (
          <div className="mt-2">
            <AsyncState state="empty">{t("ii.detail.empty.verification")}</AsyncState>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {d.verificationRules.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-4 text-sm">
                <p className="font-medium text-foreground">{r.requirementSv}</p>
                <dl className="mt-2 space-y-1 text-muted-foreground">
                  <div>
                    <dt className="inline font-medium">{t("ii.detail.verification.action")}: </dt>
                    <dd className="inline">{r.interviewActionSv}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">
                      {t("ii.detail.verification.subsequent")}:{" "}
                    </dt>
                    <dd className="inline">{r.subsequentVerificationSv}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">{t("ii.detail.verification.passport")}: </dt>
                    <dd className="inline">{r.passportBoundarySv}</dd>
                  </div>
                </dl>
                {r.permittedSourceStates.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {r.permittedSourceStates.map((s) => (
                      <li key={s}>
                        <StateBadge tone="neutral">
                          {t(`ii.sourceState.${s}` as TranslationKey)}
                        </StateBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-8 text-sm font-semibold text-foreground">{t("ii.detail.prohibited")}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("ii.detail.prohibited.hint")}
        </p>
        {d.prohibitedAreas.length === 0 ? (
          <div className="mt-2">
            <AsyncState state="empty">{t("ii.detail.empty.prohibited")}</AsyncState>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.prohibitedAreas.map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <StateBadge tone="neutral">
                    {t(`ii.prohibited.type.${a.areaType}` as TranslationKey)}
                  </StateBadge>
                  <span className="font-medium text-foreground">{a.statementSv}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {a.rationaleSv}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---------- 6. Review, validation and publication ---------- */}
      <Section id="ii-governance" number={5} titleKey="ii.section.governance">
        <GovernancePanel detail={d} versionId={versionId} onChanged={invalidate} />
      </Section>

      {/* ---------- Audit ---------- */}
      <Section id="ii-audit" number={6} titleKey="ii.section.audit">
        {d.events.length === 0 ? (
          <AsyncState state="empty">{t("ii.detail.empty.audit")}</AsyncState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">{t("ii.section.audit")}</caption>
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2">
                    {t("ii.audit.column.event")}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t("ii.audit.column.transition")}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t("ii.audit.column.reason")}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t("ii.audit.column.at")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.events.map((e) => (
                  <tr key={e.id}>
                    <th scope="row" className="px-4 py-2 font-medium text-foreground">
                      {e.event}
                    </th>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.previousStatus || e.newStatus
                        ? `${e.previousStatus ?? "—"} → ${e.newStatus ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {new Date(e.at).toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        <Link
          to="/admin/interview-role-packs/$packId/versions/$versionId"
          params={{ packId, versionId }}
          className="sr-only"
        >
          {t("ii.detail.backToList")}
        </Link>
      </p>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SiteLayout>
      <AdminShellChrome activeSection="interviewRolePacks">{children}</AdminShellChrome>
    </SiteLayout>
  );
}

function Section({
  id,
  number,
  titleKey,
  children,
}: {
  id: string;
  number: number;
  titleKey: TranslationKey;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-10 scroll-mt-6">
      <h2 id={`${id}-heading`} className="text-lg font-semibold text-foreground">
        <span className="tabular-nums text-muted-foreground">{number}.</span> {t(titleKey)}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SectionNav() {
  const { t } = useT();
  const items: readonly { readonly href: string; readonly key: TranslationKey }[] = [
    { href: "#ii-overview", key: "ii.section.overview" },
    { href: "#ii-competencies", key: "ii.section.competencies" },
    { href: "#ii-questions", key: "ii.section.questions" },
    { href: "#ii-boundaries", key: "ii.section.boundaries" },
    { href: "#ii-governance", key: "ii.section.governance" },
    { href: "#ii-audit", key: "ii.section.audit" },
  ];
  return (
    <nav aria-label={t("ii.a11y.sectionNav")} className="mt-8 border-y border-border py-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {items.map((i) => (
          <li key={i.href}>
            <a
              href={i.href}
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t(i.key)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Level 0 is rendered ABOVE and apart from levels 1-4, with its own explanation.
 * Drawn inside the run it reads as the bottom of a scale, which is the exact
 * misreading the source document forbids.
 */
function AnchorList({
  anchors,
}: {
  anchors: readonly {
    id: string;
    level: number;
    labelSv: string;
    anchorSv: string;
    countsTowardAggregation: boolean;
  }[];
}) {
  const { t } = useT();
  const zero = anchors.find((a) => a.level === 0) ?? null;
  const rest = anchors.filter((a) => a.level > 0).sort((a, b) => a.level - b.level);

  return (
    <div className="mt-2 space-y-3">
      {zero && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-3">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            <span className="tabular-nums">0</span> — {zero.labelSv}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{zero.anchorSv}</p>
          <p className="mt-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
            {t("ii.anchor.zeroRule")}
          </p>
        </div>
      )}
      <ol className="space-y-2">
        {rest.map((a) => (
          <li key={a.id} className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              <span className="tabular-nums">{a.level}</span> — {a.labelSv}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.anchorSv}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section 6 — review, validation and publication                      */
/* ------------------------------------------------------------------ */

function GovernancePanel({
  detail,
  versionId,
  onChanged,
}: {
  detail: PackVersionDetail;
  versionId: string;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [gate, setGate] = useState<ReviewGate>("expert");
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [rationale, setRationale] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<
    "publish" | "suspend" | "retire" | "pilotOpen" | "pilotWithdraw" | null
  >(null);

  const submitFn = useServerFn(submitRolePackForReview);
  const reviewFn = useServerFn(recordRolePackReview);
  const publishFn = useServerFn(publishRolePackVersion);
  const suspendFn = useServerFn(suspendRolePackVersion);
  const retireFn = useServerFn(retireRolePackVersion);
  const pilotFn = useServerFn(setRolePackPilotAvailability);

  const settle = { onSuccess: onChanged };

  const submit = useMutation({
    mutationFn: (g: ReviewGate) => submitFn({ data: { versionId, gate: g } }),
    ...settle,
  });
  const review = useMutation({
    mutationFn: () => reviewFn({ data: { versionId, gate, decision, rationale } }),
    onSuccess: () => {
      setRationale("");
      onChanged();
    },
  });
  const publish = useMutation({
    mutationFn: () => publishFn({ data: { versionId, reason: reason || null } }),
    onSuccess: () => {
      setReason("");
      setConfirming(null);
      onChanged();
    },
  });
  const suspend = useMutation({
    mutationFn: () => suspendFn({ data: { versionId, reason } }),
    onSuccess: () => {
      setReason("");
      setConfirming(null);
      onChanged();
    },
  });
  const retire = useMutation({
    mutationFn: () => retireFn({ data: { versionId, reason } }),
    onSuccess: () => {
      setReason("");
      setConfirming(null);
      onChanged();
    },
  });
  const pilot = useMutation({
    mutationFn: (available: boolean) => pilotFn({ data: { versionId, available, reason } }),
    onSuccess: () => {
      setReason("");
      setConfirming(null);
      onChanged();
    },
  });

  const busyError =
    (submit.error as Error | null) ??
    (review.error as Error | null) ??
    (publish.error as Error | null) ??
    (suspend.error as Error | null) ??
    (retire.error as Error | null) ??
    (pilot.error as Error | null) ??
    null;

  const { canEdit, canReview, canPublish } = detail.capabilities;
  const status = detail.version.status;
  const blockers = detail.blockingReasons;

  const fieldClass =
    "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const buttonClass =
    "inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div className="space-y-6">
      {!canEdit && !canReview && !canPublish && (
        <NoticePanel tone="neutral" title={t("ii.gov.readOnlyTitle")}>
          <p>{t("ii.gov.readOnlyBody")}</p>
        </NoticePanel>
      )}

      {busyError && (
        <NoticePanel tone="governance" role="alert" title={t("ii.gov.actionFailed")}>
          <p className="whitespace-pre-line">{busyError.message}</p>
        </NoticePanel>
      )}

      {/* ---- gate status ---- */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("ii.gov.gates")}</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {GATES.map((g) => {
            const latest = detail.reviews.find((r) => r.gate === g) ?? null;
            const approvedNow =
              latest?.decision === "approved" && latest.stillAppliesToCurrentContent;
            return (
              <li key={g} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {t(`ii.gate.${g}` as TranslationKey)}
                  </span>
                  {latest === null ? (
                    <StateBadge tone="attention">{t("ii.gate.notReviewed")}</StateBadge>
                  ) : approvedNow ? (
                    <StateBadge tone="confirmed">{t("ii.gate.approved")}</StateBadge>
                  ) : latest.decision === "approved" ? (
                    <StateBadge tone="attention">{t("ii.gate.stale")}</StateBadge>
                  ) : (
                    <StateBadge tone="governance">{t("ii.gate.rejected")}</StateBadge>
                  )}
                </div>
                {latest && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {latest.rationale}
                  </p>
                )}
                {latest?.decision === "approved" && !latest.stillAppliesToCurrentContent && (
                  <p className="mt-1 text-xs font-medium text-amber-900 dark:text-amber-200">
                    {t("ii.gate.staleExplain")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- blocking reasons ---- */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("ii.gov.blockers")}</h3>
        {blockers.length === 0 ? (
          <div className="mt-2">
            <NoticePanel tone="confirmed" title={t("ii.gov.noBlockers")} />
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {blockers.map((b) => (
              <li
                key={`${b.code}-${b.message}`}
                className="rounded-md border border-amber-600/40 bg-amber-500/5 p-3 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{b.code}</span>
                <p className="mt-0.5 text-foreground">{b.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- editor: submit for a gate ---- */}
      {canEdit &&
        ["draft", "expert_review", "legal_review", "cognitive_review"].includes(status) && (
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">{t("ii.gov.submit")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("ii.gov.submit.hint")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {GATES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={buttonClass}
                  disabled={submit.isPending}
                  onClick={() => submit.mutate(g)}
                >
                  {t(`ii.gov.submitTo.${g}` as TranslationKey)}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* ---- reviewer: record a decision ---- */}
      {canReview && ["expert_review", "legal_review", "cognitive_review"].includes(status) && (
        <form
          className="rounded-lg border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rationale.trim() === "") return;
            review.mutate();
          }}
        >
          <h3 className="text-sm font-semibold text-foreground">{t("ii.gov.review")}</h3>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ii-gate" className="text-xs font-medium text-foreground">
                {t("ii.gov.review.gate")}
              </label>
              <select
                id="ii-gate"
                value={gate}
                onChange={(e) => setGate(e.target.value as ReviewGate)}
                className={fieldClass}
              >
                {GATES.map((g) => (
                  <option key={g} value={g}>
                    {t(`ii.gate.${g}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ii-decision" className="text-xs font-medium text-foreground">
                {t("ii.gov.review.decision")}
              </label>
              <select
                id="ii-decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value as "approved" | "rejected")}
                className={fieldClass}
              >
                <option value="approved">{t("ii.gate.approved")}</option>
                <option value="rejected">{t("ii.gate.rejected")}</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="ii-rationale" className="text-xs font-medium text-foreground">
              {t("ii.gov.review.rationale")}
            </label>
            <textarea
              id="ii-rationale"
              rows={3}
              required
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              aria-describedby="ii-rationale-hint"
              className={fieldClass}
            />
            <p id="ii-rationale-hint" className="mt-1 text-xs text-muted-foreground">
              {t("ii.gov.review.rationaleHint")}
            </p>
          </div>

          <button type="submit" className={`${buttonClass} mt-3`} disabled={review.isPending}>
            {t("ii.gov.review.submit")}
          </button>
        </form>
      )}

      {/* ---- publisher: publish / suspend / retire ---- */}
      {canPublish && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">{t("ii.gov.publication")}</h3>

          {status === "cognitive_review" && (
            <div className="mt-3">
              {blockers.length > 0 ? (
                <NoticePanel tone="attention" title={t("ii.gov.publishBlocked")}>
                  <p>{t("ii.gov.publishBlockedBody")}</p>
                </NoticePanel>
              ) : confirming === "publish" ? (
                <ConfirmBlock
                  titleKey="ii.gov.confirmPublish"
                  bodyKey="ii.gov.confirmPublishBody"
                  reason={reason}
                  setReason={setReason}
                  reasonRequired={false}
                  pending={publish.isPending}
                  onConfirm={() => publish.mutate()}
                  onCancel={() => setConfirming(null)}
                />
              ) : (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setConfirming("publish")}
                >
                  {t("ii.gov.publish")}
                </button>
              )}
            </div>
          )}

          {status === "published" && (
            <div className="mt-3 space-y-3">
              {confirming === "suspend" ? (
                <ConfirmBlock
                  titleKey="ii.gov.confirmSuspend"
                  bodyKey="ii.gov.confirmSuspendBody"
                  reason={reason}
                  setReason={setReason}
                  reasonRequired
                  pending={suspend.isPending}
                  onConfirm={() => suspend.mutate()}
                  onCancel={() => setConfirming(null)}
                />
              ) : confirming === "retire" ? (
                <ConfirmBlock
                  titleKey="ii.gov.confirmRetire"
                  bodyKey="ii.gov.confirmRetireBody"
                  reason={reason}
                  setReason={setReason}
                  reasonRequired
                  pending={retire.isPending}
                  onConfirm={() => retire.mutate()}
                  onCancel={() => setConfirming(null)}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setConfirming("suspend")}
                  >
                    {t("ii.gov.suspend")}
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setConfirming("retire")}
                  >
                    {t("ii.gov.retire")}
                  </button>
                </div>
              )}
            </div>
          )}

          {status === "suspended" && confirming !== "retire" && (
            <button
              type="button"
              className={`${buttonClass} mt-3`}
              onClick={() => setConfirming("retire")}
            >
              {t("ii.gov.retire")}
            </button>
          )}
          {status === "suspended" && confirming === "retire" && (
            <div className="mt-3">
              <ConfirmBlock
                titleKey="ii.gov.confirmRetire"
                bodyKey="ii.gov.confirmRetireBody"
                reason={reason}
                setReason={setReason}
                reasonRequired
                pending={retire.isPending}
                onConfirm={() => retire.mutate()}
                onCancel={() => setConfirming(null)}
              />
            </div>
          )}

          {status === "retired" && (
            <p className="mt-3 text-sm text-muted-foreground">{t("ii.gov.retiredFinal")}</p>
          )}
        </div>
      )}

      {/* ---- publisher: open pilot availability (content decision) ---- */}
      {canPublish &&
        ["draft", "expert_review", "legal_review", "cognitive_review"].includes(status) && (
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">{t("ii.gov.pilot")}</h3>
            <div className="mt-2">
              {detail.version.pilotAvailability === "open" ? (
                <StateBadge tone="confirmed">{t("ii.gov.pilot.openState")}</StateBadge>
              ) : (
                <StateBadge tone="neutral">{t("ii.gov.pilot.restrictedState")}</StateBadge>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("ii.gov.pilot.hint")}
            </p>
            <div className="mt-3">
              {confirming === "pilotOpen" ? (
                <ConfirmBlock
                  titleKey="ii.gov.confirmPilotOpen"
                  bodyKey="ii.gov.confirmPilotOpenBody"
                  reason={reason}
                  setReason={setReason}
                  reasonRequired
                  pending={pilot.isPending}
                  onConfirm={() => pilot.mutate(true)}
                  onCancel={() => setConfirming(null)}
                />
              ) : confirming === "pilotWithdraw" ? (
                <ConfirmBlock
                  titleKey="ii.gov.confirmPilotWithdraw"
                  bodyKey="ii.gov.confirmPilotWithdrawBody"
                  reason={reason}
                  setReason={setReason}
                  reasonRequired
                  pending={pilot.isPending}
                  onConfirm={() => pilot.mutate(false)}
                  onCancel={() => setConfirming(null)}
                />
              ) : detail.version.pilotAvailability === "open" ? (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setConfirming("pilotWithdraw")}
                >
                  {t("ii.gov.pilot.withdraw")}
                </button>
              ) : (
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setConfirming("pilotOpen")}
                >
                  {t("ii.gov.pilot.open")}
                </button>
              )}
            </div>
          </div>
        )}
    </div>
  );
}

/**
 * An accessible confirmation for the three irreversible governance actions.
 * Inline rather than a modal on purpose: it keeps the blocking reasons and the
 * gate states visible while the person decides, and it needs no focus trap to
 * be operable by keyboard.
 */
function ConfirmBlock({
  titleKey,
  bodyKey,
  reason,
  setReason,
  reasonRequired,
  pending,
  onConfirm,
  onCancel,
}: {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  reason: string;
  setReason: (v: string) => void;
  reasonRequired: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const invalid = reasonRequired && reason.trim() === "";
  return (
    <div
      role="group"
      aria-labelledby="ii-confirm-title"
      className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-4"
    >
      <p id="ii-confirm-title" className="text-sm font-semibold text-foreground">
        {t(titleKey)}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(bodyKey)}</p>

      <label htmlFor="ii-confirm-reason" className="mt-3 block text-xs font-medium text-foreground">
        {reasonRequired ? t("ii.gov.reasonRequired") : t("ii.gov.reasonOptional")}
      </label>
      <textarea
        id="ii-confirm-reason"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-required={reasonRequired}
        aria-invalid={invalid}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || invalid}
          onClick={onConfirm}
          className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t("ii.gov.confirm")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t("ii.gov.cancel")}
        </button>
      </div>
    </div>
  );
}
