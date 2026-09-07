// Security Passport — "Dela Passport", as a decision rather than a button.
//
// ── WHAT THIS REPLACED, AND WHY ────────────────────────────────────────
//
// The previous screen made ONE choice on the holder's behalf and hid the
// rest: press "Dela mitt Passport" and a `public_card` link went out
// carrying every verified credential the holder owned, for 30 days, with
// the package taxonomy, the expiry select, a QR code, four image formats
// and a LinkedIn walkthrough folded away under "Fler alternativ".
//
// That was the right correction to make to a screen that had put a
// disclosure engine on the outside. It left two things wrong, and both are
// about the holder's authority over their own record:
//
//   1. THEY COULD NOT CHOOSE. The smallest thing a package share could
//      carry was every verified credential. A holder sending one licence to
//      one agency disclosed the lot.
//
//   2. THE SCOPE KEPT GROWING. A package is evaluated when the link is
//      OPENED, so a credential verified in March silently joined a link
//      sent in January. Nobody was told, and nothing recorded that the
//      holder had never agreed to it.
//
// So the screen is now four short steps — choose, look, set, create — and
// the scope is pinned in the database at creation (`sp_disclosure_items`).
// The five packages are untouched and still reachable through the
// application-scoped and single-credential paths; this screen simply stops
// being the place a taxonomy is taught.
//
// ── THE PREVIEW IS THE PAGE ────────────────────────────────────────────
//
// "Förhandsgranska mottagarens vy" renders `RecipientPassportView` from a
// payload `sp_preview_selected_disclosure` built with the SAME database
// function the live link goes through. It is not a mock and there is no
// second view model to keep in step. If the preview is wrong, the recipient
// page is wrong in exactly the same way, which is the only honest
// relationship the two can have.
//
// ── WHAT MAY BE SHARED, AND WHAT IS SAID ABOUT IT ──────────────────────
//
// Every CURRENT merit, at whatever standing it has — see share-policy.ts. A
// self-declared entry is offered beside a source-confirmed one, each wearing
// the word the shared labeller gives it, and drafts and archived rows are
// never offered at all.
//
// A merit with a review case open on it is offered TOO, with the case stated
// beside it: the recipient reads its stored standing either way, and the
// holder is the one who needs to know the standing may be about to move. When
// the review read FAILS, every affected row says so instead of falling back
// to a settled word.
//
// ── WHAT THIS SCREEN DOES NOT CLAIM ────────────────────────────────────
//
// * It does not say a recipient has READ anything. `access_count` counts
//   every open, including the holder's own verification click and any
//   prefetch, and no durable read-receipt model exists. It is labelled as
//   what it is.
// * It cannot re-show a link. Only the token's SHA-256 is stored, so a link
//   the holder did not capture is gone — deliberately, because a recoverable
//   link is a standing liability. What the list offers instead is a NEW link
//   over the same contents, with the holder's own choice about whether the
//   old one keeps working.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronLeft, Copy, ExternalLink, Link2, ShieldCheck } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { getMyPassport, type PassportSnapshot } from "@/lib/security-passport/passport.functions";
import { listMyVerificationRequests } from "@/lib/security-passport/verification.functions";
import {
  deriveVerificationAttention,
  type VerificationAttention,
} from "@/lib/professional-identity/verification-attention";
import type { ReviewReadState } from "@/lib/security-passport/workspace";
import {
  buildShareSelection,
  meritKey,
  splitSelection,
  type ShareSelectionModel,
} from "@/lib/security-passport/share-selection";
import { hasCaveat, type ShareReviewCaveat } from "@/lib/security-passport/share-policy";
import { shareErrorCode, type ShareErrorCode } from "@/lib/security-passport/share-errors";
import {
  createSelectedShare,
  listMyShares,
  previewSelectedShare,
  replaceShare,
  revokeShare,
  type ShareRecord,
} from "@/lib/security-passport/selected-sharing.functions";
import type { RecipientPayload } from "@/lib/security-passport/packages";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { RecipientPassportView } from "@/components/security-passport/live/RecipientPassportView";
import { publicShareUrl, publicShareOrigin } from "@/lib/security-passport/public-origin";
import { MeritStatusChip } from "@/components/security-passport/MeritStatusChip";
import { formatIsoDay, formatIsoDayRange } from "@/lib/security-passport/format";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { PassportLang } from "@/lib/security-passport/i18n";

