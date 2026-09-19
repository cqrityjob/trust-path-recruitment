// "Starta BESKT" — one dialog for both entrances and both purposes.
//
// The employer chooses the PURPOSE (recruitment, or security vetting), then
// the candidate: an existing application of theirs, or an explicit invitation
// by e-mail when there is no application — never an invented one. Then the
// role's exposure profile, the responsible interviewer and the contact route
// the candidate is shown, and, for a security vetting, the employer's OWN
// attestation that the role is security-sensitive, its lawful basis and the
// security owner. Before starting, the questions the candidate will get are
// on screen.
//
// Nothing here decides anything. The database refuses a vetting started by
// someone outside the appointed security function, a missing attestation, an
// interviewer who does not belong, and content that changed since the dialog
// rendered; this dialog only makes those refusals rare.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/context";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  listAssignableBesktExposureProfiles,
  type BesktAssignableMethod,
} from "@/lib/beskt/candidate-preparation.functions";
import {
  createBesktInvitation,
  listBesktPeople,
  startBeskt,
  type BesktMode,
} from "@/lib/beskt/complete.functions";
import { listApplicationsForEmployer } from "@/lib/job-intelligence/applications.functions";
import { BesktQuestionPreview } from "@/components/beskt/BesktPreviewDialog";

const FIELD =
  "mt-1 min-h-[44px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function BesktStartDialog({
  open,
  onOpenChange,
  employerId,
  employerSlug,
  methods,
  isSecurityOfficer,
  fixedApplicationId,
  initialMode,
  onStarted,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly employerId: string;
  readonly employerSlug: string;
  /** Every version this employer may start today, of both purposes. */
  readonly methods: readonly BesktAssignableMethod[];
  readonly isSecurityOfficer: boolean;
  /** Started from an application's own page: the candidate is that applicant. */
  readonly fixedApplicationId?: string;
  /** The purpose to open on, when the caller already knows it. */
  readonly initialMode?: BesktMode;
  /** Called with the new assignment before the dialog moves on -- the library
   *  records the setup it was started with here. Its failure is shown to the
   *  caller, never allowed to lose the assignment that already exists. */
  readonly onStarted?: (assignmentId: string) => Promise<void>;
}) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const applicationsFn = useServerFn(listApplicationsForEmployer);
  const profilesFn = useServerFn(listAssignableBesktExposureProfiles);
  const peopleFn = useServerFn(listBesktPeople);
  const startFn = useServerFn(startBeskt);
  const inviteFn = useServerFn(createBesktInvitation);

  const modes = useMemo(
    () => Array.from(new Set(methods.map((m) => m.mode as BesktMode))),
    [methods],
  );
  const [mode, setMode] = useState<BesktMode>(
    initialMode && modes.includes(initialMode) ? initialMode : (modes[0] ?? "recruitment_support"),
  );
  // More than one runnable version of a purpose (a new version next to the
  // one in use): the person starting chooses, rather than the list order.
  const versionsForMode = methods.filter((m) => m.mode === mode);
  const [versionId, setVersionId] = useState("");
  const method =
    versionsForMode.find((m) => m.methodVersionId === versionId) ?? versionsForMode[0] ?? null;
  const vetting = mode === "security_vetting_support";

  const [entrance, setEntrance] = useState<"application" | "invitation">("application");
  const [applicationId, setApplicationId] = useState(fixedApplicationId ?? "");
  const [email, setEmail] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [profileId, setProfileId] = useState("");
  const [interviewerId, setInterviewerId] = useState("");
  const [contact, setContact] = useState("");
  const [contactTouched, setContactTouched] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [attestation, setAttestation] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const applications = useQuery({
    queryKey: ["beskt", "start", "applications", employerId],
    queryFn: () => applicationsFn({ data: { employerId } }),
    enabled: open && !fixedApplicationId,
    retry: false,
  });
  const profiles = useQuery({
    queryKey: ["beskt", "start", "profiles", employerId, method?.methodVersionId],
    queryFn: () => profilesFn({ data: { employerId, methodVersionId: method!.methodVersionId } }),
    enabled: open && Boolean(method),
    retry: false,
  });
  const people = useQuery({
    queryKey: ["beskt", "people", employerId],
    queryFn: () => peopleFn({ data: { employerId } }),
    enabled: open,
    retry: false,
  });

  const effectiveProfile = profileId || profiles.data?.[0]?.exposureProfileId || "";
  const eligibleInterviewers = (people.data ?? []).filter((p) => !vetting || p.isSecurityOfficer);
  const officers = (people.data ?? []).filter((p) => p.isSecurityOfficer);
  const interviewer = (people.data ?? []).find((p) => p.userId === interviewerId) ?? null;

  // A new purpose is a new set of questions: the profile, the people who may
  // take part and the operation are chosen again rather than carried over.
  useEffect(() => {
    setProfileId("");
    setVersionId("");
    setInterviewerId("");
    setOwnerId("");
    setOperationId(crypto.randomUUID());
  }, [mode]);

  // The contact route defaults to the responsible interviewer, until the
  // employer writes their own.
  useEffect(() => {
    if (contactTouched || !interviewer) return;
    setContact(
      t("beskt.startDialog.contactDefault")
        .replace("{name}", interviewer.displayName)
        .replace("{email}", interviewer.email),
    );
  }, [interviewer, contactTouched, t]);

  const common = () => ({
    operationId,
    mode,
    methodVersionId: method!.methodVersionId,
    exposureProfileId: effectiveProfile,
    expectedContentHash: method!.contentHash,
    responsibleInterviewerId: interviewerId,
    contactStatement: contact.trim(),
    securityOwnerId: vetting ? ownerId : null,
    roleSecurityAttestation: vetting ? attestation.trim() : null,
    lawfulBasisStatement: vetting ? lawfulBasis.trim() : null,
  });

  const start = useMutation({
    mutationFn: async () => {
      if (!method) throw new Error("BCP_NOT_ASSIGNABLE");
      if (entrance === "application") {
        const r = await startFn({ data: { ...common(), applicationId } });
        return { kind: "started" as const, assignmentId: r.assignmentId };
      }
      const r = await inviteFn({
        data: {
          ...common(),
          employerId,
          invitedEmail: email.trim(),
          candidateDisplayName: candidateName.trim() || null,
          roleTitle: roleTitle.trim(),
        },
      });
      return { kind: "invited" as const, token: r.token };
    },
    onSuccess: async (r) => {
      if (r.kind === "invited") {
        setInvitationLink(`${window.location.origin}/beskt/inbjudan/${r.token}`);
        return;
      }
      if (onStarted) {
        try {
          await onStarted(r.assignmentId);
        } catch (e) {
          console.error("[beskt-start] the setup was not recorded", e);
        }
      }
      onOpenChange(false);
      // Started from the application's own page: stay there, where the
      // panel now shows the preparation it started.
      if (fixedApplicationId) {
        void queryClient.invalidateQueries({ queryKey: ["beskt"] });
        return;
      }
      void navigate({
        to: "/employer/$employerSlug/assessments/beskt/$assignmentId",
        params: { employerSlug, assignmentId: r.assignmentId },
      });
    },
  });

  const ready =
    Boolean(method) &&
    Boolean(effectiveProfile) &&
    Boolean(interviewerId) &&
    contact.trim().length >= 3 &&
    (entrance === "application"
      ? Boolean(applicationId)
      : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && roleTitle.trim().length > 0) &&
    (!vetting ||
      (Boolean(ownerId) && attestation.trim().length >= 20 && lawfulBasis.trim().length >= 20));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto"
        data-testid="beskt-start-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("beskt.startDialog.title")}</DialogTitle>
          <DialogDescription>{t("beskt.startDialog.lede")}</DialogDescription>
        </DialogHeader>

        {invitationLink ? (
          <div data-testid="beskt-invitation-created">
            <Alert>
              <Check aria-hidden="true" className="h-4 w-4" />
              <AlertTitle>{t("beskt.startDialog.invitedTitle")}</AlertTitle>
              <AlertDescription>{t("beskt.startDialog.invitedBody")}</AlertDescription>
            </Alert>
            <label htmlFor="beskt-invitation-link" className="mt-4 block text-sm font-medium">
              {t("beskt.startDialog.invitationLink")}
            </label>
            <input
              id="beskt-invitation-link"
              readOnly
              className={`${FIELD} font-mono text-xs`}
              value={invitationLink}
              data-testid="beskt-invitation-link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-2 min-h-[44px]"
              onClick={() => {
                void navigator.clipboard?.writeText(invitationLink).then(() => setCopied(true));
              }}
            >
              <Copy aria-hidden="true" className="mr-1.5 h-4 w-4" />
              {copied ? t("beskt.startDialog.copied") : t("beskt.startDialog.copy")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("beskt.startDialog.invitationOnce")}
            </p>
            <DialogFooter className="mt-4">
              <Button type="button" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
                {t("beskt.startDialog.done")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) start.mutate();
            }}
          >
            <fieldset>
              <legend className="text-sm font-semibold">{t("beskt.startDialog.purpose")}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["recruitment_support", "security_vetting_support"] as const).map((m) => {
                  const available = modes.includes(m);
                  const blocked = m === "security_vetting_support" && !isSecurityOfficer;
                  return (
                    <label
                      key={m}
                      className={`flex min-h-[44px] cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
                        mode === m ? "border-foreground" : "border-border"
                      } ${!available || blocked ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <input
                        type="radio"
                        name="beskt-purpose"
                        value={m}
                        className="mt-1"
                        checked={mode === m}
                        disabled={!available || blocked}
                        onChange={() => setMode(m)}
                        data-testid={`beskt-purpose-${m}`}
                      />
                      <span>
                        <span className="font-medium">
                          {t(
                            m === "recruitment_support"
                              ? "beskt.purpose.recruitment"
                              : "beskt.purpose.securityVetting",
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {!available
                            ? t("beskt.startDialog.purposeUnavailable")
                            : blocked
                              ? t("beskt.startDialog.purposeNeedsOfficer")
                              : t(
                                  m === "recruitment_support"
                                    ? "beskt.purpose.recruitmentHint"
                                    : "beskt.purpose.securityVettingHint",
                                )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {versionsForMode.length > 1 ? (
              <div>
                <label htmlFor="beskt-start-version" className="text-sm font-semibold">
                  {t("beskt.startDialog.version")}
                </label>
                <select
                  id="beskt-start-version"
                  className={FIELD}
                  value={method?.methodVersionId ?? ""}
                  onChange={(e) => {
                    setVersionId(e.target.value);
                    setProfileId("");
                    setOperationId(crypto.randomUUID());
                  }}
                >
                  {versionsForMode.map((m) => (
                    <option key={m.methodVersionId} value={m.methodVersionId}>
                      {`${(lang === "sv" ? m.nameSv : (m.nameEn ?? m.nameSv)) ?? m.packSlug} · ${t("beskt.library.version")} ${m.versionNumber}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {!fixedApplicationId ? (
              <fieldset>
                <legend className="text-sm font-semibold">
                  {t("beskt.startDialog.candidate")}
                </legend>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="flex min-h-[44px] items-center gap-2">
                    <input
                      type="radio"
                      name="beskt-entrance"
                      checked={entrance === "application"}
                      onChange={() => setEntrance("application")}
                      data-testid="beskt-entrance-application"
                    />
                    {t("beskt.startDialog.fromApplication")}
                  </label>
                  <label className="flex min-h-[44px] items-center gap-2">
                    <input
                      type="radio"
                      name="beskt-entrance"
                      checked={entrance === "invitation"}
                      onChange={() => setEntrance("invitation")}
                      data-testid="beskt-entrance-invitation"
                    />
                    {t("beskt.startDialog.byInvitation")}
                  </label>
                </div>
                {entrance === "application" ? (
                  <div className="mt-2">
                    <label htmlFor="beskt-start-application" className="text-sm font-medium">
                      {t("beskt.startDialog.application")}
                    </label>
                    <select
                      id="beskt-start-application"
                      className={FIELD}
                      value={applicationId}
                      onChange={(e) => setApplicationId(e.target.value)}
                    >
                      <option value="">{t("beskt.startDialog.chooseApplication")}</option>
                      {(applications.data ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {(lang === "sv" ? a.jobTitleSv : (a.jobTitleEn ?? a.jobTitleSv)) ?? a.id}{" "}
                          — {a.applicantDisplayName ?? t("beskt.startDialog.unnamed")} ·{" "}
                          {new Date(a.createdAt).toLocaleDateString(
                            lang === "sv" ? "sv-SE" : "en-GB",
                          )}
                        </option>
                      ))}
                    </select>
                    {applications.isSuccess && applications.data.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("beskt.startDialog.noApplications")}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="beskt-invite-email" className="text-sm font-medium">
                        {t("beskt.startDialog.email")}
                      </label>
                      <input
                        id="beskt-invite-email"
                        type="email"
                        autoComplete="off"
                        className={FIELD}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="beskt-invite-name" className="text-sm font-medium">
                        {t("beskt.startDialog.candidateName")}
                      </label>
                      <input
                        id="beskt-invite-name"
                        className={FIELD}
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="beskt-invite-role" className="text-sm font-medium">
                        {t("beskt.startDialog.roleTitle")}
                      </label>
                      <input
                        id="beskt-invite-role"
                        className={FIELD}
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("beskt.startDialog.invitationHint")}
                      </p>
                    </div>
                  </div>
                )}
              </fieldset>
            ) : null}

            <div>
              <label htmlFor="beskt-start-profile" className="text-sm font-semibold">
                {t("beskt.startDialog.profile")}
              </label>
              <select
                id="beskt-start-profile"
                className={FIELD}
                value={effectiveProfile}
                onChange={(e) => setProfileId(e.target.value)}
              >
                {(profiles.data ?? []).map((p) => (
                  <option key={p.exposureProfileId} value={p.exposureProfileId}>
                    {(
                      (lang === "sv" ? p.dutiesSv : (p.dutiesEn ?? p.dutiesSv)) ?? p.profileKey
                    ).slice(0, 90)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("beskt.startDialog.profileHint")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="beskt-start-interviewer" className="text-sm font-semibold">
                  {t("beskt.startDialog.interviewer")}
                </label>
                <select
                  id="beskt-start-interviewer"
                  className={FIELD}
                  value={interviewerId}
                  onChange={(e) => setInterviewerId(e.target.value)}
                >
                  <option value="">{t("beskt.startDialog.chooseInterviewer")}</option>
                  {eligibleInterviewers.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
                {vetting ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("beskt.startDialog.interviewerVetting")}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="beskt-start-contact" className="text-sm font-semibold">
                  {t("beskt.startDialog.contact")}
                </label>
                <input
                  id="beskt-start-contact"
                  className={FIELD}
                  value={contact}
                  onChange={(e) => {
                    setContactTouched(true);
                    setContact(e.target.value);
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("beskt.startDialog.contactHint")}
                </p>
              </div>
            </div>

            {vetting ? (
              <fieldset className="rounded-lg border p-3" data-testid="beskt-start-vetting">
                <legend className="px-1 text-sm font-semibold">
                  {t("beskt.startDialog.vettingHeading")}
                </legend>
                <p className="text-xs text-muted-foreground">
                  {t("beskt.startDialog.vettingLede")}
                </p>
                <label htmlFor="beskt-start-owner" className="mt-3 block text-sm font-medium">
                  {t("beskt.startDialog.securityOwner")}
                </label>
                <select
                  id="beskt-start-owner"
                  className={FIELD}
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                >
                  <option value="">{t("beskt.startDialog.chooseOwner")}</option>
                  {officers.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
                <label htmlFor="beskt-start-attestation" className="mt-3 block text-sm font-medium">
                  {t("beskt.startDialog.attestation")}
                </label>
                <textarea
                  id="beskt-start-attestation"
                  rows={3}
                  className={FIELD}
                  value={attestation}
                  onChange={(e) => setAttestation(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("beskt.startDialog.attestationHint")}
                </p>
                <label htmlFor="beskt-start-lawful" className="mt-3 block text-sm font-medium">
                  {t("beskt.startDialog.lawfulBasis")}
                </label>
                <textarea
                  id="beskt-start-lawful"
                  rows={2}
                  className={FIELD}
                  value={lawfulBasis}
                  onChange={(e) => setLawfulBasis(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("beskt.startDialog.lawfulBasisHint")}
                </p>
              </fieldset>
            ) : null}

            {method && effectiveProfile ? (
              <details className="rounded-lg border p-3" data-testid="beskt-start-questions">
                <summary className="min-h-[44px] cursor-pointer text-sm font-semibold">
                  {t("beskt.startDialog.questions")}
                </summary>
                <BesktQuestionPreview
                  employerId={employerId}
                  methodVersionId={method.methodVersionId}
                  exposureProfileId={effectiveProfile}
                />
              </details>
            ) : null}

            {start.isError ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription data-testid="beskt-start-dialog-error">
                  {t(besktErrorKey(start.error))}
                </AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => onOpenChange(false)}
              >
                {t("beskt.admin.family.cancel")}
              </Button>
              <Button
                type="submit"
                className="min-h-[44px]"
                disabled={!ready || start.isPending}
                data-testid="beskt-start-dialog-submit"
              >
                {start.isPending
                  ? t("beskt.startDialog.starting")
                  : entrance === "invitation" && !fixedApplicationId
                    ? t("beskt.startDialog.invite")
                    : t("beskt.startDialog.start")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
