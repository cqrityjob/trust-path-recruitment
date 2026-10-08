import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import {
  getRequirementReview,
  saveRequirementReview,
  transferRequirementSources,
  prepareManualRequirementSource,
} from "@/lib/recruitment/requirement-intelligence.functions";
import type {
  RequirementReview,
  RequirementDecision,
  RequirementSourceChoice,
} from "@/lib/recruitment/requirement-intelligence";
import type { TeamMember } from "@/lib/recruitment/recruitment.functions";
import type { ApplicationInterviewCase } from "@/lib/interview-intelligence/runtime.functions";
import { ManualControlPointIntent } from "@/lib/interview-intelligence/manual-control-point-intent";
import { RequirementStatusBadge, ReviewStatusBadge, AnalysisStatusBadge } from "./RecruiterStatus";
import { controlClass, sourceLabels } from "@/lib/recruitment/requirement-presentation";

const sourceKey = (source: RequirementSourceChoice) =>
  JSON.stringify([source.kind, source.reference, source.version]);
import { decisionsFromReview } from "@/lib/recruitment/requirement-review-draft";

export type ReviewPanelProps = {
  employerId: string;
  employerSlug: string;
  applicationId: string;
  team: TeamMember[];
  cases: readonly ApplicationInterviewCase[];
  onOpenCv: () => Promise<void>;
};
export function RequirementReviewPanel(props: ReviewPanelProps) {
  const { lang } = useT();
  const read = useServerFn(getRequirementReview);
  const query = useQuery({
    queryKey: ["employer", props.employerId, "requirement-review", props.applicationId],
    queryFn: () =>
      read({ data: { employerId: props.employerId, applicationId: props.applicationId } }),
  });
  const [generation, setGeneration] = useState(0);
  if (query.isPending)
    return (
      <p className="mt-6">
        {lang === "sv" ? "Läser kravgranskning…" : "Loading requirement review…"}
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="mt-6">
        {lang === "sv"
          ? "Kravgranskningen kunde inte läsas."
          : "Requirement review could not be loaded."}
        <button
          type="button"
          className="ml-2 min-h-11 underline"
          onClick={() => void query.refetch()}
        >
          {lang === "sv" ? "Försök igen" : "Retry"}
        </button>
      </div>
    );
  return (
    <RequirementReviewEditor
      key={generation}
      {...props}
      review={query.data}
      onReload={async () => {
        const result = await query.refetch();
        if (!result.error) setGeneration((n) => n + 1);
      }}
    />
  );
}