export const Route = createFileRoute("/_authenticated/passport/share")({
  ssr: false,
  component: PassportShareRoute,
});

/** 30 days is recommended and preselected. There is deliberately no
 *  "no expiry" option on this screen: a link with no end is a decision the
 *  holder cannot revisit, and every one of them is one forgotten tab away
 *  from being permanent. */
const EXPIRY_CHOICES: readonly { days: number; labelKey: PassportCopyKey }[] = [
  { days: 7, labelKey: "sc.expiry.7" },
  { days: 30, labelKey: "sc.expiry.30" },
  { days: 90, labelKey: "sc.expiry.90" },
];

const DEFAULT_EXPIRY_DAYS = 30;

/** What a holder is told when the database refuses.
 *
 *  Keyed on the CODE the function raised, never on its sentence: the sentence
 *  is English, untranslated, and written for a log. Anything this build has no
 *  words for takes the generic message rather than a guess at which rule was
 *  broken. */
const CREATE_ERROR_KEY: Readonly<Record<ShareErrorCode, PassportCopyKey>> = {
  merit_not_shareable: "sel.error.meritGone",
  nothing_selected: "sel.chooseFirst",
  too_many_merits: "sel.error.create",
  unsupported_expiry: "sel.error.expiry",
  unsupported_locale: "sel.error.locale",
  request_key_required: "sel.error.create",
  request_key_conflict: "sel.error.conflict",
  share_not_replaceable: "sel.error.notReplaceable",
  no_passport: "sc.needPassport",
  not_authenticated: "sel.error.create",
  unknown: "sel.error.create",
};

const REISSUE_ERROR_KEY: Readonly<Record<ShareErrorCode, PassportCopyKey>> = {
  ...CREATE_ERROR_KEY,
  merit_not_shareable: "sel.error.lapsed",
  unknown: "sel.error.reissue",
};

const CAVEAT_KEY: Readonly<Record<Exclude<ShareReviewCaveat, "none">, PassportCopyKey>> = {
  in_review: "sel.caveat.in_review",
  needs_answer: "sel.caveat.needs_answer",
  unknown: "sel.caveat.unknown",
};

