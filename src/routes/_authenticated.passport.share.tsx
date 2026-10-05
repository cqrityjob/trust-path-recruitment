import { trackFunnelOnce } from "@/lib/india-entry/analytics";
import { SecureShareQr } from "@/components/security-passport/SecureShareQr";
import { isPassportCredential } from "@/lib/security-passport/credential-passport";
import {
  createCredentialShare,
  previewCredentialShare,
} from "@/lib/security-passport/credential-sharing.functions";
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
// ── TWO WAYS TO SHARE ──────────────────────────────────────────────────
//
// The screen opens on one choice: "Dela via länk" -- everything above and
// below, unchanged -- or "Dela på sociala medier", which reconnects the image
// sharing this page used to offer (SocialShareFlow): the same selection list,
// a preview that IS the downloaded image, the four formats and the platform
// buttons. A social image carries no link or QR code unless the holder creates
// a link for it and chooses, in the preview, to show it.
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
import { Check, ChevronLeft, Copy, ExternalLink, Link2, Share2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  type ShareGroup,
  type ShareSelectionModel,
} from "@/lib/security-passport/share-selection";
import { hasCaveat, type ShareReviewCaveat } from "@/lib/security-passport/share-policy";
import { shareErrorCode, type ShareErrorCode } from "@/lib/security-passport/share-errors";
import {
  listMyShares,
  replaceShare,
  revokeShare,
  type ShareRecord,
} from "@/lib/security-passport/selected-sharing.functions";
import type { RecipientPayload } from "@/lib/security-passport/packages";
import { buildRecipientPresentation } from "@/lib/security-passport/recipient-presentation";
import { RecipientPassportView } from "@/components/security-passport/live/RecipientPassportView";
import { publicShareUrl, publicShareOrigin } from "@/lib/security-passport/public-origin";
import { MeritStatusChip } from "@/components/security-passport/MeritStatusChip";
import { formatExpiry, formatIsoDay, formatIsoDayRange } from "@/lib/security-passport/format";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import type { PassportLang } from "@/lib/security-passport/i18n";
import { passportT } from "@/lib/security-passport/i18n";
import { buildSelectedSocialCard } from "@/lib/security-passport/social";
import {
  SocialShareFlow,
  type SocialShareApi,
} from "@/components/security-passport/live/SocialShareFlow";
import { SelectAllBox } from "@/components/security-passport/live/SelectAllBox";
import { selectState, withAll } from "@/lib/security-passport/merit-selection";
import {
  createSocialShare,
  getMyPassportNumber,
  listMySocialShares,
  revokeSocialShare,
  type MyPassportNumber,
} from "@/lib/security-passport/social-share.functions";

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
  // The database refuses these three too. None of them is reachable from this
  // screen — it always sends a boolean and never a purpose — so each takes the
  // generic sentence rather than copy for a state a holder cannot produce.
  revoke_choice_required: "sel.error.create",
  purpose_too_long: "sel.error.create",
  recipient_hint_too_long: "sel.error.create",
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

/** The page, keyed by WHO is signed in. A different account (another tab, a
 *  refreshed session) mounts a fresh page, so no selection, prepared image,
 *  public link or result from the previous account can be seen or used by the
 *  next one. */
function PassportShareRoute() {
  const { pt } = usePassportCopy();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [switched, setSwitched] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      last.current = data.session?.user.id ?? null;
      setUserId(last.current);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const next = session?.user.id ?? null;
      if (last.current !== null && next !== last.current) setSwitched(true);
      last.current = next;
      setUserId(next);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (userId === undefined) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-sm text-muted-foreground">{pt("common.loading")}</p>
      </div>
    );
  }
  return (
    <>
      {switched ? (
        <p
          role="status"
          data-share-reset
          className="mx-auto mb-4 w-full max-w-3xl rounded-lg border border-border bg-secondary/40 p-3 text-sm text-foreground"
        >
          {pt("shr.reset")}
        </p>
      ) : null}
      <PassportShareInner key={userId ?? "signed-out"} />
    </>
  );
}

