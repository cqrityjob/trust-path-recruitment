// Security Passport — "Mina uppgifter": where a holder actually enters things.
//
// ── WHY THIS PAGE EXISTS ───────────────────────────────────────────────
//
// Before Phase 8 the only way into the Passport was a thirteen-step wizard in
// which seven steps rendered explanatory text and a Continue button, and in
// which NOTHING reached a domain table: every answer went into a JSON blob on
// the profile. A holder could complete the whole thing and still have an
// empty Passport. This page is the repair.
//
// It is a grouped surface rather than a longer wizard because the content is
// list-shaped, not question-shaped: a career is several employments, several
// courses, several certificates. A wizard asks each question once; a person
// needs to add five jobs, come back next week and add a sixth.
//
// ── WHAT BELONGS WHERE ─────────────────────────────────────────────────
//
// The four supported credentials (VU1, VU2, OV, SV) are NOT entered here.
// They have their own taxonomy-driven form with their own rules, and this
// section links to it. Everything else — employment, education, courses,
// certifications, specialisations, memberships — is entered here, into the
// real tables, through entries.functions.ts.
//
// ── EVERY ENTRY OFFERS ITS NEXT STEP ───────────────────────────────────
//
// A saved entry is self-declared and says so. Immediately beside it are the
// two things a holder can do about that: attach documentation, or ask for it
// to be checked. Without those the page would be a data-entry chore with no
// visible point.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { WorkCountryCard } from "@/components/security-passport/WorkCountryCard";
import { MarketCredentialSection } from "@/components/security-passport/MarketCredentialSection";
import {
  OtherMarketsPanel,
  type OtherMarketClaim,
} from "@/components/security-passport/OtherMarketsPanel";
import {
  deriveMarketProfiles,
  currentMarket,
  otherMarkets,
} from "@/lib/security-passport/market-profiles";
import {
  getMyPassport,
  savePassportBasics,
  setWorkCountry,
} from "@/lib/security-passport/passport.functions";
import {
  ProfileBasicsCard,
  type ProfileBasicsPatch,
} from "@/components/security-passport/ProfileBasicsCard";
import {
  getRegulatedCredentialAvailability,
  type RegulatedCredentialAvailability,
} from "@/lib/security-passport/credentials.functions";
import { Briefcase, GraduationCap, Languages, Plus, ShieldCheck, Wrench } from "lucide-react";
import { CAREER_PROFILE_ROUTE } from "@/lib/security-passport/profile-basics";
import {
  listCurrentProfessionOptions,
  type CurrentProfessionOption,
} from "@/lib/security-career-profile/profession-options";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  listMyEntries,
  listSkillTypes,
  removeEntry,
  saveClaimEntry,
  saveExperienceEntry,
  saveSkillEntry,
  listJurisdictions,
  type ClaimEntry,
  type ExperienceEntry,
  type FreeClaimKind,
  type Jurisdiction,
  type SkillType,
} from "@/lib/security-passport/entries.functions";
import { formatPeriodRange, formatWorkLocation } from "@/lib/security-passport/format";
import { credentialPresentationOf } from "@/lib/security-passport/trust-presentation";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { LifecycleChip } from "@/components/security-passport/LifecycleChip";
import { CredentialSymbol } from "@/components/security-passport/CredentialSymbol";
import {
  ClaimEntryForm,
  ExperienceForm,
  claimToDraft,
  emptyClaimDraft,
  emptyExperienceDraft,
  experienceToDraft,
  validateClaim,
  validateExperience,
  type ClaimDraft,
  type ExperienceDraft,
} from "@/components/security-passport/EntryForms";
import {
  SkillSection,
  emptySkillDraft,
  validateSkill,
  type SkillDraft,
} from "@/components/security-passport/SkillSection";
import type { AssertionLevel, LifecycleState } from "@/lib/security-passport/types";

export const Route = createFileRoute("/_authenticated/passport/information")({
  ssr: false,
  component: PassportInformationRoute,
});

