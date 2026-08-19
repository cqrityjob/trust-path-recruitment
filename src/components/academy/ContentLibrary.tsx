// The governed content library, rendered for one product area at a time.
//
// ── ONE READ MODEL, TWO DESTINATIONS ──────────────────────────────────
//
// Competence assessments and training programmes are the same governed content
// spine with the same versioning, ownership model and status ladder, and they
// come from one RPC discriminated by libraryKind. But they are two different
// employer questions and now two different top-level areas, so this component
// takes a `kind` and renders only that side:
//
//   Testbibliotek (under Tester)          kind="assessment"
//   Program (under Kompetensutveckling)   kind="training"
//
// One component rather than two, because the governance a row carries -- what
// it is, what state it is in, whether it may be assigned and why not -- is
// identical either way, and a second copy would be the one that drifts.
//
// ── SHOWING UNPUBLISHED PROGRAMMES ON PURPOSE ─────────────────────────
//
// The library lists programmes that cannot yet be assigned, clearly marked.
// An employer asking "do you have anything for security guards?" deserves
// "yes, it is in development and not yet validated" rather than an empty page
// that implies the answer is no.
//
// The honesty is structural, not a label. `assignable` is computed in the
// database by the same function the assign path calls, the Assign control is
// ABSENT rather than disabled when it is false, and the RPC re-checks anyway,
// so a crafted request cannot assign draft content.
//
// ── WHY ROWS AND NOT CARDS ────────────────────────────────────────────
//
// An equal-sized card per programme, whose largest element was often "Does not
// measure", made the catalogue unreadable and buried what an employer came
// for. Limitations moved to the detail surface, where somebody deciding to
// assign will actually read them.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FlaskConical,
  GraduationCap,
  Hammer,
  ShieldCheck,
} from "lucide-react";
import { useT } from "@/i18n/context";
import { AcademyHeading } from "@/components/academy/AcademyWorkspace";
import { AcademyQueryState } from "@/components/academy/AcademyQueryState";
import {
  assignAcademyProgramme,
  assignTrainingProgramme,
  listContentLibrary,
  type ContentLibraryEntry,
} from "@/lib/security-competency/academy-employer.functions";

/** The four sections, in the order an employer cares about them.
 *
 *  A row belongs to exactly one section, decided by lifecycle first and kind
 *  second: internal scaffolding is scaffolding whatever product type it is, and
 *  something under development is not yet a catalogue entry to choose from. */
type SectionKey = "assessment" | "training" | "development" | "internal";

const SECTIONS: readonly { key: SectionKey; icon: typeof ShieldCheck }[] = [
  { key: "assessment", icon: ShieldCheck },
  { key: "training", icon: GraduationCap },
  { key: "development", icon: Hammer },
  { key: "internal", icon: FlaskConical },
];

function sectionOf(e: ContentLibraryEntry): SectionKey {
  if (e.isTestFixture || e.lifecycleState === "internal_testing") return "internal";
  if (e.lifecycleState === "draft" || e.lifecycleState === "under_review") return "development";
  return e.libraryKind === "training" ? "training" : "assessment";
}

/** The "ready to use" section differs by area; development and internal
 *  scaffolding are shown in both, because an employer needs to know what is
 *  coming and what is only test material wherever they are standing. */
function sectionsFor(kind: ContentLibraryEntry["libraryKind"]): readonly SectionKey[] {
  return kind === "training"
    ? (["training", "development", "internal"] as const)
    : (["assessment", "development", "internal"] as const);
}

