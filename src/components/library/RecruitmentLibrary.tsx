// Bibliotek — Tester & intervjuer.
//
// The library's order is the product's: METHOD → ROLE → WORK ENVIRONMENT →
// SETUP → START (TRUST/BESKT product structure v2.0). The choices live in the
// URL, so the browser's Back button steps back through them instead of wiping
// the setup, and a started case carries them on (scp_recruitment_setups).
//
// What is startable is read live and resolved by src/lib/library/catalogue.ts,
// which never invents content: a role with no content of its own, or an
// environment with no scenarios of its own, is shown and NOT offered. No
// access is decided here either -- the database's entitlement rule (one rule,
// every active employer, no per-company grant) decides what comes back.

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Info, Loader2, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  ENVIRONMENTS,
  ENVIRONMENTS_WITH_CONTENT,
  ROLE_GROUPS,
  TRUST_CONTENT,
  profilesFor,
  resolveSetup,
  type EnvironmentKey,
  type LibraryMethod,
  type LiveContent,
  type ResolvedSetup,
  type RoleGroup,
  type RoleProfileKey,
} from "@/lib/library/catalogue";
import { listStartableInterviewPacks } from "@/lib/interview-intelligence/runtime.functions";
import { listContentLibrary } from "@/lib/security-competency/academy-employer.functions";
import { listAssignableBesktMethods } from "@/lib/beskt/candidate-preparation.functions";
import { getMyBesktStanding } from "@/lib/beskt/complete.functions";
import { listApplicationsForEmployer } from "@/lib/job-intelligence/applications.functions";
import { recordBesktSetup } from "@/lib/library/setup.functions";
import { BesktStartDialog } from "@/components/beskt/BesktStartDialog";
import { BesktPreviewDialog } from "@/components/beskt/BesktPreviewDialog";
import {
  BesktAssignmentsList,
  BesktSecurityFunctionPanel,
} from "@/components/beskt/BesktModulePanels";

export interface LibrarySearch {
  readonly method?: LibraryMethod;
  readonly group?: RoleGroup;
  readonly role?: RoleProfileKey;
  readonly env?: EnvironmentKey;
}

const ENV_LABEL: Record<EnvironmentKey, TranslationKey> = {
  general: "lib.env.general",
  data_centre: "lib.env.data_centre",
  hospital: "lib.env.hospital",
  shopping_centre: "lib.env.shopping_centre",
};
const ROLE_LABEL: Record<RoleProfileKey, TranslationKey> = {
  vaktare: "lib.role.vaktare",
  security_manager: "lib.role.security_manager",
};
const GROUP_LABEL: Record<RoleGroup, TranslationKey> = {
  operational: "lib.group.operational",
  strategic: "lib.group.strategic",
};
const GROUP_HINT: Record<RoleGroup, TranslationKey> = {
  operational: "lib.group.operational.hint",
  strategic: "lib.group.strategic.hint",
};

const CARD = "rounded-xl border border-border bg-background p-5 shadow-sm transition-colors sm:p-6";
const CHOICE =
  "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-accent";

