// The candidate's working value for one governed item, before it is saved.
//
// Its own module because CandidatePreparation.tsx exports components, and a
// file that exports both components and plain values loses fast refresh (and
// the lint rule that says so is right).

import type {
  BesktPreparationItem,
  BesktResponseState,
} from "@/lib/beskt/candidate-preparation.functions";

export type Draft = {
  state: BesktResponseState;
  text: string;
  date: string;
  bool: boolean | null;
  options: string[];
};

/** The working value seeded from what is ACTUALLY stored, never invented. */
export function draftFrom(item: BesktPreparationItem): Draft {
  const a = item.answer;
  return {
    state: a?.responseState ?? "answered",
    text: a?.valueText ?? "",
    date: a?.valueDate ?? "",
    bool: a?.valueBoolean ?? null,
    options: [...(a?.optionKeys ?? [])],
  };
}

/** Has the candidate addressed this question in some way? */
export function isAddressed(item: BesktPreparationItem, d: Draft): boolean {
  if (d.state !== "answered") return true;
  switch (item.answerType) {
    case "boolean":
      return d.bool !== null;
    case "acknowledgement":
      return d.bool === true;
    case "short_text":
    case "long_text":
      return d.text.trim().length > 0;
    case "date":
      return d.date.trim().length > 0;
    case "single_choice":
      return d.options.length === 1;
    case "multi_choice":
      return d.options.length >= 1;
    default:
      return false;
  }
}
