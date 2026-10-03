import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Info, RotateCcw, Route as RouteIcon, UserRound } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  L,
  icon,
  getFamily,
  jobsProfessionSlug,
  selectableOrigins,
  type CareerOrigin,
  type CatalogueNextStep,
  type Profession,
} from "@/lib/career-center";
import { jobsEnabled } from "@/lib/job-intelligence/feature-flag";
import { useCareerAnalysisOpen } from "@/components/career-discovery/use-career-analysis-open";
import { ProfessionInfoAction } from "./ProfessionInfoAction";
import { NextProfessionCard } from "./NextProfessionCard";
import { ProfessionCard } from "./ProfessionCard";

// "Vilket är ditt nuvarande yrke?" — the `pathFrom` section.
//
// ── THE ANSWER IS ON THE PAGE, NOT ONE HOP AWAY ────────────────────────
//
// Choosing a profession used to produce a card with two actions — "Läs om
// {yrke}" and "Se möjliga nästa steg", which only scrolled a few hundred
// pixels — then three transition cards whose only link was their heading,
// then "Se alla 4 nästa steg i yrkesguiden", another hop. A profession with
// no recorded move printed one sentence and a link into the full catalogue,
// where a search box and 29 filter chips waited. A reader asked "where can I
// go from here?" and was handed navigation instead of an answer.
//
// Now the choice produces the answer directly:
//
//   the profession   named, what it is, its level and regulation, its first
//                    tasks, and "Läs om {yrke}" / "Se jobb som {yrke}".
//
//   next professions EVERY recorded onward move as a card that names the
//                    profession, says in one derived sentence how it relates
//                    to this one, states its first formal requirement, and
//                    opens it with one click (NextProfessionCard).
//
//   none recorded    says so, and offers what the guide DOES record: the
//                    professions it lists as related — labelled as related,
//                    never as next steps — plus the list of every profession
//                    on this page. The information about the chosen
//                    profession itself is never a dead end.
//
// ── IT IS A QUESTION, NOT A PROFILE EDIT ───────────────────────────────
//
// The selector writes to the URL and never to the stored profile: choosing a
// role to explore from is a question, not a change to who you are. The
// surface says so beside the control, a reader whose profile holds a role
// always sees which role that is, and a temporary choice can be cleared or
// reset to the saved one. The profile is edited on the profile.
//
// ── AND IT IS NOT AN ELIGIBILITY CHECK ─────────────────────────────────
//
// `eligibilityAssessed` is typed to a constant `false` on the model. The
// disclaimer below is rendered from it, so removing the sentence means
// changing a type rather than editing a string.

export const PATH_NEXT_ANCHOR = "nasta-steg-fran-yrke";

/** How many of the chosen profession's tasks the answer lists. The guide has
 *  the rest; three is enough to say what the work is. */
const TASKS_SHOWN = 3;

