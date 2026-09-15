// Credential management. Profile/CV facts retain their canonical editors.
// Legacy anchors link to those editors without reproducing employment data.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  PassportSectionNav,
  type PassportSectionLink,
} from "@/components/security-passport/PassportSectionNav";
import { ScrollToHashOnceReady } from "@/components/security-passport/ScrollToHashOnceReady";
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
import { getMyPassport } from "@/lib/security-passport/passport.functions";
import {
  getRegulatedCredentialAvailability,
  listSelectableMarkets,
  type RegulatedCredentialAvailability,
  type SelectableMarket,
} from "@/lib/security-passport/credentials.functions";
import { catalogueOptionsFor } from "@/lib/security-passport/market-catalogue";
import { Briefcase, GraduationCap, Plus, ShieldCheck } from "lucide-react";
import { CAREER_PROFILE_ROUTE } from "@/lib/security-passport/profile-basics";
import {
  listCurrentProfessionOptions,
  type CurrentProfessionOption,
} from "@/lib/security-career-profile/profession-options";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  listMyEntries,
  removeEntry,
  saveClaimEntry,
  listJurisdictions,
  type ClaimEntry,
  type ExperienceEntry,
  type FreeClaimKind,
  type Jurisdiction,
} from "@/lib/security-passport/entries.functions";
import { formatPeriodRange, formatWorkLocation } from "@/lib/security-passport/format";
import { credentialPresentationOf } from "@/lib/security-passport/trust-presentation";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { LifecycleChip } from "@/components/security-passport/LifecycleChip";
import { CredentialSymbol } from "@/components/security-passport/CredentialSymbol";
import {
  ClaimEntryForm,
  claimToDraft,
  emptyClaimDraft,
  validateClaim,
  type ClaimDraft,
  type ExperienceDraft,
} from "@/components/security-passport/EntryForms";
import type { AssertionLevel, LifecycleState } from "@/lib/security-passport/types";

export const Route = createFileRoute("/_authenticated/passport/information")({
  ssr: false,
  component: PassportInformationRoute,
});

/** The claim sections, split by WHAT THEY ARE rather than by where they are
 *  stored.
 *
 *  ── WHY THE SPLIT IS PRESENTATIONAL AND NOTHING ELSE ─────────────────
 *
 *  Every row below is an `sp_claims` row, and stays one. The owner's pilot
 *  review asked that general profile/CV information stop being PRESENTED as
 *  Passport trust evidence -- which is a question about what this page says,
 *  not about where the fact lives.
 *
 *  Moving these rows somewhere else would be the wrong fix twice over.
 *  `sp_claims` is where a fact can carry evidence, a review and a
 *  verification state, which is exactly why education and languages were put
 *  there; and profile-destinations.ts records the owner decision behind
 *  migration 20261007090000 in so many words -- copying a Passport fact into
 *  a profile table "would recreate precisely the two-writer defect it
 *  removed". One fact, one row, one writer.
 *
 *  The CV already reads these: cv/source-bundle.ts projects education,
 *  languages and skills out of the same rows through EDUCATION_CLAIM_TYPES,
 *  LANGUAGE_CLAIM_TYPES and SKILL_CLAIM_TYPES, and CvDocumentView renders
 *  them as Utbildning / Språk / Färdigheter. So the single source of truth
 *  the review asks for is already in place; what was missing was this page
 *  saying which of the two products each section belongs to. */
/** Where the general profile/CV editors live.
 *
 *  Deliberately NOT `CAREER_PROFILE_ROUTE`, which is "/my-career" -- the
 *  overview. Education, languages and skills are edited one level down, on
 *  the profile page, and pointing at the overview would land the reader on
 *  a page that does not contain what the link promised. */
const GENERAL_PROFILE_ROUTE = "/my-career/profile" as const;

/** The section row's destinations. Employment first because it is the
 *  first section on the page, then the credential sections in the order
 *  they render — DERIVED from PASSPORT_CLAIM_SECTIONS below rather than
 *  restated, so a section added there appears in the row automatically and
 *  the two cannot drift. */
const PASSPORT_CLAIM_SECTIONS: readonly { kind: FreeClaimKind; titleKey: PassportCopyKey }[] = [
  { kind: "certification", titleKey: "claims.type.certification" },
];

