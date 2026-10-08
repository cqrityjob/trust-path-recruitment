import { useT } from "@/i18n/context";
import type { CaseDetail } from "@/lib/interview-intelligence/runtime.functions";
import { selectedRequirementBriefs } from "@/lib/interview-intelligence/selected-requirement-brief";
import { Nothing, Section, Surface } from "./InterviewLayout";
import { Chip, SOURCE_KIND_LABEL, uiLabel } from "./InterviewUi";
import { SelectedRequirementBriefDetails } from "./SelectedRequirementBrief";

/** Uses only the case-scoped, caller-authorised read already loaded by prepare.
 * It remains readable after plan approval; no setup or evidence action lives here. */
export function SavedCaseSources({ sources }: { sources: CaseDetail["sources"] }) {
  const { t } = useT();
  return (
    <Section
      id="s-saved-sources"
      title={t("rec.ri.savedSources.title")}
      description={t("rec.ri.savedSources.body")}
    >
      {sources.length === 0 ? (
        <Nothing>{t("rec.ri.savedSources.empty")}</Nothing>
      ) : (
        <ul className="space-y-4">
          {sources.map((source) => {
            const brief = selectedRequirementBriefs([source])[0];
            return (
              <li key={source.id} id={`source-${source.id}`} className="scroll-mt-6">
                <Surface>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="work">{uiLabel(SOURCE_KIND_LABEL, source.kind, t)}</Chip>
                    <h3 className="text-sm font-semibold text-foreground">{source.label}</h3>
                  </div>
                  {brief ? (
                    <SelectedRequirementBriefDetails brief={brief} />
                  ) : source.passages.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t("rec.ri.savedSources.noReadableText")}
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3 text-sm leading-relaxed">
                      {[...source.passages]
                        .sort((a, b) => a.index - b.index)
                        .map((passage) => (
                          <p
                            key={passage.id}
                            id={`source-passage-${passage.id}`}
                            className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                          >
                            {passage.content}
                          </p>
                        ))}
                    </div>
                  )}
                </Surface>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
