// Assessment Library — what exists, what may be assigned, and why not.
//
// ── SHOWING UNPUBLISHED PROGRAMMES ON PURPOSE ─────────────────────────
//
// The library lists programmes that cannot yet be assigned, clearly marked.
// That is a deliberate product choice: an employer asking "do you have anything
// for security guards?" deserves "yes, it is in development and not yet
// validated" rather than an empty page that implies the answer is no.
//
// The honesty has to be structural, not a label. `assignable` is computed in
// the database, the Assign control is absent — not merely disabled — when it is
// false, and scp_employer_assign re-checks it anyway, so a crafted request
// cannot assign a draft programme.

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCircle2, Copy, FlaskConical, Hammer } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import {
  assignAcademyProgramme,
  listAcademyLibrary,
  type LibraryEntry,
} from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/assessments/library")({
  ssr: false,
  component: LibraryRoute,
  errorComponent: EmployerErrorState,
});

function LibraryRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => <Library employerId={ws.employerId} canAssign={ws.role !== "member"} />}
    </AcademyPage>
  );
}

function Library({ employerId, canAssign }: { employerId: string; canAssign: boolean }) {
  const { t, lang } = useT();
  const listLibrary = useServerFn(listAcademyLibrary);
  const query = useQuery({
    queryKey: ["academy", "library", employerId],
    queryFn: () => listLibrary({ data: { employerId } }),
  });

  return (
    <>
      <AcademyHeading title={t("academy.library.title")} lede={t("academy.library.lede")} />

      <AcademyQueryState
        query={query}
        surface="assessments/library"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle={t("academy.library.emptyTitle")}
        emptyBody={t("academy.library.emptyBody")}
      >
        {(rows) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((e) => (
              <ProgrammeCard
                key={e.assessmentVersionId}
                entry={e}
                employerId={employerId}
                canAssign={canAssign}
                lang={lang}
              />
            ))}
          </div>
        )}
      </AcademyQueryState>
    </>
  );
}

function ProgrammeCard({
  entry,
  employerId,
  canAssign,
  lang,
}: {
  entry: LibraryEntry;
  employerId: string;
  canAssign: boolean;
  lang: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const name = lang === "en" ? entry.nameEn : entry.nameSv;
  const purpose = lang === "en" ? entry.purposeEn : entry.purposeSv;
  const doesNot = lang === "en" ? entry.doesNotMeasureEn : entry.doesNotMeasureSv;

  return (
    <article className="flex flex-col rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold leading-snug text-foreground">{name}</h2>
        <StatusChip entry={entry} />
      </div>

      {purpose && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{purpose}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-muted-foreground">{t("academy.library.items")}</dt>
          <dd className="font-medium tabular-nums text-foreground">{entry.itemCount}</dd>
        </div>
        {entry.minutesMin && entry.minutesMax && (
          <div>
            <dt className="text-muted-foreground">{t("academy.library.duration")}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {entry.minutesMin}–{entry.minutesMax} min
            </dd>
          </div>
        )}
      </dl>

      {/* What the programme does NOT measure, stated on the card rather than
          buried in a policy page. It is the boundary that prevents misuse. */}
      {doesNot.length > 0 && (
        <div className="mt-4 rounded-[10px] bg-[color:var(--surface-subtle)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            {t("academy.library.doesNotMeasure")}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {doesNot.join(" · ")}
          </p>
        </div>
      )}

      {/* A pilot must say so where the employer decides to use it, not only in
          a status chip. This is the difference between "we ran an assessment"
          and "we ran a controlled test of an unvalidated instrument". */}
      {entry.governanceMode === "closed_test" && (
        <div className="mt-4 rounded-[10px] border border-border bg-muted/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("academy.library.closedTest.title")}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.library.closedTest.body")}
          </p>
        </div>
      )}

      <div className="mt-5 flex-1" />

      {entry.assignable && canAssign ? (
        open ? (
          <AssignForm
            employerId={employerId}
            entry={entry}
            lang={lang}
            onDone={() => setOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            {t("academy.library.assign")}
          </button>
        )
      ) : (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {entry.assignable ? t("academy.library.needsAdmin") : t("academy.library.notAssignable")}
        </p>
      )}
    </article>
  );
}

function StatusChip({ entry }: { entry: LibraryEntry }) {
  const { t } = useT();
  // A closed-test pilot is assignable AND not yet validated. Showing it as
  // plain "available" would overclaim; showing it as "in development" told the
  // employer it could not be used, which was false and hid the pilot entirely.
  const [Icon, key] = entry.isTestFixture
    ? ([FlaskConical, "academy.status.fixture"] as const)
    : entry.governanceMode === "closed_test"
      ? ([FlaskConical, "academy.status.closedTest"] as const)
      : entry.assignable
        ? ([CheckCircle2, "academy.status.available"] as const)
        : ([Hammer, "academy.status.development"] as const);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
      {t(key)}
    </span>
  );
}

