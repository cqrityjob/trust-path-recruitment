// Security Passport — languages and practical skills.
//
// ── WHY THIS IS NOT A FREE-TEXT LIST ───────────────────────────────────
//
// "Flytande svenska" typed into a box, rendered as a badge, is a claim the
// product cannot stand behind. Everything here comes from a controlled
// vocabulary the database owns: WHAT the capability is (`skill_code`) and,
// where the type has a scale, WHICH level (`skill_level`). The database
// refuses anything off the scale, so a level cannot be invented in the
// browser, in a server function, or by a future caller nobody has written yet.
//
// ── WHY IT LOOKS LIKE THE OTHER SECTIONS ───────────────────────────────
//
// A language is stored as an `sp_claims` row, exactly like a course or an
// appointment. That is not a storage shortcut: it means a language inherits
// evidence upload, review, correction into a new immutable version,
// withdrawal and the disclosure packages, all already proven. So it behaves
// like the rest of the holder's information, and the UI says so by looking
// like the rest of it.
//
// Nothing here grants trust. A new entry is self-declared and reads as
// self-declared until somebody reviews evidence for it.

import { useMemo } from "react";
import { MAX_DATE_ATTR, MIN_DATE_ATTR } from "@/lib/security-passport/dates";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type {
  ClaimEntry,
  Jurisdiction,
  SkillType,
} from "@/lib/security-passport/entries.functions";

export interface SkillDraft {
  readonly skillCode: string;
  readonly skillLevel: string;
  readonly jurisdictionCode: string;
  readonly validUntil: string;
  readonly holderNote: string;
}

export function emptySkillDraft(): SkillDraft {
  return { skillCode: "", skillLevel: "", jurisdictionCode: "", validUntil: "", holderNote: "" };
}

/** Field-level messages, keyed by field, so the form can put each one beside
 *  the input that caused it rather than in one banner above everything. */
export function validateSkill(
  draft: SkillDraft,
  type: SkillType | undefined,
  jurisdictions: readonly Jurisdiction[] = [],
): Record<string, PassportCopyKey> {
  const errs: Record<string, PassportCopyKey> = {};
  if (!type) return errs;
  if (type.allowedLevels.length > 0 && !draft.skillLevel) errs.skillLevel = "skill.levelRequired";
  // A level the type does not have is refused by the database; catching it
  // here means the holder is told which field is wrong instead of being told
  // that something, somewhere, went wrong.
  if (type.allowedLevels.length === 0 && draft.skillLevel) {
    errs.skillLevel = "skill.levelNotApplicable";
  }
  if (
    type.allowedLevels.length > 0 &&
    draft.skillLevel &&
    !type.allowedLevels.includes(draft.skillLevel)
  ) {
    errs.skillLevel = "skill.levelInvalid";
  }
  if (type.requiresJurisdiction) {
    const code = draft.jurisdictionCode.trim().toUpperCase();
    // Membership, not shape. Two letters is what "SV" is too, and "SV" is not
    // a jurisdiction — the FK is the real rule, so the form checks the real
    // rule rather than a lookalike of it.
    if (!code || (jurisdictions.length > 0 && !jurisdictions.some((j) => j.code === code))) {
      errs.jurisdictionCode = "skill.jurisdictionRequired";
    }
  }
  if (type.requiresValidUntil && !draft.validUntil) errs.validUntil = "skill.validUntilRequired";
  return errs;
}

