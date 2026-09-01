// H3.4A — on-platform ("internal") job application dialog. The only new
// candidate-facing apply surface added in this phase; external/email apply
// (ExternalApplyDialog, mailto link) are unchanged.
//
// Auth-awareness follows the exact pattern already established by
// useCareerProfileForJobs (src/hooks/useCareerProfileForJobs.ts): this is a
// public route (`/jobs/$slug`), so session state is observed client-side
// via supabase.auth.getSession()/onAuthStateChange rather than gating the
// whole route behind `_authenticated`.
//
// Security: this component only ever decides what to *show*. Every actual
// authorization/eligibility check (job published+internal, no duplicate
// active application, CV is really a PDF within the size limit, the chosen
// saved CV is this person's and is fit to send) is re-verified server-side
// by submitJobApplication() and, beneath that, by the database itself
// (job_applications_stamp_employer_id trigger +
// job_applications_active_unique_idx + sp_submit_application_with_cv_source)
// -- a client bypass of any check here still gets a safe, translated error,
// never a raw one.
//
// ── TWO CV SOURCES, ONE SUBMITTED CV ────────────────────────────────────
//
// A candidate who built a CV inside CQrityjob picks it here. They do not
// export it to PDF and upload it back into the product that already holds
// it -- which is what this dialog used to require, and the reason it was
// the pilot's clearest broken promise.
//
// The two sources are a RADIO GROUP, not a checkbox and not a silent
// preference. Whichever is selected is the one thing that gets sent, the
// screen says which, and choosing one never quietly discards a file the
// person deliberately attached: picking a saved CV while a file is
// selected is a decision they make, not one made for them.

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { submitJobApplication } from "@/lib/job-intelligence/applications.functions";
import { getApplicationPassportOffer } from "@/lib/security-passport/passport.functions";
import { listMyApplicationCvOptions } from "@/lib/professional-identity/cv/cv-store.functions";
import type { ApplicationCvOption } from "@/lib/professional-identity/cv/cv-store.functions";
import type { CvApplicationBlock } from "@/lib/professional-identity/cv/application-source";
import { formatDate } from "@/lib/job-intelligence/date-format";
import { ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

const MAX_CV_BYTES = 5 * 1024 * 1024;

const ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
  JOB_NOT_APPLICABLE: "jobs.apply.error.notApplicable",
  DUPLICATE_APPLICATION: "jobs.apply.error.duplicate",
  CV_TOO_LARGE: "jobs.apply.error.cvTooLarge",
  CV_NOT_PDF: "jobs.apply.error.cvNotPdf",
  CV_INVALID: "jobs.apply.error.cvNotPdf",
  CV_UPLOAD_FAILED: "jobs.apply.error.generic",
  // The database refused the chosen saved CV. Two distinct answers, because
  // "that CV is not yours" and "that CV is not finished" need different
  // things done about them, and neither of them is "try again".
  CV_DOCUMENT_NOT_FOUND: "jobs.apply.error.cvDocumentNotFound",
  CV_DOCUMENT_NOT_READY: "jobs.apply.error.cvDocumentNotReady",
  SUBMISSION_FAILED: "jobs.apply.error.generic",
  JOB_LOOKUP_FAILED: "jobs.apply.error.generic",
  DUPLICATE_CHECK_FAILED: "jobs.apply.error.generic",
};

const BLOCK_MESSAGE_KEY: Record<CvApplicationBlock, TranslationKey> = {
  no_name: "jobs.apply.cv.block.noName",
  no_history: "jobs.apply.cv.block.noHistory",
};

function translateSubmitError(code: string | undefined, t: (k: TranslationKey) => string): string {
  const key = (code && ERROR_MESSAGE_KEYS[code]) || "jobs.apply.error.generic";
  return t(key);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:application/pdf;base64," prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** What we know about the person's saved CVs.
 *
 *  `unavailable` is a state of its own and not an empty list, because they
 *  do not mean the same thing and only one of them is ever true. Telling
 *  somebody with three saved CVs that they have none -- and pushing them to
 *  upload one they already own -- is the failure this shape prevents. */
type CvOptionsState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly options: readonly ApplicationCvOption[] }
  | { readonly status: "unavailable" };

type CvSource = "upload" | "cqrityjob_cv";

