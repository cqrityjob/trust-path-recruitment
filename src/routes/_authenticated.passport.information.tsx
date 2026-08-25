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
import { useServerFn } from "@tanstack/react-start";
import { WorkCountryCard } from "@/components/security-passport/WorkCountryCard";
import { getMyPassport, setWorkCountry } from "@/lib/security-passport/passport.functions";
import { Briefcase, GraduationCap, Languages, Plus, ShieldCheck, Wrench } from "lucide-react";
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
import { formatPeriodRange } from "@/lib/security-passport/format";
import { credentialPresentation } from "@/lib/security-passport/design/credential-symbols";
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
}: {
  icon: React.ReactNode;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
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
  const [workCountry, setWorkCountryState] = useState<{
    jurisdictionCode: string | null;
    subJurisdictionCode: string | null;
    confirmed: boolean;
  } | null>(null);
  const refreshWorkCountry = useCallback(async () => {
    try {
      const snap = await loadProfile({ data: undefined });
      setWorkCountryState({
        jurisdictionCode: snap.profile?.jurisdictionCode ?? null,
        subJurisdictionCode: snap.profile?.subJurisdictionCode ?? null,
        confirmed: Boolean(snap.profile?.workLocationConfirmedAt),
      });
    } catch (err) {
      // A failure here must not take the rest of the page down with it: the
      // entries below are independent and still editable.
      console.error("[passport] work country load failed", err);
    }
  }, [loadProfile]);
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
      return true;
    } catch (err) {
      console.error("[passport] entries load failed", err);
      failed(pt("common.error"));
      return false;
    } finally {
      setLoaded(true);
    }
  }, [load, loadSkillTypes, loadJurisdictions, failed, pt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The four taxonomy credentials are shown here for completeness but are
  // never edited here — they belong to the credential form.
  const taxonomyClaims = useMemo(() => claims.filter((c) => c.credentialCode !== null), [claims]);
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

      {/* ── Where the holder works ────────────────────────────────────── */}
      {/* First, because every credential below is read in the context of a
          country, and until this commit there was nowhere in the product to
          see or change it. */}
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

      {/* ── Supported credentials ─────────────────────────────────────── */}
      <SectionShell
        icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
        title={pt("cred.overview.title")}
        lead={pt("cred.overview.body")}
      >
        {taxonomyClaims.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {taxonomyClaims.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <CredentialSymbol
                    code={c.credentialCode}
                    state={credentialPresentation(
                      c.assertionLevel as AssertionLevel,
                      c.lifecycleState as LifecycleState,
                    )}
                    name={c.title}
                    size={36}
                    decorative
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {c.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      <AssertionChip level={c.assertionLevel as AssertionLevel} size="sm" />
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

        <div className="flex flex-wrap gap-2">
          {(["VU1", "VU2", "OV", "SV"] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => void navigate({ to: "/passport/credentials/new", search: { code } })}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <CredentialSymbol
                code={code}
                state="self_declared"
                name={code}
                size={28}
                decorative
              />
              {code}
            </button>
          ))}
        </div>
      </SectionShell>

      {/* ── Employment ────────────────────────────────────────────────── */}
      <SectionShell
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
                      <AssertionChip level={e.assertionLevel as AssertionLevel} size="sm" />
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
        <SectionShell key={section.kind} icon={section.icon} title={pt(section.titleKey)}>
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