export function ContentLibrary({
  employerId,
  canAssign,
  kind,
  title,
  lede,
}: {
  employerId: string;
  canAssign: boolean;
  kind: ContentLibraryEntry["libraryKind"];
  title: string;
  lede: string;
}) {
  const { t, lang } = useT();
  const listLibrary = useServerFn(listContentLibrary);
  const [filter, setFilter] = useState<SectionKey | "all">("all");
  const visible = sectionsFor(kind);

  const query = useQuery({
    queryKey: ["academy", "content-library", employerId],
    queryFn: () => listLibrary({ data: { employerId } }),
    // One cache entry serves both areas; each filters to its own kind.
    select: (rows: ContentLibraryEntry[]) => rows.filter((r) => r.libraryKind === kind),
  });

  const grouped = useMemo(() => {
    const rows = query.data ?? [];
    const map = new Map<SectionKey, ContentLibraryEntry[]>();
    for (const { key } of SECTIONS) map.set(key, []);
    for (const r of rows) map.get(sectionOf(r))!.push(r);
    for (const list of map.values()) {
      list.sort((a, b) =>
        (lang === "en" ? a.nameEn : a.nameSv).localeCompare(
          lang === "en" ? b.nameEn : b.nameSv,
          lang === "en" ? "en" : "sv",
        ),
      );
    }
    return map;
  }, [query.data, lang]);

  return (
    <>
      <AcademyHeading title={title} lede={lede} />

      <AcademyQueryState
        query={query}
        surface="assessments/library"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle={t("academy.library.emptyTitle")}
        emptyBody={t("academy.library.emptyBody")}
      >
        {() => (
          <>
            {/* Filters, not tabs: an employer comparing an assessment against
                the training that develops the same competency should be able to
                see both at once, which a tab strip forbids. */}
            <div
              role="group"
              aria-label={t("academy.library.title")}
              className="mb-6 flex flex-wrap gap-2"
            >
              <FilterChip
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label={t("academy.library.filter.all")}
                count={(query.data ?? []).length}
              />
              {SECTIONS.filter(({ key }) => visible.includes(key)).map(({ key }) => (
                <FilterChip
                  key={key}
                  active={filter === key}
                  onClick={() => setFilter(key)}
                  label={t(`academy.library.sections.${key}` as never)}
                  count={grouped.get(key)?.length ?? 0}
                />
              ))}
            </div>

            <div className="space-y-10">
              {SECTIONS.filter(
                ({ key }) => visible.includes(key) && (filter === "all" || filter === key),
              ).map(({ key, icon }) => {
                const rows = grouped.get(key) ?? [];
                if (rows.length === 0) return null;
                return (
                  <Section
                    key={key}
                    sectionKey={key}
                    icon={icon}
                    rows={rows}
                    employerId={employerId}
                    canAssign={canAssign}
                    lang={lang}
                  />
                );
              })}
            </div>
          </>
        )}
      </AcademyQueryState>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border text-foreground hover:bg-muted/60"
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? "opacity-80" : "text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}

function Section({
  sectionKey,
  icon: Icon,
  rows,
  employerId,
  canAssign,
  lang,
}: {
  sectionKey: SectionKey;
  icon: typeof ShieldCheck;
  rows: ContentLibraryEntry[];
  employerId: string;
  canAssign: boolean;
  lang: string;
}) {
  const { t } = useT();
  return (
    <section aria-labelledby={`section-${sectionKey}`}>
      <div className="mb-3 flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <h2
            id={`section-${sectionKey}`}
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            {t(`academy.library.sections.${sectionKey}` as never)}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {t(`academy.library.sections.${sectionKey}Lede` as never)}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border bg-card">
        {rows.map((e) => (
          <LibraryRow
            key={`${e.libraryKind}-${e.itemId}`}
            entry={e}
            employerId={employerId}
            canAssign={canAssign}
            lang={lang}
          />
        ))}
      </ul>
    </section>
  );
}

/** One compact row. Everything an employer needs to choose; nothing they need
 *  only after choosing. */
function LibraryRow({
  entry,
  employerId,
  canAssign,
  lang,
}: {
  entry: ContentLibraryEntry;
  employerId: string;
  canAssign: boolean;
  lang: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const name = lang === "en" ? entry.nameEn : entry.nameSv;
  const role = lang === "en" ? entry.targetRoleEn : entry.targetRoleSv;
  const detailId = `detail-${entry.libraryKind}-${entry.itemId}`;

  const duration =
    entry.minutesMin && entry.minutesMax
      ? entry.minutesMin === entry.minutesMax
        ? `${entry.minutesMin} min`
        : `${entry.minutesMin}–${entry.minutesMax} min`
      : null;

  const size =
    entry.libraryKind === "training"
      ? `${entry.moduleCount} ${t("academy.library.modules").toLowerCase()}`
      : `${entry.itemCount} ${t("academy.library.items").toLowerCase()}`;

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold leading-snug text-foreground">{name}</h3>
            <KindChip kind={entry.libraryKind} />
            <StateChip entry={entry} />
          </div>

          {/* The metadata line. Dense on purpose: an employer scanning a
              catalogue reads this, not prose. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
            {role && <span>{role}</span>}
            {role && <Dot />}
            <span className="tabular-nums">{size}</span>
            {duration && <Dot />}
            {duration && <span className="tabular-nums">{duration}</span>}
            <Dot />
            <span className="uppercase tracking-wide">
              {entry.languages.map((l) => l.slice(0, 2)).join(" / ") || "sv"}
            </span>
            {entry.requiresHumanReview && <Dot />}
            {entry.requiresHumanReview && <span>{t("academy.library.reviewRequired")}</span>}
            {entry.ownership === "employer" && <Dot />}
            {entry.ownership === "employer" && (
              <span className="font-medium text-accent">{t("academy.library.owner.employer")}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailId}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("academy.library.view")}
            <ChevronDown
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          {/* Absent, not disabled, when the engine would refuse. */}
          {entry.assignable && canAssign && !assigning && (
            <button
              type="button"
              onClick={() => {
                setAssigning(true);
                setOpen(true);
              }}
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-accent px-4 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              {t("academy.library.assign")}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div id={detailId} className="mt-4">
          <ProgrammeDetail
            entry={entry}
            employerId={employerId}
            canAssign={canAssign}
            lang={lang}
            assigning={assigning}
            onStartAssign={() => setAssigning(true)}
            onDoneAssign={() => setAssigning(false)}
          />
        </div>
      )}
    </li>
  );
}

/** Separator between metadata facts.
 *
 *  Hidden below `sm`: when the line wraps on a narrow screen the dots strand
 *  themselves at the start or end of a row, which reads as a typo. Narrow
 *  layouts already separate the facts by wrapping. */
function Dot() {
  return (
    <span aria-hidden="true" className="hidden text-border sm:inline">
      ·
    </span>
  );
}

function KindChip({ kind }: { kind: ContentLibraryEntry["libraryKind"] }) {
  const { t } = useT();
  const Icon = kind === "training" ? BookOpen : ShieldCheck;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
      {t(`academy.library.kind.${kind}` as never)}
    </span>
  );
}

/** The governed state, said once.
 *
 *  A closed-test pilot is assignable AND not yet validated at the same time.
 *  Showing it as plain "available" overclaims; showing it as "in development"
 *  says it cannot be used, which is false. It gets its own chip. */
function StateChip({ entry }: { entry: ContentLibraryEntry }) {
  const { t } = useT();
  if (entry.governanceMode === "closed_test") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-[11px] font-medium text-accent">
        <FlaskConical className="h-3 w-3" aria-hidden="true" />
        {t("academy.status.closedTest")}
      </span>
    );
  }
  const Icon = entry.assignable ? CheckCircle2 : Hammer;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
      {t(`academy.library.state.${entry.lifecycleState}` as never)}
    </span>
  );
}

