// The owner's tools for internal functional testing of BESKT:
//   - install the BESKT v0.1 content as a governed draft (editor);
//   - record, and revoke, an employer-scoped internal test activation
//     (platform admin) — a decision that is NOT a review;
//   - grant or withdraw platform content roles (platform admin).
//
// Every action is a governed RPC; the database refuses anyone it should.
// Nothing here can approve, publish or label a method as reviewed.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import { NoticePanel } from "@/components/admin/interview/PackGovernanceUi";
import { BesktVersionLink, type BesktSurface } from "@/components/admin/beskt/surface";
import { besktErrorKey } from "@/lib/beskt/errors";
import {
  getBesktV01Installation,
  grantBesktTestActivation,
  installBesktV01Step,
  listBesktTestActivations,
  revokeBesktTestActivation,
  setBesktContentRole,
  type BesktInstallProgress,
  type BesktV01Method,
} from "@/lib/beskt/internal-test.functions";

const BUTTON =
  "inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-md border border-transparent bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
const INPUT =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function inDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Install BESKT v0.1                                                  */
/* ------------------------------------------------------------------ */

export function BesktInstallV01Card({
  surface,
  method = "rekrytering",
}: {
  readonly surface: BesktSurface;
  /** Which of the two v0.1 methods: recruitment support, or security vetting
   *  (B, E, S, K and T with the three activation requirements). */
  readonly method?: BesktV01Method;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const installationFn = useServerFn(getBesktV01Installation);
  const stepFn = useServerFn(installBesktV01Step);
  const [lawfulBasis, setLawfulBasis] = useState("");
  const [progress, setProgress] = useState<BesktInstallProgress | null>(null);

  const installation = useQuery({
    queryKey: ["admin", "beskt-v01-installation", method],
    queryFn: () => installationFn({ data: { method } }),
    retry: false,
  });

  const install = useMutation({
    mutationFn: async () => {
      // Step 0 resumes: it reuses an existing method and draft, so an
      // interrupted or repeated install never creates a second one.
      let p: BesktInstallProgress = await stepFn({
        data: { step: 0, methodVersionId: null, lawfulBasisReference: lawfulBasis, method },
      });
      let step = 1;
      setProgress(p);
      while (!p.finished) {
        p = await stepFn({
          data: {
            step,
            methodVersionId: p.methodVersionId,
            lawfulBasisReference: lawfulBasis,
            method,
          },
        });
        setProgress(p);
        step += 1;
      }
      return p;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "beskt-v01-installation"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "beskt-methods"] });
    },
  });

  const existing = installation.data ?? null;
  const editable = existing === null || existing.status === "draft";
  const finished = install.data ?? null;

  return (
    <section
      className="mt-6 rounded-lg border border-border p-4"
      data-testid={method === "rekrytering" ? "beskt-install-v01" : "beskt-install-v01-sakerhet"}
      aria-labelledby={`beskt-install-v01-h-${method}`}
    >
      <h2 id={`beskt-install-v01-h-${method}`} className="text-base font-semibold text-foreground">
        {t(
          method === "rekrytering"
            ? "beskt.internalTest.install.heading"
            : "beskt.internalTest.install.headingVetting",
        )}
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t(
          method === "rekrytering"
            ? "beskt.internalTest.install.lede"
            : "beskt.internalTest.install.ledeVetting",
        )}
      </p>

      {existing ? (
        <p className="mt-3 text-sm" data-testid="beskt-install-v01-existing">
          {t("beskt.internalTest.install.exists")}{" "}
          <BesktVersionLink
            surface={surface}
            methodVersionId={existing.methodVersionId}
            className="font-medium underline underline-offset-2"
          >
            {t("beskt.internalTest.install.open")}
          </BesktVersionLink>
        </p>
      ) : null}

      {editable ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            install.mutate();
          }}
        >
          <div>
            <label
              htmlFor={`beskt-install-lawful-${method}`}
              className="text-sm font-medium text-foreground"
            >
              {t("beskt.internalTest.install.lawfulBasis")}
              <span className="text-destructive"> *</span>
            </label>
            <textarea
              id={`beskt-install-lawful-${method}`}
              className={INPUT}
              rows={3}
              required
              minLength={20}
              value={lawfulBasis}
              onChange={(e) => setLawfulBasis(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.internalTest.install.lawfulBasisHelp")}
            </p>
          </div>
          <button
            type="submit"
            className={PRIMARY}
            disabled={install.isPending || lawfulBasis.trim().length < 20}
            data-testid="beskt-install-v01-submit"
          >
            {install.isPending
              ? t("beskt.internalTest.install.working")
              : existing
                ? t("beskt.internalTest.install.rerun")
                : t("beskt.internalTest.install.action")}
          </button>
        </form>
      ) : null}

      <div aria-live="polite">
        {progress && !progress.finished ? (
          <p
            className="mt-3 text-sm text-muted-foreground"
            data-testid="beskt-install-v01-progress"
          >
            {t("beskt.internalTest.install.progress")} {progress.done} / {progress.total}
          </p>
        ) : null}
        {finished ? (
          <div className="mt-3" data-testid="beskt-install-v01-done">
            <NoticePanel
              tone={finished.blocking.length === 0 ? "confirmed" : "attention"}
              title={
                finished.blocking.length === 0
                  ? t("beskt.internalTest.install.doneTitle")
                  : t("beskt.internalTest.install.blockedTitle")
              }
            >
              <p>
                {finished.blocking.length === 0
                  ? t("beskt.internalTest.install.doneBody")
                  : finished.blocking.join(", ")}
              </p>
              <p>
                <BesktVersionLink
                  surface={surface}
                  methodVersionId={finished.methodVersionId}
                  tab="access"
                  className="font-medium underline underline-offset-2"
                >
                  {t("beskt.internalTest.install.nextStep")}
                </BesktVersionLink>
              </p>
            </NoticePanel>
          </div>
        ) : null}
        {install.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t(besktErrorKey(install.error))}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Internal test activation                                            */
