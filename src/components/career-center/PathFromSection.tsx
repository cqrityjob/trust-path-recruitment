import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Info, RotateCcw, Route as RouteIcon, UserRound } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  L,
  MAX_PATH_DIRECTIONS,
  selectableOrigins,
  type CareerOrigin,
  type Profession,
} from "@/lib/career-center";
import { ProfessionInfoAction } from "./ProfessionInfoAction";
import { TransitionCard } from "./TransitionCard";

// "Vilket yrke arbetar du i i dag?" — the `pathFrom` section.
//
// ── WHAT THE READER COULD NOT DO BEFORE ─────────────────────────────────
//
// The selector rewrote `?from=` and showed up to three transitions. It never
// said which profession was selected beyond a heading, it linked to the
// selected profession only when more than three transitions existed, it
// printed "no directions yet" when the graph had none (which reads as "there
// is nowhere to go from your job"), and clearing it was impossible for a
// signed-in reader: deleting `from` let the profile's role straight back in.
//
// So the section now has two halves with one job each:
//
//   the choice    which profession, where that choice came from (the saved
//                 profile, or a temporary selection on this page), and the
//                 two ways out of a temporary state: back to the saved
//                 profession, or cleared.
//
//   the answer    the selected profession itself — named, described, with
//                 "Läs om {yrke}" ALWAYS present when information exists —
//                 and, as its own labelled block, "Möjliga nästa steg".
//
// ── IT IS A QUESTION, NOT A PROFILE EDIT ───────────────────────────────
//
// The selector writes to the URL and never to the stored profile: choosing a
// role to explore from is a question, not a change to who you are. The
// surface says so beside the control, and a reader whose profile holds a
// role always sees which role that is. The profile is edited on the profile.
//
// ── AND IT IS NOT AN ELIGIBILITY CHECK ─────────────────────────────────
//
// `eligibilityAssessed` is typed to a constant `false` on the model. The
// disclaimer below is rendered from it, so removing the sentence means
// changing a type rather than editing a string.

export const PATH_NEXT_ANCHOR = "nasta-steg-fran-yrke";

export function PathFromSection({
  origin,
  profileStatus,
  onSelect,
  onClear,
  onReset,
  onRetryProfile,
  onProfessionOpen,
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
        <div className="rounded-xl border border-border bg-card p-5 shadow-xs md:p-6 lg:col-span-5">
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
            {profileStatus === "anonymous" && (
              <p className="text-muted-foreground">
                {t("cc.path.anonymous")}{" "}
                <Link
                  to="/login"
                  search={{ redirect: "/career-center" } as never}
                  className="font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {t("cc.path.anonymous.login")}
                </Link>
              </p>
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

        {/* ── THE SELECTED PROFESSION ────────────────────────────────── */}
        <div className="lg:col-span-7">
          {origin.state === "ready" && (
            <SelectedProfession
              profession={origin.profession}
              onProfessionOpen={onProfessionOpen}
            />
          )}
          {origin.state === "unsupported" && (
            <UnsupportedRole origin={origin} onProfessionOpen={onProfessionOpen} />
          )}
          {origin.state === "unknown" && (
            <div
              data-path-empty
              className="flex h-full flex-col justify-center rounded-xl border border-dashed border-border bg-background/60 p-6"
            >
              <p className="text-base font-semibold text-foreground">{t("cc.path.empty.title")}</p>
              <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
                {t("cc.path.empty.body")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── MÖJLIGA NÄSTA STEG ─────────────────────────────────────────── */}
      {origin.state === "ready" && (
        <div id={PATH_NEXT_ANCHOR} className="mt-10 scroll-mt-4">
          <h3 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
            {t("cc.path.next.title").replace("{role}", roleTitle(origin.profession))}
          </h3>
          {origin.directions.length === 0 ? (
            <div
              data-path-next="empty"
              className="mt-4 max-w-[70ch] rounded-lg border border-border bg-background p-5"
            >
              <p className="text-sm leading-relaxed text-foreground">
                {t("cc.path.next.empty").replace("{role}", roleTitle(origin.profession))}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <Link
                  to="/career-center"
                  search={{ all: true } as never}
                  hash="utforska-yrken"
                  className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {t("cc.path.next.empty.explore")}
                </Link>
                <Link
                  to="/security-career-assessment"
                  className="inline-flex min-h-11 items-center font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t("cc.me.invite.cta")}
                </Link>
              </div>
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {origin.directions.map((tr) => (
                <li key={tr.to.slug}>
                  <TransitionCard
                    transition={tr}
                    direction="onward"
                    headingLevel={4}
                    onOpen={(slug) => onProfessionOpen?.(`/career-center/${slug}`)}
                  />
                </li>
              ))}
            </ul>
          )}

          {origin.totalDirections > 0 && (
            <div className="mt-4">
              <Link
                to="/career-center/$profession"
                params={{ profession: origin.profession.slug }}
                hash="karriarsteg"
                onClick={() => onProfessionOpen?.(`/career-center/${origin.profession.slug}`)}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {origin.totalDirections > MAX_PATH_DIRECTIONS
                  ? t("cc.path.more.count").replace("{n}", String(origin.totalDirections))
                  : t("cc.path.more")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
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
        <a
          href={`#${PATH_NEXT_ANCHOR}`}
          data-path-next-link
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("cc.path.next.cta")}
        </a>
      </div>
    </article>
  );
}

function UnsupportedRole({
  origin,
  onProfessionOpen,
}: {
  origin: Extract<CareerOrigin, { state: "unsupported" }>;
  onProfessionOpen?: (href: string) => void;
}) {
  const { t, lang } = useT();
  const label =
    (lang === "sv" ? origin.labelSv : origin.labelEn) ?? t("cc.path.unsupported.unnamed");
  const inCatalogue = origin.info.kind !== "none";
  const catalogue = origin.info.kind === "catalogue_profile" ? origin.info : null;
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
          <>
            <ProfessionInfoAction
              info={origin.info}
              title={label}
              variant="button"
              onOpen={onProfessionOpen}
            />
            {catalogue && (
              <Link
                to="/career-center/yrke/$cigSlug"
                params={{ cigSlug: catalogue.cigSlug }}
                hash="karriarsteg"
                onClick={() => onProfessionOpen?.(catalogue.href)}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                {t("cc.path.next.cta")}
              </Link>
            )}
          </>
        ) : (
          <>
            <Link
              to="/security-career-assessment"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              {t("cc.me.invite.cta")}
            </Link>
            <Link
              to="/career-center"
              search={{ all: true } as never}
              hash="utforska-yrken"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {t("cc.path.next.empty.explore")}
            </Link>
          </>
        )}
      </div>
    </article>
  );
}