/** The detail surface: what an employer reads before deciding, including the
 *  boundaries that do not belong on a catalogue row. */
function ProgrammeDetail({
  entry,
  employerId,
  canAssign,
  lang,
  assigning,
  onStartAssign,
  onDoneAssign,
}: {
  entry: ContentLibraryEntry;
  employerId: string;
  canAssign: boolean;
  lang: string;
  assigning: boolean;
  onStartAssign: () => void;
  onDoneAssign: () => void;
}) {
  const { t } = useT();
  const summary = lang === "en" ? entry.summaryEn : entry.summarySv;
  const competencies = lang === "en" ? entry.competenciesEn : entry.competenciesSv;
  const doesNot = lang === "en" ? entry.doesNotMeasureEn : entry.doesNotMeasureSv;

  return (
    <div className="rounded-[12px] border border-border bg-[color:var(--surface-subtle)] p-4 sm:p-5">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        {t("academy.library.detailHeading")}
      </h4>

      {summary && <p className="mt-2 text-[13px] leading-relaxed text-foreground">{summary}</p>}

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("academy.library.version")} value={`v${entry.versionNumber}`} />
        <Field
          label={t("academy.library.owner")}
          value={t(`academy.library.owner.${entry.ownership}` as never)}
        />
        <Field
          label={t("academy.library.languages")}
          value={entry.languages.join(", ") || "sv-SE"}
        />
        <Field
          label={t("academy.library.review")}
          value={
            entry.requiresHumanReview
              ? t("academy.library.reviewRequired")
              : t("academy.library.reviewNotRequired")
          }
        />
        {entry.libraryKind === "training" ? (
          <Field label={t("academy.library.modules")} value={String(entry.moduleCount)} />
        ) : (
          <Field label={t("academy.library.items")} value={String(entry.itemCount)} />
        )}
        {competencies.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("academy.library.competencies")}
            </dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              {competencies.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[12px] text-foreground"
                >
                  {c}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {/* An assessment says what it is evidence ABOUT and, separately, what it
          does not establish. Two headings, because collapsing them into one
          "limitations" block is how "does not measure" turns into fine print. */}
      {entry.libraryKind === "assessment" && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {competencies.length > 0 && (
            <Boundary title={t("academy.library.provides")} body={competencies.join(" · ")} />
          )}
          <Boundary
            title={t("academy.library.notEstablished")}
            body={
              doesNot.length > 0
                ? `${t("academy.library.notEstablishedBody")} ${doesNot.join(" · ")}`
                : t("academy.library.notEstablishedBody")
            }
          />
        </div>
      )}

      {/* The rule that makes training safe to assign. Said where an employer
          decides, not only in governance documentation. */}
      {entry.libraryKind === "training" && (
        <div className="mt-5">
          <Boundary
            title={t("academy.library.notEstablished")}
            body={t("academy.library.trainingNotMaturity")}
          />
        </div>
      )}

      {entry.governanceMode === "closed_test" && (
        <div className="mt-4 rounded-[10px] border border-border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("academy.library.closedTest.title")}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {t("academy.library.closedTest.body")}
          </p>
        </div>
      )}

      <div className="mt-5">
        {entry.assignable && canAssign ? (
          assigning ? (
            <AssignForm employerId={employerId} entry={entry} lang={lang} onDone={onDoneAssign} />
          ) : (
            <button
              type="button"
              onClick={onStartAssign}
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              {t("academy.library.assign")}
            </button>
          )
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {entry.assignable
              ? t("academy.library.needsAdmin")
              : entry.unassignableReason
                ? t(`academy.library.reason.${entry.unassignableReason}` as never)
                : t("academy.library.notAssignable")}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Boundary({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/** What the employer is told, and must affirm, before Assign will run.
 *
 *  ── WHY AN AFFIRMATION AND NOT A PICKER ──────────────────────────────
 *
 *  There is exactly one purpose an employer may assign under today, and
 *  scp_required_purpose_code resolves it from the person context rather than
 *  from anything chosen here. A dropdown with one option would imply a choice
 *  that does not exist, and a second option would imply a lawful basis nobody
 *  has approved — recruitment fails closed in the database for exactly that
 *  reason.
 *
 *  So this is a statement plus a confirmation. What it does NOT do is quote a
 *  lawful basis, an article or a privacy notice version: that text exists in the
 *  database as configuration, it has not been through legal review, and putting
 *  it in front of an employer as settled would make a legal claim this product
 *  is not yet entitled to make. */
function PurposeAffirmation({
  entry,
  lang,
  confirmed,
  onConfirm,
  inputId,
}: {
  entry: ContentLibraryEntry;
  lang: string;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  inputId: string;
}) {
  const { t } = useT();
  const purpose = lang === "en" ? entry.summaryEn : entry.summarySv;
  const doesNot = lang === "en" ? entry.doesNotMeasureEn : entry.doesNotMeasureSv;

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        {t("academy.assign.purposeHeading")}
      </p>

      {purpose && <p className="mt-2 text-[13px] leading-relaxed text-foreground">{purpose}</p>}

      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.assign.purposeDevelopment")}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {t("academy.assign.purposeNotSelection")}
      </p>

      {doesNot.length > 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("academy.assign.purposeBoundary")}</span>{" "}
          {doesNot.join(" · ")}
        </p>
      )}

      <label
        htmlFor={inputId}
        className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-foreground"
      >
        <input
          id={inputId}
          type="checkbox"
          checked={confirmed}
          onChange={(ev) => onConfirm(ev.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <span>{t("academy.assign.purposeConfirm")}</span>
      </label>
    </div>
  );
}

function AssignForm({
  employerId,
  entry,
  lang,
  onDone,
}: {
  employerId: string;
  entry: ContentLibraryEntry;
  lang: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const assign = useServerFn(assignAcademyProgramme);
  const assignTraining = useServerFn(assignTrainingProgramme);
  const isTraining = entry.libraryKind === "training";
  // The library pins the VERSION, never the definition, so an assignment stays
  // reproducible after a v2 is published. For training that version is a
  // programme version; for an assessment it is an assessment version. Same
  // principle, two governed spines.
  const assessmentVersionId = entry.itemId;
  const [email, setEmail] = useState("");
  const [deadline, setDeadline] = useState("");
  // The language the participant will be written to and will answer in. It was
  // hardcoded to Swedish, which was invisible until an invitation email started
  // being sent — a participant assigned in English would have received Swedish.
  const [language, setLanguage] = useState<"sv" | "en">(lang === "en" ? "en" : "sv");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    academyUrl: string;
    notification: "sent" | "not_configured" | "failed";
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isTraining) {
        await assignTraining({
          data: {
            employerId,
            programVersionId: assessmentVersionId,
            recipientEmail: email.trim(),
            deadline: deadline ? new Date(deadline).toISOString() : null,
            language,
            message: null,
            sourceDecisionId: null,
          },
        });
        // Training has no invitation mail yet, so there is no delivery outcome
        // to report and no token to hand over -- the participant finds it in
        // their Academy. The link is still shown, because a link the employer
        // can pass on by hand always works.
        return {
          academyUrl: `${window.location.origin}/academy`,
          notification: "not_configured" as const,
        };
      }
      return assign({
        data: {
          employerId,
          assessmentVersionId,
          recipientEmail: email.trim(),
          deadline: deadline ? new Date(deadline).toISOString() : null,
          language,
        },
      });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
      void qc.invalidateQueries({ queryKey: ["academy", "my-work-count"] });
      void qc.invalidateQueries({ queryKey: ["academy", "training-status"] });
      setError(null);
      // Deliberately does NOT close the form. The employer needs the link and
      // the delivery outcome, and closing on success would throw both away at
      // the exact moment they matter.
      setResult({ academyUrl: r.academyUrl, notification: r.notification });
    },
    onError: (e: unknown) => {
      const code = (e as { code?: string }).code ?? "";
      setError(
        code === "SCP_RECIPIENT_HAS_NO_ACCOUNT"
          ? t("academy.assign.noAccount")
          : code === "SCP_PROGRAMME_NOT_ASSIGNABLE"
            ? t("academy.assign.notAssignable")
            : t("academy.assign.failed"),
      );
    },
  });

  if (result) {
    return (
      <AssignResult
        result={result}
        email={email}
        onDone={() => {
          setResult(null);
          setEmail("");
          setDeadline("");
          setConfirmed(false);
          onDone();
        }}
      />
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <label
          htmlFor={`email-${assessmentVersionId}`}
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          {t("academy.assign.email")}
        </label>
        <input
          id={`email-${assessmentVersionId}`}
          type="email"
          required
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div>
        <label
          htmlFor={`deadline-${assessmentVersionId}`}
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          {t("academy.assign.deadline")}
        </label>
        <input
          id={`deadline-${assessmentVersionId}`}
          type="date"
          value={deadline}
          onChange={(ev) => setDeadline(ev.target.value)}
          className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div>
        <label
          htmlFor={`language-${assessmentVersionId}`}
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          {t("academy.assign.language")}
        </label>
        <select
          id={`language-${assessmentVersionId}`}
          value={language}
          onChange={(ev) => setLanguage(ev.target.value === "en" ? "en" : "sv")}
          className="h-11 w-full rounded-[10px] border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="sv">{t("academy.assign.languageSv")}</option>
          <option value="en">{t("academy.assign.languageEn")}</option>
        </select>
      </div>

      <PurposeAffirmation
        entry={entry}
        lang={lang}
        confirmed={confirmed}
        onConfirm={setConfirmed}
        inputId={`purpose-${assessmentVersionId}`}
      />

      {error && (
        <p role="alert" className="text-[13px] leading-relaxed text-foreground">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending || !confirmed}
          className="inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {mutation.isPending ? t("academy.assign.sending") : t("academy.assign.confirm")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-11 items-center justify-center rounded-[10px] border border-border px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t("academy.cancel")}
        </button>
      </div>

      {!confirmed && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {t("academy.assign.purposeBlocked")}
        </p>
      )}
    </form>
  );
}

/** What the employer sees the moment an assignment exists.
 *
 *  The link is shown whatever happened to the mail, and it is shown FIRST.
 *  Email delivery is best-effort by design — the provider may not be configured
 *  on this deployment at all — so treating the copy-link as the fallback for a
 *  failure would bury the one mechanism that always works.
 *
 *  Nothing about the assessment travels in this URL: it is /academy, the same
 *  page the participant would reach by signing in and looking. */
function AssignResult({
  result,
  email,
  onDone,
}: {
  result: { academyUrl: string; notification: "sent" | "not_configured" | "failed" };
  email: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  const NOTICE = {
    sent: "academy.assign.mailSent",
    not_configured: "academy.assign.mailNotConfigured",
    failed: "academy.assign.mailFailed",
  } as const;

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-accent/40 bg-card p-4">
        <p className="text-sm font-semibold text-foreground">{t("academy.assign.doneTitle")}</p>
        <p className="mt-1 break-words text-[13px] leading-relaxed text-muted-foreground">
          {email}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {t(NOTICE[result.notification])}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">
          {t("academy.assign.linkLabel")}
        </p>
        <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
          {t("academy.assign.linkHint")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-[8px] border border-border bg-card px-3 py-2 text-[12px] text-foreground">
            {result.academyUrl}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(result.academyUrl)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? t("academy.assign.copied") : t("academy.assign.copy")}
          </button>
        </div>
        <p aria-live="polite" className="sr-only">
          {copied ? t("academy.assign.copied") : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("academy.assign.doneAction")}
      </button>
    </div>
  );
}
