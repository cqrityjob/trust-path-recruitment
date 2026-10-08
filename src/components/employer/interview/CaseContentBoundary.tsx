import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { InterviewCopyProvider, useT } from "@/i18n/context";
import {
  acknowledgeObservedInterviewContent,
  getInterviewCase,
  type CaseDetail,
} from "@/lib/interview-intelligence/runtime.functions";
import { State } from "./InterviewUi";

/** The read boundary is shared by every employer case screen. Old cases stay
 * readable, but continuation needs the named owner/admin's explicit review. */
export function CaseContentBoundary({ caseId, children }: { caseId: string; children: ReactNode }) {
  const getCase = useServerFn(getInterviewCase);
  const query = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => getCase({ data: { caseId } }),
    retry: false,
  });
  if (query.isPending) return <State kind="loading" />;
  if (query.isError || !query.data?.contentSnapshot)
    return <State kind="error" message={query.error?.message} />;
  const detail = query.data;
  const snapshot = detail.contentSnapshot!;
  const needsReview =
    snapshot.requiresAcknowledgement && !["reported", "cancelled"].includes(detail.status);
  return (
    <InterviewCopyProvider copy={snapshot.clientCopy}>
      <SnapshotNotice detail={detail} />
      {needsReview ? <ObservedContentReview detail={detail} /> : children}
    </InterviewCopyProvider>
  );
}

function SnapshotNotice({ detail }: { detail: CaseDetail }) {
  const { t } = useT();
  const snapshot = detail.contentSnapshot!;
  const integrity = detail.contentIntegrity;
  return (
    <aside
      className="mx-auto mb-4 max-w-6xl rounded-lg border border-border p-3 text-sm"
      role="status"
    >
      <p className="font-medium">{t("ri.snapshot.title")}</p>
      <p>
        {t(snapshot.provenance === "case_created" ? "ri.snapshot.created" : "ri.snapshot.observed")}
      </p>
      <p className="mt-1">
        {t("ri.snapshot.status")}: {integrity.packContentStatus ?? "—"} ·{" "}
        {integrity.packValidationLabel ?? "—"}; {t("ri.content.method")}:{" "}
        {integrity.methodApprovalState ?? "—"}.
      </p>
      <p className="text-muted-foreground">{t("ri.content.boundary")}</p>
    </aside>
  );
}

function ObservedContentReview({ detail }: { detail: CaseDetail }) {
  const { t, lang } = useT();
  const snapshot = detail.contentSnapshot!;
  const acknowledge = useServerFn(acknowledgeObservedInterviewContent);
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      acknowledge({
        data: {
          caseId: detail.id,
          expectedManifestHash: detail.contentIntegrity.manifestHash,
          note,
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ii", "case", detail.id] }),
        queryClient.invalidateQueries({ queryKey: ["ii", "trust-stage", detail.id] }),
      ]);
    },
  });
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">{t("ri.snapshot.review.title")}</h1>
      <p>{t("ri.snapshot.review.body")}</p>
      <details className="rounded-lg border border-border p-4" open>
        <summary className="font-medium">{t("ri.snapshot.review.material")}</summary>
        <p className="mt-2 font-semibold">{detail.packName}</p>
        {detail.competencies.map((c) => (
          <div key={c.id} className="mt-2">
            <p className="font-medium">
              {c.code}: {lang === "en" ? (c.nameEn ?? c.nameSv) : c.nameSv}
            </p>
            <p>{lang === "en" ? (c.definitionEn ?? c.definitionSv) : c.definitionSv}</p>
          </div>
        ))}
        {detail.questions.map((q) => (
          <section key={q.id} className="mt-4 border-t pt-3">
            <p className="font-medium">
              {q.code}: {q.promptSv}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                q.questionType === "situational"
                  ? "ri.snapshot.situational"
                  : "ri.snapshot.behavioural",
              )}
            </p>
            {q.probes.map((p) => (
              <p key={p.id} className="mt-1 text-sm">
                {p.wordingSv}
              </p>
            ))}
            {q.anchors.map((a) => (
              <p key={a.id} className="mt-1 text-sm">
                {a.level}: {lang === "en" ? (a.anchorEn ?? a.anchorSv) : a.anchorSv}
              </p>
            ))}
          </section>
        ))}
        {detail.conductSteps.map((s) => (
          <section key={s.id} className="mt-4 border-t pt-3">
            <p className="font-medium">{lang === "en" ? s.labelEn : s.labelSv}</p>
            <p>{lang === "en" ? s.guidanceEn : s.guidanceSv}</p>
          </section>
        ))}
        {detail.conductGuidance.map((g) => (
          <p key={g.id} className="mt-2 text-sm">
            {lang === "en" ? g.statementEn : g.statementSv}
          </p>
        ))}
        {detail.generalProbes.map((p) => (
          <p key={p.id} className="mt-2 text-sm">
            {p.wordingSv}
          </p>
        ))}
        {detail.verificationRules.map((v) => (
          <section key={v.id} className="mt-3 border-t pt-2">
            <p className="font-medium">{v.requirementSv}</p>
            <p>{v.interviewActionSv}</p>
            <p>{v.subsequentVerificationSv}</p>
            <p>{v.passportBoundarySv}</p>
          </section>
        ))}
        {detail.prohibitedAreas.map((a) => (
          <p key={a.id} className="mt-2 text-sm">
            {lang === "en" ? (a.statementEn ?? a.statementSv) : a.statementSv}
          </p>
        ))}
        {detail.conductProhibitions.map((p) => (
          <p key={p.id} className="mt-2 text-sm">
            {lang === "en" ? p.statementEn : p.statementSv}
          </p>
        ))}
        {detail.methodPractices.map((p) => (
          <p key={p.id} className="mt-2 text-sm">
            {lang === "en" ? (p.statementEn ?? p.statementSv) : p.statementSv}
          </p>
        ))}
      </details>
      <details className="rounded-lg border border-border p-4">
        <summary className="font-medium">{t("ri.snapshot.review.previous")}</summary>
        <p className="mt-2">{detail.plan?.roleSummary}</p>
        <p>{detail.plan?.candidateSummary}</p>
        <p>{detail.plan?.timePlan}</p>
        <p>{detail.plan?.openingGuidance}</p>
        <p>{detail.plan?.closingGuidance}</p>
        {detail.session?.notes.map((n) => (
          <p key={n.id} className="mt-2 whitespace-pre-wrap">
            {n.body}
          </p>
        ))}
        {detail.sources.map((s) => (
          <section key={s.id} id={`source-${s.id}`} className="mt-3">
            <p className="font-medium">{s.label}</p>
            {s.passages.map((p) => (
              <p key={p.id} className="mt-1 whitespace-pre-wrap">
                {p.content}
              </p>
            ))}
          </section>
        ))}
      </details>
      {!snapshot.mayAcknowledge ? (
        <p role="status">{t("ri.snapshot.review.owner")}</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (checked && note.trim()) mutation.mutate();
          }}
        >
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {t("ri.snapshot.review.confirm")}
          </label>
          <label className="block">
            {t("ri.snapshot.review.note")}
            <textarea
              className="mt-1 block min-h-24 w-full rounded-md border border-border p-2"
              maxLength={4000}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {mutation.isError && (
            <p role="alert">
              {t("ri.snapshot.review.failed")} {mutation.error.message}
            </p>
          )}
          <button
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            type="submit"
            disabled={!checked || !note.trim() || mutation.isPending}
          >
            {t(mutation.isPending ? "ri.snapshot.review.saving" : "ri.snapshot.review.save")}
          </button>
        </form>
      )}
    </main>
  );
}
