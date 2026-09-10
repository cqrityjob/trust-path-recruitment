// What the interviewed person can see about this interview — shown to the
// employer, on the employer's own screen.
//
// ── WHY THIS IS HERE AT ALL ─────────────────────────────────────────────
//
// The audit behind E3 turned up something worth saying plainly: there is no
// external interview notice in this product. No invitation email, no edge
// function, no token link. A candidate learns that an interview concerns them
// from their own signed-in page, and that page IS the notice.
//
// Which means a recruiter has no idea what it says. They cannot open it — it
// is the candidate's page, scoped to the candidate — and nothing on their own
// screens has ever told them. So a recruiter could reasonably believe the
// product had explained retention to the person, when in fact it had told them
// that no retention date has been set.
//
// This panel closes that. It renders the SAME eleven elements from the SAME
// projection the candidate's page uses, so the two cannot drift, and it names
// the ones this case cannot state.
//
// ── AND WHAT IT IS CAREFUL NOT TO CLAIM ─────────────────────────────────
//
// It does not say the notice is lawful, sufficient, or compliant with
// anything. It says which of eleven things the person can currently be told,
// and which they cannot. Whether that discharges an obligation is a question
// for legal review, and this panel is deliberately not an answer to it — the
// copy says so.
//
// Nothing here is a control. Nothing is written, acknowledged or confirmed:
// the product has no candidate acknowledgement step to confirm, and inventing
// a checkbox that recorded one would be recording something that did not
// happen.

import { AlertTriangle, Check } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  NOTICE_ELEMENTS,
  noticeGaps,
  projectCandidateNotice,
  type NoticeInput,
} from "@/lib/interview-intelligence/candidate-notice";
import { Eyebrow, Nothing, Section } from "./InterviewLayout";

const ELEMENT_LABEL: Record<(typeof NOTICE_ELEMENTS)[number], TranslationKey> = {
  whoInitiated: "iin.el.whoInitiated",
  whichRole: "iin.el.whichRole",
  purpose: "iin.el.purpose",
  whatIsRecorded: "iin.el.whatIsRecorded",
  aiProposes: "iin.el.aiProposes",
  humanConfirms: "iin.el.humanConfirms",
  aiDoesNotDecide: "iin.el.aiDoesNotDecide",
  whoCanAccess: "iin.el.whoCanAccess",
  summaryMayBeShared: "iin.el.summaryMayBeShared",
  retention: "iin.el.retention",
  contact: "iin.el.contact",
};

export function CandidateNoticePanel({ input }: { input: NoticeInput }) {
  const { t } = useT();
  const states = projectCandidateNotice(input);
  const gaps = noticeGaps(states);

  return (
    <Section id="ii-notice" title={t("iin.heading")} description={t("iin.lede")}>
      {/* The gap, FIRST and named. A list of eleven ticks with one cross
          somewhere in it is a list nobody reads to the end. */}
      {gaps.length > 0 && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-600/40 bg-amber-500/5 p-4"
        >
          <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t("iin.gaps.title")}
          </p>
          <ul className="mt-2 space-y-1">
            {gaps.map((g) => (
              <li key={g} className="text-sm text-foreground">
                {t(ELEMENT_LABEL[g])} —{" "}
                <span className="text-muted-foreground">
                  {t(
                    states[g] === "notConfigured" ? "iin.state.notConfigured" : "iin.state.unknown",
                  )}
                </span>
              </li>
            ))}
          </ul>
          {/* The one gap this product can actually be specific about. */}
          {states.retention === "notConfigured" && (
            <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
              {t("iin.retention.howToSet")}
            </p>
          )}
        </div>
      )}

      <Eyebrow>{t("iin.stated")}</Eyebrow>
      <ul className="mt-2 space-y-1.5">
        {NOTICE_ELEMENTS.filter((e) => states[e] === "stated").map((e) => (
          <li key={e} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t(ELEMENT_LABEL[e])}
          </li>
        ))}
      </ul>

      {NOTICE_ELEMENTS.every((e) => states[e] !== "stated") && <Nothing>{t("iin.none")}</Nothing>}

      {/* The sentence that keeps this panel from being read as an assurance.
          It reports what the product can say. It does not certify it. */}
      <p className="mt-5 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
        {t("iin.footnote")}
      </p>
    </Section>
  );
}
