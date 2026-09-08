import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Info, Route as RouteIcon } from "lucide-react";
import { useT } from "@/i18n/context";
import {
  MAX_PATH_DIRECTIONS,
  selectableOrigins,
  type CareerOrigin,
  type Profession,
} from "@/lib/career-center";
import { TransitionCard } from "./TransitionCard";

// "Vägar från ditt nuvarande yrke" — the `pathFrom` section.
//
// ── WHY THIS IS A SEPARATE SECTION AND NOT MORE CARDS ──────────────────
//
// It answers a different question from the career analysis, with a different
// input and different evidence: the reader NAMES the job they are in, and the
// page shows what the data records as reachable from it. The career-analysis
// section answers "which occupations did the instrument suggest". Putting
// both under one "Rekommenderat för dig" heading would leave a reader unable
// to tell which card came from an instrument scoring them and which came from
// a job title they typed thirty seconds ago — and a recommendation whose basis
// cannot be identified is not a recommendation.
//
// So: its own heading, its own eyebrow, and a line under the heading naming
// the source of the role (`profile` or `selected`) every time.
//
// ── THE SELECTOR IS A PLAIN FORM CONTROL ───────────────────────────────
//
// A `<select>` bound to the URL. No JavaScript beyond navigation, keyboard
// operable by construction, and the resulting view is a link. It writes to
// the address bar and NOT to the reader's profile: choosing a role to explore
// from is a question, not a change to who you are, and a career page that
// quietly edited a stored profile would be doing something nobody asked for.
//
// ── AND IT IS NOT AN ELIGIBILITY CHECK ─────────────────────────────────
//
// `eligibilityAssessed` is typed to a constant `false` on the model. The
// disclaimer below is rendered from it, so removing the sentence means
// changing a type rather than editing a string.

export function PathFromSection({
  origin,
  onSelect,
  onProfessionOpen,
}: {
  origin: CareerOrigin;
  /** Receives a Career Center slug, or null to clear. The caller writes it to
   *  the URL. */
  onSelect: (slug: string | null) => void;
  onProfessionOpen?: (slug: string) => void;
}) {
  const { t, lang } = useT();
  const selectId = useId();
  const options = selectableOrigins();

  const selectedSlug = origin.state === "ready" ? origin.profession.slug : "";
  const roleTitle = (p: Profession) => (lang === "sv" ? p.titleSv : p.titleEn);

  const heading =
    origin.state === "ready"
      ? t("cc.path.titleFor").replace("{role}", roleTitle(origin.profession))
      : t("cc.path.title");

  return (
    <div data-path-from data-path-state={origin.state}>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <RouteIcon className="h-4 w-4 text-accent" strokeWidth={1.75} aria-hidden />
        {t("cc.path.eyebrow")}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl">
        {heading}
      </h2>

      {/* Where the role came from. Rendered in every ready state, never
          inferred, and never shared with the career-analysis section. */}
      {origin.state === "ready" && (
        <p data-path-provenance={origin.provenance} className="mt-2 text-sm text-muted-foreground">
          {origin.provenance === "profile"
            ? t("cc.path.source.profile")
            : t("cc.path.source.selected")}
        </p>
      )}

      <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-muted-foreground">
        {origin.state === "ready" ? t("cc.path.subtitle") : t("cc.path.empty.body")}
      </p>

      {/* ── THE SELECTOR ─────────────────────────────────────────────── */}
      <div className="mt-6 max-w-md">
        <label
          htmlFor={selectId}
          className="block text-sm font-semibold tracking-tight text-foreground"
        >
          {t("cc.path.select.label")}
        </label>
        <select
          id={selectId}
          data-path-select
          value={selectedSlug}
          onChange={(e) => onSelect(e.target.value || null)}
          className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">{t("cc.path.select.none")}</option>
          {options.map((p) => (
            <option key={p.slug} value={p.slug}>
              {roleTitle(p)}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t("cc.path.select.help")}
        </p>
      </div>

      {origin.state === "unsupported" && (
        <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          {t("cc.path.none")}
        </p>
      )}

      {origin.state === "ready" && (
        <>
          {origin.directions.length === 0 ? (
            <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              {t("cc.path.none")}
            </p>
          ) : (
            <ul className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {origin.directions.map((tr) => (
                <li key={tr.to.slug}>
                  <TransitionCard
                    transition={tr}
                    direction="onward"
                    headingLevel={3}
                    onOpen={onProfessionOpen}
                  />
                </li>
              ))}
            </ul>
          )}

          <p
            data-path-not-eligibility
            className="mt-8 flex max-w-[70ch] items-start gap-2 text-xs leading-relaxed text-muted-foreground"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
            {/* Rendered from the model. `eligibilityAssessed` is typed to a
                constant false; there is no state in which this is omitted. */}
            <span>{origin.eligibilityAssessed ? null : t("cc.path.notEligibility")}</span>
          </p>

          {origin.totalDirections > MAX_PATH_DIRECTIONS && (
            <div className="mt-4">
              <Link
                to="/career-center/$profession"
                params={{ profession: origin.profession.slug }}
                hash="karriarsteg"
                onClick={() => onProfessionOpen?.(origin.profession.slug)}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("cc.path.more")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
