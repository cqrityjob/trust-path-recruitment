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
      key={generation}
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
  return (
    <section data-testid="requirement-profile" className="mt-5 rounded-lg border border-border p-4">
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
      <p className="mt-2 text-sm text-muted-foreground">
        {sv
          ? "Ändrade regler får en ny version och kräver ny aktuell granskning. Tidigare beslut och rapporter behåller sin historik. Meriter kompenserar inte skallkrav."
          : "Changed rules receive a new version and require current review. Earlier decisions and reports retain their history. Merits do not compensate for mandatory requirements."}
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
            </label>
            {rules.map((rule, index) => {
              const req = base.requirements.find((r) => r.id === rule.requirementId);
              return (
                <fieldset
                  key={rule.requirementId}
                  className="rounded border border-border p-3"
                  data-requirement-id={rule.requirementId}
                >
                  <legend className="px-1 font-semibold">
                    {label(req?.labelSv ?? null, req?.labelEn ?? null)}
                  </legend>
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
                  <div className="mt-2 text-sm">
                    {sv
                      ? "Tillåtna underlag för detta krav"
                      : "Accepted evidence for this requirement"}
                  </div>
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
                  <label className="mt-2 block text-sm">
                    {sv ? "Kopplad ansökningsfråga" : "Linked application question"}
                    <select
                      required={rule.decisionRule === "boolean_yes"}
                      value={rule.questionId ?? ""}
                      onChange={(e) => patch(index, { questionId: e.target.value || null })}
                      className={controlClass}
                    >
                      <option value="">{sv ? "Ingen vald" : "None selected"}</option>
                      {base.questions
                        .filter(
                          (q) =>
                            q.requirementId === rule.requirementId &&
                            (rule.decisionRule !== "boolean_yes" || q.answerKind === "yes_no"),
                        )
                        .map((q) => (
                          <option key={q.id} value={q.id}>
                            {label(q.promptSv, q.promptEn)}
                          </option>
                        ))}
                    </select>
                  </label>
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
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {sv ? "Befintligt krav-ID" : "Existing requirement ID"}: {rule.requirementId}
                  </p>
                </fieldset>
              );
            })}
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
