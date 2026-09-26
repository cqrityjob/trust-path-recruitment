import { createFileRoute, redirect } from "@tanstack/react-router";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import { getPublishedProfession, professionInfoDestination } from "@/lib/career-center";
import { ProfessionTemplate } from "@/components/career-center/ProfessionTemplate";

// One profession guide.
//
// ── THE GATE ───────────────────────────────────────────────────────────
//
// This route resolves through `getPublishedProfession`, not `getProfession`.
// A slug that exists in the dataset but does not clear the publishability
// rule — no sources, no review date, one "content varies between countries"
// bullet where the responsibilities should be — reaches the unavailable
// state, not the template.
//
// That matters because the catalogue is not the only way in. Search engines
// hold the old URLs, the assessment result links to profession slugs, and
// people share links. Hiding a stub from the explorer while still serving it
// on a direct hit would leave the placeholder content reachable by everyone
// except the readers browsing carefully.
//
// The unavailable state is deliberately not a 404: the profession is real,
// the guide simply is not finished, and saying so is more useful than
// pretending the role does not exist. It carries `noindex` so an unfinished
// guide cannot accumulate search equity it would have to be rushed to
// deserve.

export const Route = createFileRoute("/career-center/$profession")({
  // ── A PROFESSION NAMED IN THE OTHER NAMESPACE ─────────────────────────
  //
  // `/career-center/vaktare` is a CIG slug in the Career Center's URL space.
  // It used to reach "this guide is not published yet" for a guide that IS
  // published (Väktare lives at `security-officer`), and a profession with
  // no guide at all dead-ended the same way. Resolve through the one bridge
  // instead: the guide for exactly that profession, else its reviewed
  // catalogue page. Never a neighbouring profession — an unknown slug still
  // reaches the unavailable state below.
  beforeLoad: ({ params }) => {
    if (getPublishedProfession(params.profession)) return;
    const dest = professionInfoDestination({ careerCenterSlug: params.profession });
    if (dest.kind === "career_center" && dest.slug !== params.profession) {
      throw redirect({
        to: "/career-center/$profession",
        params: { profession: dest.slug },
        replace: true,
      });
    }
    if (dest.kind === "catalogue_profile") {
      throw redirect({
        to: "/career-center/yrke/$cigSlug",
        params: { cigSlug: dest.cigSlug },
        replace: true,
      });
    }
  },
  head: ({ params }) => {
    const p = getPublishedProfession(params.profession);
    if (!p) {
      return {
        meta: [{ title: "Yrkesguide — CQrityjob" }, { name: "robots", content: "noindex" }],
      };
    }
    // Swedish metadata, for the same reason as the hub: the indexed language
    // is the one this content describes a market for, and the head cannot see
    // the client-side language toggle. The page body is fully bilingual.
    const title = `${p.titleSv} — yrkesguide | CQrityjob`;
    const url = `https://trust-path-recruitment.lovable.app/career-center/${p.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: p.description.sv },
        { property: "og:title", content: `${p.titleSv} — yrkesguide` },
        { property: "og:description", content: p.description.sv },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ProfessionPage,
});

function ProfessionPage() {
  const { profession } = Route.useParams();
  const { t } = useT();
  const data = getPublishedProfession(profession);

  if (!data) {
    return (
      <Section>
        <div className="max-w-2xl">
          <h1
            className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("cc.p.unavailable.title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t("cc.p.unavailable.body")}
          </p>
          <div className="mt-8">
            <PrimaryLink to="/career-center">{t("cc.p.unavailable.cta")}</PrimaryLink>
          </div>
        </div>
      </Section>
    );
  }

  return <ProfessionTemplate profession={data} />;
}
