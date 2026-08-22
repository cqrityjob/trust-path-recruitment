// Job posting UX redesign — "I am creating a job", not "I am filling in
// database fields".
//
// What changed and why (the tester findings this is answering):
//
//   1. "I could not tell what was mandatory." One long form marked its
//      required fields with a parenthetical "(krävs för granskning)" in
//      the middle of an uppercase micro-label. Now: a single convention
//      (*), stated once at the top, on exactly the fields the *backend*
//      genuinely requires — and a publication check that lists what is
//      missing by name instead of colouring boxes red.
//
//   2. "I did not understand the application choices." A <select> of
//      three words (Externt (länk) / E-post / Internt) became three
//      described choices, each answering "and then what happens to the
//      candidate?". Nothing is pre-chosen, so the question gets asked
//      rather than answered on the employer's behalf.
//
//   3. "What is an Ansöknings-URL?" Gone. The field is called "Länk till
//      ansökningssidan", it appears only after the employer has said the
//      candidate applies on their own website, and it explains itself.
//
//   4. "I did not understand the publishing flow." Four named steps with
//      a review screen that shows every answer, an Ändra link back to
//      each one, a preview of the actual advert, and an explicit
//      statement of what happens after the employer presses the button.
//
// Structural notes:
//   - Create and edit render this one component, as before. There is no
//     second job-form implementation anywhere in the repository.
//   - Draft saving is still explicit ("Spara utkast") and still permits a
//     completely unfinished advert. No HTML `required` attribute is used
//     anywhere in this file — a browser-level required field would make
//     an incomplete draft unsavable, which is the opposite of what an
//     employer writing an advert over two days needs.
//   - Step state and field state are separate: every step renders from
//     one `values` object that no step ever clears, so moving back and
//     forth cannot lose an answer.
//   - Field semantics, stored columns and enum values are untouched. The
//     only stored-value changes are two deliberate defaults on a *new*
//     draft (country=SE, application_method=unavailable i.e. "not chosen
//     yet") and dates being written as end-of-day, explained in model.ts.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Globe2, Inbox, Mail, Pencil, Send } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import {
  employmentTypeLabel,
  workplaceTypeLabel,
  experienceLevelLabel,
  jobStatusLabel,
  EMPLOYMENT_TYPE_VALUES,
  WORKPLACE_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
} from "@/lib/job-intelligence/enum-labels";
import { formatDate } from "@/lib/job-intelligence/date-format";
import { listPublishedProfessionsV2 } from "@/lib/knowledge-graph/read-v2.functions";
import { JobAdPreview } from "./job-form/JobAdPreview";
import {
  STEP_IDS,
  STEP_LABEL_KEYS,
  MAX_DISPLAY_DAYS,
  PUBLICATION_MODEL,
  collectDraftIssues,
  collectPublishBlockers,
  countryOptionsFor,
  emptyValues,
  fromDateInput,
  fromJobRow,
  maxExpiryDateInput,
  todayDateInput,
  toServerPayload,
  translateJobServerError,
  type Blocker,
  type DraftFieldErrors,
  type EmployerJobFormValues,
  type StepId,
} from "./job-form/model";

// Re-exported so the create/edit routes and any future caller keep
// importing the job form's contract from one place.
export { emptyValues, fromJobRow, toServerPayload, translateJobServerError };
export type { EmployerJobFormValues };

type Props = {
  initial: EmployerJobFormValues;
  readOnly?: boolean;
  saving?: boolean;
  submitting?: boolean;
  error?: string | null;
  onSaveDraft: (values: EmployerJobFormValues) => void;
  onSubmitForReview?: (values: EmployerJobFormValues) => void;
  editableStatus?: string;
  /** Shown in the preview so the employer sees their own advert. */
  employerName?: string | null;
  /** An organisation still awaiting approval may write adverts but the
   *  database will not accept a submission — say so before they try. */
  employerStatus?: string;
  /**
   * Extension point for a future "Hjälp mig skriva annonsen". Rendered
   * directly under the job description. Nothing supplies it today and no
   * AI provider is wired up — this exists so adding one later is a prop,
   * not another rewrite of this step.
   */
  descriptionAssistSlot?: ReactNode;
};

