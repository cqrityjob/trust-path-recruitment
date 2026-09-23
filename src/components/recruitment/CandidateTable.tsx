// The candidate list: the recruitment's main working surface.
//
// Readable first. The columns are the ones a recruiter works from -- who, where
// they are in the process, when they applied, who is handling them, what is
// planned next -- and assessment or merit information is a quiet marker, never
// a score column that turns the list into a ranking.
//
// Everything a reader can change (search, stage, owner, sort) lives in the URL
// via `view` / `onViewChange`, so it survives a reload and a trip into a
// candidate and back. Opening a row stores the current ORDER under a list key,
// which is what the candidate view's previous/next reads.
//
// Batch actions report per candidate. A stage move is made from the stage the
// reader SAW, so a colleague who moved somebody first is reported, not
// overwritten; and no batch action writes to a candidate -- messages are their
// own explicit, reviewed act.

import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  CalendarClock,
  ClipboardList,
  MessageSquare,
  Search,
  UserCog,
  X,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import { StageBadge, BookingBadge } from "@/components/recruitment/RecruitmentStatus";
import { BatchMessageDialog } from "@/components/recruitment/MessageComposer";
import {
  applyCandidateView,
  CANDIDATE_SORTS,
  STAGE_FILTERS,
  type CandidateView,
} from "@/lib/recruitment/definitions";
import { consumeScrollRestore, listKeyFor, saveListContext } from "@/lib/recruitment/list-context";
import {
  setApplicationResponsible,
  setApplicationStages,
  type CandidateRow,
  type TeamMember,
} from "@/lib/recruitment/recruitment.functions";
import { formatDay, formatInZone } from "@/lib/recruitment/format";
import { recruitmentErrorKey } from "@/components/recruitment/errors";

type Props = {
  employerId: string;
  employerSlug: string;
  employerName: string;
  rows: CandidateRow[];
  view: CandidateView;
  onViewChange: (next: CandidateView) => void;
  showVacancy: boolean;
  team: TeamMember[];
  /** Decisions and messages: owner/admin, or responsible for that job. */
  canManageJob: (jobId: string) => boolean;
  openAssessmentIds?: ReadonlySet<string> | null;
  onChanged: () => void;
  labelKey: "recruitment" | "applications";
};

type BatchStage = "reviewing" | "interview" | "rejected";
const FROM: Record<BatchStage, string> = {
  reviewing: "submitted",
  interview: "reviewing",
  rejected: "",
};

