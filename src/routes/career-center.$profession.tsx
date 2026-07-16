import { createFileRoute } from "@tanstack/react-router";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { getProfession, L } from "@/lib/career-center";
import { ProfessionTemplate } from "@/components/career-center/ProfessionTemplate";

export const Route = createFileRoute("/career-center/$profession")({
  head: ({ params }) => {
    const p = getProfession(params.profession);
    if (!p) {
      return {
        meta: [
          { title: "Profession — CQrityjob" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${p.title.en} — CQrityjob`;
    const desc = p.short.en;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `/career-center/${p.slug}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `/career-center/${p.slug}` }],
    };
  },
  component: ProfessionPage,
});

function ProfessionPage() {
  const { profession } = Route.useParams();
  const { t, lang } = useT();
  const data = getProfession(profession);

  void lang;
  if (!data) {
    return (
      <Section>
        <div className="max-w-2xl">
          <h1
            className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("cc.profession.notfound.title")}
          </h1>
          <p className="mt-4 text-muted-foreground">{t("cc.profession.notfound.body")}</p>
          <div className="mt-8">
            <PrimaryLink to="/career-center">{t("cc.profession.notfound.cta")}</PrimaryLink>
          </div>
        </div>
      </Section>
    );
  }

  return <ProfessionTemplate profession={data} />;
}
