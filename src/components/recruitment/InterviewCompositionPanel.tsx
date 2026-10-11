// The recruitment's interview setup (slot 20270312100000): which governed
// questions and approved follow-ups the comparative interviews use, grouped
// and ordered, version-bound per recruitment.
//
// Rules the panel keeps visible rather than implied:
//   - every core question of the pack version is always included (the
//     checkbox is not offered); only approved follow-ups are chosen;
//   - groups without governed content in the version (introduction, the
//     candidate's own questions) are shown as steps with a sentence on why
//     nothing can be ticked there -- new SV/EN texts need human approval;
//   - BESKT items: from slot 20270315100000 the catalogue lists the published
//     BESKT items for recruitment support (interview phase, ordinary
//     sensitivity), chosen here with their purpose; security-vetting content
//     is never selectable and the server refuses it again;
//   - a change is a NEW version with a reason, and the panel says how many
//     cases keep an older version;
//   - the selection is resumable: the confirmed version is the server's, an
//     unsaved draft lives in this browser's sessionStorage until saved.
// No AI, no generated question, no scoring.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  getCompositionCatalog,
  getInterviewComposition,
  saveInterviewComposition,
} from "@/lib/recruitment/lifecycle-v03.functions";
import {
  COMPOSITION_GROUPS,
  SELECTABLE_GROUPS,
  buildSelection,
  compositionQueryKey,
  coverageOf,
} from "@/lib/recruitment/interview-composition";
import { listStartableInterviewPacks } from "@/lib/interview-intelligence/runtime.functions";
import { formatStamp } from "@/lib/recruitment/format";
import { recruitmentErrorKey } from "./errors";

