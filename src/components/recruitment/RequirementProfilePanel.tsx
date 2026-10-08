import { useState, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import {
  getRequirementProfile,
  confirmRequirementProfile,
} from "@/lib/recruitment/requirement-intelligence.functions";
import {
  SOURCE_KINDS,
  DECISION_RULES,
  type RequirementProfile,
  type RequirementRuleInput,
} from "@/lib/recruitment/requirement-intelligence";
import { ManualControlPointIntent } from "@/lib/interview-intelligence/manual-control-point-intent";

import { sourceLabels, controlClass } from "@/lib/recruitment/requirement-presentation";
const ruleLabels = {
  sv: {
    boolean_yes: "Ja/nej enligt kopplat ansökningssvar",
    valid_at_start: "Kontrollerat dokument giltigt vid referensdatum",
    human_confirmed: "Mänsklig kontroll enligt dokumenterad regel",
  },
  en: {
    boolean_yes: "Yes/no from the linked application answer",
    valid_at_start: "Checked document valid at the reference date",
    human_confirmed: "Human check against a documented rule",
  },
} as const;

export function RequirementProfilePanel({
  employerId,
  jobId,
}: {
  employerId: string;
  jobId: string;
}) {
  const { lang } = useT();
  const read = useServerFn(getRequirementProfile);
  const query = useQuery({
    queryKey: ["employer", employerId, "requirement-profile", jobId],
    queryFn: () => read({ data: { employerId, jobId } }),
  });
  const [generation, setGeneration] = useState(0);
  if (query.isPending)
    return (
      <p className="mt-4">{lang === "sv" ? "Läser kravprofil…" : "Loading requirement profile…"}</p>
    );
  if (query.isError)
    return (
      <div role="alert" className="mt-4">
        {lang === "sv"
          ? "Kravprofilen kunde inte läsas."
          : "Requirement profile could not be loaded."}
        <button type="button" className="ml-2 underline" onClick={() => void query.refetch()}>
          {lang === "sv" ? "Försök igen" : "Retry"}
        </button>
      </div>
    );
  return (
    <RequirementProfileEditor
      key={`${jobId}:${generation}`}
      employerId={employerId}
      profile={query.data}
      onReload={async () => {
        const result = await query.refetch();
        if (!result.error) setGeneration((n) => n + 1);
      }}
    />
  );
}

export function RequirementProfileEditor({
  employerId,
  profile,
  onReload,
}: {
  employerId: string;
  profile: RequirementProfile;
  onReload: () => Promise<void>;
}) {
  const { lang } = useT();
  const sv = lang === "sv";
  const [base] = useState(profile);
  const [rules, setRules] = useState<RequirementRuleInput[]>(() =>
    base.rules.length
      ? base.rules.map((r) => ({ ...r }))
      : base.requirements.map((r) => ({
          requirementId: r.id,
          kind: r.kind,
          acceptedSources: [],
          decisionRule: "human_confirmed",
          questionId: null,
          instructionSv: "",
          instructionEn: null,
        })),
  );
  const [startDate, setStartDate] = useState(base.startDate ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const intent = useRef(new ManualControlPointIntent());
  const qc = useQueryClient();
  const save = useServerFn(confirmRequirementProfile);
  const stale = profile.version !== base.version;
  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        employerId,
        jobId: base.jobId,
        expectedVersion: base.version,
        startDate: startDate || null,
        rules,
      };
      return save({ data: { ...payload, operationId: intent.current.operationIdFor(payload) } });
    },
    onSuccess: async () => {
      intent.current.completed();
      await qc.invalidateQueries({ queryKey: ["employer", employerId] });
      await onReload();
    },
  });
  const label = (svText: string | null, enText: string | null) =>
    (sv ? svText || enText : enText || svText) ?? "";
  const patch = (index: number, value: Partial<RequirementRuleInput>) => {
    setAcknowledged(false);
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...value } : rule)));
  };
  const ruleHelp = {
    sv: {
      boolean_yes:
        "Kravet räknas som uppfyllt när kandidaten svarat Ja på den kopplade ansökningsfrågan. Svaret är kandidatens egen uppgift.",
      valid_at_start:
        "En person kontrollerar att dokumentet är giltigt på referensdatumet nedan; utgångna dokument ger inte uppfyllt.",
      human_confirmed:
        "En person bekräftar kravet enligt instruktionen nedan. Utan bekräftelse står kravet som behöver klarläggas.",
    },
    en: {
      boolean_yes:
        "The requirement counts as met when the candidate answered Yes to the linked application question. The answer is the candidate's own statement.",
      valid_at_start:
        "A person checks that the document is valid on the reference date below; an expired document does not count as met.",
      human_confirmed:
        "A person confirms the requirement according to the instruction below. Without that confirmation the requirement reads as needing clarification.",
    },
  } as const;
  const stepHeading = (n: number, text: string) => (
    <h4 className="mt-3 text-sm font-semibold">
      <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-xs text-accent">
        {n}
      </span>
      {text}
    </h4>
  );
  return (
    <section
      data-testid="requirement-profile"
      data-job-id={base.jobId}
      className="mt-5 rounded-lg border border-border p-4"
    >
      <h3 className="text-lg font-semibold">
        {sv
          ? "Beslutad kravprofil och accepterat underlag"
          : "Decided requirement profile and accepted evidence"}
      </h3>
      <p className="mt-2 text-sm">
        {base.confirmedAt
          ? `${sv ? "Fastställd version" : "Confirmed version"} ${base.version}`
          : sv
            ? "Skallkrav inte fastställda. Annonstext och CV-närvaro ger inte grönt."
            : "Mandatory requirements not established. Advert text and CV presence do not make requirements met."}
      </p>
      {/* How the form reads: for each requirement, 1 what it is, 2 what
          counts as evidence, 3 how a person checks it; then 4 confirm the
          whole profile as a new version. The rules are the server's; this
          only puts them in the order a recruiter thinks in. */}
      <p className="mt-2 text-sm text-muted-foreground">
        {sv
          ? "För varje krav: 1 kravtyp, 2 godtagbart underlag, 3 kontrollinstruktion. Fastställ sedan hela profilen som en ny version (4). Ändrade regler får en ny version och kräver ny aktuell granskning. Tidigare beslut och rapporter behåller sin historik. Meriter kompenserar inte skallkrav."
          : "For each requirement: 1 the kind, 2 acceptable evidence, 3 the checking instruction. Then confirm the whole profile as a new version (4). Changed rules receive a new version and require current review. Earlier decisions and reports retain their history. Merits do not compensate for mandatory requirements."}
      </p>
      {stale && (
        <p role="alert" className="mt-3">
          {sv
            ? "Kravprofilen har ändrats. Ditt utkast finns kvar; läs in den sparade versionen innan du fastställer."
            : "The requirement profile has changed. Your draft is retained; load the stored version before confirming."}
        </p>
      )}
      <button
        type="button"
        onClick={() => void onReload()}
        disabled={mutation.isPending}
        className="mt-2 min-h-11 underline"
      >
        {sv ? "Läs in sparad kravprofil" : "Load stored requirement profile"}
      </button>
      {!base.canManage ? (
        <ul className="mt-3 space-y-3">
          {base.rules.map((rule) => (
            <li key={rule.requirementId}>
              <strong>{label(rule.labelSv, rule.labelEn)}</strong>
              <p>{label(rule.instructionSv, rule.instructionEn)}</p>
              <p className="text-xs">
                {rule.acceptedSources.map((kind) => sourceLabels[lang][kind]).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (acknowledged && !stale) mutation.mutate();
          }}
        >
          <fieldset disabled={mutation.isPending || stale} className="mt-4 space-y-4">
            <label className="block text-sm">
              {sv ? "Referensdatum / avsedd start" : "Reference date / intended start"}
              <input
                data-testid="profile-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setAcknowledged(false);
                }}
                className={controlClass}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {sv
                  ? "Den dag ett dokument ska vara giltigt för regeln ”giltigt vid referensdatum”. Krävs när något krav använder den regeln."
                  : 'The day a document must be valid for the rule "valid at the reference date". Required when any requirement uses that rule.'}
              </span>
            </label>
            {rules.map((rule, index) => {
              const req = base.requirements.find((r) => r.id === rule.requirementId);
              const questions = base.questions.filter(
                (q) =>
                  q.requirementId === rule.requirementId &&
                  (rule.decisionRule !== "boolean_yes" || q.answerKind === "yes_no"),
              );
              return (
                <fieldset
                  key={rule.requirementId}
                  className="rounded border border-border p-3"
                  data-requirement-id={rule.requirementId}
                >
                  <legend className="px-1 font-semibold">
                    {label(req?.labelSv ?? null, req?.labelEn ?? null)}
                  </legend>

                  {stepHeading(1, sv ? "Krav" : "Requirement")}
                  <label className="block text-sm">
                    {sv ? "Kravtyp" : "Requirement kind"}
                    <select
                      value={rule.kind}
                      onChange={(e) =>
                        patch(index, { kind: e.target.value as RequirementRuleInput["kind"] })
                      }
                      className={controlClass}
                    >
                      <option value="mandatory">{sv ? "Skallkrav" : "Mandatory"}</option>
                      <option value="desirable">{sv ? "Merit" : "Desirable"}</option>
                    </select>
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sv
                      ? "Skallkrav måste vara uppfyllda för grön kravstatus. En merit vägs in av en person och kompenserar aldrig ett skallkrav."
                      : "Mandatory requirements must be met for a green requirement status. A desirable one is weighed by a person and never compensates for a mandatory one."}
                  </p>

                  {stepHeading(2, sv ? "Godtagbart underlag" : "Acceptable evidence")}
                  <p className="text-xs text-muted-foreground">
                    {sv
                      ? "Minst ett. Bara underlag av dessa slag kan ge uppfyllt; annonstext, ett CV:s existens eller ett AI-förslag räknas inte."
                      : "At least one. Only evidence of these kinds can make the requirement met; advert text, the existence of a CV or an AI suggestion does not count."}
                  </p>
                  {SOURCE_KINDS.map((kind) => (
                    <label key={kind} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rule.acceptedSources.includes(kind)}
                        onChange={(e) =>
                          patch(index, {
                            acceptedSources: e.target.checked
                              ? [...rule.acceptedSources, kind]
                              : rule.acceptedSources.filter((k) => k !== kind),
                          })
                        }
                      />
                      {sourceLabels[lang][kind]}
                    </label>
                  ))}

                  {stepHeading(3, sv ? "Kontrollinstruktion" : "Checking instruction")}
                  <label className="block text-sm">
                    {sv ? "Beslutsregel" : "Decision rule"}
                    <select
                      value={rule.decisionRule}
                      onChange={(e) =>
                        patch(index, {
                          decisionRule: e.target.value as RequirementRuleInput["decisionRule"],
                        })
                      }
                      className={controlClass}
                    >
                      {DECISION_RULES.map((value) => (
                        <option key={value} value={value}>
                          {ruleLabels[lang][value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ruleHelp[lang][rule.decisionRule]}
                  </p>
                  <label className="mt-2 block text-sm">
                    {sv ? "Kopplad ansökningsfråga" : "Linked application question"}
                    {rule.decisionRule === "boolean_yes" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({sv ? "krävs för ja/nej-regeln" : "required by the yes/no rule"})
                      </span>
                    )}
                    <select
                      required={rule.decisionRule === "boolean_yes"}
                      value={rule.questionId ?? ""}
                      onChange={(e) => patch(index, { questionId: e.target.value || null })}
                      className={controlClass}
                    >
                      <option value="">{sv ? "Ingen vald" : "None selected"}</option>
                      {questions.map((q) => (
                        <option key={q.id} value={q.id}>
                          {label(q.promptSv, q.promptEn)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {rule.decisionRule === "boolean_yes" && questions.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {sv
                        ? "Annonsen har ingen ja/nej-fråga för detta krav. Lägg till en i annonsen eller välj en annan beslutsregel."
                        : "The advert has no yes/no question for this requirement. Add one to the advert or choose another decision rule."}
                    </p>
                  )}
                  <label className="mt-2 block text-sm">
                    {sv
                      ? "Regel och kontrollinstruktion (svenska)"
                      : "Rule and checking instruction (Swedish)"}
                    <textarea
                      required
                      maxLength={2000}
                      value={rule.instructionSv}
                      onChange={(e) => patch(index, { instructionSv: e.target.value })}
                      className={controlClass}
                    />
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sv
                      ? "Skriv vad granskaren ska kontrollera och mot vad, så att två personer kommer till samma svar. Visas för granskaren vid varje ansökan."
                      : "Write what the reviewer checks and against what, so two people reach the same answer. Shown to the reviewer on every application."}
                  </p>
                  <label className="mt-2 block text-sm">
                    {sv
                      ? "Regel och kontrollinstruktion (engelska)"
                      : "Rule and checking instruction (English)"}
                    <textarea
                      maxLength={2000}
                      value={rule.instructionEn ?? ""}
                      onChange={(e) => patch(index, { instructionEn: e.target.value || null })}
                      className={controlClass}
                    />
                  </label>
                  {/* The identifier is for support and audit, not for the
                      recruiter; it stays reachable but out of the way. */}
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      {sv ? "Tekniska detaljer" : "Technical details"}
                    </summary>
                    <p className="mt-1 break-all">
                      {sv ? "Befintligt krav-ID" : "Existing requirement ID"}: {rule.requirementId}
                    </p>
                  </details>
                </fieldset>
              );
            })}

            {stepHeading(4, sv ? "Fastställ" : "Confirm")}
            <p className="text-xs text-muted-foreground">
              {sv
                ? `Fastställandet skapar version ${base.version + 1} av kravprofilen. Redan granskade ansökningar behöver då granskas igen mot de nya reglerna; fastställda rapporter och tidigare beslut ändras inte.`
                : `Confirming creates version ${base.version + 1} of the requirement profile. Applications already reviewed then need a new review against the new rules; confirmed reports and earlier decisions do not change.`}
            </p>
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input
                data-testid="profile-confirm-ack"
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              {sv
                ? "Jag fastställer regler, tillåtna underlag och referensdatum för denna version."
                : "I confirm the rules, accepted evidence and reference date for this version."}
            </label>
            <button
              type="submit"
              disabled={
                !acknowledged ||
                rules.length === 0 ||
                rules.some((r) => r.acceptedSources.length === 0 || !r.instructionSv.trim()) ||
                (rules.some((r) => r.decisionRule === "valid_at_start") && !startDate)
              }
              className="min-h-11 rounded bg-accent px-4 text-accent-foreground"
            >
              {sv ? "Fastställ ny kravprofilversion" : "Confirm new requirement profile version"}
            </button>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {sv ? "Tekniska detaljer" : "Technical details"}
              </summary>
              <p className="mt-1 break-all">
                {sv ? "Rekryterings-ID" : "Recruitment ID"}: {base.jobId}
                {" · "}
                {sv ? "Profilversion" : "Profile version"}: {base.version}
              </p>
            </details>
          </fieldset>
          {mutation.isError && (
            <p role="alert" className="mt-3 text-sm">
              {sv
                ? "Kravprofilen kunde inte fastställas. Utkastet finns kvar."
                : "The requirement profile could not be confirmed. Your draft is retained."}{" "}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
