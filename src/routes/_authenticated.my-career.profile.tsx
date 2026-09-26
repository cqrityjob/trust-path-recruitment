// Profile — who am I now?
//
// ── THREE SURFACES, ONE QUESTION EACH ──────────────────────────────────
//
// A candidate's information lives on exactly three surfaces, and each one
// answers a single question:
//
//   Profile            who am I now?
//                      name, professional title, work country, current
//                      situation and profession.            → THIS PAGE
//
//   CV                 what have I done?
//                      employment, education, courses, skills, languages
//                      and the CV documents built from them. → /my-career/cv
//
//   Security Passport  which professional security credentials can I
//                      document and selectively share?       → /passport
//
// This page used to be all three at once: a ten-row index that labelled
// each row "edited here" without being a control, the Passport's six-step
// basics card, and every CV editor below that — 6 200 pixels at 1440. A
// person who came to correct their title had to find it among their
// education, and a person looking for their employment history found it on
// the page that holds their name.
//
// So this page now holds ONLY what the Profile owns, and every piece of it
// is a working editor with its own save. The CV and the Passport appear as
// two summaries with one way in each. Nothing here is a label pretending
// to be a button.
//
// ── ONE WRITER PER FACT — UNCHANGED ────────────────────────────────────
//
// No storage moved and no server function is new:
//
//   name, professional title   sp_passport_profiles  savePassportBasics
//   work country               sp_passport_profiles  setWorkCountry
//   situation, profession,     security_career_profiles
//   experience band                                   upsertMySecurityCareerProfile
//
// The Security Passport DISPLAYS the name and the title and sends the
// holder here to change them. It has no editor for either.
//
// ── WHAT IS SELF-REPORTED ──────────────────────────────────────────────
//
// Everything on this page. The header says so, and the career profile card
// repeats it beside its own save. Verification is the Passport's word.

import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, FileText, IdCard, Plus } from "lucide-react";
import { Container } from "@/components/site/Container";
import { SecurityCareerProfileCard } from "@/components/assessment/SecurityCareerProfileCard";
import { ProfessionalIdentityHeader } from "@/components/professional-identity/ProfessionalIdentityHeader";
import { c, cp, L, Lp, type Copy, type Lang } from "@/components/professional-identity/copy";
import { useT } from "@/i18n/context";
import { getMyProfessionalIdentity } from "@/lib/professional-identity/identity.functions";
import {
  computeProfileCompleteness,
  type CompletenessSection,
} from "@/lib/professional-identity/completeness";
import {
  SECTION_DESTINATIONS,
  sectionLinkTarget,
} from "@/lib/professional-identity/profile-destinations";
import { ProfileBasicsSection } from "@/components/professional-identity/ProfileBasicsSection";
import { ScrollToHashOnceReady } from "@/components/security-passport/ScrollToHashOnceReady";
import {
  EDUCATION_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  SKILL_CLAIM_TYPES,
  claimsOfType,
  type ProfessionalIdentityV1,
} from "@/lib/professional-identity/types";

export const Route = createFileRoute("/_authenticated/my-career/profile")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Profil — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ProfilePage,
});

const COPY = {
  back: c("Min karriär", "My Career"),
  loading: c("Hämtar din profil…", "Loading your profile…"),
  failed: c("Din profil kunde inte hämtas just nu.", "Your profile could not be loaded right now."),
  retryLabel: c("Försök igen", "Try again"),
  missingHeading: c("Det här saknas i din profil", "Missing from your profile"),
  editableHeading: c("Det du fyller i själv", "What you fill in yourself"),
  editableLede: c(
    "Varje del nedan kan du ändra direkt och spara. Ingenting här är granskat av någon annan.",
    "You can change and save each part below. Nothing here has been reviewed by anybody else.",
  ),
  situationHeading: c("Nuvarande situation och yrke", "Current situation and profession"),
  situationLede: c(
    "Var du står i yrket just nu. Används för att visa relevanta jobb och karriärvägar.",
    "Where you are in your working life right now. Used to show relevant jobs and career paths.",
  ),
  situationEdit: c("Ändra situation och yrke", "Edit situation and profession"),
  elsewhereHeading: c("Finns på andra ställen", "Kept elsewhere"),
  elsewhereLede: c(
    "Din karriärhistorik och dina säkerhetsmeriter har egna sidor, så att varje uppgift bara finns på ett ställe.",
    "Your career history and your security credentials have pages of their own, so that every fact exists in one place only.",
  ),
  ownedCv: c("Tillhör ditt CV", "Belongs to your CV"),
  ownedPassport: c("Tillhör Security Passport", "Belongs to the Security Passport"),
  cvTitle: c("Mitt CV", "My CV"),
  cvBody: c(
    "Anställningar, utbildning, språk och färdigheter – och de CV-dokument som byggs av dem.",
    "Employment, education, languages and skills – and the CV documents built from them.",
  ),
  cvEdit: c("Redigera CV", "Edit CV"),
  passportTitle: c("Security Passport", "Security Passport"),
  passportQuestion: c(
    "Vilka säkerhetsmeriter kan jag dokumentera och dela?",
    "Which security credentials can I document and share?",
  ),
  passportBody: c(
    "Certifieringar, licenser och behörigheter med underlag, granskning och delning. Ditt namn och din yrkestitel visas där, men ändras här.",
    "Certifications, licences and authorisations with evidence, review and sharing. Your name and professional title are shown there, but changed here.",
  ),
  passportOpen: c("Öppna Security Passport", "Open Security Passport"),
  employment: cp(c("{0} anställning", "{0} employment"), c("{0} anställningar", "{0} employments")),
  education: cp(
    c("{0} utbildning", "{0} education entry"),
    c("{0} utbildningar", "{0} education entries"),
  ),
  languages: cp(c("{0} språk", "{0} language"), c("{0} språk", "{0} languages")),
  skills: cp(c("{0} färdighet", "{0} skill"), c("{0} färdigheter", "{0} skills")),
  cvEmpty: c("Inget tillagt ännu", "Nothing added yet"),
} as const;

