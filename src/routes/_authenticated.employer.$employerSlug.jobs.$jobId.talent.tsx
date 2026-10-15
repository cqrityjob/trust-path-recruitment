// Recruitment — "Hitta kandidater" for one published job (slot 20270318090000).
//
// Who sees this page is the database's decision (rec_talent_user_may_search):
// an active organisation's owner/admin or the job's responsible recruiter, on
// a published, open job. Everyone else gets the same "not available" sentence.
//
// What it shows: voluntarily discoverable people whose SHARED items touch the
// job's confirmed, catalogue-bound requirements -- per requirement, what
// supports it, how it is backed, whether it is valid, and what needs to be
// clarified. "Not among shared items" is never "missing". The order is the
// documented one and is stated on the page. No score, no verdict, no ranking
// number, nothing automatic.
//
// Contact is a request tied to this job. The person decides; the name is
// shown only after they accept, and applying stays their own act.

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowLeft, Info, Mail, RotateCw } from "lucide-react";
import { JobsPage } from "@/components/academy/AcademyWorkspace";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { getEmployerJob } from "@/lib/job-intelligence/employer-jobs.functions";
import {
  getTalentProfile,
  listTalentContacts,
  searchTalent,
  sendTalentContact,
  withdrawTalentContact,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  type SentContact,
  type TalentFilters,
} from "@/lib/talent/talent-search.functions";
import {
  SEARCH_FILTERS,
  classKey,
  levelKey,
  meritDisplayName,
  orderingFacts,
  reasonKeys,
  requirementStateKey,
  validityKey,
  type CriterionEvaluation,
  type TalentResult,
} from "@/lib/talent/model";
import { useTalentCopy } from "@/lib/talent/talent-copy";
import { TalentCardView, LevelBadge } from "@/components/talent/TalentCardView";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const searchSchema = z.object({
  tab: z.enum(["results", "contacts"]).optional().catch(undefined),
  allMandatory: z.boolean().optional().catch(undefined),
  reviewedOnly: z.boolean().optional().catch(undefined),
  validOnly: z.boolean().optional().catch(undefined),
  activeOnly: z.boolean().optional().catch(undefined),
  preferencesMatch: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/jobs/$jobId/talent")({
  ssr: false,
  component: TalentRoute,
  errorComponent: EmployerErrorState,
  validateSearch: (search) => searchSchema.parse(search),
});

function TalentRoute() {
  const { employerSlug, jobId } = Route.useParams();
  return (
    <JobsPage employerSlug={employerSlug} wide>
      {(ws) => (
        <TalentSearch
          key={jobId}
          employerId={ws.employerId}
          employerSlug={employerSlug}
          jobId={jobId}
        />
      )}
    </JobsPage>
  );
}

const btnPrimary =
  "inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const btnSecondary =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function errorKey(code: string): string {
  return [
    "TALENT_CONTACT_INVALID",
    "TALENT_CONTACT_DECLINED_BEFORE",
    "TALENT_CONTACT_LIMIT_REACHED",
    "TALENT_PROFILE_NOT_AVAILABLE",
    "TALENT_SEARCH_NOT_AVAILABLE",
  ].includes(code)
    ? `talent.ui.err.${code}`
    : "talent.ui.err.generic";
}

