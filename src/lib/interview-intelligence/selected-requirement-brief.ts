import type { CaseDetail } from "./runtime.functions";

export interface SelectedRequirementBrief {
  readonly sourceId: string;
  readonly label: string;
  readonly profileVersion: number;
  readonly note: string | null;
  readonly neutralQuestion: string | null;
  readonly nextAction: string | null;
  readonly sourceLabel: string | null;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

/** Only explicit P1 transfers have this shape. The saved brief records what a
 * person selected at that time; it is neither current source validation nor
 * confirmed interview evidence. Other employer sources remain ordinary text. */
export function selectedRequirementBriefs(
  sources: CaseDetail["sources"],
): readonly SelectedRequirementBrief[] {
  return sources.flatMap((source) => {
    if (source.kind !== "employer_requirements") return [];
    try {
      const value: unknown = JSON.parse(
        [...source.passages]
          .sort((a, b) => a.index - b.index)
          .map((p) => p.content)
          .join(""),
      );
      if (
        !record(value) ||
        !text(value.requirementId) ||
        !text(value.profileId) ||
        typeof value.profileVersion !== "number" ||
        !Number.isSafeInteger(value.profileVersion) ||
        value.profileVersion < 1 ||
        !["met", "not_met", "clarify"].includes(String(value.state))
      )
        return [];
      return [
        {
          sourceId: source.id,
          label: source.label,
          profileVersion: value.profileVersion,
          note: text(value.humanNote),
          neutralQuestion: text(value.neutralQuestion),
          nextAction: text(value.nextAction),
          sourceLabel: record(value.source) ? text(value.source.label) : null,
        },
      ];
    } catch {
      return [];
    }
  });
}
