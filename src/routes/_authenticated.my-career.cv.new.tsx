// Creating a CV.
//
// -- THE ORDER OF OPERATIONS IS THE SAFETY MODEL ------------------------
//
//   1. READINESS, before anything else and before any provider is
//      contacted. A model cannot supply a missing employment history, and
//      asking it to try is how one gets invented. Not ready means a list of
//      what is missing and a link to fill it in -- never a generated
//      document with a warning next to it.
//
//   2. THE FACTS, shown BEFORE generation. A person is entitled to see the
//      input to a document that will carry their name.
//
//   3. THE SELECTION over those facts, made before anything is generated
//      rather than trimmed afterwards. Everything is on by default and
//      unticking removes the fact from the bundle -- so a deselected
//      employment is not in the model's input, not on the page, not in the
//      export and not in the copy an employer would receive. selection.ts
//      explains why hiding it later would not have been the same thing.
//
//   4. LANGUAGE and CONTACT DETAILS, both the person's choice. The email is
//      prefilled from the account and both switches start off: knowing
//      somebody's address is a reason to save them typing, not a reason to
//      publish it.
//
//   5. PURPOSE, chosen deliberately. A general CV never carries the pasted
//      advert, even if one was typed and then the choice was changed.
//
//   6. GENERATION, server-side. The credential lives in the server
//      environment and the adapter refuses to be constructed in a browser.
//
//   7. REVIEW, then SAVE -- in that order, and nothing is written until the
//      person presses save. Generating is not consent to keep.
//
// -- WHAT HAPPENS WHEN THE ENGINE FAILS ---------------------------------
//
// The factual CV appears, and it is savable. It is not an error state -- it
// is the CV, and it is complete: name, headline, employment, education,
// credentials, skills, languages, with the verification marks the Passport
// granted. The banner says which of the five things happened rather than
// showing one generic failure, because a rejection is a safety control
// working and should not look like an outage.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  RefreshCcw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { Container } from "@/components/site/Container";
import { PrimaryButton } from "@/components/site/PrimaryButton";
import { CvDocumentView } from "@/components/professional-identity/CvDocumentView";
import {
  CvContactFields,
  CvLanguageChoice,
  CvSelectionPicker,
  EMPTY_CV_CONTACT_FORM,
  type CvContactForm,
} from "@/components/professional-identity/CvComposer";
import { selectableIds, selectionHasHistory } from "@/lib/professional-identity/cv/selection";
import { L, Lf, type Lang } from "@/components/professional-identity/copy";
import { CV, CV_MISSING_FIELD, CV_STATUS_NOTE } from "@/components/professional-identity/cv-copy";
import { useT } from "@/i18n/context";
import { generateMyCv, prepareMyCv } from "@/lib/professional-identity/cv/cv.functions";
import { createMyCv } from "@/lib/professional-identity/cv/cv-store.functions";

export const Route = createFileRoute("/_authenticated/my-career/cv/new")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Nytt CV — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: CvNewPage,
});

const MAX_JOB_CHARS = 12_000;

