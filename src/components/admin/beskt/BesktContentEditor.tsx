// Authoring one governed BESKT content family.
//
// ── WHAT AN EDIT ACTUALLY IS ────────────────────────────────────────────
//
// A call to one `beskt_author_*` RPC carrying an operation id, the version,
// the revision the editor was looking at, and a payload of governed fields.
// The database takes the per-version lock, answers a replayed operation id
// before writing anything, compares and swaps the revision, writes, bumps the
// revision, rehashes the content and records the event — in one transaction.
//
// This component therefore never writes a table, never computes a hash, and
// never decides whether a value is allowed. What it owns is the form: which
// control a governed field gets, which closed vocabulary it offers, and the
// rule that an ABSENT key leaves a stored column alone while an explicitly
// cleared one is sent as null.
//
// ── THE ABSENT-VERSUS-NULL RULE, WHICH IS EASY TO GET WRONG ─────────────
//
// The RPCs distinguish `? 'key'` from a json null: a key that is not in the
// payload leaves the stored column untouched, and a key sent as null clears
// it. A form that always sent every field would therefore be unable to
// express "leave this alone", and one that never sent an emptied field would
// be unable to express "clear this". So on an EDIT this form sends exactly
// the fields whose value the editor changed — including the ones they
// emptied, as explicit nulls — and on a CREATE it sends every field that has
// a value, because there is nothing yet to leave alone.
//
// ── WHY THE STALE REVISION IS NOT RETRIED AUTOMATICALLY ─────────────────
//
// A refused save means somebody else moved the draft. Silently re-reading and
// resending would apply this editor's text on top of a version they have not
// seen. The refusal is shown, the workspace is refetched, and the editor
// decides.

import { useState } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { NoticePanel, StateBadge } from "@/components/admin/interview/PackGovernanceUi";
import { besktErrorKey } from "@/lib/beskt/errors";
import type {
  BesktAuthorPayload,
  BesktContentFamily,
  BesktContentRow,
} from "@/lib/beskt/governance.functions";
import { besktFamilySpec, type BesktFieldSpec } from "./content-schema";
import { besktAuthorPayload, besktInitialFormState, type BesktFormState } from "./governance-logic";

const INPUT =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BUTTON =
  "inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-md border border-transparent bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";

/** A governed field's own label, in the reader's language. */
function fieldLabel(t: (k: TranslationKey) => string, name: string): string {
  return t(`beskt.admin.field.${name}` as TranslationKey);
}

/** A governed value's own label. The stored token is shown beside it. */
function valueLabel(t: (k: TranslationKey) => string, value: string): string {
  return t(`beskt.admin.value.${value}` as TranslationKey);
}

function Field({
  field,
  value,
  disabled,
  onChange,
}: {
  field: BesktFieldSpec;
  value: string | string[] | boolean;
  disabled: boolean;
  onChange: (next: string | string[] | boolean) => void;
}) {
  const { t } = useT();
  const id = `beskt-field-${field.name}`;
  const label = fieldLabel(t, field.name);

  if (field.kind === "boolean") {
    return (
      <div className="flex min-h-[44px] items-center gap-2">
        <input
          id={id}
          type="checkbox"
          className="h-4 w-4"
          checked={value === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id} className="text-sm text-foreground">
          {label}
        </label>
        <code className="break-all font-mono text-xs text-muted-foreground">{field.name}</code>
      </div>
    );
  }

  if (field.kind === "multiselect") {
    const selected = (value as string[]) ?? [];
    return (
      <fieldset className="min-w-0">
        <legend className="text-sm font-medium text-foreground">
          {label}{" "}
          <code className="break-all font-mono text-xs text-muted-foreground">{field.name}</code>
        </legend>
        <div className="mt-1 space-y-1">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex min-h-[32px] items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selected.includes(option)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, option] : selected.filter((v) => v !== option),
                  )
                }
              />
              <span>{valueLabel(t, option)}</span>
              <code className="break-all font-mono text-xs text-muted-foreground">{option}</code>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.kind === "select") {
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}{" "}
          <code className="break-all font-mono text-xs text-muted-foreground">{field.name}</code>
          {field.required && <span className="text-destructive"> *</span>}
        </label>
        <select
          id={id}
          className={INPUT}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("beskt.admin.field.choose")}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {valueLabel(t, option)} — {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const Control = field.kind === "textarea" ? "textarea" : "input";
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}{" "}
        <code className="break-all font-mono text-xs text-muted-foreground">{field.name}</code>
        {field.required && <span className="text-destructive"> *</span>}
      </label>
      <Control
        id={id}
        className={INPUT}
        rows={field.kind === "textarea" ? 3 : undefined}
        type={field.kind === "integer" ? "number" : "text"}
        inputMode={field.kind === "integer" ? "numeric" : undefined}
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
      />
    </div>
  );
}