/** What a missing Profile section ASKS for. An invitation that leads to the
 *  field, never a status word: "Not filled in yet" beside a row with no
 *  control is what this page was corrected for. Only the sections the
 *  Profile owns appear here -- a missing education is the CV's to ask for. */
const ADD_LABEL: Partial<Readonly<Record<CompletenessSection, Copy>>> = {
  identity: c(
    "Lägg till namn och nuvarande yrkestitel",
    "Add your name and current professional title",
  ),
  location: c("Lägg till landet där du arbetar", "Add the country where you work"),
  situation: c("Lägg till din nuvarande situation", "Add your current situation"),
  profession: c("Lägg till ditt nuvarande yrke", "Add your current profession"),
  experience: c("Lägg till din erfarenhet", "Add your experience"),
};

/**
 * The CV-content anchors this page used to carry.
 *
 * `#profile-employment`, `#profile-education` and the rest were real ids
 * here for a short while and are in browser histories and in any
 * recommendation issued before the editors moved. A fragment that matches
 * no element fails silently -- the page opens at the top and the reader
 * hunts for a section that is gone -- so they are redirected to the CV,
 * exactly as /passport/information redirects its own retired anchors.
 */
const RETIRED_CV_SECTIONS: ReadonlySet<string> = new Set([
  "employment",
  "education",
  "training",
  "specialisation",
  "professional_membership",
  "languages",
  "skills",
]);

/** `#profile-<name>` → the CV's anchor for the same section, or null. The
 *  new anchor is DERIVED from the old one rather than written out beside it:
 *  the destination contract is the only place an anchor is spelled, and a
 *  guard holds this file to that. */
function retiredCvAnchor(hash: string): string | null {
  const name = /^#profile-(.+)$/.exec(hash)?.[1];
  return name && RETIRED_CV_SECTIONS.has(name) ? `cv-${name}` : null;
}

const PRIMARY =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color:var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const SECONDARY =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function cvSummary(identity: ProfessionalIdentityV1, l: Lang): string {
  const parts = [
    [identity.employment.length, COPY.employment],
    [claimsOfType(identity.claims, EDUCATION_CLAIM_TYPES).length, COPY.education],
    [claimsOfType(identity.claims, LANGUAGE_CLAIM_TYPES).length, COPY.languages],
    [claimsOfType(identity.claims, SKILL_CLAIM_TYPES).length, COPY.skills],
  ] as const;
  const stated = parts.filter(([n]) => n > 0).map(([n, copy]) => Lp(copy, l, n));
  return stated.length > 0 ? stated.join(" · ") : L(COPY.cvEmpty, l);
}

