import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, ExternalLink, Info, RotateCcw, ShieldAlert } from "lucide-react";
import { Section } from "@/components/site/Section";
import { PrimaryLink } from "@/components/site/PrimaryButton";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  REQUIREMENT_LEVEL_LABEL,
  type ProfessionDetail,
  type ProfessionLearningItem,
  type ProfessionRequirement,
} from "@/lib/career-discovery/profession-detail.functions";
import { catalogueProfileHref, professionInfoDestination } from "@/lib/career-center";
import { jobsEnabled } from "@/lib/job-intelligence/feature-flag";
import { rememberReturn } from "@/lib/career-center/return-context";
import { catalogueProfessionQuery } from "./catalogue-profession-query";
import { ProfessionBackLink } from "./ProfessionBackLink";
import { ProfessionSectionNav, type SectionLink } from "./ProfessionSectionNav";

// The reviewed catalogue's description of one profession that has no
// published guide. See routes/career-center.yrke.$cigSlug.tsx for why it
// exists and what it refuses to do.
//
// Layout follows the guide's, so a reader moving between the two recognises
// the page: title and one-sentence description first, a section index, then
// the same questions in the same order — what is the work, what is formally
// required, how do you train for it, where can it lead, where are the jobs,
// and where do these facts come from. Every section is present and says so
// when the catalogue records nothing, because on this page an absent section
// would read as "we forgot" rather than "there is nothing registered".

const KIND_KEY: Record<string, TranslationKey> = {
  promotion: "cc.cat.kind.promotion",
  specialisation: "cc.cat.kind.specialisation",
  pivot: "cc.cat.kind.pivot",
  lateral: "cc.cat.kind.lateral",
};

export function CatalogueProfessionView({ cigSlug }: { cigSlug: string }) {
  const { t, lang } = useT();
  const q = useQuery(catalogueProfessionQuery(cigSlug));
  const path = catalogueProfileHref(cigSlug);

  if (q.isPending) {
    return (
      <>
        <ProfessionBackLink targetPath={path} currentTitle={t("cc.cat.eyebrow")} />
        <Section>
          <p role="status" className="text-sm text-muted-foreground">
            {t("cc.cat.loading")}
          </p>
        </Section>
      </>
    );
  }

  if (q.isError) {
    return (
      <>
        <ProfessionBackLink targetPath={path} currentTitle={t("cc.cat.eyebrow")} />
        <Section>
          <div role="alert" data-catalogue-state="error" className="max-w-2xl">
            <h1
              className="text-3xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("cc.cat.error.title")}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {t("cc.cat.error.body")}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button
                type="button"
                onClick={() => void q.refetch()}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                {t("cc.cat.error.retry")}
              </button>
              <Link
                to="/career-center"
                hash="utforska-yrken"
                className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("cc.p.unavailable.cta")}
              </Link>
            </div>
          </div>
        </Section>
      </>
    );
  }

  const detail = q.data;
  if (!detail) {
    return (
      <>
        <ProfessionBackLink targetPath={path} currentTitle={t("cc.cat.eyebrow")} />
        <Section>
          <div data-catalogue-state="not_published" className="max-w-2xl">
            <h1
              className="text-3xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("cc.cat.missing.title")}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {t("cc.cat.missing.body")}
            </p>
            <div className="mt-8">
              <PrimaryLink to="/career-center" hash="utforska-yrken">
                {t("cc.p.unavailable.cta")}
              </PrimaryLink>
            </div>
          </div>
        </Section>
      </>
    );
  }

  return <CatalogueProfessionBody detail={detail} path={path} lang={lang} />;
}

