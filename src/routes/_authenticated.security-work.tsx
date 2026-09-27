import { createFileRoute } from "@tanstack/react-router";
import { SecurityWorkRoot } from "@/components/security-work/SecurityWorkLayout";
import { useLocalizedHead } from "@/i18n/context";
import { securityWorkSv } from "@/i18n/security-work-copy";

// The workspace's own name in the tab, in the reader's language (MVP text
// specification §14): Swedish from the head, English swapped in on the
// client. Indexing is unchanged.
export const Route = createFileRoute("/_authenticated/security-work")({
  ssr: false,
  head: () => ({
    meta: [
      { title: securityWorkSv["sw.meta.title"] },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SecurityWorkRoute,
});

function SecurityWorkRoute() {
  useLocalizedHead("sw.meta.title");
  return <SecurityWorkRoot />;
}