function PassportShareInner() {
  const { pt, lang } = usePassportCopy();

  const loadPassport = useServerFn(getMyPassport);
  const loadRequests = useServerFn(listMyVerificationRequests);
  const loadShares = useServerFn(listMyShares);
  const loadNumber = useServerFn(getMyPassportNumber);
  const doSocialCreate = useServerFn(createSocialShare);
  const doSocialList = useServerFn(listMySocialShares);
  const doSocialRevoke = useServerFn(revokeSocialShare);
  // Stable between renders: the studio reads its shares when this changes.
  const socialApi: SocialShareApi = useMemo(
    () => ({
      create: (input) => doSocialCreate({ data: { ...input, claimIds: [...input.claimIds] } }),
      list: () => doSocialList({ data: undefined }),
      revoke: async (publicId) => {
        await doSocialRevoke({ data: { publicId } });
      },
    }),
    [doSocialCreate, doSocialList, doSocialRevoke],
  );
  const doPreview = useServerFn(previewCredentialShare);
  const doCreate = useServerFn(createCredentialShare);
  const doRevoke = useServerFn(revokeShare);

  const [snapshot, setSnapshot] = useState<PassportSnapshot | null>(null);
  const [passportState, setPassportState] = useState<LoadState>("loading");
  const [attention, setAttention] = useState<VerificationAttention | null>(null);
  const [reviewState, setReviewState] = useState<ReviewReadState>("loading");
  const [shares, setShares] = useState<readonly ShareRecord[] | null>(null);
  const [sharesState, setSharesState] = useState<LoadState>("loading");

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [permittedFields, setPermittedFields] = useState<
    ("holder_name" | "identifier" | "profile_title")[]
  >([]);
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

  /** The screen's one choice. The link flow is where it always was. */
  const [via, setVia] = useState<"link" | "social">("social");
  // The social image: its own selection, because fewer merits may appear on
  // a public image than may be sent to one reader.
  const [socialSelected, setSocialSelected] = useState<ReadonlySet<string>>(new Set());
  const [imageLang, setImageLang] = useState<PassportLang>(lang);
  const [socialPreview, setSocialPreview] = useState<RecipientPayload | null>(null);
  const [socialPreviewState, setSocialPreviewState] = useState<LoadState>("loading");
  /** A link created FOR the image, with the selection it was created for. */
  const [numberInfo, setNumberInfo] = useState<MyPassportNumber | null>(null);
  /** Selected once by default; after that the holder's changes stand. */
  const socialPreselected = useRef(false);

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

  // The number is the server's: this reads it and can set nothing. A failed
  // read draws no number, never a guessed one.
  useEffect(() => {
    let alive = true;
    void loadNumber({ data: undefined })
      .then((n) => {
        if (alive) setNumberInfo(n);
      })
      .catch(() => {
        if (alive) setNumberInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [loadNumber]);

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
      claims: snapshot.holder.claims.filter(isPassportCredential),
      periods: [],
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

  const linkKeys = useMemo(
    () => (selection?.groups ?? []).flatMap((g) => g.candidates.map((c) => meritKey(c.merit))),
    [selection],
  );

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
        permittedFields,
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
  }, [previewOpen, selectedCount, selectedIds, expiryDays, shareLang, permittedFields, doPreview]);

  const previewPresentation = useMemo(
    () => (preview?.status === "active" ? buildRecipientPresentation(preview, today()) : null),
    [preview],
  );

  /* ---------------------------------------------------------------- */
  /* The social image                                                  */
  /* ---------------------------------------------------------------- */

  // What may appear on a public image: the same current merits the link flow
  // offers, credentials only. An image draws shields, and an employment
  // period -- an employer's name -- is never drawn on one.
  const socialGroups: readonly ShareGroup[] = useMemo(
    () =>
      (selection?.groups ?? [])
        .map((g) => ({
          ...g,
          candidates: g.candidates.filter((c) => c.merit.kind === "claim"),
        }))
        .filter((g) => g.candidates.length > 0),
    [selection],
  );

  const socialKeys = useMemo(
    () => socialGroups.flatMap((g) => g.candidates.map((c) => meritKey(c.merit))),
    [socialGroups],
  );
  const socialGroupKeys = useMemo(
    () => socialGroups.map((g) => g.candidates.map((c) => meritKey(c.merit))),
    [socialGroups],
  );

  // Every shareable merit is in from the start, so nobody has to tick each
  // education before every share. Done once: after that, the holder's own
  // changes stand, including choosing none.
  useEffect(() => {
    if (socialPreselected.current || socialKeys.length === 0) return;
    socialPreselected.current = true;
    setSocialSelected(new Set(socialKeys));
  }, [socialKeys]);

  // A merit that vanished (withdrawn or lapsed in another tab) leaves the
  // selection rather than failing the share with a database error.
  useEffect(() => {
    if (!socialPreselected.current) return;
    const live = new Set(socialKeys);
    setSocialSelected((prev) =>
      [...prev].every((k) => live.has(k)) ? prev : new Set([...prev].filter((k) => live.has(k))),
    );
  }, [socialKeys]);

  const socialIds = useMemo(() => splitSelection(socialSelected), [socialSelected]);

  // Through the one builder, as the link preview is: the image names what the
  // selected disclosure's presentation says, in the image's language.
  useEffect(() => {
    if (via !== "social" || socialIds.claimIds.length === 0) {
      setSocialPreview(null);
      return;
    }
    let alive = true;
    setSocialPreviewState("loading");
    void doPreview({
      data: {
        claimIds: socialIds.claimIds,
        permittedFields: [],
        expiresDays: DEFAULT_EXPIRY_DAYS,
        locale: imageLang,
      },
    })
      .then((payload) => {
        if (!alive) return;
        setSocialPreview(payload);
        // An unavailable preview is a failed one: say so, never "loading".
        setSocialPreviewState(payload.status === "active" ? "ready" : "failed");
      })
      .catch((err) => {
        console.error("[passport] share: image preview failed", err);
        if (alive) setSocialPreviewState("failed");
      });
    return () => {
      alive = false;
    };
  }, [via, socialIds, imageLang, doPreview]);

  const socialModel = useMemo(() => {
    if (!snapshot?.profile || socialPreview?.status !== "active") return null;
    const card = buildSelectedSocialCard(
      snapshot.holder,
      today(),
      buildRecipientPresentation(socialPreview, today()).credentials,
      {
        privacyMode: snapshot.profile.privacyMode,
        anonymousLabel: passportT("share.anonymousLabel", imageLang),
        // The image carries no link: the public link is made separately, after
        // the holder has seen and approved what it opens.
        verifyUrl: null,
      },
    );
    return {
      ...card,
      passportNumber: numberInfo?.number ?? null,
      designation: numberInfo?.designation ?? null,
    };
  }, [snapshot, socialPreview, imageLang, numberInfo]);

  /** The holder as far as the image goes: the LinkedIn profile entry offers
   *  only what the image's link opens. */
  const socialHolder = useMemo(
    () =>
      snapshot
        ? {
            ...snapshot.holder,
            claims: snapshot.holder.claims.filter((c) => socialIds.claimIds.includes(c.id)),
          }
        : null,
    [snapshot, socialIds],
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
          permittedFields,
          expiresDays: expiryDays,
          locale: shareLang,
          requestKey: requestKey.current,
        },
      });
      if (result.status === "created") {
        // Anonymous funnel event, name only: never the token, the selection or
        // the recipient.
        trackFunnelOnce("passport_share_link_created");
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
    <div data-share-screen className="mx-auto w-full max-w-3xl space-y-7">
      <header className="relative isolate overflow-hidden rounded-xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-lg)] sm:p-7">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-primary-foreground/40"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/60">
          Security Passport
        </p>
        <h1
          className="mt-3 text-2xl font-semibold !text-primary-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt(via === "social" ? "shr.title" : "sel.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/70">
          {pt(via === "social" ? "shr.lead" : "sel.lead")}
        </p>
      </header>

      {/* ── The main way is the Passport itself; a private link is the quiet
              alternative for one recipient ───────────────────────────── */}
      <fieldset data-share-via className="min-w-0">
        <legend className="sr-only">{pt("share.via.legend")}</legend>
        <div className="inline-flex flex-wrap gap-2">
          {(
            [
              { id: "social", Icon: Share2, title: "shr.tabPublic" },
              { id: "link", Icon: Link2, title: "shr.tabPrivate" },
            ] as const
          ).map(({ id, Icon, title }) => (
            <label
              key={id}
              data-share-choice={id}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 has-[:checked]:border-accent has-[:checked]:bg-accent/5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="share-via"
                value={id}
                checked={via === id}
                onChange={() => setVia(id)}
                className="h-4 w-4 shrink-0"
              />
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {pt(title)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── After creation, the result takes the top of the screen ─── */}
      {via === "link" && outcome ? (
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
      {via === "link" && !outcome ? (
        <section aria-labelledby="sel-choose">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            01
          </p>
          <h2 id="sel-choose" className="mt-1 text-lg font-semibold text-foreground">
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
            {linkKeys.length > 1 ? (
              <SelectAllBox
                state={selectState(linkKeys, selected)}
                label={pt("shr.selectAll")}
                count={linkKeys.length}
                onChange={(on) => setSelected((prev) => withAll(prev, linkKeys, on))}
                idPrefix="sel-all"
                dataAttr="data-select-all"
              />
            ) : null}
            {/* `min-w-0`: a fieldset defaults to `min-inline-size: min-content`,
                which at 320px is wider than its own container and scrolls the
                whole page sideways. It is what lets the box shrink like every
                other box. */}
            <MeritChoices
              groups={selection?.groups ?? []}
              selected={selected}
              onToggle={(key, on) => setSelected((prev) => withAll(prev, [key], on))}
              onToggleMany={(keys, on) => setSelected((prev) => withAll(prev, keys, on))}
              idPrefix="sel"
              lang={lang}
              pt={pt}
            />
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {pt("sel.onlyCurrentVerified")}
          </p>
        </section>
      ) : null}

      {/* ── 2 · The recipient's view ───────────────────────────────── */}
      {via === "link" && !outcome && selectedCount > 0 ? (
        <section aria-labelledby="sel-preview">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            02
          </p>
          <h2 id="sel-preview" className="mt-1 text-lg font-semibold text-foreground">
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
            className="mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-background hover:bg-muted px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {previewOpen ? pt("sel.preview.hide") : pt("sel.preview.show")}
          </button>

          {previewOpen ? (
            <div
              id="sel-preview-panel"
              data-share-preview
              className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-3 shadow-[var(--shadow-lg)] sm:p-5"
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
      {via === "link" && !outcome ? (
        <section aria-labelledby="sel-settings">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            03
          </p>
          <h2 id="sel-settings" className="mt-1 text-lg font-semibold text-foreground">
            {pt("sel.step.settings")}
          </h2>
          <div className="mt-3 space-y-5 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
            <fieldset>
              <legend className="text-sm font-medium">
                {lang === "sv" ? "Valfria uppgifter" : "Optional disclosed fields"}
              </legend>
              <p className="my-2 text-sm text-muted-foreground">
                {lang === "sv"
                  ? "Namn, utfärdare, omfattning, datum och status för valda meriter ingår alltid. Underlag och CV delas inte."
                  : "Credential names, issuers, scope, dates and status are always included. Evidence and CV content are excluded."}
              </p>
              {(["holder_name", "identifier", "profile_title"] as const).map((field) => (
                <label key={field} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={permittedFields.includes(field)}
                    onChange={(e) =>
                      setPermittedFields((old) =>
                        e.target.checked ? [...old, field] : old.filter((f) => f !== field),
                      )
                    }
                  />
                  {field === "holder_name"
                    ? lang === "sv"
                      ? "Mitt namn (enligt integritetsinställning)"
                      : "My name (subject to privacy settings)"
                    : field === "profile_title"
                      ? lang === "sv"
                        ? "Min yrkestitel från Profil (egen uppgift)"
                        : "My professional title from Profile (self-reported)"
                      : lang === "sv"
                        ? "Certifikats- eller licensnummer"
                        : "Credential identifiers"}
                </label>
              ))}
            </fieldset>
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
      {via === "link" && !outcome ? (
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

      {/* ── Or: an image to post ─────────────────────────────────────── */}
      {via === "social" && socialHolder ? (
        <SocialShareFlow
          chooser={
            <MeritChoices
              groups={socialGroups}
              selected={socialSelected}
              onToggle={(key, on) => setSocialSelected((prev) => withAll(prev, [key], on))}
              onToggleMany={(keys, on) => setSocialSelected((prev) => withAll(prev, keys, on))}
              idPrefix="soc"
              lang={lang}
              pt={pt}
            />
          }
          allKeys={socialKeys}
          groupKeys={socialGroupKeys}
          selected={socialSelected}
          onSelectMany={(keys, on) => setSocialSelected((prev) => withAll(prev, keys, on))}
          hasCandidates={socialGroups.length > 0}
          claimIds={socialIds.claimIds}
          previewState={socialPreviewState}
          model={socialModel}
          notDrawn={socialModel !== null && socialModel.credentials.length < socialSelected.size}
          imageLang={imageLang}
          onImageLang={setImageLang}
          holder={socialHolder}
          nameHidden={snapshot.profile.privacyMode !== "full_name"}
          api={socialApi}
          hasNonShareable={(selection?.groups ?? []).some((g) =>
            g.candidates.some((c) => c.merit.kind !== "claim"),
          )}
        />
      ) : null}

      {/* ── Existing links ─────────────────────────────────────────── */}
      {via === "link" ? (
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
      ) : null}

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
  merit: {
    dateKind: "period" | "validity";
    from: string | null;
    to: string | null;
    noExpiry?: boolean;
  },
  lang: PassportLang,
  pt: (key: PassportCopyKey) => string,
): string {
  // Localised, like every other date a person reads in this product. An ISO
  // string is a machine's answer to "when".
  if (merit.dateKind === "period") {
    return merit.from ? formatIsoDayRange(merit.from, merit.to, lang) : pt("common.notStated");
  }
  return merit.to ? formatIsoDay(merit.to, lang) : formatExpiry(null, lang, merit.noExpiry);
}

/**
 * The selection list both ways of sharing use: the same rows, words and
 * review caveats. Neither way limits it: a social image holds three
 * credentials, and a larger selection is shared as a set of images.
 */
function MeritChoices({
  groups,
  selected,
  onToggle,
  onToggleMany,
  idPrefix,
  lang,
  pt,
}: {
  groups: readonly ShareGroup[];
  selected: ReadonlySet<string>;
  onToggle: (key: string, on: boolean) => void;
  /** Select or clear several at once: a group's "select all". */
  onToggleMany?: (keys: readonly string[], on: boolean) => void;
  idPrefix: string;
  lang: PassportLang;
  pt: (key: PassportCopyKey) => string;
}) {
  return (
    <>
      {groups.map((group) => (
        <fieldset
          key={group.id}
          data-share-group={group.id}
          className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-xs)]"
        >
          <legend className="px-1 text-sm font-semibold tracking-tight text-foreground">
            {pt(group.titleKey)}
          </legend>
          {onToggleMany && group.candidates.length > 1 ? (
            <SelectAllBox
              state={selectState(
                group.candidates.map((c) => meritKey(c.merit)),
                selected,
              )}
              label={pt("shr.selectGroup")}
              count={group.candidates.length}
              onChange={(on) =>
                onToggleMany(
                  group.candidates.map((c) => meritKey(c.merit)),
                  on,
                )
              }
              idPrefix={`${idPrefix}-${group.id}`}
              dataAttr="data-group-select-all"
            />
          ) : null}
          <ul className="mt-2 divide-y divide-border">
            {group.candidates.map(({ merit, caveat }) => {
              const key = meritKey(merit);
              const id = `${idPrefix}-${key.replace(":", "-")}`;
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <label
                    htmlFor={id}
                    data-merit-option={key}
                    data-merit-caveat={caveat}
                    className="flex min-h-[44px] cursor-pointer items-start gap-3 py-4 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onToggle(key, e.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {lang === "sv" ? merit.titleSv : merit.titleEn}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {merit.kind === "claim" && merit.organisation
                          ? `${lang === "sv" ? "Uppgiven utfärdare" : "Holder-stated issuer"}: ${merit.organisation}`
                          : (merit.organisation ?? pt("common.notStated"))}
                        {" · "}
                        {meritDates(merit, lang, pt)}
                      </span>
                      {/* What is in flight on this merit. Never a reason to
                          withhold it — the recipient reads its stored standing
                          either way — but the holder is the one who needs to
                          know the standing may move, and `unknown` says we
                          could not tell rather than that nothing is open. */}
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
    </>
  );
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

      {shareUrl && <SecureShareQr url={shareUrl} />}

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