export function InterviewCompositionPanel({
  employerId,
  employerSlug,
  jobId,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const readComposition = useServerFn(getInterviewComposition);
  const readCatalog = useServerFn(getCompositionCatalog);
  const readPacks = useServerFn(listStartableInterviewPacks);
  const save = useServerFn(saveInterviewComposition);
  const composition = useQuery({
    queryKey: compositionQueryKey(employerId, jobId),
    queryFn: () => readComposition({ data: { employerId, jobId } }),
  });
  const installed = composition.data?.installed === true;
  const current = composition.data?.installed ? composition.data : null;
  // Version 1 chooses the pack among those this employer may start with; from
  // then on the pack is fixed to the version the setup was confirmed on.
  const packs = useQuery({
    queryKey: ["employer", employerId, "startable-packs"],
    queryFn: () => readPacks({ data: { employerId } }),
    enabled: installed && current !== null && current.packVersionId === null,
  });
  const [packChoice, setPackChoice] = useState<string | null>(null);
  const packVersionId =
    current?.packVersionId ?? packChoice ?? packs.data?.packs[0]?.packVersionId ?? null;
  const catalog = useQuery({
    queryKey: ["employer", employerId, "composition-catalog", packVersionId],
    queryFn: () => readCatalog({ data: { employerId, packVersionId: packVersionId! } }),
    enabled: installed && packVersionId !== null,
  });
  const cat = catalog.data?.installed ? catalog.data : null;

  // The chosen probes and BESKT items: the confirmed version's, or this
  // browser's unsaved draft, whichever is newer in the reader's hands.
  const draftKey = `cqj.composition.draft.${jobId}`;
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [chosenBeskt, setChosenBeskt] = useState<Set<string>>(new Set());
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (!current || chosen !== null) return;
    const fromServer = new Set<string>(
      current.selection.filter((s) => s.kind === "approved_probe").map((s) => s.itemId),
    );
    const besktFromServer = new Set<string>(
      current.selection.filter((s) => s.kind === "beskt_item").map((s) => s.itemId),
    );
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { version: number; probes: string[]; beskt?: string[] };
        if (parsed.version === current.version && Array.isArray(parsed.probes)) {
          setChosen(new Set(parsed.probes as string[]));
          setChosenBeskt(new Set((parsed.beskt ?? []) as string[]));
          setResumed(true);
          return;
        }
      }
    } catch {
      /* a draft is a convenience */
    }
    setChosen(fromServer);
    setChosenBeskt(besktFromServer);
  }, [current, chosen, draftKey]);
  const persistDraft = (probes: Set<string>, beskt: Set<string>) => {
    try {
      window.sessionStorage.setItem(
        draftKey,
        JSON.stringify({ version: current?.version ?? 0, probes: [...probes], beskt: [...beskt] }),
      );
    } catch {
      /* ignore */
    }
  };
  const remember = (next: Set<string>) => {
    setChosen(next);
    persistDraft(next, chosenBeskt);
  };
  const rememberBeskt = (next: Set<string>) => {
    setChosenBeskt(next);
    persistDraft(chosen ?? new Set(), next);
  };

  const selection = useMemo(
    () => (cat && chosen ? buildSelection(cat, chosen, chosenBeskt) : []),
    [cat, chosen, chosenBeskt],
  );
  const coverage = useMemo(() => (cat ? coverageOf(cat, selection) : null), [cat, selection]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const operationId = useRef<string>(crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          employerId,
          jobId,
          expectedVersion: current?.version ?? 0,
          operationId: operationId.current,
          packVersionId: packVersionId!,
          selection,
          reason: reason.trim() || null,
        },
      }),
    onSuccess: (saved: { version: number }) => {
      operationId.current = crypto.randomUUID();
      setReason("");
      setResumed(false);
      setChosen(null);
      setChosenBeskt(new Set());
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setNotice({
        tone: "ok",
        text: t("rec.composition.saved").replace("{v}", String(saved.version)),
      });
      void qc.invalidateQueries({ queryKey: compositionQueryKey(employerId, jobId) });
    },
    onError: (e: unknown) => {
      const code = (e as Error).message;
      setNotice({
        tone: "warn",
        text:
          code === "SCHEMA_NOT_INSTALLED"
            ? t("rec.composition.notInstalled")
            : t(recruitmentErrorKey(code)),
      });
    },
  });

  const name = (sv: string | null | undefined, en: string | null | undefined) =>
    (lang === "sv" ? sv || en : en || sv) ?? "";

  if (composition.isPending) return null;
  if (composition.isError) return null;
  if (!installed) {
    return (
      <section
        id="interview-composition"
        data-testid="interview-composition"
        data-installed="false"
        className="mt-6 rounded-lg border border-border p-4"
      >
        <h3 className="text-base font-semibold text-foreground">{t("rec.composition.heading")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("rec.composition.lede")}</p>
        <p className="mt-2 text-sm" data-testid="composition-not-installed">
          {t("rec.composition.notInstalled")}
        </p>
      </section>
    );
  }
  const canManage = current?.canManage ?? false;
  const dirty =
    cat !== null &&
    chosen !== null &&
    JSON.stringify(selection.map((s) => s.itemId)) !==
      JSON.stringify(current?.selection.map((s) => s.itemId) ?? []);
  return (
    <section
      id="interview-composition"
      data-testid="interview-composition"
      data-installed="true"
      data-version={current?.version ?? 0}
      aria-labelledby="interview-composition-heading"
      className="mt-6 rounded-lg border border-border p-4"
    >
      <h3 id="interview-composition-heading" className="text-base font-semibold text-foreground">
        {t("rec.composition.heading")}
      </h3>
      <p className="mt-1 max-w-[72ch] text-sm text-muted-foreground">{t("rec.composition.lede")}</p>
      <p className="mt-2 text-sm" data-testid="composition-version">
        {current && current.version > 0
          ? t("rec.composition.version")
              .replace("{v}", String(current.version))
              .replace("{date}", current.confirmedAt ? formatStamp(current.confirmedAt, lang) : "—")
          : t("rec.composition.none")}
      </p>
      {current && current.olderBoundCases > 0 && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="composition-older-cases">
          {t("rec.composition.boundCases").replace("{n}", String(current.olderBoundCases))}
        </p>
      )}
      {!canManage && (
        <p className="mt-1 text-xs text-muted-foreground">{t("rec.composition.readOnly")}</p>
      )}
      {resumed && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="composition-draft-resumed">
          {t("rec.composition.draftResumed")}
        </p>
      )}

      {/* The pack: chosen once, for version 1. */}
      {current && current.packVersionId === null && packs.data && canManage && (
        <label className="mt-3 block text-sm">
          {lang === "sv" ? "Intervjuguide (paketversion)" : "Interview guide (pack version)"}
          <select
            data-testid="composition-pack"
            className="ml-2 h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={packVersionId ?? ""}
            onChange={(e) => {
              setPackChoice(e.target.value || null);
              setChosen(null);
            }}
          >
            {packs.data.packs.map((p) => (
              <option key={p.packVersionId} value={p.packVersionId}>
                {name(p.name, p.nameEn)} · v{p.versionNumber} ·{" "}
                {t(`rec.composition.packStatus.${p.contentStatus}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
      )}

      {cat && chosen && coverage && (
        <>
          {/* The approved guide this setup is bound to, said once in plain
              words: name, version, its real status and what may be claimed. */}
          <p className="mt-3 text-sm" data-testid="composition-pack-summary">
            <span className="font-medium">{t("rec.composition.pack")}:</span>{" "}
            {name(cat.packName?.sv, cat.packName?.en)} · v{cat.versionNumber} ·{" "}
            {t(`rec.composition.packStatus.${cat.contentStatus}` as TranslationKey)} ·{" "}
            {t(`rec.composition.validation.${cat.validationLabel}` as TranslationKey)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid="composition-counts">
            {t("rec.composition.counts")
              .replace("{core}", String(selection.filter((s) => s.kind === "core_question").length))
              .replace(
                "{probes}",
                String(selection.filter((s) => s.kind === "approved_probe").length),
              )
              .replace("{beskt}", String(selection.filter((s) => s.kind === "beskt_item").length))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("rec.composition.noAi")}</p>
          <ol className="mt-3 space-y-4" data-testid="composition-groups">
            {COMPOSITION_GROUPS.map((group) => (
              <li
                key={group}
                data-testid={`composition-group-${group}`}
                className="rounded-md border border-border/70 p-3"
              >
                <p className="text-sm font-semibold text-foreground">
                  {t(`rec.composition.group.${group}` as TranslationKey)}
                </p>
                {!SELECTABLE_GROUPS.has(group) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`rec.composition.group.${group}Hint` as TranslationKey)}
                  </p>
                )}
                {(group === "competence" || group === "scenarios") && (
                  <ul className="mt-2 space-y-2">
                    {cat.coreQuestions
                      .filter((q) => (group === "scenarios") === (q.questionType === "situational"))
                      .map((q) => (
                        <li
                          key={q.id}
                          data-testid="composition-core-question"
                          className="rounded border border-border/60 p-2 text-sm"
                        >
                          <p className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {q.code}
                            </span>
                            <span className="font-medium">{name(q.promptSv, q.promptEn)}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t(`rec.composition.type.${q.questionType}` as TranslationKey)} ·{" "}
                            {t("rec.composition.core")}
                            {" · "}
                            {q.competencyCodes.join(", ")}
                            {q.durationMin !== null && (
                              <>
                                {" · "}
                                {t("rec.composition.time")
                                  .replace("{min}", String(q.durationMin))
                                  .replace("{max}", String(q.durationMax ?? q.durationMin))}
                              </>
                            )}
                          </p>
                          {cat.approvedProbes.some((p) => p.questionId === q.id) && (
                            <details className="mt-1 text-xs">
                              <summary className="min-h-8 cursor-pointer list-item py-1 text-muted-foreground">
                                {t("rec.composition.group.probes")} (
                                {
                                  cat.approvedProbes.filter(
                                    (p) => p.questionId === q.id && chosen.has(p.id),
                                  ).length
                                }
                                /{cat.approvedProbes.filter((p) => p.questionId === q.id).length})
                              </summary>
                              <ul className="mt-1 space-y-1">
                                {cat.approvedProbes
                                  .filter((p) => p.questionId === q.id)
                                  .map((p) => (
                                    <li key={p.id}>
                                      <label className="flex items-start gap-2">
                                        <input
                                          type="checkbox"
                                          data-testid="composition-probe"
                                          data-probe-id={p.id}
                                          disabled={!canManage}
                                          checked={chosen.has(p.id)}
                                          onChange={(e) => {
                                            const next = new Set(chosen);
                                            if (e.target.checked) next.add(p.id);
                                            else next.delete(p.id);
                                            remember(next);
                                          }}
                                          className="mt-0.5 h-4 w-4"
                                        />
                                        <span>
                                          {name(p.wordingSv, p.wordingEn)}{" "}
                                          <span className="text-muted-foreground">
                                            · {p.purpose}
                                          </span>
                                        </span>
                                      </label>
                                    </li>
                                  ))}
                              </ul>
                            </details>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
                {group === "probes" && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {cat.approvedProbes
                      .filter((p) => p.questionId === null)
                      .map((p) => (
                        <li key={p.id}>
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              data-testid="composition-probe"
                              data-probe-id={p.id}
                              disabled={!canManage}
                              checked={chosen.has(p.id)}
                              onChange={(e) => {
                                const next = new Set(chosen);
                                if (e.target.checked) next.add(p.id);
                                else next.delete(p.id);
                                remember(next);
                              }}
                              className="mt-0.5 h-4 w-4"
                            />
                            <span>
                              {name(p.wordingSv, p.wordingEn)}{" "}
                              <span className="text-muted-foreground">· {p.purpose}</span>
                            </span>
                          </label>
                        </li>
                      ))}
                    {cat.approvedProbes.every((p) => p.questionId !== null) && (
                      <li className="text-muted-foreground">
                        {lang === "sv"
                          ? "Följdfrågorna väljs under respektive kärnfråga ovan."
                          : "Follow-ups are chosen under each core question above."}
                      </li>
                    )}
                  </ul>
                )}
                {group === "beskt" && (
                  <div className="mt-2 text-xs" data-testid="composition-beskt">
                    <p className="text-muted-foreground">{t("rec.composition.group.besktHint")}</p>
                    {cat.besktItems === undefined ? (
                      <p className="mt-1" data-testid="composition-beskt-not-installed">
                        {t("rec.composition.beskt.notInstalled")}
                      </p>
                    ) : cat.besktItems.length === 0 ? (
                      <p className="mt-1" data-testid="composition-beskt-none">
                        {t("rec.composition.beskt.none")}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {cat.besktItems.map((b) => (
                          <li key={b.id} className="rounded border border-border/60 p-2">
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                data-testid="composition-beskt-item"
                                data-item-id={b.id}
                                disabled={!canManage}
                                checked={chosenBeskt.has(b.id)}
                                onChange={(e) => {
                                  const next = new Set(chosenBeskt);
                                  if (e.target.checked) next.add(b.id);
                                  else next.delete(b.id);
                                  rememberBeskt(next);
                                }}
                                className="mt-0.5 h-4 w-4"
                              />
                              <span>
                                <span className="font-medium text-foreground">
                                  {name(b.wordingSv, b.wordingEn)}
                                </span>
                                <span className="mt-0.5 block text-muted-foreground">
                                  {t("rec.composition.beskt.item")}
                                  {b.sectionTitleSv || b.sectionTitleEn
                                    ? ` · ${name(b.sectionTitleSv, b.sectionTitleEn)}`
                                    : ""}
                                  {b.purposeSv || b.purposeEn
                                    ? ` · ${t("rec.composition.beskt.purpose")}: ${name(b.purposeSv, b.purposeEn)}`
                                    : ""}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p
                      className="mt-2 text-muted-foreground"
                      data-testid="composition-beskt-vetting"
                    >
                      {t("rec.composition.beskt.vetting")}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-3 text-sm" data-testid="composition-coverage">
            <p>
              <span className="font-medium">{t("rec.composition.order")}:</span>{" "}
              {selection
                .map((s) =>
                  s.kind === "core_question"
                    ? cat.coreQuestions.find((q) => q.id === s.itemId)?.code
                    : s.kind === "beskt_item"
                      ? t("rec.composition.beskt.short")
                      : `+${t("rec.composition.probe").toLowerCase()}`,
                )
                .join(" · ")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("rec.composition.orderHint")}</p>
            <p className="mt-1">
              {t("rec.composition.totalTime")
                .replace("{min}", String(coverage.min))
                .replace("{max}", String(coverage.max))}
              {" · "}
              {t("rec.composition.covered")
                .replace("{covered}", String(coverage.covered))
                .replace("{total}", String(coverage.total))}
              {coverage.missing.length > 0 && (
                <>
                  {" "}
                  · {t("rec.composition.missing").replace("{codes}", coverage.missing.join(", "))}
                </>
              )}
            </p>
          </div>

          {canManage && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {current && current.version > 0 && (
                <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {t("rec.composition.reason")}
                  <input
                    type="text"
                    data-testid="composition-reason"
                    value={reason}
                    maxLength={2000}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-9 min-w-[18rem] rounded-md border border-border bg-background px-2 text-sm"
                  />
                  <span>{t("rec.composition.reasonHint")}</span>
                </label>
              )}
              <button
                type="button"
                data-testid="composition-save"
                disabled={
                  mutation.isPending ||
                  !packVersionId ||
                  (current !== null &&
                    current.version > 0 &&
                    (!dirty || reason.trim().length === 0))
                }
                onClick={() => mutation.mutate()}
                className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {current && current.version > 0
                  ? t("rec.composition.saveNew")
                  : t("rec.composition.save")}
              </button>
            </div>
          )}
        </>
      )}
      {notice && (
        <p
          role="status"
          data-testid="composition-notice"
          data-tone={notice.tone}
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}
        >
          {notice.text}
        </p>
      )}
      <p className="sr-only">{employerSlug}</p>
    </section>
  );
}
