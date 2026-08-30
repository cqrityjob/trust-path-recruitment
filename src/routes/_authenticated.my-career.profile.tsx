// The Professional Profile — one page, one writer per fact.
//
// ── WHY THIS PAGE EDITS SO LITTLE ITSELF ───────────────────────────────
//
// Because most of what a professional profile contains is already owned by
// a product that has better rules for it than a profile form could, and
// building a second editor here would recreate exactly the defect
// 20261007090000 was written to remove: two surfaces writing one fact, with
// nothing keeping them in step.
//
//   current status, profession, experience band
//       -> security_career_profiles, the CANONICAL self-reported profile.
//          Edited HERE, through the existing card and its existing dialog.
//
//   employment history
//       -> sp_experience_periods. Dated, evidence-bearing, reviewable rows
//          with an assertion level. A coarse "years of experience" band and
//          a dated employment record answer different questions and must not
//          be merged -- the migration says so in as many words.
//
//   education, certifications, languages, practical skills
//       -> sp_claims, each carrying its own assertion level and lifecycle.
//          A claim is a thing somebody may later verify; a profile field is
//          not.
//
//   work country
//       -> sp_passport_profiles.jurisdiction_code. It carries a confirmation
//          timestamp and decides which regulated credentials a holder may
//          even claim. Copying it into a self-reported profile would create
//          the second writer this whole architecture exists to prevent.
//
// So this page is the INDEX over a person's professional identity: it shows
// every section, says who owns each one and how complete it is, edits the
// canonical row directly, and hands the rest to the Passport. That is not a
// missing feature. It is the reason a candidate can trust what the tick
// means.
//
// ── WHAT IS SELF-REPORTED AND WHAT IS NOT ──────────────────────────────
//
// Stated per section, not once at the top where it can be scrolled past. A
// verification mark appears only where `isVerifiedClaim` is true, which is
// an authorised verifier's decision and nothing else.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BadgeCheck, CircleDashed, ExternalLink } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Container } from "@/components/site/Container";
import { SecurityCareerProfileCard } from "@/components/assessment/SecurityCareerProfileCard";
import { ProfessionalIdentityHeader } from "@/components/professional-identity/ProfessionalIdentityHeader";
import { c, L, Lf, type Copy, type Lang } from "@/components/professional-identity/copy";
import { useT } from "@/i18n/context";
import { getMyProfessionalIdentity } from "@/lib/professional-identity/identity.functions";
import {
  COMPLETENESS_SECTION_ORDER,
  computeProfileCompleteness,
  type CompletenessSection,
} from "@/lib/professional-identity/completeness";
import {
  CREDENTIAL_CLAIM_TYPES,
  EDUCATION_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  SKILL_CLAIM_TYPES,
  claimsOfType,
  isVerifiedClaim,
  professionLabel,
  type IdentityClaim,
  type ProfessionalIdentityV1,
} from "@/lib/professional-identity/types";
// Same reason as the header: the work location belongs to the Passport, and
// only its own formatter keeps the emirate attached to the country.
import { formatWorkLocation } from "@/lib/security-passport/format";
// The experience BAND is a stored enum -- "1-3", "10+", "<1". The catalogue
// that owns those ids owns their labels too, and it is the same one the
// editor on this page offers, so the row and the form can never disagree.
import { yearsOfExperienceOptions } from "@/lib/security-career-profile/options";

export const Route = createFileRoute("/_authenticated/my-career/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Min profil — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProfilePage,
});

const COPY = {
  loading: c("Hämtar din profil…", "Loading your profile…"),
  failed: c("Din profil kunde inte hämtas just nu.", "Your profile could not be loaded right now."),
  retryLabel: c("Försök igen", "Try again"),
  sections: c("Din profil, avsnitt för avsnitt", "Your profile, section by section"),
  editableHeading: c("Det du fyller i själv", "What you fill in yourself"),
  editableLede: c(
    "Den här delen skriver du, och du kan ändra den när som helst. Ingenting här är granskat av någon annan.",
    "You write this part, and you can change it whenever you like. Nothing here has been reviewed by anybody else.",
  ),
  ownedHere: c("Redigeras här", "Edited here"),
  ownedPassport: c("Tillhör Security Passport", "Belongs to the Security Passport"),
  ownedDiscovery: c("Tillhör Career Discovery", "Belongs to Career Discovery"),
  openPassport: c("Öppna Security Passport", "Open the Security Passport"),
  openDiscovery: c("Gör Career Discovery", "Take Career Discovery"),
  empty: c("Inte ifyllt ännu", "Not filled in yet"),
  itemCount: c("{0} registrerade", "{0} recorded"),
  verifiedNote: c(
    "Verifierat av en behörig granskare.",
    "Verified by an authorised reviewer.",
  ),
  declaredNote: c(
    "Självrapporterat. Ingen har granskat det.",
    "Self-reported. Nobody has reviewed it.",
  ),
  whySplit: c(
    "Anställningar, utbildningar, intyg och språk bor i Security Passport. Där kan de granskas och verifieras — vilket en profiluppgift aldrig kan.",
    "Employment, education, credentials and languages live in the Security Passport. There they can be reviewed and verified — which a profile field never can.",
  ),
} as const;