type TitleKey = "title_sv" | "title_en";
type DescriptionKey = "description_sv" | "description_en";
type ProfessionOption = { slug: string; title_sv: string | null; title_en: string | null };

const inputCls =
  "mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
const labelCls = "block text-sm font-medium text-foreground";
const helpCls = "mt-1.5 text-sm text-muted-foreground";

// -----------------------------------------------------------------------------
// Presentational helpers.
//
// These live at module scope on purpose. Defining a component inside
// EmployerJobForm's body would make it a NEW component type on every
// render, so React would unmount and remount every input the form owns on
// every keystroke and every step change -- which, among other things,
// silently destroys the element the "go to the missing field" link had just
// focused. Keep them out here.
// -----------------------------------------------------------------------------

function Required() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {" *"}
    </span>
  );
}

function FieldError({ message }: { message?: string | false }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm text-destructive">
      {message}
    </p>
  );
}

function Question({
  id,
  label,
  help,
  required,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
        {required && <Required />}
      </label>
      {help && (
        <p id={`${id}-help`} className={helpCls}>
          {help}
        </p>
      )}
      {children}
    </div>
  );
}

function StepHeading({ title, lede }: { title: string; lede: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{lede}</p>
    </div>
  );
}

export function EmployerJobForm({
  initial,
  readOnly,
  saving,
  submitting,
  error,
  onSaveDraft,
  onSubmitForReview,
  editableStatus,
  employerName,
  employerStatus,
  descriptionAssistSlot,
}: Props) {
  const { t, lang } = useT();
  const [values, setValues] = useState<EmployerJobFormValues>(initial);
  const [step, setStep] = useState<StepId>("job");
  const [draftErrors, setDraftErrors] = useState<DraftFieldErrors>({});
  /** Blockers are only shown once the employer has actually tried to
   *  publish. Nobody wants an empty new form shouting about six missing
   *  fields before they have typed the title. */
  const [showBlockers, setShowBlockers] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<keyof EmployerJobFormValues | null>(null);

  const fieldRefs = useRef<Partial<Record<keyof EmployerJobFormValues, HTMLElement | null>>>({});
  const blockerPanelRef = useRef<HTMLDivElement | null>(null);

  const primaryLang = lang;
  const secondaryLang: "sv" | "en" = lang === "sv" ? "en" : "sv";
  const titlePrimary = (
    primaryLang === "sv" ? "title_sv" : "title_en"
  ) as keyof EmployerJobFormValues;
  const titleSecondary = (
    secondaryLang === "sv" ? "title_sv" : "title_en"
  ) as keyof EmployerJobFormValues;
  const descPrimary = (
    primaryLang === "sv" ? "description_sv" : "description_en"
  ) as keyof EmployerJobFormValues;
  const descSecondary = (
    secondaryLang === "sv" ? "description_sv" : "description_en"
  ) as keyof EmployerJobFormValues;

  const [secondTitleOpen, setSecondTitleOpen] = useState(!!initial[titleSecondary]);
  const [secondDescOpen, setSecondDescOpen] = useState(!!initial[descSecondary]);
  const [locationDetailOpen, setLocationDetailOpen] = useState(!!initial.location_text);

  const listProfessionsFn = useServerFn(listPublishedProfessionsV2);
  const professionsQuery = useQuery({
    queryKey: ["employer", "professions-catalogue"],
    queryFn: () => listProfessionsFn(),
    staleTime: 5 * 60 * 1000,
  });
  const professionLabel = (p: ProfessionOption) =>
    (lang === "sv" ? p.title_sv : p.title_en) || p.slug;
  const professions: ProfessionOption[] = (professionsQuery.data?.data ?? [])
    .map((p) => ({ slug: p.slug, title_sv: p.title_sv, title_en: p.title_en }))
    .sort((a, b) => professionLabel(a).localeCompare(professionLabel(b), lang));

  const blockers = useMemo(() => collectPublishBlockers(values), [values]);
  const blockersByStep = useMemo(() => {
    const map: Partial<Record<StepId, number>> = {};
    for (const b of blockers) map[b.step] = (map[b.step] ?? 0) + 1;
    return map;
  }, [blockers]);

  const orgNotApproved = !!employerStatus && employerStatus !== "active";

  useEffect(() => {
    if (!pendingFocus) return;
    const el = fieldRefs.current[pendingFocus];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
    setPendingFocus(null);
  }, [pendingFocus, step]);

  function set<K extends keyof EmployerJobFormValues>(key: K, value: EmployerJobFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (draftErrors[key]) {
      setDraftErrors((fe) => {
        const next = { ...fe };
        delete next[key];
        return next;
      });
    }
  }

  function goToBlocker(b: Blocker) {
    setStep(b.step);
    setPreviewOpen(false);
    setPendingFocus(b.focus);
  }

  function handleSaveDraft() {
    const issues = collectDraftIssues(values);
    setDraftErrors(issues);
    const firstKey = Object.keys(issues)[0] as keyof EmployerJobFormValues | undefined;
    if (firstKey) {
      setPendingFocus(firstKey);
      return;
    }
    onSaveDraft(values);
  }

  function handlePublish() {
    const issues = collectDraftIssues(values);
    setDraftErrors(issues);
    setShowBlockers(true);
    if (blockers.length > 0 || Object.keys(issues).length > 0) {
      setStep("review");
      setPreviewOpen(false);
      window.setTimeout(() => blockerPanelRef.current?.focus(), 0);
      return;
    }
    onSubmitForReview?.(values);
  }

  // ---------------------------------------------------------------------
  // Step 1 — Jobbet
  // ---------------------------------------------------------------------

  const countryOptions = countryOptionsFor(values.country);

  const stepJob = (
    <div className="space-y-7">
      <StepHeading
        title={t("employer.jobs.form.step.job")}
        lede={t("employer.jobs.form.step.jobLede")}
      />

      <Question
        id="job-title"
        label={t("employer.jobs.form.field.title")}
        help={t("employer.jobs.form.field.titleHelp")}
        required
      >
        <input
          id="job-title"
          aria-describedby="job-title-help"
          ref={(el) => {
            fieldRefs.current[titlePrimary] = el;
          }}
          className={inputCls}
          value={values[titlePrimary]}
          onChange={(e) => set(titlePrimary, e.target.value)}
          placeholder={t("employer.jobs.form.field.titlePlaceholder")}
        />
        <SecondaryLanguageField
          open={secondTitleOpen}
          onOpen={() => setSecondTitleOpen(true)}
          openLabel={t(
            secondaryLang === "en"
              ? "employer.jobs.form.lang.addEnglish"
              : "employer.jobs.form.lang.addSwedish",
          )}
          label={t(
            secondaryLang === "en"
              ? "employer.jobs.form.field.titleEnglish"
              : "employer.jobs.form.field.titleSwedish",
          )}
          id="job-title-secondary"
        >
          <input
            id="job-title-secondary"
            className={inputCls}
            value={values[titleSecondary]}
            onChange={(e) => set(titleSecondary, e.target.value)}
          />
        </SecondaryLanguageField>
      </Question>

      <fieldset>
        <legend className={labelCls}>{t("employer.jobs.form.field.workplaceType")}</legend>
        <p className={helpCls}>{t("employer.jobs.form.field.workplaceTypeHelp")}</p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
          {WORKPLACE_TYPE_VALUES.map((v) => (
            <label
              key={v}
              className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm ${
                values.workplace_type === v
                  ? "border-accent bg-accent/5 font-medium text-foreground"
                  : "border-border text-foreground hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="workplace_type"
                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                checked={values.workplace_type === v}
                onChange={() => set("workplace_type", v)}
              />
              {workplaceTypeLabel(v, lang)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className={labelCls}>{t("employer.jobs.form.field.where")}</p>
        <p className={helpCls}>
          {values.workplace_type === "remote"
            ? t("employer.jobs.form.field.whereHelpRemote")
            : t("employer.jobs.form.field.whereHelp")}
        </p>
        <div className="mt-2.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="job-city" className="text-sm text-muted-foreground">
              {t("employer.jobs.form.field.city")}
            </label>
            <input
              id="job-city"
              className={inputCls}
              value={values.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder={t("employer.jobs.form.field.cityPlaceholder")}
            />
          </div>
          <div>
            <label htmlFor="job-country" className="text-sm text-muted-foreground">
              {t("employer.jobs.form.field.country")}
            </label>
            <select
              id="job-country"
              className={inputCls}
              value={values.country}
              onChange={(e) => set("country", e.target.value)}
            >
              <option value="">{t("employer.jobs.form.option.none")}</option>
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {lang === "sv" ? c.sv : c.en}
                </option>
              ))}
            </select>
          </div>
        </div>
        {locationDetailOpen ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="job-region" className="text-sm text-muted-foreground">
                {t("employer.jobs.form.field.region")}
              </label>
              <input
                id="job-region"
                className={inputCls}
                value={values.region}
                onChange={(e) => set("region", e.target.value)}
                placeholder={t("employer.jobs.form.field.regionPlaceholder")}
              />
            </div>
            <div>
              <label htmlFor="job-location-text" className="text-sm text-muted-foreground">
                {t("employer.jobs.form.field.locationText")}
              </label>
              <input
                id="job-location-text"
                className={inputCls}
                value={values.location_text}
                onChange={(e) => set("location_text", e.target.value)}
                placeholder={t("employer.jobs.form.field.locationTextPlaceholder")}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLocationDetailOpen(true)}
            className="mt-3 text-sm font-medium text-accent hover:underline"
          >
            {t("employer.jobs.form.field.locationMore")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Question
          id="job-employment-type"
          label={t("employer.jobs.form.field.employmentType")}
          help={t("employer.jobs.form.field.employmentTypeHelp")}
        >
          <select
            id="job-employment-type"
            aria-describedby="job-employment-type-help"
            className={inputCls}
            value={values.employment_type}
            onChange={(e) => set("employment_type", e.target.value)}
          >
            <option value="">{t("employer.jobs.form.option.none")}</option>
            {EMPLOYMENT_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>
                {employmentTypeLabel(v, lang)}
              </option>
            ))}
          </select>
        </Question>
        <Question
          id="job-experience-level"
          label={t("employer.jobs.form.field.experienceLevel")}
          help={t("employer.jobs.form.field.experienceLevelHelp")}
        >
          <select
            id="job-experience-level"
            aria-describedby="job-experience-level-help"
            className={inputCls}
            value={values.experience_level}
            onChange={(e) => set("experience_level", e.target.value)}
          >
            <option value="">{t("employer.jobs.form.option.none")}</option>
            {EXPERIENCE_LEVEL_VALUES.map((v) => (
              <option key={v} value={v}>
                {experienceLevelLabel(v, lang)}
              </option>
            ))}
          </select>
        </Question>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------
  // Step 2 — Beskrivning
  // ---------------------------------------------------------------------

  const stepDescription = (
    <div className="space-y-7">
      <StepHeading
        title={t("employer.jobs.form.step.description")}
        lede={t("employer.jobs.form.step.descriptionLede")}
      />

      <Question
        id="job-description"
        label={t("employer.jobs.form.field.description")}
        help={t("employer.jobs.form.field.descriptionHelp")}
        required
      >
        <textarea
          id="job-description"
          aria-describedby="job-description-help"
          ref={(el) => {
            fieldRefs.current[descPrimary] = el;
          }}
          className={inputCls}
          rows={12}
          value={values[descPrimary]}
          onChange={(e) => set(descPrimary, e.target.value)}
          placeholder={t("employer.jobs.form.field.descriptionPlaceholder")}
        />
        {descriptionAssistSlot}
        <SecondaryLanguageField
          open={secondDescOpen}
          onOpen={() => setSecondDescOpen(true)}
          openLabel={t(
            secondaryLang === "en"
              ? "employer.jobs.form.lang.addEnglish"
              : "employer.jobs.form.lang.addSwedish",
          )}
          label={t(
            secondaryLang === "en"
              ? "employer.jobs.form.field.descriptionEnglish"
              : "employer.jobs.form.field.descriptionSwedish",
          )}
          id="job-description-secondary"
        >
          <textarea
            id="job-description-secondary"
            className={inputCls}
            rows={10}
            value={values[descSecondary]}
            onChange={(e) => set(descSecondary, e.target.value)}
          />
        </SecondaryLanguageField>
      </Question>

      <div className="rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-foreground">
          {t("employer.jobs.form.section.category")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("employer.jobs.form.section.categoryHelp")}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="job-family" className="text-sm text-muted-foreground">
              {t("employer.jobs.form.field.familyId")}
            </label>
            <select
              id="job-family"
              className={inputCls}
              value={values.family_id}
              onChange={(e) => set("family_id", e.target.value)}
            >
              <option value="">{t("employer.jobs.form.option.none")}</option>
              {careerAreaLabels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name[lang]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="job-profession" className="text-sm text-muted-foreground">
              {t("employer.jobs.form.field.professionSlug")}
            </label>
            <select
              id="job-profession"
              className={inputCls}
              value={values.profession_slug}
              onChange={(e) => set("profession_slug", e.target.value)}
              disabled={professionsQuery.isLoading}
            >
              <option value="">{t("employer.jobs.form.option.none")}</option>
              {professions.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {professionLabel(p)}
                </option>
              ))}
            </select>
            {professionsQuery.isLoading && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("employer.jobs.form.profession.loading")}
              </p>
            )}
            {(professionsQuery.isError || professionsQuery.data?.error) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("employer.jobs.form.profession.loadError")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------
  // Step 3 — Ansökan
  // ---------------------------------------------------------------------

  const methodChoices: {
    value: "internal" | "external" | "email";
    icon: ReactNode;
    labelKey: TranslationKey;
    helpKey: TranslationKey;
  }[] = [
    {
      value: "internal",
      icon: <Inbox className="h-4 w-4" aria-hidden="true" />,
      labelKey: "employer.jobs.form.applicationMethod.internal",
      helpKey: "employer.jobs.form.applicationMethod.internalHelp",
    },
    {
      value: "external",
      icon: <Globe2 className="h-4 w-4" aria-hidden="true" />,
      labelKey: "employer.jobs.form.applicationMethod.external",
      helpKey: "employer.jobs.form.applicationMethod.externalHelp",
    },
    {
      value: "email",
      icon: <Mail className="h-4 w-4" aria-hidden="true" />,
      labelKey: "employer.jobs.form.applicationMethod.email",
      helpKey: "employer.jobs.form.applicationMethod.emailHelp",
    },
  ];

  const stepApplication = (
    <div className="space-y-7">
      <StepHeading
        title={t("employer.jobs.form.step.application")}
        lede={t("employer.jobs.form.step.applicationLede")}
      />

      <fieldset>
        <legend className={labelCls}>
          {t("employer.jobs.form.field.applicationMethod")}
          <Required />
        </legend>
        <div
          className="mt-2.5 space-y-2.5"
          ref={(el) => {
            fieldRefs.current.application_method = el;
          }}
          tabIndex={-1}
        >
          {methodChoices.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${
                values.application_method === c.value
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="application_method"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                checked={values.application_method === c.value}
                onChange={() => set("application_method", c.value)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {c.icon}
                  {t(c.labelKey)}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{t(c.helpKey)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {values.application_method === "external" && (
        <Question
          id="job-application-url"
          label={t("employer.jobs.form.field.applicationUrl")}
          help={t("employer.jobs.form.field.applicationUrlHelp")}
          required
        >
          <input
            id="job-application-url"
            aria-describedby="job-application-url-help"
            aria-invalid={!!draftErrors.application_url}
            ref={(el) => {
              fieldRefs.current.application_url = el;
            }}
            className={
              draftErrors.application_url
                ? `${inputCls} border-destructive focus:ring-destructive`
                : inputCls
            }
            type="url"
            inputMode="url"
            value={values.application_url}
            onChange={(e) => set("application_url", e.target.value)}
            placeholder="https://…"
          />
          <FieldError message={draftErrors.application_url && t(draftErrors.application_url)} />
        </Question>
      )}

      {values.application_method === "email" && (
        <Question
          id="job-application-email"
          label={t("employer.jobs.form.field.applicationEmail")}
          help={t("employer.jobs.form.field.applicationEmailHelp")}
          required
        >
          <input
            id="job-application-email"
            aria-describedby="job-application-email-help"
            aria-invalid={!!draftErrors.application_email}
            ref={(el) => {
              fieldRefs.current.application_email = el;
            }}
            className={
              draftErrors.application_email
                ? `${inputCls} border-destructive focus:ring-destructive`
                : inputCls
            }
            type="email"
            inputMode="email"
            value={values.application_email}
            onChange={(e) => set("application_email", e.target.value)}
          />
          <FieldError message={draftErrors.application_email && t(draftErrors.application_email)} />
        </Question>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Question
          id="job-deadline"
          label={t("employer.jobs.form.field.deadlineAt")}
          help={t("employer.jobs.form.field.deadlineAtHelp")}
        >
          <input
            id="job-deadline"
            aria-describedby="job-deadline-help"
            ref={(el) => {
              fieldRefs.current.deadline_at = el;
            }}
            className={inputCls}
            type="date"
            min={todayDateInput()}
            value={values.deadline_at}
            onChange={(e) => set("deadline_at", e.target.value)}
          />
        </Question>
        <Question
          id="job-expires"
          label={t("employer.jobs.form.field.expiresAt")}
          help={t("employer.jobs.form.field.expiresAtHelp")}
          required
        >
          <input
            id="job-expires"
            aria-describedby="job-expires-help"
            ref={(el) => {
              fieldRefs.current.expires_at = el;
            }}
            className={inputCls}
            type="date"
            min={todayDateInput()}
            max={maxExpiryDateInput()}
            value={values.expires_at}
            onChange={(e) => set("expires_at", e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("employer.jobs.form.field.expiresAtLimit").replace(
              "{days}",
              String(MAX_DISPLAY_DAYS),
            )}
          </p>
        </Question>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------
  // Step 4 — Granska
  // ---------------------------------------------------------------------

  function summaryValue(raw: string): { text: string; empty: boolean } {
    const text = raw.trim();
    return text
      ? { text, empty: false }
      : { text: t("employer.jobs.form.review.notAnswered"), empty: true };
  }

  const localTitle = values[titlePrimary] || values[titleSecondary];
  const localDesc = values[descPrimary] || values[descSecondary];
  const locationSummary = [values.city, values.region, values.location_text]
    .map((s) => s.trim())
    .filter(Boolean)
    .concat(
      values.country
        ? [countryOptions.find((c) => c.code === values.country)?.[lang] ?? values.country]
        : [],
    )
    .join(", ");

  const applicationSummary =
    values.application_method === "internal"
      ? t("employer.jobs.form.applicationMethod.internal")
      : values.application_method === "external"
        ? t("employer.jobs.form.applicationMethod.external")
        : values.application_method === "email"
          ? t("employer.jobs.form.applicationMethod.email")
          : "";

  const applicationTarget =
    values.application_method === "external"
      ? values.application_url
      : values.application_method === "email"
        ? values.application_email
        : values.application_method === "internal"
          ? t("employer.jobs.form.review.internalTarget")
          : "";

  const familyName = careerAreaLabels.find((f) => f.id === values.family_id)?.name[lang] ?? "";
  const selectedProfession = professions.find((p) => p.slug === values.profession_slug);
  const professionName = selectedProfession
    ? professionLabel(selectedProfession)
    : values.profession_slug;

  const stepReview = (
    <div className="space-y-6">
      <StepHeading
        title={t("employer.jobs.form.step.review")}
        lede={t(
          readOnly
            ? "employer.jobs.form.review.readOnlyLede"
            : PUBLICATION_MODEL === "moderated"
              ? "employer.jobs.form.step.reviewLedeModerated"
              : "employer.jobs.form.step.reviewLedeDirect",
        )}
      />

      {showBlockers && blockers.length > 0 && (
        <div
          role="alert"
          tabIndex={-1}
          ref={blockerPanelRef}
          className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 focus:outline-none focus:ring-2 focus:ring-destructive"
        >
          <p className="text-sm font-semibold text-destructive">
            {t(
              blockers.length === 1
                ? "employer.jobs.form.blockers.headingOne"
                : "employer.jobs.form.blockers.headingMany",
            ).replace("{count}", String(blockers.length))}
          </p>
          <ul className="mt-3 space-y-1.5">
            {blockers.map((b, i) => (
              <li key={`${b.field}-${i}`}>
                <button
                  type="button"
                  onClick={() => goToBlocker(b)}
                  className="text-left text-sm font-medium text-destructive underline underline-offset-2 hover:no-underline"
                >
                  {t(b.labelKey)}
                </button>
                {b.detailKey && (
                  <span className="ml-1.5 text-sm text-muted-foreground">{t(b.detailKey)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showBlockers && blockers.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">
            {t("employer.jobs.form.blockers.none")}
          </p>
        </div>
      )}

      {previewOpen ? (
        <JobAdPreview values={values} employerName={employerName} />
      ) : (
        <div className="space-y-4">
          <ReviewSection
            title={t("employer.jobs.form.step.job")}
            onEdit={readOnly ? undefined : () => setStep("job")}
            editLabel={t("employer.jobs.form.review.edit")}
            rows={[
              { label: t("employer.jobs.form.field.title"), ...summaryValue(localTitle) },
              {
                label: t("employer.jobs.form.field.workplaceType"),
                ...summaryValue(workplaceTypeLabel(values.workplace_type, lang)),
              },
              { label: t("employer.jobs.form.field.where"), ...summaryValue(locationSummary) },
              {
                label: t("employer.jobs.form.field.employmentType"),
                ...summaryValue(employmentTypeLabel(values.employment_type, lang)),
              },
              {
                label: t("employer.jobs.form.field.experienceLevel"),
                ...summaryValue(experienceLevelLabel(values.experience_level, lang)),
              },
            ]}
          />
          <ReviewSection
            title={t("employer.jobs.form.step.description")}
            onEdit={readOnly ? undefined : () => setStep("description")}
            editLabel={t("employer.jobs.form.review.edit")}
            rows={[
              {
                label: t("employer.jobs.form.field.description"),
                ...summaryValue(localDesc),
                multiline: true,
              },
            ]}
          />
          <ReviewSection
            title={t("employer.jobs.form.step.application")}
            onEdit={readOnly ? undefined : () => setStep("application")}
            editLabel={t("employer.jobs.form.review.edit")}
            rows={[
              {
                label: t("employer.jobs.form.field.applicationMethod"),
                ...summaryValue(applicationSummary),
              },
              {
                label: t("employer.jobs.form.review.applicationTarget"),
                ...summaryValue(applicationTarget),
              },
              {
                label: t("employer.jobs.form.field.deadlineAt"),
                ...summaryValue(formatDate(fromDateInput(values.deadline_at), lang)),
              },
              {
                label: t("employer.jobs.form.field.expiresAt"),
                ...summaryValue(formatDate(fromDateInput(values.expires_at), lang)),
              },
            ]}
          />
          <ReviewSection
            title={t("employer.jobs.form.section.category")}
            onEdit={readOnly ? undefined : () => setStep("description")}
            editLabel={t("employer.jobs.form.review.edit")}
            rows={[
              { label: t("employer.jobs.form.field.familyId"), ...summaryValue(familyName) },
              {
                label: t("employer.jobs.form.field.professionSlug"),
                ...summaryValue(professionName),
              },
            ]}
          />
        </div>
      )}

      {!readOnly && PUBLICATION_MODEL === "moderated" && (
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">
            {t("employer.jobs.form.review.whatHappensTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("employer.jobs.form.review.whatHappensBody")}
          </p>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------
  // Read-only view: a locked advert is exactly the review screen with no
  // way to change anything, which is also the clearest possible answer to
  // "what did we actually publish?".
  // ---------------------------------------------------------------------

  if (readOnly) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {editableStatus && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t("employer.jobs.form.readOnlyNotice")} (
            {jobStatusLabel(editableStatus, lang) || editableStatus})
          </div>
        )}
        {stepReview}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPreviewOpen((p) => !p)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            {previewOpen
              ? t("employer.jobs.form.action.hidePreview")
              : t("employer.jobs.form.action.preview")}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // The editable wizard.
  // ---------------------------------------------------------------------

  const stepIndex = STEP_IDS.indexOf(step);
  const busy = !!saving || !!submitting;

  const content =
    step === "job"
      ? stepJob
      : step === "description"
        ? stepDescription
        : step === "application"
          ? stepApplication
          : stepReview;

  return (
    <form
      className="mx-auto max-w-3xl"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <nav aria-label={t("employer.jobs.form.stepsLabel")} className="mb-6">
        <ol className="flex flex-wrap gap-x-1 gap-y-2">
          {STEP_IDS.map((id, i) => {
            const active = id === step;
            const missing = showBlockers ? (blockersByStep[id] ?? 0) : 0;
            return (
              <li key={id} className="flex items-center">
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    setStep(id);
                    setPreviewOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                    active
                      ? "bg-foreground font-medium text-background"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                      active ? "border-background/40" : "border-border"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span>{t(STEP_LABEL_KEYS[id])}</span>
                  {missing > 0 && (
                    <span className="rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white">
                      {missing}
                    </span>
                  )}
                </button>
                {i < STEP_IDS.length - 1 && (
                  <ChevronRight
                    className="mx-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <p className="mb-6 text-sm text-muted-foreground">
        <span className="text-destructive" aria-hidden="true">
          *
        </span>{" "}
        {t("employer.jobs.form.requiredLegend")}
        {" · "}
        {t("employer.jobs.form.draftLegend")}
      </p>

      {orgNotApproved && (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {t("employer.jobs.form.orgPendingNotice")}
        </div>
      )}

      {content}

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {translateJobServerError(error, t)}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => {
              setStep(STEP_IDS[stepIndex - 1]);
              setPreviewOpen(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("employer.jobs.form.action.back")}
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={handleSaveDraft}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-60"
        >
          {saving ? t("employer.jobs.form.saving") : t("employer.jobs.form.saveDraft")}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {step === "review" && (
            <button
              type="button"
              onClick={() => setPreviewOpen((p) => !p)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              {previewOpen
                ? t("employer.jobs.form.action.hidePreview")
                : t("employer.jobs.form.action.preview")}
            </button>
          )}

          {step !== "review" ? (
            <button
              type="button"
              onClick={() => {
                setStep(STEP_IDS[stepIndex + 1]);
                setPreviewOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {t("employer.jobs.form.action.next")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            onSubmitForReview && (
              <button
                type="button"
                disabled={busy}
                onClick={handlePublish}
                className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {submitting
                  ? t("employer.jobs.form.submitting")
                  : t(
                      PUBLICATION_MODEL === "moderated"
                        ? "employer.jobs.form.action.sendForPublication"
                        : "employer.jobs.form.action.publish",
                    )}
              </button>
            )
          )}
        </div>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// The second language is progressive disclosure, not a second column.
//
// The backend needs a title and a description in EITHER language, so an
// employer writing in Swedish is finished after two fields. Showing four
// text boxes side by side made a two-question step look like a four-
// question one. The other language stays one click away, and opens by
// itself whenever the advert already has content in it.
// -----------------------------------------------------------------------------

function SecondaryLanguageField({
  open,
  onOpen,
  openLabel,
  label,
  id,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  openLabel: string;
  label: string;
  id: string;
  children: ReactNode;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-2.5 text-sm font-medium text-accent hover:underline"
      >
        {openLabel}
      </button>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-dashed border-border p-3">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  editLabel,
  rows,
}: {
  title: string;
  onEdit?: () => void;
  editLabel: string;
  rows: { label: string; text: string; empty: boolean; multiline?: boolean }[];
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {editLabel}
          </button>
        )}
      </div>
      <dl className="mt-3 space-y-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid gap-0.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="text-sm text-muted-foreground">{r.label}</dt>
            <dd
              className={`text-sm ${r.empty ? "italic text-muted-foreground" : "text-foreground"} ${
                r.multiline ? "whitespace-pre-line" : ""
              }`}
            >
              {r.text}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
