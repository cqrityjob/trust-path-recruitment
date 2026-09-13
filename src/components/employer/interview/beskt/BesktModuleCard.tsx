// The BESKT module on the interview case overview.
//
// ── WHY IT IS A CARD AND NOT A STAGE ─────────────────────────────────────
//
// The workflow has four stages — prepare, interview, assess, report — and
// every case has all four. BESKT has neither of those properties: it exists
// only where a candidate preparation was linked and submitted, and it does not
// advance the case when it is used. Making it a fifth stage would have
// promised a step that most cases do not have and implied a progression it
// does not cause.
//
// ── WHY IT IS STILL VISIBLE WHEN IT IS NOT AVAILABLE ─────────────────────
//
// Because "the link is there but the candidate has not submitted yet" is
// information a recruiter needs, and an absent card cannot convey it. A card
// that vanishes teaches people that the feature is unreliable; a card that
// says which of the four conditions is not met teaches them what to do next.
// The one case where nothing is shown is a case with no link at all, where
// there is genuinely nothing to say.

import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import type { BesktCaseModule } from "@/lib/beskt/interview-conduct.functions";
import { Chip, PRIMARY_BUTTON } from "@/components/employer/interview/InterviewUi";
import { TOUCH } from "./BesktConductUi";

export function BesktModuleCard({
  module,
  employerSlug,
  caseId,
}: {
  module: BesktCaseModule;
  employerSlug: string;
  caseId: string;
}) {
  const { t } = useT();

  // No link: no module, and nothing worth saying about one.
  if (!module.linked) return null;

  const blocked = !module.submitted
    ? t("beskt.module.notSubmitted")
    : !module.methodBindingValid
      ? t("beskt.module.bindingInvalid")
      : null;

  return (
    <section
      data-testid="beskt-module-card"
      className="rounded-lg border border-border p-4"
      aria-labelledby="beskt-module-h"
    >
      <h2 id="beskt-module-h" className="text-sm font-semibold text-foreground">
        {t("beskt.module.title")}
      </h2>
      <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.module.lede")}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t("beskt.module.themeCount")}</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {module.topics.length}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("beskt.module.answerCount")}</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">
            {module.answers.length}
          </dd>
        </div>
        {module.linkedAt && (
          <div>
            <dt className="text-xs text-muted-foreground">{t("beskt.module.linkedAt")}</dt>
            <dd className="text-sm text-foreground">{module.linkedAt.slice(0, 10)}</dd>
          </div>
        )}
      </dl>

      <p className="mt-3">
        <Chip tone="neutral">
          {module.sessionId === null
            ? t("beskt.module.sessionNone")
            : t("beskt.module.sessionOpen")}
        </Chip>
      </p>

      {blocked !== null ? (
        <p className="mt-3 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">{blocked}</p>
      ) : (
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId/beskt"
          params={{ employerSlug, caseId }}
          search={{ view: "interview" as const }}
          className={`${PRIMARY_BUTTON} ${TOUCH} mt-4`}
        >
          {module.sessionId === null ? t("beskt.module.open") : t("beskt.module.continue")}
        </Link>
      )}

      {/* The limits, on the surface where a recruiter first meets the module
          rather than only inside it. */}
      <p className="mt-4 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.module.limits")}
      </p>
    </section>
  );
}