function ProfilePage() {
  const { lang } = useT();
  const l = lang as Lang;
  const navigate = useNavigate();
  const load = useServerFn(getMyProfessionalIdentity);
  const query = useQuery({
    queryKey: ["professional-identity"],
    queryFn: () => load(),
    staleTime: 60_000,
  });
  // Reloading the page is not a retry a person should have to think of.
  const retry = () => void query.refetch();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = retiredCvAnchor(window.location.hash);
    if (target) void navigate({ to: "/my-career/cv", hash: target, replace: true });
  }, [navigate]);

  const identity = query.data;
  const completeness = identity ? computeProfileCompleteness(identity) : null;
  // Missing AND the Profile's own. The order is the completeness order, so
  // the list reads top-down the way the editors below are laid out.
  const missing = completeness
    ? completeness.applicableSections.filter(
        (section) =>
          SECTION_DESTINATIONS[section].owner === "profile" &&
          !completeness.completedSections.includes(section) &&
          ADD_LABEL[section],
      )
    : [];

  return (
    <Container className="py-8 md:py-12">
      {/* The editors mount after their own reads answer, so a deep link such
          as #profile-basics names an element that does not exist yet when
          the page first renders. This waits for it. */}
      <ScrollToHashOnceReady />
      <Link
        to="/my-career"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-back-to-career
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        {L(COPY.back, l)}
      </Link>

      {query.isPending && (
        <p className="mt-4 text-sm text-muted-foreground">{L(COPY.loading, l)}</p>
      )}

      {query.isError && (
        <div role="alert" className="mt-4 max-w-2xl rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-destructive">{L(COPY.failed, l)}</p>
          <button type="button" onClick={retry} className={`${PRIMARY} mt-3`}>
            {L(COPY.retryLabel, l)}
          </button>
        </div>
      )}

      {identity && completeness && (
        <div className="mt-2 space-y-10">
          {/* `variant="profile"` names the page in the only <h1>, then states
              the person: name, title, experience and country. */}
          <ProfessionalIdentityHeader
            identity={identity}
            variant="profile"
            showProfileLink={false}
            onRetry={retry}
          />

          {/* ── WHAT IS MISSING, AS ACTIONS ─────────────────────────────
              Each row is a link to the field itself, resolved from the one
              destination contract, so "add your professional title" lands
              on the input and not at the top of a page. Rendered only when
              something is missing. */}
          {missing.length > 0 && (
            <section aria-labelledby="missing-heading" data-profile-missing>
              <h2
                id="missing-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
              >
                {L(COPY.missingHeading, l)}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {missing.map((section) => {
                  const target = sectionLinkTarget(section);
                  return (
                    <li key={section}>
                      <Link
                        to={target.to}
                        search={target.search}
                        hash={target.hash}
                        data-section-link={section}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-dashed border-accent/50 bg-accent/5 px-3.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        {L(ADD_LABEL[section]!, l)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── THE EDITORS ─────────────────────────────────────────────
              Three, each the canonical editor of its own rows and each
              with its own save: name and title, work country, and the
              career profile. */}
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

            <div className="mt-5">
              <ProfileBasicsSection />
            </div>

            <div className="mt-6 rounded-xl border border-border bg-card p-5 md:p-6">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {L(COPY.situationHeading, l)}
              </h3>
              <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
                {L(COPY.situationLede, l)}
              </p>
              <div className="mt-5">
                <SecurityCareerProfileCard editLabel={L(COPY.situationEdit, l)} />
              </div>
            </div>
          </section>

          {/* ── THE OTHER TWO SURFACES ──────────────────────────────────
              Summaries with one way in each. Nothing is editable here, and
              nothing here looks as though it were. */}
          <section aria-labelledby="elsewhere-heading">
            <h2
              id="elsewhere-heading"
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              {L(COPY.elsewhereHeading, l)}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              {L(COPY.elsewhereLede, l)}
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <article
                className="flex flex-col rounded-xl border border-border bg-card p-5 md:p-6"
                data-profile-surface="cv"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  {L(COPY.ownedCv, l)}
                </p>
                <h3 className="mt-2 flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
                  <FileText className="h-4 w-4 text-accent" aria-hidden="true" />
                  {L(COPY.cvTitle, l)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {L(COPY.cvBody, l)}
                </p>
                <p className="mt-3 text-sm font-medium text-foreground" data-cv-summary>
                  {cvSummary(identity, l)}
                </p>
                <div className="mt-auto pt-5">
                  <Link to="/my-career/cv" className={SECONDARY} data-cta="profile-edit-cv">
                    {L(COPY.cvEdit, l)}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </article>

              <article
                className="flex flex-col rounded-xl border border-border bg-card p-5 md:p-6"
                data-profile-surface="passport"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  {L(COPY.ownedPassport, l)}
                </p>
                <h3 className="mt-2 flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
                  <IdCard className="h-4 w-4 text-accent" aria-hidden="true" />
                  {L(COPY.passportTitle, l)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{L(COPY.passportQuestion, l)}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {L(COPY.passportBody, l)}
                </p>
                <div className="mt-auto pt-5">
                  <Link to="/passport" className={SECONDARY} data-cta="profile-open-passport">
                    {L(COPY.passportOpen, l)}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </div>
          </section>
        </div>
      )}
    </Container>
  );
}