/** What the employer is told, and must affirm, before Assign will run.
 *
 *  ── WHY AN AFFIRMATION AND NOT A PICKER ──────────────────────────────
 *
 *  There is exactly one purpose an employer may assign under today, and
 *  scp_required_purpose_code resolves it from the person context rather than
 *  from anything chosen here. A dropdown with one option would imply a choice
 *  that does not exist, and a second option would imply a lawful basis nobody
 *  has approved — recruitment fails closed in the database for exactly that
 *  reason.
 *
 *  So this is a statement plus a confirmation. It says what the programme is
 *  for, repeats the boundary the card already carries, and states plainly that
 *  the result is not a selection instrument. What it does NOT do is quote a
 *  lawful basis, an article or a privacy notice version: that text exists in
 *  the database as configuration, it has not been through legal review, and
 *  putting it in front of an employer as settled would make a legal claim this
 *  product is not yet entitled to make. */
function PurposeAffirmation({
  entry,
  lang,
  confirmed,
  onConfirm,
  inputId,
}: {
  entry: LibraryEntry;
  lang: string;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  inputId: string;
}) {
  const { t } = useT();
  const purpose = lang === "en" ? entry.purposeEn : entry.purposeSv;
  const doesNot = lang === "en" ? entry.doesNotMeasureEn : entry.doesNotMeasureSv;

  return (
    <div className="rounded-[10px] border border-border bg-[color:var(--surface-subtle)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        {t("academy.assign.purposeHeading")}
      </p>

      {purpose && <p className="mt-2 text-[13px] leading-relaxed text-foreground">{purpose}</p>}

      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.assign.purposeDevelopment")}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.assign.purposeNotSelection")}
      </p>

      {doesNot.length > 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("academy.assign.purposeBoundary")}</span>{" "}
          {doesNot.join(" · ")}
        </p>
      )}

      <label
        htmlFor={inputId}
        className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-foreground"
      >
        <input
          id={inputId}
          type="checkbox"
          checked={confirmed}
          onChange={(ev) => onConfirm(ev.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <span>{t("academy.assign.purposeConfirm")}</span>
      </label>
    </div>
  );
}

