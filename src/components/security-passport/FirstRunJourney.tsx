// Security Passport — the first run: create the Passport, add one merit.
//
// ── WHAT THIS REPLACED, AND WHY IT IS FOUR SCREENS ─────────────────────
//
// The previous first run was a six-step wizard that asked for a professional
// identity, a profession from a list of three Swedish security roles, a work
// country and a current employer BEFORE anything was created. Somebody who
// had just been promised "create your Passport and add your first merit"
// spent six screens giving a profile away and reached a Passport with, at
// best, one employment in it — and only if they happened to be employed, in
// Sweden, in one of three professions.
//
// Four screens, one purpose each:
//
//   1 CREATE   the Passport exists. One decision, stated privately.
//   2 CHOOSE   which of five kinds of merit to record first.
//   3 DETAILS  only the fields that kind actually needs.
//   4 DONE     the merit, read back from the database and confirmed.
//
// ── PRESENTATION ONLY ──────────────────────────────────────────────────
//
// No server tier, no router, no persistence. Every action is a prop, so the
// route owns the writes and scripts/passport-first-run-check.tsx can render
// each screen and read what it actually says. `draft` is controlled from
// above for the same reason: the route is where a keystroke becomes an
// autosave, and this component must not hold a second copy of the answers
// that could disagree with the one being saved.

import { useEffect, useId, useRef } from "react";
import {
  ArrowLeft,
  Award,
  Briefcase,
  Check,
  GraduationCap,
  IdCard,
  Lock,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  FIRST_MERIT_KINDS,
  fieldsFor,
  type FirstMeritDraft,
  type FirstMeritFieldId,
  type FirstMeritKind,
  type FirstMeritProblemId,
  type FirstRunScreen,
} from "@/lib/security-passport/first-run";

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

/** The four screens as the reader meets them. `done` is not navigable — it
 *  is arrived at — but it is still a step, and hiding it would make the
 *  progress indicator lie about how long this is. */
const STEPS: readonly { screen: FirstRunScreen; labelKey: PassportCopyKey }[] = [
  { screen: "create", labelKey: "fr.stepLabel.create" },
  { screen: "choose", labelKey: "fr.stepLabel.choose" },
  { screen: "details", labelKey: "fr.stepLabel.details" },
  { screen: "done", labelKey: "fr.stepLabel.done" },
];

/** Progress as named steps, never as a filled meter.
 *
 *  A bar that fills is the visual language of measurement, and this product
 *  reserves that for nothing at all — a reader must never mistake a piece of
 *  chrome for an assessment of them. A named step with a count is
 *  unmistakably navigation. */
function Progress({ screen }: { screen: FirstRunScreen }) {
  const { pt } = usePassportCopy();
  const index = STEPS.findIndex((s) => s.screen === screen);
  const current = index < 0 ? 0 : index;

  return (
    <div className="mb-6">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {pt("fr.progress")
          .replace("{n}", String(current + 1))
          .replace("{total}", String(STEPS.length))}
      </p>
      <ol className="mt-2.5 flex items-center gap-1.5" aria-hidden="true">
        {STEPS.map((step, i) => (
          <li
            key={step.screen}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < current ? "bg-accent" : i === current ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </ol>
      <p className="mt-2 text-sm font-medium text-foreground">{pt(STEPS[current].labelKey)}</p>
    </div>
  );
}

/** One card, one purpose. `max-w-2xl` on a page whose parent is wider, with
 *  the choose screen breaking to two columns at md — so desktop is a
 *  deliberate layout rather than a phone column with a field of whitespace
 *  either side of it. */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card p-6 shadow-xs md:p-8", className)}
    >
      {children}
    </section>
  );
}

/** Moves focus to the heading whenever the screen changes.
 *
 *  Without it a keyboard or screen-reader user stays focused on a button that
 *  has just been replaced by a different screen, and has to hunt for where
 *  they are. */
function useScreenHeading(screen: FirstRunScreen) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [screen]);
  return ref;
}

