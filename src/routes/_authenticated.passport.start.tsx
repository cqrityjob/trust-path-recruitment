import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { useT } from "@/i18n/context";
import { ensureFirstRunPassport } from "@/lib/security-passport/first-run.functions";
import { savePassportBasics } from "@/lib/security-passport/passport.functions";
import { setMyCurrentProfession } from "@/lib/security-career-profile/profile.functions";
import {
  listCurrentProfessionOptions,
  type CurrentProfessionOption,
} from "@/lib/security-career-profile/profession-options";
import { invalidatePassportAndCareer } from "@/lib/security-passport/refresh";
import {
  readIndiaSetup,
  saveCurrentLocation,
  saveJobPreferences,
  type IndiaSetupState,
} from "@/lib/india-entry/setup.functions";
import { deriveSetupStep, stepNumber, type SetupStep } from "@/lib/india-entry/setup-state";
import {
  DESTINATIONS,
  DESTINATION_LABEL_KEY,
  RELOCATION_INTEREST,
  residenceOptions,
  type Destination,
  type RelocationInterest,
} from "@/lib/india-entry/destinations";
import { indiaT, type IndiaCopyKey, type IndiaLang } from "@/lib/india-entry/copy";
import { trackFunnelOnce } from "@/lib/india-entry/analytics";
import { DestinationChecklist } from "@/components/india-entry/DestinationChecklist";

/** ── THE SHORT, RESUMABLE SETUP ───────────────────────────────────────
 *
 *  Four steps after an account exists, each saved by the writer that already
 *  owns the fact:
 *
 *    1 name + current occupation  savePassportBasics / setMyCurrentProfession
 *    2 where you live              saveCurrentLocation   (the Profile)
 *    3 where you'd like to work    saveJobPreferences    (optional)
 *    4 first credential            the existing catalogue form, or later
 *
 *  The step to open is DERIVED from those rows (setup-state.ts), so leaving
 *  and coming back lands on the first unanswered question, and an answer given
 *  elsewhere in the product counts here. Nothing is a prerequisite for the
 *  Passport itself: it is created (empty) on arrival, with no CV, document,
 *  review or HAYAT check.
 *
 *  `market=IN` PRESELECTS India as the country of residence and says so. It
 *  is editable, and it infers nothing — no nationality, no work permission, no
 *  work country, no credential territory and no market access.
 */

type StepParam = "name" | "location" | "destinations" | "first";

export const Route = createFileRoute("/_authenticated/passport/start")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { market?: "IN"; step?: StepParam } => ({
    market: search.market === "IN" ? "IN" : undefined,
    step:
      search.step === "name" ||
      search.step === "location" ||
      search.step === "destinations" ||
      search.step === "first"
        ? search.step
        : undefined,
  }),
  component: IndiaSetupRoute,
});

