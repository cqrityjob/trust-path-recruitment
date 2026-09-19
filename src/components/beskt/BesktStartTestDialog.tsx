// "Starta test" for a BESKT method under the owner's internal test activation.
//
// A preparation always belongs to one real application, so the dialog does
// not invent one: the employer picks an application of their own and the
// role-exposure profile, and the preparation is started through the same
// governed start as on the application page. The database decides whether
// this employer may use this exact content today.

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  listAssignableBesktExposureProfiles,
  startBesktPreparation,
  type BesktAssignableMethod,
} from "@/lib/beskt/candidate-preparation.functions";
import { listApplicationsForEmployer } from "@/lib/job-intelligence/applications.functions";

const SELECT =
  "mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function BesktStartTestDialog({
  open,
  onOpenChange,
  employerId,
  employerSlug,
  method,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly employerId: string;
  readonly employerSlug: string;
  readonly method: BesktAssignableMethod;
}) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const applicationsFn = useServerFn(listApplicationsForEmployer);
  const profilesFn = useServerFn(listAssignableBesktExposureProfiles);
  const startFn = useServerFn(startBesktPreparation);
  const [applicationId, setApplicationId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [operationId] = useState(() => crypto.randomUUID());

  const applications = useQuery({
    queryKey: ["beskt", "start-test", "applications", employerId],
    queryFn: () => applicationsFn({ data: { employerId } }),
    enabled: open,
    retry: false,
  });
  const profiles = useQuery({
    queryKey: ["beskt", "start-test", "profiles", employerId, method.methodVersionId],
    queryFn: () => profilesFn({ data: { employerId, methodVersionId: method.methodVersionId } }),
    enabled: open,
    retry: false,
  });

  const start = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          operationId,
          applicationId,
          methodVersionId: method.methodVersionId,
          exposureProfileId: profileId || profiles.data?.[0]?.exposureProfileId || "",
          expectedContentHash: method.contentHash,
        },
      }),
    onSuccess: () => {
      onOpenChange(false);
      void navigate({
        to: "/employer/$employerSlug/applications/$applicationId",
        params: { employerSlug, applicationId },
      });
    },
  });

  const effectiveProfile = profileId || profiles.data?.[0]?.exposureProfileId || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="beskt-start-test-dialog">
        <DialogHeader>
          <DialogTitle>{t("beskt.internalTest.start.title")}</DialogTitle>
          <DialogDescription>{t("beskt.internalTest.start.lede")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="beskt-start-test-application" className="text-sm font-medium">
              {t("beskt.internalTest.start.application")}
            </label>
            <select
              id="beskt-start-test-application"
              className={SELECT}
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            >
              <option value="">{t("beskt.internalTest.start.chooseApplication")}</option>
              {(applications.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {(lang === "sv" ? a.jobTitleSv : (a.jobTitleEn ?? a.jobTitleSv)) ?? a.id} —{" "}
                  {a.applicantDisplayName ?? t("beskt.internalTest.start.unnamed")} ·{" "}
                  {new Date(a.createdAt).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
                </option>
              ))}
            </select>
            {applications.isSuccess && applications.data.length === 0 ? (
              <p
                className="mt-1 text-xs text-muted-foreground"
                data-testid="beskt-start-test-no-applications"
              >
                {t("beskt.internalTest.start.noApplications")}
              </p>
            ) : null}
            {applications.isError ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {t("beskt.internalTest.start.applicationsFailed")}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="beskt-start-test-profile" className="text-sm font-medium">
              {t("beskt.internalTest.start.profile")}
            </label>
            <select
              id="beskt-start-test-profile"
              className={SELECT}
              value={effectiveProfile}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {(profiles.data ?? []).map((p) => (
                <option key={p.exposureProfileId} value={p.exposureProfileId}>
                  {(lang === "sv" ? p.dutiesSv : (p.dutiesEn ?? p.dutiesSv))?.slice(0, 80) ??
                    p.profileKey}
                </option>
              ))}
            </select>
          </div>
          {start.isError ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="beskt-start-test-error"
            >
              {t(besktErrorKey(start.error))}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => onOpenChange(false)}
          >
            {t("beskt.admin.family.cancel")}
          </Button>
          <Button
            type="button"
            className="min-h-[44px]"
            disabled={!applicationId || !effectiveProfile || start.isPending}
            onClick={() => start.mutate()}
            data-testid="beskt-start-test-submit"
          >
            {start.isPending
              ? t("beskt.internalTest.start.working")
              : t("beskt.internalTest.start.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
