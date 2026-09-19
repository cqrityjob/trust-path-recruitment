// "Förbered intervju": the interview that belongs to ONE start -- a completed
// test (assessmentAssignmentId), or, before any test, a setup the employer
// chooses here. The database opens the start's case or creates exactly one,
// bound to the application's own candidate (scp_iv_start_interview); nothing
// here picks a role for anyone, and nothing falls back to Väktare.

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { startApplicationInterview, type StartResult } from "@/lib/library/start.functions";
import type { StartSetup } from "@/lib/library/start-routing";
import { interviewErrorMessage } from "@/components/employer/interview/InterviewUi";

function setupKey(s: StartSetup): string {
  return `${s.roleGroup}:${s.roleProfile}:${s.environment}`;
}

export function PrepareInterviewButton({
  employerId,
  employerSlug,
  applicationId,
  assessmentAssignmentId,
}: {
  readonly employerId: string;
  readonly employerSlug: string;
  readonly applicationId: string;
  /** The completed test this interview follows; null before any test. */
  readonly assessmentAssignmentId: string | null;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fn = useServerFn(startApplicationInterview);
  const [choices, setChoices] = useState<readonly StartSetup[] | null>(null);
  const [chosen, setChosen] = useState("");

  const go = useMutation({
    mutationFn: (setup: StartSetup | null) =>
      fn({ data: { employerId, applicationId, assessmentAssignmentId, setup } }),
    onSuccess: async (res: StartResult) => {
      if (res.kind === "choose") {
        setChoices(res.choices);
        setChosen(res.choices.length === 1 ? setupKey(res.choices[0]!) : "");
        return;
      }
      if (res.kind !== "started") return;
      await queryClient.invalidateQueries({ queryKey: ["ii"] });
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/prepare",
        params: { employerSlug, caseId: res.caseId },
        search: res.complete ? {} : { setupFailed: true },
      });
    },
  });

  const refused = go.data?.kind === "refused" ? go.data.reason : null;
  const testId = assessmentAssignmentId
    ? `prepare-interview-${assessmentAssignmentId}`
    : "prepare-interview";

  return (
    <div className="mt-3" data-testid={`${testId}-block`}>
      {choices === null ? (
        <Button
          type="button"
          className="min-h-[44px]"
          disabled={go.isPending}
          onClick={() => go.mutate(null)}
          data-testid={testId}
        >
          {t("lib.prepareInterview")}
          <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
        </Button>
      ) : (
        <fieldset
          className="rounded-lg border border-border p-3"
          data-testid="prepare-interview-choose"
        >
          <legend className="px-1 text-sm font-medium">{t("lib.start.choose.heading")}</legend>
          <p className="text-xs text-muted-foreground">
            {t(
              assessmentAssignmentId ? "lib.start.choose.afterTest" : "lib.start.choose.beforeTest",
            )}
          </p>
          <ul className="mt-2 space-y-1">
            {choices.map((c) => (
              <li key={setupKey(c)}>
                <label className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${testId}-setup`}
                    value={setupKey(c)}
                    checked={chosen === setupKey(c)}
                    onChange={() => setChosen(setupKey(c))}
                  />
                  <span>
                    TRUST · {t(`lib.role.${c.roleProfile}` as TranslationKey)} ·{" "}
                    {t(`lib.env.${c.environment}` as TranslationKey)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            className="mt-2 min-h-[44px]"
            disabled={go.isPending || chosen === ""}
            onClick={() => go.mutate(choices.find((c) => setupKey(c) === chosen) ?? null)}
            data-testid="prepare-interview-choose-submit"
          >
            {t("lib.start.choose.submit")}
          </Button>
        </fieldset>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{t("lib.prepareInterview.hint")}</p>
      {refused ? (
        <p
          role="alert"
          className="mt-2 text-sm text-destructive"
          data-testid="prepare-interview-refused"
        >
          {t(`lib.start.refused.${refused}` as TranslationKey)}
        </p>
      ) : null}
      {go.isError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {interviewErrorMessage(go.error, t)}
        </p>
      ) : null}
    </div>
  );
}
