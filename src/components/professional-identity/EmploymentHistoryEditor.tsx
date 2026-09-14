// Employment history, AUTHORED on the canonical profile workspace.
//
// ── THE OWNER'S CORRECTION, AND WHAT IT DID NOT SAY ────────────────────
//
// Employment used to be authored inside /passport/information. The owner
// moved the general authoring editors to the profile, and was explicit
// that this does not follow from, and does not disturb, the evidence
// boundary:
//
//   "The sp-employment section may remain a real Passport section and
//    anchor. Employment evidence has not moved. However, the general
//    authoring editor for employment history must move to the canonical
//    Profile workspace. Do not interpret 'employment evidence did not
//    move' as 'employment history must still be authored inside
//    Passport'."
//
// So this owns ADDING, EDITING and REMOVING a period. It deliberately
// owns none of:
//
//   * documenting or verifying a period,
//   * source confirmation by an employer,
//   * reviewer decisions,
//   * provenance, issuer or jurisdiction of evidence,
//   * sharing.
//
// Those stay on the Passport, against the same rows, reached from the
// `#sp-employment` section which is still a real section with a real
// anchor.
//
// ── ONE RECORD, ONE WRITER ─────────────────────────────────────────────
//
// The move is a move of the EDITOR, not of the record. This reads the
// canonical `listMyEntries` and writes through the canonical
// `saveExperienceEntry` and `removeEntry` — the same server functions the
// Passport used — against the same `sp_experience_periods` rows. No new
// server function, no second table, no copy of the form: `ExperienceForm`
// is the existing component, imported, not reimplemented.
//
// `editable` is the server's word and is obeyed here exactly as it was
// obeyed on the Passport: a locked or verified period offers no edit and
// no remove.

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyEntries,
  removeEntry,
  saveExperienceEntry,
  type ExperienceEntry,
} from "@/lib/security-passport/entries.functions";
import { getMyPassport } from "@/lib/security-passport/passport.functions";
import {
  ExperienceForm,
  emptyExperienceDraft,
  experienceToDraft,
  validateExperience,
  type ExperienceDraft,
} from "@/components/security-passport/EntryForms";
import { AssertionChip } from "@/components/security-passport/AssertionChip";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { AssertionLevel } from "@/lib/security-passport/types";
import { formatPeriodRange } from "@/lib/security-passport/format";
import { useT } from "@/i18n/context";

const CONTROL =
  "inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function EmploymentHistoryEditor({ className = "" }: { className?: string }) {
  const { pt } = usePassportCopy();
  const { lang } = useT();
  const load = useServerFn(listMyEntries);
  const loadProfile = useServerFn(getMyPassport);
  const saveExp = useServerFn(saveExperienceEntry);
  const doRemove = useServerFn(removeEntry);

  const [experience, setExperience] = useState<readonly ExperienceEntry[]>([]);
  const [draft, setDraft] = useState<ExperienceDraft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, PassportCopyKey>>>({});
  const [busy, setBusy] = useState(false);
  /** Only a CONFIRMED work country seeds a new period. An unconfirmed
   *  legacy 'SE' is not an answer the holder gave, and must not become the
   *  country on an employment they are entering now — the rule this
   *  editor carried on the Passport and carries here unchanged. */
  const [workCountry, setWorkCountry] = useState<{
    jurisdictionCode: string | null;
    confirmed: boolean;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Read back from the server. "Sparat." is a claim about persistence and
   *  is only made once this has answered — the same rule the Passport
   *  applied to the same write. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const entries = await load({ data: undefined });
      setExperience(entries.experience);
      return true;
    } catch (err) {
      console.error("[profile] employment read failed", err);
      setError(pt("common.error"));
      return false;
    }
  }, [load, pt]);

  useEffect(() => {
    void refresh();
    void loadProfile({ data: undefined })
      .then((snap) =>
        setWorkCountry({
          jurisdictionCode: snap.profile?.jurisdictionCode ?? null,
          confirmed: Boolean(snap.profile?.workLocationConfirmedAt),
        }),
      )
      .catch(() => {});
  }, [refresh, loadProfile]);

  async function commit(next: ExperienceDraft) {
    const errs = validateExperience(next);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await saveExp({
        data: {
          id: next.id,
          employerName: next.employerName,
          roleTitle: next.roleTitle,
          employmentType: next.employmentType,
          fteFraction: next.fteFraction,
          securityRelevance: next.securityRelevance,
          securityFraction: next.securityFraction,
          startedOn: next.startedOn,
          endedOn: next.ongoing ? null : next.endedOn,
          jurisdictionCode: next.jurisdictionCode,
        },
      });
      setDraft(null);
      if (await refresh()) setNotice(pt("entry.saved"));
    } catch (err) {
      console.error("[profile] employment save failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await doRemove({ data: { kind: "experience", id } });
      if (await refresh()) setNotice(pt("entry.saved"));
    } catch (err) {
      console.error("[profile] employment remove failed", err);
      setError(pt("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="profile-employment"
      aria-labelledby="profile-employment-heading"
      data-profile-employment
      className={className}
    >
      <h3
        id="profile-employment-heading"
        className="text-sm font-semibold tracking-tight text-foreground"
      >
        {pt("info.employment")}
      </h3>
      <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {pt("info.employmentLead")}
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {experience.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{pt("entry.none")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {experience.map((e) => (
            <li key={e.id} className="rounded-lg border border-border p-3" data-employment-row>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {e.roleTitle} · {e.employerName}
                  </p>
                  <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                    {formatPeriodRange(e.startedOn, e.endedOn, lang as "sv" | "en")}
                  </p>
                  {/* The level is shown, never set: whether a period is
                      source-confirmed is the Passport's answer, and this
                      editor offers no control over it. */}
                  <span className="mt-1.5 inline-flex">
                    <AssertionChip
                      level={e.assertionLevel as AssertionLevel}
                      lifecycleState={e.lifecycleState}
                      provenance={{ ...e, subjectKind: "employment" }}
                      size="sm"
                    />
                  </span>
                </div>
                {e.editable ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className={CONTROL}
                      onClick={() => {
                        setErrors({});
                        setDraft(experienceToDraft(e));
                      }}
                    >
                      {pt("entry.edit")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={`${CONTROL} border-destructive/40 text-destructive hover:bg-destructive/5 disabled:opacity-60`}
                      onClick={() => void drop(e.id)}
                    >
                      {pt("entry.remove")}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="mt-4 rounded-lg border border-accent/40 bg-secondary/30 p-4">
          <ExperienceForm
            draft={draft}
            onChange={setDraft}
            errors={errors}
            busy={busy}
            onSave={() => void commit(draft)}
            onCancel={() => {
              setDraft(null);
              setErrors({});
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className={`${CONTROL} mt-4`}
          data-add-employment
          onClick={() => {
            setErrors({});
            setDraft(
              emptyExperienceDraft(workCountry?.confirmed ? workCountry.jurisdictionCode : null),
            );
          }}
        >
          {pt("info.addEmployment")}
        </button>
      )}

      {/* Documenting and verifying a period is the Passport's work, against
          these same rows. One link, not a second set of controls. */}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        <Link
          to="/passport/information"
          hash="sp-employment"
          className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-employment-evidence-link
        >
          {pt("info.employment")} — {pt("entry.documentAndVerify")}
        </Link>
      </p>
    </section>
  );
}
