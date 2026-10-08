import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import type { CaseDetail } from "@/lib/interview-intelligence/runtime.functions";
import { selectedRequirementBriefs } from "@/lib/interview-intelligence/selected-requirement-brief";
import { Field, Section, Surface } from "./InterviewLayout";

export function SelectedRequirementBrief({
  sources,
  employerSlug,
  applicationId,
}: {
  sources: CaseDetail["sources"];
  employerSlug: string;
  applicationId: string | null;
}) {
  const { t } = useT();
  const briefs = selectedRequirementBriefs(sources);
  if (briefs.length === 0) return null;
  return (
    <Section
      id="s-selected-requirements"
      title={t("rec.ri.brief.title")}
      description={t("rec.ri.brief.body")}
      action={
        applicationId ? (
          <Link
            to="/employer/$employerSlug/applications/$applicationId"
            params={{ employerSlug, applicationId }}
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
          >
            {t("iic.openApplication")}
          </Link>
        ) : undefined
      }
    >
      <ul className="space-y-3">
        {briefs.map((brief) => (
          <li key={brief.sourceId} data-testid="selected-requirement-brief">
            <Surface>
              <h3 className="text-sm font-semibold text-foreground">{brief.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("rec.ri.brief.version").replace("{n}", String(brief.profileVersion))}
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                {brief.note && <Field label={t("rec.ri.brief.note")}>{brief.note}</Field>}
                <Field label={t("rec.ri.brief.question")}>
                  {brief.neutralQuestion ?? t("rec.ri.brief.question.missing")}
                </Field>
                {brief.sourceLabel && (
                  <Field label={t("rec.ri.brief.source")}>{brief.sourceLabel}</Field>
                )}
                {brief.nextAction && (
                  <Field label={t("rec.ri.brief.next")}>{brief.nextAction}</Field>
                )}
              </dl>
            </Surface>
          </li>
        ))}
      </ul>
    </Section>
  );
}
