import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { PlatformLayers } from "@/components/site/PlatformLayers";
import { DARK_H1, ON_DARK } from "@/components/site/dark-surface";
import { useLocalizedHead, useT } from "@/i18n/context";
import { dictionaries } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

// ── THE PLATFORM (2026-09-30) ───────────────────────────────────────────
//
// Every CQrityjob product on one page, built the way Legora presents its
// platform: one visual — here the chip — carrying the name of the part you
// chose, and the parts listed beside it, each opening into one sentence and
// one link to that product's own page. Breadth only: depth stays on each
// product's page, and every sentence is the one the header and homepage
// already use.

/** The server renders the Swedish page; useLocalizedHead() swaps in the
 *  English pair on the client. */
const SV = dictionaries.sv;

export const Route = createFileRoute("/plattformen")({
  head: () => ({
    meta: [
      { title: SV["meta.platform.title"] },
      { name: "description", content: SV["meta.platform.description"] },
      { property: "og:title", content: SV["meta.platform.title"] },
      { property: "og:description", content: SV["meta.platform.description"] },
      { property: "og:url", content: "https://trust-path-recruitment.lovable.app/plattformen" },
    ],
    links: [{ rel: "canonical", href: "https://trust-path-recruitment.lovable.app/plattformen" }],
  }),
  component: PlatformPage,
});

function PlatformPage() {
  const { t } = useT();
  useLocalizedHead("meta.platform.title", "meta.platform.description");
  return (
    <SiteLayout>
      <section id="plattformen" className="bg-night pb-16 pt-14 text-white md:pb-24 md:pt-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.16em]",
                ON_DARK.eyebrow,
              )}
            >
              {t("platform.eyebrow")}
            </p>
            <h1
              className={cn("mx-auto mt-4 max-w-[20ch]", DARK_H1)}
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("platform.title")}
            </h1>
            <p
              className={cn(
                "mx-auto mt-6 max-w-[62ch] text-base leading-relaxed md:text-lg",
                ON_DARK.lead,
              )}
            >
              {t("platform.lead")}
            </p>
          </div>
          <div className="mt-12">
            <PlatformLayers />
          </div>
        </Container>
      </section>
    </SiteLayout>
  );
}
