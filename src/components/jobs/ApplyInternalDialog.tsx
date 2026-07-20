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
// active application, CV is really a PDF within the size limit) is
// re-verified server-side by submitJobApplication() and, beneath that, by
// the database itself (job_applications_stamp_employer_id trigger +
// job_applications_active_unique_idx) -- a client bypass of any check here
// still gets a safe, translated error, never a raw one.

import { useEffect, useRef, useState } from "react";
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

const MAX_CV_BYTES = 5 * 1024 * 1024;

const ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
  JOB_NOT_APPLICABLE: "jobs.apply.error.notApplicable",
  DUPLICATE_APPLICATION: "jobs.apply.error.duplicate",
  CV_TOO_LARGE: "jobs.apply.error.cvTooLarge",
  CV_NOT_PDF: "jobs.apply.error.cvNotPdf",
  CV_INVALID: "jobs.apply.error.cvNotPdf",
  CV_UPLOAD_FAILED: "jobs.apply.error.generic",
  SUBMISSION_FAILED: "jobs.apply.error.generic",
  JOB_LOOKUP_FAILED: "jobs.apply.error.generic",
  DUPLICATE_CHECK_FAILED: "jobs.apply.error.generic",
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

export function ApplyInternalDialog({
  jobId,
  employerName,
  label,
}: {
  jobId: string;
  employerName: string | null;
  label: string;
}) {
  const { t } = useT();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitFn = useServerFn(submitJobApplication);

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
  }

  function resetForm() {
    setPhone("");
    setCoverNote("");
    setConsent(false);
    setFile(null);
    setFileError(null);
    setSubmitError(null);
    setSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!file) {
      setFileError(t("jobs.apply.error.cvRequired"));
      return;
    }
    if (!consent) return;
    setSubmitting(true);
    try {
      const cvBase64 = await fileToBase64(file);
      await submitFn({
        data: {
          jobId,
          phone: phone.trim() || null,
          coverNote: coverNote.trim() || null,
          consent: true,
          cvFilename: file.name,
          cvBase64,
        },
      });
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
          <a href={`/candidate/login?redirect=${encodeURIComponent(redirect)}`}>
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
      <DialogContent>
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("jobs.apply.success.title")}</DialogTitle>
              <DialogDescription>{t("jobs.apply.success.body")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button type="button" onClick={() => setOpen(false)}>
                {t("jobs.apply.success.close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{t("jobs.apply.dialog.title")}</DialogTitle>
              <DialogDescription>
                {employerName
                  ? t("jobs.apply.dialog.body").replace("{employer}", employerName)
                  : t("jobs.apply.dialog.bodyGeneric")}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
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

              <div>
                <Label htmlFor="apply-cv">{t("jobs.apply.field.cv")}</Label>
                <Input
                  id="apply-cv"
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onFileChange}
                  className="mt-1"
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

            <DialogFooter className="mt-6">
              <Button
                type="submit"
                disabled={submitting || !consent || !file}
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
