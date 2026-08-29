// The six questions that build a Passport — permanently visible, permanently
// editable.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────
//
// The six were only ever askable inside the onboarding wizard. Commit 9a150a6
// removed the wizard's navigation tab for a good reason — a standing entry
// into a first run gives the product two answers to "where does my employment
// live" — but the profile-level facts had nowhere else to go. The only
// surviving link to /passport/onboarding is the overview's Continue button,
// which renders only while the Passport is empty or partial, so a holder who
// finished onboarding could no longer read, let alone correct, their own name,
// headline, profession, country, current role or declaration.
//
// `WorkCountryCard` is the precedent: it rescued exactly one of the six on
// exactly these grounds. This is the same argument applied to the rest.
//
// ── WHY IT SHOWS SIX AND EDITS FOUR ────────────────────────────────────
//
// Two of the six already have a permanent, canonical editor a few hundred
// pixels further down this same page: the work country (`WorkCountryCard`) and
// the current role (the employment section, which writes real
// `sp_experience_periods` rows carrying evidence, reviews and lifecycle).
// Giving this card its own writer for those would put two controls on ONE page
// writing ONE fact — which is the defect the wizard's removal was meant to
// prevent, rebuilt one level up.
//
// So all six are listed, all six show their current answer, all six show
// whether they are answered, and the two delegated ones offer a control that
// moves the holder to their real editor. Nothing is hidden and nothing has two
// writers.
//
// ── NO SERVER TIER ─────────────────────────────────────────────────────
//
// The route owns every server call, as every Passport component does and as
// `passport-separation-check` enforces.

import { useMemo, useState } from "react";
import { ClipboardList, Info, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  BASICS_EDIT_MODE,
  PROFILE_BASICS_COUNT,
  PROFILE_BASICS_STEPS,
  answeredCount,
  isStepAnswered,
} from "@/lib/security-passport/profile-basics";
import type { OnboardingField, OnboardingStep } from "@/lib/security-passport/onboarding";

/** What the holder can change from this card, in one save. The two delegated
 *  questions are deliberately absent: this shape is what makes it impossible
 *  for a headline edit to reach an employment row. */
export interface ProfileBasicsPatch {
  readonly displayName?: string;
  readonly headline?: string;
  readonly professionSlug?: string;
  /** Affirm-only, mirroring the server function. A declaration is not a field
   *  that can be cleared. */
  readonly declared?: true;
}

/** The wizard's own answer key, so a value is looked up here by exactly the
 *  name it is stored under. */
function keyOf(stepId: string, fieldId: string): string {
  return `${stepId}.${fieldId}`;
}

function StatusChip({ answered }: { readonly answered: boolean }) {
  const { pt } = usePassportCopy();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
        answered
          ? "bg-secondary text-secondary-foreground"
          : "border border-dashed border-border text-muted-foreground",
      )}
    >
      {answered ? pt("basics.answered") : pt("basics.missing")}
    </span>
  );
}

