// The vacancy's requirements and application questions, as the employer
// writes them.
//
// Mandatory ("krav") and desirable ("meriterande") are two lists, never one
// list with a flag nobody reads. A question can be linked to the requirement it
// asks about, which is what lets the candidate view show each answer next to
// the requirement it answers. Nothing here filters or scores candidates: an
// answer is shown as the candidate's own statement, and the decision stays a
// person's.
//
// The frame locks when the first application arrives (the database refuses a
// change after that), and the editor says so instead of offering edits that
// would fail.

import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowDown, ArrowUp, Lock, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { getProfessionRequirementTemplate } from "@/lib/recruitment/recruitment.functions";
import { suggestApplicationQuestions } from "@/lib/recruitment/ai.functions";
import {
  newKey,
  type QuestionDraft,
  type RequirementDraft,
  type VacancyStructureDraft,
} from "@/lib/recruitment/vacancy-structure";

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ── Requirements ────────────────────────────────────────────────────────

export function RequirementsEditor({
  value,
  onChange,
  locked,
  professionSlug,
}: {
  value: VacancyStructureDraft;
  onChange: (next: VacancyStructureDraft) => void;
  locked: boolean;
  professionSlug: string | null;
}) {
  const { t } = useT();
  const templateFn = useServerFn(getProfessionRequirementTemplate);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setReqs(requirements: RequirementDraft[]) {
    const keys = new Set(requirements.map((r) => r.key));
    onChange({
      requirements,
      // A question pointing at a removed requirement keeps its text and loses
      // only the link.
      questions: value.questions.map((q) =>
        q.requirement_key && !keys.has(q.requirement_key) ? { ...q, requirement_key: null } : q,
      ),
    });
  }

  async function applyTemplate() {
    if (!professionSlug) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await templateFn({ data: { professionSlug } });
      if (res.state !== "ready" || res.items.length === 0) {
        setNote(t("rec.structure.templateEmpty"));
        return;
      }
      const existing = new Set(value.requirements.map((r) => `${r.label_sv}|${r.label_en}`));
      const added = res.items
        .filter((i) => !existing.has(`${i.labelSv}|${i.labelEn}`))
        .map((i) => ({ key: newKey("r"), kind: i.kind, label_sv: i.labelSv, label_en: i.labelEn }));
      setReqs([...value.requirements, ...added]);
      setNote(t("rec.structure.templateAdded").replace("{n}", String(added.length)));
    } catch {
      setNote(t("rec.structure.templateFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <LockedNotice />;

  const groups: ["mandatory" | "desirable", TranslationKey, TranslationKey][] = [
    ["mandatory", "rec.requirement.mandatoryPlural", "rec.structure.mandatoryHelp"],
    ["desirable", "rec.requirement.desirablePlural", "rec.structure.desirableHelp"],
  ];

  return (
    <div className="space-y-6">
      {professionSlug && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyTemplate()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted/50 disabled:opacity-60"
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            {t("rec.structure.useTemplate")}
          </button>
          <span className="text-xs text-muted-foreground">{t("rec.structure.templateHelp")}</span>
        </div>
      )}
      {note && (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
      {groups.map(([kind, title, help]) => {
        const rows = value.requirements.map((r, i) => ({ r, i })).filter((x) => x.r.kind === kind);
        return (
          <fieldset key={kind} className="rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold text-foreground">{t(title)}</legend>
            <p className="text-sm text-muted-foreground">{t(help)}</p>
            <ul className="mt-3 space-y-2">
              {rows.map(({ r, i }) => (
                <li
                  key={r.key}
                  className="grid gap-2 rounded-md bg-muted/20 p-2 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <label className="text-xs text-muted-foreground">
                    {t("rec.structure.labelSv")}
                    <input
                      className={inputCls}
                      value={r.label_sv}
                      maxLength={300}
                      onChange={(e) => {
                        const next = [...value.requirements];
                        next[i] = { ...r, label_sv: e.target.value };
                        setReqs(next);
                      }}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    {t("rec.structure.labelEn")}
                    <input
                      className={inputCls}
                      value={r.label_en}
                      maxLength={300}
                      onChange={(e) => {
                        const next = [...value.requirements];
                        next[i] = { ...r, label_en: e.target.value };
                        setReqs(next);
                      }}
                    />
                  </label>
                  <div className="flex items-end gap-1">
                    <IconButton
                      label={t("rec.structure.moveUp")}
                      onClick={() => setReqs(move(value.requirements, i, -1))}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={t("rec.structure.moveDown")}
                      onClick={() => setReqs(move(value.requirements, i, 1))}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...value.requirements];
                        next[i] = { ...r, kind: kind === "mandatory" ? "desirable" : "mandatory" };
                        setReqs(next);
                      }}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t(
                        kind === "mandatory"
                          ? "rec.structure.makeDesirable"
                          : "rec.structure.makeMandatory",
                      )}
                    </button>
                    <IconButton
                      label={t("rec.structure.remove")}
                      onClick={() => setReqs(value.requirements.filter((x) => x.key !== r.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={value.requirements.length >= 30}
              onClick={() =>
                setReqs([
                  ...value.requirements,
                  { key: newKey("r"), kind, label_sv: "", label_en: "" },
                ])
              }
              className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm hover:bg-muted/40 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t(
                kind === "mandatory" ? "rec.structure.addMandatory" : "rec.structure.addDesirable",
              )}
            </button>
          </fieldset>
        );
      })}
    </div>
  );
}

// ── Questions ───────────────────────────────────────────────────────────

export function QuestionsEditor({
  value,
  onChange,
  locked,
  employerId,
  title,
}: {
  value: VacancyStructureDraft;
  onChange: (next: VacancyStructureDraft) => void;
  locked: boolean;
  employerId: string | null;
  title: string;
}) {
  const { t, lang } = useT();
  const suggestFn = useServerFn(suggestApplicationQuestions);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function setQs(questions: QuestionDraft[]) {
    onChange({ ...value, questions });
  }

  async function suggest() {
    if (!employerId) return;
    setBusy(true);
    setNote(null);
    try {
      const reqs = value.requirements
        .map((r) => ({
          key: r.key,
          kind: r.kind,
          label: (lang === "en" ? r.label_en || r.label_sv : r.label_sv || r.label_en).trim(),
        }))
        .filter((r) => r.label);
      if (reqs.length === 0) {
        setNote(t("rec.structure.suggestNeedsRequirements"));
        return;
      }
      const res = await suggestFn({
        data: { employerId, language: lang, title, requirements: reqs },
      });
      const linked = new Set(value.questions.map((q) => q.requirement_key).filter(Boolean));
      const added: QuestionDraft[] = res.questions
        .filter((q) => !q.requirementKey || !linked.has(q.requirementKey))
        .slice(0, Math.max(0, 15 - value.questions.length))
        .map((q) => ({
          key: newKey("q"),
          requirement_key: q.requirementKey,
          prompt_sv: lang === "sv" ? q.prompt : "",
          prompt_en: lang === "en" ? q.prompt : "",
          answer_kind: q.answerKind,
          is_required: q.isRequired,
        }));
      setQs([...value.questions, ...added]);
      setNote(
        (res.source === "ai"
          ? t("rec.structure.suggestedAi")
          : t("rec.structure.suggestedTemplate")
        ).replace("{n}", String(added.length)) +
          (res.source === "template" && res.reason
            ? ` ${t(`rec.ai.reason.${res.reason}` as TranslationKey)}`
            : ""),
      );
    } catch {
      setNote(t("rec.ai.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <LockedNotice />;

  const reqLabel = (key: string) => {
    const r = value.requirements.find((x) => x.key === key);
    return r ? (lang === "en" ? r.label_en || r.label_sv : r.label_sv || r.label_en) : "";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !employerId}
          onClick={() => void suggest()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted/50 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {busy ? t("rec.ai.working") : t("rec.structure.suggestQuestions")}
        </button>
        <span className="text-xs text-muted-foreground">{t("rec.structure.suggestHelp")}</span>
      </div>
      {note && (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
      <ol className="space-y-3">
        {value.questions.map((q, i) => (
          <li key={q.key} className="rounded-lg border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                {t("rec.structure.promptSv")}
                <textarea
                  className={`${inputCls} min-h-[60px]`}
                  value={q.prompt_sv}
                  maxLength={500}
                  onChange={(e) => {
                    const next = [...value.questions];
                    next[i] = { ...q, prompt_sv: e.target.value };
                    setQs(next);
                  }}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("rec.structure.promptEn")}
                <textarea
                  className={`${inputCls} min-h-[60px]`}
                  value={q.prompt_en}
                  maxLength={500}
                  onChange={(e) => {
                    const next = [...value.questions];
                    next[i] = { ...q, prompt_en: e.target.value };
                    setQs(next);
                  }}
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-xs text-muted-foreground">
                {t("rec.structure.answerKind")}
                <select
                  className={`${inputCls} mt-1`}
                  value={q.answer_kind}
                  onChange={(e) => {
                    const next = [...value.questions];
                    next[i] = { ...q, answer_kind: e.target.value as "text" | "yes_no" };
                    setQs(next);
                  }}
                >
                  <option value="yes_no">{t("rec.question.kind.yes_no")}</option>
                  <option value="text">{t("rec.question.kind.text")}</option>
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                {t("rec.structure.linkedRequirement")}
                <select
                  className={`${inputCls} mt-1`}
                  value={q.requirement_key ?? ""}
                  onChange={(e) => {
                    const next = [...value.questions];
                    next[i] = { ...q, requirement_key: e.target.value || null };
                    setQs(next);
                  }}
                >
                  <option value="">{t("rec.structure.noRequirement")}</option>
                  {value.requirements.map((r) => (
                    <option key={r.key} value={r.key}>
                      {(r.kind === "mandatory" ? "● " : "○ ") + (reqLabel(r.key) || "…")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={q.is_required}
                  onChange={(e) => {
                    const next = [...value.questions];
                    next[i] = { ...q, is_required: e.target.checked };
                    setQs(next);
                  }}
                />
                {t("rec.structure.mustAnswer")}
              </label>
              <div className="ml-auto flex gap-1">
                <IconButton
                  label={t("rec.structure.moveUp")}
                  onClick={() => setQs(move(value.questions, i, -1))}
                >
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={t("rec.structure.moveDown")}
                  onClick={() => setQs(move(value.questions, i, 1))}
                >
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={t("rec.structure.remove")}
                  onClick={() => setQs(value.questions.filter((x) => x.key !== q.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={value.questions.length >= 15}
        onClick={() =>
          setQs([
            ...value.questions,
            {
              key: newKey("q"),
              requirement_key: null,
              prompt_sv: "",
              prompt_en: "",
              answer_kind: "yes_no",
              is_required: false,
            },
          ])
        }
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm hover:bg-muted/40 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t("rec.structure.addQuestion")}
      </button>
      <p className="text-xs text-muted-foreground">{t("rec.structure.questionsLimits")}</p>
    </div>
  );
}

function LockedNotice() {
  const { t } = useT();
  return (
    <p className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {t("rec.vacancy.locked")}
    </p>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
