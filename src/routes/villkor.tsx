import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { useLocalizedHead } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { TERMS } from "@/lib/legal/documents";

// The owner's terms of use, as published. Linked from the footer and from
// registration. Content: src/lib/legal/documents.ts.

const SV = dictionaries.sv;
const URL = "https://trust-path-recruitment.lovable.app/villkor";

export const Route = createFileRoute("/villkor")({
  head: () => ({
    meta: [
      { title: SV["meta.terms.title"] },
      { name: "description", content: SV["meta.terms.description"] },
      { property: "og:title", content: SV["meta.terms.title"] },
      { property: "og:description", content: SV["meta.terms.description"] },
      { property: "og:url", content: URL },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: TermsPage,
});

function TermsPage() {
  useLocalizedHead("meta.terms.title", "meta.terms.description");
  return <LegalDocumentView doc={TERMS} testId="legal-terms" />;
}