export function PathFromSection({
  origin,
  profileStatus,
  onSelect,
  onClear,
  onReset,
  onRetryProfile,
  onProfessionOpen,
  listAnchor,
}: {
  origin: CareerOrigin;
  /** Whether the saved profile could be read. `anonymous` means there is no
   *  profile to read; `error` is its own state, never "no role saved". */
  profileStatus: "anonymous" | "loading" | "ready" | "error";
  /** Receives the Career Center slug the reader picked. */
  onSelect: (slug: string) => void;
  /** The reader cleared the selector. */
  onClear: () => void;
  /** Back to the profession saved in the profile. */
  onReset: () => void;
  onRetryProfile?: () => void;
  /** Fired alongside navigation to a profession, with its destination. */
  onProfessionOpen?: (href: string) => void;
  /** The id of the hub's list of every profession, for "Se alla yrken". */
  listAnchor: string;
}) {
  const { t, lang } = useT();
  const selectId = useId();
  const statusId = useId();
  const options = selectableOrigins();
  const sv = lang === "sv";
  const roleTitle = (p: Profession) => (sv ? p.titleSv : p.titleEn);

  const saved = origin.saved;
  const savedLabel = saved ? (sv ? saved.labelSv : saved.labelEn) : null;
  const selectedSlug = origin.state === "ready" ? origin.profession.slug : "";
  const temporary = origin.state === "ready" && origin.provenance === "selected";
  const cleared = origin.state === "unknown" && origin.cleared;
  const somethingShown = origin.state === "ready" || origin.state === "unsupported";

  return (
    <div data-path-from data-path-state={origin.state}>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <RouteIcon className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden />
        {t("cc.path.eyebrow")}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl">
        {t("cc.path.select.label")}
      </h2>
      <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-muted-foreground">
        {t("cc.path.subtitle")}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── THE CHOICE ─────────────────────────────────────────────── */}
        <div className="h-fit rounded-xl border border-border bg-card p-5 shadow-xs md:p-6 lg:col-span-4">
          <label
            htmlFor={selectId}
            className="block text-sm font-semibold tracking-tight text-foreground"
          >
            {t("cc.path.select.control")}
          </label>
          <select
            id={selectId}
            data-path-select
            value={selectedSlug}
            aria-describedby={statusId}
            onChange={(e) => (e.target.value ? onSelect(e.target.value) : onClear())}
            className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">{t("cc.path.select.none")}</option>
            {options.map((p) => (
              <option key={p.slug} value={p.slug}>
                {roleTitle(p)}
              </option>
            ))}
          </select>

          {/* Where the role came from, and how to get out of a temporary
              choice. Announced politely, because it changes on selection. */}
          <div id={statusId} aria-live="polite" className="mt-4 space-y-3 text-sm">
            {somethingShown && (
              <p
                data-path-provenance={origin.provenance}
                className="flex items-start gap-2 text-muted-foreground"
              >
                <span
                  className={[
                    "mt-0.5 inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    origin.provenance === "profile"
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border bg-secondary text-foreground",
                  ].join(" ")}
                >
                  {origin.provenance === "profile"
                    ? t("cc.path.badge.saved")
                    : t("cc.path.badge.temporary")}
                </span>
                <span>
                  {origin.provenance === "profile"
                    ? t("cc.path.source.profile")
                    : t("cc.path.source.selected")}
                </span>
              </p>
            )}

            {temporary && saved && savedLabel && (
              <p data-path-saved className="text-muted-foreground">
                {t("cc.path.saved.unchanged").replace("{role}", savedLabel)}
              </p>
            )}
            {cleared && (
              <p data-path-cleared className="text-muted-foreground">
                {saved && savedLabel
                  ? t("cc.path.cleared.saved").replace("{role}", savedLabel)
                  : t("cc.path.cleared")}
              </p>
            )}

            {profileStatus === "error" && (
              <p role="alert" className="text-muted-foreground">
                {t("cc.path.profile.error")}{" "}
                {onRetryProfile && (
                  <button
                    type="button"
                    onClick={onRetryProfile}
                    className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("cc.me.unreadable.retry")}
                  </button>
                )}
              </p>
            )}
            {/* The sign-in link on a line of its own, so it can be a full
                44px target rather than a word inside the sentence. */}
            {profileStatus === "anonymous" && (
              <div>
                <p className="text-muted-foreground">{t("cc.path.anonymous")}</p>
                <Link
                  to="/login"
                  search={{ redirect: "/career-center" } as never}
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("cc.path.anonymous.login")}
                </Link>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {(temporary || cleared) && saved && savedLabel && (
                <button
                  type="button"
                  data-path-reset
                  onClick={onReset}
                  className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  {t("cc.path.reset").replace("{role}", savedLabel)}
                </button>
              )}
              {somethingShown && (
                <button
                  type="button"
                  data-path-clear
                  onClick={onClear}
                  className="inline-flex min-h-11 items-center font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("cc.path.clear")}
                </button>
              )}
              {profileStatus === "ready" && (
                <Link
                  to="/my-career/profile"
                  hash="career-profile"
                  className="inline-flex min-h-11 items-center font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {saved ? t("cc.path.profile.edit") : t("cc.path.profile.add")}
                </Link>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("cc.path.select.help")}
            </p>
          </div>
        </div>

        {/* ── THE CHOSEN PROFESSION ──────────────────────────────────── */}
        {/* Nothing is drawn beside the choice until there is a profession to
            describe: an empty placeholder box asking the reader to choose
            repeated the heading above it (owner review, 2026-09-30). */}
        <div className="lg:col-span-8" hidden={!somethingShown}>
          {origin.state === "ready" && (
            <SelectedProfession
              profession={origin.profession}
              onProfessionOpen={onProfessionOpen}
            />
          )}
          {origin.state === "unsupported" && (
            <UnsupportedRole
              origin={origin}
              listAnchor={listAnchor}
              onProfessionOpen={onProfessionOpen}
            />
          )}
        </div>
      </div>

      {/* ── MÖJLIGA NÄSTA YRKEN ────────────────────────────────────────── */}
      {origin.state === "ready" && (
        <div id={PATH_NEXT_ANCHOR} className="mt-10 scroll-mt-4">
          <h3 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
            {t("cc.path.next.title").replace("{role}", roleTitle(origin.profession))}
            {origin.directions.length > 0 && " "}
            {origin.directions.length > 0 && (
              <span className="tabular-nums text-muted-foreground">
                ({origin.directions.length})
              </span>
            )}
          </h3>
          {origin.directions.length > 0 ? (
            <>
              <ul data-path-next="list" className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                {origin.directions.map((tr) => (
                  <li key={tr.to.slug}>
                    <NextProfessionCard
                      transition={tr}
                      headingLevel={4}
                      onOpen={(slug) => onProfessionOpen?.(`/career-center/${slug}`)}
                    />
                  </li>
                ))}
              </ul>
              {origin.directions.some((tr) => tr.evidenceLevel === "under_review") && (
                <p className="mt-4 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                  {t("cc.next.underReview.note")}
                </p>
              )}
            </>
          ) : (
            <NoRecordedNextStep
              profession={origin.profession}
              related={origin.related}
              listAnchor={listAnchor}
              onProfessionOpen={onProfessionOpen}
            />
          )}

          <p
            data-path-not-eligibility
            className="mt-6 flex max-w-[70ch] items-start gap-2 text-xs leading-relaxed text-muted-foreground"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
            {/* Rendered from the model. `eligibilityAssessed` is typed to a
                constant false; there is no state in which this is omitted. */}
            <span>{origin.eligibilityAssessed ? null : t("cc.path.notEligibility")}</span>
          </p>
        </div>
      )}

      {/* A saved profession the catalogue describes but no guide does: its
          recorded onward moves, read from the same catalogue. */}
      {origin.state === "unsupported" && origin.next && (
        <CatalogueNextSteps
          origin={origin}
          next={origin.next}
          listAnchor={listAnchor}
          onProfessionOpen={onProfessionOpen}
        />
      )}
    </div>
  );
}

