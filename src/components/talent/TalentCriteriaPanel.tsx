// Recruitment — bind the job's confirmed requirement profile to the governed
// catalogue, for talent search (rec_requirement_criteria_sets).
//
// One row per requirement in the CONFIRMED profile. Each requirement is either
// a catalogue credential (one or more codes of ONE class: education,
// certification or regulated authorisation -- with country, validity and
// minimum level), a number of months of experience, or "clarified in
// dialogue". Confirming writes a new immutable version tied to the profile
// version; a changed profile needs the criteria confirmed again.
//
// The panel keeps the confirmed version and the form apart (workshop
// 2026-10-15, package B): it says which confirmed version the search uses,
// that unconfirmed edits do not affect the search, and it refuses a chosen
// binding left empty instead of letting it pass as filled in.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import {
  confirmTalentCriteria,
  getTalentCriteria,
  listTalentCatalogueOptions,
} from "@/lib/talent/talent-search.functions";
import {
  classKey,
  criteriaPayload,
  criterionDraftProblem,
  meritDisplayName,
  type CatalogueOption,
  type CriterionDraft,
} from "@/lib/talent/model";
import { useTalentCopy } from "@/lib/talent/talent-copy";
import { getCareerAreaLabel } from "@/lib/job-intelligence/career-area-labels";

type Kind = "unbound" | "credential" | "experience";

function draftsFrom(
  requirements: readonly { requirementId: string }[],
  items: readonly Record<string, unknown>[] | null,
): Record<string, CriterionDraft & { kind: Kind }> {
  const out: Record<string, CriterionDraft & { kind: Kind }> = {};
  for (const r of requirements) {
    const saved = items?.find((i) => i.requirementId === r.requirementId) as
      | {
          credentialCodes?: { code: string }[];
          jurisdiction?: string | null;
          mustBeValid?: boolean | null;
          minLevel?: CriterionDraft["minLevel"] | null;
          experienceMonths?: number | null;
        }
      | undefined;
    const codes = (saved?.credentialCodes ?? []).map((c) => c.code);
    out[r.requirementId] = {
      requirementId: r.requirementId,
      kind: codes.length > 0 ? "credential" : saved?.experienceMonths ? "experience" : "unbound",
      credentialCodes: codes,
      jurisdiction: saved?.jurisdiction ?? null,
      mustBeValid: saved?.mustBeValid ?? true,
      minLevel: saved?.minLevel ?? "any",
      experienceMonths: saved?.experienceMonths ?? null,
    };
  }
  return out;
}

