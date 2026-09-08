// The three choices a person makes about their own CV, as controls.
//
// ── WHY THESE THREE SHARE A FILE ───────────────────────────────────────
//
// Because all three are asked twice — once when a CV is created and again
// when a saved one is edited — and the second copy is the one that drifts.
// A "show my telephone number" checkbox that means something slightly
// different on the edit screen than it did on the create screen is a bug
// nobody reports and everybody experiences.
//
// They are presentational: state lives in the route, and every one of them
// is a controlled component with no server call of its own. What gets
// SAVED, and what that costs, differs between the two screens (creating
// applies the choice to a bundle about to be built; editing a saved CV goes
// through `setMyCvSelection`, which is deliberately not a full refresh) —
// so the routes own the writing and these own the asking.
//
// ── AND WHY THE SELECTION PICKER SHOWS EVERYTHING ──────────────────────
//
// It is fed the UNFILTERED bundle. A picker fed the filtered one could only
// ever offer what is already on the CV, which makes taking something off a
// one-way door: the row disappears from the list the moment you untick it
// and there is nothing left to tick again.

import { useMemo } from "react";
import { Check } from "lucide-react";
import type {
  CvFactClaim,
  CvFactEmployment,
  CvSourceBundle,
} from "@/lib/professional-identity/cv/source-bundle";
import { L, Lf, type Copy, type Lang } from "./copy";
import { CV } from "./cv-copy";

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

interface Selectable {
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
}

function employmentRow(fact: CvFactEmployment): Selectable {
  const from = fact.startedOn.slice(0, 7);
  // An ended employment reads as ended and is offered like any other. It is
  // professional history, not an archived merit, and the two are different
  // things that a CV builder must not conflate.
  const to = fact.endedOn ? fact.endedOn.slice(0, 7) : "";
  return {
    id: fact.id,
    label: `${fact.roleTitle} · ${fact.employerName}`,
    detail: to ? `${from} – ${to}` : from,
  };
}

function claimRow(claim: CvFactClaim): Selectable {
  const parts = [claim.issuerName, claim.issuedOn?.slice(0, 4), claim.level].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return { id: claim.id, label: claim.title, detail: parts.length ? parts.join(" · ") : null };
}

/** The five groups, in the order the finished document uses them. */
export function selectableGroups(
  bundle: CvSourceBundle,
): readonly { readonly key: string; readonly title: Copy; readonly rows: readonly Selectable[] }[] {
  return [
    { key: "employment", title: CV.employment, rows: bundle.employment.map(employmentRow) },
    { key: "education", title: CV.education, rows: bundle.education.map(claimRow) },
    { key: "credentials", title: CV.credentials, rows: bundle.credentials.map(claimRow) },
    { key: "skills", title: CV.skills, rows: bundle.skills.map(claimRow) },
    { key: "languages", title: CV.languages, rows: bundle.languages.map(claimRow) },
  ];
}

/**
 * Does this selection leave a document worth sending?
 *
 * The same predicate `readiness.ts` and `application-source.ts` apply, asked
 * one step earlier: a CV with no employment and no education has no
 * professional history to read, and the server will refuse to save one. Said
 * here so the refusal is a sentence beside the checkboxes rather than an
 * error after a button.
 *
 * Skills, languages and a Career Discovery result deliberately do not count.
 * `readiness.ts` sets out why at length and this is that rule, not a second.
 */
export function selectionHasHistory(bundle: CvSourceBundle, excluded: readonly string[]): boolean {
  const drop = new Set(excluded);
  return (
    bundle.employment.some((e) => !drop.has(e.id)) || bundle.education.some((c) => !drop.has(c.id))
  );
}

