// /beskt/inbjudan/$token — a BESKT invitation, opened by the invited person.
//
// The sign-in gate is `_authenticated`: someone who follows the link signed
// out is sent to sign in (or create an account) and brought back here. The
// database then shows the invitation only to the account whose CONFIRMED
// e-mail address was invited; to anyone else it says the invitation is not
// available -- the same answer for a wrong link and for someone else's.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/site/Section";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { besktErrorKey } from "@/lib/beskt/errors";
import { acceptBesktInvitation, getBesktInvitation } from "@/lib/beskt/complete.functions";
import { purposeKey } from "@/components/beskt/BesktModulePanels";

export const Route = createFileRoute("/_authenticated/beskt/inbjudan/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "BESKT — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: InvitationRoute,
});

const REASON: Record<string, TranslationKey> = {
  not_available: "beskt.invitation.notAvailable",
  email_not_confirmed: "beskt.invitation.emailNotConfirmed",
  already_accepted: "beskt.invitation.alreadyAccepted",
  revoked: "beskt.invitation.revoked",
  expired: "beskt.invitation.expired",
};

function InvitationRoute() {
  const { token } = Route.useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const getFn = useServerFn(getBesktInvitation);
  const acceptFn = useServerFn(acceptBesktInvitation);
  const [operationId] = useState(() => crypto.randomUUID());
  const valid = /^[0-9a-f]{64}$/.test(token);

  const invitation = useQuery({
    queryKey: ["beskt", "invitation", token],
    queryFn: () => getFn({ data: { token } }),
    enabled: valid,
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { operationId, token } }),
    onSuccess: ({ assignmentId }) =>
      void navigate({
        to: "/my-career/preparation/$assignmentId",
        params: { assignmentId },
      }),
  });

  const inv = invitation.data;
  return (
    <SiteLayout>
      <Section>
        <div className="mx-auto max-w-2xl" data-testid="beskt-invitation">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            BESKT
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {t("beskt.invitation.title")}
          </h1>
          {!valid ? (
            <Alert className="mt-6">
              <AlertDescription>{t("beskt.invitation.notAvailable")}</AlertDescription>
            </Alert>
          ) : invitation.isPending ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t("beskt.library.loading")}
            </p>
          ) : invitation.isError || !inv ? (
            <Alert variant="destructive" className="mt-6">
              <AlertDescription>{t("beskt.library.error")}</AlertDescription>
            </Alert>
          ) : inv.assignmentId && inv.reason === "already_accepted" ? (
            <div className="mt-6">
              <Alert>
                <AlertDescription>{t("beskt.invitation.alreadyAccepted")}</AlertDescription>
              </Alert>
              <Button
                type="button"
                className="mt-4 min-h-[44px]"
                onClick={() =>
                  void navigate({
                    to: "/my-career/preparation/$assignmentId",
                    params: { assignmentId: inv.assignmentId! },
                  })
                }
              >
                {t("beskt.invitation.open")}
              </Button>
            </div>
          ) : !inv.available ? (
            <Alert className="mt-6" data-testid="beskt-invitation-unavailable">
              <AlertDescription>
                {t(REASON[inv.reason ?? "not_available"] ?? REASON.not_available)}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="mt-6">
              <dl className="space-y-3 rounded-lg border p-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t("beskt.invitation.employer")}
                  </dt>
                  <dd className="font-medium" data-testid="beskt-invitation-employer">
                    {inv.employerName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("beskt.invitation.role")}</dt>
                  <dd className="font-medium">{inv.roleTitle}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("beskt.invitation.purpose")}</dt>
                  <dd className="font-medium">{inv.mode ? t(purposeKey(inv.mode)) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("beskt.invitation.contact")}</dt>
                  <dd>{inv.contactStatement}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">{t("beskt.invitation.lede")}</p>
              {accept.isError ? (
                <Alert variant="destructive" className="mt-4">
                  <AlertTitle>{t("beskt.invitation.acceptFailed")}</AlertTitle>
                  <AlertDescription>{t(besktErrorKey(accept.error))}</AlertDescription>
                </Alert>
              ) : null}
              <Button
                type="button"
                className="mt-4 min-h-[44px]"
                disabled={accept.isPending}
                onClick={() => accept.mutate()}
                data-testid="beskt-invitation-accept"
              >
                {accept.isPending ? t("beskt.invitation.accepting") : t("beskt.invitation.accept")}
              </Button>
            </div>
          )}
        </div>
      </Section>
    </SiteLayout>
  );
}