function CvNewPage() {
  const { lang } = useT();
  const l = lang as Lang;
  const navigate = useNavigate();

  const [purpose, setPurpose] = useState<"general" | "targeted">("general");
  const [jobText, setJobText] = useState("");
  const [includeInsight, setIncludeInsight] = useState(false);
  const [title, setTitle] = useState("");
  /**
   * The facts to put ON this CV.
   *
   * Seeded, once the profile loads, to everything the person has -- so the
   * screen still starts with everything ticked -- and sent as an ALLOWLIST
   * that the server intersects with what they actually own. selection.ts sets
   * out why the list says what to include rather than what to remove: a
   * truncated or replayed exclusion list removes nothing and discloses
   * everything, and a truncated allowlist includes nothing and is refused.
   */
  const [includedIds, setIncludedIds] = useState<readonly string[]>([]);
  const [contact, setContact] = useState<CvContactForm>(EMPTY_CV_CONTACT_FORM);
  /** The language of the DOCUMENT, which is not the language of the
   *  interface. Seeded from the account and then owned by the person. */
  const [docLocale, setDocLocale] = useState<"sv" | "en">(l);

  const prepare = useServerFn(prepareMyCv);
  const preparation = useQuery({
    queryKey: ["cv", "prepare"],
    queryFn: () => prepare(),
    staleTime: 60_000,
  });

  /**
   * The idempotency key for the NEXT save.
   *
   * Generated once per previewed document, not once per click: a lost
   * response is answered by sending the same id again, and the database
   * returns the original cvId instead of creating a second CV. It is
   * regenerated whenever a new preview is produced, because a document built
   * from different facts is honestly a different request -- reusing the id
   * there would be refused as CV_REQUEST_CONFLICT, which is correct for a
   * retry and wrong for a person who changed their mind.
   */
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());

  /**
   * Everything that decides what the document SAYS.
   *
   * ── WHY A KEY AND NOT A useEffect ──────────────────────────────────────
   *
   * A preview is a statement about a specific set of facts, in a specific
   * language, with specific contact details. Change any of them and the
   * document on screen is about something else -- and the one thing this
   * feature cannot do is let somebody read one document and save a different
   * one. That already happened once, on the saved-CV screen, through a
   * preview rebuilt over the wrong bundle.
   *
   * So the preview records the key it was generated from, and anything that
   * changes the key marks it stale. Stale means: the document comes off the
   * screen, Save is disabled, and the person is asked for a new preview. It
   * is not silently regenerated -- that would spend a provider call on every
   * keystroke in the advert box.
   *
   * The ids are sorted so that ticking A then B and ticking B then A are the
   * same request, which they are.
   */
  const materialKey = JSON.stringify({
    purpose,
    jobText: purpose === "targeted" ? jobText.trim() : "",
    includeInsight,
    docLocale,
    includedIds: [...includedIds].sort(),
    contact,
  });
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const previewStale = previewedKey !== null && previewedKey !== materialKey;

  // Seed the fields the account can answer for, once, and then leave them
  // alone: re-seeding on every render would fight the person typing.
  // Prefilled, never pre-published -- `showEmail` stays false until ticked.
  const accountEmail = preparation.data?.accountEmail ?? null;
  const preparedLocale = preparation.data?.defaultLocale;
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !preparation.data) return;
    if (accountEmail) setContact((c) => ({ ...c, email: accountEmail }));
    if (preparedLocale) setDocLocale(preparedLocale);
    setIncludedIds(selectableIds(preparation.data.bundle));
    setSeeded(true);
  }, [seeded, preparation.data, accountEmail, preparedLocale]);

  const generate = useServerFn(generateMyCv);
  const run = useMutation({
    mutationFn: () =>
      generate({
        data: {
          purpose,
          targetJobText: purpose === "targeted" && jobText.trim() ? jobText.trim() : null,
          includeCareerInsight: includeInsight,
          locale: docLocale,
          includedIds: [...includedIds],
          contact,
        },
      }),
    onSuccess: () => {
      // This preview is now the document the save would produce, and it gets
      // its own idempotency key.
      setPreviewedKey(materialKey);
      setOperationId(crypto.randomUUID());
    },
  });

  const save = useServerFn(createMyCv);
  const persist = useMutation({
    mutationFn: () =>
      save({
        data: {
          operationId,
          title: title.trim(),
          purpose,
          targetJobText: purpose === "targeted" && jobText.trim() ? jobText.trim() : null,
          includeCareerInsight: includeInsight,
          locale: docLocale,
          includedIds: [...includedIds],
          contact,
          // Null saves the factual document. On every failure path there is
          // no validated draft to keep, and the factual CV is what the
          // person is looking at -- so that is what gets saved.
          presentation: run.data?.presentation ?? null,
          providerMode: run.data?.providerMode ?? null,
          modelId: run.data?.model ?? null,
        },
      }),
    onSuccess: (result) => {
      if (result.violations.length > 0) return;
      void navigate({ to: "/my-career/cv/$cvId", params: { cvId: result.cvId } });
    },
  });

  const bundle = preparation.data?.bundle;
  const readiness = preparation.data?.readiness;
  const outcome = previewStale ? undefined : run.data;
  const shown = outcome?.document ?? null;
  // The server refuses to save a CV with no professional history on it, and
  // `readiness.ts` explains why skills and languages do not count. Asked here
  // so the refusal is a sentence beside the checkboxes rather than an error
  // after a button somebody was allowed to press.
  const hasHistory = bundle ? selectionHasHistory(bundle, includedIds) : true;
  const rejectedOnSave = (persist.data?.violations.length ?? 0) > 0;

  return (
    <>
      <Container className="py-10 md:py-14">
        <Link
          to="/my-career/cv"
          className="no-print inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {L(CV.backToList, l)}
        </Link>

        <h1
          className="no-print mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {L(CV.createNew, l)}
        </h1>
        <p className="no-print mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {L(CV.lede, l)}
        </p>

        {preparation.isPending && (
          <p className="mt-8 text-sm text-muted-foreground">{L(CV.loading, l)}</p>
        )}
        {preparation.isError && (
          <div className="mt-8 max-w-2xl">
            <p role="alert" className="text-sm text-destructive">
              {L(CV.loadFailed, l)}
            </p>
            {/* A retry, not a reload. A reload throws away anything already
                typed on this screen; refetching the one query that failed
                does not. */}
            <button
              type="button"
              disabled={preparation.isFetching}
              onClick={() => void preparation.refetch()}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
            >
              {preparation.isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {L(preparation.isFetching ? CV.retrying : CV.retry, l)}
            </button>
          </div>
        )}

        {readiness && readiness.state === "needs_information" && (
          <div className="no-print mt-8 max-w-2xl rounded-xl border border-border bg-card p-6">
            <p className="text-sm font-medium text-foreground">{L(CV.notReadyTitle, l)}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {readiness.missingFields.map((field) => (
                <li key={field}>{L(CV_MISSING_FIELD[field], l)}</li>
              ))}
            </ul>
            <Link
              to="/my-career/profile"
              className="mt-5 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[color:var(--primary-hover)]"
            >
              {L(CV.completeProfile, l)}
            </Link>
          </div>
        )}

        {bundle && readiness?.state === "ready" && (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="no-print space-y-6">
              <section>
                <h2 className="text-sm font-semibold text-foreground">{L(CV.step1, l)}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{L(CV.step1Lede, l)}</p>
                <dl className="mt-3 space-y-1.5 rounded-lg border border-border bg-card p-4 text-sm">
                  {(
                    [
                      [CV.employment, bundle.employment.length],
                      [CV.education, bundle.education.length],
                      [CV.credentials, bundle.credentials.length],
                      [CV.skills, bundle.skills.length],
                      [CV.languages, bundle.languages.length],
                    ] as const
                  ).map(([labelCopy, count]) => (
                    <div key={labelCopy.en} className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{L(labelCopy, l)}</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {count === 0 ? L(CV.none, l) : count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* ── What goes on it ──────────────────────────────────────
                  Everything is on by default and unticking removes the fact
                  from the DOCUMENT and from the saved snapshot alike -- see
                  selection.ts for why hiding it would not have been the same
                  thing. */}
              <section>
                <h2 className="text-sm font-semibold text-foreground">{L(CV.selectTitle, l)}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {L(CV.selectLede, l)}
                </p>
                {bundle.employment.some((e) => e.endedOn) && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {L(CV.selectEndedNote, l)}
                  </p>
                )}
                <div className="mt-3 rounded-lg border border-border bg-card p-4">
                  <CvSelectionPicker
                    bundle={bundle}
                    includedIds={includedIds}
                    onChange={setIncludedIds}
                    lang={l}
                  />
                </div>
                {!hasHistory && (
                  <p role="alert" className="mt-2 text-xs font-medium text-destructive">
                    {L(CV.selectNoHistory, l)}
                  </p>
                )}
              </section>

              <section>
                <CvLanguageChoice value={docLocale} onChange={setDocLocale} lang={l} />
              </section>

              <section className="rounded-lg border border-border bg-card p-4">
                <CvContactFields
                  value={contact}
                  onChange={setContact}
                  lang={l}
                  accountEmail={accountEmail}
                  idPrefix="cv-new-contact"
                />
              </section>

              <section>
                <h2 className="text-sm font-semibold text-foreground">{L(CV.step2, l)}</h2>
                <div className="mt-3 space-y-2">
                  {(
                    [
                      ["general", CV.purposeGeneral, CV.purposeGeneralHelp],
                      ["targeted", CV.purposeTargeted, CV.purposeTargetedHelp],
                    ] as const
                  ).map(([value, titleCopy, help]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer gap-2.5 rounded-lg border border-border bg-card p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-secondary/50"
                    >
                      <input
                        type="radio"
                        name="cv-purpose"
                        value={value}
                        checked={purpose === value}
                        onChange={() => setPurpose(value)}
                        className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
                      />
                      <span>
                        <span className="block font-medium text-foreground">{L(titleCopy, l)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {L(help, l)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              {purpose === "targeted" && (
                <section>
                  <label htmlFor="cv-job" className="text-sm font-semibold text-foreground">
                    {L(CV.step3, l)}
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">{L(CV.step3Help, l)}</p>
                  <textarea
                    id="cv-job"
                    rows={7}
                    maxLength={MAX_JOB_CHARS}
                    value={jobText}
                    onChange={(e) => setJobText(e.target.value)}
                    className="mt-2 block w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                </section>
              )}

              <div>
                <label htmlFor="cv-title" className="text-sm font-semibold text-foreground">
                  {L(CV.nameLabel, l)}
                </label>
                <p className="mt-1 text-xs text-muted-foreground">{L(CV.nameHelp, l)}</p>
                <input
                  id="cv-title"
                  type="text"
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={L(
                    purpose === "targeted" ? CV.purposeTargetedLabel : CV.purposeGeneralLabel,
                    l,
                  )}
                  className="mt-2 block w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>

              {preparation.data?.hasCareerInsight && (
                <label className="flex cursor-pointer gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includeInsight}
                    onChange={(e) => setIncludeInsight(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[color:var(--accent)]"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      {L(CV.includeInsight, l)}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {L(CV.includeInsightHelp, l)}
                    </span>
                  </span>
                </label>
              )}

              {/* Said BEFORE the button, not after it. A person is entitled
                  to know that pressing this sends the entries they selected
                  to a third-party engine, and to know it while they can still
                  change what is selected. */}
              <p className="text-xs leading-relaxed text-muted-foreground">{L(CV.aiNotice, l)}</p>

              <PrimaryButton
                type="button"
                disabled={run.isPending || !hasHistory}
                onClick={() => run.mutate()}
                className="w-full justify-center gap-2"
              >
                {run.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {run.isPending
                  ? L(CV.generating, l)
                  : L(previewStale ? CV.regeneratePreview : CV.generate, l)}
              </PrimaryButton>
            </div>

            <div>
              {/* THE DOCUMENT COMES OFF THE SCREEN when it stops describing
                  what is selected. Reading one CV and saving another is the
                  single failure this whole screen exists to prevent, and it
                  is not prevented by a warning next to a still-visible
                  document. */}
              {previewStale && !run.isPending && (
                <div
                  role="status"
                  className="no-print mb-5 max-w-md rounded-lg border border-border border-l-[3px] border-l-[color:var(--accent)] bg-card p-4"
                >
                  <p className="text-sm font-medium text-foreground">
                    {L(CV.previewStaleTitle, l)}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {L(CV.previewStaleBody, l)}
                  </p>
                </div>
              )}

              {!shown && !run.isPending && !previewStale && (
                <p className="no-print max-w-md rounded-lg border border-dashed border-border p-5 text-sm leading-relaxed text-muted-foreground">
                  {L(CV.awaiting, l)}
                </p>
              )}

              {outcome && outcome.status !== "succeeded" && outcome.status !== "not_ready" && (
                <div
                  role="status"
                  className="no-print mb-5 flex gap-2.5 rounded-lg border border-border bg-secondary/50 p-4"
                >
                  {outcome.status === "fabrication_rejected" ? (
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
                    {L(CV_STATUS_NOTE[outcome.status], l)}
                  </p>
                </div>
              )}

              {outcome && outcome.quarantinedPassages.length > 0 && (
                <p className="no-print mb-5 rounded-lg border border-border bg-secondary/50 p-4 text-sm text-foreground">
                  {Lf(
                    outcome.quarantinedPassages.length === 1
                      ? {
                          sv: "{0} stycke i annonsen innehöll instruktioner till systemet i stället för information om rollen, och skickades inte vidare.",
                          en: "{0} paragraph in the advert contained instructions to the system rather than information about the role, and was not passed on.",
                        }
                      : {
                          sv: "{0} stycken i annonsen innehöll instruktioner till systemet i stället för information om rollen, och skickades inte vidare.",
                          en: "{0} paragraphs in the advert contained instructions to the system rather than information about the role, and were not passed on.",
                        },
                    l,
                    outcome.quarantinedPassages.length,
                  )}
                </p>
              )}

              {shown && (
                <>
                  <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">{L(CV.review, l)}</h2>
                      <p className="text-xs text-muted-foreground">{L(CV.reviewNote, l)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {persist.isError && (
                        <span role="alert" className="text-xs font-semibold text-destructive">
                          {L(CV.saveFailed, l)}
                        </span>
                      )}
                      {/* Save is impossible while the preview does not
                          describe the request. Disabled rather than hidden,
                          so the person can see what they are being asked to
                          do first. */}
                      <PrimaryButton
                        type="button"
                        disabled={persist.isPending || previewStale}
                        onClick={() => persist.mutate()}
                        className="gap-1.5"
                      >
                        {persist.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Save className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {persist.isPending ? L(CV.saving, l) : L(CV.save, l)}
                      </PrimaryButton>
                    </div>
                  </div>

                  {/* A refusal at the save boundary. The draft is re-checked
                      against a server-rebuilt bundle before anything is
                      written, so a stale or tampered draft is rejected here
                      as well as at generation. */}
                  {rejectedOnSave && (
                    <p
                      role="alert"
                      className="no-print mb-5 flex gap-2.5 rounded-lg border border-border bg-secondary/50 p-4 text-sm leading-relaxed text-foreground"
                    >
                      <ShieldAlert
                        className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold)]"
                        aria-hidden="true"
                      />
                      {L(CV.saveRejected, l)}
                    </p>
                  )}
                  {persist.isError && (
                    <p className="no-print mb-5 text-sm text-muted-foreground">
                      {L(CV.saveFailedHelp, l)}
                    </p>
                  )}
                  {persist.isSuccess && !rejectedOnSave && (
                    <p className="no-print mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Check
                        className="h-3.5 w-3.5 text-[color:var(--accent)]"
                        aria-hidden="true"
                      />
                      {L(CV.saved, l)}
                    </p>
                  )}

                  <CvDocumentView document={shown} />
                </>
              )}
            </div>
          </div>
        )}
      </Container>
    </>
  );
}
