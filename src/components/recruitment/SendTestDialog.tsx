// "Skicka test" -- the one way to send a candidate test from a recruitment.
//
// ── WHY ONE DIALOG ──────────────────────────────────────────────────────
//
// Owner bug report (2026-09-26): "Under översikt rekrytering på
// arbetsgivarytan så saknas möjlighet att skicka tester till den sökande."
// There were four send surfaces and no "Skicka test": one on the candidate
// page (a button per assessment, hidden when the library read failed), one
// bulk dialog behind a selection in the recruitment's candidate table, one
// in the library four clicks away, and one inside an interview case. Only
// the library one recorded WHICH LEVEL the test was sent for, so a test sent
// from the other three left the interview preparation asking for it again.
//
// This dialog is mounted from the applications list, the recruitment's
// candidate table and the candidate page, with the candidate and the
// recruitment already known. It sends through sendTestFromSetup, which
// assigns, records the level and tells the candidate -- one path.
//
// ── BOTH LEVELS, ALWAYS ─────────────────────────────────────────────────
//
// The employer chooses a level first, and both are shown with who they are
// for and what they produce. Each level maps to its own test. Whether THIS
// organisation may send it is read live from the library: the strategic
// level's content is a governed draft (20261216090000) designated at parity
// with the operational level (20261217090000), so it is sent as a closed
// test and said to be one; where only the content is installed the dialog
// says it is a draft awaiting the owner's content approval -- never
// "coming soon", never a validated test, and never the operational test
// under a new heading (src/lib/library/levels.ts holds that rule).

import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listApplicationAssessments,
  listContentLibrary,
} from "@/lib/security-competency/academy-employer.functions";
import {
  getTestAssignmentAccess,
  sendTestFromSetup,
  type SendTestResult,
} from "@/lib/library/start.functions";
import { resolveLevelOffers, type LevelOffer } from "@/lib/library/levels";
import type { RoleGroup } from "@/lib/library/catalogue";

/** The refusals the database can answer with, said as the next step. */
const SEND_ERROR: Record<string, TranslationKey> = {
  SCP_APPLICANT_HAS_NO_ADDRESS: "journey.assignNoAddress",
  SCP_RECIPIENT_HAS_NO_ACCOUNT: "journey.assignNoAccount",
  SCP_APPLICATION_NOT_FOUND: "journey.assignNoApplication",
  SCP_APPLICATION_NOT_YOURS: "journey.assignNoApplication",
  SCP_NOT_AUTHORISED_TO_ASSIGN: "journey.assignNotAuthorised",
  SCP_NOT_VALID_FOR_RECRUITMENT: "journey.assignNotForRecruitment",
  SCP_NO_GOVERNANCE_BASIS: "journey.assignNoBasis",
  SCP_START_NO_TEST: "sendTest.error.noTest",
};

function retryNotification(result: SendTestResult) {
  return (
    !result.invitation ||
    ["failed", "refused", "in_progress"].includes(result.invitation.delivery) ||
    ["failed", "unknown", "in_progress"].includes(result.invitation.email)
  );
}

function errorKey(message: string): TranslationKey {
  for (const [code, key] of Object.entries(SEND_ERROR)) {
    if (message.includes(code)) return key;
  }
  return "journey.assignFailed";
}

