// Intervjuunderlag — the context CQrityjob already holds, on the screen where
// the interview is prepared.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────
//
// A recruiter arriving here has just come from the application: they have seen
// the advert, the cover note, the submitted CV and — when there is one — the
// released assessment. Before this panel existed, none of it followed them,
// and the preparation screen's first move was to ask them to paste it back in.
//
// So the panel is a BRIEFING, not a data dump. Three questions in the order a
// person actually has them:
//
//   who and what      candidate, role, application
//   what we know      what the candidate has already told this employer
//   what to explore   areas to follow up, each with the reason it is here
//
// Raw source material stays behind a disclosure. The recruiter who wants the
// whole cover note can open it; the one who wants to start the interview is
// not made to scroll past it.
//
// ── THE LANGUAGE RULE ───────────────────────────────────────────────────
//
// "Område att följa upp" and "Begränsat underlag" say what is true: there is
// not yet enough evidence about something. Neither says the candidate is weak,
// and there is no wording in this file that could be read that way — no score,
// no percentage, no band, no ordering of one candidate against another, and no
// recommendation. The recruiter interprets the evidence.
//
// ── WHY IT IS NOT PART OF THE INTERVIEW RECORD ──────────────────────────
//
// Everything here is read live and written nowhere. A finished report is built
// from confirmed evidence and attached sources, both of which are frozen, so
// nothing on this panel can change what an already-completed interview says.
// The panel states that it is current material, so nobody mistakes it for the
// record.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import type {
  ContextFact,
  ContextSource,
  FollowUpArea,
  FollowUpReason,
  InterviewContext,
} from "@/lib/interview-intelligence/context";
import { Disclosure, Eyebrow, Field, Nothing, Section, Surface } from "./InterviewLayout";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** Where a line came from, in recruiter language. Deliberately the name of a
 *  thing the reader can go and open — never a table, an RPC or a snapshot id,
 *  which would be provenance nobody can act on. */
const SOURCE_LABEL: Record<ContextSource, TranslationKey> = {
  application: "iic.src.application",
  job: "iic.src.job",
  cqrityjob_cv: "iic.src.cv",
  assessment: "iic.src.assessment",
};

const REASON_LABEL: Record<FollowUpReason, TranslationKey> = {
  assessment_follow_up: "iic.reason.assessment",
  limited_evidence: "iic.reason.limited",
  requirement_to_cover: "iic.reason.requirement",
};

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** The origin of one line. Quiet by design: provenance should be checkable at
 *  a glance and never compete with the statement it belongs to. */
function SourceTag({ from }: { from: ContextSource }) {
  const { t } = useT();
  return (
    <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t(SOURCE_LABEL[from])}
    </span>
  );
}

/** Same argument as AREAS_SHOWN, for the same reason. A released assessment
 *  can observe a dozen behaviours; restating all of them here reproduces the
 *  assessment report inside the interview screen instead of briefing it. */
const FACTS_SHOWN = 8;

function FactList({ facts, lang }: { facts: readonly ContextFact[]; lang: "sv" | "en" }) {
  const { t } = useT();
  const shown = facts.slice(0, FACTS_SHOWN);
  const hidden = facts.length - shown.length;
  return (
    <>
      <ul className="space-y-2">
        {shown.map((f) => (
          <li key={f.key} className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <span className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
              {lang === "sv" ? f.sv : f.en}
            </span>
            {/* The verification mark is the CV's own and is carried, never
             *  recomputed. Its absence means "candidate-declared", which is the
             *  ordinary state of a CV line and is not marked as a deficiency. */}
            {f.verified === true && (
              <span className="shrink-0 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                {t("iic.verified")}
              </span>
            )}
            <SourceTag from={f.from} />
          </li>
        ))}
      </ul>
      {/* Said, not silently truncated. A list that quietly stops reads as a
       *  complete account of what the candidate submitted, which would be the
       *  one misreading this panel must not invite. */}
      {hidden > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("iic.more").replace("{n}", String(hidden))}
        </p>
      )}
    </>
  );
}

/** One area to explore: what to follow up, why it is here, and where that came
 *  from. The reason heading is the part that keeps the language honest — a
 *  line with no stated reason is the kind of item a reader fills in for
 *  themselves, usually unfavourably. */