const SECTION_LINKS: readonly PassportSectionLink[] = [
  { anchor: "sp-employment", titleKey: "info.employment" },
  ...PASSPORT_CLAIM_SECTIONS.map((s) => ({
    anchor: `sp-${s.kind}`,
    titleKey: s.titleKey,
  })),
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
  // The governed answer to "what may this holder register here". NOT a literal
  // credential list: see MarketCredentialSection for why the literal was a
  // regulatory claim rather than a convenience.
  const loadAvailability = useServerFn(getRegulatedCredentialAvailability);
  const loadMarkets = useServerFn(listSelectableMarkets);
  const [workCountry, setWorkCountryState] = useState<{
    jurisdictionCode: string | null;
    subJurisdictionCode: string | null;
    confirmed: boolean;
  } | null>(null);
  const [availability, setAvailability] = useState<RegulatedCredentialAvailability | null>(null);
  /** ── THE MARKET SELECTOR IS A BROWSING FILTER (owner, 2026-09-14) ────
   *
   *  Looking at what Great Britain regulates is not a statement that you
   *  work there. This is local state only: it never calls setWorkCountry,
   *  never writes a row, and is discarded when the page is left. `null`
   *  means "the market I actually work in", which is what a holder sees on
   *  arrival — the saved answer, not a remembered browse. */
  const [browseMarket, setBrowseMarket] = useState<{
    jurisdictionCode: string;
    subJurisdictionCode: string | null;
  } | null>(null);
  const [selectableMarkets, setSelectableMarkets] = useState<readonly SelectableMarket[]>([]);
  // Three states for the catalogue read, kept apart from the answer itself:
  // "no answer yet" and "the read failed" both leave `availability` null, and
  // a section that could not tell them apart would draw a healthy, slow read
  // as a failure — or a failure as an empty market.
  const [availabilityStatus, setAvailabilityStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  // ── ONE ANSWER ON SCREEN, AND ONLY THE LATEST ────────────────────────
  //
  // A holder who changes Sweden to Great Britain triggers a second read while
  // the first may still be in flight. Two things must hold: while the new
  // read is open, NO option from the previous market may render under the
  // new market's heading (a Swedish training offered under "Great Britain"
  // is exactly the regulatory claim this page exists not to make); and when
  // the reads settle out of order, the older answer must lose. Each refresh
  // takes a sequence number; the previous answer is cleared before the read
  // starts, and a response whose number is no longer current is dropped.
  const availabilitySeq = useRef(0);
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
    const seq = ++availabilitySeq.current;
    // The previous market's answer leaves the screen BEFORE the new read is
    // sent, never after it returns.
    setAvailability(null);
    setAvailabilityStatus("loading");
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
      if (seq !== availabilitySeq.current) return;
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
      const next = await loadAvailability({ data: browseMarket ?? undefined });
      if (seq !== availabilitySeq.current) return;
      setAvailability(next);
      setAvailabilityStatus("ready");
    } catch (err) {
      if (seq !== availabilitySeq.current) return;
      console.error("[passport] market availability load failed", err);
      setAvailability(null);
      setAvailabilityStatus("failed");
    }
  }, [loadProfile, loadAvailability, invalidateCandidateReadModels, browseMarket]);
  useEffect(() => {
    void refreshWorkCountry();
  }, [refreshWorkCountry]);

  useEffect(() => {
    let alive = true;
    void loadMarkets({ data: undefined })
      .then((m) => {
        if (alive) setSelectableMarkets(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loadMarkets]);
  const saveClaim = useServerFn(saveClaimEntry);
  const doRemove = useServerFn(removeEntry);
  const loadJurisdictions = useServerFn(listJurisdictions);

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
  const [claimErrors, setClaimErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [jurisdictions, setJurisdictions] = useState<readonly Jurisdiction[]>([]);
  // One draft per section, keyed by claim_type, so opening the language form
  // does not close a half-filled licence form.

  /** Resolves true only when the read-back returned. Callers must not
   *  report success without it: a write that cannot be read back has not
   *  been shown to have happened. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      // Skill types are no longer read here: languages and practical skills
      // are edited on the canonical profile, and this page stopped needing
      // their vocabulary when their editors left it.
      const [data, jurs] = await Promise.all([
        load({ data: undefined }),
        loadJurisdictions({ data: undefined }),
      ]);
      setExperience(data.experience);
      setClaims(data.claims);
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
  }, [load, loadJurisdictions, failed, pt, invalidateCandidateReadModels]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── OLD DEEP LINKS LAND WHERE THE EDITOR WENT ───────────────────────
  //
  // `#sp-education`, `#sp-languages` and `#sp-skills` were real ids on this
  // page and are in browser histories, in bookmarks, and in any recommended
  // next step issued before this change. Their editors are on the canonical
  // profile now, so the fragment names nothing here.
  //
  // A fragment that matches no element is silent: the page simply opens at
  // the top and the reader is left to hunt for a section that is not there.
  // So the three are redirected to their new home rather than left to fail
  // quietly. `replace` so Back does not bounce between the two pages.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const moved: Readonly<Record<string, string>> = {
      "#sp-education": "profile-education",
      "#sp-training": "profile-training",
      "#sp-specialisation": "profile-specialisation",
      "#sp-professional_membership": "profile-professional_membership",
      "#sp-languages": "profile-languages",
      "#sp-skills": "profile-skills",
    };
    const hash = window.location.hash;
    const target = moved[hash];
    if (!target) return;
    void navigate({ to: GENERAL_PROFILE_ROUTE, hash: target, replace: true });
  }, [navigate]);

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

  function focusById(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>;

  const claimSection = (section: { kind: FreeClaimKind; titleKey: PassportCopyKey }) => {
    const rows = freeClaims.filter((c) => c.claimType === section.kind);
    const isEditingThis = editing?.kind === "claim" && editing.draft.claimType === section.kind;
    return (
      <SectionShell
        key={section.kind}
        // Its own anchor, so the section row can reach it. ADDITIVE:
        // the #sp-credentials wrapper id stays exactly where it was,
        // so the add-a-merit chooser and every #246 redirect still
        // resolve to the same place they did before.
        id={`sp-${section.kind}`}
        icon={<GraduationCap aria-hidden="true" className="h-4 w-4" />}
        title={pt(section.titleKey)}
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
              // No country is seeded. This form shows no country field,
              // and where somebody WORKS is not the jurisdiction of their
              // education, course or certificate.
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
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* The Passport workspace links here as `#sp-employment`,
          `#sp-education` and `#sp-work-country`, so "add a course" lands on
          the course section rather than at the top of a page the reader then
          has to search. The sections only exist once the reads answer, which
          is after the browser has given up on the fragment. */}
      <ScrollToHashOnceReady />
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
      {/* ── BASICS ARE EDITED ON THE PROFILE (owner, 2026-09-14) ────
          Display name, headline and the accuracy declaration are not
          security evidence, and correcting them should never have
          required opening the Security Passport. The card moved to
          /my-career/profile with its reads, its writer and its rules
          intact. This page keeps what it owns. */}
      {/* The anchor STAYS. #sp-profile-basics is linked from elsewhere and
          from PR #246's retired-anchor redirects; a moved editor must not
          turn a live deep link into a landing on nothing. What the reader
          finds here is a pointer to where the editing now happens. */}
      <p
        id="sp-profile-basics"
        tabIndex={-1}
        className="scroll-mt-24 text-sm leading-relaxed text-muted-foreground"
      >
        <Link
          to="/my-career/profile"
          hash="profile-basics"
          data-basics-authoring-link
          className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("basics.title")}
        </Link>
      </p>

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
        {/* Where a person works is a profile answer, not a credential. The
            control moved to the profile; this section and its
            #sp-work-country anchor stay, because the catalogue below is
            decided by that answer and deep links land here. */}
        {workCountry ? (
          <div
            id="sp-work-country"
            tabIndex={-1}
            data-saved-work-country={
              workCountry.confirmed ? (workCountry.jurisdictionCode ?? "") : ""
            }
            className="scroll-mt-24 text-sm leading-relaxed text-muted-foreground"
          >
            {/* READ-ONLY. The saved answer is stated here and edited in one
                place, on the profile. */}
            <p>
              {workCountry.confirmed
                ? formatWorkLocation(
                    workCountry.jurisdictionCode,
                    workCountry.subJurisdictionCode,
                    lang,
                  )
                : pt("basics.workCountryUnset")}{" "}
              <Link
                to="/my-career/profile"
                hash="profile-work-country"
                data-work-country-authoring-link
                className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("basics.editWorkCountry")}
              </Link>
            </p>

            {/* ── BROWSING FILTER, NOT AN ANSWER ────────────────────────
                Changes which market's catalogue is shown below and nothing
                else: local state, no write, discarded on leaving. It opens
                on the holder's own market every time, so a browse is never
                mistaken for what they told us. */}
            {selectableMarkets.length > 0 ? (
              <label className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {pt("basics.browseMarketLabel")}
                </span>
                <select
                  data-market-filter
                  className="inline-flex min-h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  value={
                    browseMarket
                      ? `${browseMarket.jurisdictionCode}|${browseMarket.subJurisdictionCode ?? ""}`
                      : `${workCountry.jurisdictionCode ?? ""}|${workCountry.subJurisdictionCode ?? ""}`
                  }
                  onChange={(e) => {
                    const [j, sub] = e.target.value.split("|");
                    setBrowseMarket(
                      j ? { jurisdictionCode: j, subJurisdictionCode: sub || null } : null,
                    );
                  }}
                >
                  {selectableMarkets.map((m) => (
                    <option
                      key={m.marketPackCode}
                      value={`${m.jurisdictionCode}|${m.subJurisdictionCode ?? ""}`}
                    >
                      {lang === "sv" ? m.nameSv : m.nameEn}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {/* ── The selected market, and only the selected market ────────── */}
        {/* Was a literal ["VU1","VU2","OV","SV"] rendered unconditionally, which
          offered Swedish regulated credentials to a holder who had told the
          product they work in Dubai. It is now the governed answer, and the
          three closed states each say which absence they are.

          The OPTIONS come from the shared rule, not from a comparison written
          here. This line used to read `availability?.state === "open"`, which
          was complete on the day it was written and silently incomplete the
          day "open_pilot" joined the union: the section below and the form
          after it both accepted a pilot market, and this route alone passed
          it an empty list — so an entitled pilot holder read the pilot status
          line and found nothing under it. `catalogueOptionsFor` is the one
          place that decides, and scripts/passport-market-catalogue-check
          fails the build if a route restates it. */}
        <MarketCredentialSection
          // `state` is consulted only once the read is "ready"; while it is
          // loading or after it failed the section draws THAT, and never the
          // "no work country" state a null answer would otherwise imply.
          state={availability?.state ?? "no_work_country"}
          read={availabilityStatus}
          jurisdictionCode={
            availability?.jurisdictionCode ??
            (workCountry?.confirmed ? workCountry.jurisdictionCode : null)
          }
          subJurisdictionCode={
            availability?.subJurisdictionCode ??
            (workCountry?.confirmed ? workCountry.subJurisdictionCode : null)
          }
          options={catalogueOptionsFor(availability)}
          onRetry={() => void refreshWorkCountry()}
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
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          <Link
            to="/my-career/profile"
            hash="profile-employment"
            data-employment-authoring-link
            className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("info.addEmployment")}
          </Link>
        </p>
      </SectionShell>

      {/* ── SECTION ROW (image 2) ────────────────────────────────────────
          In-page links, never tabs: every section below stays in the
          document, because #sp-credentials and #sp-employment are linked
          from elsewhere and PR #246's retired-anchor redirects land here.
          A redirect onto a hidden panel is a redirect that silently
          fails. */}
      <PassportSectionNav label={pt("info.sections.label")} sections={SECTION_LINKS} />

      {/* ── Security-relevant credentials ─────────────────────────────── */}
      {/* Anchored so "add a course or certificate" lands on the sections
          that own it rather than at the top of a long page. It replaces
          `sp-education`, which left with the education editor. */}
      <div id="sp-credentials" className="scroll-mt-24 space-y-5">
        {PASSPORT_CLAIM_SECTIONS.map(claimSection)}
      </div>

      {/* ── GENERAL PROFILE AND CV FACTS ARE NOT EDITED HERE ──────────
          Education, languages and practical skills (driving licence among
          them) were edited on this page, which is what made a candidate
          come to the Security Passport to record their degree. Their
          editors are on the canonical profile now.

          This is a LINK, not a second editor: one fact, one row, one write
          path. The rows themselves did not move -- each is still an
          `sp_claims` row, and an entry's evidence and verification are
          still handled on its own Passport entry page. */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {pt("info.generalMoved")}{" "}
        <Link
          to={GENERAL_PROFILE_ROUTE}
          data-cta="general-profile"
          className="font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt("info.generalMovedLink")}
        </Link>
      </p>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {pt("entry.selfDeclaredNote")}
      </p>
    </div>
  );
}
