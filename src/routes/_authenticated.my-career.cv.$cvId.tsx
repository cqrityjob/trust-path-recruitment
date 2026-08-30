// One saved CV.
//
// -- THE EDITING CONTRACT, ON SCREEN ------------------------------------
//
// Two kinds of change look identical in a text box and are not the same
// thing. Rewording "Responsible for security operations" into "Led security
// operations" is presentation, and it is edited here. Changing an employer
// from Company A to Company B is not a rewording -- it is a different job,
// and it belongs to the record that owns it.
//
// So in edit mode every fact is rendered as a LOCKED label with the
// editable wording beneath it, and the one control offered for a factual
// correction is a link to the Professional Profile. This is not merely a
// UI convention: the edit payload has no field that could carry an
// employer, a title or a date, so nothing typed on this page can reach a
// factual record even if the screen were wrong.
//
// -- THE SAVED DOCUMENT IS A SNAPSHOT -----------------------------------
//
// It is not refreshed when the profile changes. If it were, a CV somebody
// exported in March would quietly become a different document in June, and
// the copy an employer received would no longer be reproducible. When the
// profile has moved, a banner says so and offers an explicit update; taking
// it is the person's decision, and dropping bullets for an employment that
// no longer exists is reported rather than done silently.
//
// -- REGENERATION NEVER OVERWRITES ---------------------------------------
//
// "Create a new AI draft" produces a SUGGESTION held in component state.
// The saved document is untouched until the person accepts it, and the
// accept path re-validates the draft server-side against a freshly rebuilt
// bundle -- because a proposal that has been to a browser and back is not a
// trusted input.
//
// -- EXPORT ------------------------------------------------------------
//
// The browser's own print-to-PDF over the saved state, using the @page A4
// rules the report template already established. It never triggers a
// generation: exporting is not the moment to change what the document says.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  Pencil,
  Printer,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { CvDocumentView } from "@/components/professional-identity/CvDocumentView";
import { L, Lf, Lp, type Lang } from "@/components/professional-identity/copy";
import {
  CV,
  CV_COUNTED,
  CV_DRIFT_SECTION,
  CV_STATUS_NOTE,
} from "@/components/professional-identity/cv-copy";
import { useT } from "@/i18n/context";
import {
  deleteMyCv,
  editMyCv,
  getMyCv,
  refreshMyCvFromProfile,
  saveCvDraft,
} from "@/lib/professional-identity/cv/cv-store.functions";
import { generateMyCv } from "@/lib/professional-identity/cv/cv.functions";
import { buildSavedCvDocument, storedFromAiPresentation } from "@/lib/professional-identity/cv/stored";

