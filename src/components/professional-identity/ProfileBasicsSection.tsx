// Basic information and work country, EDITED on the canonical profile.
//
// ── THE OWNER'S CORRECTION ─────────────────────────────────────────────
//
// These two were edited inside /passport/information, which is what made
// a candidate open the Security Passport to correct their display name or
// say which country they work in. Neither is security evidence. The owner
// moved the general authoring editors to the profile workspace; the
// Passport keeps evidence, provenance, verification and sharing.
//
// ── A MOVE OF THE EDITOR, NOT OF THE RECORD ────────────────────────────
//
// Both cards are the EXISTING components — ProfileBasicsCard and
// WorkCountryCard — imported, not reimplemented. The writes go through the
// canonical savePassportBasics and setWorkCountry, against the same
// sp_passport_profiles row. No new server function, no second table, no
// copy of either form.
//
// Those two components are deliberately kept clear of the server tier
// (passport-separation-check enforces it for every Passport component), so
// this section owns the reads and the writes and hands them finished
// values — exactly as the Passport route used to.
//
// ── THE SIX ANSWERS COME FROM FOUR PLACES ──────────────────────────────
//
// Two profile columns, one confirmed country, one real employment row and
// one timestamp. The card is given finished answers and never has to know,
// which is also why it cannot write back to the two that are domain rows:
// the current role is read from the holder's live employment, because the
// record is the truth and a stored wizard answer is only what they typed
// once.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ProfileBasicsCard,
  type ProfileBasicsPatch,
} from "@/components/security-passport/ProfileBasicsCard";
import { WorkCountryCard } from "@/components/security-passport/WorkCountryCard";
import {
  getMyPassport,
  savePassportBasics,
  setWorkCountry,
} from "@/lib/security-passport/passport.functions";
import { listMyEntries } from "@/lib/security-passport/entries.functions";
import {
  listCurrentProfessionOptions,
  type CurrentProfessionOption,
} from "@/lib/security-career-profile/profession-options";
import { formatWorkLocation } from "@/lib/security-passport/format";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { useT } from "@/i18n/context";

const CAREER_PROFILE_ROUTE = "/my-career/profile";

type Basics = {
  displayName: string;
  headline: string;
  professionSlug: string;
  declaredAccurateAt: string | null;
};

type Country = {
  jurisdictionCode: string | null;
  subJurisdictionCode: string | null;
  confirmed: boolean;
};