export interface BesktContentEditorProps {
  readonly family: BesktContentFamily;
  readonly rows: readonly BesktContentRow[];
  /** False from published onward. The form is not rendered at all. */
  readonly editable: boolean;
  readonly busy: boolean;
  readonly error: unknown;
  readonly onSave: (payload: BesktAuthorPayload) => void;
  readonly onDelete: (key: string) => void;
}

/**
 * One family: what is authored, and the form that adds or changes a row.
 *
 * Rows are shown before the form. An authoring surface whose list is below
 * a long form makes an editor scroll past their own work to see whether a
 * save landed.
 */
export function BesktContentEditor({
  family,
  rows,
  editable,
  busy,
  error,
  onSave,
  onDelete,
}: BesktContentEditorProps) {
  const { t } = useT();
  const spec = besktFamilySpec(family);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [state, setState] = useState<BesktFormState>(() =>
    besktInitialFormState(spec.fields, null),
  );

  const storedRow =
    editing === null
      ? null
      : (rows.find((r) => String(r[spec.rowKeyField] ?? "") === editing) ?? null);

  const open = (row: BesktContentRow | null) => {
    setState(besktInitialFormState(spec.fields, row));
    if (row === null) {
      setCreating(true);
      setEditing(null);
    } else {
      setCreating(false);
      setEditing(String(row[spec.rowKeyField] ?? ""));
    }
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  const formOpen = creating || editing !== null;

  return (
    <section
      data-testid={`beskt-family-${family}`}
      className="rounded-lg border border-border p-4"
      aria-labelledby={`beskt-family-${family}-h`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`beskt-family-${family}-h`} className="text-base font-semibold text-foreground">
          {t(`beskt.admin.family.${family}` as TranslationKey)}
        </h3>
        <StateBadge tone="neutral" srPrefix={t("beskt.admin.family.countLabel")}>
          {rows.length}
        </StateBadge>
      </div>
      <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
        {t(`beskt.admin.familyLede.${family}` as TranslationKey)}
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.admin.family.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const key = String(row[spec.rowKeyField] ?? "");
            return (
              <li
                key={key}
                data-testid={`beskt-row-${family}-${key}`}
                className="rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="font-mono text-sm text-foreground">{key}</code>
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={BUTTON}
                        disabled={busy}
                        onClick={() => open(row)}
                      >
                        {t("beskt.admin.family.edit")}
                      </button>
                      <button
                        type="button"
                        className={BUTTON}
                        disabled={busy}
                        onClick={() => onDelete(key)}
                      >
                        {t("beskt.admin.family.delete")}
                      </button>
                    </div>
                  )}
                </div>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  {spec.fields
                    .filter((field) => field.name !== spec.keyField)
                    .map((field) => {
                      const raw = (row as Record<string, unknown>)[field.name];
                      if (raw === null || raw === undefined || raw === "") return null;
                      const shown = Array.isArray(raw)
                        ? (raw as string[]).join(" · ")
                        : String(raw);
                      return (
                        <div key={field.name} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">
                            {fieldLabel(t, field.name)}
                          </dt>
                          <dd className="break-words text-sm text-foreground">{shown}</dd>
                        </div>
                      );
                    })}
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      {!editable && (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.admin.family.frozen")}</p>
      )}

      {editable && !formOpen && (
        <button type="button" className={`${PRIMARY} mt-4`} onClick={() => open(null)}>
          {t("beskt.admin.family.add")}
        </button>
      )}

      {editable && formOpen && (
        <form
          className="mt-4 space-y-4 rounded-md border border-border bg-muted/20 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(besktAuthorPayload(spec.fields, state, storedRow));
          }}
        >
          <h4 className="text-sm font-semibold text-foreground">
            {creating ? t("beskt.admin.family.addHeading") : t("beskt.admin.family.editHeading")}
          </h4>
          <p className="max-w-[80ch] text-xs leading-relaxed text-muted-foreground">
            {t("beskt.admin.family.absentRule")}
          </p>

          {error != null && (
            <NoticePanel tone="governance" role="alert" title={t("beskt.admin.saveRefused")}>
              <p>{t(besktErrorKey(error))}</p>
            </NoticePanel>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {spec.fields.map((field) => (
              <Field
                key={field.name}
                field={field}
                value={state[field.name]}
                // The key is how a row is addressed. Changing it on an edit
                // would not rename the row, it would create a second one, so
                // the control is disabled rather than left to be discovered.
                disabled={busy || (field.kind === "key" && !creating)}
                onChange={(next) => setState((s) => ({ ...s, [field.name]: next }))}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={busy}>
              {busy ? t("beskt.admin.family.saving") : t("beskt.admin.family.save")}
            </button>
            <button type="button" className={BUTTON} disabled={busy} onClick={close}>
              {t("beskt.admin.family.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
