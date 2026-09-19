// The structured record of one theme.
//
// ── WHY THERE ARE EIGHT FIELDS AND NOT ONE NOTE BOX ──────────────────────
//
// A single free-text box collapses four different kinds of claim into one
// paragraph, and the collapse is not recoverable. Three months later nobody
// can tell which sentence was something that happened, which was the
// candidate's account of it, which was the interviewer's reading, and which
// was an alternative nobody pursued. The reader then does the natural thing
// and treats the whole paragraph as fact — including the part that was a
// guess.
//
// So the separation is structural, not advisory. The database has a column per
// kind, this form has a field per column, and the helper text under each one
// says which kind belongs there. There is no "notes" field to fall back to and
// none may be added.
//
// The two fields that are easiest to get wrong get the bluntest help:
// "observable fact" says write what a colleague would recognise, and
// "interpretation" says outright that what goes there is read as an
// interpretation and never as a fact.

import { useId, useRef, useState, type FormEvent } from "react";
import { useT } from "@/i18n/context";
import {
  BESKT_SENSITIVITY_CLASSES,
  BESKT_VERIFICATION_STATES,
  type BesktConductEntry,
  type BesktSensitivityClass,
  type BesktVerificationState,
} from "@/lib/beskt/interview-conduct.functions";
import { besktErrorKey } from "@/lib/beskt/errors";
import { BUTTON, PRIMARY_BUTTON, FIELD } from "@/components/employer/interview/InterviewUi";
import { SENSITIVITY_LABEL, TOUCH, VERIFICATION_LABEL } from "./BesktConductUi";

export interface BesktEntryFields {
  observableFact: string;
  candidateExplanation: string;
  interviewerInterpretation: string;
  alternativeExplanation: string;
  protectiveFactor: string;
  eventTiming: string;
  consequence: string;
  supportingInformation: string;
  contradictingInformation: string;
  measuresTaken: string;
  roleLink: string;
  informationGap: string;
  candidateResponse: string;
  verificationNeed: string;
  verificationState: BesktVerificationState;
  verificationSource: string;
  sensitivityClass: BesktSensitivityClass;
}

const EMPTY: BesktEntryFields = {
  observableFact: "",
  candidateExplanation: "",
  interviewerInterpretation: "",
  alternativeExplanation: "",
  protectiveFactor: "",
  eventTiming: "",
  consequence: "",
  supportingInformation: "",
  contradictingInformation: "",
  measuresTaken: "",
  roleLink: "",
  informationGap: "",
  candidateResponse: "",
  verificationNeed: "",
  verificationState: "not_required",
  verificationSource: "",
  sensitivityClass: "ordinary",
};

function fromEntry(e: BesktConductEntry): BesktEntryFields {
  return {
    observableFact: e.observableFact ?? "",
    candidateExplanation: e.candidateExplanation ?? "",
    interviewerInterpretation: e.interviewerInterpretation ?? "",
    alternativeExplanation: e.alternativeExplanation ?? "",
    protectiveFactor: e.protectiveFactor ?? "",
    eventTiming: e.eventTiming ?? "",
    consequence: e.consequence ?? "",
    supportingInformation: e.supportingInformation ?? "",
    contradictingInformation: e.contradictingInformation ?? "",
    measuresTaken: e.measuresTaken ?? "",
    roleLink: e.roleLink ?? "",
    informationGap: e.informationGap ?? "",
    candidateResponse: e.candidateResponse ?? "",
    verificationNeed: e.verificationNeed ?? "",
    verificationState: e.verificationState,
    verificationSource: e.verificationSource ?? "",
    sensitivityClass: e.sensitivityClass,
  };
}

/** At least one of the free-text fields has to say something. */
function hasContent(f: BesktEntryFields): boolean {
  return (
    f.observableFact.trim() !== "" ||
    f.candidateExplanation.trim() !== "" ||
    f.interviewerInterpretation.trim() !== "" ||
    f.alternativeExplanation.trim() !== "" ||
    f.protectiveFactor.trim() !== "" ||
    f.eventTiming.trim() !== "" ||
    f.consequence.trim() !== "" ||
    f.supportingInformation.trim() !== "" ||
    f.contradictingInformation.trim() !== "" ||
    f.measuresTaken.trim() !== "" ||
    f.roleLink.trim() !== "" ||
    f.informationGap.trim() !== "" ||
    f.candidateResponse.trim() !== "" ||
    f.verificationNeed.trim() !== ""
  );
}

