// The candidate list: the recruitment's main working surface.
//
// Ordered the way a recruiter works, top to bottom: a compact filter row, a
// PERSISTENT action bar (always there, its actions enabled once rows are
// selected, showing how many), the table itself, then pagination and the
// hit count. The table is dense and readable: who, where they are in the
// process, when they applied, who is handling them, what they answered,
// what is attached, what is planned next. Assessment and merit information
// is a marker, never a score column that turns the list into a ranking.
//
// The page arrives from the server already filtered, ordered and sliced
// (listRecruitmentCandidatesPage) from the same definitions this file's
// controls edit; the browser never holds more than one page. Everything a
// reader can change lives in the URL via `view` / `onViewChange`, so it
// survives a reload and a trip into a candidate and back. Opening a row
// stores the server's full ORDER under a list key, which is what the
// candidate page's previous/next reads across pages.
//
// Selection is per page and never reaches a row that is not on screen:
// "select all" is "select all on this page", said in those words, and a page
// change clears it. Batch actions report per candidate. A stage move is made
// from the stage the reader SAW, so a colleague who moved somebody first is
// reported, not overwritten; and no batch action writes to a candidate --
// messages are their own explicit, reviewed act, and a booked time is not
// sent until the invitation is.

import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  MessageSquare,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StageBadge, BookingBadge } from "@/components/recruitment/RecruitmentStatus";
import { BatchMessageDialog } from "@/components/recruitment/MessageComposer";
import { BookingDialog } from "@/components/recruitment/BookingDialog";
import { AssignTestDialog } from "@/components/recruitment/AssignTestDialog";
import {
  CANDIDATE_SORTS,
  STAGE_FILTERS,
  compactView,
  firstPage,
  parseAnswerFilter,
  serializeAnswerFilter,
  type CandidateView,
} from "@/lib/recruitment/definitions";
import { consumeScrollRestore, listKeyFor, saveListContext } from "@/lib/recruitment/list-context";
import {
  setApplicationResponsible,
  setApplicationStages,
  type CandidatePage,
  type CandidateRow,
  type TeamMember,
} from "@/lib/recruitment/recruitment.functions";
import { formatDay, formatInZone } from "@/lib/recruitment/format";
import { recruitmentErrorKey } from "@/components/recruitment/errors";