function IndiaSetupRoute() {
  const search = Route.useSearch();
  const { lang: siteLang } = useT();
  const lang: IndiaLang = siteLang === "sv" ? "sv" : "en";
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const qc = useQueryClient();

  const read = useServerFn(readIndiaSetup);
  const ensure = useServerFn(ensureFirstRunPassport);
  const [state, setState] = useState<IndiaSetupState | null>(null);
  const [phase, setPhase] = useState<"loading" | "creating" | "ready" | "error" | "createError">(
    "loading",
  );
  const [step, setStep] = useState<SetupStep | null>(null);
  const [attempt, setAttempt] = useState(0);
  const creating = useRef(false);

  const reload = useCallback(async () => {
    const next = await read();
    setState(next);
    return next;
  }, [read]);

  useEffect(() => {
    let active = true;
    setPhase("loading");
    void (async () => {
      try {
        let current = await read();
        if (!active) return;
        // The Passport is created on arrival: an EMPTY Passport, and nothing
        // else. Idempotent and concurrency-safe on the server.
        if (!current.passportExists && !creating.current) {
          creating.current = true;
          setPhase("creating");
          try {
            await ensure({ data: undefined });
            await invalidatePassportAndCareer(qc);
            current = await read();
          } catch {
            if (active) setPhase("createError");
            return;
          } finally {
            creating.current = false;
          }
        }
        if (!active) return;
        if (search.market === "IN") trackFunnelOnce("india_registration_completed");
        setState(current);
        setStep(search.step ?? deriveSetupStep(current));
        setPhase("ready");
      } catch {
        if (active) setPhase("error");
      }
    })();
    return () => {
      active = false;
    };
    // search.step is read once, on arrival; navigating within the setup is local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, ensure, qc, attempt]);

  const goNext = async () => {
    const next = await reload();
    setStep(deriveSetupStep(next));
    requestAnimationFrame(() => document.getElementById("setup-heading")?.focus());
  };

  if (phase === "loading")
    return (
      <p role="status" className="mx-auto max-w-2xl py-10 text-sm text-muted-foreground">
        {t("setup.loading")}
      </p>
    );
  if (phase === "creating")
    return (
      <p role="status" className="mx-auto max-w-2xl py-10 text-sm text-muted-foreground">
        {t("setup.passport.creating")}
      </p>
    );
  if (phase === "error" || phase === "createError" || !state || !step)
    return (
      <div role="alert" className="mx-auto max-w-2xl space-y-3 py-10">
        <p className="text-sm text-foreground">
          {phase === "createError" ? t("setup.passport.failed") : t("setup.loadError")}
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium"
        >
          {t("setup.retry")}
        </button>
      </div>
    );

  const n = stepNumber(step);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6" data-india-setup data-setup-step={step}>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("setup.step")} {n} {t("setup.of")} 4
        </p>
        <h1
          id="setup-heading"
          tabIndex={-1}
          className="mt-2 text-2xl font-semibold tracking-tight text-foreground outline-none"
        >
          {t("setup.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("setup.lead")}</p>
        <ol className="mt-4 grid grid-cols-4 gap-2" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className={`h-1.5 rounded-full ${i <= n ? "bg-accent" : "bg-border"}`} />
          ))}
        </ol>
      </header>

      {step === "name" && <NameStep lang={lang} state={state} onDone={() => void goNext()} />}
      {step === "location" && (
        <LocationStep
          lang={lang}
          state={state}
          preselect={search.market === "IN" ? "IN" : null}
          onBack={() => setStep("name")}
          onDone={() => void goNext()}
        />
      )}
      {step === "destinations" && (
        <DestinationsStep
          lang={lang}
          state={state}
          onBack={() => setStep("location")}
          onDone={() => void goNext()}
        />
      )}
      {(step === "first" || step === "done") && (
        <FirstCredentialStep lang={lang} state={state} onBack={() => setStep("destinations")} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const input =
  "mt-2 block min-h-12 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const ghostBtn =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium";

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function SaveRow({
  lang,
  busy,
  error,
  onBack,
  extra,
}: {
  lang: IndiaLang;
  busy: boolean;
  error: boolean;
  onBack?: () => void;
  extra?: React.ReactNode;
}) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.error")}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          {onBack && (
            <button type="button" className={ghostBtn} onClick={onBack} disabled={busy}>
              {t("setup.back")}
            </button>
          )}
          {extra}
        </div>
        <button type="submit" className={primaryBtn} disabled={busy} aria-busy={busy}>
          {busy ? t("setup.saving") : t("setup.continue")}
          {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <p className="text-center text-sm sm:text-right">
        <Link to="/passport" className="inline-flex min-h-11 items-center text-accent underline">
          {t("setup.later")}
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Name and current occupation                                     */
/* ------------------------------------------------------------------ */

const OTHER = "__other__";

function NameStep({
  lang,
  state,
  onDone,
}: {
  lang: IndiaLang;
  state: IndiaSetupState;
  onDone: () => void;
}) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const saveBasics = useServerFn(savePassportBasics);
  const saveProfession = useServerFn(setMyCurrentProfession);
  const [name, setName] = useState(state.displayName ?? "");
  const [profession, setProfession] = useState(
    state.professionOther != null ? OTHER : (state.professionSlug ?? ""),
  );
  const [other, setOther] = useState(state.professionOther ?? "");
  const [options, setOptions] = useState<CurrentProfessionOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let active = true;
    listCurrentProfessionOptions()
      .then((o) => active && setOptions(o))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const occupationGiven = profession === OTHER ? other.trim().length > 0 : profession !== "";
    if (trimmed.length < 2 || !occupationGiven) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    setError(false);
    try {
      await saveBasics({ data: { displayName: trimmed } });
      await saveProfession({
        data:
          profession === OTHER
            ? { currentProfessionSlug: null, currentProfessionOther: other.trim() }
            : { currentProfessionSlug: profession, currentProfessionOther: null },
      });
      onDone();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <StepCard title={t("setup.name.title")}>
        <label className="block text-sm font-medium text-foreground">
          {t("setup.name.name")}
          <input
            className={input}
            data-field="display-name"
            value={name}
            maxLength={120}
            autoComplete="name"
            required
            aria-invalid={invalid && name.trim().length < 2}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {t("setup.name.nameHelp")}
          </span>
        </label>
        <label className="block text-sm font-medium text-foreground">
          {t("setup.name.occupation")}
          <select
            className={input}
            data-field="occupation"
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            aria-invalid={invalid && profession === ""}
          >
            <option value="">{t("setup.name.occupationPlaceholder")}</option>
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {lang === "sv" ? o.title_sv : o.title_en}
              </option>
            ))}
            <option value={OTHER}>{t("setup.name.occupationOther")}</option>
          </select>
        </label>
        {profession === OTHER && (
          <label className="block text-sm font-medium text-foreground">
            {t("setup.name.occupationOther")}
            <input
              className={input}
              data-field="occupation-other"
              value={other}
              maxLength={120}
              placeholder={t("setup.name.occupationOtherPlaceholder")}
              onChange={(e) => setOther(e.target.value)}
            />
          </label>
        )}
        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.name.required")}
          </p>
        )}
        <SaveRow lang={lang} busy={busy} error={error} />
      </StepCard>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Where you live                                                  */
