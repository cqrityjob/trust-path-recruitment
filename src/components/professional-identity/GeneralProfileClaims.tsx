// Education, languages and practical skills — edited where they belong.
//
// ── WHY THIS MOVED, AND WHAT DID NOT MOVE WITH IT ──────────────────────
//
// The owner's pilot review asked for a Security Passport that is short and
// focused: security trust evidence, and nothing else. Relabelling these
// sections inside /passport/information was not enough — a candidate still
// went to the Passport to record their degree and the languages they speak.
// So the EDITORS move to the canonical profile, which is where those facts
// belong.
//
// The DATA does not move, and must not. Every row here is an `sp_claims`
// row and stays one:
//
//   * sp_claims is where a fact can carry a document, a review and a
//     verification state. That is why education and languages were put
//     there, and it is still true after this change.
//   * profile-destinations.ts records the owner decision behind migration
//     20261007090000 in so many words: copying a Passport fact into a
//     profile table "would recreate precisely the two-writer defect it
//     removed".
//   * cv/source-bundle.ts already projects these same rows into the CV
//     through EDUCATION_CLAIM_TYPES, LANGUAGE_CLAIM_TYPES and
//     SKILL_CLAIM_TYPES. Moving the editor does not disturb that: the CV
//     goes on reading exactly the records this screen writes.
//
// ── ONE EDITOR, ONE WRITE PATH ─────────────────────────────────────────
//
// Nothing here is a new implementation. The forms are the SAME
// `ClaimEntryForm` and `SkillSection` the Passport uses for its own claim
// kinds, and the writes are the SAME `saveClaimEntry`, `saveSkillEntry` and
// `removeEntry` server functions. What changed is where they are mounted
// and for WHICH claim kinds:
//
//   education, language, practical_skill   → here, the profile
//   training, certification,               → /passport/information
//   specialisation, professional_membership
//
// The two sets are disjoint, so no claim kind has two editors.
//
// Driving licence needs no special case and no new field: it is the
// `driving_licence` code of the `practical_skill` claim type (Körkort, on
// the category scale), so it arrives with the practical skills below.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Languages, Plus, Wrench } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  listMyEntries,
  listSkillTypes,
  listJurisdictions,
  removeEntry,
  saveClaimEntry,
  saveSkillEntry,
  type ClaimEntry,
  type Jurisdiction,
  type SkillType,
} from "@/lib/security-passport/entries.functions";
import {
  ClaimEntryForm,
  claimToDraft,
  emptyClaimDraft,
  validateClaim,
  type ClaimDraft,
} from "@/components/security-passport/EntryForms";
import {
  SkillSection,
  emptySkillDraft,
  validateSkill,
  type SkillDraft,
} from "@/components/security-passport/SkillSection";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { LifecycleChip } from "@/components/security-passport/LifecycleChip";
import type { AssertionLevel, LifecycleState } from "@/lib/security-passport/types";

/** The claim kinds this surface owns. Education only: a security course is
 *  `training` and a security certificate is `certification`, and both stay
 *  in the Passport. */
const CV_CLAIM_KINDS = [{ kind: "education" as const, titleKey: "claims.type.education" as const }];

const SKILL_SECTIONS = [
  { kind: "language" as const, titleKey: "info.languages" as const, anchor: "profile-languages" },
  { kind: "practical_skill" as const, titleKey: "info.skills" as const, anchor: "profile-skills" },
];