export function ApplyInternalDialog({
  jobId,
  employerName,
  label,
}: {
  jobId: string;
  employerName: string | null;
  label: string;
}) {
  const { t, lang } = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cvSource, setCvSource] = useState<CvSource>("upload");
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [cvOptions, setCvOptions] = useState<CvOptionsState>({ status: "loading" });
  // Which source the SERVER recorded, so the confirmation describes the
  // application that exists rather than the form that was filled in.
  const [submittedSource, setSubmittedSource] = useState<CvSource>("upload");
  // Enabled by default: a candidate who has verified records almost always
  // wants the employer to see them, and the whole point is that including a
  // Passport costs no extra steps. It is a plain checkbox they can clear
  // before submitting — never a second wizard.
  const [includePassport, setIncludePassport] = useState(true);
  const [offer, setOffer] = useState<{
    hasPassport: boolean;
    hasShareableContent: boolean;
    verifiedCredentials: readonly string[];
    verifiedCredentialCount: number;
    verifiedExperienceCount: number;
  } | null>(null);
  // What the SERVER did, not what the form asked for.
  const [passportShared, setPassportShared] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitFn = useServerFn(submitJobApplication);
  const offerFn = useServerFn(getApplicationPassportOffer);
  const cvOptionsFn = useServerFn(listMyApplicationCvOptions);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSignedIn(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setSignedIn(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const usableCvs = useMemo(
    () => (cvOptions.status === "ready" ? cvOptions.options.filter((c) => c.block === null) : []),
    [cvOptions],
  );
  const blockedCvs = useMemo(
    () => (cvOptions.status === "ready" ? cvOptions.options.filter((c) => c.block !== null) : []),
    [cvOptions],
  );

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setFileError(t("jobs.apply.error.cvNotPdf"));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (f.size > MAX_CV_BYTES) {
      setFileError(t("jobs.apply.error.cvTooLarge"));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(f);
    // Attaching a file IS choosing the upload source. Leaving the selection
    // on a saved CV while a freshly picked file sat unused underneath it
    // would send the wrong document without ever saying so.
    setCvSource("upload");
  }

  /** The opening state of the CV choice, from a known list of options.
   *
   *  ONE function, used when the list first arrives and again whenever the
   *  form is reset, so a candidate who closes the dialog and opens it again
   *  meets the same starting point rather than a quietly different one.
   *
   *  §6: preselect only where there is nothing to choose between -- exactly
   *  one sendable CV, and no file attached. Everything else starts on the
   *  upload path and waits to be told. `hasFile` is passed rather than read
   *  from state because the caller knows whether it is about to clear it. */
  function defaultCvChoice(options: readonly ApplicationCvOption[], hasFile: boolean) {
    const usable = options.filter((c) => c.block === null);
    if (usable.length === 0) {
      setSelectedCvId(null);
      setCvSource("upload");
      return;
    }
    // The list is newest-first, so this is the most recently updated CV --
    // and the screen names it before anything is submitted either way.
    setSelectedCvId(usable[0].cvId);
    setCvSource(usable.length === 1 && !hasFile ? "cqrityjob_cv" : "upload");
  }

  function resetForm() {
    setPhone("");
    setCoverNote("");
    setConsent(false);
    setFile(null);
    setFileError(null);
    setSubmitError(null);
    setSuccess(false);
    if (cvOptions.status === "ready") defaultCvChoice(cvOptions.options, false);
    else {
      setCvSource("upload");
      setSelectedCvId(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Read once the dialog is actually open: the apply button on a job page
  // must not query a signed-out visitor's Passport.
  useEffect(() => {
    if (!open || offer !== null) return;
    let alive = true;
    void offerFn({ data: undefined })
      .then((o) => {
        if (alive) setOffer(o);
      })
      .catch((err: unknown) => {
        // A Passport read must never block applying. The panel falls back to
        // "nothing to include" and the submission proceeds without one.
        console.error("[jobs] passport offer read failed", err);
        if (alive)
          setOffer({
            hasPassport: false,
            hasShareableContent: false,
            verifiedCredentials: [],
            verifiedCredentialCount: 0,
            verifiedExperienceCount: 0,
          });
      });
    return () => {
      alive = false;
    };
  }, [open, offer, offerFn]);

  // The saved CVs, read on the same terms: only once the dialog is open, and
  // a failure NEVER becomes "you have no CV". The upload path stays open
  // whatever this returns, so a broken read costs a convenience and not an
  // application.
  useEffect(() => {
    if (!open || cvOptions.status !== "loading") return;
    let alive = true;
    void cvOptionsFn({ data: undefined })
      .then((rows) => {
        if (!alive) return;
        setCvOptions({ status: "ready", options: rows });
        defaultCvChoice(rows, file !== null);
      })
      .catch((err: unknown) => {
        console.error("[jobs] saved CV list read failed", err);
        if (alive) setCvOptions({ status: "unavailable" });
      });
    return () => {
      alive = false;
    };
    // `file` is read for the default decision only; re-running this on every
    // file change would re-fetch the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cvOptions.status, cvOptionsFn]);

  const canSubmit = consent && (cvSource === "upload" ? file !== null : selectedCvId !== null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (cvSource === "upload" && !file) {
      setFileError(t("jobs.apply.error.cvRequired"));
      return;
    }
    if (cvSource === "cqrityjob_cv" && !selectedCvId) {
      setSubmitError(t("jobs.apply.error.cvSourceRequired"));
      return;
    }
    if (!consent) return;
    setSubmitting(true);
    try {
      const base = {
        jobId,
        phone: phone.trim() || null,
        coverNote: coverNote.trim() || null,
        consent: true as const,
        // Only ever true when the candidate left it on AND has something
        // verified: the confirmation must not be able to overstate.
        includePassport: includePassport && (offer?.hasShareableContent ?? false),
      };
      const res = await submitFn({
        data:
          cvSource === "upload"
            ? {
                ...base,
                cvSource: "upload" as const,
                cvFilename: file!.name,
                cvBase64: await fileToBase64(file!),
              }
            : { ...base, cvSource: "cqrityjob_cv" as const, cvDocumentId: selectedCvId! },
      });
      setPassportShared(res.passportShared);
      setSubmittedSource(res.cvSource);
      setSuccess(true);
    } catch (err) {
      setSubmitError(translateSubmitError(err instanceof Error ? err.message : undefined, t));
    } finally {
      setSubmitting(false);
    }
  }

  if (signedIn === null) {
    return <div className="h-10 animate-pulse rounded-md bg-muted/40" />;
  }

  if (!signedIn) {
    const redirect = typeof window !== "undefined" ? window.location.pathname : "";
    return (
      <div className="space-y-2">
        <Button asChild className="w-full">
          <a href={`/login?redirect=${encodeURIComponent(redirect)}`}>
            {t("jobs.apply.signInToApply")}
          </a>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("jobs.apply.signInToApplyHint")}
        </p>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full">{label}</Button>
      </DialogTrigger>
      {/* The base DialogContent scrolls as ONE box. This form is the longest
          surface in the product -- phone, note, CV, the Passport panel and
          consent -- so it opts into the stronger pattern instead: the dialog
          itself never scrolls (overflow-y-hidden overrides the base
          overflow-y-auto), the FIELDS scroll, and the header and the submit
          button stay put. On a 375x667 phone that is the difference between
          a reachable submit button and a form that cannot be completed. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-hidden">
        {success ? (
          <div className="flex min-h-0 flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>{t("jobs.apply.success.title")}</DialogTitle>
              <DialogDescription>{t("jobs.apply.success.body")}</DialogDescription>
            </DialogHeader>
            {/* Which CV went, read from the row the server created. */}
            <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
              <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {submittedSource === "cqrityjob_cv"
                ? t("jobs.apply.success.cvCqrityjob")
                : t("jobs.apply.success.cvUpload")}
            </p>
            {/* Read from what the server actually did. A candidate who asked
                to include a Passport but had nothing verified is told the
                truth, not a success message the database did not earn. */}
            <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
              {passportShared ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : null}
              {passportShared
                ? t("jobs.apply.passport.sharedConfirm")
                : t("jobs.apply.passport.notSharedConfirm")}
            </p>
            <DialogFooter className="mt-4 shrink-0">
              <Button type="button" onClick={() => setOpen(false)}>
                {t("jobs.apply.success.close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // min-h-0 is what actually makes the scroll work: without it the
          // flex item's automatic minimum size is its CONTENT height, so the
          // form refuses to shrink and the overflow never engages.
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>{t("jobs.apply.dialog.title")}</DialogTitle>
              <DialogDescription>
                {employerName
                  ? t("jobs.apply.dialog.body").replace("{employer}", employerName)
                  : t("jobs.apply.dialog.bodyGeneric")}
              </DialogDescription>
            </DialogHeader>

            {/* The ONE scroll container. Nothing inside it scrolls
                independently, so there is no nested trap. */}
            <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div>
                <Label htmlFor="apply-phone">{t("jobs.apply.field.phone")}</Label>
                <Input
                  id="apply-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={40}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="apply-cover-note">{t("jobs.apply.field.coverNote")}</Label>
                <Textarea
                  id="apply-cover-note"
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  className="mt-1"
                />
              </div>

              {/* ── WHICH CV ──────────────────────────────────────────────
                  A fieldset, because these are two options for one decision
                  and a screen reader has to hear them that way. The legend
                  is the question; the radios are the answers; the selected
                  branch is the only one that expands. */}
              <fieldset className="rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium text-foreground">
                  {t("jobs.apply.cv.legend")}
                </legend>

                {cvOptions.status === "loading" ? (
                  <p className="mt-1 text-sm text-muted-foreground">{t("jobs.apply.cv.loading")}</p>
                ) : null}

                {/* Unknown is not none. A read that failed says so, and the
                    upload path below stays exactly where it was. */}
                {cvOptions.status === "unavailable" ? (
                  <p role="status" className="mt-1 text-sm text-muted-foreground">
                    {t("jobs.apply.cv.unavailable")}
                  </p>
                ) : null}

                {usableCvs.length > 0 ? (
                  <div className="mt-1">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="apply-cv-source"
                        value="cqrityjob_cv"
                        checked={cvSource === "cqrityjob_cv"}
                        onChange={() => setCvSource("cqrityjob_cv")}
                        className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                        aria-describedby="apply-cv-cqrityjob-detail"
                      />
                      <span className="font-medium text-foreground">
                        {t("jobs.apply.cv.source.cqrityjob")}
                      </span>
                    </label>

                    <div id="apply-cv-cqrityjob-detail" className="mt-2 pl-6">
                      {usableCvs.length === 1 ? (
                        // Exactly one, so there is nothing to choose between
                        // -- but the person still SEES what will be sent.
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {usableCvs[0].title || t("jobs.apply.cv.untitled")}
                          </span>{" "}
                          ·{" "}
                          {t("jobs.apply.cv.updated").replace(
                            "{date}",
                            formatDate(usableCvs[0].updatedAt, lang),
                          )}
                        </p>
                      ) : (
                        <>
                          <Label
                            htmlFor="apply-cv-choose"
                            className="text-xs text-muted-foreground"
                          >
                            {t("jobs.apply.cv.choose")}
                          </Label>
                          <select
                            id="apply-cv-choose"
                            value={selectedCvId ?? ""}
                            onChange={(e) => {
                              setSelectedCvId(e.target.value || null);
                              setCvSource("cqrityjob_cv");
                            }}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {usableCvs.map((c) => (
                              <option key={c.cvId} value={c.cvId}>
                                {(c.title || t("jobs.apply.cv.untitled")) +
                                  " · " +
                                  t("jobs.apply.cv.updated").replace(
                                    "{date}",
                                    formatDate(c.updatedAt, lang),
                                  )}
                              </option>
                            ))}
                          </select>
                        </>
                      )}

                      {/* Selecting a CV is a disclosure. It is named as one,
                          next to the control that makes it, and not buried in
                          the consent line further down. */}
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {employerName
                          ? t("jobs.apply.cv.shared").replace("{employer}", employerName)
                          : t("jobs.apply.cv.sharedGeneric")}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* A saved CV that cannot be sent is NAMED, with the reason
                    and a way to fix it. Silently hiding it would leave
                    somebody staring at "you have no CV" with a CV open in
                    the next tab. */}
                {blockedCvs.length > 0 ? (
                  <div className="mt-3 rounded-md border border-dashed border-border p-3">
                    <p className="text-xs font-medium text-foreground">
                      {t("jobs.apply.cv.unusableHeading")}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {blockedCvs.map((c) => (
                        <li key={c.cvId} className="text-xs text-muted-foreground">
                          {c.title || t("jobs.apply.cv.untitled")} —{" "}
                          {t(BLOCK_MESSAGE_KEY[c.block as CvApplicationBlock])}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/my-career/cv"
                      className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("jobs.apply.cv.finish")}
                    </Link>
                  </div>
                ) : null}

                {cvOptions.status === "ready" && cvOptions.options.length === 0 ? (
                  <div className="mt-1 text-sm">
                    <p className="text-muted-foreground">{t("jobs.apply.cv.none")}</p>
                    <Link
                      to="/my-career/cv"
                      className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("jobs.apply.cv.create")}
                    </Link>
                  </div>
                ) : null}

                {/* ── UPLOAD ─────────────────────────────────────────────
                    Always present, always available, unchanged. A candidate
                    with an external CV, a CV in another format, or simply a
                    preference is never forced onto the platform document. */}
                <div className={usableCvs.length > 0 ? "mt-4 border-t border-border pt-3" : "mt-1"}>
                  {usableCvs.length > 0 ? (
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="apply-cv-source"
                        value="upload"
                        checked={cvSource === "upload"}
                        onChange={() => setCvSource("upload")}
                        className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                        aria-describedby="apply-cv-upload-detail"
                      />
                      <span className="font-medium text-foreground">
                        {t("jobs.apply.cv.source.upload")}
                      </span>
                    </label>
                  ) : (
                    <Label htmlFor="apply-cv">{t("jobs.apply.field.cv")}</Label>
                  )}

                  <div
                    id="apply-cv-upload-detail"
                    className={usableCvs.length > 0 ? "mt-2 pl-6" : "mt-1"}
                  >
                    <Input
                      id="apply-cv"
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={onFileChange}
                    />
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("jobs.apply.field.cvHint")}
                    </p>
                    {fileError && (
                      <p role="alert" className="mt-1 text-xs text-destructive">
                        {fileError}
                      </p>
                    )}
                  </div>
                </div>
              </fieldset>

              {/* ── Ta med mitt verifierade Security Passport ──────────────
                  The last thing before consent, because it is part of the
                  same decision: pressing Skicka ansökan IS the holder's
                  authorisation for whatever is enabled here. No modal, no
                  package chooser — the package is fixed and the panel says
                  what it contains. */}
              {offer ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  {offer.hasShareableContent ? (
                    <>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={includePassport}
                          onCheckedChange={(v) => setIncludePassport(v === true)}
                          className="mt-0.5"
                          aria-describedby="apply-passport-detail"
                        />
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {t("jobs.apply.passport.title")}
                        </span>
                      </label>

                      <div id="apply-passport-detail" className="mt-2 pl-6">
                        <p className="text-sm text-muted-foreground">
                          {t("jobs.apply.passport.lede")}
                        </p>

                        <p className="mt-2 text-sm text-foreground">
                          {t("jobs.apply.passport.includes")}:{" "}
                          <span className="tabular-nums">{offer.verifiedCredentialCount}</span>{" "}
                          {t("jobs.apply.passport.credentialsCount")}
                          {offer.verifiedExperienceCount > 0 ? (
                            <>
                              {", "}
                              <span className="tabular-nums">
                                {offer.verifiedExperienceCount}
                              </span>{" "}
                              {t("jobs.apply.passport.experienceCount")}
                            </>
                          ) : null}
                        </p>

                        {offer.verifiedCredentials.length > 0 ? (
                          <ul className="mt-1 space-y-0.5">
                            {offer.verifiedCredentials.map((title) => (
                              <li key={title} className="text-sm text-muted-foreground">
                                · {title}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          <span className="font-medium">{t("jobs.apply.passport.excludes")}:</span>{" "}
                          {t("jobs.apply.passport.exc")}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {t("jobs.apply.passport.scope")}
                        </p>
                      </div>
                    </>
                  ) : (
                    /* Nothing verified, or no Passport at all. The application
                       must still work, so this is a calm statement and a link
                       — never a disabled control that looks broken. */
                    <div className="text-sm">
                      <p className="text-muted-foreground">
                        {offer.hasPassport
                          ? t("jobs.apply.passport.nothing")
                          : t("jobs.apply.passport.noPassport")}
                      </p>
                      <Link
                        to="/passport"
                        className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {t("jobs.apply.passport.openPassport")}
                      </Link>
                    </div>
                  )}
                </div>
              ) : null}

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                />
                <span>{t("jobs.apply.field.consent")}</span>
              </label>

              {submitError && (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              )}
            </div>

            <DialogFooter className="mt-4 shrink-0 border-t border-border pt-4">
              <Button
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full justify-center sm:w-auto"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  t("jobs.apply.dialog.submit")
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