export function CvSelectionPicker({
  bundle,
  excludedIds,
  onChange,
  lang,
  disabled = false,
}: {
  /** UNFILTERED. See the file header. */
  bundle: CvSourceBundle;
  excludedIds: readonly string[];
  onChange: (next: readonly string[]) => void;
  lang: Lang;
  disabled?: boolean;
}) {
  const groups = useMemo(() => selectableGroups(bundle), [bundle]);
  const excluded = useMemo(() => new Set(excludedIds), [excludedIds]);

  const toggle = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const setGroup = (rows: readonly Selectable[], include: boolean) => {
    const next = new Set(excluded);
    for (const row of rows) {
      if (include) next.delete(row.id);
      else next.add(row.id);
    }
    onChange([...next]);
  };

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const included = group.rows.filter((r) => !excluded.has(r.id)).length;
        return (
          <fieldset key={group.key} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {L(group.title, lang)}
              </legend>
              {group.rows.length > 0 && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {Lf(CV.selectedCount, lang, `${included}/${group.rows.length}`)}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setGroup(group.rows, included !== group.rows.length)}
                    className="min-h-[32px] rounded px-1.5 font-medium underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    {L(included === group.rows.length ? CV.selectNone : CV.selectAll, lang)}
                  </button>
                </span>
              )}
            </div>

            {group.rows.length === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {L(CV.selectEmptySection, lang)}
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <label
                      className={`flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-secondary/60 ${
                        excluded.has(row.id) ? "text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!excluded.has(row.id)}
                        disabled={disabled}
                        onChange={() => toggle(row.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{row.label}</span>
                        {row.detail && (
                          <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                            {row.detail}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

/**
 * Which language the DOCUMENT is written in.
 *
 * Separate from the interface language on purpose: a Swedish-speaking guard
 * applying to an international operator writes an English CV without
 * switching the whole product, and a person who prefers the English
 * interface may well need a Swedish CV for a Swedish employer.
 *
 * The help text says what it does and does not do. Nothing is translated —
 * there is no translation step in this feature, and adding one would mean a
 * model rewriting somebody's own sentences into a language they did not
 * choose them in, which is exactly the kind of quiet authorship this product
 * refuses elsewhere.
 */
export function CvLanguageChoice({
  value,
  onChange,
  lang,
  disabled = false,
}: {
  value: "sv" | "en";
  onChange: (next: "sv" | "en") => void;
  lang: Lang;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-foreground">{L(CV.languageTitle, lang)}</legend>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {L(CV.languageHelp, lang)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            ["sv", CV.languageSv],
            ["en", CV.languageEn],
          ] as const
        ).map(([code, label]) => (
          <label
            key={code}
            className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border px-3.5 text-sm font-medium ${
              value === code
                ? "border-accent bg-secondary/60 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-secondary/40"
            }`}
          >
            <input
              type="radio"
              name="cv-language"
              value={code}
              checked={value === code}
              disabled={disabled}
              onChange={() => onChange(code)}
              className="h-4 w-4 accent-[color:var(--accent)]"
            />
            {L(label, lang)}
            {value === code && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* Contact                                                             */
/* ------------------------------------------------------------------ */

export interface CvContactForm {
  readonly email: string;
  readonly phone: string;
  readonly showEmail: boolean;
  readonly showPhone: boolean;
}

export const EMPTY_CV_CONTACT_FORM: CvContactForm = {
  email: "",
  phone: "",
  showEmail: false,
  showPhone: false,
};

/**
 * Contact details, reused rather than re-typed — and shown only on request.
 *
 * The email is prefilled from the account, which is the one contact detail
 * this product reliably holds. Prefilled is not the same as published: both
 * switches start OFF, because "we already know this" is a reason to save
 * somebody typing and not a reason to put their address on a document they
 * are about to send to strangers.
 *
 * There is no verification affordance here and there is nothing to add one
 * to. A contact detail is a self-reported line; `CvContactDetails` has no
 * field a mark could sit on, and the note under the fields says so in words
 * as well.
 */
export function CvContactFields({
  value,
  onChange,
  lang,
  accountEmail,
  disabled = false,
  idPrefix = "cv-contact",
}: {
  value: CvContactForm;
  onChange: (next: CvContactForm) => void;
  lang: Lang;
  accountEmail: string | null;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const set = (patch: Partial<CvContactForm>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-foreground">{L(CV.contactTitle, lang)}</legend>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {L(CV.contactHelp, lang)}
      </p>

      <div className="mt-3 space-y-4">
        <div>
          <label
            htmlFor={`${idPrefix}-email`}
            className="text-xs font-medium text-muted-foreground"
          >
            {L(CV.contactEmail, lang)}
          </label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={320}
            disabled={disabled}
            value={value.email}
            onChange={(e) => set({ email: e.target.value })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {accountEmail && value.email === accountEmail && (
            <p className="mt-1 text-xs text-muted-foreground">{L(CV.contactFromAccount, lang)}</p>
          )}
          <label className="mt-1.5 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={value.showEmail}
              disabled={disabled}
              onChange={(e) => set({ showEmail: e.target.checked })}
              className="h-4 w-4 accent-[color:var(--accent)]"
            />
            {L(CV.contactShow, lang)}
          </label>
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-phone`}
            className="text-xs font-medium text-muted-foreground"
          >
            {L(CV.contactPhone, lang)}
          </label>
          <input
            id={`${idPrefix}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={40}
            disabled={disabled}
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <label className="mt-1.5 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={value.showPhone}
              disabled={disabled}
              onChange={(e) => set({ showPhone: e.target.checked })}
              className="h-4 w-4 accent-[color:var(--accent)]"
            />
            {L(CV.contactShow, lang)}
          </label>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{L(CV.contactNotVerified, lang)}</p>
    </fieldset>
  );
}