const HEADING = "text-2xl font-semibold tracking-tight text-foreground outline-none md:text-3xl";
const PRIMARY =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto";
const QUIET =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const SECONDARY =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto";
const FIELD =
  "mt-1.5 block h-12 w-full rounded-lg border bg-background px-3.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/* ------------------------------------------------------------------ */
/* Screen 1 — create the Passport                                      */
/* ------------------------------------------------------------------ */

export function CreatePassportScreen({
  onCreate,
  busy,
  error,
}: {
  onCreate: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { pt } = usePassportCopy();
  const heading = useScreenHeading("create");

  return (
    <div className="mx-auto w-full max-w-2xl" data-first-run="create">
      <Progress screen="create" />
      <Card>
        <h1
          ref={heading}
          tabIndex={-1}
          className={HEADING}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("fr.create.title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {pt("fr.create.body")}
        </p>

        {/* Privacy is stated BEFORE the button, not in a footnote after it.
            The one thing a person needs to know before creating a record of
            their career is who can see it. */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4">
          <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">{pt("fr.create.privateTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pt("fr.create.privateBody")}
            </p>
          </div>
        </div>

        {error ? <SaveError message={error} retryLabel={pt("fr.error.retry")} /> : null}

        <div className="mt-7">
          <button
            type="button"
            data-cta="create-passport"
            onClick={onCreate}
            disabled={busy}
            className={PRIMARY}
          >
            {busy ? pt("fr.create.creating") : pt("fr.create.cta")}
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 2 — choose the first merit                                   */
/* ------------------------------------------------------------------ */

const KIND_META: Readonly<
  Record<FirstMeritKind, { icon: LucideIcon; labelKey: PassportCopyKey; hintKey: PassportCopyKey }>
> = {
  employment: {
    icon: Briefcase,
    labelKey: "fr.choose.employment",
    hintKey: "fr.choose.employmentHint",
  },
  education: {
    icon: GraduationCap,
    labelKey: "fr.choose.education",
    hintKey: "fr.choose.educationHint",
  },
  course: { icon: BookOpen, labelKey: "fr.choose.course", hintKey: "fr.choose.courseHint" },
  certification: {
    icon: Award,
    labelKey: "fr.choose.certification",
    hintKey: "fr.choose.certificationHint",
  },
  licence: { icon: IdCard, labelKey: "fr.choose.licence", hintKey: "fr.choose.licenceHint" },
};

export function ChooseMeritScreen({ onChoose }: { onChoose: (kind: FirstMeritKind) => void }) {
  const { pt } = usePassportCopy();
  const heading = useScreenHeading("choose");

  return (
    <div className="mx-auto w-full max-w-2xl" data-first-run="choose">
      <Progress screen="choose" />
      <Card>
        <h1
          ref={heading}
          tabIndex={-1}
          className={HEADING}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("fr.choose.title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {pt("fr.choose.body")}
        </p>

        {/* Every one of these IS the control. Nothing here is a decorative
            card that happens to look pressable — the whole tile is the
            button, so a tap anywhere on it does what it looks like it does. */}
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {FIRST_MERIT_KINDS.map((kind) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <li key={kind}>
                <button
                  type="button"
                  data-merit-kind={kind}
                  onClick={() => onChoose(kind)}
                  className="group flex h-full w-full items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-accent hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors group-hover:bg-accent/15">
                    <Icon aria-hidden="true" className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {pt(meta.labelKey)}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                      {pt(meta.hintKey)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 3 — the details                                              */
/* ------------------------------------------------------------------ */

/** Which label each field wears for each kind.
 *
 *  A course has a "training provider" and an employment has an "employer",
 *  and they are the same column. Naming them identically would be the form
 *  telling the reader about the database. */
function labelKeyFor(kind: FirstMeritKind, field: FirstMeritFieldId): PassportCopyKey {
  if (field === "title") {
    return kind === "employment"
      ? "fr.field.role"
      : kind === "education"
        ? "fr.field.educationTitle"
        : kind === "course"
          ? "fr.field.courseTitle"
          : kind === "certification"
            ? "fr.field.certificationTitle"
            : "fr.field.licenceTitle";
  }
  if (field === "organisation") {
    return kind === "employment"
      ? "fr.field.employer"
      : kind === "education"
        ? "fr.field.school"
        : kind === "course"
          ? "fr.field.provider"
          : kind === "certification"
            ? "fr.field.issuer"
            : "fr.field.authority";
  }
  if (field === "country") return "fr.field.country";
  if (field === "startedOn")
    return kind === "employment" ? "fr.field.startedOn" : "fr.field.completedOn";
  return "fr.field.endedOn";
}

const TITLE_KEY: Readonly<Record<FirstMeritKind, PassportCopyKey>> = {
  employment: "fr.details.title.employment",
  education: "fr.details.title.education",
  course: "fr.details.title.course",
  certification: "fr.details.title.certification",
  licence: "fr.details.title.licence",
};

const PROBLEM_KEY: Readonly<Record<string, PassportCopyKey>> = {
  required: "fr.error.required",
  invalid: "fr.error.invalidDate",
  future: "fr.error.futureDate",
  beforeStart: "fr.error.endBeforeStart",
};

/** The countries `sp_jurisdictions` holds. Not a market list and not a claim
 *  about where the product operates — it is what the profile's foreign key
 *  accepts, and the field says so rather than implying the world is three
 *  countries. There is NO pre-selected option: a country becomes a fact about
 *  a person only when that person chooses it. */
const COUNTRIES: readonly { value: string; labelKey: PassportCopyKey }[] = [
  { value: "SE", labelKey: "jurisdiction.SE" },
  { value: "GB", labelKey: "jurisdiction.GB" },
  { value: "AE", labelKey: "jurisdiction.AE" },
];

/** A failure the reader can act on.
 *
 *  The message says WHICH thing did not happen and whether anything changed;
 *  the retry appears only where retrying is meaningful. A refusal is fixed by
 *  correcting a field, so it gets no button — an "again" that cannot help is
 *  an invitation to press it repeatedly. */
function SaveError({
  message,
  onRetry,
  retryLabel,
  busy,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel: string;
  busy?: boolean;
}) {
  return (
    <div
      role="alert"
      data-save-error
      className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <p className="text-sm leading-relaxed text-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          data-cta="retry"
          onClick={onRetry}
          disabled={busy}
          className="mt-3 inline-flex h-11 items-center rounded-lg border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function MeritDetailsScreen({
  kind,
  draft,
  problems,
  onChange,
  onSubmit,
  onSaveAndExit,
  onBack,
  busy,
  error,
  onRetry,
}: {
  kind: FirstMeritKind;
  draft: FirstMeritDraft;
  /** Field id -> problem code, plus `declaration`. Empty until the holder
   *  tries to save, so the form does not shout at somebody who has not
   *  finished typing. */
  problems: Readonly<Partial<Record<FirstMeritProblemId, string>>>;
  onChange: (patch: Partial<FirstMeritDraft>) => void;
  onSubmit: () => void;
  onSaveAndExit: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
  /** Present only when trying the same thing again could change the answer:
   *  a lost response, or a draft save that did not land. */
  onRetry?: () => void;
}) {
  const { pt } = usePassportCopy();
  const heading = useScreenHeading("details");
  const ids = useId();
  const fields = fieldsFor(kind);
  const declarationInvalid = Boolean(problems.declaration);

  const problemFor = (field: FirstMeritFieldId) => problems[field];

  return (
    <div className="mx-auto w-full max-w-2xl" data-first-run="details" data-merit-kind={kind}>
      <Progress screen="details" />
      <Card>
        <h1
          ref={heading}
          tabIndex={-1}
          className={HEADING}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt(TITLE_KEY[kind])}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {pt("fr.details.body")}
        </p>

        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {fields.map((field) => {
            if (field === "endedOn" && draft.ongoing) return null;
            const inputId = `${ids}-${field}`;
            const problem = problemFor(field);
            const describedBy = problem ? `${inputId}-error` : undefined;
            const optional = field === "startedOn" && kind !== "employment";

            return (
              <div key={field}>
                <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
                  {pt(labelKeyFor(kind, field))}
                  {optional ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      ({pt("fr.field.optional")})
                    </span>
                  ) : null}
                </label>

                {field === "country" ? (
                  <>
                    <select
                      id={inputId}
                      value={draft.country}
                      aria-invalid={Boolean(problem)}
                      aria-describedby={describedBy}
                      onChange={(e) => onChange({ country: e.target.value })}
                      className={cn(FIELD, problem ? "border-destructive" : "border-input")}
                    >
                      {/* Empty, and selected, until the holder chooses. */}
                      <option value="">{pt("fr.field.countryPlaceholder")}</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {pt(c.labelKey)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {pt("fr.field.countryHelp")}
                    </p>
                  </>
                ) : field === "startedOn" || field === "endedOn" ? (
                  <input
                    id={inputId}
                    type="date"
                    value={field === "startedOn" ? draft.startedOn : draft.endedOn}
                    aria-invalid={Boolean(problem)}
                    aria-describedby={describedBy}
                    onChange={(e) =>
                      onChange(
                        field === "startedOn"
                          ? { startedOn: e.target.value }
                          : { endedOn: e.target.value },
                      )
                    }
                    className={cn(FIELD, problem ? "border-destructive" : "border-input")}
                  />
                ) : (
                  <input
                    id={inputId}
                    type="text"
                    value={field === "title" ? draft.title : draft.organisation}
                    aria-invalid={Boolean(problem)}
                    aria-describedby={describedBy}
                    onChange={(e) =>
                      onChange(
                        field === "title"
                          ? { title: e.target.value }
                          : { organisation: e.target.value },
                      )
                    }
                    className={cn(FIELD, problem ? "border-destructive" : "border-input")}
                  />
                )}

                {problem ? (
                  <p
                    id={`${inputId}-error`}
                    role="alert"
                    className="mt-1.5 text-sm text-destructive"
                  >
                    {pt(PROBLEM_KEY[problem] ?? "fr.error.required")}
                  </p>
                ) : null}
              </div>
            );
          })}

          {/* Only employment has an end date, so only employment asks whether
              it has one. A course does not "still be happening". */}
          {fields.includes("endedOn") ? (
            <div className="flex items-start gap-2.5">
              <input
                id={`${ids}-ongoing`}
                type="checkbox"
                checked={draft.ongoing}
                onChange={(e) => onChange({ ongoing: e.target.checked, endedOn: "" })}
                className="mt-0.5 h-5 w-5 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <label htmlFor={`${ids}-ongoing`} className="text-sm leading-relaxed text-foreground">
                {pt("fr.field.ongoing")}
              </label>
            </div>
          ) : null}

          {/* ── THE DECLARATION ────────────────────────────────────────
              Not a formality and not a default. The server refuses a
              completion that does not carry an explicit true, and the
              database refuses it again before it writes anything — so this
              box is the only thing that can produce a declaration, and an
              unticked one produces no merit at all rather than a merit with
              no declaration. */}
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-4",
              declarationInvalid
                ? "border-destructive bg-destructive/5"
                : "border-border bg-secondary/30",
            )}
          >
            <input
              id={`${ids}-declared`}
              type="checkbox"
              data-testid="first-merit-declaration"
              checked={draft.declared === true}
              aria-invalid={declarationInvalid}
              aria-describedby={declarationInvalid ? `${ids}-declared-error` : undefined}
              onChange={(e) => onChange({ declared: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <div>
              <label
                htmlFor={`${ids}-declared`}
                className="text-sm leading-relaxed text-foreground"
              >
                {pt("fr.declaration")}
              </label>
              {declarationInvalid ? (
                <p
                  id={`${ids}-declared-error`}
                  role="alert"
                  className="mt-1.5 text-sm text-destructive"
                >
                  {pt("fr.error.declaration")}
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <SaveError
              message={error}
              onRetry={onRetry}
              retryLabel={pt("fr.error.retry")}
              busy={busy}
            />
          ) : null}

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
            <button type="submit" data-cta="save-merit" disabled={busy} className={PRIMARY}>
              {busy ? pt("fr.saving") : pt("fr.save")}
            </button>
            <button
              type="button"
              data-cta="save-and-exit"
              onClick={onSaveAndExit}
              disabled={busy}
              className={QUIET}
            >
              {pt("fr.saveExit")}
            </button>
          </div>

          {/* WHERE IT TAKES YOU, said before you press it. "Save and exit" is
              the one control on this screen whose destination is not obvious
              from its label, and leaving that to be discovered is how a
              person loses their place. */}
          <p className="text-xs leading-relaxed text-muted-foreground">{pt("fr.saveExit.hint")}</p>
        </form>
      </Card>

      <div className="mt-4">
        <button type="button" onClick={onBack} className={QUIET}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {pt("fr.details.change")}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 4 — confirmed, or honestly unconfirmed                       */
/* ------------------------------------------------------------------ */

export function MeritSavedScreen({
  title,
  onGoToPassport,
  onAddAnother,
  onCompleteProfile,
}: {
  /** What the DATABASE said the merit is called, not what was typed. The
   *  screen has just read the row back; showing the field would show the
   *  browser's memory of it. */
  title: string;
  onGoToPassport: () => void;
  onAddAnother: () => void;
  onCompleteProfile: () => void;
}) {
  const { pt } = usePassportCopy();
  const heading = useScreenHeading("done");

  return (
    <div className="mx-auto w-full max-w-2xl" data-first-run="done">
      <Progress screen="done" />
      <Card>
        {/* A solid mark, not a tinted one. `bg-accent/15` with
            `text-accent-foreground` put a near-white tick on a pale blue
            circle -- a confirmation nobody could see, which is a strange
            thing for a confirmation screen to have. */}
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <h1
          ref={heading}
          tabIndex={-1}
          className={cn(HEADING, "mt-4")}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("fr.done.title")}
        </h1>
        <p className="mt-2 text-base font-medium text-foreground" data-merit-title>
          {title}
        </p>

        {/* ── WHAT IT IS, SAID PLAINLY ───────────────────────────────
            "Uppgift från dig" / "Information provided by you", and nothing
            stronger. Not verified, not confirmed, not documented. The whole
            product rests on the difference between a statement and a checked
            statement, and the first place a person meets that difference is
            the moment they save their first merit. */}
        <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-semibold text-foreground">{pt("fr.done.status")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("fr.done.statusBody")}
          </p>
        </div>

        <h2 className="mt-7 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {pt("fr.done.next")}
        </h2>
        {/* Three actions, three different destinations. The dominant one is
            the Passport itself, because that is what the person came to
            build. */}
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            data-cta="go-to-passport"
            onClick={onGoToPassport}
            className={PRIMARY}
          >
            {pt("fr.done.goToPassport")}
          </button>
          <button type="button" data-cta="add-another" onClick={onAddAnother} className={SECONDARY}>
            {pt("fr.done.addAnother")}
          </button>
          <button
            type="button"
            data-cta="complete-profile"
            onClick={onCompleteProfile}
            className={QUIET}
          >
            {pt("fr.done.completeProfile")}
          </button>
        </div>
        {/* /passport/information is a long page. Sending somebody there with a
            three-word link and no warning is how a person who wanted one more
            small thing meets a wall of sections. */}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {pt("fr.done.completeProfileHint")}
        </p>
      </Card>
    </div>
  );
}

/**
 * The write may have landed, and the product will not guess.
 *
 * A save whose confirmation could not be read is neither a success nor a
 * failure, and saying either would be a guess about somebody's own record.
 * What it CAN offer is the thing that settles the question: the same
 * submission again, under the same operation id, which the server answers by
 * replaying the merit it already made rather than making a second one.
 */
export function MeritUnconfirmedScreen({
  onGoToPassport,
  onReconcile,
  busy,
}: {
  onGoToPassport: () => void;
  /** Absent when the operation id is not available, in which case retrying
   *  would be a NEW operation and is therefore not offered. */
  onReconcile?: () => void;
  busy?: boolean;
}) {
  const { pt } = usePassportCopy();
  const heading = useScreenHeading("done");

  return (
    <div className="mx-auto w-full max-w-2xl" data-first-run="unconfirmed">
      <Progress screen="done" />
      <Card>
        <h1
          ref={heading}
          tabIndex={-1}
          className={HEADING}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("fr.unknown.title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {pt("fr.unknown.body")}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {onReconcile ? (
            <button
              type="button"
              data-cta="reconcile"
              onClick={onReconcile}
              disabled={busy}
              className={PRIMARY}
            >
              {busy ? pt("fr.saving") : pt("fr.unknown.reconcile")}
            </button>
          ) : null}
          <button
            type="button"
            data-cta="go-to-passport"
            onClick={onGoToPassport}
            className={onReconcile ? SECONDARY : PRIMARY}
          >
            {pt("fr.unknown.action")}
          </button>
        </div>
      </Card>
    </div>
  );
}

/**
 * The Passport could not be READ.
 *
 * Deliberately NOT the create screen. An unreadable Passport and an absent one
 * look identical from a failed request, and the first version treated them the
 * same — offering somebody whose record could not be loaded a button to make a
 * new one on top of it. The copy is neutral, says nothing was changed, and
 * offers only the action that can help.
 */
export function FirstRunLoadError({ onRetry }: { onRetry: () => void }) {
  const { pt } = usePassportCopy();
  const heading = useScreenHeading("create");

  return (
    <div className="mx-auto w-full max-w-2xl" data-first-run="load_error">
      <Card>
        <h1
          ref={heading}
          tabIndex={-1}
          className={HEADING}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("fr.loadError.title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {pt("fr.loadError.body")}
        </p>
        {/* The reassurance is its own sentence and is not destructive-red:
            "we could not read this" is not a warning about the holder's data,
            and colouring it as one says the opposite of what it means. */}
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {pt("fr.loadError.reassurance")}
        </p>
        <div className="mt-6">
          <button type="button" data-cta="retry-load" onClick={onRetry} className={PRIMARY}>
            {pt("fr.loadError.retry")}
          </button>
        </div>
      </Card>
    </div>
  );
}

/** The shell while the Passport read is in flight.
 *
 *  Same outer width and same card geometry as every screen, so the page does
 *  not jump when the answer arrives. A skeleton that is a different shape
 *  from the thing it stands in for is a layout shift with extra steps. */
export function FirstRunLoading() {
  const { pt } = usePassportCopy();
  return (
    <div className="mx-auto w-full max-w-2xl" data-first-run="loading">
      <div className="mb-6">
        <div className="h-3 w-24 rounded bg-border" />
        <div className="mt-2.5 flex items-center gap-1.5">
          {STEPS.map((s) => (
            <div key={s.screen} className="h-1 flex-1 rounded-full bg-border" />
          ))}
        </div>
        <div className="mt-2 h-4 w-32 rounded bg-border" />
      </div>
      <Card>
        <p className="sr-only" role="status">
          {pt("fr.handoff.loading")}
        </p>
        <div className="h-8 w-3/4 rounded bg-border" aria-hidden="true" />
        <div className="mt-4 h-4 w-full rounded bg-border/70" aria-hidden="true" />
        <div className="mt-2 h-4 w-2/3 rounded bg-border/70" aria-hidden="true" />
        <div className="mt-7 h-12 w-56 rounded-lg bg-border" aria-hidden="true" />
      </Card>
    </div>
  );
}
