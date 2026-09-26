// The CV — what have I done?
//
// -- TWO HALVES, ONE SURFACE --------------------------------------------
//
// A candidate's information lives on three surfaces: the Profile (who am I
// now), the CV (what have I done) and the Security Passport (which
// credentials can I document and share). This page is the second, whole:
//
//   CV documents   the saved CVs -- read, reword, export, send
//   CV content     the employment, education, languages and skills every
//                  one of those documents is built from
//
// The content editors stood on the Profile page, below a person's name
// and title, which is what made "where do I add a job" a question with no
// obvious answer. They are the SAME components writing the SAME rows --
// EmploymentHistoryEditor over sp_experience_periods and
// GeneralProfileClaims over sp_claims -- mounted where the thing they fill
// is. No new editor, no new server function, no second copy of a fact.
//
// -- THE LIST -----------------------------------------------------------
//
// -- IT IS A DESTINATION, NOT A GENERATOR -------------------------------
//
// Somebody who made a CV last month opens /my-career/cv expecting to find
// it. Before persistence this route was a wizard, so returning to it meant
// starting again -- which is the difference between a feature and a demo.
//
// -- RESTRAINED ON PURPOSE ---------------------------------------------
//
// Name, what kind it is, when it was last touched, and a way in. No
// folders, no tags, no search, no bulk actions, no preview thumbnails. A
// person keeps a handful of CVs; a document-management platform is a
// different product and nobody asked for one.
//
// Readiness is still checked here, so somebody with no employment history
// is told what is missing instead of being handed a button that leads to a
// refusal one screen later.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowRight, Eye, FileText, Loader2, Plus, RefreshCcw, Sparkles } from "lucide-react";
import { EmploymentHistoryEditor } from "@/components/professional-identity/EmploymentHistoryEditor";
import { GeneralProfileClaims } from "@/components/professional-identity/GeneralProfileClaims";
import type {
  CvContentEditorHandle,
  CvContentEditorState,
  CvContentFlushResult,
} from "@/components/professional-identity/cv-content-editor";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { ScrollToHashOnceReady } from "@/components/security-passport/ScrollToHashOnceReady";
import { sectionLinkTarget } from "@/lib/professional-identity/profile-destinations";
import type { CompletenessSection } from "@/lib/professional-identity/completeness";
import type { CvRequiredField } from "@/lib/professional-identity/cv/readiness";
import { Container } from "@/components/site/Container";
import { L, Lf, type Lang } from "@/components/professional-identity/copy";
import { CV, CV_MISSING_FIELD } from "@/components/professional-identity/cv-copy";
import { useT } from "@/i18n/context";
import { listMyCvs } from "@/lib/professional-identity/cv/cv-store.functions";
import { prepareMyCv } from "@/lib/professional-identity/cv/cv.functions";

