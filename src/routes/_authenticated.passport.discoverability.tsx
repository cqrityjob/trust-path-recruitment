// Security Passport — visibility for employers (slot 20270317090000).
//
// A tab of the existing Passport workspace, not a second profile: the
// person's merits are the Passport's own entries, chosen here one by one.
// One column on a phone, in this order (workshop 2026-10-15, package B):
//
//   1. what is SAVED now, and pause
//   2. the choice: private (default) | open | actively looking
//   3. exactly which merits and periods may be found, each with the support
//      and validity the employer card will show
//   4. job preferences (optional)
//   5. a summary of the unsaved form -- never called the employer's view
//   6. the saved preview: what an authorised recruiter sees NOW, built by the
//      same database function the recruiter's read uses
//   7. consent, as its own act -- an application share is not consent -- and
//      one main action: "Make me discoverable" the first time, then "Save
//      changes"
//   8. contact requests received, and companies the person has stopped
//
// On a wide screen the saved preview sits beside the form. Pausing is one
// click and rotates the reference employers hold, so no old result list can
// open the profile again.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, EyeOff, PauseCircle, Plus } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { isPassportCredential } from "@/lib/security-passport/credential-passport";
import {
  getDiscoverability,
  listMyContactRequests,
  pauseDiscoverability,
  respondToContactRequest,
  saveDiscoverability,
  unblockEmployer,
  type DiscoverabilityRead,
  type DiscoverabilitySettings,
  type ReceivedContacts,
} from "@/lib/talent/discoverability.functions";
import {
  CONSENT_TEXT_VERSION,
  discoverabilityPayload,
  draftProblem,
  entryTalentLevel,
  levelKey,
  talentValidity,
  validityKey,
  type DiscoverabilityDraft,
  type Visibility,
} from "@/lib/talent/model";
import { careerAreaLabels } from "@/lib/job-intelligence/career-area-labels";
import { TalentCardView } from "@/components/talent/TalentCardView";
import { ContactRequestList } from "@/components/talent/ContactRequestList";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useTalentCopy } from "@/lib/talent/talent-copy";

export const Route = createFileRoute("/_authenticated/passport/discoverability")({
  ssr: false,
  component: DiscoverabilityRoute,
});

type Load<T> = { status: "loading" } | { status: "error" } | { status: "ready"; value: T };

function draftFrom(s: DiscoverabilitySettings): DiscoverabilityDraft {
  return {
    visibility: s.visibility,
    claimIds: [...s.claimIds],
    experienceIds: [...s.experienceIds],
    areas: [...s.preferences.areas],
    countries: [...s.preferences.countries],
    cities: [...s.preferences.cities],
    employmentTypes: [...s.preferences.employmentTypes],
    workplaceTypes: [...s.preferences.workplaceTypes],
    availableFrom: s.preferences.availableFrom ?? "",
    consent: s.visibility !== "private" && s.consentTextVersion === CONSENT_TEXT_VERSION,
  };
}

const VISIBILITIES: { value: Visibility; label: PassportCopyKey; help: PassportCopyKey }[] = [
  { value: "private", label: "disc.state.private", help: "disc.state.private.help" },
  { value: "open", label: "disc.state.open", help: "disc.state.open.help" },
  { value: "active", label: "disc.state.active", help: "disc.state.active.help" },
];
const EMPLOYMENT = ["full_time", "part_time", "contract", "temporary", "internship"] as const;
const WORKPLACE = ["onsite", "hybrid", "remote"] as const;

