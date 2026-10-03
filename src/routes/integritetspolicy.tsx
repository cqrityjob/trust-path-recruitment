import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLocalizedHead } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { PRIVACY } from "@/lib/legal/documents";
import { PRIVACY_FINAL } from "@/lib/legal/status";

// The owner's privacy policy, as published. Linked from the footer and from
// registration. Content: src/lib/legal/documents.ts.

const SV = dictionaries.sv;
const URL = "https://trust-path-recruitment.lovable.app/integritetspolicy";

export const Route = createFileRoute("/integritetspolicy")({
  head: () => ({
    meta: [
      { title: SV["meta.privacy.title"] },
      { name: "description", content: SV["meta.privacy.description"] },
      { property: "og:title", content: SV["meta.privacy.title"] },
      { property: "og:description", content: SV["meta.privacy.description"] },
      { property: "og:url", content: URL },
      // A draft is not offered to search engines as the published text.
      ...(PRIVACY_FINAL ? [] : [{ name: "robots", content: "noindex" }]),
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  useLocalizedHead("meta.privacy.title", "meta.privacy.description");
  return <LegalDocumentView doc={PRIVACY} final={PRIVACY_FINAL} testId="legal-privacy" />;
}
