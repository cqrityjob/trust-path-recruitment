// A real, complete Career Discovery run for the availability spec: the 28
// buffered answers a finished anonymous run holds, the staged claim built from
// them, and the REAL snapshot the engine builds from the 22 scored ones.
//
// Everything is derived from the shipped modules rather than typed in, so the
// fixture cannot drift from the instrument: a changed question bank changes the
// run, and a stale staged claim is refused by readBuffer the way a real one is.
// Synthetic: no person, no identity, answers are "the first option".

import {
  contextStatusOf,
  recordAnswer,
  sessionItemIds,
  startBuffer,
  markComplete,
  type PublicBuffer,
} from "../../src/lib/career-discovery/v31-public-buffer";
import { CORE_ITEM_BY_ID } from "../../src/lib/career-discovery/v31/core-items";
import { OPTION_SET_BY_QUESTION } from "../../src/lib/career-discovery/v31/option-matrix";
import { isPersonalItemId, personalItem } from "../../src/lib/career-discovery/v31/personal-layer";
import {
  buildValidatedSnapshot,
  type ReportSnapshot,
} from "../../src/lib/career-discovery/v31/snapshot";
import type { Answer } from "../../src/lib/career-discovery/v31/scoring";

export const CLAIM_STORAGE_KEY = "cqj:discovery:v31:pending-claim:v1";
export const COMPLETED_AT = "2026-10-03T09:00:00.000Z";

/** The first answer to every question of the run, C1 first (it decides the
 *  Discovery Path, so the four adaptive questions exist only after it). */
export function finishedBuffer(locale: "sv" | "en"): PublicBuffer {
  let buffer = startBuffer(locale, "2026-10-03T08:40:00.000Z");
  const answerOne = (id: string) => {
    if (isPersonalItemId(id)) {
      const item = personalItem(id)!;
      buffer = recordAnswer(buffer, {
        itemId: id,
        format: "personal",
        value: item.options[0].value,
      });
      return;
    }
    const item = CORE_ITEM_BY_ID[id];
    buffer =
      item.format === "scale"
        ? recordAnswer(buffer, { itemId: id, format: "scale", value: 7 })
        : recordAnswer(buffer, {
            itemId: id,
            format: "single_choice",
            optionId: OPTION_SET_BY_QUESTION[id].options[0].id,
          });
  };
  // Two passes: the first answers what is known before C1, the second the
  // adaptive tail that C1 then decides.
  for (const id of sessionItemIds(null)) answerOne(id);
  for (const id of sessionItemIds(contextStatusOf(buffer))) {
    if (!buffer.answers.some((a) => a.itemId === id)) answerOne(id);
  }
  return markComplete(buffer, COMPLETED_AT);
}

/** What `stageClaim` writes to localStorage, for a token. */
export function stagedClaimRecord(token: string, locale: "sv" | "en", expiresAt?: string) {
  return {
    claimVersion: 1,
    claimToken: token,
    expiresAt: expiresAt ?? new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    buffer: finishedBuffer(locale),
    careerContext: null,
  };
}

/** The real snapshot the engine builds from the scored answers of that run. */
export function realSnapshot(locale: "sv" | "en"): ReportSnapshot {
  const buffer = finishedBuffer(locale);
  const answers: Answer[] = [];
  for (const a of buffer.answers) {
    if (a.format === "scale") answers.push({ itemId: a.itemId, format: "scale", value: a.value });
    else if (a.format === "single_choice")
      answers.push({ itemId: a.itemId, format: "single_choice", optionId: a.optionId });
  }
  return buildValidatedSnapshot({
    answers,
    locale,
    completedAt: COMPLETED_AT,
    professionCatalog: [],
    contextStatus: contextStatusOf(buffer),
  });
}