function SectionShell({
  icon,
  title,
  id,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5"
      aria-label={title}
    >
      <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        {icon}
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function GeneralProfileClaims({ className = "" }: { className?: string }) {
  const { pt } = usePassportCopy();
  const navigate = useNavigate();

  const load = useServerFn(listMyEntries);
  const loadSkillTypes = useServerFn(listSkillTypes);
  const loadJurisdictions = useServerFn(listJurisdictions);
  const saveClaim = useServerFn(saveClaimEntry);
  const saveSkill = useServerFn(saveSkillEntry);
  const doRemove = useServerFn(removeEntry);

  const [claims, setClaims] = useState<readonly ClaimEntry[]>([]);
  const [skillTypes, setSkillTypes] = useState<readonly SkillType[]>([]);
  const [jurisdictions, setJurisdictions] = useState<readonly Jurisdiction[]>([]);
  const [editing, setEditing] = useState<ClaimDraft | null>(null);
  const [claimErrors, setClaimErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [skillDrafts, setSkillDrafts] = useState<
    Record<"language" | "practical_skill", SkillDraft | null>
  >({ language: null, practical_skill: null });
  const [skillErrors, setSkillErrors] = useState<
    Record<string, Record<string, PassportCopyKey>>
  >({ language: {}, practical_skill: {} });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Read back from the server. Every "saved" below is only said once this
   *  has answered — persistence is a claim, and it is not made on the
   *  strength of a request that merely returned. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const entries = await load({ data: undefined });
      setClaims(entries.claims);
      return true;
    } catch (err) {
      console.error("[profile] general claims read failed", err);
      setError(pt("common.error"));
      return false;
    }
  }, [load, pt]);

  useEffect(() => {
    void refresh();
    void loadSkillTypes({ data: undefined }).then(setSkillTypes).catch(() => {});
    void loadJurisdictions({ data: undefined }).then(setJurisdictions).catch(() => {});
  }, [refresh, loadSkillTypes, loadJurisdictions]);

  async function commitClaim(draft: ClaimDraft) {
    const errs = validateClaim(draft);
    setClaimErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setNotice(null);
    setError(null);
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
      if (await refresh()) setNotice(pt("entry.saved"));
    } catch (err) {
      console.error("[profile] claim save failed", err);
      setError(pt("common.error"));
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
    setNotice(null);
    setError(null);
    try {
      await saveSkill({
        data: {
          id: null,
          claimType,
          skillCode: draft.skillCode,
          skillLevel: draft.skillLevel || null,
          jurisdictionCode: draft.jurisdictionCode.trim().toUpperCase() || null,
          validUntil: draft.validUntil || null,
          holderNote: draft.holderNote.trim() || null,
        },
      });
      setSkillDrafts((prev) => ({ ...prev, [claimType]: null }));
      if (await refresh()) setNotice(pt("entry.saved"));
    } catch (err) {
      console.error("[profile] skill save failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(pt("entry.removeConfirm"))) return;
    setBusy(true);
    try {
      const res = await doRemove({ data: { kind: "claim", id } });
      const readBack = await refresh();
      if (!res.removed) setError(pt("entry.removeBlocked"));
      else if (readBack) setNotice(pt("entry.saved"));
    } catch (err) {
      console.error("[profile] remove failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  /** Documenting and verifying an entry is still the Passport's job: that is
   *  where evidence, reviewers and verification states live. The FACT is
   *  edited here; its EVIDENCE is handled there, on the entry's own page. */
  function openEntry(id: string) {
    void navigate({ to: "/passport/entry/$kind/$entryId", params: { kind: "claim", entryId: id } });
  }

  return (
    <div className={`space-y-4 ${className}`} data-general-profile-claims>
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

      {CV_CLAIM_KINDS.map((section) => {
        const rows = claims.filter((c) => c.claimType === section.kind);
        const isEditingThis = editing?.claimType === section.kind;
        return (
          <SectionShell
            key={section.kind}
            id="profile-education"
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
                          onClick={() => openEntry(c.id)}
                          className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {pt("entry.documentAndVerify")}
                        </button>
                        {c.editable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditing(claimToDraft(c))}
                              className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                              {pt("entry.edit")}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove(c.id)}
                              className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
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

            {isEditingThis && editing ? (
              <div className="mt-3">
                <ClaimEntryForm
                  draft={editing}
                  errors={claimErrors}
                  busy={busy}
                  onChange={setEditing}
                  onCancel={() => {
                    setEditing(null);
                    setClaimErrors({});
                  }}
                  onSave={() => {
                    void commitClaim(editing);
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(emptyClaimDraft(section.kind))}
                className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {pt("entry.add")}
              </button>
            )}
          </SectionShell>
        );
      })}

      {SKILL_SECTIONS.map((section) => (
        <SectionShell
          key={section.kind}
          id={section.anchor}
          icon={
            section.kind === "language" ? (
              <Languages aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Wrench aria-hidden="true" className="h-4 w-4" />
            )
          }
          title={pt(section.titleKey as PassportCopyKey)}
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
            onRemove={(id) => void remove(id)}
            onOpen={(id) => openEntry(id)}
          />
        </SectionShell>
      ))}
    </div>
  );
}