/* ------------------------------------------------------------------ */

export function BesktTestActivationPanel({
  methodVersionId,
}: {
  readonly methodVersionId: string;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listBesktTestActivations);
  const grantFn = useServerFn(grantBesktTestActivation);
  const revokeFn = useServerFn(revokeBesktTestActivation);
  const key = ["admin", "beskt-test-activations", methodVersionId] as const;

  const [employerSlug, setEmployerSlug] = useState("");
  const [decision, setDecision] = useState("");
  const [expiresOn, setExpiresOn] = useState(inDays(30));
  const [grantOp, setGrantOp] = useState(() => crypto.randomUUID());
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { methodVersionId } }),
    retry: false,
  });

  const grant = useMutation({
    mutationFn: () =>
      grantFn({
        data: {
          operationId: grantOp,
          employerSlug,
          methodVersionId,
          decisionReference: decision,
          expiresOn,
        },
      }),
    onSuccess: async () => {
      setGrantOp(crypto.randomUUID());
      setDecision("");
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const revoke = useMutation({
    mutationFn: (activationId: string) =>
      revokeFn({ data: { operationId: crypto.randomUUID(), activationId, reason } }),
    onSuccess: async () => {
      setRevoking(null);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <section
      className="rounded-lg border border-border p-4"
      data-testid="beskt-test-activations"
      aria-labelledby="beskt-test-activations-h"
    >
      <h3 id="beskt-test-activations-h" className="text-base font-semibold text-foreground">
        {t("beskt.internalTest.activation.heading")}
      </h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t("beskt.internalTest.activation.lede")}
      </p>
      <div className="mt-3">
        <NoticePanel tone="attention" title={t("beskt.internalTest.activation.notReviewTitle")}>
          <p>{t("beskt.internalTest.activation.notReviewBody")}</p>
        </NoticePanel>
      </div>

      {list.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t(besktErrorKey(list.error))}
        </p>
      ) : (list.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("beskt.internalTest.activation.none")}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {(list.data ?? []).map((a) => (
            <li
              key={a.activationId}
              className="rounded-md border border-border p-3 text-sm"
              data-testid={`beskt-test-activation-${a.activationId}`}
            >
              <p className="font-medium">
                {a.employerName} ·{" "}
                {a.isLive
                  ? t("beskt.internalTest.activation.live")
                  : a.revokedAt
                    ? t("beskt.internalTest.activation.revoked")
                    : t("beskt.internalTest.activation.notLive")}
              </p>
              <p className="mt-1 text-muted-foreground">{a.decisionReference}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("beskt.internalTest.activation.until")} {a.expiresOn} ·{" "}
                <span className="break-all font-mono">{a.pinnedContentHash.slice(0, 12)}…</span>
              </p>
              {a.revokedAt === null ? (
                revoking === a.activationId ? (
                  <form
                    className="mt-2 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      revoke.mutate(a.activationId);
                    }}
                  >
                    <label
                      htmlFor={`beskt-ta-reason-${a.activationId}`}
                      className="text-sm font-medium text-foreground"
                    >
                      {t("beskt.internalTest.activation.revokeReason")}
                    </label>
                    <input
                      id={`beskt-ta-reason-${a.activationId}`}
                      className={INPUT}
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className={PRIMARY} disabled={revoke.isPending}>
                        {t("beskt.internalTest.activation.revokeConfirm")}
                      </button>
                      <button type="button" className={BUTTON} onClick={() => setRevoking(null)}>
                        {t("beskt.admin.family.cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className={`${BUTTON} mt-2`}
                    onClick={() => setRevoking(a.activationId)}
                  >
                    {t("beskt.internalTest.activation.revoke")}
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 space-y-3 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          grant.mutate();
        }}
      >
        <div>
          <label htmlFor="beskt-ta-employer" className="text-sm font-medium text-foreground">
            {t("beskt.internalTest.activation.employer")}
            <span className="text-destructive"> *</span>
          </label>
          <input
            id="beskt-ta-employer"
            className={INPUT}
            required
            placeholder="cqrityjob"
            value={employerSlug}
            onChange={(e) => setEmployerSlug(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("beskt.internalTest.activation.employerHelp")}
          </p>
        </div>
        <div>
          <label htmlFor="beskt-ta-decision" className="text-sm font-medium text-foreground">
            {t("beskt.internalTest.activation.decision")}
            <span className="text-destructive"> *</span>
          </label>
          <textarea
            id="beskt-ta-decision"
            className={INPUT}
            rows={3}
            required
            minLength={10}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="beskt-ta-expires" className="text-sm font-medium text-foreground">
            {t("beskt.internalTest.activation.expires")}
            <span className="text-destructive"> *</span>
          </label>
          <input
            id="beskt-ta-expires"
            type="date"
            className={INPUT}
            required
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className={PRIMARY}
          disabled={grant.isPending}
          data-testid="beskt-test-activation-submit"
        >
          {t("beskt.internalTest.activation.action")}
        </button>
        {grant.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {/* An unknown short name is the admin's typo, not an access refusal. */}
            {grant.error.message.includes("BCP_EMPLOYER_NOT_FOUND")
              ? t("beskt.internalTest.activation.employerUnknown")
              : t(besktErrorKey(grant.error))}
          </p>
        ) : null}
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Content roles                                                        */
/* ------------------------------------------------------------------ */

export function BesktContentRolesPanel() {
  const { t } = useT();
  const setFn = useServerFn(setBesktContentRole);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "reviewer" | "publisher">("editor");
  const [grantRole, setGrantRole] = useState(true);
  const [reason, setReason] = useState("");
  const [op, setOp] = useState(() => crypto.randomUUID());

  const change = useMutation({
    mutationFn: () => setFn({ data: { operationId: op, email, role, grant: grantRole, reason } }),
    onSuccess: () => {
      setOp(crypto.randomUUID());
      setReason("");
    },
  });

  return (
    <section
      className="mt-6 rounded-lg border border-border p-4"
      data-testid="beskt-content-roles"
      aria-labelledby="beskt-content-roles-h"
    >
      <h2 id="beskt-content-roles-h" className="text-base font-semibold text-foreground">
        {t("beskt.internalTest.roles.heading")}
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {t("beskt.internalTest.roles.lede")}
      </p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <div>
          <label htmlFor="beskt-role-email" className="text-sm font-medium text-foreground">
            {t("beskt.internalTest.roles.email")}
          </label>
          <input
            id="beskt-role-email"
            type="email"
            className={INPUT}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="beskt-role-role" className="text-sm font-medium text-foreground">
            {t("beskt.internalTest.roles.role")}
          </label>
          <select
            id="beskt-role-role"
            className={INPUT}
            value={role}
            onChange={(e) => setRole(e.target.value as "editor" | "reviewer" | "publisher")}
          >
            <option value="editor">{t("beskt.internalTest.roles.editor")}</option>
            <option value="reviewer">{t("beskt.internalTest.roles.reviewer")}</option>
            <option value="publisher">{t("beskt.internalTest.roles.publisher")}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="beskt-role-reason" className="text-sm font-medium text-foreground">
            {t("beskt.internalTest.roles.reason")}
          </label>
          <input
            id="beskt-role-reason"
            className={INPUT}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-foreground">
            {t("beskt.internalTest.roles.change")}
          </legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <label className="flex min-h-[44px] items-center gap-2">
              <input type="radio" checked={grantRole} onChange={() => setGrantRole(true)} />
              {t("beskt.internalTest.roles.grant")}
            </label>
            <label className="flex min-h-[44px] items-center gap-2">
              <input type="radio" checked={!grantRole} onChange={() => setGrantRole(false)} />
              {t("beskt.internalTest.roles.withdraw")}
            </label>
          </div>
        </fieldset>
        <div className="sm:col-span-2" aria-live="polite">
          <button
            type="submit"
            className={PRIMARY}
            disabled={change.isPending}
            data-testid="beskt-content-role-submit"
          >
            {t("beskt.internalTest.roles.action")}
          </button>
          {change.isSuccess ? (
            <p className="mt-2 text-sm" data-testid="beskt-content-role-done">
              {change.data.action === "granted"
                ? t("beskt.internalTest.roles.granted")
                : t("beskt.internalTest.roles.withdrawn")}
            </p>
          ) : null}
          {change.isError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t(besktErrorKey(change.error))}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