export const Route = createFileRoute("/_authenticated/my-career/cv/")({
  ssr: false,
  head: () => ({
    meta: [{ title: "CV — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CvListPage,
});

/**
 * A date somebody reads, in their own language.
 *
 * ── WHY IT CARRIES THE TIME NOW ────────────────────────────────────────
 *
 * It used to print the day alone, on the reasoning that a timestamp to the
 * second is precision nobody asked for. That is true of seconds and it was
 * wrong about the hour: this list identifies a document by its NAME and its
 * date, and two CVs a person made in one afternoon -- a general one and a
 * tailored one they forgot to rename -- were then two identical rows. The
 * only way to tell which was which was to open both.
 *
 * A row in a list of documents has to be distinguishable from the other rows
 * by something honest. The minute is the smallest thing that does it.
 */
function readableDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Where each missing readiness field is actually filled in -- resolved from
 *  the one destination contract, so "a stated profession" lands on the
 *  Profile's field and "an employment" lands on the editor further down this
 *  page. It used to be one "Complete profile" button for all four. */
const MISSING_FIELD_SECTION: Readonly<Record<CvRequiredField, CompletenessSection>> = {
  displayName: "identity",
  professionalIdentity: "identity",
  location: "location",
  professionalHistory: "employment",
};

/** The in-page links over the CV content. Anchors come from the contract
 *  where the contract names them; the order is the order on the page. */
const CONTENT_NAV: readonly { section: CompletenessSection; label: keyof typeof CV }[] = [
  { section: "employment", label: "navEmployment" },
  { section: "education", label: "navEducation" },
  { section: "languages", label: "navLanguages" },
  { section: "skills", label: "navSkills" },
];

const QUIET_LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Why "Show my CV" stopped short of navigating. Each one is a sentence on
 *  screen with something the person can do about it; none is silent. */
class ShowMyCvRefusal extends Error {
  constructor(readonly reason: Exclude<CvContentFlushResult, "saved"> | "not_ready") {
    super(reason);
  }
}

const IDLE_EDITOR: CvContentEditorState = { open: false, busy: false };

function CvListPage() {
  const { lang } = useT();
  const l = lang as Lang;
  const navigate = useNavigate();

  const prepare = useServerFn(prepareMyCv);
  const preparation = useQuery({
    queryKey: ["cv", "prepare"],
    queryFn: () => prepare(),
    staleTime: 60_000,
  });

  const load = useServerFn(listMyCvs);
  const list = useQuery({
    queryKey: ["cv", "list"],
    queryFn: () => load(),
    staleTime: 15_000,
  });

  // A saved employment changes whether a CV can be built and what My Career
  // says about this person. The editors own no cache, so this page names the
  // reads their writes made stale.
  const queryClient = useQueryClient();
  const contentChanged = () => {
    for (const queryKey of [["cv", "prepare"], ["professional-identity"]]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const readiness = preparation.data?.readiness;
  const cvs = list.data ?? [];

  /* ── "SHOW MY CV", AT THE BOTTOM OF THE EDITORS ────────────────────────
     A person who has just typed an employment into the form at the foot of
     this page is as far from "Open" as the page allows. This control saves
     whatever is still open in the editors -- leaving with it unsaved would
     lose it -- checks the CV can be built, and then opens the most recently
     saved CV, or the creator when there is none. Every way it can stop is a
     sentence under the button. */
  const employmentEditor = useRef<CvContentEditorHandle | null>(null);
  const claimsEditor = useRef<CvContentEditorHandle | null>(null);
  const [employmentState, setEmploymentState] = useState<CvContentEditorState>(IDLE_EDITOR);
  const [claimsState, setClaimsState] = useState<CvContentEditorState>(IDLE_EDITOR);
  const editorBusy = employmentState.busy || claimsState.busy;
  const [showPhase, setShowPhase] = useState<"saving" | "opening">("saving");

  const showMyCv = useMutation({
    mutationFn: async () => {
      setShowPhase("saving");
      for (const editor of [employmentEditor, claimsEditor]) {
        const result = (await editor.current?.flush()) ?? "saved";
        if (result !== "saved") throw new ShowMyCvRefusal(result);
      }
      setShowPhase("opening");
      // Readiness and the list are read AFTER the save, from the server:
      // the employment just written is what may have made the CV possible.
      const prepared = await queryClient.fetchQuery({
        queryKey: ["cv", "prepare"],
        queryFn: () => prepare(),
        staleTime: 0,
      });
      if (prepared.readiness.state !== "ready") throw new ShowMyCvRefusal("not_ready");
      const saved = await queryClient.fetchQuery({
        queryKey: ["cv", "list"],
        queryFn: () => load(),
        staleTime: 0,
      });
      const latest = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      return latest ? latest.cvId : null;
    },
    onSuccess: (cvId) => {
      void (cvId
        ? navigate({ to: "/my-career/cv/$cvId", params: { cvId } })
        : navigate({ to: "/my-career/cv/new" }));
    },
  });
  const showMyCvError = showMyCv.error
    ? showMyCv.error instanceof ShowMyCvRefusal
      ? showMyCv.error.reason === "invalid"
        ? CV.showMyCvInvalid
        : showMyCv.error.reason === "failed"
          ? CV.showMyCvSaveFailed
          : CV.showMyCvNotReady
      : CV.showMyCvOpenFailed
    : null;

  return (
    <>
      <Container className="py-8 md:py-12">
        <ScrollToHashOnceReady />
        {/* No back-link to Översikt. The CV is a primary destination in the
            candidate navigation now (images 1 and 2), reached directly from
            the nav bar rather than only from the Overview tile — so a back
            arrow to a SIBLING destination is wrong twice over: the reader
            usually did not come from there, and it presents one destination
            as subordinate to another. The navigation is the way between
            destinations; the CV's own children still link back to this list.

            It also read "Min karriär", which names the WORKSPACE in the
            account menu's context switch and not the Översikt page — the
            one-place-two-names defect the navigation canon removed. */}
        <h1
          className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {L(CV.title, l)}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {L(CV.lede, l)}
        </p>

        {/* In-page links, never tabs: both halves stay in the document, so a
            deep link to #cv-employment always has something to land on. */}
        <nav aria-label={L(CV.navLabel, l)} className="mt-5 overflow-x-auto" data-cv-page-nav>
          <ul className="flex min-w-max items-center gap-1 border-b border-border">
            <li>
              <a href="#cv-documents" className={`${QUIET_LINK} px-3 text-foreground`}>
                {L(CV.documentsHeading, l)}
              </a>
            </li>
            {CONTENT_NAV.map(({ section, label }) => (
              <li key={section}>
                <a
                  href={`#${sectionLinkTarget(section).hash}`}
                  data-section-link={section}
                  className={`${QUIET_LINK} px-3`}
                >
                  {L(CV[label] as typeof CV.title, l)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section
          id="cv-documents"
          aria-labelledby="cv-documents-heading"
          className="mt-8 scroll-mt-24"
          data-cv-documents
        >
          <h2
            id="cv-documents-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            {L(CV.documentsHeading, l)}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{L(CV.documentsLede, l)}</p>

          {(preparation.isPending || list.isPending) && (
            <p className="mt-5 text-sm text-muted-foreground">{L(CV.loading, l)}</p>
          )}
          {(preparation.isError || list.isError) && (
            <div className="mt-5 max-w-2xl">
              <p role="alert" className="text-sm text-destructive">
                {L(CV.loadFailed, l)}
              </p>
              {/* A RETRY, NOT "RELOAD THE PAGE".
                
                "Reload to try again" is a dead end dressed as advice: it is
                what somebody would have tried anyway, it throws away
                everything else on the screen, and on the one page where a
                person keeps documents they have written it reads as though
                the product does not know what went wrong. Refetching the
                queries that failed is the actual repair, and it leaves the
                rest of the page alone. */}
              <button
                type="button"
                disabled={preparation.isFetching || list.isFetching}
                onClick={() => {
                  if (preparation.isError) void preparation.refetch();
                  if (list.isError) void list.refetch();
                }}
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
              >
                {preparation.isFetching || list.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {L(preparation.isFetching || list.isFetching ? CV.retrying : CV.retry, l)}
              </button>
            </div>
          )}

          {/* Not ready: say what is missing rather than offering a button
            that leads to a refusal. */}
          {readiness && readiness.state === "needs_information" && (
            <div
              className="mt-5 max-w-2xl rounded-xl border border-border bg-card p-6"
              data-cv-not-ready
            >
              <p className="text-sm font-medium text-foreground">{L(CV.notReadyTitle, l)}</p>
              {/* Each missing thing is a link to the place that fills it. */}
              <ul className="mt-3 space-y-1">
                {readiness.missingFields.map((field) => {
                  const target = sectionLinkTarget(MISSING_FIELD_SECTION[field]);
                  return (
                    <li key={field}>
                      <Link
                        to={target.to}
                        search={target.search}
                        hash={target.hash}
                        data-cv-missing={field}
                        className={QUIET_LINK}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        {L(CV_MISSING_FIELD[field], l)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {readiness?.state === "ready" && cvs.length === 0 && !list.isPending && (
            <div className="mt-5 max-w-2xl rounded-xl border border-border bg-card p-6 md:p-8">
              <FileText className="h-5 w-5 text-accent" aria-hidden="true" />
              <h2 className="mt-4 text-base font-semibold text-foreground">
                {L(CV.listEmptyTitle, l)}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {L(CV.listEmptyBody, l)}
              </p>
              <Link
                to="/my-career/cv/new"
                className="mt-6 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
              >
                {L(CV.createFirst, l)}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}

          {readiness?.state === "ready" && cvs.length > 0 && (
            <>
              <ul className="mt-5 max-w-3xl divide-y divide-border rounded-xl border border-border bg-card">
                {cvs.map((cv) => (
                  <li
                    key={cv.cvId}
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 md:p-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{cv.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {L(
                            cv.purpose === "targeted"
                              ? CV.purposeTargetedLabel
                              : CV.purposeGeneralLabel,
                            l,
                          )}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{Lf(CV.updatedAt, l, readableDate(cv.updatedAt, l))}</span>
                        {cv.origin === "ai_assisted" && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Sparkles className="h-3 w-3" aria-hidden="true" />
                              {L(CV.aiAssistedLabel, l)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <Link
                      to="/my-career/cv/$cvId"
                      params={{ cvId: cv.cvId }}
                      className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-border bg-background px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      {L(CV.open, l)}
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                to="/my-career/cv/new"
                className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {L(CV.createNew, l)}
              </Link>
            </>
          )}
        </section>

        {/* ── CV CONTENT ────────────────────────────────────────────────
            The canonical editors, unchanged: same components, same server
            functions, same rows. Saving one refreshes the readiness read
            above, so "at least one employment" retires the moment there is
            one. */}
        <section
          aria-labelledby="cv-content-heading"
          className="mt-12 border-t border-border pt-10"
          data-cv-content
        >
          <h2
            id="cv-content-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            {L(CV.contentHeading, l)}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {L(CV.contentLede, l)}
          </p>

          <div className="mt-6 max-w-3xl space-y-4">
            <EmploymentHistoryEditor
              className="rounded-xl border border-border bg-card p-5"
              onChanged={contentChanged}
              handleRef={employmentEditor}
              onStateChange={setEmploymentState}
            />
            <GeneralProfileClaims
              onChanged={contentChanged}
              handleRef={claimsEditor}
              onStateChange={setClaimsState}
            />
          </div>

          <div
            className="mt-6 max-w-3xl rounded-xl border border-border bg-card p-5"
            data-cv-show-mine-panel
          >
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton
                type="button"
                disabled={showMyCv.isPending || editorBusy}
                onClick={() => showMyCv.mutate()}
                data-cv-show-mine
                className="gap-2"
              >
                {showMyCv.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
                {L(
                  showMyCv.isPending
                    ? showPhase === "saving"
                      ? CV.showMyCvSaving
                      : CV.showMyCvOpening
                    : CV.showMyCv,
                  l,
                )}
              </PrimaryButton>
              {/* Disabled WITH a reason: one of the editors is writing, and
                  a second write on top of it is what this control exists to
                  avoid. */}
              {editorBusy && !showMyCv.isPending && (
                <span role="status" className="text-sm text-muted-foreground">
                  {L(CV.showMyCvWait, l)}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {L(CV.showMyCvHelpList, l)}
            </p>
            {showMyCvError && (
              <p role="alert" className="mt-3 text-sm text-destructive" data-cv-show-mine-error>
                {L(showMyCvError, l)}
              </p>
            )}
          </div>

          <p className="mt-8 flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {L(CV.profileNote, l)}
            <Link to="/my-career/profile" className={QUIET_LINK} data-cta="cv-edit-profile">
              {L(CV.editProfile, l)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </section>
      </Container>
    </>
  );
}