export function SkillSection({
  claimType,
  types,
  jurisdictions,
  entries,
  draft,
  errors,
  busy,
  onDraftChange,
  onStart,
  onCancel,
  onSave,
  onRemove,
  onOpen,
}: {
  claimType: "language" | "practical_skill";
  types: readonly SkillType[];
  jurisdictions: readonly Jurisdiction[];
  entries: readonly ClaimEntry[];
  draft: SkillDraft | null;
  errors: Record<string, PassportCopyKey>;
  busy: boolean;
  onDraftChange: (d: SkillDraft) => void;
  onStart: () => void;
  onCancel: () => void;
  onSave: (d: SkillDraft) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { pt, lang } = usePassportCopy();

  const scoped = useMemo(() => types.filter((t) => t.claimType === claimType), [types, claimType]);
  const byCode = useMemo(() => new Map(scoped.map((t) => [t.code, t])), [scoped]);
  const selected = draft ? byCode.get(draft.skillCode) : undefined;

  const typeName = (code: string | null): string => {
    if (!code) return "—";
    const t = byCode.get(code);
    if (!t) return code;
    return lang === "sv" ? t.nameSv : t.nameEn;
  };

  /** CEFR reads as words; a licence category is already the thing people say
   *  out loud ("B", "CE"), so it is shown as-is rather than dressed up. */
  const levelLabel = (type: SkillType | undefined, level: string | null): string => {
    if (!level) return "";
    if (type?.levelScale === "cefr") return pt(`skill.cefr.${level}` as PassportCopyKey);
    // A licence category is already the thing people say out loud ("B", "CE"),
    // so it is shown as the vocabulary stores it rather than dressed up.
    return level.toUpperCase().replace(/_/g, " ");
  };

  const alreadyUsed = useMemo(
    () => new Set(entries.map((e) => e.skillCode).filter((c): c is string => c !== null)),
    [entries],
  );

  return (
    <div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {pt(`skill.lead.${claimType}` as PassportCopyKey)}
      </p>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {pt(`skill.none.${claimType}` as PassportCopyKey)}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {entries.map((e) => {
            const t = byCode.get(e.skillCode ?? "");
            return (
              <li
                key={e.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {typeName(e.skillCode)}
                    {e.skillLevel ? (
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        {levelLabel(t, e.skillLevel)}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.assertionLevel === "self_declared"
                      ? pt("skill.selfDeclared")
                      : pt(`assert.${e.assertionLevel}` as PassportCopyKey)}
                    {e.jurisdictionCode ? ` · ${e.jurisdictionCode.toUpperCase()}` : ""}
                    {e.validUntil ? ` · ${pt("skill.field.validUntil")} ${e.validUntil}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(e.id)}
                    className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {pt("entry.edit")}
                  </button>
                  {e.editable ? (
                    <button
                      type="button"
                      onClick={() => onRemove(e.id)}
                      disabled={busy}
                      className="inline-flex h-11 items-center rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pt("entry.remove")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft ? (
        <form
          className="mt-4 space-y-3 rounded-lg border border-border p-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            onSave(draft);
          }}
        >
          <div>
            <label
              htmlFor={`skill-code-${claimType}`}
              className="text-sm font-medium text-foreground"
            >
              {pt(claimType === "language" ? "skill.field.language" : "skill.field.skill")}
            </label>
            <select
              id={`skill-code-${claimType}`}
              value={draft.skillCode}
              // Switching type discards every value the NEW type cannot carry.
              // A category chosen for Truckkort is meaningless on Liftkort, and
              // an expiry entered for ADR must not silently ride along to a
              // licence that never lapses — the field vanishes from the form,
              // so a value left behind in state would be invisible and still be
              // sent.
              onChange={(ev) => {
                const next = byCode.get(ev.target.value);
                onDraftChange({
                  ...draft,
                  skillCode: ev.target.value,
                  skillLevel: "",
                  jurisdictionCode: next?.requiresJurisdiction ? draft.jurisdictionCode : "",
                  validUntil: next?.requiresValidUntil ? draft.validUntil : "",
                });
              }}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="">—</option>
              {scoped.map((t) => (
                <option key={t.code} value={t.code} disabled={alreadyUsed.has(t.code)}>
                  {lang === "sv" ? t.nameSv : t.nameEn}
                </option>
              ))}
            </select>
          </div>

          {selected && selected.allowedLevels.length > 0 ? (
            <div>
              <label
                htmlFor={`skill-level-${claimType}`}
                className="text-sm font-medium text-foreground"
              >
                {pt(selected.levelScale === "cefr" ? "skill.field.level" : "skill.field.category")}
              </label>
              <select
                id={`skill-level-${claimType}`}
                value={draft.skillLevel}
                onChange={(ev) => onDraftChange({ ...draft, skillLevel: ev.target.value })}
                aria-invalid={errors.skillLevel ? true : undefined}
                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <option value="">—</option>
                {selected.allowedLevels.map((l) => (
                  <option key={l} value={l}>
                    {levelLabel(selected, l)}
                  </option>
                ))}
              </select>
              {errors.skillLevel ? (
                <p className="mt-1 text-sm text-destructive">{pt(errors.skillLevel)}</p>
              ) : null}
            </div>
          ) : null}

          {selected?.requiresJurisdiction ? (
            <div>
              <label
                htmlFor={`skill-jur-${claimType}`}
                className="text-sm font-medium text-foreground"
              >
                {pt("skill.field.jurisdiction")}
              </label>
              {/* A select, not a text box. `jurisdiction_code` is FK-constrained,
                  so two typed letters are an invitation to fail: "SV" is the
                  language code and "SE" is the country, and the database can
                  only answer that with a foreign-key violation the holder reads
                  as "Något gick fel". Offering the vocabulary removes the class
                  of error instead of explaining it. */}
              <select
                id={`skill-jur-${claimType}`}
                value={draft.jurisdictionCode}
                onChange={(ev) => onDraftChange({ ...draft, jurisdictionCode: ev.target.value })}
                aria-invalid={errors.jurisdictionCode ? true : undefined}
                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <option value="">—</option>
                {jurisdictions.map((j) => (
                  <option key={j.code} value={j.code}>
                    {lang === "sv" ? j.nameSv : j.nameEn} ({j.code})
                  </option>
                ))}
              </select>
              {errors.jurisdictionCode ? (
                <p className="mt-1 text-sm text-destructive">{pt(errors.jurisdictionCode)}</p>
              ) : null}
            </div>
          ) : null}

          {selected?.requiresValidUntil ? (
            <div>
              <label
                htmlFor={`skill-until-${claimType}`}
                className="text-sm font-medium text-foreground"
              >
                {pt("skill.field.validUntil")}
              </label>
              <input
                id={`skill-until-${claimType}`}
                type="date"
                min={MIN_DATE_ATTR}
                max={MAX_DATE_ATTR}
                value={draft.validUntil}
                onChange={(ev) => onDraftChange({ ...draft, validUntil: ev.target.value })}
                aria-invalid={errors.validUntil ? true : undefined}
                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              {errors.validUntil ? (
                <p className="mt-1 text-sm text-destructive">{pt(errors.validUntil)}</p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor={`skill-note-${claimType}`}
              className="text-sm font-medium text-foreground"
            >
              {pt("skill.field.note")}
            </label>
            <textarea
              id={`skill-note-${claimType}`}
              value={draft.holderNote}
              rows={2}
              maxLength={2000}
              onChange={(ev) => onDraftChange({ ...draft, holderNote: ev.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">{pt("skill.noteHelp")}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !draft.skillCode}
              className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("entry.save")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {pt("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="mt-4 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {pt(`skill.add.${claimType}` as PassportCopyKey)}
        </button>
      )}
    </div>
  );
}