export const Route = createFileRoute("/_authenticated/my-career/cv/$cvId")({
  ssr: false,
  head: () => ({
    meta: [{ title: "CV — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CvDetailPage,
});

type SaveState = "idle" | "saving" | "saved" | "failed";

function CvDetailPage() {
  const { lang } = useT();
  const l = lang as Lang;
  const { cvId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const load = useServerFn(getMyCv);
  const cv = useQuery({
    queryKey: ["cv", "detail", cvId],
    queryFn: () => load({ data: { cvId } }),
    staleTime: 10_000,
  });

  /* -- editing state ------------------------------------------------- */
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [bullets, setBullets] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Seed the form from the saved row once it arrives, and again whenever the
  // server's copy changes underneath us (an update-from-profile, say).
  // Deliberately NOT while the person is mid-edit: refetching must never
  // overwrite text somebody is still typing.
  const savedAt = cv.data?.updatedAt;
  useEffect(() => {
    if (!cv.data || editing) return;
    setTitle(cv.data.title);
    setHeadline(cv.data.presentation.headline);
    setSummary(cv.data.presentation.summary);
    setBullets(
      Object.fromEntries(
        cv.data.presentation.experience.map((e) => [e.sourceId, e.bullets.join("\n")]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAt, editing]);

  const dirty = useMemo(() => {
    if (!cv.data) return false;
    if (title !== cv.data.title) return true;
    if (headline !== cv.data.presentation.headline) return true;
    if (summary !== cv.data.presentation.summary) return true;
    return cv.data.presentation.experience.some(
      (e) => (bullets[e.sourceId] ?? "") !== e.bullets.join("\n"),
    );
  }, [cv.data, title, headline, summary, bullets]);

  const edit = useServerFn(editMyCv);
  const saveEdits = useMutation({
    mutationFn: () =>
      edit({
        data: {
          cvId,
          title,
          headline,
          summary,
          bullets: Object.entries(bullets).map(([sourceId, text]) => ({
            sourceId,
            // A blank line is a paragraph break somebody typed, not a
            // bullet. Empty entries are dropped rather than saved as blanks.
            bullets: text
              .split("\n")
              .map((b) => b.trim())
              .filter((b) => b.length > 0),
          })),
        },
      }),
    onMutate: () => setSaveState("saving"),
    onSuccess: async () => {
      setSaveState("saved");
      await queryClient.invalidateQueries({ queryKey: ["cv", "detail", cvId] });
      await queryClient.invalidateQueries({ queryKey: ["cv", "list"] });
    },
    onError: () => setSaveState("failed"),
  });

  /* -- regeneration: propose, never overwrite ------------------------ */
  const generate = useServerFn(generateMyCv);
  const propose = useMutation({
    mutationFn: () =>
      generate({
        data: {
          purpose: cv.data?.purpose ?? "general",
          targetJobText: cv.data?.bundle.targetJobText ?? null,
          includeCareerInsight: (cv.data?.bundle.careerInsight ?? null) !== null,
          locale: cv.data?.locale ?? l,
        },
      }),
  });

  const save = useServerFn(saveCvDraft);
  const acceptProposal = useMutation({
    mutationFn: () =>
      save({
        data: {
          cvId,
          title,
          purpose: cv.data?.purpose ?? "general",
          targetJobText: cv.data?.bundle.targetJobText ?? null,
          includeCareerInsight: (cv.data?.bundle.careerInsight ?? null) !== null,
          locale: cv.data?.locale ?? l,
          presentation: propose.data?.presentation ?? null,
          providerMode: propose.data?.providerMode ?? null,
          modelId: propose.data?.model ?? null,
        },
      }),
    onSuccess: async (result) => {
      if (result.violations.length > 0) return;
      propose.reset();
      await queryClient.invalidateQueries({ queryKey: ["cv", "detail", cvId] });
    },
  });

  /* -- update from profile ------------------------------------------- */
  const refresh = useServerFn(refreshMyCvFromProfile);
  const updateFromProfile = useMutation({
    mutationFn: () => refresh({ data: { cvId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cv", "detail", cvId] });
    },
  });

  /* -- delete --------------------------------------------------------- */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useServerFn(deleteMyCv);
  const destroy = useMutation({
    mutationFn: () => remove({ data: { cvId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cv", "list"] });
      void navigate({ to: "/my-career/cv" });
    },
  });

  /* -- what to render -------------------------------------------------- */

  // The proposal is rendered from the SAME builder the saved document uses,
  // so a suggestion and the thing it would become cannot look different for
  // any reason other than the words.
  const proposalDocument =
    propose.data?.presentation && cv.data
      ? buildSavedCvDocument(cv.data.bundle, storedFromAiPresentation(propose.data.presentation))
      : null;

  const proposalRejected = (acceptProposal.data?.violations.length ?? 0) > 0;
  const drift = cv.data?.profileDrift;

  return (
    <SiteLayout>
      <Container className="py-10 md:py-14">
        <Link
          to="/my-career/cv"
          className="no-print inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {L(CV.backToList, l)}
        </Link>

        {cv.isPending && <p className="mt-8 text-sm text-muted-foreground">{L(CV.loading, l)}</p>}
        {cv.isError && (
          <p role="alert" className="mt-8 text-sm text-destructive">
            {L(CV.loadFailed, l)}
          </p>
        )}

        {cv.data && (
          <>
            <div className="no-print mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1
                  className="truncate text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {cv.data.title}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {L(
                    cv.data.purpose === "targeted"
                      ? CV.purposeTargetedLabel
                      : CV.purposeGeneralLabel,
                    l,
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  {L(CV.print, l)}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  {L(editing ? CV.editDone : CV.editPresentation, l)}
                </button>
              </div>
            </div>

            {/* -- the profile has moved -------------------------------- */}
            {drift?.hasChanges && (
              <section className="no-print mt-6 rounded-xl border border-border border-l-[3px] border-l-[color:var(--accent)] bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground">{L(CV.driftTitle, l)}</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {L(CV.driftBody, l)}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {drift.changes.slice(0, 6).map((change, i) => (
                    <li key={`${change.section}-${change.sourceId ?? i}`}>
                      <span className="font-medium text-foreground">
                        {L(
                          change.kind === "added"
                            ? CV.driftAdded
                            : change.kind === "removed"
                              ? CV.driftRemoved
                              : CV.driftChanged,
                          l,
                        )}
                      </span>{" "}
                      · {L(CV_DRIFT_SECTION[change.section], l)} · {change.label}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={updateFromProfile.isPending}
                  onClick={() => updateFromProfile.mutate()}
                  className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)] disabled:opacity-60"
                >
                  {updateFromProfile.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {L(updateFromProfile.isPending ? CV.driftUpdating : CV.driftAction, l)}
                </button>
              </section>
            )}

            {(updateFromProfile.data?.droppedIds.length ?? 0) > 0 && (
              <p role="status" className="no-print mt-4 text-sm text-muted-foreground">
                {Lp(CV_COUNTED.dropped, l, updateFromProfile.data!.droppedIds.length)}
              </p>
            )}

            {/* -- edit mode ------------------------------------------- */}
            {editing && (
              <section className="no-print mt-6 rounded-xl border border-border bg-card p-5 md:p-6">
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {L(CV.editHelp, l)}
                </p>
                <Link
                  to="/my-career/profile"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {L(CV.editInProfile, l)}
                </Link>

                <div className="mt-5 space-y-5">
                  <div>
                    <label htmlFor="cv-title-edit" className="text-sm font-medium text-foreground">
                      {L(CV.nameLabel, l)}
                    </label>
                    <input
                      id="cv-title-edit"
                      type="text"
                      maxLength={200}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="mt-1.5 block w-full max-w-md rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  <div>
                    <label htmlFor="cv-headline" className="text-sm font-medium text-foreground">
                      {L(CV.editHeadline, l)}
                    </label>
                    <input
                      id="cv-headline"
                      type="text"
                      maxLength={160}
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      className="mt-1.5 block w-full max-w-md rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  <div>
                    <label htmlFor="cv-summary" className="text-sm font-medium text-foreground">
                      {L(CV.editSummary, l)}
                    </label>
                    <textarea
                      id="cv-summary"
                      rows={5}
                      maxLength={4000}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      className="mt-1.5 block w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  {/* Every employment: the FACT is locked, the wording is
                      not. The lock is the whole editing contract, made
                      visible rather than merely enforced. */}
                  {cv.data.document.experience.map((entry) => (
                    <div key={entry.fact.id} className="rounded-lg border border-border p-4">
                      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                        <Lock
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span>
                          {entry.fact.roleTitle} · {entry.fact.employerName}
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            {L(CV.factLocked, l)}
                          </span>
                        </span>
                      </p>
                      <label
                        htmlFor={`bullets-${entry.fact.id}`}
                        className="mt-3 block text-xs font-medium text-muted-foreground"
                      >
                        {L(CV.editBullets, l)}
                      </label>
                      <textarea
                        id={`bullets-${entry.fact.id}`}
                        rows={3}
                        value={bullets[entry.fact.id] ?? ""}
                        onChange={(e) =>
                          setBullets((b) => ({ ...b, [entry.fact.id]: e.target.value }))
                        }
                        className="mt-1.5 block w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <PrimaryButton
                    type="button"
                    disabled={saveEdits.isPending || !dirty}
                    onClick={() => saveEdits.mutate()}
                    className="gap-1.5"
                  >
                    {saveEdits.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    )}
                    {L(saveEdits.isPending ? CV.saving : CV.save, l)}
                  </PrimaryButton>

                  {/* One status line, announced. Never silent. */}
                  <span role="status" className="text-sm">
                    {saveState === "saved" && !dirty && (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-[color:var(--accent)]" aria-hidden="true" />
                        {L(CV.saved, l)}
                      </span>
                    )}
                    {saveState === "failed" && (
                      <span className="font-semibold text-destructive">{L(CV.saveFailed, l)}</span>
                    )}
                    {dirty && saveState !== "saving" && saveState !== "failed" && (
                      <span className="text-muted-foreground">{L(CV.unsaved, l)}</span>
                    )}
                  </span>
                </div>
                {saveState === "failed" && (
                  <p className="mt-2 text-sm text-muted-foreground">{L(CV.saveFailedHelp, l)}</p>
                )}
              </section>
            )}

            {/* -- regeneration ---------------------------------------- */}
            {!editing && (
              <div className="no-print mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={propose.isPending}
                  onClick={() => propose.mutate()}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  {propose.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {L(propose.isPending ? CV.generating : CV.regenerate, l)}
                </button>

                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {L(CV.deleteCv, l)}
                  </button>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{L(CV.deleteConfirm, l)}</span>
                    <button
                      type="button"
                      disabled={destroy.isPending}
                      onClick={() => destroy.mutate()}
                      className="inline-flex min-h-9 items-center rounded-md border border-destructive/50 px-3 text-sm font-semibold text-destructive hover:bg-destructive/5"
                    >
                      {L(destroy.isPending ? CV.deleting : CV.deleteCv, l)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-9 px-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {L(CV.proposalDiscard, l)}
                    </button>
                  </span>
                )}
              </div>
            )}

            {propose.data && propose.data.status !== "succeeded" && (
              <div
                role="status"
                className="no-print mt-5 flex gap-2.5 rounded-lg border border-border bg-secondary/50 p-4"
              >
                {propose.data.status === "fabrication_rejected" ? (
                  <ShieldAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold)]"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <p className="text-sm leading-relaxed text-foreground">
                  {L(
                    CV_STATUS_NOTE[
                      propose.data.status === "not_ready" ? "provider_error" : propose.data.status
                    ],
                    l,
                  )}
                </p>
              </div>
            )}

            {/* -- the proposal, side by side with nothing being overwritten */}
            {proposalDocument && (
              <section className="no-print mt-6 rounded-xl border-2 border-dashed border-[color:var(--accent)]/50 bg-secondary/30 p-5 md:p-6">
                <h2 className="text-sm font-semibold text-foreground">{L(CV.proposalTitle, l)}</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {L(CV.proposalBody, l)}
                </p>

                {proposalRejected && (
                  <p
                    role="alert"
                    className="mt-4 flex gap-2.5 rounded-lg border border-border bg-card p-4 text-sm leading-relaxed text-foreground"
                  >
                    <ShieldAlert
                      className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold)]"
                      aria-hidden="true"
                    />
                    {L(CV.saveRejected, l)}
                  </p>
                )}

                <div className="mt-5">
                  <CvDocumentView document={proposalDocument} />
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <PrimaryButton
                    type="button"
                    disabled={acceptProposal.isPending}
                    onClick={() => acceptProposal.mutate()}
                    className="gap-1.5"
                  >
                    {acceptProposal.isPending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    )}
                    {L(acceptProposal.isPending ? CV.saving : CV.proposalAccept, l)}
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => propose.reset()}
                    className="min-h-10 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    {L(CV.proposalDiscard, l)}
                  </button>
                </div>
              </section>
            )}

            {/* -- the saved document ---------------------------------- */}
            {!editing && (
              <div className="mt-6">
                <p className="no-print mb-3 text-xs text-muted-foreground">
                  {L(CV.reviewNote, l)}
                </p>
                <CvDocumentView document={cv.data.document} />
              </div>
            )}
          </>
        )}
      </Container>
    </SiteLayout>
  );
}
