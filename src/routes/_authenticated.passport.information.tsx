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
import { Briefcase, GraduationCap, Plus, ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  listMyEntries,
  removeEntry,
  saveClaimEntry,
  saveExperienceEntry,
  type ClaimEntry,
  type ExperienceEntry,
  type FreeClaimKind,
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
  const saveExp = useServerFn(saveExperienceEntry);
  const saveClaim = useServerFn(saveClaimEntry);
  const doRemove = useServerFn(removeEntry);

  const [experience, setExperience] = useState<readonly ExperienceEntry[]>([]);
  const [claims, setClaims] = useState<readonly ClaimEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [expErrors, setExpErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [claimErrors, setClaimErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});

  const refresh = useCallback(async () => {
    try {
      const data = await load({ data: undefined });
      setExperience(data.experience);
      setClaims(data.claims);
    } catch (err) {
      console.error("[passport] entries load failed", err);
      setError(pt("common.error"));
    } finally {
      setLoaded(true);
    }
  }, [load, pt]);

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
    setError(null);
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
      setNotice(pt("entry.saved"));
      await refresh();
    } catch (err) {
      console.error("[passport] experience save failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function commitClaim(draft: ClaimDraft) {
    const errs = validateClaim(draft);
    setClaimErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
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
      setNotice(pt("entry.saved"));
      await refresh();
    } catch (err) {
      console.error("[passport] claim save failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: "claim" | "experience", id: string) {
    if (!window.confirm(pt("entry.removeConfirm"))) return;
    setBusy(true);
    try {
      const res = await doRemove({ data: { kind, id } });
      // The server refuses once an entry has evidence or a review, and says
      // so rather than pretending the delete worked.
      setNotice(res.removed ? pt("entry.saved") : pt("entry.removeBlocked"));
      await refresh();
    } catch (err) {
      console.error("[passport] remove failed", err);
      setError(pt("common.error"));
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
