// "Förbered intervju": the same case every time. Opens the interview already
// linked to the application, or creates ONE linked interview when there is
// none -- carrying the candidate, the application, the advert and the setup.

import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { prepareApplicationInterview } from "@/lib/interview-intelligence/runtime.functions";
import { interviewErrorMessage } from "@/components/employer/interview/InterviewUi";

export function PrepareInterviewButton({
  employerId,
  employerSlug,
  applicationId,
}: {
  readonly employerId: string;
  readonly employerSlug: string;
  readonly applicationId: string;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fn = useServerFn(prepareApplicationInterview);
  const go = useMutation({
    mutationFn: () => fn({ data: { employerId, applicationId } }),
    onSuccess: async ({ caseId, setupRecorded }) => {
      await queryClient.invalidateQueries({ queryKey: ["ii"] });
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/prepare",
        params: { employerSlug, caseId },
        search: setupRecorded ? {} : { setupFailed: true },
      });
    },
  });
  return (
    <div className="mt-3">
      <Button
        type="button"
        className="min-h-[44px]"
        disabled={go.isPending}
        onClick={() => go.mutate()}
        data-testid="prepare-interview"
      >
        {t("lib.prepareInterview")}
        <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">{t("lib.prepareInterview.hint")}</p>
      {go.isError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {interviewErrorMessage(go.error, t)}
        </p>
      ) : null}
    </div>
  );
}