type Props = {
  employerId: string;
  employerSlug: string;
  employerName: string;
  /** The vacancy this list belongs to: what the candidate page asks the
   *  server about when it wants previous/next in this list. */
  jobId: string;
  jobTitle: string;
  /** The page as the server returned it, or null while loading / failed. */
  page: CandidatePage | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  view: CandidateView;
  onViewChange: (next: CandidateView) => void;
  team: TeamMember[];
  /** Decisions, messages, assignment of a handler: owner/admin, or the
   *  person responsible for this recruitment (rec_can_manage). */
  canManage: boolean;
  /** Sending a test: owner or admin (scp_assign_from_application). */
  canAssignTests: boolean;
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
const OPEN = ["submitted", "reviewing", "interview"];

type ItemResult = {
  applicationId: string;
  name: string | null;
  tone: "ok" | "warn";
  text: string;
};

export function CandidateTable(props: Props) {
  const { employerId, employerSlug, jobId, page, view, onViewChange, team, canManage } = props;
  const { t, lang } = useT();
  const location = useRouterState({ select: (s) => s.location });
  const listHref = location.href;
  const listKey = listKeyFor(
    location.pathname + (props.labelKey === "recruitment" ? "#rec" : "#apps"),
  );
  const stagesFn = useServerFn(setApplicationStages);
  const responsibleFn = useServerFn(setApplicationResponsible);

  const rows = useMemo(() => page?.rows ?? [], [page]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [itemResults, setItemResults] = useState<ItemResult[]>([]);
  const [confirmReject, setConfirmReject] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [booking, setBooking] = useState(false);
  const [assigningTest, setAssigningTest] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState(view.q ?? "");

  // Debounced into the URL, so typing does not push a history entry per key.
  useEffect(() => setSearch(view.q ?? ""), [view.q]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ((view.q ?? "") !== search) onViewChange(firstPage({ ...view, q: search || undefined }));
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

  // Selection never outlives the page it was made on.
  const pageIds = useMemo(() => new Set(rows.map((r) => r.applicationId)), [rows]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => pageIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pageIds]);

  // A filter narrows the list whenever the view is not "everyone": the
  // default stage alone (open candidates) is one. The pager then says so,
  // in the words of the filter, and offers everyone.
  const stageValue = view.stage ?? "open";
  const filterActive =
    stageValue !== "all" || Boolean(view.q) || Boolean(view.owner) || Boolean(view.ans);
  const activeFilterLabel = [
    stageValue !== "all" ? t(`rec.filter.stage.${stageValue}` as TranslationKey) : null,
    view.q ? `"${view.q}"` : null,
    view.owner ? t("rec.filter.owner") : null,
    view.ans ? t("rec.filter.answers") : null,
  ]
    .filter(Boolean)
    .join(", ");
  const selectedRows = rows.filter((r) => selected.has(r.applicationId));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.applicationId));
  const one = selectedRows.length === 1 ? selectedRows[0] : null;
  const none = selectedRows.length === 0;
  const anonymous = t("employer.applications.anonymousCandidate");
  const nameOf = (r: CandidateRow) => r.name ?? anonymous;

  // What the candidate page needs to offer previous/next in THIS list: the
  // list's own definition (vacancy + filters + sort), never its ids. The
  // server answers "where is this candidate in that list" from the same
  // ordering the page was read from.
  function remember() {
    saveListContext(listKey, {
      query: { employerId, jobId, view: compactView(view) },
      href: listHref,
      scrollY: window.scrollY,
      labelKey: props.labelKey,
      restorePending: false,
    });
  }

  function setPage(p: number) {
    setSelected(new Set());
    onViewChange({ ...view, page: p });
  }

  function keepFailed(items: ItemResult[]) {
    // Rows that failed stay selected, so the recruiter can retry them.
    setItemResults(items);
    setSelected(new Set(items.filter((i) => i.tone === "warn").map((i) => i.applicationId)));
  }

  async function moveSelected(to: BatchStage) {
    const eligible =
      to === "rejected"
        ? selectedRows.filter((r) => OPEN.includes(r.status))
        : selectedRows.filter((r) => r.status === FROM[to]);
    const skipped = selectedRows.length - eligible.length;
    if (eligible.length === 0) {
      setNotice({ tone: "warn", text: t("rec.batch.noneEligible") });
      setItemResults([]);
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
      const byId = new Map(res.results.map((x) => [x.applicationId, x]));
      const items: ItemResult[] = selectedRows.map((r) => {
        const x = byId.get(r.applicationId);
        const base = { applicationId: r.applicationId, name: r.name };
        if (!x) return { ...base, tone: "warn", text: t("rec.batch.item.skipped") };
        return x.ok
          ? { ...base, tone: "ok", text: t("rec.batch.item.moved") }
          : {
              ...base,
              tone: "warn",
              text: t(recruitmentErrorKey(x.code ?? "RECRUITMENT_ACTION_FAILED")),
            };
      });
      const ok = res.results.filter((x) => x.ok).length;
      const failed = res.results.length - ok;
      const parts = [t("rec.batch.moved").replace("{n}", String(ok))];
      if (skipped > 0) parts.push(t("rec.batch.skipped").replace("{n}", String(skipped)));
      if (failed > 0) parts.push(t("rec.batch.failed").replace("{n}", String(failed)));
      setNotice({ tone: failed > 0 || skipped > 0 ? "warn" : "ok", text: parts.join(" ") });
      keepFailed(items);
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
    const items: ItemResult[] = [];
    for (const r of selectedRows) {
      const base = { applicationId: r.applicationId, name: r.name };
      try {
        await responsibleFn({
          data: { applicationId: r.applicationId, userId, expectedVersion: r.metaVersion },
        });
        items.push({ ...base, tone: "ok", text: t("rec.batch.item.assigned") });
      } catch (e) {
        items.push({ ...base, tone: "warn", text: t(recruitmentErrorKey((e as Error).message)) });
      }
    }
    setBusy(false);
    setAssigning(false);
    const failed = items.filter((i) => i.tone === "warn").length;
    setNotice({
      tone: failed ? "warn" : "ok",
      text: failed
        ? t("rec.batch.assignPartial").replace("{n}", String(failed))
        : t("rec.batch.assigned").replace("{n}", String(selectedRows.length)),
    });
    keepFailed(items);
    props.onChanged();
  }

  // ── Filters ─────────────────────────────────────────────────────────
  const answerFilters = parseAnswerFilter(view.ans);
  const questions = page?.yesNoQuestions ?? [];
  const activeFilters =
    (view.q ? 1 : 0) +
    (view.stage && view.stage !== "open" ? 1 : 0) +
    (view.owner ? 1 : 0) +
    answerFilters.length;
  function setAnswer(questionId: string, v: "" | "y" | "n") {
    const rest = answerFilters.filter((f) => f.questionId !== questionId);
    if (v) rest.push({ questionId, value: v === "y" });
    onViewChange(firstPage({ ...view, ans: serializeAnswerFilter(rest) }));
  }
  const questionLabel = (q: { promptSv: string | null; promptEn: string | null }) =>
    (lang === "en" ? q.promptEn || q.promptSv : q.promptSv || q.promptEn) ?? "";
  const stageCount = (s: (typeof STAGE_FILTERS)[number]) => {
    if (!page) return "";
    const c = page.counts;
    const n =
      s === "all"
        ? c.total
        : s === "open"
          ? c.total - c.decided
          : s === "decided"
            ? c.decided
            : s === "new"
              ? c.new
              : s === "review"
                ? c.review
                : c.interview;
    return ` (${n})`;
  };

  const selectCls =
    "h-9 max-w-[16rem] rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const barBtn =
    "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div>
      {/* ── Filters ─────────────────────────────────────────────────── */}
      <section aria-label={t("rec.filters.aria")} className="flex flex-wrap items-end gap-2">
        <label className="relative min-w-[11rem] flex-1 sm:max-w-xs">
          <span className="sr-only">{t("rec.table.search")}</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("rec.table.searchPlaceholder")}
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {t("rec.table.stage")}
          <select
            className={selectCls}
            value={view.stage ?? "open"}
            onChange={(e) =>
              onViewChange(firstPage({ ...view, stage: e.target.value as CandidateView["stage"] }))
            }
          >
            {STAGE_FILTERS.map((s) => (
              <option key={s} value={s}>
                {t(`rec.filter.stage.${s}` as TranslationKey)}
                {stageCount(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {t("rec.table.responsible")}
          <select
            className={selectCls}
            value={view.owner ?? ""}
            onChange={(e) =>
              onViewChange(firstPage({ ...view, owner: e.target.value || undefined }))
            }
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
        {questions.slice(0, 4).map((q) => {
          const current = answerFilters.find((f) => f.questionId === q.id);
          return (
            <label key={q.id} className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span className="max-w-[16rem] truncate" title={questionLabel(q)}>
                {questionLabel(q)}
              </span>
              <select
                className={selectCls}
                value={current ? (current.value ? "y" : "n") : ""}
                onChange={(e) => setAnswer(q.id, e.target.value as "" | "y" | "n")}
              >
                <option value="">{t("rec.filter.answer.any")}</option>
                <option value="y">{t("rec.filter.answer.yes")}</option>
                <option value="n">{t("rec.filter.answer.no")}</option>
              </select>
            </label>
          );
        })}
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {t("rec.table.sort")}
          <span className="flex gap-1">
            <select
              className={selectCls}
              value={view.sort ?? "applied"}
              onChange={(e) =>
                onViewChange(
                  firstPage({
                    ...view,
                    sort: e.target.value as CandidateView["sort"],
                    dir: undefined,
                  }),
                )
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
                onViewChange(
                  firstPage({
                    ...view,
                    dir:
                      (view.dir ?? ((view.sort ?? "applied") === "applied" ? "desc" : "asc")) ===
                      "asc"
                        ? "desc"
                        : "asc",
                  }),
                )
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("rec.table.toggleDirection")}
            >
              <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </label>
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => onViewChange({})}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t("rec.table.clearFilters")} ({activeFilters})
          </button>
        )}
      </section>

      {/* ── Action bar: always present ───────────────────────────────── */}
      <div
        className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2"
        role="region"
        aria-label={t("rec.batch.region")}
      >
        <span className="px-1 text-sm font-medium tabular-nums" aria-live="polite">
          {t("rec.batch.selected").replace("{n}", String(selectedRows.length))}
        </span>
        {one ? (
          <Link
            to="/employer/$employerSlug/applications/$applicationId"
            params={{ employerSlug, applicationId: one.applicationId }}
            search={{ list: listKey }}
            onClick={remember}
            className={barBtn}
          >
            {t("rec.action.open")}
          </Link>
        ) : (
          <button
            type="button"
            className={barBtn}
            disabled
            title={none ? t("rec.action.hint.select") : t("rec.action.hint.selectOne")}
          >
            {t("rec.action.open")}
          </button>
        )}
        {canManage && (
          <button
            type="button"
            className={barBtn}
            disabled={none || busy}
            onClick={() => setMessaging(true)}
            title={none ? t("rec.action.hint.select") : undefined}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {t("rec.batch.message")}
          </button>
        )}
        <button
          type="button"
          className={barBtn}
          disabled={none || busy || selectedRows.some((r) => !OPEN.includes(r.status))}
          onClick={() => setBooking(true)}
          title={none ? t("rec.action.hint.select") : t("rec.action.hint.openOnly")}
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("rec.action.interview")}
        </button>
        {props.canAssignTests && (
          <button
            type="button"
            className={barBtn}
            disabled={none || busy}
            onClick={() => setAssigningTest(true)}
            title={none ? t("rec.action.hint.select") : undefined}
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            {t("rec.action.assignTest")}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={barBtn} disabled={none || busy}>
              {t("rec.action.changeStatus")}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onSelect={() => void moveSelected("reviewing")}>
              {t("rec.batch.toReview")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void moveSelected("interview")}>
              {t("rec.batch.toInterview")}
            </DropdownMenuItem>
            {canManage && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmReject(true)}
                >
                  {t("rec.batch.reject")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={barBtn} disabled={none || busy}>
              {t("rec.action.more")}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {canManage && (
              <DropdownMenuItem onSelect={() => setAssigning(true)}>
                {t("rec.batch.assign")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setSelected(new Set())}>
              {t("rec.batch.clear")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!canManage && (
          <span className="text-xs text-muted-foreground">
            {t("rec.batch.restrictedHint")}{" "}
            <Link
              to="/employer/$employerSlug/jobs/$jobId"
              params={{ employerSlug, jobId }}
              search={{ view: "team" }}
              className="font-medium text-accent hover:underline"
            >
              {t("rec.batch.restrictedTeamLink")}
            </Link>
          </span>
        )}
      </div>

      {notice && (
        <div
          role="status"
          className={`mt-2 rounded-md border px-3 py-2 text-sm ${notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}
        >
          <p>{notice.text}</p>
          {itemResults.length > 0 && (
            <ul className="mt-1.5 divide-y divide-border/60 text-xs">
              {itemResults.map((i) => (
                <li key={i.applicationId} className="flex flex-wrap justify-between gap-2 py-1">
                  <span className="font-medium">{i.name ?? anonymous}</span>
                  <span
                    className={
                      i.tone === "ok"
                        ? "text-emerald-800 dark:text-emerald-200"
                        : "text-amber-900 dark:text-amber-200"
                    }
                  >
                    {i.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── The table ─────────────────────────────────────────────────── */}
      {props.loading && !page ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {t("employer.loading")}
        </p>
      ) : props.error ? (
        /* NOT an empty state. "Nobody has applied" and "we could not find
           out who applied" are different sentences. */
        <div
          role="alert"
          className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-900 dark:text-amber-200"
        >
          <p>{t("employer.jobHub.candidates.loadFailed")}</p>
          <button
            type="button"
            onClick={props.onRetry}
            className="mt-3 inline-flex min-h-10 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted/60"
          >
            {t("continuity.next.retry")}
          </button>
        </div>
      ) : !page || page.total === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {page && page.counts.total > 0 ? t("rec.table.emptyFiltered") : t("rec.table.emptyNone")}
          {page && page.counts.total > 0 && (
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
          <div className="mt-2 hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-9 px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={t("rec.table.selectAllPage")}
                      title={t("rec.table.selectAllPage")}
                      checked={allOnPage}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? new Set(rows.map((r) => r.applicationId)) : new Set(),
                        )
                      }
                      className="h-4 w-4 accent-[hsl(var(--accent))]"
                    />
                  </th>
                  <th className="w-10 px-2 py-1.5 tabular-nums">#</th>
                  <th className="px-2 py-1.5">{t("rec.col.candidate")}</th>
                  <th className="px-2 py-1.5">{t("rec.col.stage")}</th>
                  <th className="px-2 py-1.5">{t("rec.col.applied")}</th>
                  <th className="px-2 py-1.5">{t("rec.col.responsible")}</th>
                  {questions.slice(0, 3).map((q) => (
                    <th key={q.id} className="max-w-[9rem] px-2 py-1.5" title={questionLabel(q)}>
                      <span className="line-clamp-2 normal-case tracking-normal">
                        {questionLabel(q)}
                      </span>
                    </th>
                  ))}
                  <th className="px-2 py-1.5">{t("rec.col.attachments")}</th>
                  <th className="px-2 py-1.5">{t("rec.col.test")}</th>
                  <th className="px-2 py-1.5">{t("rec.col.next")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr
                    key={r.applicationId}
                    className={selected.has(r.applicationId) ? "bg-accent/5" : "hover:bg-muted/20"}
                  >
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="checkbox"
                        aria-label={t("rec.table.select").replace("{name}", nameOf(r))}
                        checked={selected.has(r.applicationId)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(r.applicationId);
                            else next.delete(r.applicationId);
                            return next;
                          })
                        }
                        className="h-4 w-4 accent-[hsl(var(--accent))]"
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle tabular-nums text-muted-foreground">
                      {page.from + i}
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Link
                        to="/employer/$employerSlug/applications/$applicationId"
                        params={{ employerSlug, applicationId: r.applicationId }}
                        search={{ list: listKey }}
                        onClick={remember}
                        className="font-medium text-foreground hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {nameOf(r)}
                      </Link>
                      {!r.firstViewedAt && r.status === "submitted" && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-sky-800 dark:text-sky-200">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-sky-500"
                            aria-hidden="true"
                          />
                          {t("rec.marker.unopened")}
                        </span>
                      )}
                      {r.mandatoryNoCount > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("rec.marker.mandatoryNo").replace("{n}", String(r.mandatoryNoCount))}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <StageBadge status={r.status} />
                    </td>
                    <td className="px-2 py-1.5 align-middle tabular-nums text-muted-foreground">
                      {formatDay(r.appliedAt, lang)}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-muted-foreground">
                      {r.responsibleName ?? "—"}
                    </td>
                    {questions.slice(0, 3).map((q) => (
                      <td key={q.id} className="px-2 py-1.5 align-middle">
                        <Answer value={r.answers?.[q.id]} />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 align-middle">
                      <Attachments row={r} />
                    </td>
                    <td className="px-2 py-1.5 align-middle text-xs text-muted-foreground">
                      {props.openAssessmentIds?.has(r.applicationId) ? (
                        <span className="inline-flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" aria-hidden="true" />
                          {t("rec.marker.testOpen")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <NextActivity row={r} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="mt-2 space-y-2 md:hidden">
            {rows.map((r) => (
              <li
                key={r.applicationId}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={t("rec.table.select").replace("{name}", nameOf(r))}
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
                      {nameOf(r)}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StageBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatDay(r.appliedAt, lang)}
                      </span>
                      {r.responsibleName && (
                        <span className="text-xs text-muted-foreground">{r.responsibleName}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <Attachments row={r} />
                      {r.mandatoryNoCount > 0 && (
                        <span>
                          {t("rec.marker.mandatoryNo").replace("{n}", String(r.mandatoryNoCount))}
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <NextActivity row={r} lang={lang} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* ── Pagination ────────────────────────────────────────────── */}
          <nav
            aria-label={t("rec.pager.aria")}
            className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t("rec.pager.showing")
                .replace("{from}", String(page.from))
                .replace("{to}", String(page.to))
                .replace("{total}", String(page.total))}
              {filterActive && (
                <>
                  {" – "}
                  {t("rec.pager.filter").replace("{filter}", activeFilterLabel)}
                  {page.counts.total !== page.total && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="font-medium text-accent hover:underline"
                        onClick={() => onViewChange(firstPage({ stage: "all" }))}
                      >
                        {t("rec.pager.showAll").replace("{all}", String(page.counts.total))}
                      </button>
                    </>
                  )}
                </>
              )}
            </p>
            {page.pages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={barBtn}
                  disabled={page.page <= 1}
                  onClick={() => setPage(page.page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {t("rec.pager.previous")}
                </button>
                <span className="px-2 text-xs tabular-nums text-muted-foreground">
                  {t("rec.pager.page")
                    .replace("{n}", String(page.page))
                    .replace("{total}", String(page.pages))}
                </span>
                <button
                  type="button"
                  className={barBtn}
                  disabled={page.page >= page.pages}
                  onClick={() => setPage(page.page + 1)}
                >
                  {t("rec.pager.next")}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </nav>
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
            jobTitle: props.jobTitle,
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

      {booking && (
        <BookingDialog
          candidates={selectedRows.map((r) => ({ applicationId: r.applicationId, name: r.name }))}
          onClose={(saved) => {
            setBooking(false);
            if (saved > 0) {
              setSelected(new Set());
              props.onChanged();
            }
          }}
        />
      )}

      {assigningTest && (
        <AssignTestDialog
          employerId={employerId}
          candidates={selectedRows.map((r) => ({ applicationId: r.applicationId, name: r.name }))}
          onClose={(assigned) => {
            setAssigningTest(false);
            if (assigned > 0) {
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

function Answer({ value }: { value: boolean | null | undefined }) {
  const { t } = useT();
  if (value === true)
    return (
      <span className="text-sm text-emerald-800 dark:text-emerald-200">
        {t("rec.filter.answer.yes")}
      </span>
    );
  if (value === false)
    return (
      <span className="text-sm text-amber-900 dark:text-amber-200">
        {t("rec.filter.answer.no")}
      </span>
    );
  return <span className="text-muted-foreground">—</span>;
}

function Attachments({ row }: { row: CandidateRow }) {
  const { t } = useT();
  const nothing = !row.hasCv && !row.notesCount && !row.messagesCount;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {row.hasCv && (
        <span className="inline-flex items-center gap-0.5" title={t("rec.col.cv")}>
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          CV
        </span>
      )}
      {(row.notesCount ?? 0) > 0 && (
        <span className="inline-flex items-center gap-0.5" title={t("rec.col.notes")}>
          <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{t("rec.col.notes")} </span>
          {row.notesCount}
        </span>
      )}
      {(row.messagesCount ?? 0) > 0 && (
        <span className="inline-flex items-center gap-0.5" title={t("rec.col.messages")}>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{t("rec.col.messages")} </span>
          {row.messagesCount}
        </span>
      )}
      {nothing && <span>—</span>}
    </span>
  );
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
