// Talent discovery — the card as an employer sees it, and the person's
// preview of exactly that. One component for both, so the preview cannot
// say something the employer view does not.
//
// Every credential is named in full with its abbreviation, its class, its
// level in words and its validity. A document review is never worded as a
// confirmation by the issuer (talent/model.ts levelKey).

import { BadgeCheck, Briefcase, CalendarClock, MapPin } from "lucide-react";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";
import {
  classKey,
  levelKey,
  meritDisplayName,
  validityKey,
  type TalentExperience,
  type TalentMerit,
  type TalentPreferences,
  type Visibility,
} from "@/lib/talent/model";
import { useTalentCopy } from "@/lib/talent/talent-copy";

function month(iso: string | null): string {
  return iso ? iso.slice(0, 7) : "";
}

export function LevelBadge({ level }: { readonly level: string | null | undefined }) {
  const { tt } = useTalentCopy();
  const strong =
    level === "document_reviewed" ||
    level === "employer_confirmed" ||
    level === "source_confirmed" ||
    level === "confirmed";
  return (
    <span
      data-level={level ?? "self_declared"}
      className={
        strong
          ? "inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-xs font-medium text-foreground"
          : "inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground"
      }
    >
      {strong ? <BadgeCheck aria-hidden="true" className="h-3 w-3" /> : null}
      {tt(levelKey(level))}
    </span>
  );
}

export function MeritLine({ merit }: { readonly merit: TalentMerit }) {
  const { tt, lang } = useTalentCopy();
  return (
    <li
      data-talent-merit={merit.code}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5"
    >
      <span className="text-sm font-medium text-foreground">{meritDisplayName(merit, lang)}</span>
      <span className="text-xs text-muted-foreground">{tt(classKey(merit.requirementClass))}</span>
      {merit.jurisdiction ? (
        <span className="text-xs text-muted-foreground">
          · {merit.jurisdiction}
          {merit.subJurisdiction ? `-${merit.subJurisdiction}` : ""}
        </span>
      ) : null}
      <LevelBadge level={merit.level} />
      <span
        className={
          merit.validity === "expired"
            ? "text-xs font-medium text-destructive"
            : "text-xs text-muted-foreground"
        }
      >
        {tt(validityKey(merit.validity))}
        {merit.validUntil ? ` · ${tt("talent.validUntil")} ${merit.validUntil}` : ""}
      </span>
      {merit.hasScopeLimitation ? (
        <span className="text-xs text-muted-foreground">· {tt("talent.reason.scopeLimited")}</span>
      ) : null}
    </li>
  );
}

export function TalentCardView({
  visibility,
  merits,
  experience,
  totalSecurityMonths,
  preferences,
  headingLevel = 3,
}: {
  readonly visibility: Visibility;
  readonly merits: readonly TalentMerit[];
  readonly experience: readonly TalentExperience[];
  readonly totalSecurityMonths: number;
  readonly preferences: TalentPreferences;
  readonly headingLevel?: 2 | 3 | 4;
}) {
  const { tt, lang } = useTalentCopy();
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const places = [...preferences.cities, ...preferences.countries];
  const anyPreference =
    preferences.areas.length +
      places.length +
      preferences.employmentTypes.length +
      preferences.workplaceTypes.length >
      0 || Boolean(preferences.availableFrom);
  return (
    <div data-talent-card className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {visibility === "active" ? tt("talent.card.active") : tt("talent.card.open")}
      </p>
      <section>
        <H className="text-sm font-semibold text-foreground">{tt("talent.card.merits")}</H>
        {merits.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{tt("talent.card.noMerits")}</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {merits.map((m) => (
              <MeritLine key={m.code + (m.validUntil ?? "")} merit={m} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <H className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Briefcase aria-hidden="true" className="h-4 w-4" />
          {tt("talent.card.experience")}
        </H>
        {experience.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{tt("talent.card.noExperience")}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-foreground">
              <span className="font-semibold tabular-nums">{totalSecurityMonths}</span>{" "}
              {tt("talent.card.totalMonths")}
            </p>
            <ul className="mt-1 space-y-1">
              {experience.map((e, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-foreground">{e.roleTitle}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {month(e.startedOn)} –{" "}
                    {e.endedOn ? month(e.endedOn) : tt("talent.card.ongoing")} · {e.months}{" "}
                    {tt("talent.card.months")}
                  </span>
                  <LevelBadge level={e.level} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section>
        <H className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin aria-hidden="true" className="h-4 w-4" />
          {tt("talent.card.preferences")}
        </H>
        {!anyPreference ? (
          <p className="mt-1 text-sm text-muted-foreground">{tt("talent.card.noPreferences")}</p>
        ) : (
          <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {preferences.areas.length > 0 ? (
              <div>
                <dt className="text-xs text-muted-foreground">{tt("talent.card.areas")}</dt>
                <dd className="text-foreground">
                  {preferences.areas.map((a) => getCareerAreaLabel(a)?.name[lang] ?? a).join(", ")}
                </dd>
              </div>
            ) : null}
            {places.length > 0 ? (
              <div>
                <dt className="text-xs text-muted-foreground">{tt("talent.card.places")}</dt>
                <dd className="text-foreground">{places.join(", ")}</dd>
              </div>
            ) : null}
            {preferences.employmentTypes.length > 0 ? (
              <div>
                <dt className="text-xs text-muted-foreground">
                  {tt("talent.card.employmentTypes")}
                </dt>
                <dd className="text-foreground">
                  {preferences.employmentTypes.map((e) => tt(`talent.emp.${e}`)).join(", ")}
                </dd>
              </div>
            ) : null}
            {preferences.workplaceTypes.length > 0 ? (
              <div>
                <dt className="text-xs text-muted-foreground">
                  {tt("talent.card.workplaceTypes")}
                </dt>
                <dd className="text-foreground">
                  {preferences.workplaceTypes.map((w) => tt(`talent.work.${w}`)).join(", ")}
                </dd>
              </div>
            ) : null}
            {preferences.availableFrom ? (
              <div>
                <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarClock aria-hidden="true" className="h-3 w-3" />
                  {tt("talent.card.availableFrom")}
                </dt>
                <dd className="tabular-nums text-foreground">{preferences.availableFrom}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </section>
    </div>
  );
}
