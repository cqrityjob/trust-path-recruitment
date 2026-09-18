// The two grants, which are different things and must not be confused.
//
//   A GOVERNANCE grant says a named person may record one named review gate,
//   or may read published synthetic content as internal QA. It is about
//   authoring authority.
//
//   A PILOT grant says one named employer may assign one published version
//   to their own candidates, until a named date. It is about production
//   exposure, and it is the ONLY thing that makes anything assignable
//   anywhere — absent a live one, nothing is startable for anyone.
//
// They are rendered as two sections with two explanations for exactly that
// reason: an operator who granted the wrong one would either hand out review
// authority they meant to withhold, or expose a method to an employer they
// meant only to let review it.
//
// ── WHY A REVOKED GRANT STAYS ON THE SCREEN ─────────────────────────────
//
// Both tables are append-only apart from revocation, and both are read here
// in full. Hiding a revoked grant would make the history look like it never
// happened, which is the opposite of what an auditable mandate is for.
//
// ── WHY THE USER IS NAMED BY ID ─────────────────────────────────────────
//
// `beskt_governance_grants` holds a user id and nothing else, and
// `beskt_holds_grant` is internal so no browser principal can enumerate who
// holds which gate. Resolving the id to a name here would mean a second read
// of the user directory from a governance screen, which is a wider exposure
// than the mandate itself needs. The id is shown, and it is what the grantor
// pasted in.

import { useState } from "react";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { NoticePanel, StateBadge } from "@/components/admin/interview/PackGovernanceUi";
import { besktErrorKey } from "@/lib/beskt/errors";
import { besktGrantIsLive, besktPilotIsLive } from "./governance-logic";
import {
  BESKT_GRANT_KINDS,
  type BesktGovernanceGrant,
  type BesktGrantKind,
  type BesktPilotGrant,
} from "@/lib/beskt/governance.functions";

const BUTTON =
  "inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-md border border-transparent bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60";
const INPUT =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function GrantState({ live }: { live: boolean }) {
  const { t } = useT();
  return (
    <StateBadge tone={live ? "confirmed" : "neutral"} srPrefix={t("beskt.admin.grant.stateLabel")}>
      {t(live ? "beskt.admin.grant.live" : "beskt.admin.grant.notLive")}
    </StateBadge>
  );
}

export interface BesktGovernanceGrantActions {
  readonly busy: boolean;
  readonly error: unknown;
  readonly grant: (input: {
    userId: string;
    grantKind: BesktGrantKind;
    sourceReference: string;
    validUntil: string | null;
  }) => void;
  readonly revoke: (grantId: string, reason: string) => void;
}