function SelectedProfession({
  profession,
  onProfessionOpen,
}: {
  profession: Profession;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  const title = lang === "sv" ? profession.titleSv : profession.titleEn;
  const tasks = profession.responsibilities.slice(0, TASKS_SHOWN);
  // The job board is release-controlled; a link while it is closed would
  // land on "coming soon". A profession without a job identity has no jobs
  // query to run at all.
  const jobsSlug = jobsEnabled() ? jobsProfessionSlug(profession) : null;
  return (
    <article
      data-path-selected={profession.slug}
      aria-labelledby={`path-selected-${profession.slug}`}
      className="flex h-full flex-col rounded-xl border border-accent/30 bg-card p-6 shadow-sm md:p-7"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t("cc.path.selected.label")}
      </p>
      <h3
        id={`path-selected-${profession.slug}`}
        className="mt-2 text-2xl font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
        {L(profession.description, lang)}
      </p>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div className="flex gap-1">
          <dt className="text-muted-foreground">{t("cc.p.fact.level")}:</dt>
          <dd className="font-semibold text-foreground">
            {t(`cc.level.${profession.level}` as TranslationKey)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">{t("cc.p.fact.regulation")}:</dt>
          <dd className="font-semibold text-foreground">
            {profession.regulated ? t("cc.p.regulated") : t("cc.p.not_regulated")}
          </dd>
        </div>
      </dl>
      {tasks.length > 0 && (
        <div data-path-tasks className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("cc.p.day")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {tasks.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <span
                  aria-hidden
                  className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent"
                />
                {L(item, lang)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 pt-6">
        <ProfessionInfoAction
          info={{
            kind: "career_center",
            slug: profession.slug,
            href: `/career-center/${profession.slug}`,
          }}
          title={title}
          variant="button"
          onOpen={onProfessionOpen}
        />
        {jobsSlug && (
          <Link
            to="/jobs/profession/$professionSlug"
            params={{ professionSlug: jobsSlug }}
            data-path-jobs={jobsSlug}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("cc.jobs.for").replace("{role}", title)}
          </Link>
        )}
      </div>
    </article>
  );
}

/** A chosen profession with no recorded onward move. Says so in one
 *  sentence, then offers what the guide DOES record — its related
 *  professions, labelled as related — and the list of every profession. */
function NoRecordedNextStep({
  profession,
  related,
  listAnchor,
  onProfessionOpen,
}: {
  profession: Profession;
  related: readonly Profession[];
  listAnchor: string;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  const title = lang === "sv" ? profession.titleSv : profession.titleEn;
  return (
    <div data-path-next="empty" className="mt-4">
      <p className="max-w-[70ch] rounded-lg border border-border bg-background p-5 text-sm leading-relaxed text-foreground">
        {t("cc.path.next.empty").replace("{role}", title)}
      </p>
      {related.length > 0 && (
        <div data-path-related className="mt-6">
          <h4 className="text-base font-semibold tracking-tight text-foreground">
            {t("cc.path.related.title")}
          </h4>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {t("cc.path.related.body").replace("{role}", title)}
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            {related.map((p) => (
              <li key={p.slug}>
                <ProfessionCard
                  slug={p.slug}
                  title={lang === "sv" ? p.titleSv : p.titleEn}
                  description={L(p.description, lang)}
                  icon={icon(p.icon)}
                  level={t(`cc.level.${p.level}` as TranslationKey)}
                  family={getFamily(p.family) ? L(getFamily(p.family)!.name, lang) : undefined}
                  formalRequirement={
                    p.formalRequirements?.[0] ? L(p.formalRequirements[0], lang) : undefined
                  }
                  headingLevel={5}
                  onOpen={(slug) => onProfessionOpen?.(`/career-center/${slug}`)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      <a
        href={`#${listAnchor}`}
        data-path-all
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("cc.path.next.empty.explore")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}

function UnsupportedRole({
  origin,
  listAnchor,
  onProfessionOpen,
}: {
  origin: Extract<CareerOrigin, { state: "unsupported" }>;
  listAnchor: string;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  // An unsupported role is one the reader SAVED in their profile, so they are
  // signed in. The analysis link below is a door into the canonical route and
  // asks the one availability hook the route asks: withdrawn on a definite
  // "closed", kept while the answer is unknown.
  const analysisOpen = useCareerAnalysisOpen(true);
  const label =
    (lang === "sv" ? origin.labelSv : origin.labelEn) ?? t("cc.path.unsupported.unnamed");
  const inCatalogue = origin.info.kind !== "none";
  return (
    <article
      data-path-unsupported={origin.info.kind}
      className="flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-sm md:p-7"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        {t("cc.path.saved.label")}
      </p>
      <h3
        className="mt-2 text-2xl font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </h3>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
        {inCatalogue ? t("cc.path.unsupported.catalogue") : t("cc.path.unsupported.freeText")}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3 pt-6">
        {inCatalogue ? (
          <ProfessionInfoAction
            info={origin.info}
            title={label}
            variant="button"
            onOpen={onProfessionOpen}
          />
        ) : (
          <>
            {analysisOpen !== false && (
              <Link
                to="/security-career-assessment"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("cc.me.invite.cta")}
              </Link>
            )}
            <a
              href={`#${listAnchor}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cc.path.next.empty.explore")}
            </a>
          </>
        )}
      </div>
    </article>
  );
}

/** The catalogue's recorded onward moves for a saved profession that has no
 *  guide — named, labelled with the catalogue's own kind, and opened with
 *  one click through the same destination rule as everything else. */
function CatalogueNextSteps({
  origin,
  next,
  listAnchor,
  onProfessionOpen,
}: {
  origin: Extract<CareerOrigin, { state: "unsupported" }>;
  next: readonly CatalogueNextStep[];
  listAnchor: string;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  const label =
    (lang === "sv" ? origin.labelSv : origin.labelEn) ?? t("cc.path.unsupported.unnamed");
  return (
    <div id={PATH_NEXT_ANCHOR} data-path-catalogue-next className="mt-10 scroll-mt-4">
      <h3 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
        {t("cc.path.next.title").replace("{role}", label)}
      </h3>
      {next.length > 0 ? (
        <ul className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          {next.map((step) => (
            <li key={step.cigSlug}>
              <CatalogueNextCard step={step} onProfessionOpen={onProfessionOpen} />
            </li>
          ))}
        </ul>
      ) : (
        <div data-path-next="empty" className="mt-4">
          <p className="max-w-[70ch] rounded-lg border border-border bg-background p-5 text-sm leading-relaxed text-foreground">
            {t("cc.path.next.empty").replace("{role}", label)}
          </p>
          <a
            href={`#${listAnchor}`}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            {t("cc.path.next.empty.explore")}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      )}
      <p className="mt-6 flex max-w-[70ch] items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
        <span>
          {t("cc.cat.next.subtitle")} {t("cc.path.notEligibility")}
        </span>
      </p>
    </div>
  );
}

const CATALOGUE_KIND: Record<string, TranslationKey> = {
  promotion: "cc.cat.kind.promotion",
  specialisation: "cc.cat.kind.specialisation",
  pivot: "cc.cat.kind.pivot",
  lateral: "cc.cat.kind.lateral",
};

function CatalogueNextCard({
  step,
  onProfessionOpen,
}: {
  step: CatalogueNextStep;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  const title = lang === "sv" ? step.titleSv : step.titleEn;
  const kindKey = CATALOGUE_KIND[step.kind];
  return (
    <article
      data-next-profession={step.cigSlug}
      className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus-within:border-accent/60 md:p-6"
    >
      {kindKey && (
        <span className="self-start rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
          {t(kindKey)}
        </span>
      )}
      <h4 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{title}</h4>
      {step.info.kind === "none" ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("cc.info.none")}</p>
      ) : (
        <ProfessionInfoAction
          info={step.info}
          title={title}
          onOpen={onProfessionOpen}
          className="mt-auto pt-3 after:absolute after:inset-0 after:rounded-xl after:content-['']"
        />
      )}
    </article>
  );
}