function TalentSearch({
  employerId,
  employerSlug,
  jobId,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string;
}) {
  const { tt, lang } = useTalentCopy();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const tab = search.tab ?? "results";
  const filters: TalentFilters = Object.fromEntries(
    SEARCH_FILTERS.filter((f) => search[f]).map((f) => [f, true]),
  ) as TalentFilters;

  const jobFn = useServerFn(getEmployerJob);
  const searchFn = useServerFn(searchTalent);
  const contactsFn = useServerFn(listTalentContacts);
  const job = useQuery({
    queryKey: ["employer", employerId, "job", jobId],
    queryFn: () => jobFn({ data: { employerId, jobId } }),
  });
  const results = useQuery({
    queryKey: ["employer", employerId, "talent-search", jobId, filters],
    queryFn: () => searchFn({ data: { employerId, jobId, filters } }),
    enabled: tab === "results",
    retry: false,
    placeholderData: (prev) => prev,
  });
  const contacts = useQuery({
    queryKey: ["employer", employerId, "talent-contacts", jobId],
    queryFn: () => contactsFn({ data: { employerId, jobId } }),
    retry: false,
  });

  const row = job.data as { title_sv?: string | null; title_en?: string | null } | undefined;
  const title =
    (lang === "sv" ? (row?.title_sv ?? row?.title_en) : (row?.title_en ?? row?.title_sv)) ?? "";
  const errorCode = results.error instanceof Error ? results.error.message : null;

  function setFilter(f: (typeof SEARCH_FILTERS)[number], on: boolean) {
    void navigate({
      to: "/employer/$employerSlug/jobs/$jobId/talent",
      params: { employerSlug, jobId },
      search: { ...search, [f]: on ? true : undefined },
      replace: true,
    });
  }

  return (
    <div className="w-full space-y-5">
      <Link
        to="/employer/$employerSlug/jobs/$jobId"
        params={{ employerSlug, jobId }}
        search={{ step: "requirements" }}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {tt("talent.ui.back")}
      </Link>
      <header>
        <h1
          className="text-[1.375rem] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {tt("talent.ui.title")}
          {title ? (
            <span className="block text-base font-normal text-muted-foreground">{title}</span>
          ) : null}
        </h1>
        <p className="mt-1 max-w-[72ch] text-sm text-muted-foreground">{tt("talent.ui.lead")}</p>
      </header>

      <nav aria-label={tt("talent.ui.title")} className="border-b border-border">
        <ul className="-mb-px flex gap-1">
          {(["results", "contacts"] as const).map((t) => (
            <li key={t}>
              <Link
                to="/employer/$employerSlug/jobs/$jobId/talent"
                params={{ employerSlug, jobId }}
                search={{ ...search, tab: t === "results" ? undefined : t }}
                aria-current={tab === t ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${tab === t ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tt(`talent.ui.tab.${t}`)}
                {t === "contacts" && Array.isArray(contacts.data) && contacts.data.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-xs tabular-nums">
                    {contacts.data.length}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "contacts" ? (
        <ContactsTab
          employerId={employerId}
          employerSlug={employerSlug}
          jobId={jobId}
          query={contacts}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <fieldset className="rounded-xl border border-border bg-card p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">
                {tt("talent.ui.filters")}
              </legend>
              {SEARCH_FILTERS.map((f) => (
                <label key={f} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={Boolean(search[f])}
                    onChange={(e) => setFilter(f, e.target.checked)}
                  />
                  {tt(`talent.ui.filter.${f}`)}
                </label>
              ))}
            </fieldset>
            <section
              className="rounded-xl border border-border bg-card p-4"
              aria-labelledby="talent-order"
            >
              <h2
                id="talent-order"
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <Info aria-hidden="true" className="h-4 w-4" />
                {tt("talent.ui.order.title")}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {tt("talent.ui.order.body")}
              </p>
            </section>
          </aside>

          <div aria-live="polite" aria-busy={results.isFetching}>
            {results.isLoading ? (
              <p className="text-sm text-muted-foreground">{tt("talent.ui.loading")}</p>
            ) : results.isError ? (
              <div role="alert" className="rounded-xl border border-border bg-card p-5 text-sm">
                <p className="text-foreground">
                  {errorCode === "TALENT_SEARCH_NOT_AVAILABLE"
                    ? tt("talent.ui.notAvailable")
                    : errorCode === "TALENT_RATE_LIMITED"
                      ? tt("talent.ui.rateLimited")
                      : tt("talent.ui.error")}
                </p>
                {errorCode !== "TALENT_SEARCH_NOT_AVAILABLE" ? (
                  <button
                    type="button"
                    onClick={() => void results.refetch()}
                    className={`${btnSecondary} mt-3`}
                  >
                    <RotateCw aria-hidden="true" className="h-4 w-4" />
                    {tt("talent.ui.retry")}
                  </button>
                ) : null}
              </div>
            ) : !results.data ? null : results.data.status === "not_installed" ? (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                {tt("talent.ui.notInstalled")}
              </p>
            ) : results.data.status === "profile_required" ||
              results.data.status === "criteria_required" ? (
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <p className="text-foreground">
                  {tt(
                    results.data.status === "profile_required"
                      ? "talent.ui.profileRequired"
                      : "talent.ui.criteriaRequired",
                  )}
                </p>
                <Link
                  to="/employer/$employerSlug/jobs/$jobId"
                  params={{ employerSlug, jobId }}
                  search={{ step: "requirements" }}
                  className={`${btnSecondary} mt-3`}
                >
                  {tt("talent.ui.toCriteria")}
                </Link>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground" data-talent-total={results.data.total}>
                  <span className="font-semibold tabular-nums text-foreground">
                    {results.data.shown}
                  </span>{" "}
                  {tt("talent.ui.shownOf")}{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {results.data.total}
                  </span>{" "}
                  {tt("talent.ui.total")} · {tt("talent.ui.searchedAt")}{" "}
                  {results.data.searchedAt.slice(11, 16)}
                </p>
                {results.data.results.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-border bg-card p-5 text-sm">
                    <p className="text-foreground">{tt("talent.ui.empty")}</p>
                    <p className="mt-1 text-muted-foreground">{tt("talent.ui.emptyHelp")}</p>
                  </div>
                ) : (
                  <ol className="mt-3 space-y-4">
                    {results.data.results.map((r) => (
                      <ResultCard key={r.ref} result={r} employerId={employerId} jobId={jobId} />
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CriterionRow({ c }: { c: CriterionEvaluation }) {
  const { tt, lang } = useTalentCopy();
  const label = (lang === "sv" ? (c.labelSv ?? c.labelEn) : (c.labelEn ?? c.labelSv)) ?? "";
  const tone =
    c.state === "evidenced"
      ? "border-accent/50 bg-accent/10 text-foreground"
      : c.state === "needs_clarification"
        ? "border-amber-500/50 bg-amber-500/10 text-foreground"
        : "border-border bg-secondary text-muted-foreground";
  const ev = c.evidence;
  return (
    <li data-criterion-state={c.state} className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {c.kind === "mandatory" ? tt("talent.ui.mandatory") : tt("talent.ui.desirable")} ·{" "}
          {tt(classKey(c.requirementClass))}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
          {tt(requirementStateKey(c.state))}
        </span>
      </div>
      {ev && "code" in ev && ev.code ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-foreground">{meritDisplayName(ev, lang)}</span>
          {ev.jurisdiction ? (
            <span className="text-xs text-muted-foreground">· {ev.jurisdiction}</span>
          ) : null}
          <LevelBadge level={ev.level} />
          <span className="text-xs text-muted-foreground">
            {tt(validityKey(ev.validity))}
            {ev.validUntil ? ` · ${tt("talent.validUntil")} ${ev.validUntil}` : ""}
          </span>
        </p>
      ) : ev && typeof ev.months === "number" ? (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="tabular-nums text-foreground">
            {ev.months} {tt("talent.card.months")}
          </span>
          <span className="text-xs text-muted-foreground">{tt(levelKey(ev.level))}</span>
        </p>
      ) : null}
      {c.reasons.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {reasonKeys(c.reasons).map((k) => (
            <li key={k}>{tt(k)}</li>
          ))}
        </ul>
      ) : null}
      {c.state === "not_shared" ? (
        <p className="mt-1 text-xs text-muted-foreground">{tt("talent.state.notSharedNote")}</p>
      ) : null}
    </li>
  );
}

function ResultCard({
  result,
  employerId,
  jobId,
}: {
  result: TalentResult;
  employerId: string;
  jobId: string;
}) {
  const { tt } = useTalentCopy();
  const [open, setOpen] = useState(false);
  const [contacting, setContacting] = useState(false);
  const profileFn = useServerFn(getTalentProfile);
  const profile = useQuery({
    queryKey: ["employer", employerId, "talent-profile", jobId, result.ref],
    queryFn: () => profileFn({ data: { employerId, jobId, ref: result.ref } }),
    enabled: open,
    retry: false,
  });
  const ev = result.evaluation;
  const facts = orderingFacts(ev);
  const contact = result.contact;
  return (
    <li
      data-talent-result={result.position}
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {tt("talent.ui.person")} {result.position}
          </h2>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {result.visibility === "active" ? tt("talent.card.active") : tt("talent.card.open")}
          </p>
        </div>
        <dl
          className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4"
          aria-label={tt("talent.ui.order.title")}
        >
          {facts.map((f) => (
            <div key={f.key}>
              <dt className="text-muted-foreground">{tt(f.key)}</dt>
              <dd className="font-semibold tabular-nums text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="mt-3" aria-label={tt("talent.ui.why")}>
        <h3 className="text-sm font-semibold text-foreground">{tt("talent.ui.why")}</h3>
        <ul className="divide-y divide-border">
          {ev.criteria.map((c) => (
            <CriterionRow key={c.requirementId} c={c} />
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {tt("talent.pref.area")}:{" "}
          {tt(
            `talent.pref.${ev.preferences.area === "not_stated" ? "notStated" : ev.preferences.area}`,
          )}{" "}
          · {tt("talent.pref.location")}:{" "}
          {tt(
            `talent.pref.${ev.preferences.location === "not_stated" ? "notStated" : ev.preferences.location}`,
          )}{" "}
          · {tt("talent.pref.employmentType")}:{" "}
          {tt(
            `talent.pref.${ev.preferences.employmentType === "not_stated" ? "notStated" : ev.preferences.employmentType}`,
          )}
        </p>
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={btnSecondary}
        >
          {open ? tt("talent.ui.hideProfile") : tt("talent.ui.showProfile")}
        </button>
        {contact ? (
          <span
            className="rounded-full border border-border px-3 py-1 text-sm text-foreground"
            data-contact-status={contact.status}
          >
            {contact.status === "accepted"
              ? tt("talent.ui.contactAccepted")
              : contact.status === "declined"
                ? tt("talent.ui.contactDeclined")
                : tt("talent.ui.contacted")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setContacting(true)}
            className={btnPrimary}
            data-contact-open
          >
            <Mail aria-hidden="true" className="h-4 w-4" />
            {tt("talent.ui.contact")}
          </button>
        )}
      </div>

      {open ? (
        <div className="mt-4 border-t border-border pt-4">
          {profile.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : profile.isError ? (
            <p role="alert" className="text-sm text-foreground">
              {tt(errorKey(profile.error instanceof Error ? profile.error.message : ""))}
            </p>
          ) : profile.data?.status === "ok" ? (
            <TalentCardView
              visibility={profile.data.card.visibility}
              merits={profile.data.card.merits}
              experience={profile.data.card.experience}
              totalSecurityMonths={profile.data.card.totalSecurityMonths}
              preferences={profile.data.card.preferences}
              headingLevel={4}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{tt("talent.ui.profileGone")}</p>
          )}
        </div>
      ) : null}

      {contacting ? (
        <ContactDialog
          employerId={employerId}
          jobId={jobId}
          refValue={result.ref}
          onClose={() => setContacting(false)}
        />
      ) : null}
    </li>
  );
}

function ContactDialog({
  employerId,
  jobId,
  refValue,
  onClose,
}: {
  employerId: string;
  jobId: string;
  refValue: string;
  onClose: () => void;
}) {
  const { tt, lang } = useTalentCopy();
  const qc = useQueryClient();
  const sendFn = useServerFn(sendTalentContact);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // One key per dialog: a double click or a retry after a lost answer sends
  // the same request, which the database returns instead of repeating.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const length = message.trim().length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tt("talent.ui.dialog.title")}</DialogTitle>
          <DialogDescription>{tt("talent.ui.dialog.lead")}</DialogDescription>
        </DialogHeader>
        {done ? (
          <p role="status" className="text-sm text-foreground">
            {done}
          </p>
        ) : (
          <form
            id="talent-contact-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              if (length < CONTACT_MESSAGE_MIN || length > CONTACT_MESSAGE_MAX) {
                setError(tt("talent.ui.err.TALENT_CONTACT_INVALID"));
                return;
              }
              setBusy(true);
              setError(null);
              try {
                const res = await sendFn({
                  data: {
                    employerId,
                    jobId,
                    ref: refValue,
                    message: message.trim(),
                    idempotencyKey,
                    locale: lang,
                  },
                });
                setDone(
                  res.status === "already_contacted"
                    ? tt("talent.ui.dialog.already")
                    : tt("talent.ui.dialog.sent"),
                );
                await Promise.all([
                  qc.invalidateQueries({
                    queryKey: ["employer", employerId, "talent-search", jobId],
                  }),
                  qc.invalidateQueries({
                    queryKey: ["employer", employerId, "talent-contacts", jobId],
                  }),
                ]);
              } catch (cause) {
                setError(tt(errorKey(cause instanceof Error ? cause.message : "")));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label
              htmlFor="talent-contact-message"
              className="block text-sm font-semibold text-foreground"
            >
              {tt("talent.ui.dialog.message")}
            </label>
            <p id="talent-contact-help" className="text-sm text-muted-foreground">
              {tt("talent.ui.dialog.messageHelp")}
            </p>
            <textarea
              id="talent-contact-message"
              rows={6}
              maxLength={CONTACT_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby="talent-contact-help talent-contact-limits"
              className="mt-2 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <p className="text-xs tabular-nums text-muted-foreground">
              {length}/{CONTACT_MESSAGE_MAX}
            </p>
            <p id="talent-contact-limits" className="mt-1 text-xs text-muted-foreground">
              {tt("talent.ui.dialog.limits")}
            </p>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        )}
        <DialogFooter>
          <button type="button" onClick={onClose} className={btnSecondary}>
            {tt("talent.ui.dialog.cancel")}
          </button>
          {!done ? (
            <button
              type="submit"
              form="talent-contact-form"
              disabled={busy || length < CONTACT_MESSAGE_MIN}
              className={btnPrimary}
              data-contact-send
            >
              {busy ? tt("talent.ui.dialog.sending") : tt("talent.ui.dialog.send")}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactsTab({
  employerId,
  employerSlug,
  jobId,
  query,
}: {
  employerId: string;
  employerSlug: string;
  jobId: string;
  query: {
    data?: SentContact[];
    isLoading: boolean;
    isError: boolean;
    refetch: () => unknown;
    error: unknown;
  };
}) {
  const { tt } = useTalentCopy();
  const qc = useQueryClient();
  const withdrawFn = useServerFn(withdrawTalentContact);
  if (query.isLoading) return <p className="text-sm text-muted-foreground">…</p>;
  if (query.isError) {
    const code = query.error instanceof Error ? query.error.message : "";
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-5 text-sm">
        <p>
          {code === "TALENT_SEARCH_NOT_AVAILABLE"
            ? tt("talent.ui.notAvailable")
            : tt("talent.ui.contacts.loadError")}
        </p>
        {code !== "TALENT_SEARCH_NOT_AVAILABLE" ? (
          <button
            type="button"
            onClick={() => void query.refetch()}
            className={`${btnSecondary} mt-3`}
          >
            {tt("talent.ui.retry")}
          </button>
        ) : null}
      </div>
    );
  }
  const items = query.data ?? [];
  if (items.length === 0)
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {tt("talent.ui.contacts.empty")}
      </p>
    );
  return (
    <ul className="space-y-4">
      {items.map((c) => (
        <li
          key={c.id}
          data-sent-contact={c.status}
          className="rounded-xl border border-border bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {tt("talent.ui.contacts.name")}:{" "}
                {c.name ?? (
                  <span className="font-normal text-muted-foreground">
                    {tt("talent.ui.contacts.nameHidden")}
                  </span>
                )}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {tt("talent.ui.contacts.sent")} {c.createdAt.slice(0, 10)}
                {c.respondedAt
                  ? ` · ${tt("talent.ui.contacts.answered")} ${c.respondedAt.slice(0, 10)}`
                  : ""}{" "}
                ·{" "}
                {c.currentlyDiscoverable
                  ? tt("talent.ui.contacts.currentlyDiscoverable")
                  : tt("talent.ui.contacts.notDiscoverable")}
              </p>
            </div>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground">
              {tt(`talent.ui.contacts.status.${c.status}`)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-foreground">{c.message}</p>
          {c.status === "accepted" ? (
            c.applicationId ? (
              <Link
                to="/employer/$employerSlug/applications/$applicationId"
                params={{ employerSlug, applicationId: c.applicationId }}
                className={`${btnPrimary} mt-3`}
              >
                {tt("talent.ui.contacts.openApplication")}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {tt("talent.ui.contacts.notYetApplied")}
              </p>
            )
          ) : null}
          {c.status === "pending" ? (
            <button
              type="button"
              className={`${btnSecondary} mt-3`}
              onClick={async () => {
                await withdrawFn({ data: { employerId, jobId, contactId: c.id } }).catch(
                  () => undefined,
                );
                await qc.invalidateQueries({
                  queryKey: ["employer", employerId, "talent-contacts", jobId],
                });
              }}
            >
              {tt("talent.ui.contacts.withdraw")}
            </button>
          ) : null}
          {c.snapshot ? (
            <details className="mt-3 rounded-md border border-border p-3">
              <summary className="min-h-11 cursor-pointer text-sm font-medium text-foreground">
                {tt("talent.ui.contacts.snapshot")} ·{" "}
                {c.snapshot.takenAt?.slice(0, 16).replace("T", " ")}
              </summary>
              <p className="mt-1 text-xs text-muted-foreground">
                {tt("talent.ui.contacts.snapshotNote")}
              </p>
              {c.snapshot.evaluation ? (
                <ul className="mt-2 divide-y divide-border">
                  {c.snapshot.evaluation.criteria.map((cr) => (
                    <CriterionRow key={cr.requirementId} c={cr} />
                  ))}
                </ul>
              ) : null}
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