export function BesktEntryForm({
  itemKey,
  correcting,
  existing,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  itemKey: string;
  /** A correction continues an existing chain and must say why. */
  correcting: boolean;
  existing: BesktConductEntry | null;
  busy: boolean;
  error: unknown;
  onSubmit: (fields: BesktEntryFields, correctionReason: string | null) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const base = useId();
  const [fields, setFields] = useState<BesktEntryFields>(
    existing && correcting ? fromEntry(existing) : EMPTY,
  );
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  const id = (name: string) => `${base}-${name}`;
  const set = (name: keyof BesktEntryFields, value: string) =>
    setFields((f) => ({ ...f, [name]: value }) as BesktEntryFields);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!hasContent(fields)) {
      setLocalError(t("beskt.conduct.entry.needsContent"));
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (correcting && reason.trim().length < 3) {
      setLocalError(t("beskt.conduct.correction.reasonRequired"));
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setLocalError(null);
    onSubmit(fields, correcting ? reason.trim() : null);
  };

  const message = localError ?? (error ? t(besktErrorKey(error)) : null);

  return (
    <form
      data-testid={`beskt-entry-form-${itemKey}`}
      className="mt-3 space-y-4"
      onSubmit={submit}
      aria-describedby={id("separation")}
    >
      <p
        id={id("separation")}
        className="max-w-[72ch] text-xs leading-relaxed text-muted-foreground"
      >
        {t("beskt.conduct.entry.separation")}
      </p>

      {message && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {message}
        </p>
      )}

      <TextField
        id={id("fact")}
        label={t("beskt.conduct.entry.observableFact")}
        help={t("beskt.conduct.entry.observableFactHelp")}
        value={fields.observableFact}
        onChange={(v) => set("observableFact", v)}
      />
      <TextField
        id={id("eventTiming")}
        label={t("beskt.fakta.eventTiming")}
        help={t("beskt.fakta.eventTimingHelp")}
        value={fields.eventTiming}
        onChange={(v) => set("eventTiming", v)}
      />
      <TextField
        id={id("consequence")}
        label={t("beskt.fakta.consequence")}
        help={t("beskt.fakta.consequenceHelp")}
        value={fields.consequence}
        onChange={(v) => set("consequence", v)}
      />
      <TextField
        id={id("cand")}
        label={t("beskt.conduct.entry.candidateExplanation")}
        help={t("beskt.conduct.entry.candidateExplanationHelp")}
        value={fields.candidateExplanation}
        onChange={(v) => set("candidateExplanation", v)}
      />
      <TextField
        id={id("interp")}
        label={t("beskt.conduct.entry.interviewerInterpretation")}
        help={t("beskt.conduct.entry.interviewerInterpretationHelp")}
        value={fields.interviewerInterpretation}
        onChange={(v) => set("interviewerInterpretation", v)}
      />
      <TextField
        id={id("alt")}
        label={t("beskt.conduct.entry.alternativeExplanation")}
        help={t("beskt.conduct.entry.alternativeExplanationHelp")}
        value={fields.alternativeExplanation}
        onChange={(v) => set("alternativeExplanation", v)}
      />
      <TextField
        id={id("supportingInformation")}
        label={t("beskt.fakta.supportingInformation")}
        help={t("beskt.fakta.supportingInformationHelp")}
        value={fields.supportingInformation}
        onChange={(v) => set("supportingInformation", v)}
      />
      <TextField
        id={id("contradictingInformation")}
        label={t("beskt.fakta.contradictingInformation")}
        help={t("beskt.fakta.contradictingInformationHelp")}
        value={fields.contradictingInformation}
        onChange={(v) => set("contradictingInformation", v)}
      />
      <TextField
        id={id("measuresTaken")}
        label={t("beskt.fakta.measuresTaken")}
        help={t("beskt.fakta.measuresTakenHelp")}
        value={fields.measuresTaken}
        onChange={(v) => set("measuresTaken", v)}
      />
      <TextField
        id={id("prot")}
        label={t("beskt.conduct.entry.protectiveFactor")}
        help={t("beskt.conduct.entry.protectiveFactorHelp")}
        value={fields.protectiveFactor}
        onChange={(v) => set("protectiveFactor", v)}
      />
      <TextField
        id={id("roleLink")}
        label={t("beskt.fakta.roleLink")}
        help={t("beskt.fakta.roleLinkHelp")}
        value={fields.roleLink}
        onChange={(v) => set("roleLink", v)}
      />
      <TextField
        id={id("need")}
        label={t("beskt.conduct.entry.verificationNeed")}
        help={t("beskt.conduct.entry.verificationNeedHelp")}
        value={fields.verificationNeed}
        onChange={(v) => set("verificationNeed", v)}
      />
      <TextField
        id={id("informationGap")}
        label={t("beskt.fakta.informationGap")}
        help={t("beskt.fakta.informationGapHelp")}
        value={fields.informationGap}
        onChange={(v) => set("informationGap", v)}
      />
      <TextField
        id={id("candidateResponse")}
        label={t("beskt.fakta.candidateResponse")}
        help={t("beskt.fakta.candidateResponseHelp")}
        value={fields.candidateResponse}
        onChange={(v) => set("candidateResponse", v)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id("vstate")} className="text-sm font-medium text-foreground">
            {t("beskt.conduct.entry.verificationState")}
          </label>
          <select
            id={id("vstate")}
            className={`${FIELD} ${TOUCH}`}
            value={fields.verificationState}
            onChange={(e) => set("verificationState", e.target.value)}
          >
            {BESKT_VERIFICATION_STATES.map((s) => (
              <option key={s} value={s}>
                {t(VERIFICATION_LABEL[s])}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.verification.openNote")}
          </p>
        </div>

        <div>
          <label htmlFor={id("sens")} className="text-sm font-medium text-foreground">
            {t("beskt.conduct.entry.sensitivityClass")}
          </label>
          <select
            id={id("sens")}
            className={`${FIELD} ${TOUCH}`}
            aria-describedby={id("sens-help")}
            value={fields.sensitivityClass}
            onChange={(e) => set("sensitivityClass", e.target.value)}
          >
            {BESKT_SENSITIVITY_CLASSES.map((s) => (
              <option key={s} value={s}>
                {t(SENSITIVITY_LABEL[s])}
              </option>
            ))}
          </select>
          <p id={id("sens-help")} className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.entry.sensitivityClassHelp")}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={id("vsource")} className="text-sm font-medium text-foreground">
          {t("beskt.conduct.entry.verificationSource")}{" "}
          <span className="font-normal text-muted-foreground">({t("beskt.conduct.optional")})</span>
        </label>
        <input
          id={id("vsource")}
          type="text"
          className={`${FIELD} ${TOUCH}`}
          aria-describedby={id("vsource-help")}
          value={fields.verificationSource}
          onChange={(e) => set("verificationSource", e.target.value)}
        />
        <p id={id("vsource-help")} className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("beskt.conduct.entry.verificationSourceHelp")}
        </p>
      </div>

      {/* `aria-required` rather than `required`.
          The native constraint fires BEFORE this form's own validation and
          shows a bubble in the BROWSER's language, not the page's -- a Swedish
          interviewer on an English-locale machine would get an English
          sentence the product never wrote. The requirement is announced to
          assistive technology and enforced in the handler below, where the
          message is ours and translated. */}
      {correcting && (
        <div className="rounded-md border border-border p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.correction.note")}
          </p>
          <label htmlFor={id("reason")} className="mt-2 block text-sm font-medium text-foreground">
            {t("beskt.conduct.correction.reason")}
          </label>
          <textarea
            id={id("reason")}
            rows={2}
            aria-required="true"
            className={`${FIELD} ${TOUCH}`}
            aria-describedby={id("reason-help")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p id={id("reason-help")} className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("beskt.conduct.correction.reasonHelp")}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          data-beskt-item={itemKey}
          className={`${PRIMARY_BUTTON} ${TOUCH}`}
        >
          {busy
            ? t("beskt.conduct.entry.saving")
            : correcting
              ? t("beskt.conduct.correction.save")
              : t("beskt.conduct.entry.save")}
        </button>
        <button type="button" onClick={onCancel} className={`${BUTTON} ${TOUCH}`}>
          {t("beskt.conduct.entry.cancel")}
        </button>
      </div>
    </form>
  );
}

/** One free-text field with its own visible help, wired by aria-describedby so
 *  the help is announced with the label rather than skipped. */
function TextField({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        className={`${FIELD} ${TOUCH}`}
        aria-describedby={`${id}-help`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p
        id={`${id}-help`}
        className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground"
      >
        {help}
      </p>
    </div>
  );
}