export function CandidateTable(props: Props) {
  const { employerId, employerSlug, rows, view, onViewChange, showVacancy, team, canManageJob } =
    props;
  const { t, lang } = useT();
  const location = useRouterState({ select: (s) => s.location });
  const listHref = location.href;
  const listKey = listKeyFor(
    location.pathname + (props.labelKey === "recruitment" ? "#rec" : "#apps"),
  );
  const stagesFn = useServerFn(setApplicationStages);
  const responsibleFn = useServerFn(setApplicationResponsible);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState(view.q ?? "");

  // Debounced into the URL, so typing does not push a history entry per key.
  useEffect(() => setSearch(view.q ?? ""), [view.q]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ((view.q ?? "") !== search) onViewChange({ ...view, q: search || undefined });
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Back from a candidate: once, to where the reader was.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || rows.length === 0) return;
    restored.current = true;
    const y = consumeScrollRestore(listKey);
    if (y !== null) window.requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [rows.length, listKey]);

  const ordered = useMemo(
    () =>
      applyCandidateView(
        rows.map((r) => ({
          ...r,
          jobTitle: lang === "en" ? r.jobTitleEn || r.jobTitleSv : r.jobTitleSv || r.jobTitleEn,
        })),
        view,
      ),
    [rows, view, lang],
  );
  const visibleIds = new Set(ordered.map((r) => r.applicationId));
  const selectedRows = ordered.filter((r) => selected.has(r.applicationId));
  const allSelected = ordered.length > 0 && ordered.every((r) => selected.has(r.applicationId));
  const manageAll = selectedRows.length > 0 && selectedRows.every((r) => canManageJob(r.jobId));

  // Selection never outlives the rows it named.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered.length, view.stage, view.q, view.owner]);

  function remember() {
    saveListContext(listKey, {
      ids: ordered.map((r) => r.applicationId),
      href: listHref,
      scrollY: window.scrollY,
      labelKey: props.labelKey,
      restorePending: false,
    });
  }

  async function moveSelected(to: BatchStage) {
    const eligible =
      to === "rejected"
        ? selectedRows.filter((r) => ["submitted", "reviewing", "interview"].includes(r.status))
        : selectedRows.filter((r) => r.status === FROM[to]);
    if (eligible.length === 0) {
      setNotice({ tone: "warn", text: t("rec.batch.noneEligible") });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await stagesFn({
        data: {
          items: eligible.map((r) => ({
            applicationId: r.applicationId,
            expectedStatus: r.status as "submitted" | "reviewing" | "interview",
          })),
          newStatus: to,
          note: null,
        },
      });
      const failed = res.results.filter((x) => !x.ok);
      const skipped = selectedRows.length - eligible.length;
      const ok = res.results.length - failed.length;
      const parts = [t("rec.batch.moved").replace("{n}", String(ok))];
      if (skipped > 0) parts.push(t("rec.batch.skipped").replace("{n}", String(skipped)));
      if (failed.length > 0) {
        const firstCode = failed[0].code ?? "RECRUITMENT_ACTION_FAILED";
        parts.push(
          `${t("rec.batch.failed").replace("{n}", String(failed.length))} ${t(recruitmentErrorKey(firstCode))}`,
        );
      }
      setNotice({ tone: failed.length > 0 ? "warn" : "ok", text: parts.join(" ") });
      setSelected(new Set());
      props.onChanged();
    } catch (e) {
      setNotice({ tone: "warn", text: t(recruitmentErrorKey((e as Error).message)) });
    } finally {
      setBusy(false);
    }
  }

  async function assignSelected(userId: string | null) {
    setBusy(true);
    setNotice(null);
    let failed = 0;
    for (const r of selectedRows) {
      try {
        await responsibleFn({
          data: { applicationId: r.applicationId, userId, expectedVersion: r.metaVersion },
        });
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setAssigning(false);
    setNotice({
      tone: failed ? "warn" : "ok",
      text: failed
        ? t("rec.batch.assignPartial").replace("{n}", String(failed))
        : t("rec.batch.assigned").replace("{n}", String(selectedRows.length)),
    });
    setSelected(new Set());
    props.onChanged();
  }

  const selectCls =
    "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">{t("rec.table.search")}</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              showVacancy ? "rec.table.searchPlaceholderVacancy" : "rec.table.searchPlaceholder",
            )}
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("rec.table.stage")}
          <select
            className={selectCls}
            value={view.stage ?? "open"}
            onChange={(e) =>
              onViewChange({ ...view, stage: e.target.value as CandidateView["stage"] })
            }
          >
            {STAGE_FILTERS.map((s) => (
              <option key={s} value={s}>
                {t(`rec.filter.stage.${s}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("rec.table.responsible")}
          <select
            className={selectCls}
            value={view.owner ?? ""}
            onChange={(e) => onViewChange({ ...view, owner: e.target.value || undefined })}
          >
            <option value="">{t("rec.filter.owner.all")}</option>
            <option value="none">{t("rec.filter.owner.none")}</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.isSelf ? `${m.name} (${t("rec.team.you")})` : m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("rec.table.sort")}
          <span className="flex gap-1">
            <select
              className={selectCls}
              value={view.sort ?? "applied"}
              onChange={(e) =>
                onViewChange({
                  ...view,
                  sort: e.target.value as CandidateView["sort"],
                  dir: undefined,
                })
              }
            >
              {CANDIDATE_SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`rec.sort.${s}` as TranslationKey)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                onViewChange({
                  ...view,
                  dir:
                    (view.dir ?? ((view.sort ?? "applied") === "applied" ? "desc" : "asc")) ===
                    "asc"
                      ? "desc"
                      : "asc",
                })
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("rec.table.toggleDirection")}
            >
              <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </label>
      </div>

      <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
        {t("rec.table.showing")
          .replace("{shown}", String(ordered.length))
          .replace("{total}", String(rows.length))}
      </p>

      {/* ── Batch bar ──────────────────────────────────────────────── */}
      {selectedRows.length > 0 && (
        <div
          className="sticky top-2 z-10 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-background p-2 shadow-sm"
          role="region"
          aria-label={t("rec.batch.region")}
        >
          <span className="px-1 text-sm font-medium">
            {t("rec.batch.selected").replace("{n}", String(selectedRows.length))}
          </span>
          <BatchButton disabled={busy} onClick={() => void moveSelected("reviewing")}>
            {t("rec.batch.toReview")}
          </BatchButton>
          <BatchButton disabled={busy} onClick={() => void moveSelected("interview")}>
            {t("rec.batch.toInterview")}
          </BatchButton>
          {manageAll && (
            <>
              <BatchButton disabled={busy} onClick={() => setMessaging(true)}>
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {t("rec.batch.message")}
              </BatchButton>
              <BatchButton disabled={busy} onClick={() => setAssigning(true)}>
                <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                {t("rec.batch.assign")}
              </BatchButton>
              <BatchButton disabled={busy} tone="danger" onClick={() => setConfirmReject(true)}>
                {t("rec.batch.reject")}
              </BatchButton>
            </>
          )}
          {!manageAll && (
            <span className="text-xs text-muted-foreground">{t("rec.batch.restrictedHint")}</span>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t("rec.batch.clear")}
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={`mt-2 rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}
        >
          {notice.text}
        </div>
      )}

      {ordered.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? t("rec.table.emptyNone") : t("rec.table.emptyFiltered")}
          {rows.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => onViewChange({})}
                className="text-sm font-medium text-accent hover:underline"
              >
                {t("rec.table.clearFilters")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-2 hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={t("rec.table.selectAll")}
                      checked={allSelected}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? new Set(ordered.map((r) => r.applicationId))
                            : new Set(),
                        )
                      }
                      className="h-4 w-4 accent-[hsl(var(--accent))]"
                    />
                  </th>
                  <th className="px-3 py-2">{t("rec.col.candidate")}</th>
                  {showVacancy && <th className="px-3 py-2">{t("rec.col.vacancy")}</th>}
                  <th className="px-3 py-2">{t("rec.col.stage")}</th>
                  <th className="px-3 py-2">{t("rec.col.applied")}</th>
                  <th className="px-3 py-2">{t("rec.col.responsible")}</th>
                  <th className="px-3 py-2">{t("rec.col.next")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordered.map((r) => (
                  <tr
                    key={r.applicationId}
                    className={selected.has(r.applicationId) ? "bg-accent/5" : "hover:bg-muted/20"}
                  >
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        aria-label={t("rec.table.select").replace(
                          "{name}",
                          r.name ?? t("employer.applications.anonymousCandidate"),
                        )}
                        checked={selected.has(r.applicationId)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.applicationId);
                            else next.delete(r.applicationId);
                            return next;
                          })
                        }
                        className="mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Link
                        to="/employer/$employerSlug/applications/$applicationId"
                        params={{ employerSlug, applicationId: r.applicationId }}
                        search={{ list: listKey }}
                        onClick={remember}
                        className="font-medium text-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {r.name ?? t("employer.applications.anonymousCandidate")}
                      </Link>
                      <CandidateMarkers
                        row={r}
                        openAssessment={props.openAssessmentIds?.has(r.applicationId) ?? false}
                      />
                    </td>
                    {showVacancy && (
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        {(lang === "en"
                          ? r.jobTitleEn || r.jobTitleSv
                          : r.jobTitleSv || r.jobTitleEn) ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 align-top">
                      <StageBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 align-top tabular-nums text-muted-foreground">
                      {formatDay(r.appliedAt, lang)}
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground">
                      {r.responsibleName ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <NextActivity row={r} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="mt-2 space-y-2 md:hidden">
            {ordered.map((r) => (
              <li
                key={r.applicationId}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={t("rec.table.select").replace(
                      "{name}",
                      r.name ?? t("employer.applications.anonymousCandidate"),
                    )}
                    checked={selected.has(r.applicationId)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.applicationId);
                        else next.delete(r.applicationId);
                        return next;
                      })
                    }
                    className="mt-1 h-5 w-5"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/employer/$employerSlug/applications/$applicationId"
                      params={{ employerSlug, applicationId: r.applicationId }}
                      search={{ list: listKey }}
                      onClick={remember}
                      className="font-medium text-foreground hover:text-accent hover:underline"
                    >
                      {r.name ?? t("employer.applications.anonymousCandidate")}
                    </Link>
                    {showVacancy && (
                      <p className="text-xs text-muted-foreground">
                        {(lang === "en"
                          ? r.jobTitleEn || r.jobTitleSv
                          : r.jobTitleSv || r.jobTitleEn) ?? "—"}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StageBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatDay(r.appliedAt, lang)}
                      </span>
                    </div>
                    <CandidateMarkers
                      row={r}
                      openAssessment={props.openAssessmentIds?.has(r.applicationId) ?? false}
                    />
                    <div className="mt-1">
                      <NextActivity row={r} lang={lang} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {confirmReject && (
        <ConfirmAction
          open
          onOpenChange={(o) => !o && setConfirmReject(false)}
          tone="destructive"
          busy={busy}
          title={t("rec.batch.rejectTitle").replace("{n}", String(selectedRows.length))}
          consequence={t("rec.batch.rejectBody")}
          confirmLabel={t("rec.batch.reject")}
          cancelLabel={t("rec.common.cancel")}
          onConfirm={() => {
            setConfirmReject(false);
            void moveSelected("rejected");
          }}
        />
      )}

      {messaging && (
        <BatchMessageDialog
          employerId={employerId}
          employerName={props.employerName}
          recipients={selectedRows.map((r) => ({
            applicationId: r.applicationId,
            name: r.name,
            jobTitle:
              (lang === "en" ? r.jobTitleEn || r.jobTitleSv : r.jobTitleSv || r.jobTitleEn) ?? "",
          }))}
          onClose={(sent) => {
            setMessaging(false);
            if (sent) {
              setSelected(new Set());
              props.onChanged();
            }
          }}
        />
      )}

      {assigning && (
        <AssignDialog
          team={team}
          count={selectedRows.length}
          busy={busy}
          onCancel={() => setAssigning(false)}
          onAssign={(uid) => void assignSelected(uid)}
        />
      )}
    </div>
  );
}

function BatchButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 ${
        tone === "danger"
          ? "border-destructive/50 text-destructive hover:bg-destructive/10"
          : "border-border hover:bg-muted/50"
      }`}
    >
      {children}
    </button>
  );
}

function CandidateMarkers({ row, openAssessment }: { row: CandidateRow; openAssessment: boolean }) {
  const { t } = useT();
  const marks: React.ReactNode[] = [];
  if (!row.firstViewedAt && row.status === "submitted") {
    marks.push(
      <span
        key="u"
        className="inline-flex items-center gap-1 text-xs font-medium text-sky-800 dark:text-sky-200"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
        {t("rec.marker.unopened")}
      </span>,
    );
  }
  if (openAssessment) {
    marks.push(
      <span key="a" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ClipboardList className="h-3 w-3" aria-hidden="true" />
        {t("rec.marker.testOpen")}
      </span>,
    );
  }
  if (row.mandatoryNoCount > 0) {
    marks.push(
      <span key="m" className="text-xs text-muted-foreground">
        {t("rec.marker.mandatoryNo").replace("{n}", String(row.mandatoryNoCount))}
      </span>,
    );
  }
  if (marks.length === 0) return null;
  return <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">{marks}</div>;
}

function NextActivity({ row, lang }: { row: CandidateRow; lang: "sv" | "en" }) {
  const { t } = useT();
  if (!row.nextActivityAt || !row.nextActivityTimezone) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="tabular-nums">
        {formatInZone(row.nextActivityAt, row.nextActivityTimezone, lang)}
      </span>
      {row.nextActivityStatus && <BookingBadge status={row.nextActivityStatus} />}
      <span className="sr-only">{t("rec.col.next")}</span>
    </span>
  );
}

function AssignDialog({
  team,
  count,
  busy,
  onCancel,
  onAssign,
}: {
  team: TeamMember[];
  count: number;
  busy: boolean;
  onCancel: () => void;
  onAssign: (userId: string | null) => void;
}) {
  const { t } = useT();
  const [value, setValue] = useState<string>("");
  return (
    <ConfirmAction
      open
      onOpenChange={(o) => !o && onCancel()}
      busy={busy}
      title={t("rec.batch.assignTitle").replace("{n}", String(count))}
      consequence={
        <label className="mt-2 flex flex-col gap-1 text-sm">
          {t("rec.table.responsible")}
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">{t("rec.filter.owner.none")}</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      }
      confirmLabel={t("rec.batch.assignConfirm")}
      cancelLabel={t("rec.common.cancel")}
      onConfirm={() => onAssign(value || null)}
    />
  );
}