export function TalentCriteriaPanel({
  employerId,
  employerSlug,
  jobId,
}: {
  readonly employerId: string;
  readonly employerSlug: string;
  readonly jobId: string;
}) {
  const { tt, lang } = useTalentCopy();
  const qc = useQueryClient();
  const readFn = useServerFn(getTalentCriteria);
  const catalogueFn = useServerFn(listTalentCatalogueOptions);
  const confirmFn = useServerFn(confirmTalentCriteria);
  const key = ["employer", employerId, "talent-criteria", jobId];
  const criteria = useQuery({
    queryKey: key,
    queryFn: () => readFn({ data: { employerId, jobId } }),
  });
  const catalogue = useQuery({
    queryKey: ["talent", "catalogue"],
    queryFn: () => catalogueFn(),
    staleTime: 10 * 60_000,
  });
  const [drafts, setDrafts] = useState<Record<string, CriterionDraft & { kind: Kind }>>({});
  const [query, setQuery] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const data = criteria.data && criteria.data.installed ? criteria.data : null;
  const requirements = data?.profile?.requirements ?? [];
  useEffect(() => {
    if (!data?.profile) return;
    setDrafts(
      draftsFrom(
        data.profile.requirements,
        // A stale set still prefills the form: the recruiter confirms it again.
        (data.criteria?.items as Record<string, unknown>[] | undefined) ?? null,
      ),
    );
  }, [data]);

  const options: readonly CatalogueOption[] = useMemo(() => catalogue.data ?? [], [catalogue.data]);
  const problems = useMemo(
    () =>
      Object.fromEntries(
        Object.values(drafts).map((d) => [
          d.requirementId,
          criterionDraftProblem(d.kind, d, options),
        ]),
      ),
    [drafts, options],
  );
  // What the confirmed version says, as the form would hold it: anything
  // else in the form is an unconfirmed edit the search does not use.
  const baseline = useMemo(
    () =>
      data?.profile
        ? JSON.stringify(
            draftsFrom(
              data.profile.requirements,
              (data.criteria?.items as Record<string, unknown>[] | undefined) ?? null,
            ),
          )
        : "",
    [data],
  );
  const unconfirmed = baseline !== "" && JSON.stringify(drafts) !== baseline;

  if (criteria.isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  if (criteria.isError)
    return (
      <div role="alert" className="text-sm">
        <p>{tt("talent.ui.err.generic")}</p>
        <button
          type="button"
          onClick={() => void criteria.refetch()}
          className="mt-2 inline-flex min-h-11 items-center rounded-md border border-input px-3 text-sm font-medium"
        >
          {tt("talent.ui.retry")}
        </button>
      </div>
    );
  if (!criteria.data?.installed) return null;
  const read = criteria.data;

  const update = (id: string, patch: Partial<CriterionDraft & { kind: Kind }>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
    setMessage(null);
  };
  const editable = read.canManage;
  const input =
    "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

  async function confirm() {
    if (busy || !read.profile) return;
    if (Object.values(problems).some(Boolean)) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = criteriaPayload(
        requirements.map((r) => {
          const d = drafts[r.requirementId];
          return {
            ...d,
            credentialCodes: d.kind === "credential" ? d.credentialCodes : [],
            experienceMonths: d.kind === "experience" ? d.experienceMonths : null,
          };
        }),
      );
      await confirmFn({
        data: {
          employerId,
          jobId,
          expectedVersion: read.criteria?.version ?? 0,
          profileId: read.profile?.id ?? "",
          criteria: payload as Record<string, unknown>[],
        },
      });
      await qc.invalidateQueries({ queryKey: key });
      setMessage({ tone: "ok", text: tt("talent.crit.saved") });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "";
      // Someone confirmed a newer profile or criteria meanwhile: show it.
      if (code === "TALENT_CRITERIA_STALE") await qc.invalidateQueries({ queryKey: key });
      setMessage({
        tone: "error",
        text:
          code === "TALENT_CRITERIA_STALE"
            ? tt("talent.crit.err.TALENT_CRITERIA_STALE")
            : code === "TALENT_CRITERIA_MIXED_CLASSES"
              ? tt("talent.crit.problem.mixed_classes")
              : tt("talent.crit.err.generic"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="talent-criteria"
      data-talent-criteria
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="talent-criteria" className="text-base font-semibold text-foreground">
            {tt("talent.crit.title")}
          </h3>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            {tt("talent.crit.lead")}
          </p>
        </div>
        {read.maySearch && read.criteria?.current ? (
          <Link
            to="/employer/$employerSlug/jobs/$jobId/talent"
            params={{ employerSlug, jobId }}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
            {tt("talent.ui.find")}
          </Link>
        ) : null}
      </div>
      {!read.profile ? (
        <p className="mt-3 text-sm text-muted-foreground">{tt("talent.crit.noProfile")}</p>
      ) : (
        <>
          {read.criteria && !read.criteria.current ? (
            <p
              role="status"
              className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground"
            >
              {tt("talent.crit.stale")}
            </p>
          ) : read.criteria ? (
            <p
              className="mt-2 text-sm tabular-nums text-muted-foreground"
              data-criteria-in-use={read.criteria.version}
            >
              {tt("talent.crit.inUse")
                .replace("{version}", String(read.criteria.version))
                .replace("{date}", read.criteria.confirmedAt.slice(0, 10))}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{tt("talent.crit.noneConfirmed")}</p>
          )}
          {editable && unconfirmed ? (
            <div
              className="mt-3 rounded-md border border-border bg-secondary/60 p-3 text-sm"
              data-criteria-unconfirmed
            >
              <p className="font-semibold text-foreground">{tt("talent.crit.unconfirmed.title")}</p>
              <p className="mt-0.5 text-foreground">
                {read.criteria?.current
                  ? tt("talent.crit.unconfirmed.body").replace(
                      "{version}",
                      String(read.criteria.version),
                    )
                  : tt("talent.crit.unconfirmed.bodyNone")}
              </p>
            </div>
          ) : null}
          {!editable ? (
            <p className="mt-2 text-sm text-muted-foreground">{tt("talent.crit.readOnly")}</p>
          ) : null}
          <ol className="mt-4 space-y-4">
            {requirements.map((r) => {
              const d = drafts[r.requirementId];
              if (!d) return null;
              const label =
                (lang === "sv" ? (r.labelSv ?? r.labelEn) : (r.labelEn ?? r.labelSv)) ?? "";
              const q = (query[r.requirementId] ?? "").trim().toLowerCase();
              const matches =
                q.length < 2
                  ? []
                  : options
                      .filter(
                        (o) =>
                          !d.credentialCodes.includes(o.code) &&
                          [o.code, o.nameSv, o.nameEn, o.abbreviation ?? ""].some((v) =>
                            v.toLowerCase().includes(q),
                          ),
                      )
                      .map((o) => ({ o, rank: catalogueMatchRank(o, q) }))
                      .sort((a, b) => a.rank - b.rank)
                      .map(({ o }) => o)
                      .slice(0, 8);
              const problem = problems[r.requirementId];
              return (
                <li
                  key={r.requirementId}
                  data-criterion={r.requirementId}
                  className="rounded-lg border border-border p-4"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {label}{" "}
                    <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {r.kind === "mandatory"
                        ? tt("talent.ui.mandatory")
                        : tt("talent.ui.desirable")}
                    </span>
                  </p>
                  <fieldset className="mt-2" disabled={!editable}>
                    <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {tt("talent.crit.kind")}
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-x-4">
                      {(["credential", "experience", "unbound"] as const).map((k) => (
                        <label
                          key={k}
                          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="radio"
                            name={`kind-${r.requirementId}`}
                            checked={d.kind === k}
                            onChange={() => update(r.requirementId, { kind: k })}
                            className="h-5 w-5"
                          />
                          {tt(`talent.crit.kind.${k}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {d.kind === "credential" ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {tt("talent.crit.credentials")}
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {d.credentialCodes.map((code) => {
                          const o = options.find((x) => x.code === code);
                          return (
                            <li
                              key={code}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-sm"
                            >
                              <span>{o ? meritDisplayName(o, lang) : code}</span>
                              {o ? (
                                <span className="text-xs text-muted-foreground">
                                  · {tt(classKey(o.requirementClass))}
                                  {o.jurisdiction ? ` · ${o.jurisdiction}` : ""}
                                </span>
                              ) : null}
                              {editable ? (
                                <button
                                  type="button"
                                  aria-label={`${tt("talent.crit.remove")}: ${o ? meritDisplayName(o, lang) : code}`}
                                  onClick={() =>
                                    update(r.requirementId, {
                                      credentialCodes: d.credentialCodes.filter((c) => c !== code),
                                    })
                                  }
                                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-background"
                                >
                                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      {editable ? (
                        <div>
                          <label className="block text-sm">
                            <span className="sr-only">{tt("talent.crit.search")}</span>
                            <input
                              className={input}
                              placeholder={tt("talent.crit.search")}
                              value={query[r.requirementId] ?? ""}
                              onChange={(e) =>
                                setQuery((qq) => ({ ...qq, [r.requirementId]: e.target.value }))
                              }
                            />
                          </label>
                          {matches.length > 0 ? (
                            <ul className="mt-1 divide-y divide-border rounded-md border border-border">
                              {matches.map((o) => (
                                <li key={o.code}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      update(r.requirementId, {
                                        credentialCodes: [...d.credentialCodes, o.code],
                                      });
                                      setQuery((qq) => ({ ...qq, [r.requirementId]: "" }));
                                    }}
                                    className="flex min-h-11 w-full flex-wrap items-center gap-x-2 px-3 text-left text-sm hover:bg-secondary"
                                  >
                                    <span className="font-medium text-foreground">
                                      {meritDisplayName(o, lang)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {tt(classKey(o.requirementClass))}
                                      {o.jurisdiction ? ` · ${o.jurisdiction}` : ""}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">
                            {tt("talent.crit.jurisdiction")}
                          </span>
                          <select
                            className={input}
                            disabled={!editable}
                            value={d.jurisdiction ?? ""}
                            onChange={(e) =>
                              update(r.requirementId, { jurisdiction: e.target.value || null })
                            }
                          >
                            <option value="">{tt("talent.crit.anyJurisdiction")}</option>
                            {["SE", "GB", "AE", "IN", "US"].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm">
                          <span className="text-xs text-muted-foreground">
                            {tt("talent.crit.minLevel")}
                          </span>
                          <select
                            className={input}
                            disabled={!editable}
                            value={d.minLevel}
                            onChange={(e) =>
                              update(r.requirementId, {
                                minLevel: e.target.value as CriterionDraft["minLevel"],
                              })
                            }
                          >
                            {(["any", "document_provided", "document_reviewed"] as const).map(
                              (m) => (
                                <option key={m} value={m}>
                                  {tt(`talent.crit.minLevel.${m}`)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            disabled={!editable}
                            checked={d.mustBeValid}
                            onChange={(e) =>
                              update(r.requirementId, { mustBeValid: e.target.checked })
                            }
                          />
                          {tt("talent.crit.mustBeValid")}
                        </label>
                      </div>
                    </div>
                  ) : d.kind === "experience" ? (
                    <label className="mt-2 block max-w-xs text-sm">
                      <span className="text-xs text-muted-foreground">
                        {tt("talent.crit.months")}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={480}
                        inputMode="numeric"
                        className={input}
                        disabled={!editable}
                        value={d.experienceMonths ?? ""}
                        onChange={(e) =>
                          update(r.requirementId, {
                            experienceMonths: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {problem === "empty_credential" || problem === "empty_experience" ? (
                    <p className="mt-2 text-sm text-foreground" data-criterion-empty={problem}>
                      {tt(`talent.crit.problem.${problem}`)}
                    </p>
                  ) : problem ? (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      {tt(`talent.crit.problem.${problem}`)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 rounded-md bg-secondary/40 p-3 text-sm">
            <p className="font-semibold text-foreground">{tt("talent.crit.jobPrefs")}</p>
            <p className="text-muted-foreground">{tt("talent.crit.jobPrefs.help")}</p>
            <p className="mt-1 text-foreground">
              {[
                read.jobPreferences.area
                  ? (getCareerAreaLabel(read.jobPreferences.area)?.name[lang] ??
                    read.jobPreferences.area)
                  : null,
                [read.jobPreferences.city, read.jobPreferences.country]
                  .filter(Boolean)
                  .join(", ") || null,
                read.jobPreferences.workplaceType
                  ? tt(`talent.work.${read.jobPreferences.workplaceType}`)
                  : null,
                read.jobPreferences.employmentType
                  ? tt(`talent.emp.${read.jobPreferences.employmentType}`)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
          {editable ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy || Object.values(problems).some(Boolean)}
                data-confirm-criteria
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? tt("talent.crit.saving") : tt("talent.crit.save")}
              </button>
              {message ? (
                <p
                  role={message.tone === "error" ? "alert" : "status"}
                  className={
                    message.tone === "error"
                      ? "text-sm text-destructive"
                      : "text-sm text-foreground"
                  }
                >
                  {message.text}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/** The job page's header entry to talent search: shown only to a caller the
 *  database lets search, for a published open job with current criteria.
 *  Shares the panel's query, so it costs no extra read. */
export function FindCandidatesLink({
  employerId,
  employerSlug,
  jobId,
  className,
}: {
  readonly employerId: string;
  readonly employerSlug: string;
  readonly jobId: string;
  readonly className: string;
}) {
  const { tt } = useTalentCopy();
  const readFn = useServerFn(getTalentCriteria);
  const criteria = useQuery({
    queryKey: ["employer", employerId, "talent-criteria", jobId],
    queryFn: () => readFn({ data: { employerId, jobId } }),
  });
  const d = criteria.data && criteria.data.installed ? criteria.data : null;
  if (!d || !d.maySearch) return null;
  return (
    <Link
      to="/employer/$employerSlug/jobs/$jobId/talent"
      params={{ employerSlug, jobId }}
      className={className}
      title={tt("talent.ui.findHelp")}
      data-find-candidates
    >
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      {tt("talent.ui.find")}
    </Link>
  );
}

/** Search order for the catalogue picker: an exact abbreviation first ("OV"
 *  is Ordningsvaktsförordnande, not every name containing "ov"), then
 *  abbreviation and name prefixes, then the rest in catalogue order. */
function catalogueMatchRank(o: CatalogueOption, q: string): number {
  const abbr = (o.abbreviation ?? "").toLowerCase();
  if (abbr === q || o.code.toLowerCase() === q) return 0;
  if (abbr.startsWith(q)) return 1;
  if (o.nameSv.toLowerCase().startsWith(q) || o.nameEn.toLowerCase().startsWith(q)) return 2;
  return 3;
}