/* ------------------------------------------------------------------ */

function LocationStep({
  lang,
  state,
  preselect,
  onBack,
  onDone,
}: {
  lang: IndiaLang;
  state: IndiaSetupState;
  preselect: "IN" | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const save = useServerFn(saveCurrentLocation);
  const prefilled = !state.location && preselect !== null;
  const [country, setCountry] = useState(state.location?.countryCode ?? preselect ?? "");
  const [locality, setLocality] = useState(state.location?.locality ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const options = residenceOptions(lang);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!country) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    setError(false);
    try {
      await save({ data: { countryCode: country, locality: locality.trim() || undefined } });
      onDone();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <StepCard title={t("setup.location.title")}>
        <label className="block text-sm font-medium text-foreground">
          {t("setup.location.country")}
          <select
            className={input}
            data-field="residence-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-invalid={invalid}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
          {prefilled && country === preselect && (
            <span className="mt-1 block text-xs font-normal text-muted-foreground" data-prefilled>
              {t("setup.location.prefilled")}
            </span>
          )}
        </label>
        <label className="block text-sm font-medium text-foreground">
          {t("setup.location.locality")}
          <input
            className={input}
            data-field="residence-locality"
            value={locality}
            maxLength={80}
            autoComplete="address-level2"
            onChange={(e) => setLocality(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("setup.location.help")}</p>
        {invalid && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.location.required")}
          </p>
        )}
        <SaveRow lang={lang} busy={busy} error={error} onBack={onBack} />
      </StepCard>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Where you'd like to work (optional)                             */
/* ------------------------------------------------------------------ */

function DestinationsStep({
  lang,
  state,
  onBack,
  onDone,
}: {
  lang: IndiaLang;
  state: IndiaSetupState;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  const save = useServerFn(saveJobPreferences);
  const [chosen, setChosen] = useState<Destination[]>(
    (state.preferences?.destinations ?? []).filter((d): d is Destination =>
      (DESTINATIONS as readonly string[]).includes(d),
    ),
  );
  const [interest, setInterest] = useState<RelocationInterest | "">(
    (state.preferences?.relocationInterest as RelocationInterest | null) ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const persist = async (destinations: Destination[], relocation: RelocationInterest | "") => {
    setBusy(true);
    setError(false);
    try {
      await save({ data: { destinations, relocationInterest: relocation || null } });
      onDone();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (d: Destination) =>
    setChosen((current) =>
      current.includes(d) ? current.filter((x) => x !== d) : [...current, d],
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void persist(chosen, interest);
      }}
      noValidate
    >
      <StepCard title={t("setup.dest.title")}>
        <p className="text-sm text-muted-foreground">{t("setup.dest.help")}</p>
        <fieldset>
          <legend className="sr-only">{t("setup.dest.title")}</legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {DESTINATIONS.map((d) => (
              <li key={d}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm">
                  <input
                    type="checkbox"
                    data-destination-option={d}
                    className="h-4 w-4"
                    checked={chosen.includes(d)}
                    onChange={() => toggle(d)}
                  />
                  {t(DESTINATION_LABEL_KEY[d])}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            {t("setup.dest.interest")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["", ...RELOCATION_INTEREST] as const).map((value) => (
              <label
                key={value || "none"}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm"
              >
                <input
                  type="radio"
                  name="relocation"
                  className="h-4 w-4"
                  checked={interest === value}
                  onChange={() => setInterest(value)}
                />
                {t(
                  value
                    ? (`setup.dest.interest.${value}` as IndiaCopyKey)
                    : "setup.dest.interest.none",
                )}
              </label>
            ))}
          </div>
        </fieldset>
        <SaveRow
          lang={lang}
          busy={busy}
          error={error}
          onBack={onBack}
          extra={
            <button
              type="button"
              className={ghostBtn}
              disabled={busy}
              // Skipping is an answer: an empty list, so the question is not
              // asked again. Anything already chosen elsewhere is kept.
              onClick={() =>
                void persist(
                  state.preferences ? (state.preferences.destinations as Destination[]) : [],
                  (state.preferences?.relocationInterest as RelocationInterest | null) ?? "",
                )
              }
            >
              {t("setup.skip")}
            </button>
          }
        />
      </StepCard>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* 4 · The first credential, or later                                  */
/* ------------------------------------------------------------------ */

function FirstCredentialStep({
  lang,
  state,
  onBack,
}: {
  lang: IndiaLang;
  state: IndiaSetupState;
  onBack: () => void;
}) {
  const t = (key: IndiaCopyKey) => indiaT(key, lang);
  // The catalogue opens on India's qualifications only when the holder LIVES
  // in India; it is a starting filter, and every other credential is a click away.
  const country = state.location?.countryCode === "IN" ? "IN" : undefined;
  const hasCredential = state.credentials.length > 0;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("setup.first.title")}</h2>
        {hasCredential ? (
          <p className="mt-2 flex items-start gap-2 text-sm text-foreground" data-setup-complete>
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            {t("setup.first.done")}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("setup.first.body")}</p>
        )}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/passport/credentials/new"
            search={country ? { country } : {}}
            className={primaryBtn}
            data-setup-add-credential
          >
            {t("setup.first.add")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to="/passport" className={ghostBtn}>
            {t("setup.first.skip")}
          </Link>
          <button type="button" className={ghostBtn} onClick={onBack}>
            {t("setup.back")}
          </button>
        </div>
      </section>
      {hasCredential && (
        <DestinationChecklist
          lang={lang}
          destinations={state.preferences?.destinations ?? []}
          credentials={state.credentials}
        />
      )}
    </div>
  );
}