const STATE_KEY: Readonly<Record<ShareRecord["state"], PassportCopyKey>> = {
  active: "sc.state.active",
  expired: "sc.state.expired",
  revoked: "sc.state.revoked",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A stable id for one create ATTEMPT. Re-sent unchanged on a retry, so a
 *  response lost after the database committed reconciles to the share that
 *  already exists instead of minting a second one. */
function newRequestKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Older Safari in a non-secure context. A v4-shaped string is all the
  // server needs; it is an idempotency key, not a secret.
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i += 1) {
    out +=
      i === 8 || i === 13 || i === 18 || i === 23
        ? "-"
        : i === 14
          ? "4"
          : hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

type CreateOutcome =
  | {
      readonly kind: "created";
      readonly token: string;
      readonly expiresAt: string | null;
      /** Only a reissue answers this. Null for an ordinary creation, which
       *  replaced nothing. */
      readonly previousRevoked?: boolean | null;
    }
  | { readonly kind: "already"; readonly disclosureId: string; readonly expiresAt: string | null };

type LoadState = "loading" | "ready" | "failed";

function PassportShareRoute() {
  const { pt, lang } = usePassportCopy();

  const loadPassport = useServerFn(getMyPassport);
  const loadRequests = useServerFn(listMyVerificationRequests);
  const loadShares = useServerFn(listMyShares);
  const doPreview = useServerFn(previewSelectedShare);
  const doCreate = useServerFn(createSelectedShare);
  const doRevoke = useServerFn(revokeShare);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [passportState, setPassportState] = useState<LoadState>("loading");
  const [attention, setAttention] = useState<VerificationAttention | null>(null);
  const [reviewState, setReviewState] = useState<ReviewReadState>("loading");
  const [shares, setShares] = useState<readonly ShareRecord[] | null>(null);
  const [sharesState, setSharesState] = useState<LoadState>("loading");

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expiryDays, setExpiryDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
  const [shareLang, setShareLang] = useState<PassportLang>(lang);

  const [preview, setPreview] = useState<RecipientPayload | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<LoadState>("loading");

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<PassportCopyKey | null>(null);
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState(false);
  /** Which share the holder is reissuing, and whether they chose to revoke
   *  the one it replaces. Opened per row, so the choice is made about a
   *  specific link rather than in the abstract. */
  const [reissueFor, setReissueFor] = useState<string | null>(null);
  const [reissueRevoke, setReissueRevoke] = useState(true);
  const [reissuing, setReissuing] = useState<string | null>(null);
  const [reissueError, setReissueError] = useState<PassportCopyKey | null>(null);

  // Held across retries so a lost response cannot become two links. Cleared
  // only once a create has succeeded.
  const requestKey = useRef<string>(newRequestKey());
  const reissueKey = useRef<string>(newRequestKey());
  const linkFieldRef = useRef<HTMLInputElement | null>(null);

  /* ---------------------------------------------------------------- */
  /* Reads. Independent, because their failures cost different things. */
  /* ---------------------------------------------------------------- */

  const readPassport = useCallback(async () => {
    setPassportState("loading");
    try {
      setSnapshot(await loadPassport({ data: undefined }));
      setPassportState("ready");
    } catch (err) {
      console.error("[passport] share: passport read failed", err);
      setPassportState("failed");
    }
  }, [loadPassport]);

  const readShares = useCallback(async () => {
    setSharesState("loading");
    try {
      setShares(await loadShares({ data: undefined }));
      setSharesState("ready");
    } catch (err) {
      console.error("[passport] share: share list read failed", err);
      setSharesState("failed");
    }
  }, [loadShares]);

  useEffect(() => {
    void readPassport();
    void readShares();
  }, [readPassport, readShares]);

  useEffect(() => {
    let alive = true;
    void loadRequests({ data: undefined })
      .then((rows) => {
        if (!alive) return;
        setAttention(deriveVerificationAttention(rows.requests, new Date()));
        setReviewState("available");
      })
      .catch(() => {
        if (alive) setReviewState("failed");
      });
    return () => {
      alive = false;
    };
  }, [loadRequests]);

  /* ---------------------------------------------------------------- */
  /* What may be shared                                                */
  /* ---------------------------------------------------------------- */

  const selection: ShareSelectionModel | null = useMemo(() => {
    if (!snapshot) return null;
    return buildShareSelection({
      claims: snapshot.holder.claims,
      periods: snapshot.holder.periods,
      attention: reviewState === "available" ? attention : null,
      reviewState,
      now: new Date(),
    });
  }, [snapshot, attention, reviewState]);

  const selectedIds = useMemo(() => splitSelection(selected), [selected]);
  const selectedCount = selected.size;

  // A merit that vanished from under the holder — archived, revoked or
  // superseded in another tab — must not stay silently selected and then
  // fail the create with a database error.
  const availableKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const group of selection?.groups ?? []) {
      for (const candidate of group.candidates) keys.add(meritKey(candidate.merit));
    }
    return keys;
  }, [selection]);

  const droppedCount = useMemo(
    () => [...selected].filter((k) => !availableKeys.has(k)).length,
    [selected, availableKeys],
  );

  useEffect(() => {
    if (droppedCount === 0) return;
    setSelected((prev) => new Set([...prev].filter((k) => availableKeys.has(k))));
  }, [droppedCount, availableKeys]);

  /* ---------------------------------------------------------------- */
  /* The preview, from the server, through the one builder             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!previewOpen || selectedCount === 0) return;
    let alive = true;
    setPreviewState("loading");
    void doPreview({
      data: {
        claimIds: selectedIds.claimIds,
        experienceIds: selectedIds.experienceIds,
        expiresDays: expiryDays,
        locale: shareLang,
      },
    })
      .then((payload) => {
        if (!alive) return;
        setPreview(payload);
        setPreviewState("ready");
      })
      .catch((err) => {
        console.error("[passport] share: preview failed", err);
        if (alive) setPreviewState("failed");
      });
    return () => {
      alive = false;
    };
  }, [previewOpen, selectedCount, selectedIds, expiryDays, shareLang, doPreview]);

  const previewPresentation = useMemo(
    () => (preview?.status === "active" ? buildRecipientPresentation(preview, today()) : null),
    [preview],
  );

  /* ---------------------------------------------------------------- */
  /* Creating, copying, revoking                                       */
  /* ---------------------------------------------------------------- */

  const shareUrl = outcome?.kind === "created" ? publicShareUrl(outcome.token) : null;

  async function onCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await doCreate({
        data: {
          claimIds: selectedIds.claimIds,
          experienceIds: selectedIds.experienceIds,
          expiresDays: expiryDays,
          locale: shareLang,
          requestKey: requestKey.current,
        },
      });
      if (result.status === "created") {
        setOutcome({ kind: "created", token: result.token, expiresAt: result.expiresAt });
      } else {
        setOutcome({
          kind: "already",
          disclosureId: result.disclosureId,
          expiresAt: result.expiresAt,
        });
      }
      // The attempt is over either way; the next create is a new decision.
      requestKey.current = newRequestKey();
      await readShares();
    } catch (err) {
      console.error("[passport] share: create failed", err);
      // The key is deliberately NOT rotated: a retry must reconcile with
      // whatever this attempt may already have committed.
      setCreateError(CREATE_ERROR_KEY[shareErrorCode(err)]);
    } finally {
      setCreating(false);
    }
  }

  async function onCopy() {
    if (!shareUrl) return;
    setCopyFailed(false);
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      // A blocked or absent clipboard is ordinary — an insecure context, a
      // permission denied, an old browser. The link is put where it can be
      // copied by hand rather than the failure being swallowed.
      setCopyFailed(true);
      linkFieldRef.current?.focus();
      linkFieldRef.current?.select();
    }
  }

  /** A NEW link over the same contents. The holder said whether the previous
   *  one should be revoked; both answers are legitimate and neither is
   *  assumed, so the flag travels exactly as they set it. */
  async function onReissue(id: string, revokePrevious: boolean) {
    setReissuing(id);
    setReissueError(null);
    try {
      const result = await replaceShare({
        data: { disclosureId: id, revokePrevious, requestKey: reissueKey.current },
      });
      if (result.status === "created") {
        setOutcome({
          kind: "created",
          token: result.token,
          expiresAt: result.expiresAt,
          previousRevoked: result.previousRevoked,
        });
      } else {
        setOutcome({
          kind: "already",
          disclosureId: result.disclosureId,
          expiresAt: result.expiresAt,
        });
      }
      reissueKey.current = newRequestKey();
      setReissueFor(null);
      await readShares();
    } catch (err) {
      console.error("[passport] share: reissue failed", err);
      // Same rule as the create: a failed attempt keeps its key, so a retry
      // reconciles instead of minting a second link.
      setReissueError(REISSUE_ERROR_KEY[shareErrorCode(err)]);
    } finally {
      setReissuing(null);
    }
  }

  async function onRevoke(id: string) {
    setRevoking(id);
    setRevokeError(false);
    try {
      await doRevoke({ data: { disclosureId: id } });
      await readShares();
    } catch (err) {
      console.error("[passport] share: revoke failed", err);
      setRevokeError(true);
    } finally {
      setRevoking(null);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (passportState === "loading") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
      </div>
    );
  }

  if (passportState === "failed") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{pt("sel.title")}</h1>
        <div role="alert" className="mt-4 rounded-xl border border-border bg-card p-5">
          <p className="text-sm leading-relaxed text-foreground">{pt("sel.error.passport")}</p>
          <button
            type="button"
            onClick={() => void readPassport()}
            className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("common.retry")}
          </button>
        </div>
        <BackLink label={pt("sel.back")} />
      </div>
    );
  }

  if (!snapshot?.profile) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{pt("sel.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{pt("sc.needPassport")}</p>
        <BackLink label={pt("sel.back")} />
      </div>
    );
  }

  return (
    <div data-share-screen className="mx-auto w-full max-w-2xl space-y-6">
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("sel.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pt("sel.lead")}</p>
      </header>

      {/* ── After creation, the result takes the top of the screen ─── */}
      {outcome ? (
        <CreatedPanel
          outcome={outcome}
          shareUrl={shareUrl}
          copied={copied}
          copyFailed={copyFailed}
          linkFieldRef={linkFieldRef}
          onCopy={() => void onCopy()}
          pt={pt}
          lang={lang}
        />
      ) : null}

      {/* ── 1 · What to share ──────────────────────────────────────── */}
      {!outcome ? (
        <section aria-labelledby="sel-choose">
          <h2 id="sel-choose" className="text-base font-semibold tracking-tight text-foreground">
            {pt("sel.step.choose")}
          </h2>

          {droppedCount > 0 ? (
            <p
              role="status"
              className="mt-2 text-sm leading-relaxed text-amber-700 dark:text-amber-300"
            >
              {pt("sel.error.meritGone")}
            </p>
          ) : null}

          {selection?.reviewUnavailable ? (
            <p
              role="status"
              data-review-unavailable
              className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {pt("sel.reviewUnavailable")}
            </p>
          ) : null}

          {selection && selection.eligibleCount === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-secondary/40 p-5">
              <p className="text-sm leading-relaxed text-foreground">{pt("sel.empty.title")}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {pt("sel.empty.body")}
              </p>
              <Link
                to="/passport"
                className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {pt("sel.empty.action")}
              </Link>
            </div>
          ) : null}

          <div className="mt-3 space-y-5">
            {/* `min-w-0`: a fieldset defaults to `min-inline-size: min-content`,
                which at 320px is wider than its own container and scrolls the
                whole page sideways. It is what lets the box shrink like every
                other box. */}
            {selection?.groups.map((group) => (
              <fieldset
                key={group.id}
                data-share-group={group.id}
                className="min-w-0 rounded-xl border border-border bg-card p-5"
              >
                <legend className="px-1 text-sm font-semibold tracking-tight text-foreground">
                  {pt(group.titleKey)}
                </legend>
                <ul className="mt-2 divide-y divide-border">
                  {group.candidates.map(({ merit, caveat }) => {
                    const key = meritKey(merit);
                    const id = `sel-${key.replace(":", "-")}`;
                    return (
                      <li key={key}>
                        <label
                          htmlFor={id}
                          data-merit-option={key}
                          data-merit-caveat={caveat}
                          className="flex min-h-[44px] cursor-pointer items-start gap-3 py-3"
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={(e) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(key);
                                else next.delete(key);
                                return next;
                              })
                            }
                            className="mt-1 h-5 w-5 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground">
                              {lang === "sv" ? merit.titleSv : merit.titleEn}
                            </span>
                            <span className="mt-0.5 block text-sm text-muted-foreground">
                              {merit.organisation ?? pt("common.notStated")}
                              {" · "}
                              {meritDates(merit, lang, pt)}
                            </span>
                            {/* What is in flight on this merit. Never a reason
                                to withhold it — the recipient reads its stored
                                standing either way — but the holder is the one
                                who needs to know the standing may move, and
                                `unknown` says we could not tell rather than
                                that nothing is open. */}
                            {hasCaveat(caveat) ? (
                              <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                                {pt(CAVEAT_KEY[caveat])}
                              </span>
                            ) : null}
                          </span>
                          <MeritStatusChip
                            status={merit.label}
                            lifecycleState={merit.lifecycleState}
                            className="mt-0.5"
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {pt("sel.onlyCurrentVerified")}
          </p>
        </section>
      ) : null}

      {/* ── 2 · The recipient's view ───────────────────────────────── */}
      {!outcome && selectedCount > 0 ? (
        <section aria-labelledby="sel-preview">
          <h2 id="sel-preview" className="text-base font-semibold tracking-tight text-foreground">
            {pt("sel.step.preview")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("sel.preview.lead")}
          </p>
          <button
            type="button"
            aria-expanded={previewOpen}
            aria-controls="sel-preview-panel"
            onClick={() => setPreviewOpen((v) => !v)}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {previewOpen ? pt("sel.preview.hide") : pt("sel.preview.show")}
          </button>

          {previewOpen ? (
            <div
              id="sel-preview-panel"
              data-share-preview
              className="mt-4 overflow-x-auto rounded-xl border border-border bg-secondary/30 p-4"
            >
              {previewState === "loading" ? (
                <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
              ) : previewState === "failed" || !previewPresentation ? (
                <p role="alert" className="text-sm leading-relaxed text-foreground">
                  {pt("sel.error.preview")}
                </p>
              ) : (
                <RecipientPassportView
                  presentation={previewPresentation}
                  lang={shareLang}
                  verifyUrl={publicShareOrigin()}
                  preview
                />
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── 3 · Link settings ──────────────────────────────────────── */}
      {!outcome ? (
        <section aria-labelledby="sel-settings">
          <h2 id="sel-settings" className="text-base font-semibold tracking-tight text-foreground">
            {pt("sel.step.settings")}
          </h2>
          <div className="mt-3 space-y-5 rounded-xl border border-border bg-card p-5">
            <fieldset>
              <legend className="text-sm font-medium text-foreground">{pt("sc.expiry")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {EXPIRY_CHOICES.map((c) => (
                  <label
                    key={c.days}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                  >
                    <input
                      type="radio"
                      name="sel-expiry"
                      value={c.days}
                      checked={expiryDays === c.days}
                      onChange={() => setExpiryDays(c.days)}
                      className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    {pt(c.labelKey)}
                    {c.days === DEFAULT_EXPIRY_DAYS ? (
                      <span className="text-muted-foreground">({pt("sel.recommended")})</span>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-foreground">{pt("sel.language")}</legend>
              <p className="mt-1 text-sm text-muted-foreground">{pt("sel.languageHelp")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["sv", "en"] as const).map((code) => (
                  <label
                    key={code}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                  >
                    <input
                      type="radio"
                      name="sel-lang"
                      value={code}
                      checked={shareLang === code}
                      onChange={() => setShareLang(code)}
                      className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    {pt(code === "sv" ? "sel.language.sv" : "sel.language.en")}
                  </label>
                ))}
              </div>
            </fieldset>

            <p className="text-sm leading-relaxed text-muted-foreground">{pt("sel.revocable")}</p>
          </div>
        </section>
      ) : null}

      {/* ── 4 · Create ─────────────────────────────────────────────── */}
      {!outcome ? (
        <section aria-labelledby="sel-create">
          <h2 id="sel-create" className="sr-only">
            {pt("sel.step.create")}
          </h2>
          {createError ? (
            <p role="alert" className="mb-3 text-sm leading-relaxed text-destructive">
              {pt(createError)}
            </p>
          ) : null}
          <button
            type="button"
            data-share-cta
            onClick={() => void onCreate()}
            disabled={creating || selectedCount === 0}
            aria-describedby="sel-create-help"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
          >
            <Link2 aria-hidden="true" className="h-4 w-4" />
            {creating ? pt("sel.creating") : pt("sel.create")}
          </button>
          <p id="sel-create-help" className="mt-2 text-sm text-muted-foreground">
            {selectedCount === 0
              ? pt("sel.chooseFirst")
              : `${pt("sel.willShare")} ${selectedCount}`}
          </p>
        </section>
      ) : null}

      {/* ── Existing links ─────────────────────────────────────────── */}
      <ShareList
        shares={shares}
        state={sharesState}
        revoking={revoking}
        revokeError={revokeError}
        reissueFor={reissueFor}
        reissueRevoke={reissueRevoke}
        reissuing={reissuing}
        reissueError={reissueError}
        onRetry={() => void readShares()}
        onRevoke={(id) => void onRevoke(id)}
        onOpenReissue={(id) => {
          setReissueError(null);
          setReissueRevoke(true);
          setReissueFor(id);
        }}
        onCancelReissue={() => setReissueFor(null)}
        onToggleReissueRevoke={setReissueRevoke}
        onReissue={(id) => void onReissue(id, reissueRevoke)}
        pt={pt}
        lang={lang}
      />

      <BackLink label={pt("sel.back")} />
    </div>
  );
}

/** The date line under a merit's title.
 *
 *  Two shapes, never mixed: an EMPLOYMENT carries a period and a CREDENTIAL
 *  carries a validity. `dateKind` is the workspace's own answer to which,
 *  and it exists so no renderer ever prints an issue date under the word
 *  "employed". A row with neither says "Ej angivet" rather than a dash. */
function meritDates(
  merit: { dateKind: "period" | "validity"; from: string | null; to: string | null },
  lang: PassportLang,
  pt: (key: PassportCopyKey) => string,
): string {
  // Localised, like every other date a person reads in this product. An ISO
  // string is a machine's answer to "when".
  if (merit.dateKind === "period") {
    return merit.from ? formatIsoDayRange(merit.from, merit.to, lang) : pt("common.notStated");
  }
  return merit.to ? formatIsoDay(merit.to, lang) : pt("claims.noExpiry");
}

function BackLink({ label }: { label: string }) {
  return (
    <p>
      <Link
        to="/passport"
        className="inline-flex h-11 items-center gap-2 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        {label}
      </Link>
    </p>
  );
}

function CreatedPanel({
  outcome,
  shareUrl,
  copied,
  copyFailed,
  linkFieldRef,
  onCopy,
  pt,
  lang,
}: {
  outcome: CreateOutcome;
  shareUrl: string | null;
  copied: boolean;
  copyFailed: boolean;
  linkFieldRef: React.RefObject<HTMLInputElement | null>;
  onCopy: () => void;
  pt: (key: PassportCopyKey) => string;
  lang: PassportLang;
}) {
  // The reconciliation case: the database committed and the answer never
  // arrived, so the retry found the row instead of writing a second one.
  // There is no token to show — only its hash was ever stored — and saying
  // so is the whole point of the panel.
  if (outcome.kind === "already") {
    return (
      <section
        data-share-already
        role="status"
        className="rounded-xl border border-amber-300/60 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/40"
      >
        <h2 className="text-base font-semibold tracking-tight text-amber-900 dark:text-amber-100">
          {pt("sel.already.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          {pt("sel.already.body")}
        </p>
        {outcome.expiresAt ? (
          <p className="mt-2 text-sm tabular-nums text-amber-900 dark:text-amber-200">
            {pt("sc.expiresOn")} {formatIsoDay(outcome.expiresAt.slice(0, 10), lang)}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      data-share-created
      role="status"
      className="rounded-xl border border-border bg-card p-5"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
        <ShieldCheck aria-hidden="true" className="h-5 w-5" />
        {pt("sel.created.title")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {pt("sel.created.onceOnly")}
      </p>

      {/* After a reissue, the one question the holder will have: did the link
          somebody may already be holding stop working? Absent for an ordinary
          creation, which replaced nothing. */}
      {outcome.previousRevoked != null ? (
        <p
          data-previous-revoked={String(outcome.previousRevoked)}
          className="mt-2 text-sm leading-relaxed text-foreground"
        >
          {pt(outcome.previousRevoked ? "sel.reissue.previousRevoked" : "sel.reissue.previousKept")}
        </p>
      ) : null}

      <label htmlFor="sel-link" className="mt-4 block text-sm font-medium text-foreground">
        {pt("sel.created.link")}
      </label>
      <input
        id="sel-link"
        data-share-link
        ref={linkFieldRef}
        readOnly
        value={shareUrl ?? ""}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      {copyFailed ? (
        <p role="alert" className="mt-2 text-sm leading-relaxed text-foreground">
          {pt("sel.copy.failed")}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Copy aria-hidden="true" className="h-4 w-4" />
          )}
          {copied ? pt("sc.copied") : pt("sc.copy")}
        </button>
        {shareUrl ? (
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("sel.created.open")}
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        ) : null}
      </div>

      {/* Announced politely rather than only shown: a keyboard user who
          presses "Kopiera länk" gets no visual scan of the button label. */}
      <p aria-live="polite" className="sr-only">
        {copied ? pt("sc.copied") : ""}
      </p>

      {outcome.expiresAt ? (
        <p className="mt-3 text-sm tabular-nums text-muted-foreground">
          {pt("sc.expiresOn")} {formatIsoDay(outcome.expiresAt.slice(0, 10), lang)}
        </p>
      ) : null}
    </section>
  );
}

function ShareList({
  shares,
  state,
  revoking,
  revokeError,
  reissueFor,
  reissueRevoke,
  reissuing,
  reissueError,
  onRetry,
  onRevoke,
  onOpenReissue,
  onCancelReissue,
  onToggleReissueRevoke,
  onReissue,
  pt,
  lang,
}: {
  shares: readonly ShareRecord[] | null;
  state: LoadState;
  revoking: string | null;
  revokeError: boolean;
  reissueFor: string | null;
  reissueRevoke: boolean;
  reissuing: string | null;
  reissueError: PassportCopyKey | null;
  onRetry: () => void;
  onRevoke: (id: string) => void;
  onOpenReissue: (id: string) => void;
  onCancelReissue: () => void;
  onToggleReissueRevoke: (value: boolean) => void;
  onReissue: (id: string) => void;
  pt: (key: PassportCopyKey) => string;
  lang: PassportLang;
}) {
  return (
    <section aria-labelledby="sel-existing">
      <h2 id="sel-existing" className="text-base font-semibold tracking-tight text-foreground">
        {pt("sel.existing.title")}
      </h2>

      {state === "loading" ? (
        <p className="mt-2 text-sm text-muted-foreground">{pt("common.loading")}</p>
      ) : state === "failed" ? (
        <div role="alert" className="mt-2 rounded-xl border border-border bg-card p-5">
          <p className="text-sm leading-relaxed text-foreground">{pt("sel.error.shares")}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pt("common.retry")}
          </button>
        </div>
      ) : (shares?.length ?? 0) === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{pt("sc.historyEmpty")}</p>
      ) : (
        <>
          {revokeError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {pt("sel.error.revoke")}
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {shares?.map((s) => (
              <li
                key={s.id}
                data-share-row={s.id}
                data-share-state={s.state}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {pt(STATE_KEY[s.state])}
                    {" · "}
                    <span className="font-normal text-muted-foreground">
                      {s.meritCount === null
                        ? pt("sel.existing.package")
                        : `${s.meritCount} ${pt("sel.existing.merits")}`}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {pt("sc.created")} {formatIsoDay(s.createdAt.slice(0, 10), lang)}
                    {s.expiresAt
                      ? ` · ${pt("sc.expiresOn")} ${formatIsoDay(s.expiresAt.slice(0, 10), lang)}`
                      : ""}
                    {` · ${pt("sel.existing.opens")} ${s.accessCount}`}
                  </p>
                  {/* Honest about a share whose selection has partly lapsed:
                      the recipient sees fewer merits than were chosen, and
                      the holder is the only person who can tell. */}
                  {s.meritCount !== null &&
                  s.currentMeritCount !== null &&
                  s.currentMeritCount < s.meritCount ? (
                    <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                      {pt("sel.existing.someLapsed")}
                    </p>
                  ) : null}
                </div>
                {/* NOT `shrink-0` on the action row: "Skapa en ny länk med
                    samma innehåll" is a long label, and a row that cannot
                    shrink pushes a 320px screen 99px sideways. It wraps. */}
                {s.state === "active" ? (
                  <div className="flex flex-wrap gap-2">
                    {/* The safe answer to "I lost the link". Not a recovery —
                        the token is gone — but a NEW link over the same
                        contents, with the holder's own choice about the old
                        one. Only offered for a chosen-merit share, because
                        that is the only kind whose contents are a list this
                        product can reproduce. */}
                    {s.meritCount !== null ? (
                      <button
                        type="button"
                        data-share-reissue={s.id}
                        aria-expanded={reissueFor === s.id}
                        onClick={() => onOpenReissue(s.id)}
                        disabled={reissuing !== null}
                        className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {pt("sel.reissue")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-share-revoke={s.id}
                      onClick={() => onRevoke(s.id)}
                      disabled={revoking === s.id}
                      className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {revoking === s.id ? pt("sc.revoking") : pt("sc.revoke")}
                    </button>
                  </div>
                ) : null}

                {reissueFor === s.id ? (
                  <div
                    data-share-reissue-panel
                    className="mt-1 w-full rounded-lg border border-border bg-secondary/40 p-4"
                  >
                    <p className="text-sm font-medium text-foreground">{pt("sel.reissue.title")}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {pt("sel.reissue.body")}
                    </p>
                    <label
                      htmlFor={`sel-reissue-revoke-${s.id}`}
                      className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3"
                    >
                      <input
                        id={`sel-reissue-revoke-${s.id}`}
                        type="checkbox"
                        data-share-reissue-revoke
                        checked={reissueRevoke}
                        onChange={(e) => onToggleReissueRevoke(e.target.checked)}
                        className="mt-1 h-5 w-5 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-foreground">
                          {pt("sel.reissue.revoke")}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {pt("sel.reissue.revokeHelp")}
                        </span>
                      </span>
                    </label>
                    {reissueError ? (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {pt(reissueError)}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-share-reissue-confirm
                        onClick={() => onReissue(s.id)}
                        disabled={reissuing === s.id}
                        className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {reissuing === s.id
                          ? pt("sel.reissue.creating")
                          : pt("sel.reissue.confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={onCancelReissue}
                        className="inline-flex h-11 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {pt("sel.reissue.cancel")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {/* Why there is no "copy" here. Stated once, where a holder looks
              for the button and does not find it. */}
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {pt("sel.existing.noRecovery")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {pt("sel.existing.opensNote")}
          </p>
        </>
      )}
    </section>
  );
}