function DiscoverabilityRoute() {
  const { pt, lang } = usePassportCopy();
  const { tt } = useTalentCopy();
  const loadSettings = useServerFn(getDiscoverability);
  const loadPassport = useServerFn(getMyPassport);
  const loadContacts = useServerFn(listMyContactRequests);
  const save = useServerFn(saveDiscoverability);
  const pause = useServerFn(pauseDiscoverability);
  const unblock = useServerFn(unblockEmployer);
  const respond = useServerFn(respondToContactRequest);

  const [read, setRead] = useState<Load<DiscoverabilityRead>>({ status: "loading" });
  const [passport, setPassport] = useState<PassportSnapshot | null>(null);
  const [contacts, setContacts] = useState<Load<ReceivedContacts>>({ status: "loading" });
  const [draft, setDraft] = useState<DiscoverabilityDraft | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; key: PassportCopyKey } | null>(
    null,
  );
  // Free text as typed; the lists in the draft are parsed from it.
  const [countriesText, setCountriesText] = useState("");
  const [citiesText, setCitiesText] = useState("");

  const refresh = useCallback(async () => {
    setRead({ status: "loading" });
    try {
      const [r, p] = await Promise.all([loadSettings(), loadPassport({ data: undefined })]);
      setRead({ status: "ready", value: r });
      setPassport(p);
      if (r.installed) {
        const d = draftFrom(r.settings);
        setDraft(d);
        setBaseline(JSON.stringify(d));
        setCountriesText(d.countries.join(", "));
        setCitiesText(d.cities.join(", "));
      }
    } catch {
      setRead({ status: "error" });
    }
  }, [loadSettings, loadPassport]);

  const refreshContacts = useCallback(async () => {
    setContacts({ status: "loading" });
    try {
      setContacts({ status: "ready", value: await loadContacts() });
    } catch {
      setContacts({ status: "error" });
    }
  }, [loadContacts]);

  useEffect(() => {
    void refresh();
    void refreshContacts();
  }, [refresh, refreshContacts]);

  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  const releaseUnsaved = useUnsavedChanges(dirty);

  const claims = useMemo(
    () =>
      (passport?.holder.claims ?? []).filter(
        (c) =>
          isPassportCredential(c) &&
          (c.lifecycleState === "active" || c.lifecycleState === "expired"),
      ),
    [passport],
  );
  const periods = useMemo(
    () => (passport?.holder.periods ?? []).filter((p) => p.lifecycleState === "active"),
    [passport],
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const settings = read.status === "ready" && read.value.installed ? read.value.settings : null;
  const preview = read.status === "ready" && read.value.installed ? read.value.preview : null;

  function update(patch: Partial<DiscoverabilityDraft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setMessage(null);
  }
  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function onSave(activating: boolean) {
    if (!draft || !settings || busy) return;
    const problem = draftProblem(draft);
    if (problem) {
      setMessage({
        tone: "error",
        key:
          problem === "consent_required"
            ? "disc.error.SP_TALENT_CONSENT_REQUIRED"
            : "disc.error.SP_TALENT_NOTHING_SELECTED",
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload = discoverabilityPayload(draft);
      await save({ data: { expectedVersion: settings.version, ...payload } });
      releaseUnsaved();
      await refresh();
      setMessage({ tone: "ok", key: activating ? "disc.activated" : "disc.saved" });
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "DISCOVERABILITY_FAILED";
      const known = [
        "SP_TALENT_STALE",
        "SP_TALENT_CONSENT_REQUIRED",
        "SP_TALENT_NOTHING_SELECTED",
        "SP_TALENT_ITEM_NOT_AVAILABLE",
        "SP_TALENT_INVALID",
      ];
      setMessage({
        tone: "error",
        key: (known.includes(code)
          ? `disc.error.${code}`
          : "disc.error.DISCOVERABILITY_FAILED") as PassportCopyKey,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onPause() {
    if (busy) return;
    setBusy(true);
    try {
      await pause();
      releaseUnsaved();
      await refresh();
      setMessage({ tone: "ok", key: "disc.paused" });
    } catch {
      setMessage({ tone: "error", key: "disc.error.DISCOVERABILITY_FAILED" });
    } finally {
      setBusy(false);
    }
  }

  const card = "rounded-xl border border-border bg-card p-5";
  const h2 = "text-base font-semibold tracking-tight text-foreground";
  const input =
    "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const check = "h-5 w-5 shrink-0 rounded border-input accent-[var(--primary)]";
  // One column on a phone, in the order the holder works through it; on a
  // wide screen the saved preview sits beside the form for every row of it.
  const left = "lg:col-start-1";

  const visibilityLabel = (v: Visibility) => pt(VISIBILITIES.find((x) => x.value === v)!.label);
  const claimTitle = (c: (typeof claims)[number]) => (lang === "sv" ? c.titleSv : c.titleEn);
  const chosenClaims = draft ? claims.filter((c) => draft.claimIds.includes(c.id)) : [];
  const chosenPeriods = draft ? periods.filter((p) => draft.experienceIds.includes(p.id)) : [];
  const chosenPrefs = draft
    ? [
        ...careerAreaLabels.filter((a) => draft.areas.includes(a.id)).map((a) => a.name[lang]),
        ...draft.countries,
        ...draft.cities,
        ...draft.employmentTypes.map((e) => tt(`talent.emp.${e}`)),
        ...draft.workplaceTypes.map((w) => tt(`talent.work.${w}`)),
        ...(draft.availableFrom
          ? [`${pt("disc.prefs.availableFrom")} ${draft.availableFrom}`]
          : []),
      ]
    : [];
  const firstActivation =
    settings !== null &&
    draft !== null &&
    settings.visibility === "private" &&
    draft.visibility !== "private";
  const gridRows = settings && settings.blockedEmployers.length > 0 ? 8 : 7;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link
        to="/passport"
        className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        data-discoverability-back
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {pt("disc.back")}
      </Link>
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("disc.title")}
        </h1>
        <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
          {pt("disc.lead")}
        </p>
      </header>

      {read.status === "loading" ? (
        <p aria-busy="true" className="text-sm text-muted-foreground">
          …
        </p>
      ) : read.status === "error" ? (
        <div role="alert" className={card}>
          <p className="text-sm text-foreground">{pt("disc.loadError")}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-medium"
          >
            {pt("disc.retry")}
          </button>
        </div>
      ) : !read.value.installed ? (
        <p className={`${card} text-sm text-muted-foreground`}>{pt("disc.notInstalled")}</p>
      ) : draft && settings ? (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          {/* 1. What is saved now, and pause */}
          <section className={`${card} ${left}`} aria-labelledby="disc-saved-state">
            <h2 id="disc-saved-state" className={h2}>
              {pt("disc.savedState.title")}
            </h2>
            <p
              className="mt-2 text-sm text-foreground"
              data-current-visibility={settings.visibility}
            >
              <span className="font-semibold">{visibilityLabel(settings.visibility)}</span>
              {settings.visibilityChangedAt
                ? ` · ${pt("disc.since")} ${settings.visibilityChangedAt.slice(0, 10)}`
                : ""}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings.visibility === "private"
                ? pt("disc.savedState.private")
                : pt("disc.savedState.searchable")}
            </p>
            {settings.visibility !== "private" ? (
              <>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {pt("disc.items.credentials")}: {settings.claimIds.length} ·{" "}
                  {pt("disc.items.experience")}: {settings.experienceIds.length}
                </p>
                <button
                  type="button"
                  onClick={() => void onPause()}
                  disabled={busy}
                  data-pause-discoverability
                  aria-describedby="disc-pause-help"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
                >
                  <PauseCircle aria-hidden="true" className="h-4 w-4" />
                  {pt("disc.pause")}
                </button>
                <p id="disc-pause-help" className="mt-2 text-sm text-muted-foreground">
                  {pt("disc.pause.help")}
                </p>
              </>
            ) : null}
          </section>

          {/* 2. The choice */}
          <section className={`${card} ${left}`} aria-labelledby="disc-state">
            <h2 id="disc-state" className={h2}>
              {pt("disc.state.title")}
            </h2>
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">{pt("disc.state.title")}</legend>
              {VISIBILITIES.map((v) => (
                <label
                  key={v.value}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${draft.visibility === v.value ? "border-accent bg-accent/5" : "border-border"}`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={v.value}
                    checked={draft.visibility === v.value}
                    onChange={() => update({ visibility: v.value })}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{pt(v.label)}</span>
                    <span className="block text-sm text-muted-foreground">{pt(v.help)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          {/* 3. Exactly what may be found -- with the support and validity the
              employer card will show, so nothing is chosen by name alone */}
          <section className={`${card} ${left}`} aria-labelledby="disc-items">
            <h2 id="disc-items" className={h2}>
              {pt("disc.items.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{pt("disc.items.help")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{pt("disc.items.support")}</p>
            {claims.length + periods.length === 0 ? (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">{pt("disc.items.none")}</p>
                <Link
                  to="/passport/credentials/new"
                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  {pt("disc.items.addMerit")}
                </Link>
              </div>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-sm font-semibold text-foreground">
                    {pt("disc.items.credentials")}
                  </legend>
                  <ul className="mt-2 space-y-1">
                    {claims.map((c) => {
                      const level = entryTalentLevel({ ...c, subjectKind: "credential" });
                      const validity = talentValidity(c.validFrom, c.validUntil, c.noExpiry, today);
                      return (
                        <li key={c.id}>
                          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                            <input
                              type="checkbox"
                              className={`${check} mt-0.5`}
                              checked={draft.claimIds.includes(c.id)}
                              onChange={() => update({ claimIds: toggle(draft.claimIds, c.id) })}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">
                                {claimTitle(c)}
                              </span>
                              <span
                                className="block text-xs leading-relaxed text-muted-foreground"
                                data-item-support={level}
                                data-item-validity={validity}
                              >
                                {tt(levelKey(level))} · {tt(validityKey(validity))}
                                {c.validUntil ? ` (${c.validUntil.slice(0, 10)})` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-semibold text-foreground">
                    {pt("disc.items.experience")}
                  </legend>
                  <ul className="mt-2 space-y-1">
                    {periods.map((p) => {
                      const level = entryTalentLevel({ ...p, subjectKind: "employment" });
                      return (
                        <li key={p.id}>
                          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                            <input
                              type="checkbox"
                              className={`${check} mt-0.5`}
                              checked={draft.experienceIds.includes(p.id)}
                              onChange={() =>
                                update({ experienceIds: toggle(draft.experienceIds, p.id) })
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">
                                {p.roleTitle}
                              </span>
                              <span
                                className="block text-xs leading-relaxed text-muted-foreground"
                                data-item-support={level}
                              >
                                {tt(levelKey(level))} ·{" "}
                                <span className="tabular-nums">
                                  {p.startedOn.slice(0, 7)} –{" "}
                                  {p.endedOn ? p.endedOn.slice(0, 7) : pt("disc.items.ongoing")}
                                </span>
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              </div>
            )}
          </section>

          {/* 4. Preferences (optional) */}
          <section className={`${card} ${left}`} aria-labelledby="disc-prefs">
            <h2 id="disc-prefs" className={h2}>
              {pt("disc.prefs.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{pt("disc.prefs.help")}</p>
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-foreground">
                {pt("disc.prefs.areas")}
              </legend>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {careerAreaLabels.map((a) => (
                  <li key={a.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className={check}
                        checked={draft.areas.includes(a.id)}
                        onChange={() => update({ areas: toggle(draft.areas, a.id) })}
                      />
                      <span className="text-sm text-foreground">{a.name[lang]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold text-foreground">{pt("disc.prefs.countries")}</span>
                <input
                  className={`${input} mt-1`}
                  value={countriesText}
                  placeholder="SE, GB"
                  onChange={(e) => {
                    setCountriesText(e.target.value);
                    update({
                      countries: e.target.value
                        .split(",")
                        .map((v) => v.trim().toUpperCase())
                        .filter(Boolean),
                    });
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="font-semibold text-foreground">{pt("disc.prefs.cities")}</span>
                <input
                  className={`${input} mt-1`}
                  value={citiesText}
                  onChange={(e) => {
                    setCitiesText(e.target.value);
                    update({
                      cities: e.target.value
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    });
                  }}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">
                  {pt("disc.prefs.employmentTypes")}
                </legend>
                {EMPLOYMENT.map((e) => (
                  <label key={e} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className={check}
                      checked={draft.employmentTypes.includes(e)}
                      onChange={() => update({ employmentTypes: toggle(draft.employmentTypes, e) })}
                    />
                    <span className="text-sm text-foreground">{tt(`talent.emp.${e}`)}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">
                  {pt("disc.prefs.workplaceTypes")}
                </legend>
                {WORKPLACE.map((w) => (
                  <label key={w} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className={check}
                      checked={draft.workplaceTypes.includes(w)}
                      onChange={() => update({ workplaceTypes: toggle(draft.workplaceTypes, w) })}
                    />
                    <span className="text-sm text-foreground">{tt(`talent.work.${w}`)}</span>
                  </label>
                ))}
                <label className="mt-2 block text-sm">
                  <span className="font-semibold text-foreground">
                    {pt("disc.prefs.availableFrom")}
                  </span>
                  <input
                    type="date"
                    className={`${input} mt-1`}
                    value={draft.availableFrom}
                    onChange={(e) => update({ availableFrom: e.target.value })}
                  />
                </label>
              </fieldset>
            </div>
          </section>

          {/* 5. The draft, summarised -- the form's own words, not the
              employer's view, which only the saved preview shows */}
          <section
            className={`${card} ${left}`}
            aria-labelledby="disc-summary"
            data-discoverability-summary={draft.visibility}
          >
            <h2 id="disc-summary" className={h2}>
              {pt("disc.summary.title")}
            </h2>
            {draft.visibility === "private" ? (
              <p className="mt-2 text-sm text-foreground">{pt("disc.summary.private")}</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">{pt("disc.summary.lead")}</p>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="font-semibold text-foreground">{pt("disc.summary.state")}</dt>
                    <dd className="text-foreground">{visibilityLabel(draft.visibility)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">
                      {pt("disc.items.credentials")}
                    </dt>
                    <dd className="text-foreground">
                      {chosenClaims.length === 0 ? (
                        <span className="text-muted-foreground">{pt("disc.summary.none")}</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {chosenClaims.map((c) => (
                            <li key={c.id}>
                              {claimTitle(c)}{" "}
                              <span className="text-muted-foreground">
                                (
                                {tt(
                                  levelKey(entryTalentLevel({ ...c, subjectKind: "credential" })),
                                )}
                                )
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">{pt("disc.items.experience")}</dt>
                    <dd className="text-foreground">
                      {chosenPeriods.length === 0 ? (
                        <span className="text-muted-foreground">{pt("disc.summary.none")}</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {chosenPeriods.map((p) => (
                            <li key={p.id}>
                              {p.roleTitle}{" "}
                              <span className="text-muted-foreground">
                                (
                                {tt(
                                  levelKey(entryTalentLevel({ ...p, subjectKind: "employment" })),
                                )}
                                )
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">{pt("disc.prefs.title")}</dt>
                    <dd className="text-foreground">
                      {chosenPrefs.length === 0 ? (
                        <span className="text-muted-foreground">{pt("disc.summary.noPrefs")}</span>
                      ) : (
                        chosenPrefs.join(" · ")
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">{pt("disc.consent.title")}</dt>
                    <dd className="text-foreground">
                      {draft.consent
                        ? pt("disc.summary.consentGiven")
                        : pt("disc.summary.consentMissing")}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </section>

          {/* 6. The SAVED preview: what an authorised recruiter reads now,
              built by the same database function the recruiter's read uses */}
          <aside
            className={`${card} h-fit self-start lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1`}
            style={{ gridRowEnd: `span ${gridRows}` }}
            aria-labelledby="disc-preview"
            data-discoverability-preview
          >
            <h2 id="disc-preview" className={`${h2} flex items-center gap-2`}>
              {preview?.searchable ? null : <EyeOff aria-hidden="true" className="h-4 w-4" />}
              {pt("disc.preview.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{pt("disc.preview.lead")}</p>
            {dirty ? (
              <div
                className="mt-3 rounded-lg border border-border bg-secondary/60 p-3"
                data-unsaved-notice
              >
                <p className="text-sm font-semibold text-foreground">{pt("disc.unsaved.title")}</p>
                <p className="mt-0.5 text-sm text-foreground">{pt("disc.unsaved.body")}</p>
              </div>
            ) : null}
            {!preview?.searchable ? (
              <p className="mt-2 text-sm font-medium text-foreground">
                {pt("disc.preview.notSearchable")}
              </p>
            ) : null}
            <div className="mt-4">
              {preview?.card &&
              (preview.card.merits.length > 0 || preview.card.experience.length > 0) ? (
                <TalentCardView
                  visibility={preview.card.visibility === "active" ? "active" : "open"}
                  merits={preview.card.merits}
                  experience={preview.card.experience}
                  totalSecurityMonths={preview.card.totalSecurityMonths}
                  preferences={preview.card.preferences}
                  headingLevel={3}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{pt("disc.preview.empty")}</p>
              )}
            </div>
          </aside>

          {/* 7. Consent, as its own act, and the one main action */}
          <section className={`${card} ${left}`} aria-labelledby="disc-consent">
            <h2 id="disc-consent" className={h2}>
              {pt("disc.consent.title")}
            </h2>
            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className={`${check} mt-0.5`}
                checked={draft.consent}
                disabled={draft.visibility === "private"}
                onChange={(e) => update({ consent: e.target.checked })}
                aria-describedby="disc-consent-note"
              />
              <span className="text-sm leading-relaxed text-foreground">
                {pt("disc.consent.label")}
              </span>
            </label>
            <p id="disc-consent-note" className="mt-2 text-sm text-muted-foreground">
              {pt("disc.consent.note")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onSave(firstActivation)}
                disabled={busy || !dirty}
                data-save-discoverability
                data-save-action={firstActivation ? "activate" : "save"}
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {busy
                  ? pt("disc.saving")
                  : firstActivation
                    ? pt("disc.activate")
                    : pt("disc.saveChanges")}
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
                  {pt(message.key)}
                </p>
              ) : null}
            </div>
          </section>

          {/* 8. Contact requests */}
          <section
            id="contacts"
            className={`${card} ${left} scroll-mt-24`}
            aria-labelledby="disc-contacts"
          >
            <h2 id="disc-contacts" className={h2}>
              {pt("disc.contacts.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{pt("disc.contacts.lead")}</p>
            <div className="mt-3">
              {contacts.status === "loading" ? (
                <p aria-busy="true" className="text-sm text-muted-foreground">
                  …
                </p>
              ) : contacts.status === "error" ? (
                <div role="alert">
                  <p className="text-sm text-foreground">{pt("disc.contacts.loadError")}</p>
                  <button
                    type="button"
                    onClick={() => void refreshContacts()}
                    className="mt-2 inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-medium"
                  >
                    {pt("disc.retry")}
                  </button>
                </div>
              ) : !contacts.value.installed ? (
                <p className="text-sm text-muted-foreground">{pt("disc.contacts.empty")}</p>
              ) : (
                <ContactRequestList
                  items={contacts.value.items}
                  onRespond={async (contactId, accept, block) => {
                    await respond({ data: { contactId, accept, blockEmployer: block } });
                    await Promise.all([refreshContacts(), block ? refresh() : Promise.resolve()]);
                  }}
                />
              )}
            </div>
          </section>

          {settings.blockedEmployers.length > 0 ? (
            <section className={`${card} ${left}`} aria-labelledby="disc-blocked">
              <h2 id="disc-blocked" className={h2}>
                {pt("disc.blocked.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{pt("disc.blocked.help")}</p>
              <ul className="mt-2 divide-y divide-border">
                {settings.blockedEmployers.map((b) => (
                  <li
                    key={b.employerId}
                    className="flex min-h-11 items-center justify-between gap-2 py-1"
                  >
                    <span className="text-sm text-foreground">{b.name}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await unblock({ data: { employerId: b.employerId } });
                        await refresh();
                      }}
                      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {pt("disc.blocked.undo")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
