// Lightweight test-group feedback (Execution Mandate §31). Deliberately
// small: five closed questions plus one optional short note — not a survey.

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { useT } from "@/i18n/context";
import { submitV31Feedback } from "@/lib/career-discovery/v31-feedback.functions";

function YesNoUnsure({
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="mt-2 flex gap-2" role="radiogroup">
      {[
        { v: true, label: yesLabel },
        { v: false, label: noLabel },
      ].map((opt) => (
        <button
          key={String(opt.v)}
          type="button"
          role="radio"
          aria-checked={value === opt.v}
          onClick={() => onChange(value === opt.v ? null : opt.v)}
          className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
            value === opt.v
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function FeedbackForm({ locale }: { locale: "sv" | "en" }) {
  const { t } = useT();
  const submit = useServerFn(submitV31Feedback);
  const [relevant, setRelevant] = useState<number | null>(null);
  const [understoodWhy, setUnderstoodWhy] = useState<boolean | null>(null);
  const [pathwayRealistic, setPathwayRealistic] = useState<boolean | null>(null);
  const [requirementsUseful, setRequirementsUseful] = useState<boolean | null>(null);
  const [missingCareerNote, setMissingCareerNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  if (status === "done") {
    return (
      <div className="mt-10 rounded-lg border border-border bg-background p-6 text-center">
        <Check className="mx-auto h-5 w-5 text-accent" aria-hidden="true" />
        <p className="mt-2 text-sm text-muted-foreground">
          {t("careerDiscovery.report.v31.feedback.thanks")}
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    await submit({
      data: {
        relevant: relevant ?? undefined,
        understoodWhy: understoodWhy ?? undefined,
        pathwayRealistic: pathwayRealistic ?? undefined,
        requirementsUseful: requirementsUseful ?? undefined,
        missingCareerNote: missingCareerNote.trim() || undefined,
        locale,
      },
    });
    setStatus("done");
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-10 rounded-lg border border-border bg-background p-6"
    >
      <h3 className="text-base font-semibold text-foreground">
        {t("careerDiscovery.report.v31.feedback.title")}
      </h3>

      <fieldset className="mt-5 border-0 p-0">
        <legend className="text-sm text-foreground">
          {t("careerDiscovery.report.v31.feedback.relevant")}
        </legend>
        <div className="mt-2 flex gap-2" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={relevant === n}
              aria-label={String(n)}
              onClick={() => setRelevant(relevant === n ? null : n)}
              className={`h-9 w-9 rounded-full border text-sm transition-colors ${
                relevant === n
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5 border-0 p-0">
        <legend className="text-sm text-foreground">
          {t("careerDiscovery.report.v31.feedback.understoodWhy")}
        </legend>
        <YesNoUnsure
          value={understoodWhy}
          onChange={setUnderstoodWhy}
          yesLabel={t("careerDiscovery.report.v31.feedback.yes")}
          noLabel={t("careerDiscovery.report.v31.feedback.no")}
        />
      </fieldset>

      <fieldset className="mt-5 border-0 p-0">
        <legend className="text-sm text-foreground">
          {t("careerDiscovery.report.v31.feedback.pathwayRealistic")}
        </legend>
        <YesNoUnsure
          value={pathwayRealistic}
          onChange={setPathwayRealistic}
          yesLabel={t("careerDiscovery.report.v31.feedback.yes")}
          noLabel={t("careerDiscovery.report.v31.feedback.no")}
        />
      </fieldset>

      <fieldset className="mt-5 border-0 p-0">
        <legend className="text-sm text-foreground">
          {t("careerDiscovery.report.v31.feedback.requirementsUseful")}
        </legend>
        <YesNoUnsure
          value={requirementsUseful}
          onChange={setRequirementsUseful}
          yesLabel={t("careerDiscovery.report.v31.feedback.yes")}
          noLabel={t("careerDiscovery.report.v31.feedback.no")}
        />
      </fieldset>

      <div className="mt-5">
        <label htmlFor="feedback-missing-career" className="text-sm text-foreground">
          {t("careerDiscovery.report.v31.feedback.missingCareer")}
        </label>
        <textarea
          id="feedback-missing-career"
          value={missingCareerNote}
          onChange={(e) => setMissingCareerNote(e.target.value)}
          maxLength={500}
          rows={2}
          className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-6 inline-flex h-10 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] disabled:opacity-60"
      >
        {t("careerDiscovery.report.v31.feedback.submit")}
      </button>
    </form>
  );
}