export function BesktGovernanceGrants({
  grants,
  actions,
  now,
}: {
  grants: readonly BesktGovernanceGrant[];
  actions: BesktGovernanceGrantActions;
  /** Injected so the live/expired split is testable without moving the clock. */
  now: Date;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [grantKind, setGrantKind] = useState<BesktGrantKind>("personnel_security");
  const [sourceReference, setSourceReference] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  return (
    <section
      data-testid="beskt-governance-grants"
      className="rounded-lg border border-border p-4"
      aria-labelledby="beskt-gov-grants-h"
    >
      <h3 id="beskt-gov-grants-h" className="text-base font-semibold text-foreground">
        {t("beskt.admin.grants.heading")}
      </h3>
      <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.admin.grants.lede")}
      </p>
      <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.admin.grants.notARole")}
      </p>

      {actions.error != null && (
        <div className="mt-3">
          <NoticePanel tone="governance" role="alert" title={t("beskt.admin.actionRefused")}>
            <p>{t(besktErrorKey(actions.error))}</p>
          </NoticePanel>
        </div>
      )}

      {grants.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.admin.grants.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {grants.map((g) => (
            <li
              key={g.grantId}
              data-testid={`beskt-grant-${g.grantId}`}
              className="rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t(`beskt.admin.grantKind.${g.grantKind}` as TranslationKey)}
                  </p>
                  <code className="break-all font-mono text-xs text-muted-foreground">
                    {g.userId}
                  </code>
                </div>
                <GrantState live={besktGrantIsLive(g, now)} />
              </div>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("beskt.admin.grant.source")}</dt>
                  <dd className="break-words text-foreground">{g.sourceReference}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("beskt.admin.grant.window")}</dt>
                  <dd className="text-foreground">
                    {g.validFrom.slice(0, 10)} →{" "}
                    {g.validUntil?.slice(0, 10) ?? t("beskt.admin.grant.noEnd")}
                  </dd>
                </div>
                {g.revokedAt && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">{t("beskt.admin.grant.revoked")}</dt>
                    <dd className="text-foreground">
                      {g.revokedAt.slice(0, 10)} · {g.revokeReason}
                    </dd>
                  </div>
                )}
              </dl>

              {g.revokedAt === null && revoking !== g.grantId && (
                <button
                  type="button"
                  className={`${BUTTON} mt-3`}
                  disabled={actions.busy}
                  onClick={() => {
                    setRevoking(g.grantId);
                    setRevokeReason("");
                  }}
                >
                  {t("beskt.admin.grant.revokeAction")}
                </button>
              )}

              {revoking === g.grantId && (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    actions.revoke(g.grantId, revokeReason);
                  }}
                >
                  <label
                    htmlFor={`beskt-revoke-${g.grantId}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {t("beskt.admin.grant.revokeReason")}
                    <span className="text-destructive"> *</span>
                  </label>
                  <textarea
                    id={`beskt-revoke-${g.grantId}`}
                    className={INPUT}
                    rows={2}
                    required
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={PRIMARY}
                      disabled={actions.busy || revokeReason.trim() === ""}
                    >
                      {t("beskt.admin.grant.revokeConfirm")}
                    </button>
                    <button type="button" className={BUTTON} onClick={() => setRevoking(null)}>
                      {t("beskt.admin.family.cancel")}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button type="button" className={`${PRIMARY} mt-4`} onClick={() => setOpen(true)}>
          {t("beskt.admin.grants.add")}
        </button>
      ) : (
        <form
          className="mt-4 space-y-3 rounded-md border border-border bg-muted/20 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            actions.grant({
              userId: userId.trim(),
              grantKind,
              sourceReference: sourceReference.trim(),
              validUntil: validUntil.trim() === "" ? null : new Date(validUntil).toISOString(),
            });
          }}
        >
          <div>
            <label htmlFor="beskt-grant-user" className="text-sm font-medium text-foreground">
              {t("beskt.admin.grant.userId")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-grant-user"
              className={INPUT}
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.grant.userIdHelp")}
            </p>
          </div>
          <div>
            <label htmlFor="beskt-grant-kind" className="text-sm font-medium text-foreground">
              {t("beskt.admin.grant.kind")}
            </label>
            <select
              id="beskt-grant-kind"
              className={INPUT}
              value={grantKind}
              onChange={(e) => setGrantKind(e.target.value as BesktGrantKind)}
            >
              {BESKT_GRANT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`beskt.admin.grantKind.${k}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="beskt-grant-source" className="text-sm font-medium text-foreground">
              {t("beskt.admin.grant.source")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-grant-source"
              className={INPUT}
              required
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.grant.sourceHelp")}
            </p>
          </div>
          <div>
            <label htmlFor="beskt-grant-until" className="text-sm font-medium text-foreground">
              {t("beskt.admin.grant.validUntil")}
            </label>
            <input
              id="beskt-grant-until"
              type="date"
              className={INPUT}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={actions.busy}>
              {actions.busy ? t("beskt.admin.lifecycle.working") : t("beskt.admin.grants.add")}
            </button>
            <button type="button" className={BUTTON} onClick={() => setOpen(false)}>
              {t("beskt.admin.family.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export interface BesktPilotGrantActions {
  readonly busy: boolean;
  readonly error: unknown;
  readonly canGrant: boolean;
  readonly grant: (input: {
    employerId: string;
    sourceReference: string;
    expiresOn: string;
  }) => void;
  readonly revoke: (employerId: string, reason: string) => void;
}

export function BesktPilotGrants({
  grants,
  actions,
  today,
}: {
  grants: readonly BesktPilotGrant[];
  actions: BesktPilotGrantActions;
  /** ISO date, injected so "live" is testable without moving the clock. */
  today: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [employerId, setEmployerId] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  return (
    <section
      data-testid="beskt-pilot-grants"
      className="rounded-lg border border-border p-4"
      aria-labelledby="beskt-pilot-grants-h"
    >
      <h3 id="beskt-pilot-grants-h" className="text-base font-semibold text-foreground">
        {t("beskt.admin.pilot.heading")}
      </h3>
      <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
        {t("beskt.admin.pilot.lede")}
      </p>
      <p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-muted-foreground">
        {t("beskt.admin.pilot.onlyThingThatOpensIt")}
      </p>

      {actions.error != null && (
        <div className="mt-3">
          <NoticePanel tone="governance" role="alert" title={t("beskt.admin.actionRefused")}>
            <p>{t(besktErrorKey(actions.error))}</p>
          </NoticePanel>
        </div>
      )}

      {grants.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("beskt.admin.pilot.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {grants.map((g) => (
            <li
              key={g.grantId}
              data-testid={`beskt-pilot-${g.employerId}`}
              className="rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {g.employerName ?? t("beskt.admin.pilot.unnamedEmployer")}
                  </p>
                  <code className="break-all font-mono text-xs text-muted-foreground">
                    {g.employerId}
                  </code>
                </div>
                <GrantState live={besktPilotIsLive(g, today)} />
              </div>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("beskt.admin.grant.source")}</dt>
                  <dd className="break-words text-foreground">{g.sourceReference}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("beskt.admin.grant.window")}</dt>
                  <dd className="text-foreground">
                    {g.startsOn} → {g.expiresOn}
                  </dd>
                </div>
                {g.revokedAt && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">{t("beskt.admin.grant.revoked")}</dt>
                    <dd className="text-foreground">
                      {g.revokedAt.slice(0, 10)} · {g.revokedReason}
                    </dd>
                  </div>
                )}
              </dl>

              {g.revokedAt === null && revoking !== g.grantId && (
                <button
                  type="button"
                  className={`${BUTTON} mt-3`}
                  disabled={actions.busy}
                  onClick={() => {
                    setRevoking(g.grantId);
                    setRevokeReason("");
                  }}
                >
                  {t("beskt.admin.grant.revokeAction")}
                </button>
              )}

              {revoking === g.grantId && (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    actions.revoke(g.employerId, revokeReason);
                  }}
                >
                  <label
                    htmlFor={`beskt-pilot-revoke-${g.grantId}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {t("beskt.admin.grant.revokeReason")}
                    <span className="text-destructive"> *</span>
                  </label>
                  <textarea
                    id={`beskt-pilot-revoke-${g.grantId}`}
                    className={INPUT}
                    rows={2}
                    required
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={PRIMARY}
                      disabled={actions.busy || revokeReason.trim() === ""}
                    >
                      {t("beskt.admin.grant.revokeConfirm")}
                    </button>
                    <button type="button" className={BUTTON} onClick={() => setRevoking(null)}>
                      {t("beskt.admin.family.cancel")}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {!actions.canGrant ? (
        <p className="mt-4 max-w-[80ch] text-sm text-muted-foreground">
          {t("beskt.admin.pilot.publishedOnly")}
        </p>
      ) : !open ? (
        <button type="button" className={`${PRIMARY} mt-4`} onClick={() => setOpen(true)}>
          {t("beskt.admin.pilot.add")}
        </button>
      ) : (
        <form
          className="mt-4 space-y-3 rounded-md border border-border bg-muted/20 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            actions.grant({
              employerId: employerId.trim(),
              sourceReference: sourceReference.trim(),
              expiresOn,
            });
          }}
        >
          <div>
            <label htmlFor="beskt-pilot-employer" className="text-sm font-medium text-foreground">
              {t("beskt.admin.pilot.employerId")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-pilot-employer"
              className={INPUT}
              required
              value={employerId}
              onChange={(e) => setEmployerId(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.pilot.employerIdHelp")}
            </p>
          </div>
          <div>
            <label htmlFor="beskt-pilot-source" className="text-sm font-medium text-foreground">
              {t("beskt.admin.grant.source")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-pilot-source"
              className={INPUT}
              required
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="beskt-pilot-expires" className="text-sm font-medium text-foreground">
              {t("beskt.admin.pilot.expiresOn")}
              <span className="text-destructive"> *</span>
            </label>
            <input
              id="beskt-pilot-expires"
              type="date"
              className={INPUT}
              required
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-muted-foreground">
              {t("beskt.admin.pilot.expiresOnHelp")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={PRIMARY} disabled={actions.busy}>
              {actions.busy ? t("beskt.admin.lifecycle.working") : t("beskt.admin.pilot.add")}
            </button>
            <button type="button" className={BUTTON} onClick={() => setOpen(false)}>
              {t("beskt.admin.family.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