export function ProfileBasicsCard({
  answers,
  displayAnswers,
  declaredAccurateAt,
  onSave,
  onEditWorkCountry,
  onEditCurrentRole,
}: {
  /** Every current answer, keyed `stepId.fieldId` exactly as the wizard keys
   *  them. Resolved by the route from wherever each one actually lives — two
   *  profile columns, a confirmed country, a real employment row and a
   *  timestamp — so this component never has to know. */
  readonly answers: Readonly<Record<string, string>>;
  /** Presentation overrides for answers whose stored value is a code rather
   *  than something a person would read, such as "AE-DU". Completeness is
   *  always computed from `answers`, never from these. */
  readonly displayAnswers?: Readonly<Record<string, string>>;
  readonly declaredAccurateAt: string | null;
  readonly onSave: (patch: ProfileBasicsPatch) => Promise<void>;
  readonly onEditWorkCountry: () => void;
  readonly onEditCurrentRole: () => void;
}) {
  const { pt } = usePassportCopy();

  const [displayName, setDisplayName] = useState(
    () => answers[keyOf("identity", "displayName")] ?? "",
  );
  const [headline, setHeadline] = useState(() => answers[keyOf("identity", "headline")] ?? "");
  const [profession, setProfession] = useState(
    () => answers[keyOf("profession", "profession")] ?? "",
  );
  const [declared, setDeclared] = useState(() => declaredAccurateAt !== null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The count reads the DRAFT for the fields being edited and the stored
   *  answer for everything else, so "5 av 6" moves as the holder types rather
   *  than only after a round trip. */
  const draftAnswers = useMemo<Record<string, string>>(
    () => ({
      ...answers,
      [keyOf("identity", "displayName")]: displayName,
      [keyOf("identity", "headline")]: headline,
      [keyOf("profession", "profession")]: profession,
      [keyOf("declaration", "declared")]: declared ? "true" : "",
    }),
    [answers, displayName, headline, profession, declared],
  );
  const read = useMemo(
    () => (stepId: string, fieldId: string) => draftAnswers[keyOf(stepId, fieldId)] ?? "",
    [draftAnswers],
  );
  const filled = answeredCount(read);

  const dirty =
    displayName !== (answers[keyOf("identity", "displayName")] ?? "") ||
    headline !== (answers[keyOf("identity", "headline")] ?? "") ||
    profession !== (answers[keyOf("profession", "profession")] ?? "") ||
    (declared && declaredAccurateAt === null);

  async function submit(force?: ProfileBasicsPatch) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(
        force ?? {
          displayName,
          headline,
          professionSlug: profession,
          ...(declared && declaredAccurateAt === null ? { declared: true as const } : {}),
        },
      );
      setSaved(true);
    } catch (err) {
      console.error("[passport] profile basics save failed", err);
      setError(pt("live.error"));
    } finally {
      setBusy(false);
    }
  }

  /** The stored answer as a person should read it. */
  function shown(stepId: string, field: OnboardingField): string {
    const override = displayAnswers?.[keyOf(stepId, field.id)];
    if (override) return override;
    const raw = answers[keyOf(stepId, field.id)] ?? "";
    return raw.trim() === "" ? pt("common.notStated") : raw;
  }

  function inlineField(step: OnboardingStep, field: OnboardingField) {
    const id = `sp-basics-${step.id}-${field.id}`;
    const label = (
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {pt(field.labelKey)}
      </label>
    );
    const control =
      "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

    if (field.type === "select") {
      const value = field.id === "profession" ? profession : "";
      return (
        <div key={field.id} className="max-w-md">
          {label}
          <select
            id={id}
            value={value}
            onChange={(e) => setProfession(e.target.value)}
            className={control}
          >
            <option value="">—</option>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.labelKey ? pt(o.labelKey) : o.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "checkbox") {
      // Already declared: the act is recorded, so it is reported rather than
      // re-offered as an empty box. Re-affirming is its own explicit action.
      if (declaredAccurateAt !== null) {
        return (
          <div key={field.id} className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">{pt("basics.declaredOn")}: </span>
              {declaredAccurateAt.slice(0, 10)}
            </p>
            <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {pt("basics.declarationNote")}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit({ declared: true })}
              className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("basics.declareAgain")}
            </button>
          </div>
        );
      }
      return (
        <div key={field.id} className="flex items-start gap-3">
          <input
            id={id}
            type="checkbox"
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-input text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <label htmlFor={id} className="text-sm leading-relaxed text-foreground">
            {pt(field.labelKey)}
          </label>
        </div>
      );
    }

    const value = field.id === "displayName" ? displayName : headline;
    const set = field.id === "displayName" ? setDisplayName : setHeadline;
    return (
      <div key={field.id} className="max-w-md">
        {label}
        <input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => set(e.target.value)}
          className={control}
        />
      </div>
    );
  }

  return (
    <section
      id="sp-profile-basics"
      className="rounded-xl border border-border bg-background p-5 md:p-6"
      aria-labelledby="sp-profile-basics-heading"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="sp-profile-basics-heading"
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-foreground"
        >
          <ClipboardList aria-hidden="true" className="h-5 w-5 text-primary" />
          {pt("basics.title")}
        </h2>
        {/* A count of questions, in words and digits. Deliberately not a bar,
            a meter or a percentage: the Trust product renders nothing a reader
            could mistake for a measurement of the person. */}
        <p className="text-sm tabular-nums text-muted-foreground" role="status">
          {filled} {pt("onboarding.of")} {PROFILE_BASICS_COUNT} {pt("basics.filled")}
        </p>
      </header>

      <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {pt("basics.lead")}
      </p>

      {/* Said once, at the top, before anything is typed. A holder must never
          be able to conclude that saving an answer here made it checked. */}
      <p className="mt-3 flex max-w-[70ch] items-start gap-2 rounded-md border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        {pt("basics.selfReported")}
      </p>

      <ol className="mt-5 space-y-5">
        {PROFILE_BASICS_STEPS.map((step, index) => {
          const mode = BASICS_EDIT_MODE[step.id] ?? "inline";
          const answered = isStepAnswered(step, read);
          return (
            <li key={step.id} className="border-t border-border pt-5 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {pt("basics.question")} {index + 1}
                </span>
                <StatusChip answered={answered} />
              </div>

              <h3 className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
                {pt(step.titleKey)}
              </h3>
              <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                {pt(step.whyKey)}
              </p>
              {step.bodyKey ? (
                <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                  {pt(step.bodyKey)}
                </p>
              ) : null}

              {mode === "informational" ? (
                <p className="mt-3 text-sm text-muted-foreground">{pt("basics.noAnswerNeeded")}</p>
              ) : null}

              {mode === "inline" ? (
                <div className="mt-4 space-y-4">{step.fields.map((f) => inlineField(step, f))}</div>
              ) : null}

              {mode === "delegated" ? (
                <div className="mt-4 space-y-3">
                  <dl className="space-y-1">
                    {step.fields.map((field) => (
                      <div key={field.id} className="flex flex-wrap gap-x-2 text-sm">
                        <dt className="text-muted-foreground">{pt(field.labelKey)}:</dt>
                        <dd className="text-foreground">{shown(step.id, field)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                    {pt("basics.editedBelow")}
                  </p>
                  <button
                    type="button"
                    onClick={step.id === "jurisdiction" ? onEditWorkCountry : onEditCurrentRole}
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <PenLine aria-hidden="true" className="h-4 w-4" />
                    {pt("basics.editBelow")}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !dirty}
          className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {busy ? pt("live.saving") : pt("basics.save")}
        </button>
        {saved ? (
          <span role="status" className="text-sm text-muted-foreground">
            {pt("basics.savedNotice")}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
