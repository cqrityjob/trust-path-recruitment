import { useT } from "@/i18n/context";
import type { CaseDetail } from "@/lib/interview-intelligence/runtime.functions";
import { selectedRequirementBriefs } from "@/lib/interview-intelligence/selected-requirement-brief";
import { Nothing, Section, Surface } from "./InterviewLayout";
import { Chip, SOURCE_KIND_LABEL, uiLabel } from "./InterviewUi";
import { SelectedRequirementBriefDetails } from "./SelectedRequirementBrief";
import { isSeededGuideRequirementsSource } from "@/lib/interview-intelligence/seeded-guide-source";

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
                  ) : isSeededGuideRequirementsSource(source) ? (
                    /* The guide's C1–C6, seeded into the case as a citable
                       source when it was created. The text is the same as the
                       role-requirements panel's, so it is shown there -- once
                       -- and named here: short headings and a link, with the
                       verbatim passages behind a fold for anyone citing them. */
                    <div className="mt-3 text-sm" data-testid="ii-seeded-guide-source">
                      <p className="text-muted-foreground">
                        {t("rec.ri.savedSources.guideCopy")}{" "}
                        <a href="#s-reqs" className="font-medium text-accent hover:underline">
                          {t("rec.ri.savedSources.guideCopyLink")}
                        </a>
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {[...source.passages]
                          .sort((a, b) => a.index - b.index)
                          .map((passage) => (
                            <li key={passage.id} id={`source-passage-${passage.id}`}>
                              {passage.content.split("\n")[0]}
                            </li>
                          ))}
                      </ul>
                      <details className="mt-2">
                        <summary className="min-h-[44px] cursor-pointer text-xs font-medium text-accent underline-offset-2 hover:underline">
                          {t("rec.ri.savedSources.guideCopyShow")}
                        </summary>
                        <div className="mt-2 space-y-3 text-sm leading-relaxed">
                          {[...source.passages]
                            .sort((a, b) => a.index - b.index)
                            .map((passage) => (
                              <p
                                key={passage.id}
                                className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                              >
                                {passage.content}
                              </p>
                            ))}
                        </div>
                      </details>
                    </div>
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