export function RecruitmentLibrary({
  employerId,
  employerSlug,
  canAssign,
  canManage,
  search,
}: {
  readonly employerId: string;
  readonly employerSlug: string;
  readonly canAssign: boolean;
  readonly canManage: boolean;
  readonly search: LibrarySearch;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const go = (next: LibrarySearch) =>
    void navigate({
      to: "/employer/$employerSlug/assessments/library",
      params: { employerSlug },
      search: next,
    });

  const method = search.method;
  const group = search.group;
  const role =
    search.role && group && profilesFor(group).some((p) => p.key === search.role)
      ? search.role
      : undefined;
  const env = search.env;

  return (
    <div data-testid="library">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {t("lib.title")}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t("lib.lede")}
      </p>

      <ol
        aria-label={t("lib.steps.aria")}
        className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm"
        data-testid="lib-steps"
      >
        {(
          [
            ["lib.step.method", Boolean(method)],
            ["lib.step.role", Boolean(method && group && role && env)],
            ["lib.step.setup", false],
          ] as const
        ).map(([key, done], i) => {
          const current =
            (i === 0 && !method) ||
            (i === 1 && method && !(group && role && env)) ||
            (i === 2 && method && group && role && env);
          return (
            <li
              key={key}
              className={`flex items-center gap-2 ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              aria-current={current ? "step" : undefined}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${done ? "border-foreground bg-foreground text-background" : "border-border"}`}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {t(key)}
            </li>
          );
        })}
      </ol>

      {!method ? (
        <MethodChoice onChoose={(m) => go({ method: m })} />
      ) : (
        <>
          <div
            className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
            data-testid="lib-method-chosen"
          >
            <span className="text-muted-foreground">{t("lib.method.chosen")}:</span>
            <span className="font-semibold" data-testid="lib-method-name">
              {method === "trust" ? "TRUST" : "BESKT"}
            </span>
            <span className="text-muted-foreground">
              {t(method === "trust" ? "lib.method.trust.body" : "lib.method.beskt.body")}
            </span>
            <Button
              type="button"
              variant="link"
              className="ml-auto min-h-[44px] px-0"
              onClick={() => go({})}
              data-testid="lib-method-change"
            >
              {t("lib.change")}
            </Button>
          </div>

          <RoleAndEnvironment
            method={method}
            group={group}
            role={role}
            env={env}
            onChange={(next) => go({ method, ...next })}
          />

          {group && role && env ? (
            <SetupPanel
              employerId={employerId}
              employerSlug={employerSlug}
              method={method}
              group={group}
              role={role}
              env={env}
              canAssign={canAssign}
            />
          ) : null}

          {method === "beskt" ? (
            <div className="mt-10 space-y-6">
              <BesktAssignmentsList employerId={employerId} employerSlug={employerSlug} />
              <BesktSecurityFunctionPanel employerId={employerId} canManage={canManage} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function MethodChoice({ onChoose }: { onChoose: (m: LibraryMethod) => void }) {
  const { t } = useT();
  return (
    <section aria-labelledby="lib-method-h" className="mt-8">
      <h2 id="lib-method-h" className="text-lg font-semibold">
        {t("lib.method.heading")}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="lib-methods">
        {(["trust", "beskt"] as const).map((m) => (
          <div key={m} className={CARD} data-testid={`lib-method-${m}`}>
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="h-5 w-5 text-foreground" />
              <h3 className="text-xl font-semibold tracking-tight">
                {t(m === "trust" ? "lib.method.trust.title" : "lib.method.beskt.title")}
              </h3>
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t(m === "trust" ? "lib.method.trust.body" : "lib.method.beskt.body")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(m === "trust" ? "lib.method.trust.aim" : "lib.method.beskt.aim")}
            </p>
            <Button
              type="button"
              className="mt-4 min-h-[44px]"
              onClick={() => onChoose(m)}
              data-testid={`lib-method-${m}-choose`}
            >
              {t(m === "trust" ? "lib.method.trust.choose" : "lib.method.beskt.choose")}
              <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-4 max-w-3xl text-xs text-muted-foreground">{t("lib.method.separate")}</p>
    </section>
  );
}

function RoleAndEnvironment({
  method,
  group,
  role,
  env,
  onChange,
}: {
  method: LibraryMethod;
  group?: RoleGroup;
  role?: RoleProfileKey;
  env?: EnvironmentKey;
  onChange: (next: { group?: RoleGroup; role?: RoleProfileKey; env?: EnvironmentKey }) => void;
}) {
  const { t } = useT();
  const roleNote = (key: RoleProfileKey): { ok: boolean; text: string } =>
    method === "trust"
      ? TRUST_CONTENT[key]
        ? { ok: true, text: t("lib.role.available") }
        : { ok: false, text: t("lib.role.trust.missing") }
      : { ok: true, text: t("lib.role.beskt.generic") };

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <fieldset data-testid="lib-groups">
        <legend className="text-lg font-semibold">{t("lib.group.heading")}</legend>
        <div className="mt-3 space-y-2">
          {ROLE_GROUPS.map((g) => (
            <label
              key={g}
              className={`${CHOICE} ${group === g ? "border-foreground" : "border-border"}`}
            >
              <input
                type="radio"
                name="lib-group"
                className="mt-1"
                checked={group === g}
                onChange={() => {
                  const only = profilesFor(g);
                  onChange({ group: g, role: only.length === 1 ? only[0]!.key : undefined, env });
                }}
                data-testid={`lib-group-${g}`}
              />
              <span>
                <span className="block font-medium">{t(GROUP_LABEL[g])}</span>
                <span className="block text-xs text-muted-foreground">{t(GROUP_HINT[g])}</span>
              </span>
            </label>
          ))}
        </div>

        {group ? (
          <div className="mt-5" data-testid="lib-roles">
            <p className="text-sm font-semibold">{t("lib.role.heading")}</p>
            <div className="mt-2 space-y-2">
              {profilesFor(group).map((p) => {
                const note = roleNote(p.key);
                return (
                  <label
                    key={p.key}
                    className={`${CHOICE} ${role === p.key ? "border-foreground" : "border-border"}`}
                  >
                    <input
                      type="radio"
                      name="lib-role"
                      className="mt-1"
                      checked={role === p.key}
                      onChange={() => onChange({ group, role: p.key, env })}
                      data-testid={`lib-role-${p.key}`}
                    />
                    <span>
                      <span className="block font-medium">{t(ROLE_LABEL[p.key])}</span>
                      <span
                        className={`block text-xs ${note.ok ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}`}
                        data-testid={`lib-role-${p.key}-note`}
                      >
                        {note.text}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset data-testid="lib-environments">
        <legend className="text-lg font-semibold">{t("lib.env.heading")}</legend>
        <div className="mt-3 space-y-2">
          {ENVIRONMENTS.map((e) => {
            const available = ENVIRONMENTS_WITH_CONTENT.includes(e);
            return (
              <label
                key={e}
                className={`${CHOICE} ${env === e ? "border-foreground" : "border-border"} ${available ? "" : "cursor-not-allowed opacity-70"}`}
              >
                <input
                  type="radio"
                  name="lib-env"
                  className="mt-1"
                  checked={env === e}
                  disabled={!available}
                  onChange={() => onChange({ group, role, env: e })}
                  data-testid={`lib-env-${e}`}
                />
                <span>
                  <span className="block font-medium">{t(ENV_LABEL[e])}</span>
                  <span className="block text-xs text-muted-foreground">
                    {available ? t("lib.env.generalNote") : t("lib.env.none")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("lib.env.noScope")}</p>
      </fieldset>
    </div>
  );
}

function statusKey(label: string): TranslationKey {
  if (label === "content_validated") return "lib.status.content_validated";
  if (label === "published") return "lib.status.published";
  if (label === "open_pilot") return "lib.status.open_pilot";
  if (label === "internal_test") return "lib.status.internal_test";
  return "lib.status.pilot_hypothesis";
}

function SetupPanel({
  employerId,
  employerSlug,
  method,
  group,
  role,
  env,
  canAssign,
}: {
  employerId: string;
  employerSlug: string;
  method: LibraryMethod;
  group: RoleGroup;
  role: RoleProfileKey;
  env: EnvironmentKey;
  canAssign: boolean;
}) {
  const { t, lang } = useT();
  const packsFn = useServerFn(listStartableInterviewPacks);
  const libraryFn = useServerFn(listContentLibrary);
  const besktFn = useServerFn(listAssignableBesktMethods);
  const standingFn = useServerFn(getMyBesktStanding);
  const appsFn = useServerFn(listApplicationsForEmployer);
  const recordFn = useServerFn(recordBesktSetup);

  const packs = useQuery({
    queryKey: ["ii", "packs", employerId],
    queryFn: () => packsFn({ data: { employerId } }),
    enabled: method === "trust",
    retry: false,
  });
  const library = useQuery({
    queryKey: ["academy", "content-library", employerId],
    queryFn: () => libraryFn({ data: { employerId } }),
    enabled: method === "trust",
    retry: false,
  });
  const beskt = useQuery({
    queryKey: ["beskt", "assignable-methods", employerId],
    queryFn: () => besktFn({ data: { employerId } }),
    enabled: method === "beskt",
    retry: false,
  });
  const standing = useQuery({
    queryKey: ["beskt", "standing", employerId],
    queryFn: () => standingFn({ data: { employerId } }),
    enabled: method === "beskt",
    retry: false,
  });
  const apps = useQuery({
    queryKey: ["beskt", "start", "applications", employerId],
    queryFn: () => appsFn({ data: { employerId } }),
    enabled: method === "trust",
    retry: false,
  });
  const [applicationId, setApplicationId] = useState("");
  const [startOpen, setStartOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loading = method === "trust" ? packs.isPending || library.isPending : beskt.isPending;
  if (loading) {
    return (
      <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {t("lib.loading")}
      </p>
    );
  }

  const live: LiveContent = {
    guides: packs.isError
      ? null
      : (packs.data?.packs ?? []).map((p) => ({
          packVersionId: p.packVersionId,
          packSlug: p.packSlug,
          name: p.name,
          nameEn: p.nameEn,
          versionNumber: p.versionNumber,
          contentStatus: p.contentStatus,
          validationLabel: p.validationLabel,
        })),
    assessments: library.isError
      ? null
      : (library.data ?? [])
          .filter((e) => e.libraryKind !== "training")
          .map((e) => ({
            slug: e.slug,
            nameSv: e.nameSv,
            nameEn: e.nameEn,
            assignable: e.assignable,
            minutesMin: e.minutesMin,
            minutesMax: e.minutesMax,
            itemCount: e.itemCount,
            moduleCount: e.moduleCount,
            contentStatus: e.contentStatus,
            validationStatus: e.validationStatus,
            versionNumber: e.versionNumber,
            competenciesSv: e.competenciesSv,
            competenciesEn: e.competenciesEn,
            doesNotMeasureSv: e.doesNotMeasureSv,
            doesNotMeasureEn: e.doesNotMeasureEn,
          })),
    beskt: beskt.isError
      ? null
      : (beskt.data ?? []).map((m) => ({
          methodVersionId: m.methodVersionId,
          mode: m.mode,
          versionNumber: m.versionNumber,
          validationLabel: m.validationLabel,
          contentStatus: m.contentStatus,
          availability: m.availability,
          nameSv: m.nameSv,
          nameEn: m.nameEn,
        })),
  };
  const setup: ResolvedSetup = resolveSetup(method, group, role, env, live);
  const guideName = setup.guide
    ? ((lang === "en" ? setup.guide.nameEn : null) ?? setup.guide.name)
    : null;
  const testName = setup.assessment
    ? lang === "en"
      ? setup.assessment.nameEn
      : setup.assessment.nameSv
    : null;

  const rows: Array<[TranslationKey, React.ReactNode, string]> = [
    [
      "lib.setup.candidate",
      method === "trust"
        ? testName
          ? `${t("lib.setup.trust.candidate").replace("{name}", testName)} (${t("lib.setup.optional")})`
          : t("lib.setup.trust.candidateNone")
        : t("lib.setup.beskt.candidate"),
      "candidate",
    ],
    [
      "lib.setup.interview",
      method === "trust"
        ? t("lib.setup.trust.interview").replace("{name}", guideName ?? "—")
        : t("lib.setup.beskt.interview"),
      "interview",
    ],
    [
      "lib.setup.report",
      t(method === "trust" ? "lib.setup.trust.report" : "lib.setup.beskt.report"),
      "report",
    ],
    [
      "lib.setup.time",
      method === "trust"
        ? [
            setup.assessment?.minutesMin && setup.assessment.minutesMax
              ? t("lib.setup.minutes")
                  .replace("{min}", String(setup.assessment.minutesMin))
                  .replace("{max}", String(setup.assessment.minutesMax))
              : null,
            t("lib.setup.timeUnset"),
          ]
            .filter(Boolean)
            .join(" ")
        : t("lib.setup.timeUnsetAll"),
      "time",
    ],
  ];

  return (
    <section
      aria-labelledby="lib-setup-h"
      className={`${CARD} mt-10`}
      data-testid="lib-setup"
      data-startable={setup.startable ? "true" : "false"}
    >
      <h2 id="lib-setup-h" className="text-lg font-semibold">
        {t("lib.setup.heading")}
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">{t("lib.setup.method")}</dt>
          <dd className="font-medium">{method === "trust" ? "TRUST" : "BESKT"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("lib.setup.role")}</dt>
          <dd className="font-medium" data-testid="lib-setup-role">
            {t(ROLE_LABEL[role])}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("lib.setup.environment")}</dt>
          <dd className="font-medium" data-testid="lib-setup-env">
            {t(ENV_LABEL[env])}
          </dd>
          <dd className="text-xs text-muted-foreground">{t("lib.env.generalNote")}</dd>
        </div>
      </dl>

      <dl className="mt-5 space-y-3 text-sm">
        {rows.map(([label, value, id]) => (
          <div key={id} className="grid gap-1 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium text-foreground">{t(label)}</dt>
            <dd className="text-muted-foreground" data-testid={`lib-setup-${id}`}>
              {value}
            </dd>
          </div>
        ))}
        <div className="grid gap-1 sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium text-foreground">{t("lib.setup.status")}</dt>
          <dd data-testid="lib-setup-status">
            <ul className="flex flex-wrap gap-2">
              {method === "trust" && setup.guide ? (
                <li>
                  <Badge variant="outline" className="font-normal">
                    {t("lib.setup.version")
                      .replace("{name}", guideName ?? "—")
                      .replace("{n}", String(setup.guide.versionNumber))}{" "}
                    · {t(statusKey(setup.guide.validationLabel))}
                  </Badge>
                </li>
              ) : null}
              {method === "trust" && setup.assessment ? (
                <li>
                  <Badge variant="outline" className="font-normal">
                    {t("lib.setup.version")
                      .replace("{name}", testName ?? "—")
                      .replace("{n}", String(setup.assessment.versionNumber))}{" "}
                    ·{" "}
                    {t(
                      statusKey(
                        setup.assessment.validationStatus === "validated"
                          ? "content_validated"
                          : "pilot_hypothesis",
                      ),
                    )}
                  </Badge>
                </li>
              ) : null}
              {method === "beskt"
                ? setup.besktVersions.map((v) => (
                    <li key={v.methodVersionId}>
                      <Badge variant="outline" className="font-normal">
                        {t("lib.setup.version")
                          .replace("{name}", (lang === "en" ? v.nameEn : v.nameSv) ?? "BESKT")
                          .replace("{n}", String(v.versionNumber))}{" "}
                        · {t(statusKey(v.availability ?? v.validationLabel))}
                      </Badge>
                    </li>
                  ))
                : null}
            </ul>
          </dd>
        </div>
      </dl>

      {setup.assessment ? (
        <details
          className="mt-5 rounded-lg border border-border px-4 py-3 text-sm"
          data-testid="lib-test-detail"
        >
          <summary className="min-h-[44px] cursor-pointer font-medium">
            {t("lib.preview.test")}
          </summary>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-foreground">{t("lib.test.measures")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {(lang === "en"
                  ? setup.assessment.competenciesEn
                  : setup.assessment.competenciesSv
                ).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{t("lib.test.notMeasures")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {(lang === "en"
                  ? setup.assessment.doesNotMeasureEn
                  : setup.assessment.doesNotMeasureSv
                ).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("lib.test.size")
              .replace("{modules}", String(setup.assessment.moduleCount))
              .replace("{items}", String(setup.assessment.itemCount))}
          </p>
        </details>
      ) : null}

      {!setup.startable ? (
        <Alert className="mt-5" data-testid="lib-setup-blocked">
          <Info aria-hidden="true" className="h-4 w-4" />
          <AlertTitle>{t("lib.setup.notStartable")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {setup.blockers.map((b) => (
                <li key={b} data-testid={`lib-blocker-${b}`}>
                  {t(`lib.blocker.${b}` as TranslationKey)}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : method === "trust" ? (
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-72">
            <label htmlFor="lib-application" className="text-sm font-medium">
              {t("lib.start.application")}
            </label>
            <select
              id="lib-application"
              className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            >
              <option value="">{t("lib.start.standalone")}</option>
              {(apps.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {(lang === "sv" ? a.jobTitleSv : (a.jobTitleEn ?? a.jobTitleSv)) ?? a.id} —{" "}
                  {a.applicantDisplayName ?? "—"}
                </option>
              ))}
            </select>
          </div>
          <Button asChild className="min-h-[44px]" data-testid="lib-start-trust">
            <Link
              to="/employer/$employerSlug/interview-intelligence/new"
              params={{ employerSlug }}
              search={{
                applicationId: applicationId || undefined,
                jobId: undefined,
                pack: setup.guide!.packVersionId,
                method: "trust",
                group,
                role,
                env,
              }}
            >
              {t("lib.start.trust")}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            className="min-h-[44px]"
            onClick={() => setStartOpen(true)}
            disabled={!canAssign}
            data-testid="lib-start-beskt"
          >
            {t("lib.start.beskt")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setPreviewOpen(true)}
            data-testid="lib-preview-beskt"
          >
            {t("lib.preview.beskt")}
          </Button>
          {startOpen ? (
            <BesktStartDialog
              open={startOpen}
              onOpenChange={setStartOpen}
              employerId={employerId}
              employerSlug={employerSlug}
              methods={beskt.data ?? []}
              isSecurityOfficer={standing.data?.isSecurityOfficer ?? false}
              onStarted={async (assignmentId) => {
                await recordFn({
                  data: {
                    employerId,
                    besktAssignmentId: assignmentId,
                    method: "beskt",
                    roleGroup: group,
                    roleProfile: role,
                    environment: env,
                  },
                });
              }}
            />
          ) : null}
          {previewOpen ? (
            <BesktPreviewDialog
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              employerId={employerId}
              methods={beskt.data ?? []}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
