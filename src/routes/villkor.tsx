import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLocalizedHead } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { TERMS } from "@/lib/legal/documents";
import { TERMS_FINAL } from "@/lib/legal/status";
import { siteUrl } from "@/lib/site-origin";

// The owner's terms of use, as published. Linked from the footer and from
// registration. Content: src/lib/legal/documents.ts.

const SV = dictionaries.sv;
const URL = siteUrl("/villkor");

export const Route = createFileRoute("/villkor")({
  head: () => ({
    meta: [
      { title: SV["meta.terms.title"] },
      { name: "description", content: SV["meta.terms.description"] },
      { property: "og:title", content: SV["meta.terms.title"] },
      { property: "og:description", content: SV["meta.terms.description"] },
      { property: "og:url", content: URL },
      // A draft is not offered to search engines as the published text.
      ...(TERMS_FINAL ? [] : [{ name: "robots", content: "noindex" }]),
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: TermsPage,
});

function TermsPage() {
  useLocalizedHead("meta.terms.title", "meta.terms.description");
  return <LegalDocumentView doc={TERMS} final={TERMS_FINAL} testId="legal-terms" />;
}