export function SendTestDialog({
  employerId,
  employerSlug,
  applicationId,
  candidateName,
  jobTitle,
  onClose,
  candidates,
  initialGroup = "operational",
  initialVersionId,
}: {
  candidates?: { applicationId: string; name: string | null; jobTitle?: string | null }[];
  initialGroup?: RoleGroup;
  initialVersionId?: string;
  employerId: string;
  employerSlug: string;
  applicationId: string;
  candidateName: string | null;
  jobTitle: string | null;
  /** `sent` is true when a test was sent (or confirmed already sent) in this
   *  dialog, so the caller can refresh what it shows. */
  onClose: (sent: boolean) => void;
}) {
  const { t, lang } = useT();
  const sv = lang !== "en";
  const ids = useId();
  const qc = useQueryClient();
  const libraryFn = useServerFn(listContentLibrary);
  const sentFn = useServerFn(listApplicationAssessments);
  const sendFn = useServerFn(sendTestFromSetup);
  const accessFn = useServerFn(getTestAssignmentAccess);
  const access = useQuery({
    queryKey: ["employer", employerId, "test-assignment-access"],
    queryFn: () => accessFn({ data: { employerId } }),
  });
  const recipients = candidates ?? [{ applicationId, name: candidateName, jobTitle }];
  const [outcomes, setOutcomes] = useState<
    Record<string, { result?: SendTestResult; error?: TranslationKey }>
  >({});
  const [confirming, setConfirming] = useState(false);
  const [deadline, setDeadline] = useState("");

  const library = useQuery({
    queryKey: ["employer", employerId, "library", "recruitment"],
    queryFn: () => libraryFn({ data: { employerId } }),
  });
  const sent = useQuery({
    queryKey: ["employer", employerId, "application", applicationId, "assessments"],
    queryFn: () => sentFn({ data: { applicationId } }),
  });

  const [versionChoice, setVersionChoice] = useState(initialVersionId ?? "");
  const [group, setGroup] = useState<RoleGroup>(initialGroup);
  const [language, setLanguage] = useState<"sv" | "en">(sv ? "sv" : "en");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<TranslationKey | null>(null);
  const [result, setResult] = useState<SendTestResult | null>(null);
  // One click is one send. A second click while the first is in flight, or
  // after it, lands on the same attempt in the database anyway -- but the
  // button does not offer it.
  const inFlight = useRef(false);

  const alreadySent = new Set(
    (candidates ? [] : (sent.data ?? []))
      .filter((a) => a.attemptStatus !== "abandoned")
      .map((a) => a.assessmentSlug),
  );
  const offers: readonly LevelOffer[] = resolveLevelOffers(library.data ?? [], alreadySent);
  const [reviewOffer, setReviewOffer] = useState<LevelOffer | null>(null);
  const extraTests = (library.data ?? []).filter(
    (r) =>
      r.libraryKind === "assessment" &&
      r.designedFor === "recruitment_support" &&
      !offers.some((o) => o.level.assessmentSlug === r.slug),
  );
  const extra = extraTests.find((r) => r.itemId === versionChoice);
  const chosen: LevelOffer | null =
    reviewOffer ??
    (extra
      ? {
          level: { group: "operational", profile: "vaktare", assessmentSlug: extra.slug },
          assessment: extra,
          state: alreadySent.has(extra.slug)
            ? "already_sent"
            : extra.assignable
              ? "sendable"
              : "not_assignable",
          draftAwaitingRelease: false,
          parts: [],
        }
      : (offers.find((o) => o.level.group === group) ?? null));
  const availableLanguages =
    (library.data ?? []).find((a) => a.itemId === chosen?.assessment?.itemId)?.languages ?? [];
  const languageAllowed = availableLanguages.some((l) => l.startsWith(language));
  useEffect(() => {
    if (availableLanguages.length && !languageAllowed && !confirming) {
      const first = availableLanguages.find((l) => l.startsWith("sv") || l.startsWith("en"));
      if (first) setLanguage(first.startsWith("sv") ? "sv" : "en");
    }
  }, [availableLanguages.join(","), languageAllowed, confirming]);
  const canSend =
    chosen?.state === "sendable" &&
    access.data === true &&
    recipients.length > 0 &&
    languageAllowed &&
    !busy &&
    !result;

  // The heading names the person; a screen reader lands on the level choice.
  const firstRadio = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (library.isSuccess) firstRadio.current?.focus();
  }, [library.isSuccess]);

  async function send() {
    if (!chosen || chosen.state !== "sendable" || !access.data || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(null);
    let anySent = false;
    try {
      for (const recipient of recipients) {
        const previous = outcomes[recipient.applicationId]?.result;
        if (previous && !retryNotification(previous)) continue;
        try {
          const r = await sendFn({
            data: {
              employerId,
              applicationId: recipient.applicationId,
              ...(versionChoice
                ? {}
                : {
                    roleGroup: chosen.level.group,
                    roleProfile: chosen.level.profile,
                    environment: "general" as const,
                  }),
              language,
              assessmentVersionId: chosen.assessment!.itemId,
              deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null,
            },
          });
          anySent = true;
          setOutcomes((prev) => ({ ...prev, [recipient.applicationId]: { result: r } }));
          if (!candidates) setResult(r);
          await qc.invalidateQueries({
            queryKey: [
              "employer",
              employerId,
              "application",
              recipient.applicationId,
              "assessments",
            ],
          });
        } catch (e) {
          const err = e as { code?: string; message?: string };
          const key = errorKey(`${err.code ?? ""} ${err.message ?? ""}`);
          setOutcomes((prev) => ({ ...prev, [recipient.applicationId]: { error: key } }));
          if (!candidates) setFailed(key);
        }
      }
    } finally {
      if (anySent) {
        void qc.invalidateQueries({ queryKey: ["employer", employerId] });
        void qc.invalidateQueries({ queryKey: ["academy"] });
      }
      setBusy(false);
      inFlight.current = false;
    }
  }

  const hasSent = Boolean(result) || Object.values(outcomes).some((o) => o.result);
  const hasOutcomes = candidates && Object.keys(outcomes).length > 0;
  const close = () => {
    if (!inFlight.current) onClose(hasSent);
  };

  const levelLabel = (g: RoleGroup): TranslationKey =>
    g === "operational" ? "sendTest.level.operational" : "sendTest.level.strategic";
  const audienceKey = (g: RoleGroup): TranslationKey =>
    g === "operational"
      ? "sendTest.level.operational.audience"
      : "sendTest.level.strategic.audience";
  const purposeKey = (g: RoleGroup): TranslationKey =>
    g === "operational" ? "sendTest.level.operational.purpose" : "sendTest.level.strategic.purpose";

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
        data-testid="send-test-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("sendTest.title")}</DialogTitle>
          <DialogDescription>{t("sendTest.lede")}</DialogDescription>
        </DialogHeader>

        {/* Who, and for what -- stated, so the recruiter reviews the recipient
            before anything is sent. */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border bg-[color:var(--surface-subtle)] px-3 py-2 text-sm">
          <dt className="text-muted-foreground">{t("sendTest.recipient")}</dt>
          <dd className="font-medium text-foreground" data-testid="send-test-recipient">
            {recipients.map((r) => r.name ?? t("sendTest.recipientAnonymous")).join(", ")}
          </dd>
          {jobTitle && (
            <>
              <dt className="text-muted-foreground">{t("sendTest.forJob")}</dt>
              <dd className="text-foreground">{jobTitle}</dd>
            </>
          )}
        </dl>

        {hasOutcomes ? (
          <div aria-live="polite">
            <ul className="space-y-3">
              {recipients.map((r) => (
                <li key={r.applicationId} className="rounded border p-3">
                  <strong>{r.name ?? t("sendTest.recipientAnonymous")}</strong>
                  <p>{r.jobTitle ?? jobTitle}</p>
                  {outcomes[r.applicationId]?.result ? (
                    <>
                      <p>{t("sendTest.sent.title")}</p>
                      <DeliveryStatus result={outcomes[r.applicationId].result!} />
                    </>
                  ) : (
                    <p role={outcomes[r.applicationId]?.error ? "alert" : "status"}>
                      {outcomes[r.applicationId]?.error
                        ? t(outcomes[r.applicationId].error!)
                        : t("sendTest.sending")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {Object.values(outcomes).some(
              (o) => o.error || (o.result && retryNotification(o.result)),
            ) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send()}
                className="mt-4 rounded border p-3"
              >
                {sv
                  ? "Försök igen för misslyckade utskick eller aviseringar"
                  : "Retry failed assignments or notifications"}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="mt-4 rounded border p-3"
            >
              {t("sendTest.close")}
            </button>
          </div>
        ) : result ? (
          <div data-testid="send-test-sent" className="mt-2">
            <p role="status" className="text-sm font-semibold text-foreground">
              {t("sendTest.sent.title")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t("sendTest.sent.body")}</p>
            <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">
              {!versionChoice && (
                <li data-testid="send-test-setup" data-recorded={String(result.setupRecorded)}>
                  {t(result.setupRecorded ? "sendTest.sent.setup" : "sendTest.sent.noSetup")}
                </li>
              )}
              <li>
                <DeliveryStatus result={result} />
              </li>
            </ul>
            {retryNotification(result) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send()}
                className="mt-4 rounded border p-3"
              >
                {sv ? "Försök skicka aviseringen igen" : "Retry notification"}
              </button>
            )}
            <DialogFooter className="mt-5 gap-2">
              <Link
                to="/employer/$employerSlug/applications/$applicationId"
                params={{ employerSlug, applicationId }}
                className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-secondary"
              >
                {t("sendTest.sent.openCandidate")}
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={close}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground"
              >
                {t("sendTest.close")}
              </button>
            </DialogFooter>
          </div>
        ) : library.isLoading || sent.isLoading || access.isPending ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : library.isError || sent.isError || access.isError ? (
          <p role="alert" className="text-sm text-foreground">
            {t("sendTest.error.unavailable")}
          </p>
        ) : !access.data ? (
          <p role="alert" className="rounded border p-4 text-sm">
            {sv
              ? "Skicka test kräver aktiv ägar- eller administratörsbehörighet i denna organisation. Kontrollera vald organisation eller be organisationens ägare om rätt åtkomst. Att vara rekryteringsansvarig ger inte denna behörighet."
              : "Sending tests requires active owner or administrator access in this organisation. Check the selected organisation or ask its owner for access. Recruitment responsibility does not grant this permission."}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (confirming) void send();
              else {
                setReviewOffer(chosen);
                setConfirming(true);
              }
            }}
          >
            <div hidden={confirming}>
            <fieldset disabled={confirming || busy} className="mt-2">
              <legend className="text-sm font-medium text-foreground">{t("sendTest.level")}</legend>
              <div className="mt-2 space-y-2">
                {offers.map((o, i) => {
                  const g = o.level.group;
                  const active = !versionChoice && g === group;
                  return (
                    <label
                      key={g}
                      data-testid={`send-test-level-${g}`}
                      data-state={o.state}
                      className={
                        "block cursor-pointer rounded-lg border p-3 transition-colors " +
                        (active ? "border-accent bg-accent/5" : "border-border hover:bg-muted/30")
                      }
                    >
                      <span className="flex items-start gap-3">
                        <input
                          ref={i === 0 ? firstRadio : undefined}
                          type="radio"
                          name={`${ids}-level`}
                          value={g}
                          checked={active}
                          onChange={() => {
                            setGroup(g);
                            setVersionChoice("");
                          }}
                          className="mt-1 h-4 w-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">
                            {t(levelLabel(g))}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-muted-foreground">
                            {t(audienceKey(g))}
                          </span>
                          <span className="mt-1 block text-[13px] leading-relaxed text-foreground">
                            {t(purposeKey(g))}
                          </span>
                          {(o.state === "sendable" || o.draftAwaitingRelease) && o.assessment && (
                            <span
                              className="mt-2 block rounded-md bg-background px-2.5 py-2 text-[13px]"
                              data-testid={`send-test-card-${g}`}
                              data-content-status={o.assessment.contentStatus}
                            >
                              <span className="font-medium text-foreground">
                                {t("sendTest.test")}:{" "}
                                {sv ? o.assessment.nameSv : o.assessment.nameEn}
                              </span>
                              <span className="block text-muted-foreground">
                                {t("sendTest.test.size")
                                  .replace("{items}", String(o.assessment.itemCount))
                                  .replace("{modules}", String(o.assessment.moduleCount))}
                                {o.assessment.minutesMin && o.assessment.minutesMax
                                  ? ` · ${t("sendTest.test.minutes")
                                      .replace("{min}", String(o.assessment.minutesMin))
                                      .replace("{max}", String(o.assessment.minutesMax))}`
                                  : ""}
                              </span>
                              {o.assessment.contentStatus === "draft" && (
                                <span className="block text-muted-foreground">
                                  {t("sendTest.test.closedTest")}
                                </span>
                              )}
                            </span>
                          )}
                          {o.state === "already_sent" && (
                            <span className="mt-2 block text-[13px] font-medium text-foreground">
                              {t("sendTest.level.alreadySent")}
                            </span>
                          )}
                          {o.state === "not_assignable" && !o.draftAwaitingRelease && (
                            <span className="mt-2 block text-[13px] text-foreground">
                              {t("sendTest.level.notAssignable")}
                            </span>
                          )}
                          {o.draftAwaitingRelease && g === "strategic" && (
                            <span
                              className="mt-2 block text-[13px] text-foreground"
                              data-testid="send-test-strategic-pending"
                            >
                              {t("sendTest.level.strategic.pendingApproval")}
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                                {o.parts.map((m) => (
                                  <li key={m}>{t(`sendTest.part.${m}` as TranslationKey)}</li>
                                ))}
                              </ul>
                              <span className="mt-1 block">
                                {t("sendTest.level.strategic.interviewInstead")}
                              </span>
                            </span>
                          )}
                          {o.draftAwaitingRelease && g !== "strategic" && (
                            <span className="mt-2 block text-[13px] text-foreground">
                              {t("sendTest.level.notAssignable")}
                            </span>
                          )}
                          {o.state === "no_content" && g === "strategic" && (
                            <span
                              className="mt-2 block text-[13px] text-foreground"
                              data-testid="send-test-strategic-missing"
                            >
                              {t("sendTest.level.strategic.notInstalled")}
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                                {o.parts.map((m) => (
                                  <li key={m}>{t(`sendTest.part.${m}` as TranslationKey)}</li>
                                ))}
                              </ul>
                              <span className="mt-1 block">
                                {t("sendTest.level.strategic.interviewInstead")}
                              </span>
                            </span>
                          )}
                          {o.state === "no_content" && g !== "strategic" && (
                            <span className="mt-2 block text-[13px] text-foreground">
                              {t("sendTest.error.noTest")}
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {extraTests.length > 0 && (
              <fieldset disabled={confirming || busy} className="mt-4">
                <legend>{sv ? "Övriga rekryteringstester" : "Other recruitment tests"}</legend>
                {extraTests.map((a) => (
                  <label key={a.itemId} className="my-2 flex gap-2 rounded border p-3">
                    <input
                      type="radio"
                      name={`${ids}-level`}
                      checked={versionChoice === a.itemId}
                      onChange={() => setVersionChoice(a.itemId)}
                    />
                    {sv ? a.nameSv : a.nameEn} · v{a.versionNumber} · {a.contentStatus}
                  </label>
                ))}
              </fieldset>
            )}

            <fieldset disabled={confirming || busy} className="mt-4">
              <legend className="text-sm font-medium text-foreground">
                {t("sendTest.language")}
              </legend>
              <div className="mt-1.5 flex gap-4">
                {(["sv", "en"] as const).map((l) => (
                  <label key={l} className="inline-flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`${ids}-language`}
                      disabled={!availableLanguages.some((v) => v.startsWith(l))}
                      value={l}
                      checked={language === l}
                      onChange={() => setLanguage(l)}
                      className="h-4 w-4"
                    />
                    {t(`sendTest.language.${l}` as TranslationKey)}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block text-sm">
              {sv ? "Sista svarsdag (valfritt)" : "Response deadline (optional)"}
              <input
                type="date"
                value={deadline}
                min={new Date().toLocaleDateString("en-CA")}
                disabled={confirming || busy}
                onChange={(e) => setDeadline(e.target.value)}
                className="ml-3 rounded border p-2"
              />
            </label>
            </div>
            {confirming && (
              <div className="mt-4 rounded border p-3" data-testid="send-test-confirmation">
                <p className="font-semibold">{sv ? "Bekräfta utskick" : "Confirm assignment"}</p>
                <p>
                  {sv ? chosen?.assessment?.nameSv : chosen?.assessment?.nameEn} ·{" "}
                  {language.toUpperCase()}
                </p>
                <p>
                  {deadline
                    ? `${sv ? "Sista svarsdag" : "Response deadline"}: ${deadline}`
                    : sv
                      ? "Ingen egen sista svarsdag vald; testets standardtid gäller."
                      : "No custom deadline; the test default applies."}
                </p>
                <ul>
                  {recipients.map((r) => (
                    <li key={r.applicationId}>
                      {r.name ?? t("sendTest.recipientAnonymous")} · {r.jobTitle ?? jobTitle}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 underline"
                  onClick={() => {
                    setConfirming(false);
                    setReviewOffer(null);
                  }}
                >
                  {sv ? "Ändra" : "Edit"}
                </button>
              </div>
            )}

            {failed && (
              <p
                role="alert"
                className="mt-3 text-sm text-destructive"
                data-testid="send-test-error"
              >
                {t(failed)}
              </p>
            )}
            {chosen && chosen.state !== "sendable" && !failed && (
              <p className="mt-3 text-[13px] text-muted-foreground" data-testid="send-test-blocked">
                {t("sendTest.cannotSend")}
              </p>
            )}

            <DialogFooter className="mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={close}
                className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {t("sendTest.cancel")}
              </button>
              <button
                type="submit"
                disabled={!canSend}
                data-testid="send-test-submit"
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {busy
                  ? t("sendTest.sending")
                  : confirming
                    ? t("sendTest.send")
                    : sv
                      ? "Granska utskick"
                      : "Review assignment"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeliveryStatus({ result }: { result: SendTestResult }) {
  const { t, lang } = useT();
  const delivered =
    result.invitation?.delivery === "delivered" || result.invitation?.delivery === "already_sent";
  const email = result.invitation?.email;
  return (
    <div data-testid="send-test-invitation" data-delivery={result.invitation?.delivery ?? "none"}>
      <p>{delivered ? t("sendTest.sent.inApp") : t("sendTest.sent.noMessage")}</p>
      <p>
        {email === "sent" || email === "not_configured" || email === "in_progress"
          ? t(`sendTest.sent.email.${email}` as TranslationKey)
          : lang === "en"
            ? "Email delivery has not been confirmed."
            : "E-postleverans har inte bekräftats."}
      </p>
    </div>
  );
}