/** How many areas of one kind reach the screen.
 *
 *  There is a real cap here because there has to be one. The released brief's
 *  guide can name a dozen areas and an advert can list ten requirements, and
 *  seventeen stacked cards is not a briefing — it is the raw source data this
 *  panel exists to spare the reader, with the interview action pushed off the
 *  bottom of it. What is dropped is SAID, never silently truncated. */
const AREAS_SHOWN = 5;

/** One reason's worth of areas, under its own small heading.
 *
 *  Grouped rather than interleaved: "what the assessment says to follow up"
 *  and "what the advert asks for" are different kinds of thing, and a reader
 *  scanning for one should not have to filter out the other line by line. */
function FollowUpGroup({
  reason,
  areas,
  lang,
}: {
  reason: FollowUpReason;
  areas: readonly FollowUpArea[];
  lang: "sv" | "en";
}) {
  const { t } = useT();
  const shown = areas.slice(0, AREAS_SHOWN);
  const hidden = areas.length - shown.length;

  return (
    <div>
      <p className="text-xs font-semibold text-foreground">{t(REASON_LABEL[reason])}</p>
      <ul className="mt-1.5 space-y-2">
        {shown.map((a) => {
          const why = lang === "sv" ? a.whySv : (a.whyEn ?? a.whySv);
          const suggestion = lang === "sv" ? a.suggestionSv : (a.suggestionEn ?? a.suggestionSv);
          return (
            <li key={a.key} className="rounded-md border border-border bg-card px-3 py-2.5">
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                {/* The AREA leads. The brief's prompt is phrased as a question
                 *  and sits below, so the pinned pack stays the authority on
                 *  what is actually asked. */}
                <span className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-foreground">
                  {lang === "sv" ? a.sv : a.en}
                </span>
                <SourceTag from={a.from} />
              </div>
              {why && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("iic.why")} {why}
                </p>
              )}
              {suggestion && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium">{t("iic.suggestion")}</span> {suggestion}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("iic.more").replace("{n}", String(hidden))}
        </p>
      )}
    </div>
  );
}

/** The three groups, in the order a recruiter needs them: what the assessment
 *  flagged, where its evidence is thin, then the advert's own ground. */
const REASON_ORDER: readonly FollowUpReason[] = [
  "assessment_follow_up",
  "limited_evidence",
  "requirement_to_cover",
];

function FollowUpList({ areas, lang }: { areas: readonly FollowUpArea[]; lang: "sv" | "en" }) {
  return (
    <div className="space-y-4">
      {REASON_ORDER.map((reason) => {
        const group = areas.filter((a) => a.reason === reason);
        if (group.length === 0) return null;
        return <FollowUpGroup key={reason} reason={reason} areas={group} lang={lang} />;
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

export function InterviewContextPanel({
  context,
  employerSlug,
  applicationId,
  isLoading,
  isError,
}: {
  context: InterviewContext | null;
  employerSlug: string;
  applicationId: string | null;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t, lang } = useT();

  if (isLoading)
    return (
      <Section id="ii-context" title={t("iic.heading")}>
        <p role="status" className="text-sm text-muted-foreground">
          {t("iic.loading")}
        </p>
      </Section>
    );

  // A failed read is reported as a failed read. Rendering "no material" here
  // would tell the recruiter something false about the candidate in order to
  // avoid telling them something true about us.
  if (isError || !context)
    return (
      <Section id="ii-context" title={t("iic.heading")}>
        <Nothing hint={t("iic.error.hint")}>{t("iic.error")}</Nothing>
      </Section>
    );

  if (!context.linked)
    return (
      <Section id="ii-context" title={t("iic.heading")} description={t("iic.lede")}>
        <Nothing hint={t("iic.unlinked.hint")}>{t("iic.unlinked")}</Nothing>
      </Section>
    );

  const role = (lang === "sv" ? context.roleSv : context.roleEn) ?? context.roleSv;
  const coverNote = context.known.find((f) => f.key === "cover-note") ?? null;
  const known = context.known.filter((f) => f.key !== "cover-note");

  return (
    <Section
      id="ii-context"
      title={t("iic.heading")}
      description={t("iic.lede")}
      action={
        applicationId ? (
          <Link
            to="/employer/$employerSlug/applications/$applicationId"
            params={{ employerSlug, applicationId }}
            className="text-sm font-medium text-accent hover:underline"
          >
            {t("iic.openApplication")}
          </Link>
        ) : undefined
      }
    >
      {/* ── Who, what, which application ──────────────────────────────── */}
      <Surface muted>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("iic.field.candidate")}>{context.candidateName}</Field>
          <Field label={t("iic.field.role")}>{role ?? t("iic.field.noRole")}</Field>
          <Field label={t("iic.field.applied")}>
            {context.appliedAt ? context.appliedAt.slice(0, 10) : "—"}
          </Field>
          <Field label={t("iic.field.material")}>
            <CvPresenceLine presence={context.cvPresence} submittedAt={context.cvSubmittedAt} />
          </Field>
        </dl>
      </Surface>

      {/* ── What we already know ──────────────────────────────────────── */}
      <div className="mt-6">
        <Eyebrow>{t("iic.known")}</Eyebrow>
        <div className="mt-2 space-y-3">
          {known.length === 0 ? (
            <Nothing hint={t("iic.known.none.hint")}>{t("iic.known.none")}</Nothing>
          ) : (
            <FactList facts={known} lang={lang} />
          )}

          {/* The cover note is the candidate's own prose and can run long.
           *  Behind a disclosure so it is one click away without displacing the
           *  briefing, and quoted rather than summarised. */}
          {coverNote && (
            <Disclosure summary={t("iic.coverNote")}>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {lang === "sv" ? coverNote.sv : coverNote.en}
              </p>
            </Disclosure>
          )}

          <AssessmentState
            releasedAt={context.assessmentReleasedAt}
            pending={context.assessmentPending}
          />
        </div>
      </div>

      {/* ── What to explore ───────────────────────────────────────────── */}
      <div className="mt-6">
        <Eyebrow>{t("iic.explore")}</Eyebrow>
        <p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
          {t("iic.explore.note")}
        </p>
        <div className="mt-2">
          {context.followUps.length === 0 ? (
            <Nothing>{t("iic.explore.none")}</Nothing>
          ) : (
            <FollowUpList areas={context.followUps} lang={lang} />
          )}
        </div>
      </div>

      {/* The one sentence that keeps this panel from being mistaken for the
       *  record. Current material, read now; the report is built from
       *  confirmed evidence and frozen sources. */}
      <p className="mt-6 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
        {t("iic.footnote")}
      </p>
    </Section>
  );
}

/** Which CV reached this application. An uploaded file is a complete answer
 *  and is worded as one: the interview does not need a CQrityjob CV and must
 *  not imply the candidate did something lesser by not having one. */
function CvPresenceLine({
  presence,
  submittedAt,
}: {
  presence: InterviewContext["cvPresence"];
  submittedAt: string | null;
}): ReactNode {
  const { t } = useT();
  const on = submittedAt ? ` (${submittedAt.slice(0, 10)})` : "";
  switch (presence) {
    case "cqrityjob_cv":
      return `${t("iic.cv.cqrityjob")}${on}`;
    case "external":
      return `${t("iic.cv.external")}${on}`;
    // "We could not read it" is not "there is none". An employer must never be
    // told a candidate applied without a CV because a read of ours failed.
    case "unreadable":
      return t("iic.cv.unreadable");
    default:
      return t("iic.cv.none");
  }
}

/** The assessment's state, always stated — including when there is none.
 *
 *  Silence here would be read as "no assessment", which is wrong when one is
 *  assigned and unreleased, and unhelpful when there genuinely is none. */
function AssessmentState({ releasedAt, pending }: { releasedAt: string | null; pending: boolean }) {
  const { t } = useT();
  if (releasedAt)
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("iic.assessment.released").replace("{date}", releasedAt.slice(0, 10))}
      </p>
    );
  if (pending)
    return <Nothing hint={t("iic.assessment.pending.hint")}>{t("iic.assessment.pending")}</Nothing>;
  return <Nothing hint={t("iic.assessment.none.hint")}>{t("iic.assessment.none")}</Nothing>;
}
