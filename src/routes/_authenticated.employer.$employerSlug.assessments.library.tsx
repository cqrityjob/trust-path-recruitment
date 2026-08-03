// Assessment Library — what exists, what may be assigned, and why not.
//
// ── SHOWING UNPUBLISHED PROGRAMMES ON PURPOSE ─────────────────────────
//
// The library lists programmes that cannot yet be assigned, clearly marked.
// That is a deliberate product choice: an employer asking "do you have anything
// for security guards?" deserves "yes, it is in development and not yet
// validated" rather than an empty page that implies the answer is no.
//
// The honesty has to be structural, not a label. `assignable` is computed in
// the database, the Assign control is absent — not merely disabled — when it is
// false, and scp_employer_assign re-checks it anyway, so a crafted request
// cannot assign a draft programme.

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FlaskConical, Hammer } from "lucide-react";
import { useT } from "@/i18n/context";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { AcademyHeading, AcademyPage } from "@/components/academy/AcademyWorkspace";
import { NoEvidenceState } from "@/components/academy/MaturityDisplay";
import {
  assignAcademyProgramme,
  listAcademyLibrary,
  type LibraryEntry,
} from "@/lib/security-competency/academy-employer.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/assessments/library",
)({
  ssr: false,
  component: LibraryRoute,
  errorComponent: EmployerErrorState,
});

function LibraryRoute() {
  const { employerSlug } = Route.useParams();
  return (
    <AcademyPage employerSlug={employerSlug}>
      {(ws) => <Library employerId={ws.employerId} canAssign={ws.role !== "member"} />}
    </AcademyPage>
  );
}

function Library({ employerId, canAssign }: { employerId: string; canAssign: boolean }) {
  const { t, lang } = useT();
  const listLibrary = useServerFn(listAcademyLibrary);
  const query = useQuery({
    queryKey: ["academy", "library", employerId],
    queryFn: () => listLibrary({ data: { employerId } }),
  });

  return (
    <>
      <AcademyHeading title={t("academy.library.title")} lede={t("academy.library.lede")} />

      {query.isLoading && <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>}

      {query.data && query.data.length === 0 && (
        <NoEvidenceState
          title={t("academy.library.emptyTitle")}
          body={t("academy.library.emptyBody")}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(query.data ?? []).map((e) => (
          <ProgrammeCard
            key={e.assessmentVersionId}
            entry={e}
            employerId={employerId}
            canAssign={canAssign}
            lang={lang}
          />
        ))}
      </div>
    </>
  );
}

function ProgrammeCard({
  entry,
  employerId,
  canAssign,
  lang,
}: {
  entry: LibraryEntry;
  employerId: string;
  canAssign: boolean;
  lang: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const name = lang === "en" ? entry.nameEn : entry.nameSv;
  const purpose = lang === "en" ? entry.purposeEn : entry.purposeSv;
  const doesNot = lang === "en" ? entry.doesNotMeasureEn : entry.doesNotMeasureSv;

  return (
    <article className="flex flex-col rounded-[14px] border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold leading-snug text-foreground">{name}</h2>
        <StatusChip entry={entry} />
      </div>

      {purpose && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{purpose}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-muted-foreground">{t("academy.library.items")}</dt>
          <dd className="font-medium tabular-nums text-foreground">{entry.itemCount}</dd>
        </div>
        {entry.minutesMin && entry.minutesMax && (
          <div>
            <dt className="text-muted-foreground">{t("academy.library.duration")}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {entry.minutesMin}–{entry.minutesMax} min
            </dd>
          </div>
        )}
      </dl>

      {/* What the programme does NOT measure, stated on the card rather than
          buried in a policy page. It is the boundary that prevents misuse. */}
      {doesNot.length > 0 && (
        <div className="mt-4 rounded-[10px] bg-[color:var(--surface-subtle)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            {t("academy.library.doesNotMeasure")}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {doesNot.join(" · ")}
          </p>
        </div>
      )}

      <div className="mt-5 flex-1" />

      {entry.assignable && canAssign ? (
        open ? (
          <AssignForm
            employerId={employerId}
            assessmentVersionId={entry.assessmentVersionId}
            onDone={() => setOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[color:var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            {t("academy.library.assign")}
          </button>
        )
      ) : (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {entry.assignable ? t("academy.library.needsAdmin") : t("academy.library.notAssignable")}
        </p>
      )}
    </article>
  );
}

function StatusChip({ entry }: { entry: LibraryEntry }) {
  const { t } = useT();
  const [Icon, key] = entry.isTestFixture
    ? ([FlaskConical, "academy.status.fixture"] as const)
    : entry.assignable
      ? ([CheckCircle2, "academy.status.available"] as const)
      : ([Hammer, "academy.status.development"] as const);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
      {t(key)}
    </span>
  );
}

function AssignForm({
  employerId,
  assessmentVersionId,
  onDone,
}: {
  employerId: string;
  assessmentVersionId: string;
  onDone: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const assign = useServerFn(assignAcademyProgramme);
  const [email, setEmail] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      assign({
        data: {
          employerId,
          assessmentVersionId,
          recipientEmail: email.trim(),
          deadline: deadline ? new Date(deadline).toISOString() : null,
          language: "sv",
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["academy", "participants"] });
      setEmail("");
      setDeadline("");
      setError(null);
      onDone();
    },
    onError: (e: unknown) => {
      // The database's own identifier, so the message can be specific.
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

      {error && (
        <p role="alert" className="text-[13px] leading-relaxed text-foreground">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
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
    </form>
  );
}
