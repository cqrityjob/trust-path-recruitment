import { createFileRoute } from "@tanstack/react-router";
import { SentinelReviewGallery } from "@/components/sentinel/ReviewGallery";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
export const Route = createFileRoute("/_authenticated/admin/assessments/sentinel")({
  component: () => (
    <SiteLayout>
      <AdminShellChrome activeSection="assessments">
        <SentinelReviewGallery />
      </AdminShellChrome>
    </SiteLayout>
  ),
});