function CatalogueProfessionBody({
  detail,
  path,
  lang,
}: {
  detail: ProfessionDetail;
  path: string;
  lang: string;
}) {
  const { t } = useT();
  const sv = lang === "sv";
  const title = sv ? detail.titleSv : detail.titleEn;
  const summary = sv ? detail.summarySv : detail.summaryEn;
  const overview = sv ? detail.overviewSv : detail.overviewEn;
  const disclaimer = sv ? detail.disclaimerSv : detail.disclaimerEn;
  const onward = detail.pathway.filter((e) => e.direction === "to");
  const inbound = detail.pathway.filter((e) => e.direction === "from");
  const learning: ProfessionLearningItem[] = [...detail.education, ...detail.certifications];
  const jobsOpen = jobsEnabled();

  const sections: SectionLink[] = [
    { id: "om-yrket", label: t("cc.nav.about") },
    { id: "arbetsmiljo", label: t("cc.cat.environment.title") },
    { id: "krav", label: t("cc.nav.requirements") },
    { id: "utbildning", label: t("cc.nav.education") },
    { id: "karriarsteg", label: t("cc.nav.next") },
    { id: "jobb", label: t("cc.nav.jobs") },
    { id: "kallor", label: t("cc.nav.sources") },
  ];

  return (
    <div data-catalogue-profession={detail.slug}>
      <ProfessionBackLink targetPath={path} currentTitle={title} />

      {/* ── TITLE AND ONE-SENTENCE ANSWER ─────────────────────────────── */}
      <section className="border-b border-border bg-secondary/60">
        <div className="mx-auto w-full max-w-6xl px-6 pb-10 pt-10 md:px-8 md:pb-14 md:pt-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("cc.cat.eyebrow")}
          </p>
          <h1
            className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground [hyphens:auto] sm:text-4xl md:text-5xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          {summary && (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {summary}
            </p>
          )}
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t("cc.p.fact.regulation")}:</dt>
              <dd className="font-semibold text-foreground">
                {detail.isRegulated ? t("cc.p.regulated") : t("cc.p.not_regulated")}
              </dd>
            </div>
            {detail.jurisdiction && (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">{t("cc.p.jurisdiction")}:</dt>
                <dd className="font-semibold text-foreground">{detail.jurisdiction}</dd>
              </div>
            )}
            {detail.lastVerified && (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">{t("cc.p.reviewed")}:</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {detail.lastVerified}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-6 flex max-w-2xl items-start gap-2 rounded-md border border-border bg-background/80 p-4 text-sm leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
            {t("cc.cat.notice")}
          </p>
        </div>
      </section>

      <ProfessionSectionNav sections={sections} />

      {/* ── OM YRKET ──────────────────────────────────────────────────── */}
      <Section id="om-yrket" className="scroll-mt-14 py-12 md:py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("cc.p.about")}</h2>
        <p className="mt-4 max-w-[70ch] text-base leading-relaxed text-muted-foreground">
          {overview || summary || t("cc.cat.about.empty")}
        </p>
        {(detail.competencies ?? []).length > 0 && (
          <>
            <h3 className="mt-8 text-lg font-semibold text-foreground">
              {t("cc.cat.competencies.title")}
            </h3>
            <RequirementList items={detail.competencies} sv={sv} />
          </>
        )}
      </Section>

      <Section bordered id="arbetsmiljo" className="scroll-mt-14 py-12 md:py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("cc.cat.environment.title")}
        </h2>
        {(detail.workEnvironments ?? []).length > 0 ? (
          <ul className="mt-4 max-w-[70ch] list-disc space-y-2 pl-5 text-base text-muted-foreground">
            {detail.workEnvironments.map((environment) => (
              <li key={environment.titleSv}>{sv ? environment.titleSv : environment.titleEn}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.cat.environment.empty")}
          </p>
        )}
      </Section>

      {/* ── FORMELLA KRAV ─────────────────────────────────────────────── */}
      <Section bordered id="krav" className="scroll-mt-14 bg-secondary/40 py-12 md:py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("cc.p.formal")}
        </h2>
        {detail.requirements.length > 0 ? (
          <RequirementList items={detail.requirements} sv={sv} />
        ) : (
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.cat.formal.empty")}
          </p>
        )}
        <p className="mt-6 flex max-w-[70ch] items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
          {t("cc.cat.formal.boundary")}
        </p>
      </Section>

      {/* ── UTBILDNING ────────────────────────────────────────────────── */}
      <Section bordered id="utbildning" className="scroll-mt-14 py-12 md:py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("cc.p.education.title")}
        </h2>
        {learning.length > 0 ? (
          <RequirementList items={learning} sv={sv} />
        ) : (
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.cat.education.empty")}
          </p>
        )}
        <h3 className="mt-8 text-lg font-semibold text-foreground">
          {t("cc.cat.experience.title")}
        </h3>
        {(detail.experience ?? []).length > 0 ? (
          <RequirementList items={detail.experience} sv={sv} />
        ) : (
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.cat.experience.empty")}
          </p>
        )}
      </Section>

      {/* ── NÄSTA STEG ────────────────────────────────────────────────── */}
      <Section bordered id="karriarsteg" className="scroll-mt-14 bg-secondary/40 py-12 md:py-14">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("cc.p.next.title")}
        </h2>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          {t("cc.cat.next.subtitle")}
        </p>
        {onward.length > 0 ? (
          <ul data-catalogue-next="list" className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {onward.map((e) => (
              <PathwayItem
                key={`to-${e.otherSlug}`}
                edge={e}
                sv={sv}
                fromPath={path}
                fromTitle={{ sv: detail.titleSv, en: detail.titleEn }}
              />
            ))}
          </ul>
        ) : (
          <div data-catalogue-next="empty" className="mt-6">
            <p className="max-w-[70ch] rounded-lg border border-border bg-background p-5 text-sm leading-relaxed text-foreground">
              {t("cc.cat.next.empty").replace("{role}", title)}
            </p>
            <Link
              to="/career-center"
              hash="utforska-yrken"
              data-catalogue-all-professions
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cc.path.next.empty.explore")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}
        {inbound.length > 0 && (
          <>
            <h3 className="mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("cc.p.prev.title")}
            </h3>
            <ul className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              {inbound.map((e) => (
                <PathwayItem
                  key={`from-${e.otherSlug}`}
                  edge={e}
                  sv={sv}
                  fromPath={path}
                  fromTitle={{ sv: detail.titleSv, en: detail.titleEn }}
                />
              ))}
            </ul>
          </>
        )}
        <p className="mt-6 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
          {t("cc.routes.disclaimer")}
        </p>
      </Section>

      {/* ── JOBB ──────────────────────────────────────────────────────── */}
      <Section bordered id="jobb" className="scroll-mt-14 py-12 md:py-14">
        <div className="flex max-w-2xl items-start gap-4 rounded-xl border border-border bg-card p-6 shadow-xs">
          <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-accent">
            <Briefcase className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("cc.p.jobs.title")}
            </h2>
            {jobsOpen ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t("cc.p.jobs.body")}
                </p>
                <Link
                  to="/jobs/profession/$professionSlug"
                  params={{ professionSlug: detail.slug }}
                  data-jobs-link={detail.slug}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("cc.jobs.for").replace("{role}", title)}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            ) : (
              <p
                data-jobs-link="closed"
                className="mt-2 text-sm leading-relaxed text-muted-foreground"
              >
                {t("cc.jobs.closed")}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ── KÄLLOR ────────────────────────────────────────────────────── */}
      <Section bordered id="kallor" className="scroll-mt-14 py-12 md:py-14">
        <div className="rounded-xl border border-border bg-background p-6 md:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("cc.p.sources")}
          </h2>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.p.reviewed")}:</dt>
              <dd className="tabular-nums text-foreground">
                {detail.lastVerified ?? t("cc.cat.sources.noDate")}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.p.jurisdiction")}:</dt>
              <dd className="text-foreground">{detail.jurisdiction ?? "—"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-medium">{t("cc.cat.sources.origin")}:</dt>
              <dd className="text-foreground">{t("cc.cat.sources.originValue")}</dd>
            </div>
          </dl>
          {detail.sources.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {detail.sources.map((s) => (
                <li key={`${s.organisation}-${s.title}`} className="text-foreground">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline-offset-4 hover:text-accent hover:underline"
                    >
                      {s.title}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    s.title
                  )}
                  <span className="text-muted-foreground"> — {s.organisation}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t("cc.cat.sources.none")}</p>
          )}
          {disclaimer && (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{disclaimer}</p>
          )}
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
            {t("cc.p.disclaimer")}
          </p>
        </div>
      </Section>
    </div>
  );
}

function RequirementList({
  items,
  sv,
}: {
  items: readonly (ProfessionRequirement | ProfessionLearningItem)[];
  sv: boolean;
}) {
  return (
    <ul className="mt-6 grid max-w-3xl grid-cols-1 gap-2">
      {items.map((item) => (
        <li
          key={`${item.titleSv}-${item.level}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-4 py-3"
        >
          <span className="text-sm text-foreground">{sv ? item.titleSv : item.titleEn}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {REQUIREMENT_LEVEL_LABEL[item.level][sv ? "sv" : "en"]}
          </span>
          {"descriptionSv" in item && (sv ? item.descriptionSv : item.descriptionEn) && (
            <p className="w-full text-sm leading-relaxed text-muted-foreground">
              {sv ? item.descriptionSv : item.descriptionEn}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function PathwayItem({
  edge,
  sv,
  fromPath,
  fromTitle,
}: {
  edge: ProfessionDetail["pathway"][number];
  sv: boolean;
  fromPath: string;
  /** This page's profession, so the next page's way back can name it. */
  fromTitle: { sv: string; en: string };
}) {
  const { t } = useT();
  const title = sv ? edge.otherTitleSv : edge.otherTitleEn;
  // Each destination opens ITS OWN information, through the same rule as
  // every other surface: its guide, else its own catalogue page.
  const info = professionInfoDestination({ cigSlug: edge.otherSlug });
  const kindKey = KIND_KEY[edge.transitionKind];
  const remember = (href: string) =>
    rememberReturn(href, "profession", `${fromPath}#karriarsteg`, fromTitle);
  // One action per card, stretched over the card: the same pattern as the
  // guide's and the hub's next-profession cards.
  const linkClass =
    "mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-sm font-semibold text-accent underline-offset-4 after:absolute after:inset-0 after:rounded-lg after:content-[''] hover:text-[color:var(--accent-hover)] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2";
  return (
    <li
      data-next-profession={edge.otherSlug}
      className="relative flex h-full flex-col rounded-lg border border-border bg-background p-4 transition-colors hover:border-accent/40"
    >
      {kindKey && (
        <span className="self-start rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
          {t(kindKey)}
        </span>
      )}
      <p className="mt-2 text-base font-semibold tracking-tight text-foreground">{title}</p>
      {info.kind === "career_center" ? (
        <Link
          to="/career-center/$profession"
          params={{ profession: info.slug }}
          onClick={() => remember(info.href)}
          className={linkClass}
        >
          {t("cc.info.read").replace("{role}", title)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : info.kind === "catalogue_profile" ? (
        <Link
          to="/career-center/yrke/$cigSlug"
          params={{ cigSlug: info.cigSlug }}
          onClick={() => remember(info.href)}
          className={linkClass}
        >
          {t("cc.info.read").replace("{role}", title)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("cc.info.none")}</p>
      )}
    </li>
  );
}