function AssignForm({
  employerId,
  entry,
  lang,
  onDone,
}: {
  employerId: string;
  entry: LibraryEntry;
  lang: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const assign = useServerFn(assignAcademyProgramme);
  const assessmentVersionId = entry.assessmentVersionId;
  const [email, setEmail] = useState("");
  const [deadline, setDeadline] = useState("");
  // The language the participant will be written to and will answer in. It was
  // hardcoded to Swedish, which was invisible until an invitation email started
  // being sent — a participant assigned in English would have received Swedish.
  const [language, setLanguage] = useState<"sv" | "en">(lang === "en" ? "en" : "sv");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    academyUrl: string;
    notification: "sent" | "not_configured" | "failed";
  } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      assign({
        data: {
          employerId,
          assessmentVersionId,
          recipientEmail: email.trim(),
          deadline: deadline ? new Date(deadline).toISOString() : null,
          language,
        },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
      void qc.invalidateQueries({ queryKey: ["academy", "my-work-count"] });
      setError(null);
      // Deliberately does NOT close the form. The employer needs the link and
      // the delivery outcome, and closing on success would throw both away at
      // the exact moment they matter.
      setResult({ academyUrl: r.academyUrl, notification: r.notification });
    },
    onError: (e: unknown) => {
      // The database's own identifier, so the message can be specific.
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "SCP_RECIPIENT_HAS_NO_ACCOUNT"
          ? t("academy.assign.noAccount")
          : code === "SCP_PROGRAMME_NOT_ASSIGNABLE"
            ? t("academy.assign.notAssignable")
            : t("academy.assign.failed"),
      );
    },
  });

  if (result) {
    return (
      <AssignResult
        result={result}
        email={email}
        onDone={() => {
          setResult(null);
          setEmail("");
          setDeadline("");
          setConfirmed(false);
          onDone();
        }}
      />
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <label
          htmlFor={`email-${assessmentVersionId}`}
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          {t("academy.assign.email")}
        </label>
        <input
          id={`email-${assessmentVersionId}`}
          type="email"
          required
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div>
        <label
          htmlFor={`deadline-${assessmentVersionId}`}
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          {t("academy.assign.deadline")}
        </label>
        <input
          id={`deadline-${assessmentVersionId}`}
          type="date"
          value={deadline}
          onChange={(ev) => setDeadline(ev.target.value)}
          className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div>
        <label
          htmlFor={`language-${assessmentVersionId}`}
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          {t("academy.assign.language")}
        </label>
        <select
          id={`language-${assessmentVersionId}`}
          value={language}
          onChange={(ev) => setLanguage(ev.target.value === "en" ? "en" : "sv")}
          className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="sv">{t("academy.assign.languageSv")}</option>
          <option value="en">{t("academy.assign.languageEn")}</option>
        </select>
      </div>

      <PurposeAffirmation
        entry={entry}
        lang={lang}
        confirmed={confirmed}
        onConfirm={setConfirmed}
        inputId={`purpose-${assessmentVersionId}`}
      />

      {error && (
        <p role="alert" className="text-[13px] leading-relaxed text-foreground">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending || !confirmed}
          className="inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {mutation.isPending ? t("academy.assign.sending") : t("academy.assign.confirm")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("academy.cancel")}
        </button>
      </div>

      {!confirmed && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {t("academy.assign.purposeBlocked")}
        </p>
      )}
    </form>
  );
}

/** What the employer sees the moment an assignment exists.
 *
 *  The link is shown whatever happened to the mail, and it is shown FIRST.
 *  Email delivery is best-effort by design — the provider may not be
 *  configured on this deployment at all — so treating the copy-link as the
 *  fallback for a failure would bury the one mechanism that always works.
 *
 *  Nothing about the assessment travels in this URL: it is /academy, the same
 *  page the participant would reach by signing in and looking. */
function AssignResult({
  result,
  email,
  onDone,
}: {
  result: { academyUrl: string; notification: "sent" | "not_configured" | "failed" };
  email: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  const NOTICE = {
    sent: "academy.assign.mailSent",
    not_configured: "academy.assign.mailNotConfigured",
    failed: "academy.assign.mailFailed",
  } as const;

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-accent/40 bg-[color:var(--surface-subtle)] p-4">
        <p className="text-sm font-semibold text-foreground">{t("academy.assign.doneTitle")}</p>
        <p className="mt-1 break-words text-[13px] leading-relaxed text-muted-foreground">
          {email}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {t(NOTICE[result.notification])}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">
          {t("academy.assign.linkLabel")}
        </p>
        <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
          {t("academy.assign.linkHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-[8px] border border-border bg-card px-3 py-2 text-[12px] text-foreground">
            {result.academyUrl}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(result.academyUrl)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? t("academy.assign.copied") : t("academy.assign.copy")}
          </button>
        </div>
        <p aria-live="polite" className="sr-only">
          {copied ? t("academy.assign.copied") : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("academy.assign.doneAction")}
      </button>
    </div>
  );
}