const SECTION_TITLE: Readonly<Record<CompletenessSection, Copy>> = {
  identity: c("Namn och yrkestitel", "Name and professional title"),
  profession: c("Nuvarande yrke", "Current profession"),
  experience: c("Erfarenhet", "Experience"),
  location: c("Land", "Country"),
  employment: c("Anställningar", "Employment"),
  education: c("Utbildning", "Education"),
  skills: c("Färdigheter", "Skills"),
  languages: c("Språk", "Languages"),
  careerDirection: c("Karriärriktning", "Career direction"),
};

/** Who writes this section. Presentation of an architectural fact, not a
 *  permission: every write still goes through the owning product's own
 *  server function and its own rules. */
type Owner = "profile" | "passport" | "discovery";

const SECTION_OWNER: Readonly<Record<CompletenessSection, Owner>> = {
  identity: "passport",
  profession: "profile",
  experience: "profile",
  location: "passport",
  employment: "passport",
  education: "passport",
  skills: "passport",
  languages: "passport",
  careerDirection: "discovery",
};

/** A verification mark, or an explicit statement that there is not one.
 *  Never nothing: silence next to a credential reads as approval. */
function ClaimRow({ claim, lang }: { claim: IdentityClaim; lang: Lang }) {
  const verified = isVerifiedClaim(claim);
  return (
    <li className="flex items-start gap-2 py-1.5">
      {verified ? (
        <BadgeCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold)]"
          aria-hidden="true"
        />
      ) : (
        <CircleDashed
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">{claim.title}</span>
        <span className="block text-xs text-muted-foreground">
          {L(verified ? COPY.verifiedNote : COPY.declaredNote, lang)}
        </span>
      </span>
    </li>
  );
}

function summarise(
  identity: ProfessionalIdentityV1,
  section: CompletenessSection,
  lang: Lang,
): { text: string; claims: readonly IdentityClaim[] } {
  const count = (types: readonly string[]) => claimsOfType(identity.claims, types);
  switch (section) {
    case "identity":
      return { text: identity.headline ?? L(COPY.empty, lang), claims: [] };
    case "profession":
      // Never the stored slug: `vaktare` is an identifier, and printing it
      // here told a person their current profession was a database key.
      return { text: professionLabel(identity, lang) ?? L(COPY.empty, lang), claims: [] };
    case "experience": {
      // Never the bare id. This row printed "1-3", which is the value stored
      // in `years_of_experience` rather than anything a person wrote or would
      // recognise -- the same class of leak as rendering a profession slug.
      const band = identity.yearsOfExperience;
      const label = band
        ? (yearsOfExperienceOptions.find((o) => o.id === band)?.label[lang] ?? null)
        : null;
      return { text: label ?? L(COPY.empty, lang), claims: [] };
    }
    case "location":
      // Dubai, not "AE". The sub-jurisdiction travels with the country so a
      // holder in one emirate is never rendered as a UAE-wide claim.
      return {
        text: identity.workCountry
          ? formatWorkLocation(identity.workCountry, identity.workSubJurisdiction, lang)
          : identity.accountCountry
            ? formatWorkLocation(identity.accountCountry, null, lang)
            : L(COPY.empty, lang),
        claims: [],
      };
    case "employment":
      return {
        text:
          identity.employment.length > 0
            ? Lf(COPY.itemCount, lang, identity.employment.length)
            : L(COPY.empty, lang),
        claims: [],
      };
    case "education":
      return { text: "", claims: count(EDUCATION_CLAIM_TYPES) };
    case "skills":
      return { text: "", claims: count(SKILL_CLAIM_TYPES) };
    case "languages":
      return { text: "", claims: count(LANGUAGE_CLAIM_TYPES) };
    case "careerDirection":
      return {
        text: identity.discovery.hasCompletedReport
          ? L(c("Genomförd", "Completed"), lang)
          : L(COPY.empty, lang),
        claims: [],
      };
  }
}