export function RequirementReviewEditor({
  review,
  onReload,
  ...props
}: ReviewPanelProps & { review: RequirementReview; onReload: () => Promise<void> }) {
  const { lang } = useT();
  const sv = lang === "sv";
  const qc = useQueryClient();
  const save = useServerFn(saveRequirementReview);
  const transfer = useServerFn(transferRequirementSources);
  const prepareSource = useServerFn(prepareManualRequirementSource);
  // Refetches never replace a person's unsaved draft. Binding/profile/CAS changes
  // require an explicit reload, including changes in another browser tab.
  const [base] = useState(review);
  const [decisions, setDecisions] = useState(() => decisionsFromReview(base));
  const [nextAction, setNextAction] = useState(base.nextAction ?? "");
  const [responsibleUserId, setResponsibleUserId] = useState(base.responsibleUserId ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [caseId, setCaseId] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [externalLabel, setExternalLabel] = useState("");
  const [preparedSources, setPreparedSources] = useState<RequirementSourceChoice[]>([]);
  const saveIntent = useRef(new ManualControlPointIntent());
  const transferIntent = useRef(new ManualControlPointIntent());
  const stale =
    review.revision !== base.revision ||
    review.bindingToken !== base.bindingToken ||
    review.assignmentVersion !== base.assignmentVersion ||
    review.profile.profileId !== base.profile.profileId;
  const dirty =
    JSON.stringify(decisions) !== JSON.stringify(decisionsFromReview(base)) ||
    nextAction !== (base.nextAction ?? "") ||
    responsibleUserId !== (base.responsibleUserId ?? "");
  const requiresFollowUp =
    review.requirementStatus === "gray" ||
    base.criteria.some(
      (c, index) => c.kind === "mandatory" && decisions[index]?.state === "clarify",
    );
  const mutation = useMutation({
    mutationFn: (confirm: boolean) => {
      if (!base.profile.profileId) throw new Error("RI_PROFILE_NOT_ESTABLISHED");
      const payload = {
        employerId: props.employerId,
        applicationId: props.applicationId,
        profileId: base.profile.profileId,
        expectedRevision: base.revision,
        expectedAssignmentVersion: base.assignmentVersion,
        bindingToken: base.bindingToken,
        decisions,
        confirm,
        nextAction: nextAction.trim() || null,
        responsibleUserId: responsibleUserId || null,
      };
      return save({
        data: { ...payload, operationId: saveIntent.current.operationIdFor(payload) },
      });
    },
    onSuccess: async () => {
      saveIntent.current.completed();
      await qc.invalidateQueries({ queryKey: ["employer", props.employerId] });
      await onReload();
    },
  });
  const handoff = useMutation({
    mutationFn: () => {
      const payload = {
        employerId: props.employerId,
        applicationId: props.applicationId,
        caseId,
        expectedRevision: base.revision,
        bindingToken: base.bindingToken,
        requirementIds: chosen,
      };
      return transfer({
        data: { ...payload, operationId: transferIntent.current.operationIdFor(payload) },
      });
    },
    onSuccess: async () => {
      transferIntent.current.completed();
      await qc.invalidateQueries({ queryKey: ["ii"] });
      await qc.invalidateQueries({ queryKey: ["employer", props.employerId] });
    },
  });
  const manualSource = useMutation({
    mutationFn: () =>
      prepareSource({
        data: {
          employerId: props.employerId,
          applicationId: props.applicationId,
          label: externalLabel.trim(),
        },
      }),
    onSuccess: (source) => {
      setPreparedSources((current) =>
        current.some((s) => sourceKey(s) === sourceKey(source)) ? current : [...current, source],
      );
      setExternalLabel("");
    },
  });
  const busy = mutation.isPending || handoff.isPending || manualSource.isPending;
  const patch = (index: number, value: Partial<RequirementDecision>) => {
    setAcknowledged(false);
    setDecisions((current) => current.map((d, i) => (i === index ? { ...d, ...value } : d)));
  };
  const label = (svText: string | null, enText: string | null) =>
    (sv ? svText || enText : enText || svText) ?? "";
  const activeCases = props.cases.filter(
    (c) => !c.reportFinalised && c.status !== "reported" && c.status !== "cancelled",
  );
  const openCv = async () => {
    setSourceError(null);
    try {
      await props.onOpenCv();
    } catch {
      setSourceError(
        sv
          ? "Originaldokumentet kunde inte öppnas. Kontrollera tillgängligheten och försök igen."
          : "The original document could not be opened. Check its availability and retry.",
      );
    }
  };
  return (
    <section
      id="candidate-requirement-review"
      data-testid="requirement-review"
      data-revision={review.revision}
      className="mt-8 rounded-lg border border-border p-4"
      aria-labelledby="requirement-review-heading"
    >
      <h2 id="requirement-review-heading" className="text-lg font-semibold">
        {sv
          ? "Granska ansökan mot beslutade krav"
          : "Review application against decided requirements"}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RequirementStatusBadge status={review.requirementStatus} />
        <ReviewStatusBadge status={review.reviewState} />
        <AnalysisStatusBadge />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {sv
          ? "Kravstatus är separat från rekryteringssteg och anställningsbeslut. Att öppna ansökan slutför inte granskningen. Saknade eller svårtolkade uppgifter behöver klarläggas; meriter kompenserar inte skallkrav."
          : "Requirement status is separate from recruitment stage and hiring decisions. Opening the application does not complete review. Missing or ambiguous information needs clarification; merits do not compensate for mandatory requirements."}
      </p>
      <p className="mt-2 text-xs">
        {sv ? "Kravprofilversion" : "Requirement profile version"}: {review.profile.version} ·{" "}
        {sv ? "Granskningsrevision" : "Review revision"}: {review.revision}
      </p>
      {!base.profile.profileId && (
        <p role="status" className="mt-3">
          {sv
            ? "Skallkrav inte fastställda. Fastställ kravprofil och accepterat underlag i rekryteringens Kravprofil innan granskningen sparas."
            : "Mandatory requirements not established. Confirm the requirement profile and accepted evidence in the recruitment's Requirements tab before saving review."}
        </p>
      )}
      {(stale || review.reviewState === "stale") && (
        <p role="alert" className="mt-3">
          {sv
            ? "Profil, källunderlag eller ansvarsfördelning har ändrats. En tidigare granskning behöver uppdateras. Ditt utkast finns kvar tills du läser in det aktuella underlaget."
            : "The profile, source evidence or assignment has changed. An earlier review needs updating. Your draft is retained until you load the current evidence."}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onReload()}
        className="mt-2 min-h-11 underline"
      >
        {sv ? "Läs in aktuell kravgranskning" : "Load current requirement review"}
      </button>
      {base.canManage &&
        base.criteria.some(
          (c) =>
            c.decisionRule === "human_confirmed" &&
            c.acceptedSources.includes("external_reference"),
        ) && (
          <fieldset disabled={busy || stale} className="mt-4 rounded border border-border p-3">
            <legend className="px-1 text-sm font-semibold">
              {sv
                ? "Förbered extern kontroll som källreferens"
                : "Prepare an external check as a source reference"}
            </legend>
            <p className="text-xs">
              {sv
                ? "Beskriv vem eller vad du kontrollerat, datum och var originalet finns. Välj sedan referensen uttryckligen för rätt krav och spara granskningen. Detta gäller endast krav med mänsklig kontrollregel."
                : "Describe whom or what you checked, the date and where the original is held. Then explicitly select the reference for the relevant requirement and save review. This applies only to requirements with a human checking rule."}
            </p>
            <label className="mt-2 block text-sm">
              {sv ? "Kontrollreferens" : "Check reference"}
              <input
                data-testid="external-source-label"
                className={controlClass}
                maxLength={500}
                value={externalLabel}
                onChange={(e) => setExternalLabel(e.target.value)}
              />
            </label>
            <button
              type="button"
              data-testid="external-source-prepare"
              disabled={!externalLabel.trim()}
              className="mt-2 min-h-11 rounded border border-border px-3"
              onClick={() => manualSource.mutate()}
            >
              {sv
                ? "Förbered referens, utan kravbedömning"
                : "Prepare reference, without assessing requirement"}
            </button>
          </fieldset>
        )}
      {manualSource.isError && (
        <p role="alert">
          {sv
            ? "Referensen kunde inte förberedas. Försök igen."
            : "The reference could not be prepared. Retry."}{" "}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (base.canManage && !stale && acknowledged) mutation.mutate(true);
        }}
      >
        <fieldset disabled={busy || stale || !base.profile.profileId} className="mt-4 space-y-4">
          {base.criteria.map((criterion, index) => {
            const decision = decisions[index]!;
            const sources = [
              ...base.availableSources,
              ...preparedSources.filter(
                (s) => !base.availableSources.some((b) => sourceKey(b) === sourceKey(s)),
              ),
            ].filter(
              (s) =>
                criterion.acceptedSources.includes(s.kind) &&
                (criterion.decisionRule !== "boolean_yes" ||
                  (s.kind === "application_answer" && s.reference === criterion.questionId)),
            );
            const selected =
              decision.sourceKind === null
                ? null
                : (sources.find(
                    (s) =>
                      s.kind === decision.sourceKind &&
                      s.reference === decision.sourceReference &&
                      s.version === decision.sourceVersion,
                  ) ??
                  (criterion.source?.reference === decision.sourceReference &&
                  criterion.source.version === decision.sourceVersion
                    ? criterion.source
                    : null));
            return (
              <fieldset
                key={criterion.requirementId}
                data-testid="requirement-criterion"
                data-requirement-id={criterion.requirementId}
                className="rounded border border-border p-3"
              >
                <legend className="px-1 font-semibold">
                  {label(criterion.labelSv, criterion.labelEn)} ·{" "}
                  {criterion.kind === "mandatory"
                    ? sv
                      ? "Skallkrav"
                      : "Mandatory"
                    : sv
                      ? "Merit"
                      : "Desirable"}
                </legend>
                <p className="text-sm whitespace-pre-wrap">
                  {label(criterion.instructionSv, criterion.instructionEn)}
                </p>
                <p className="mt-1 text-xs">
                  {sv ? "Accepterat underlag" : "Accepted evidence"}:{" "}
                  {criterion.acceptedSources.map((kind) => sourceLabels[lang][kind]).join(" · ")}
                </p>
                <label className="mt-3 block text-sm">
                  {sv
                    ? "Originalunderlag för detta ställningstagande"
                    : "Original evidence for this finding"}
                  <select
                    data-testid="criterion-source"
                    disabled={!base.canManage}
                    value={
                      selected && sources.some((s) => sourceKey(s) === sourceKey(selected))
                        ? sourceKey(selected)
                        : ""
                    }
                    className={controlClass}
                    onChange={(e) => {
                      const source = sources.find((s) => sourceKey(s) === e.target.value);
                      patch(index, {
                        sourceKind: source?.kind ?? null,
                        sourceReference: source?.reference ?? null,
                        sourceVersion: source?.version ?? null,
                        sourceLabel: source?.label ?? null,
                      });
                    }}
                  >
                    <option value="">
                      {sv
                        ? "Inget underlag valt / uppgift saknas"
                        : "No evidence selected / information missing"}
                    </option>
                    {sources.map((s) => (
                      <option key={sourceKey(s)} value={sourceKey(s)}>
                        {sourceLabels[lang][s.kind]} · {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selected && (
                  <div
                    data-testid="criterion-original-source"
                    className="mt-2 rounded bg-muted/50 p-3 text-sm"
                  >
                    <strong>{selected.label}</strong>
                    <p className="break-all text-xs">
                      {sv ? "Källreferens" : "Source reference"}: {selected.reference} ·{" "}
                      {sv ? "Version" : "Version"}: {selected.version}
                    </p>
                    {selected.answerBool !== null && (
                      <p>
                        {sv ? "Kandidatens svar" : "Candidate's answer"}:{" "}
                        {selected.answerBool ? (sv ? "Ja" : "Yes") : sv ? "Nej" : "No"}
                      </p>
                    )}
                    {selected.answerText && (
                      <p className="mt-1 whitespace-pre-wrap break-words">{selected.answerText}</p>
                    )}
                    {selected.kind === "application_cv" && (
                      <button
                        type="button"
                        className="min-h-11 underline"
                        onClick={() => void openCv()}
                      >
                        {sv
                          ? "Öppna inskickat originaldokument"
                          : "Open submitted original document"}
                      </button>
                    )}
                    {!criterion.sourceCurrent && criterion.source && (
                      <p role="status">
                        {sv
                          ? "Tidigare källversion är inte aktuell. Välj och kontrollera aktuellt underlag."
                          : "The earlier source version is not current. Select and check current evidence."}
                      </p>
                    )}
                  </div>
                )}
                {selected?.kind === "interview_source" && selected.caseId && (
                  <Link
                    to="/employer/$employerSlug/interview-intelligence/$caseId/prepare"
                    params={{ employerSlug: props.employerSlug, caseId: selected.caseId }}
                    hash={`source-${selected.reference}`}
                    className="inline-flex min-h-11 items-center underline"
                  >
                    {sv
                      ? "Öppna originalunderlag i intervjuärendet"
                      : "Open original source in the interview case"}
                  </Link>
                )}
                <label className="mt-3 block text-sm">
                  {sv ? "Mänskligt ställningstagande" : "Human finding"}
                  <select
                    data-testid="criterion-state"
                    disabled={!base.canManage}
                    value={decision.state}
                    className={controlClass}
                    onChange={(e) =>
                      patch(index, { state: e.target.value as RequirementDecision["state"] })
                    }
                  >
                    <option value="clarify">
                      {sv ? "Behöver klarläggas" : "Needs clarification"}
                    </option>
                    <option value="met">
                      {sv
                        ? "Uppfyllt enligt accepterat underlag"
                        : "Met according to accepted evidence"}
                    </option>
                    <option value="not_met">
                      {sv ? "Uttryckligen inte uppfyllt" : "Explicitly not met"}
                    </option>
                  </select>
                </label>
                {criterion.decisionRule === "valid_at_start" && (
                  <label className="mt-2 block text-sm">
                    {sv
                      ? `Kontrollerad giltighet t.o.m. (referensdatum ${base.profile.startDate ?? "—"})`
                      : `Checked validity through (reference date ${base.profile.startDate ?? "—"})`}
                    <input
                      data-testid="criterion-valid-until"
                      disabled={!base.canManage}
                      type="date"
                      className={controlClass}
                      value={decision.validUntil ?? ""}
                      onChange={(e) => patch(index, { validUntil: e.target.value || null })}
                    />
                  </label>
                )}
                <label className="mt-2 block text-sm">
                  {sv
                    ? "Saklig granskningsanteckning / varför detta ställningstagande"
                    : "Factual review note / reason for this finding"}
                  <textarea
                    data-testid="criterion-note"
                    disabled={!base.canManage}
                    required
                    maxLength={3000}
                    className={controlClass}
                    value={decision.note}
                    onChange={(e) => patch(index, { note: e.target.value })}
                  />
                </label>
                <label className="mt-2 block text-sm">
                  {sv
                    ? "Neutral klarläggandefråga (valfri)"
                    : "Neutral clarification question (optional)"}
                  <textarea
                    data-testid="criterion-neutral-question"
                    disabled={!base.canManage}
                    maxLength={2000}
                    className={controlClass}
                    value={decision.neutralQuestion ?? ""}
                    onChange={(e) => patch(index, { neutralQuestion: e.target.value || null })}
                  />
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sv
                    ? "Klarläggandet ersätter eller numrerar inte om rollguidens kärnfrågor. Erfarenhetsfrågor och scenarier behåller sina typer."
                    : "The clarification does not replace or renumber the role guide's core questions. Experience questions and scenarios retain their types."}
                </p>
              </fieldset>
            );
          })}
          <label className="block text-sm">
            {sv ? "Ansvarig för granskning / uppföljning" : "Responsible for review / follow-up"}
            <select
              data-testid="review-owner"
              required={requiresFollowUp}
              disabled={!base.canManage}
              className={controlClass}
              value={responsibleUserId}
              onChange={(e) => {
                setAcknowledged(false);
                setResponsibleUserId(e.target.value);
              }}
            >
              <option value="">{sv ? "Ej tilldelad" : "Unassigned"}</option>
              {props.team.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {sv ? "Nästa handling / återstående kontroll" : "Next action / outstanding check"}
            <textarea
              data-testid="review-next-action"
              required={requiresFollowUp}
              disabled={!base.canManage}
              maxLength={2000}
              className={controlClass}
              value={nextAction}
              onChange={(e) => {
                setAcknowledged(false);
                setNextAction(e.target.value);
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {sv
              ? "Spara klarlägganden här och använd vid behov befintlig kommunikation längre ned. Ingenting skickas automatiskt till kandidaten."
              : "Save clarifications here and use existing communication below when needed. Nothing is sent to the candidate automatically."}
          </p>
          {requiresFollowUp && (
            <p className="text-sm">
              {sv
                ? "Öppna klarlägganden kräver en ansvarig och nästa handling för att granskningen ska bekräftas."
                : "Open clarifications require a responsible person and next action before confirming review."}
            </p>
          )}
          <button
            type="button"
            data-testid="review-save-draft"
            disabled={!base.canManage || decisions.some((d) => !d.note.trim())}
            onClick={() => mutation.mutate(false)}
            className="min-h-11 rounded border border-border px-3"
          >
            {sv ? "Spara granskningsutkast" : "Save review draft"}
          </button>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              data-testid="review-confirm-ack"
              disabled={!base.canManage}
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            {sv
              ? "Jag har kontrollerat de angivna källorna och bekräftar denna mänskliga granskning. Öppna klarlägganden får kvarstå."
              : "I have checked the specified sources and confirm this human review. Open clarifications may remain."}
          </label>
          <button
            type="submit"
            data-testid="review-confirm"
            disabled={
              !base.canManage ||
              !acknowledged ||
              decisions.length === 0 ||
              decisions.some((d) => !d.note.trim()) ||
              (requiresFollowUp && (!responsibleUserId || !nextAction.trim()))
            }
            className="min-h-11 rounded bg-accent px-4 text-accent-foreground"
          >
            {sv ? "Bekräfta mänsklig granskning" : "Confirm human review"}
          </button>
        </fieldset>
        {!base.canManage && (
          <p className="mt-3 text-sm">
            {sv
              ? "Du har läsbehörighet. Ansvarig rekryterare eller administratör gör ställningstaganden och bekräftar granskningen."
              : "You have read access. The responsible recruiter or an administrator makes findings and confirms review."}
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className="mt-3">
            {sv
              ? "Granskningen kunde inte sparas. Utkastet finns kvar. Vid ändrad profil, källa eller ansvarsfördelning, läs in aktuellt underlag före nästa försök."
              : "The review could not be saved. Your draft is retained. If a profile, source or assignment changed, load current evidence before retrying."}{" "}
          </p>
        )}
        {sourceError && (
          <p role="alert" className="mt-3">
            {sourceError}
          </p>
        )}
      </form>
      {base.canManage && base.profile.profileId && (
        <fieldset
          disabled={busy || stale || dirty}
          data-testid="requirement-handoff"
          className="mt-6 rounded border border-border p-3"
        >
          <legend className="px-1 font-semibold">
            {sv
              ? "Välj underlag till befintlig PEACE-intervju"
              : "Choose evidence for an existing PEACE interview"}
          </legend>
          <p className="text-sm">
            {sv
              ? "Spara först granskningen. Välj sedan de källor och klarlägganden som intervjuaren behöver. Överföringen bekräftar ingen intervjuevidens och gör ingen rollbedömning."
              : "Save the review first. Then choose the sources and clarifications the interviewer needs. Transfer does not confirm interview evidence or assess role suitability."}
          </p>
          {base.criteria
            .filter((c) => c.source || c.neutralQuestion)
            .map((c) => (
              <label key={c.requirementId} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  data-testid="handoff-requirement"
                  type="checkbox"
                  checked={chosen.includes(c.requirementId)}
                  onChange={(e) =>
                    setChosen((current) =>
                      e.target.checked
                        ? [...current, c.requirementId]
                        : current.filter((id) => id !== c.requirementId),
                    )
                  }
                />
                {label(c.labelSv, c.labelEn)} ·{" "}
                {c.source?.label ?? (sv ? "Klarläggande" : "Clarification")}
              </label>
            ))}
          {activeCases.length ? (
            <label className="mt-2 block text-sm">
              {sv
                ? "Pågående intervju för samma ansökan"
                : "Active interview for the same application"}
              <select
                data-testid="handoff-case"
                className={controlClass}
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              >
                <option value="">{sv ? "Välj intervju" : "Choose interview"}</option>
                {activeCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-2 text-sm">
              {sv
                ? "Ingen pågående intervju finns ännu. Använd Förbered intervju i intervjudelen nedan och återkom till ditt sparade källval."
                : "There is no active interview yet. Use Prepare interview in the interview section below, then return to choose saved sources."}
            </p>
          )}
          <button
            type="button"
            data-testid="handoff-submit"
            disabled={!caseId || chosen.length === 0}
            onClick={() => handoff.mutate()}
            className="mt-3 min-h-11 rounded border border-border px-3"
          >
            {sv ? "För över uttryckligen valt underlag" : "Transfer explicitly chosen evidence"}
          </button>
          {dirty && (
            <p className="mt-2 text-xs">
              {sv ? "Spara utkastet före överföring." : "Save your draft before transfer."}
            </p>
          )}
        </fieldset>
      )}
      {handoff.isError && (
        <p role="alert" className="mt-3">
          {sv
            ? "Underlaget kunde inte överföras. Valet finns kvar; kontrollera aktuell granskning och försök igen."
            : "Evidence could not be transferred. Your selection is retained; check current review and retry."}{" "}
        </p>
      )}
      {handoff.isSuccess && (
        <p role="status" className="mt-3">
          {sv
            ? "Valt underlag har kopplats till intervjun."
            : "Chosen evidence has been linked to the interview."}{" "}
          <Link
            to="/employer/$employerSlug/interview-intelligence/$caseId/prepare"
            params={{ employerSlug: props.employerSlug, caseId }}
            className="underline"
          >
            {sv ? "Öppna intervjuförberedelse" : "Open interview preparation"}
          </Link>
        </p>
      )}
    </section>
  );
}
