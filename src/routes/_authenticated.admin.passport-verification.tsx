// Security Passport -- the verification queue inside the platform-admin shell.
//
// The queue itself now lives in /passport-review, which is the route a
// dedicated `passport_verifier` reaches WITHOUT being a platform admin --
// the whole point of the least-privilege pass. This route is kept so a
// platform admin's experience is unchanged: same URL, same admin
// navigation, same queue. Platform admins remain verifiers
// (`sp_is_verifier` accepts admin OR the dedicated role), so nothing an
// admin could review before became unreachable.
//
// The admin-layout gate above still applies here, which is exactly the
// point: this route is admin-only, and the reviewer route is the one that
// is not.

import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { PassportReviewWorkspace } from "@/routes/_authenticated.passport-review";

export const Route = createFileRoute("/_authenticated/admin/passport-verification")({
  ssr: false,
  component: PassportVerificationQueueRoute,
});

function PassportVerificationQueueRoute() {
  return (
    <SiteLayout>
      <AdminShellChrome activeSection="passportVerification">
        <PassportReviewWorkspace />
      </AdminShellChrome>
    </SiteLayout>
  );
}