export function ProfileBasicsSection({ className = "" }: { className?: string }) {
  const { pt } = usePassportCopy();
  const { lang } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const loadProfile = useServerFn(getMyPassport);
  const loadEntries = useServerFn(listMyEntries);
  const saveBasics = useServerFn(savePassportBasics);
  const saveCountry = useServerFn(setWorkCountry);

  const [basics, setBasics] = useState<Basics | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [currentRole, setCurrentRole] = useState<{
    employerName: string;
    roleTitle: string;
    startedOn: string;
  } | null>(null);
  const [professions, setProfessions] = useState<CurrentProfessionOption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Read back before any success is reported. "Sparat" is a claim about
   *  persistence, and it is the same rule this write followed on the
   *  Passport. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const snap = await loadProfile({ data: undefined });
      setBasics({
        displayName: snap.profile?.displayName ?? "",
        headline: snap.profile?.headline ?? "",
        professionSlug: snap.profile?.cigProfessionSlug ?? "",
        declaredAccurateAt: snap.profile?.declaredAccurateAt ?? null,
      });
      setCountry({
        jurisdictionCode: snap.profile?.jurisdictionCode ?? null,
        subJurisdictionCode: snap.profile?.subJurisdictionCode ?? null,
        confirmed: Boolean(snap.profile?.workLocationConfirmedAt),
      });
      return true;
    } catch (err) {
      console.error("[profile] basics read failed", err);
      setError(pt("common.error"));
      return false;
    }
  }, [loadProfile, pt]);

  useEffect(() => {
    void refresh();
    // The current role is the holder's live employment, settled on its own
    // clock: a failure here must leave the basics card usable.
    void loadEntries({ data: undefined })
      .then((entries) => {
        const period =
          entries.experience.find((e) => e.endedOn === null) ?? entries.experience[0] ?? null;
        setCurrentRole(
          period
            ? {
                employerName: period.employerName,
                roleTitle: period.roleTitle,
                startedOn: period.startedOn,
              }
            : null,
        );
      })
      .catch(() => {});
    void listCurrentProfessionOptions()
      .then(setProfessions)
      .catch(() => {});
  }, [refresh, loadEntries]);

  // ── A FAILED READ SAYS SO ───────────────────────────────────────────
  //
  // This returned null until both reads had answered -- including when the
  // read had FAILED, because the error was only rendered further down, past
  // this guard. On the Profile page that meant the name-and-title editor was
  // simply absent, with nothing saying why and nothing to press. Found by
  // walking the page against a backend whose read refused.
  if (!basics || !country) {
    return (
      // No anchor here: `#profile-basics` is rendered exactly once, by the
      // ready branch below, and the page's ScrollToHashOnceReady waits for it.
      <section
        aria-label={pt("basics.compactTitle")}
        data-profile-basics-state={error ? "failed" : "loading"}
        className={className}
      >
        {error ? (
          <div role="alert" className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                void refresh();
              }}
              className="mt-3 inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("live.retry")}
            </button>
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {pt("common.loading")}
          </p>
        )}
      </section>
    );
  }

  const answers: Record<string, string> = {
    "identity.displayName": basics.displayName,
    "identity.headline": basics.headline,
    "profession.profession": basics.professionSlug,
    // Confirmed only. An unconfirmed legacy 'SE' is not an answer the
    // holder gave, so the question reads as unanswered.
    "jurisdiction.jurisdiction": country.confirmed
      ? (country.subJurisdictionCode ?? country.jurisdictionCode ?? "")
      : "",
    "currentRole.employer": currentRole?.employerName ?? "",
    "currentRole.role": currentRole?.roleTitle ?? "",
    "currentRole.startedOn": currentRole?.startedOn ?? "",
    "declaration.declared": basics.declaredAccurateAt ? "true" : "",
  };

  const professionTitle = professions.find((p) => p.slug === basics.professionSlug) ?? null;
  const displayAnswers: Record<string, string> = {
    "profession.profession": professionTitle
      ? lang === "sv"
        ? professionTitle.title_sv
        : professionTitle.title_en
      : "",
    "jurisdiction.jurisdiction": country.confirmed
      ? formatWorkLocation(country.jurisdictionCode, country.subJurisdictionCode, lang)
      : "",
  };

  return (
    <section
      id="profile-basics"
      aria-labelledby="profile-basics-heading"
      data-profile-basics
      // The section overview links straight here, so the anchor carries its
      // own scroll offset: without it the fixed header lands on top of the
      // heading the reader was sent to.
      className={`scroll-mt-24 ${className}`}
    >
      <h3 id="profile-basics-heading" className="sr-only">
        {pt("basics.title")}
      </h3>

      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* The compact editor: the two answers this card writes, with Save and
          Cancel. The delegated three are not repeated as rows, because their
          canonical editors are mounted on this same page (work country
          below, profession in the career profile) or on the CV (current
          role, which is an employment record). */}
      <div className="rounded-xl border border-border bg-card p-5 md:p-6">
        <ProfileBasicsCard
          variant="compact"
          answers={answers}
          displayAnswers={displayAnswers}
          declaredAccurateAt={basics.declaredAccurateAt}
          onSave={async (patch: ProfileBasicsPatch) => {
            setNotice(null);
            setError(null);
            await saveBasics({ data: patch });
            // Read back before the card reports success, and tell every
            // surface that prints the name or the title -- the Profile
            // header above, My Career, the Passport -- that it changed.
            if (!(await refresh())) throw new Error("basics read-back failed");
            void queryClient.invalidateQueries({ queryKey: ["professional-identity"] });
          }}
          // The profession's canonical editor is the career profile on this
          // same page. The card never writes it.
          onEditProfession={() =>
            void navigate({ to: CAREER_PROFILE_ROUTE, hash: "career-profile" })
          }
          onEditWorkCountry={() => focusById("profile-work-country")}
          // The current role is an employment record, and employment is CV
          // content: its editor is on the CV page, not further down this one.
          onEditCurrentRole={() => void navigate({ to: "/my-career/cv", hash: "cv-employment" })}
        />
      </div>

      <div id="profile-work-country" className="mt-6 scroll-mt-24" data-profile-work-country>
        {/* Beside the card that was saved, not at the top of a section the
            reader has scrolled past. */}
        {notice && !error && (
          <p role="status" className="mb-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        <WorkCountryCard
          jurisdictionCode={country.jurisdictionCode}
          subJurisdictionCode={country.subJurisdictionCode}
          confirmed={country.confirmed}
          onSave={async (value) => {
            setNotice(null);
            setError(null);
            await saveCountry({ data: { workCountry: value } });
            if (await refresh()) {
              setNotice(pt("basics.savedNotice"));
              void queryClient.invalidateQueries({ queryKey: ["professional-identity"] });
            }
          }}
        />
      </div>
    </section>
  );
}

function focusById(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.focus?.();
}