function ProfilePage() {
  const { lang } = useT();
  const l = lang as Lang;
  const load = useServerFn(getMyProfessionalIdentity);
  const query = useQuery({
    queryKey: ["professional-identity"],
    queryFn: () => load(),
    staleTime: 60_000,
  });
  // Reloading the page is not a retry a person should have to think of, and
  // this page's own error copy used to ask for exactly that.
  const retry = () => void query.refetch();

  const identity = query.data;

  return (
    <SiteLayout>
      <Container className="py-10 md:py-14">
        {query.isPending && <p className="text-sm text-muted-foreground">{L(COPY.loading, l)}</p>}

        {query.isError && (
          <div role="alert" className="max-w-2xl rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">{L(COPY.failed, l)}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color:var(--primary-hover)]"
            >
              {L(COPY.retryLabel, l)}
            </button>
          </div>
        )}

        {identity && (
          <div className="space-y-8">
            {/* `variant="profile"` is what makes this page announce itself.
                It used to mount the dashboard's own hero unchanged, so the
                first screen of /my-career/profile was the first screen of
                /my-career with the cards removed — a person who clicked
                "View profile" had no way to tell they had gone anywhere.
                The hero owns the page's only <h1>, so naming the page has
                to happen there rather than by adding a second heading. */}
            <ProfessionalIdentityHeader
              identity={identity}
              variant="profile"
              showProfileLink={false}
              onRetry={retry}
            />

            {/* The canonical row's own editor, unchanged: same component,
                same draft shape, same save call as /my-career. It is
                designed to sit in a dashboard grid cell, so it carries no
                surface of its own -- given one here, it reads as loose text
                between two cards.

                Given a heading of its own, though. "Which of this can I
                actually change" is the first question this page has to
                answer, and the ownership labels in the index below answer it
                one row at a time -- which is precise but is not a first
                impression. */}
            <section aria-labelledby="editable-heading">
              <h2
                id="editable-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              >
                {L(COPY.editableHeading, l)}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                {L(COPY.editableLede, l)}
              </p>
              <div className="mt-4 rounded-xl border border-border bg-card p-6 md:p-8">
                <SecurityCareerProfileCard />
              </div>
            </section>

            <section aria-labelledby="sections-heading">
              <h2
                id="sections-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              >
                {L(COPY.sections, l)}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {L(COPY.whySplit, l)}
              </p>

              <ul className="mt-5 divide-y divide-border rounded-xl border border-border bg-card">
                {COMPLETENESS_SECTION_ORDER.map((section) => {
                  const owner = SECTION_OWNER[section];
                  const { text, claims } = summarise(identity, section, l);
                  const done = computeProfileCompleteness(identity).completedSections.includes(
                    section,
                  );
                  return (
                    <li key={section} className="p-4 md:p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 className="text-sm font-semibold text-foreground">
                          {L(SECTION_TITLE[section], l)}
                        </h3>
                        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                          {L(
                            owner === "profile"
                              ? COPY.ownedHere
                              : owner === "passport"
                                ? COPY.ownedPassport
                                : COPY.ownedDiscovery,
                            l,
                          )}
                        </span>
                      </div>

                      {claims.length > 0 ? (
                        <ul className="mt-2">
                          {claims.map((claim) => (
                            <ClaimRow key={claim.id} claim={claim} lang={l} />
                          ))}
                        </ul>
                      ) : (
                        <p
                          className={
                            done
                              ? "mt-1.5 text-sm text-foreground"
                              : "mt-1.5 text-sm text-muted-foreground"
                          }
                        >
                          {text || L(COPY.empty, l)}
                        </p>
                      )}

                      {!done && owner !== "profile" && (
                        <Link
                          to={owner === "passport" ? "/passport" : "/security-career-assessment"}
                          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline-offset-4 hover:underline"
                        >
                          {L(owner === "passport" ? COPY.openPassport : COPY.openDiscovery, l)}
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>

              <Link
                to="/passport"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                {L(COPY.openPassport, l)}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </section>
          </div>
        )}
      </Container>
    </SiteLayout>
  );
}
