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
// for and what they produce. The operational level has a test. The strategic
// level has NONE yet, and says so with the content specification's own list
// of what is missing -- never "coming soon", and never the operational test
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
import { sendTestFromSetup, type SendTestResult } from "@/lib/library/start.functions";
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
}: {
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

  const library = useQuery({
    queryKey: ["employer", employerId, "library", "recruitment"],
    queryFn: () => libraryFn({ data: { employerId } }),
  });
  const sent = useQuery({
    queryKey: ["employer", employerId, "application", applicationId, "assessments"],
    queryFn: () => sentFn({ data: { applicationId } }),
  });

  const [group, setGroup] = useState<RoleGroup>("operational");
  const [language, setLanguage] = useState<"sv" | "en">(sv ? "sv" : "en");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<TranslationKey | null>(null);
  const [result, setResult] = useState<SendTestResult | null>(null);
  // One click is one send. A second click while the first is in flight, or
  // after it, lands on the same attempt in the database anyway -- but the
  // button does not offer it.
  const inFlight = useRef(false);

  const alreadySent = new Set(
    (sent.data ?? []).filter((a) => a.attemptStatus !== "abandoned").map((a) => a.assessmentSlug),
  );
  const offers: readonly LevelOffer[] = resolveLevelOffers(library.data ?? [], alreadySent);
  const chosen = offers.find((o) => o.level.group === group) ?? null;
  const canSend = chosen?.state === "sendable" && !busy && !result;

  // The heading names the person; a screen reader lands on the level choice.
  const firstRadio = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (library.isSuccess) firstRadio.current?.focus();
  }, [library.isSuccess]);

  async function send() {
    if (!chosen || chosen.state !== "sendable" || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(null);
    try {
      const r = await sendFn({
        data: {
          employerId,
          applicationId,
          roleGroup: chosen.level.group,
          roleProfile: chosen.level.profile,
          environment: "general",
          language,
        },
      });
      setResult(r);
      await qc.invalidateQueries({
        queryKey: ["employer", employerId, "application", applicationId, "assessments"],
      });
      void qc.invalidateQueries({ queryKey: ["academy", "participants", employerId] });
      void qc.invalidateQueries({ queryKey: ["employer", employerId, "candidates"] });
    } catch (e) {
      const err = e as { code?: string; message?: string };
      setFailed(errorKey(`${err.code ?? ""} ${err.message ?? ""}`));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  const levelLabel = (g: RoleGroup): TranslationKey =>
    g === "operational" ? "sendTest.level.operational" : "sendTest.level.strategic";
  const audienceKey = (g: RoleGroup): TranslationKey =>
    g === "operational"
      ? "sendTest.level.operational.audience"
      : "sendTest.level.strategic.audience";
  const purposeKey = (g: RoleGroup): TranslationKey =>
    g === "operational" ? "sendTest.level.operational.purpose" : "sendTest.level.strategic.purpose";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(Boolean(result))}>
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
            {candidateName ?? t("sendTest.recipientAnonymous")}
          </dd>
          {jobTitle && (
            <>
              <dt className="text-muted-foreground">{t("sendTest.forJob")}</dt>
              <dd className="text-foreground">{jobTitle}</dd>
            </>
          )}
        </dl>

        {result ? (
          <div data-testid="send-test-sent" className="mt-2">
            <p role="status" className="text-sm font-semibold text-foreground">
              {t("sendTest.sent.title")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t("sendTest.sent.body")}</p>
            <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">
              <li data-testid="send-test-setup" data-recorded={String(result.setupRecorded)}>
                {t(result.setupRecorded ? "sendTest.sent.setup" : "sendTest.sent.noSetup")}
              </li>
              <li
                data-testid="send-test-invitation"
                data-delivery={result.invitation?.delivery ?? "none"}
              >
                {result.invitation
                  ? `${result.invitation.delivery === "refused" || result.invitation.delivery === "failed" ? "" : t("sendTest.sent.inApp") + " "}${t(
                      `sendTest.sent.email.${
                        result.invitation.email === "sent" ||
                        result.invitation.email === "not_configured" ||
                        result.invitation.email === "in_progress"
                          ? result.invitation.email
                          : "failed"
                      }` as TranslationKey,
                    )}`
                  : t("sendTest.sent.noMessage")}
              </li>
            </ul>
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
                onClick={() => onClose(true)}
                className="min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground"
              >
                {t("sendTest.close")}
              </button>
            </DialogFooter>
          </div>
        ) : library.isLoading || sent.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        ) : library.isError ? (
          <p role="alert" className="text-sm text-foreground">
            {t("sendTest.error.unavailable")}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <fieldset className="mt-2">
              <legend className="text-sm font-medium text-foreground">{t("sendTest.level")}</legend>
              <div className="mt-2 space-y-2">
                {offers.map((o, i) => {
                  const g = o.level.group;
                  const active = g === group;
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
                          onChange={() => setGroup(g)}
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
                          {o.state === "sendable" && o.assessment && (
                            <span className="mt-2 block rounded-md bg-background px-2.5 py-2 text-[13px]">
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
                            </span>
                          )}
                          {o.state === "already_sent" && (
                            <span className="mt-2 block text-[13px] font-medium text-foreground">
                              {t("sendTest.level.alreadySent")}
                            </span>
                          )}
                          {o.state === "not_assignable" && (
                            <span className="mt-2 block text-[13px] text-foreground">
                              {t("sendTest.level.notAssignable")}
                            </span>
                          )}
                          {o.state === "no_content" && g === "strategic" && (
                            <span
                              className="mt-2 block text-[13px] text-foreground"
                              data-testid="send-test-strategic-missing"
                            >
                              {t("sendTest.level.strategic.noTest")}
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                                {o.missing.map((m) => (
                                  <li key={m}>{t(`sendTest.missing.${m}` as TranslationKey)}</li>
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

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-foreground">
                {t("sendTest.language")}
              </legend>
              <div className="mt-1.5 flex gap-4">
                {(["sv", "en"] as const).map((l) => (
                  <label key={l} className="inline-flex min-h-9 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`${ids}-language`}
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
                onClick={() => onClose(false)}
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
                {busy ? t("sendTest.sending") : t("sendTest.send")}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