/** The claim sections, in the order a career is usually described. */
const CLAIM_SECTIONS: readonly { kind: FreeClaimKind; titleKey: PassportCopyKey }[] = [
  { kind: "education", titleKey: "claims.type.education" },
  { kind: "training", titleKey: "claims.type.training" },
  { kind: "certification", titleKey: "claims.type.certification" },
  { kind: "specialisation", titleKey: "claims.type.specialisation" },
  { kind: "professional_membership", titleKey: "claims.type.professional_membership" },
];

type Editing =
  | { kind: "experience"; draft: ExperienceDraft }
  | { kind: "claim"; draft: ClaimDraft }
  | null;

function SectionShell({
  icon,
  title,
  lead,
  children,
  /** An anchor, so the profile-basics card can send the holder to the section
   *  that actually owns one of the six answers instead of duplicating its
   *  editor. */
  id,
}: {
  icon: React.ReactNode;
  title: string;
  lead?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      // Focusable only when it is an anchor target. Without this the basics
      // card would scroll a keyboard user to the section and leave their
      // focus on the button they just left.
      tabIndex={id ? -1 : undefined}
      className="rounded-xl border border-border bg-card p-5 outline-none"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        {icon}
        {title}
      </h2>
      {lead ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lead}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PassportInformationRoute() {
  const { pt, lang } = usePassportCopy();
  const navigate = useNavigate();

  const load = useServerFn(listMyEntries);
  // The profile, for the work-country control. Read here rather than threaded
  // through from the overview so this tab stands on its own: a holder who lands
  // straight on /passport/information still sees, and can correct, the country
  // their whole Passport is spoken in.
  const loadProfile = useServerFn(getMyPassport);
  const saveWorkCountry = useServerFn(setWorkCountry);
  // The governed answer to "what may this holder register here". NOT a literal
  // credential list: see MarketCredentialSection for why the literal was a
  // regulatory claim rather than a convenience.
  const loadAvailability = useServerFn(getRegulatedCredentialAvailability);
  const [workCountry, setWorkCountryState] = useState<{
    jurisdictionCode: string | null;
    subJurisdictionCode: string | null;
    confirmed: boolean;
  } | null>(null);
  const [availability, setAvailability] = useState<RegulatedCredentialAvailability | null>(null);
  // The profile-level half of the six basics. Read from the SAME profile
  // fetch as the work country below, because they are one row: loading them
  // separately is how a page ends up showing a stale name beside a fresh
  // country for one render.
  const [basics, setBasics] = useState<{
    displayName: string;
    headline: string;
    professionSlug: string;
    declaredAccurateAt: string | null;
  } | null>(null);
  const saveBasics = useServerFn(savePassportBasics);
  // Display titles for the profession the basics card SHOWS and does not
  // edit. Best-effort: a failure degrades one line to the stored slug, never
  // the page.
  const [professionOptions, setProfessionOptions] = useState<CurrentProfessionOption[]>([]);
  useEffect(() => {
    let alive = true;
    listCurrentProfessionOptions()
      .then((opts) => {
        if (alive) setProfessionOptions(opts);
      })
      .catch(() => {
        /* the card falls back to the stored value */
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── ONE REFRESH FOR BOTH ──────────────────────────────────────────
  //
  // The work country and the market catalogue are the SAME fact read twice,
  // and loading them separately is how a page ends up showing Sweden's
  // credentials under a Dubai heading for one render. They are fetched
  // together and set together, so the catalogue on screen always belongs to
  // the country printed above it.
  // ── WHAT ELSE HAS JUST BECOME WRONG ─────────────────────────────────
  //
  // Everything a holder edits on this page is read by surfaces that are not
  // on this page. My Career computes its completeness, its next best action
  // and its trust summary from the identity seam; the attention panel reads
  // the verification list. Neither is written here, and both were cached for
  // a minute with no reason to re-ask.
  //
  // So a holder who followed "Lägg till din arbetslivserfarenhet" from My
  // Career, added the employment, and came back was met by the same
  // recommendation to add it -- a stale cache doing a convincing impression
  // of a save that had not worked. Marking the two read models stale is what
  // makes "follow the action, then see the action retire" true rather than
  // true-after-a-minute.
  //
  // Named keys rather than a blanket invalidate: this page cannot have
  // changed the report, the job list or anything an employer owns.
  const queryClient = useQueryClient();
  const invalidateCandidateReadModels = useCallback(() => {
    for (const queryKey of [
      ["professional-identity"],
      ["passport", "mine"],
      ["passport", "my-verification-requests"],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const refreshWorkCountry = useCallback(async () => {
    // ── TWO READS, TWO FAILURES ───────────────────────────────────────
    //
    // These were one Promise.all, and a market lookup that failed also took
    // the work-country panel with it -- so the holder lost the control that
    // states where they work AND the credentials for it, from one error in
    // the second. The panel is the more important of the two: without it a
    // holder cannot even correct the country that decides the catalogue.
    //
    // Settled independently. Each is allowed to fail on its own terms.
    try {
      const snap = await loadProfile({ data: undefined });
      setWorkCountryState({
        jurisdictionCode: snap.profile?.jurisdictionCode ?? null,
        subJurisdictionCode: snap.profile?.subJurisdictionCode ?? null,
        confirmed: Boolean(snap.profile?.workLocationConfirmedAt),
      });
      setBasics({
        displayName: snap.profile?.displayName ?? "",
        headline: snap.profile?.headline ?? "",
        professionSlug: snap.profile?.cigProfessionSlug ?? "",
        declaredAccurateAt: snap.profile?.declaredAccurateAt ?? null,
      });
      invalidateCandidateReadModels();
    } catch (err) {
      // A failure here must not take the rest of the page down with it: the
      // entries below are independent and still editable.
      console.error("[passport] work country load failed", err);
    }

    try {
      setAvailability(await loadAvailability({ data: undefined }));
    } catch (err) {
      console.error("[passport] market availability load failed", err);
      setAvailability(null);
    }
  }, [loadProfile, loadAvailability, invalidateCandidateReadModels]);
  useEffect(() => {
    void refreshWorkCountry();
  }, [refreshWorkCountry]);
  const saveExp = useServerFn(saveExperienceEntry);
  const saveClaim = useServerFn(saveClaimEntry);
  const doRemove = useServerFn(removeEntry);
  const loadSkillTypes = useServerFn(listSkillTypes);
  const loadJurisdictions = useServerFn(listJurisdictions);
  const saveSkill = useServerFn(saveSkillEntry);

  const [experience, setExperience] = useState<readonly ExperienceEntry[]>([]);
  const [claims, setClaims] = useState<readonly ClaimEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // ── ONE OPERATION OWNS ONE OUTCOME ────────────────────────────────
  //
  // These were two independent strings, and the page could hold both at once:
  // `setNotice("Sparat.")` fired before the read-back, so when the refresh
  // then failed, `setError` painted "Något gick fel. Försök igen." underneath
  // a success message that had already been shown. The owner photographed
  // exactly that.
  //
  // A save either succeeded or it did not, so the page now carries ONE
  // outcome. Starting an operation clears it; success is only recorded after
  // the write AND the read-back have both returned.
  const [outcome, setOutcome] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const error = outcome?.kind === "error" ? outcome.text : null;
  const notice = outcome?.kind === "ok" ? outcome.text : null;
  const beginOperation = useCallback(() => setOutcome(null), []);
  const succeeded = useCallback((text: string) => setOutcome({ kind: "ok", text }), []);
  const failed = useCallback((text: string) => setOutcome({ kind: "error", text }), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [expErrors, setExpErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [claimErrors, setClaimErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [skillTypes, setSkillTypes] = useState<readonly SkillType[]>([]);
  const [jurisdictions, setJurisdictions] = useState<readonly Jurisdiction[]>([]);
  // One draft per section, keyed by claim_type, so opening the language form
  // does not close a half-filled licence form.
  const [skillDrafts, setSkillDrafts] = useState<Record<string, SkillDraft | null>>({
    language: null,
    practical_skill: null,
  });
  const [skillErrors, setSkillErrors] = useState<Record<string, Record<string, PassportCopyKey>>>({
    language: {},
    practical_skill: {},
  });

  /** Resolves true only when the read-back returned. Callers must not
   *  report success without it: a write that cannot be read back has not
   *  been shown to have happened. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const [data, types, jurs] = await Promise.all([
        load({ data: undefined }),
        loadSkillTypes({ data: undefined }),
        loadJurisdictions({ data: undefined }),
      ]);
      setExperience(data.experience);
      setClaims(data.claims);
      setSkillTypes(types);
      setJurisdictions(jurs);
      invalidateCandidateReadModels();
      return true;
    } catch (err) {
      console.error("[passport] entries load failed", err);
      failed(pt("common.error"));
      return false;
    } finally {
      setLoaded(true);
    }
  }, [load, loadSkillTypes, loadJurisdictions, failed, pt, invalidateCandidateReadModels]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The four taxonomy credentials are shown here for completeness but are
  // never edited here — they belong to the credential form.
  const taxonomyClaims = useMemo(() => claims.filter((c) => c.credentialCode !== null), [claims]);

  // ── THE MULTI-MARKET READ MODEL ───────────────────────────────────
  //
  // Derived, never stored. Every field comes from columns sp_claims already
  // carries, so there is no table that could disagree with the claims it
  // summarises — and no migration was needed to group a list.
  //
  // Scoped to TAXONOMY claims: a market profile is about regulated
  // authorisations, which is what belongs to a jurisdiction. A language or a
  // free-text course is portable, keeps its own section below, and is not
  // filed under a country it would then appear to depend on.
  const marketProfiles = useMemo(
    () =>
      deriveMarketProfiles<OtherMarketClaim>(
        taxonomyClaims.map((c) => ({
          id: c.id,
          title: c.title,
          jurisdictionCode: c.jurisdictionCode,
          subJurisdictionCode: c.subJurisdictionCode,
          assertionLevel: c.assertionLevel,
          lifecycleState: c.lifecycleState,
        })),
        {
          jurisdictionCode: workCountry?.jurisdictionCode ?? null,
          subJurisdictionCode: workCountry?.subJurisdictionCode ?? null,
        },
      ).profiles,
    [taxonomyClaims, workCountry],
  );
  const hereProfile = useMemo(() => currentMarket(marketProfiles), [marketProfiles]);
  const elsewhereProfiles = useMemo(() => otherMarkets(marketProfiles), [marketProfiles]);
  // The ids the selected market owns, so the list rendered inside the market
  // section is exactly this market's — and a Swedish credential can never be
  // drawn under a Dubai heading, whatever the claim order happens to be.
  const hereClaimIds = useMemo(
    () =>
      new Set(
        hereProfile
          ? [
              ...hereProfile.verifiedCredentials,
              ...hereProfile.pendingCredentials,
              ...hereProfile.otherClaims,
            ].map((c) => c.id)
          : [],
      ),
    [hereProfile],
  );
  const hereClaims = useMemo(
    () => taxonomyClaims.filter((c) => hereClaimIds.has(c.id)),
    [taxonomyClaims, hereClaimIds],
  );
  const freeClaims = useMemo(() => claims.filter((c) => c.credentialCode === null), [claims]);

  async function commitExperience(draft: ExperienceDraft) {
    const errs = validateExperience(draft);
    setExpErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    beginOperation();
    try {
      await saveExp({
        data: {
          id: draft.id,
          employerName: draft.employerName,
          roleTitle: draft.roleTitle,
          employmentType: draft.employmentType,
          fteFraction: draft.fteFraction,
          securityRelevance: draft.securityRelevance,
          securityFraction: draft.securityFraction,
          startedOn: draft.startedOn,
          endedOn: draft.ongoing ? null : draft.endedOn,
          jurisdictionCode: draft.jurisdictionCode,
        },
      });
      setEditing(null);
      // Read-back before success. "Sparat." is a claim about persistence, so
      // it is only made once the server has handed the entry back.
      if (await refresh()) succeeded(pt("entry.saved"));
    } catch (err) {
      console.error("[passport] experience save failed", err);
      failed(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function commitClaim(draft: ClaimDraft) {
    const errs = validateClaim(draft);
    setClaimErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    beginOperation();
    try {
      await saveClaim({
        data: {
          id: draft.id,
          claimType: draft.claimType,
          title: draft.title,
          issuerName: draft.issuerName.trim() || null,
          jurisdictionCode: draft.jurisdictionCode || null,
          issuedOn: draft.issuedOn,
          validUntil: draft.expires ? draft.validUntil : null,
        },
      });
      setEditing(null);
      // Read-back before success. "Sparat." is a claim about persistence, so
      // it is only made once the server has handed the entry back.
      if (await refresh()) succeeded(pt("entry.saved"));
    } catch (err) {
      console.error("[passport] claim save failed", err);
      failed(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function commitSkill(claimType: "language" | "practical_skill", draft: SkillDraft) {
    const type = skillTypes.find((t) => t.code === draft.skillCode);
    const errs = validateSkill(draft, type, jurisdictions);
    setSkillErrors((prev) => ({ ...prev, [claimType]: errs }));
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    beginOperation();
    try {
      await saveSkill({
        data: {
          id: null,
          claimType,
          skillCode: draft.skillCode,
          // The database refuses a level on a type that has no scale, so the
          // empty string must become null rather than travel as "".
          skillLevel: draft.skillLevel || null,
          jurisdictionCode: draft.jurisdictionCode.trim().toUpperCase() || null,
          validUntil: draft.validUntil || null,
          holderNote: draft.holderNote.trim() || null,
        },
      });
      setSkillDrafts((prev) => ({ ...prev, [claimType]: null }));
      // Read-back before success. "Sparat." is a claim about persistence, so
      // it is only made once the server has handed the entry back.
      if (await refresh()) succeeded(pt("entry.saved"));
    } catch (err) {
      console.error("[passport] skill save failed", err);
      failed(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "claim" | "experience", id: string) {
    if (!window.confirm(pt("entry.removeConfirm"))) return;
    setBusy(true);
    beginOperation();
    try {
      const res = await doRemove({ data: { kind, id } });
      // The server refuses once an entry has evidence or a review, and says
      // so rather than pretending the delete worked.
      const readBack = await refresh();
      if (!res.removed) failed(pt("entry.removeBlocked"));
      else if (readBack) succeeded(pt("entry.saved"));
    } catch (err) {
      console.error("[passport] remove failed", err);
      failed(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function openEntry(kind: "claim" | "experience", id: string) {
    void navigate({ to: "/passport/entry/$kind/$entryId", params: { kind, entryId: id } });
  }

  async function commitBasics(patch: ProfileBasicsPatch) {
    beginOperation();
    await saveBasics({ data: patch });
    // Read-back before the card reports success. "Sparat" is a claim about
    // persistence and is not made until the server has handed the row back —
    // the same rule every other save on this page follows.
    await refreshWorkCountry();
    succeeded(pt("basics.savedNotice"));
  }

  /* ── THE SIX ANSWERS, RESOLVED FROM WHERE EACH ONE ACTUALLY LIVES ────
   *
   * Two profile columns, one confirmed country, one real employment row and
   * one timestamp. The card is given the finished answers rather than any of
   * these sources, so it never has to know — and cannot write back to the two
   * that are domain rows.
   *
   * The current role is read from the holder's live employment, not from the
   * onboarding answer that seeded it. Those two diverge the moment somebody
   * edits their employment below, and the record is the truth; a stored
   * wizard answer is only what they typed once. */
  const currentPeriod = experience.find((e) => e.endedOn === null) ?? experience[0] ?? null;
  const basicsAnswers: Record<string, string> = {
    "identity.displayName": basics?.displayName ?? "",
    "identity.headline": basics?.headline ?? "",
    "profession.profession": basics?.professionSlug ?? "",
    // Confirmed only. An unconfirmed legacy 'SE' is not an answer the holder
    // gave, so the question reads as unanswered — exactly as it does
    // everywhere else in the Passport.
    "jurisdiction.jurisdiction": workCountry?.confirmed
      ? (workCountry.subJurisdictionCode ?? workCountry.jurisdictionCode ?? "")
      : "",
    "currentRole.employer": currentPeriod?.employerName ?? "",
    "currentRole.role": currentPeriod?.roleTitle ?? "",
    "currentRole.startedOn": currentPeriod?.startedOn ?? "",
    "declaration.declared": basics?.declaredAccurateAt ? "true" : "",
  };
  // The stored profession is a slug ("vaktare"), which is a database
  // identifier and not something a person reads. The card shows it, does not
  // edit it, and would otherwise render the raw slug — so the catalogue's own
  // title is resolved for display only. Completeness is still computed from
  // `basicsAnswers`, never from this.
  const professionTitle = professionOptions.find((p) => p.slug === basics?.professionSlug) ?? null;
  const basicsDisplay: Record<string, string> = {
    "profession.profession": professionTitle
      ? lang === "sv"
        ? professionTitle.title_sv
        : professionTitle.title_en
      : "",
    // "AE-DU" is a code, not something a person reads. The holder's own
    // location is formatted with the sub-jurisdiction intact, because
    // flattening Dubai into "UAE" makes the country-wide claim.
    "jurisdiction.jurisdiction": workCountry?.confirmed
      ? formatWorkLocation(workCountry.jurisdictionCode, workCountry.subJurisdictionCode, lang)
      : "",
  };

  function focusById(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("info.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("info.lead")}</p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {/* ── 1. THE SIX PROFILE BASICS ─────────────────────────────────── */}
      {/* First on the page, because these are the questions that build the
          Passport and, since the onboarding tab was removed in 9a150a6, there
          was nowhere at all a holder could go back and read them. */}
      {/* Gated on the profile having ARRIVED, not merely on the page having
          loaded. The card seeds its own draft state from these answers on
          mount and then owns them, so that a background refresh cannot wipe
          out what the holder is halfway through typing — which means mounting
          it before the profile resolves would leave every field empty and the
          count reading "1 av 6" for a holder who had answered five. The
          entries below load on their own clock and are unaffected. */}
      {basics ? (
        <ProfileBasicsCard
          answers={basicsAnswers}
          displayAnswers={basicsDisplay}
          declaredAccurateAt={basics?.declaredAccurateAt ?? null}
          onSave={commitBasics}
          // The two answers that ARE domain rows are edited by the controls that
          // own them, further down this same page. One fact, one writer.
          // Current profession is NOT edited here. Its canonical home is the
          // Professional Profile on /my-career, and the Passport mirrors it
          // rather than keeping a second, independently written copy.
          onEditProfession={() => void navigate({ to: CAREER_PROFILE_ROUTE })}
          onEditWorkCountry={() => focusById("sp-work-country")}
          onEditCurrentRole={() => focusById("sp-employment")}
        />
      ) : null}

      {/* ── 2. WORK COUNTRY AND AUTHORISATIONS ────────────────────────── */}
      <div className="space-y-5">
        <header>
          <h2
            className="text-lg font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pt("basics.qualificationsTitle")}
          </h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
            {pt("basics.qualificationsLead")}
          </p>
        </header>

        {/* ── Where the holder works ────────────────────────────────────── */}
        {/* Every credential below is read in the context of a country, and this
          is the one control that sets it. */}
        {workCountry ? (
          <WorkCountryCard
            jurisdictionCode={workCountry.jurisdictionCode}
            subJurisdictionCode={workCountry.subJurisdictionCode}
            confirmed={workCountry.confirmed}
            onSave={async (value) => {
              await saveWorkCountry({ data: { workCountry: value } });
              await refreshWorkCountry();
            }}
          />
        ) : null}

        {/* ── The selected market, and only the selected market ────────── */}
        {/* Was a literal ["VU1","VU2","OV","SV"] rendered unconditionally, which
          offered Swedish regulated credentials to a holder who had told the
          product they work in Dubai. It is now the governed answer, and the
          three closed states each say which absence they are. */}
        <MarketCredentialSection
          state={availability?.state ?? "no_work_country"}
          jurisdictionCode={availability?.jurisdictionCode ?? null}
          subJurisdictionCode={availability?.subJurisdictionCode ?? null}
          options={availability?.state === "open" ? availability.types : []}
          onSelect={(code) => void navigate({ to: "/passport/credentials/new", search: { code } })}
          onSetWorkCountry={() => {
            document.getElementById("sp-work-country")?.focus();
          }}
        >
          {hereClaims.length > 0 ? (
            <ul className="space-y-2">
              {hereClaims.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <CredentialSymbol
                      code={c.credentialCode}
                      state={credentialPresentationOf(c, c.lifecycleState as LifecycleState)}
                      name={c.title}
                      size={36}
                      decorative
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {c.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2">
                        <AssertionChip
                          level={c.assertionLevel as AssertionLevel}
                          provenance={c}
                          size="sm"
                        />
                        <LifecycleChip state={c.lifecycleState as LifecycleState} />
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openEntry("claim", c.id)}
                    className="inline-flex h-11 shrink-0 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {pt("claim.openDetail")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </MarketCredentialSection>

        {/* ── What the holder has earned somewhere else ─────────────────── */}
        {/* Read-only, and rendered even when empty while the holder works
          anywhere: "you have nothing in another market yet" is the answer to
          the question a country change provokes, and silence is not. */}
        <OtherMarketsPanel profiles={elsewhereProfiles} />
      </div>

      {/* ── Employment ────────────────────────────────────────────────── */}
      {/* The canonical editor for the "current role" basic. The card above
          links here rather than carrying a second employer field, because a
          period can hold evidence and a review and must have one writer. */}
      <SectionShell
        id="sp-employment"
        icon={<Briefcase aria-hidden="true" className="h-4 w-4" />}
        title={pt("info.employment")}
        lead={pt("info.employmentLead")}
      >
        {experience.length === 0 ? (
          <p className="text-sm text-muted-foreground">{pt("entry.none")}</p>
        ) : (
          <ul className="space-y-2">
            {experience.map((e) => (
              <li key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {e.roleTitle} · {e.employerName}
                    </p>
                    <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                      {formatPeriodRange(e.startedOn, e.endedOn, lang)}
                    </p>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <AssertionChip
                        level={e.assertionLevel as AssertionLevel}
                        provenance={e}
                        size="sm"
                      />
                      <LifecycleChip state={e.lifecycleState as LifecycleState} />
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEntry("experience", e.id)}
                      className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pt("entry.documentAndVerify")}
                    </button>
                    {e.editable ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({ kind: "experience", draft: experienceToDraft(e) })
                          }
                          className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {pt("entry.edit")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove("experience", e.id)}
                          className="inline-flex h-11 items-center rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {pt("entry.remove")}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing?.kind === "experience" ? (
          <div className="mt-4 rounded-lg border border-accent/40 bg-secondary/30 p-4">
            <ExperienceForm
              draft={editing.draft}
              onChange={(d) => setEditing({ kind: "experience", draft: d })}
              errors={expErrors}
              busy={busy}
              onSave={() => void commitExperience(editing.draft)}
              onCancel={() => {
                setEditing(null);
                setExpErrors({});
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setExpErrors({});
              setEditing({ kind: "experience", draft: emptyExperienceDraft() });
            }}
            className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {pt("info.addEmployment")}
          </button>
        )}
      </SectionShell>

      {/* ── Languages and practical skills ────────────────────────────── */}
      {(
        [
          {
            kind: "language",
            titleKey: "info.languages",
            icon: <Languages aria-hidden="true" className="h-4 w-4" />,
          },
          {
            kind: "practical_skill",
            titleKey: "info.skills",
            icon: <Wrench aria-hidden="true" className="h-4 w-4" />,
          },
        ] as const
      ).map((section) => (
        <SectionShell
          key={section.kind}
          icon={section.icon}
          title={pt(section.titleKey)}
          // Anchored so a Next Best Action can land on the section that owns
          // the missing answer rather than at the top of a long page.
          id={section.kind === "language" ? "sp-languages" : "sp-skills"}
        >
          <SkillSection
            claimType={section.kind}
            types={skillTypes}
            jurisdictions={jurisdictions}
            entries={claims.filter((c) => c.claimType === section.kind)}
            draft={skillDrafts[section.kind]}
            errors={skillErrors[section.kind] ?? {}}
            busy={busy}
            onDraftChange={(d) => setSkillDrafts((prev) => ({ ...prev, [section.kind]: d }))}
            onStart={() =>
              setSkillDrafts((prev) => ({ ...prev, [section.kind]: emptySkillDraft() }))
            }
            onCancel={() => {
              setSkillDrafts((prev) => ({ ...prev, [section.kind]: null }));
              setSkillErrors((prev) => ({ ...prev, [section.kind]: {} }));
            }}
            onSave={(d) => void commitSkill(section.kind, d)}
            onRemove={(id) => void remove("claim", id)}
            onOpen={(id) => openEntry("claim", id)}
          />
        </SectionShell>
      ))}

      {/* ── Education, courses, certificates, specialisations ─────────── */}
      {CLAIM_SECTIONS.map((section) => {
        const rows = freeClaims.filter((c) => c.claimType === section.kind);
        const isEditingThis = editing?.kind === "claim" && editing.draft.claimType === section.kind;
        return (
          <SectionShell
            key={section.kind}
            icon={<GraduationCap aria-hidden="true" className="h-4 w-4" />}
            title={pt(section.titleKey)}
            id={section.kind === "education" ? "sp-education" : undefined}
          >
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{pt("entry.none")}</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.title}</p>
                        {c.issuerName ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">{c.issuerName}</p>
                        ) : null}
                        <span className="mt-1.5 flex flex-wrap items-center gap-2">
                          <AssertionChip level={c.assertionLevel as AssertionLevel} size="sm" />
                          <LifecycleChip state={c.lifecycleState as LifecycleState} />
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEntry("claim", c.id)}
                          className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {pt("entry.documentAndVerify")}
                        </button>
                        {c.editable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditing({ kind: "claim", draft: claimToDraft(c) })}
                              className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {pt("entry.edit")}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove("claim", c.id)}
                              className="inline-flex h-11 items-center rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {pt("entry.remove")}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {isEditingThis ? (
              <div className="mt-4 rounded-lg border border-accent/40 bg-secondary/30 p-4">
                <ClaimEntryForm
                  draft={editing.draft}
                  onChange={(d) => setEditing({ kind: "claim", draft: d })}
                  errors={claimErrors}
                  busy={busy}
                  onSave={() => void commitClaim(editing.draft)}
                  onCancel={() => {
                    setEditing(null);
                    setClaimErrors({});
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setClaimErrors({});
                  setEditing({ kind: "claim", draft: emptyClaimDraft(section.kind) });
                }}
                className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {pt("entry.add")}
              </button>
            )}
          </SectionShell>
        );
      })}

      <p className="text-sm leading-relaxed text-muted-foreground">
        {pt("entry.selfDeclaredNote")}
      </p>
    </div>
  );
}
