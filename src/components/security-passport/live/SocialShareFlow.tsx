// Security Passport — "Dela mitt Security Passport".
//
// One screen, one decision. The holder sees the Passport as the recipient will
// see it, with every shareable credential already included, and chooses where
// it goes. Nothing is public until they have looked at it and said so.
//
// ── WHAT EACH BUTTON REALLY DOES ───────────────────────────────────────
//
//   * Dela på LinkedIn / other channels: creates a PUBLIC share (a separate
//     page with a random public id, `/s/<id>`) and opens the platform's own
//     share dialog on that link. The platform draws a link preview from the
//     page's Open Graph tags; the holder writes their text and publishes
//     themselves. The image does NOT travel with a web link, and this screen
//     never says it does.
//   * Kopiera länk: the same public link.
//   * Spara bilden: the Passport image to the holder's own device. Nothing
//     becomes public.
//   * Dela via appar: the device's share sheet, given the image file where the
//     browser can. Cancelling it is a decision, not an error, and downloads
//     nothing.
//   * Instagram has no web path for a link or an image; it gets an honest
//     instruction, not a button that pretends.
//
// ── THE PUBLIC ACT IS EXPLICIT ─────────────────────────────────────────
//
// The default selection creates nothing. A public share is created only after
// the holder has seen the preview and ticked the box under the notice that a
// platform may keep what it fetched.
//
// ── THE POPUP, AND THE USER'S GESTURE ──────────────────────────────────
//
// Creating the share is asynchronous; a window opened after an await is blocked
// by the browser. So the destination window is opened SYNCHRONOUSLY inside the
// click and pointed at the platform once the link exists. If the browser still
// refuses it, the dialog's address is put on screen as a real link the holder
// can press.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { passportT, type PassportCopyKey, type PassportLang } from "@/lib/security-passport/i18n";
import type { SocialCardModel } from "@/lib/security-passport/social";
import type { PassportHolder } from "@/lib/security-passport/types";
import { svgToPngBlob } from "@/lib/security-passport/social-export";
import { shareFormat, type ShareFormat } from "@/lib/security-passport/design/trust-system";
import { downloadBlob, socialImageFileName } from "@/lib/security-passport/share-image";
import {
  FEED_CHANNELS,
  shareIntentUrl,
  type ShareChannel,
} from "@/lib/security-passport/share-channels";
import { selectState } from "@/lib/security-passport/merit-selection";
import type {
  CreateSocialShareResult,
  MySocialShare,
  SocialShareErrorCode,
} from "@/lib/security-passport/social-share.functions";
import { publicSocialShareUrl } from "@/lib/security-passport/social-share-public";
import { SocialFrame } from "../social/SocialFrame";
import { PassportGroupList } from "../PassportGroups";
import { CHANNEL_ICON } from "./channel-icons";
import { LinkedInProfileSection } from "./LinkedInProfileSection";
import { SelectAllBox } from "./SelectAllBox";

type LoadState = "loading" | "ready" | "failed";

/** The server calls, handed in by the page: this component reaches no server
 *  tier itself. */
export interface SocialShareApi {
  readonly create: (input: {
    readonly claimIds: readonly string[];
    readonly locale: "sv" | "en";
    readonly expiresDays: number;
    readonly holderLabel: "full_name" | "initials" | "anonymous";
    readonly requestKey: string;
  }) => Promise<CreateSocialShareResult>;
  readonly list: () => Promise<readonly MySocialShare[]>;
  readonly revoke: (publicId: string) => Promise<void>;
}

/** Where the picture is drawn: a square reads well in every feed. The holder
 *  is not asked. */
const IMAGE_FORMAT: ShareFormat = "square";

const EXPIRY_CHOICES: readonly { days: number; labelKey: PassportCopyKey }[] = [
  { days: 7, labelKey: "sc.expiry.7" },
  { days: 30, labelKey: "sc.expiry.30" },
  { days: 90, labelKey: "sc.expiry.90" },
];
const DEFAULT_EXPIRY_DAYS = 30;

/** The channels that take a link. Instagram is handled separately, and the copy
 *  link has its own button. */
const LINK_CHANNELS = FEED_CHANNELS.filter(
  (c) => c.id !== "linkedin" && c.id !== "copy_link" && c.id !== "instagram",
);

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
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

function isCurrentImage(svg: string | null, format: ShareFormat): svg is string {
  return svg !== null && svg.includes(`data-social-card="${format}"`);
}

interface PublicShare {
  readonly publicId: string;
  readonly expiresAt: string;
  /** What this share was created for: selection, language and lifetime. */
  readonly fingerprint: string;
}

export function SocialShareFlow({
  chooser,
  allKeys,
  groupKeys,
  selected,
  onSelectMany,
  hasCandidates,
  claimIds,
  previewState,
  model,
  notDrawn,
  imageLang,
  onImageLang,
  holder,
  nameHidden,
  hasNonShareable,
  api,
}: {
  /** The merit list with its per-group "select all". */
  chooser: ReactNode;
  /** Every shareable merit, for the global "select all". */
  allKeys: readonly string[];
  groupKeys: readonly (readonly string[])[];
  selected: ReadonlySet<string>;
  onSelectMany: (keys: readonly string[], on: boolean) => void;
  hasCandidates: boolean;
  /** The selected claims' ids, as the server takes them. */
  claimIds: readonly string[];
  previewState: LoadState;
  model: SocialCardModel | null;
  notDrawn: boolean;
  imageLang: PassportLang;
  onImageLang: (lang: PassportLang) => void;
  holder: PassportHolder;
  /** The holder's privacy setting hides the name. */
  nameHidden: boolean;
  /** Something exists that this flow does not offer (employment, documents). */
  hasNonShareable: boolean;
  api: SocialShareApi;
}) {
  const { pt } = usePassportCopy();
  const selectedCount = selected.size;

  const [changing, setChanging] = useState(false);
  const [consent, setConsent] = useState(false);
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);

  const [drawn, setDrawn] = useState<string | null>(null);
  const [file, setFile] = useState<{ svg: string; file: File } | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<PassportCopyKey | null>(null);
  const [consentHint, setConsentHint] = useState(false);
  const [openedNotice, setOpenedNotice] = useState<ChannelNotice | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [instagramHint, setInstagramHint] = useState(false);
  const [deviceDone, setDeviceDone] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  const [mine, setMine] = useState<readonly MySocialShare[] | null>(null);
  const [mineState, setMineState] = useState<LoadState>("loading");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokedNote, setRevokedNote] = useState(false);

  const [pub, setPub] = useState<PublicShare | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const linkFieldRef = useRef<HTMLInputElement | null>(null);

  const fingerprint = useMemo(
    () => `${[...claimIds].sort().join(",")}|${imageLang}|${expiryDays}`,
    [claimIds, imageLang, expiryDays],
  );
  const current = pub && pub.fingerprint === fingerprint ? pub : null;
  const url = current ? publicSocialShareUrl(current.publicId) : null;
  const stale = pub !== null && current === null;

  const imagePt = useCallback((key: PassportCopyKey) => passportT(key, imageLang), [imageLang]);
  const postText = imagePt("social.postText");

  const onImage = useCallback(
    (svg: string | null) => setDrawn((prev) => (prev === svg ? prev : svg)),
    [],
  );
  const svg = isCurrentImage(drawn, IMAGE_FORMAT) ? drawn : null;
  const prepared = svg && file && file.svg === svg ? file.file : null;

  useEffect(() => {
    try {
      setCanShareFiles(
        typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [new File([""], "p.png", { type: "image/png" })] }),
      );
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  // The PNG is made ahead of any press from exactly the SVG on screen, so a
  // press hands it over while the browser still counts it as the holder's act.
  useEffect(() => {
    if (!svg || (file && file.svg === svg)) return;
    let alive = true;
    const spec = shareFormat(IMAGE_FORMAT);
    void svgToPngBlob(svg, spec.width, spec.height)
      .then((blob) => {
        if (alive) {
          setFile({
            svg,
            file: new File([blob], socialImageFileName(IMAGE_FORMAT), { type: "image/png" }),
          });
        }
      })
      .catch((err) => {
        console.error("[passport] social image export failed", err);
        if (alive) setErrorKey("common.error");
      });
    return () => {
      alive = false;
    };
  }, [svg, file]);

  // A different selection, language or lifetime is a different thing to share:
  // the consent, the results and the result notices belonged to the old one.
  useEffect(() => {
    setConsent(false);
    setConsentHint(false);
    setOpenedNotice(null);
    setBlockedUrl(null);
    setInstagramHint(false);
    setCopied(false);
    setCopyFailed(false);
    setErrorKey(null);
  }, [fingerprint]);
  useEffect(() => {
    setSaved(false);
    setDeviceDone(false);
  }, [prepared]);

  const readMine = useCallback(async () => {
    setMineState("loading");
    try {
      setMine(await api.list());
      setMineState("ready");
    } catch (err) {
      console.error("[passport] public shares read failed", err);
      setMineState("failed");
    }
  }, [api]);
  useEffect(() => {
    void readMine();
  }, [readMine]);

  const allState = selectState(allKeys, selected);
  const canAct = selectedCount > 0 && model !== null && previewState !== "failed";

  /** The public link for what is on screen, creating it if there is none.
   *  Null when it could not be made (the reason is on screen). */
  async function ensureShare(): Promise<string | null> {
    if (current) return publicSocialShareUrl(current.publicId);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: newKey() };
    }
    setBusy(true);
    setErrorKey(null);
    try {
      const result = await api.create({
        claimIds,
        locale: imageLang,
        expiresDays: expiryDays,
        holderLabel: "full_name",
        requestKey: attempt.current.key,
      });
      if (result.status === "failed") {
        setErrorKey(ERROR_KEY[result.code]);
        return null;
      }
      setPub({ publicId: result.publicId, expiresAt: result.expiresAt, fingerprint });
      attempt.current = null;
      void readMine();
      return publicSocialShareUrl(result.publicId);
    } catch (err) {
      // The attempt keeps its key: a retry reconciles with whatever may have
      // been committed instead of minting a second share.
      console.error("[passport] public share create failed", err);
      setErrorKey("shr.error.unknown");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function gate(): boolean {
    if (!canAct) return false;
    if (!consent) {
      setConsentHint(true);
      return false;
    }
    setConsentHint(false);
    return true;
  }

  /** Open a platform's dialog on the public link. The window is opened inside
   *  the click, before any await, and pointed at the platform afterwards. */
  function openChannel(channel: Exclude<ShareChannel, "copy_link" | "native" | "instagram">) {
    if (!gate()) return;
    setOpenedNotice(null);
    setBlockedUrl(null);
    const target = (link: string) => shareIntentUrl(channel, link, postText, postText);
    if (url) {
      launch(target(url), null, channel);
      return;
    }
    const isMail = channel === "email";
    const popup = isMail ? null : window.open("", "_blank");
    void (async () => {
      const link = await ensureShare();
      if (!link) {
        popup?.close();
        return;
      }
      launch(target(link), popup, channel);
    })();
  }

  function launch(dest: string | null, popup: Window | null, channel: ShareChannel) {
    if (!dest) return;
    if (dest.startsWith("mailto:")) {
      window.location.href = dest;
      setOpenedNotice({ channel });
      return;
    }
    if (popup && !popup.closed) {
      try {
        popup.opener = null;
      } catch {
        // Cross-window access can be refused; the navigation still works.
      }
      popup.location.href = dest;
      setOpenedNotice({ channel });
      return;
    }
    const opened = window.open(dest, "_blank", "noopener,noreferrer");
    if (opened) {
      setOpenedNotice({ channel });
      return;
    }
    // Refused by the browser: the destination is put on screen as a real link.
    setBlockedUrl(dest);
  }

  async function copyLink() {
    if (!gate()) return;
    const link = url ?? (await ensureShare());
    if (!link) return;
    setCopyFailed(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      // Blocked or absent: the link stays on screen to copy by hand.
      setCopyFailed(true);
      window.setTimeout(() => {
        linkFieldRef.current?.focus();
        linkFieldRef.current?.select();
      }, 0);
    }
  }

  function saveImage() {
    if (!prepared) return;
    downloadBlob(prepared, prepared.name);
    setSaved(true);
  }

  async function shareFromDevice() {
    if (!prepared) return;
    setErrorKey(null);
    const data: ShareData = { files: [prepared], title: postText, text: postText };
    if (!navigator.canShare?.(data)) {
      setErrorKey("common.error");
      return;
    }
    try {
      await navigator.share(data);
      setDeviceDone(true);
    } catch (err) {
      // Cancelling the sheet is a decision, not a failure, and starts nothing.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[passport] device share failed", err);
      setErrorKey("common.error");
    }
  }

  async function revoke(publicId: string) {
    setRevoking(publicId);
    setRevokedNote(false);
    try {
      await api.revoke(publicId);
      if (pub?.publicId === publicId) setPub(null);
      setRevokedNote(true);
      await readMine();
    } catch (err) {
      console.error("[passport] revoke failed", err);
      setErrorKey("shr.error.unknown");
    } finally {
      setRevoking(null);
    }
  }

  const exportText = useMemo(
    () =>
      (model?.credentials ?? [])
        .map((c) => `${imageLang === "sv" ? c.nameSv : c.nameEn} — ${imagePt(c.statusWordKey)}`)
        .join("\n"),
    [model, imageLang, imagePt],
  );
  const [exportCopied, setExportCopied] = useState(false);
  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportText);
      setExportCopied(true);
      window.setTimeout(() => setExportCopied(false), 3000);
    } catch {
      setErrorKey("shr.error.unknown");
    }
  }

  return (
    <div data-social-flow className="space-y-6">
      {/* ── The Passport, as the recipient will see it ─────────────── */}
      <section aria-labelledby="shr-preview">
        <h2 id="shr-preview" className="text-lg font-semibold text-foreground">
          {pt("shr.preview")}
        </h2>

        {!hasCandidates ? (
          <p
            data-social-empty
            className="mt-3 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-sm leading-relaxed text-foreground"
          >
            {pt("shr.noneOffered")}
          </p>
        ) : selectedCount === 0 ? (
          <p
            data-social-none-selected
            role="status"
            className="mt-3 rounded-xl border border-dashed border-border bg-secondary/40 p-5 text-sm leading-relaxed text-foreground"
          >
            {pt("shr.noneSelected")}
          </p>
        ) : previewState === "failed" ? (
          <p role="alert" className="mt-3 text-sm leading-relaxed text-foreground">
            {pt("sel.error.preview")}
          </p>
        ) : model ? (
          <figure data-social-passport className="mt-3 min-w-0">
            <SocialFrame
              model={model}
              format={IMAGE_FORMAT}
              previewWidth={560}
              lang={imageLang}
              onImage={onImage}
            />
          </figure>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{pt("common.loading")}</p>
        )}

        {nameHidden ? (
          <p data-social-name-hidden role="status" className="mt-2 text-sm text-muted-foreground">
            {pt("shr.nameHidden")}
          </p>
        ) : null}
        {notDrawn ? (
          <p
            role="status"
            className="mt-2 text-sm leading-relaxed text-amber-700 dark:text-amber-300"
          >
            {pt("social.notDrawn")}
          </p>
        ) : null}

        {/* ── What is included, and how to change it ─────────────── */}
        {hasCandidates ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SelectAllBox
                state={allState}
                label={pt("shr.selectAll")}
                count={allKeys.length}
                onChange={(on) => onSelectMany(allKeys, on)}
                idPrefix="shr-all"
                dataAttr="data-select-all"
              />
              <button
                type="button"
                data-social-change
                aria-expanded={changing}
                onClick={() => setChanging((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {changing ? pt("shr.changeDone") : pt("shr.change")}
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${changing ? "rotate-180" : ""}`}
                />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {pt("shr.included")}: <span className="tabular-nums">{selectedCount}</span>
            </p>
            {changing ? (
              <div data-social-chooser className="mt-4 space-y-5">
                {chooser}
              </div>
            ) : null}
            {hasNonShareable ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {pt("shr.notOffered")}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Where it goes ────────────────────────────────────────── */}
      {canAct && model ? (
        <section aria-labelledby="shr-share" data-social-share className="space-y-4">
          <h2 id="shr-share" className="sr-only">
            {pt("shr.title")}
          </h2>

          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p data-social-consent-notice className="text-sm leading-relaxed text-foreground">
              {pt("shr.consentNotice")}
            </p>
            <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                data-social-consent
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (e.target.checked) setConsentHint(false);
                }}
                className="mt-1 h-5 w-5 shrink-0 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <span className="text-sm text-foreground">{pt("shr.consentCheck")}</span>
            </label>
            {consentHint ? (
              <p role="alert" data-social-consent-hint className="mt-1 text-sm text-destructive">
                {pt("shr.consentFirst")}
              </p>
            ) : null}
          </div>

          <div>
            <button
              type="button"
              data-social-channel="linkedin"
              onClick={() => openChannel("linkedin")}
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
            >
              {(() => {
                const { Icon } = CHANNEL_ICON.linkedin;
                return <Icon aria-hidden="true" className="h-4 w-4" />;
              })()}
              {busy ? pt("shr.creating") : pt("shr.linkedin")}
            </button>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {pt("shr.linkedinHint")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-social-copy-link
              onClick={() => void copyLink()}
              disabled={busy}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
              {copied ? pt("shr.copied") : pt("shr.copyLink")}
            </button>
            <button
              type="button"
              data-social-download
              onClick={saveImage}
              disabled={!prepared}
              className="inline-flex h-12 items-center gap-2 rounded-md border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {saved ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Download aria-hidden="true" className="h-4 w-4" />
              )}
              {saved ? pt("shr.saved") : pt("shr.saveImage")}
            </button>
            {canShareFiles ? (
              <button
                type="button"
                data-social-device
                onClick={() => void shareFromDevice()}
                disabled={!prepared}
                className="inline-flex h-12 items-center gap-2 rounded-md border border-input px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Share2 aria-hidden="true" className="h-4 w-4" />
                {pt("shr.device")}
              </button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{pt("shr.saveHint")}</p>
          {!prepared ? (
            <p role="status" data-social-preparing className="text-sm text-muted-foreground">
              {pt("social.preparing")}
            </p>
          ) : null}
          {deviceDone ? (
            <p role="status" data-social-notice="device" className="text-sm text-foreground">
              {pt("shr.deviceDone")}
            </p>
          ) : null}

          {url ? (
            <div data-social-public-link className="space-y-1">
              <label htmlFor="shr-link" className="text-sm font-medium text-foreground">
                {pt("shr.sharedLink")}
              </label>
              <input
                id="shr-link"
                ref={linkFieldRef}
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              {copyFailed ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {pt("sel.copy.failed")}
                </p>
              ) : null}
            </div>
          ) : null}
          {stale ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
              {pt("social.link.stale")}
            </p>
          ) : null}

          {openedNotice ? (
            <p
              role="status"
              data-social-notice="opened"
              className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
            >
              {pt("shr.opened")}
            </p>
          ) : null}
          {blockedUrl ? (
            <p
              role="status"
              data-social-popup-blocked
              className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
            >
              {pt("shr.popupBlocked")}{" "}
              <a
                href={blockedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-accent underline"
              >
                {pt("shr.popupOpen")}
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
            </p>
          ) : null}
          {errorKey ? (
            <p role="alert" data-social-error className="text-sm text-destructive">
              {pt(errorKey)}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Other channels, languages, lifetime — one disclosure down ── */}
      {hasCandidates ? (
        <details
          data-social-more
          className="group overflow-hidden rounded-xl border border-border bg-card"
        >
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
            <span className="min-w-0 flex-1">{pt("shr.moreSettings")}</span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>

          <div className="space-y-6 border-t border-border px-5 py-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{pt("shr.otherChannels")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pt("shr.noImagePromise")}
              </p>
              <ul
                data-social-platforms
                className="mt-3 overflow-hidden rounded-xl border border-border"
              >
                {LINK_CHANNELS.map(({ id, labelKey }, i) => {
                  const { Icon, colour } = CHANNEL_ICON[id];
                  return (
                    <li key={id} className={i > 0 ? "border-t border-border" : undefined}>
                      <button
                        type="button"
                        data-social-channel={id}
                        onClick={() =>
                          openChannel(
                            id as Exclude<ShareChannel, "copy_link" | "native" | "instagram">,
                          )
                        }
                        disabled={busy || !canAct}
                        className="flex min-h-[52px] w-full items-center gap-4 px-5 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/5 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                      >
                        <Icon
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0"
                          style={colour ? { color: colour } : undefined}
                        />
                        <span className="min-w-0 flex-1">{pt(labelKey)}</span>
                      </button>
                    </li>
                  );
                })}
                <li className="border-t border-border">
                  <button
                    type="button"
                    data-social-channel="instagram"
                    onClick={() => setInstagramHint(true)}
                    className="flex min-h-[52px] w-full items-center gap-4 px-5 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    {(() => {
                      const { Icon, colour } = CHANNEL_ICON.instagram;
                      return (
                        <Icon
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0"
                          style={colour ? { color: colour } : undefined}
                        />
                      );
                    })()}
                    <span className="min-w-0 flex-1">{pt("share.channel.instagram")}</span>
                  </button>
                </li>
              </ul>
              {instagramHint ? (
                <p
                  role="status"
                  data-social-notice="instagram"
                  className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground"
                >
                  {pt("shr.instagram")}
                </p>
              ) : null}
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-foreground">
                {pt("social.language")}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["sv", "en"] as const).map((code) => (
                  <label
                    key={code}
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm text-foreground has-[:checked]:border-accent has-[:checked]:bg-accent/5"
                  >
                    <input
                      type="radio"
                      name="soc-lang"
                      value={code}
                      checked={imageLang === code}
                      onChange={() => onImageLang(code)}
                      className="h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    {pt(code === "sv" ? "sel.language.sv" : "sel.language.en")}
                  </label>
                ))}
              </div>
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
                      name="soc-link-expiry"
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

            {/* The whole Passport in words: the image can only hold so much,
                and nothing selected is ever dropped from here. */}
            {model && model.credentials.length > 0 ? (
              <div data-social-export>
                <h3 className="text-sm font-semibold text-foreground">{pt("shr.fullExport")}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {pt("shr.fullExportHint")}
                </p>
                <PassportGroupList
                  credentials={model.credentials}
                  lang={imageLang}
                  className="mt-3"
                />
                <button
                  type="button"
                  onClick={() => void copyExport()}
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {exportCopied ? (
                    <Check aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <Copy aria-hidden="true" className="h-4 w-4" />
                  )}
                  {exportCopied ? pt("shr.copied") : pt("shr.copyExport")}
                </button>
              </div>
            ) : null}

            {url ? <LinkedInProfileSection holder={holder} shareUrl={url} /> : null}

            <div>
              <h3 className="text-sm font-semibold text-foreground">{pt("social.aboutImage")}</h3>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {pt("share.excluded")}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {(
                  [
                    "share.excluded.numbers",
                    "share.excluded.documents",
                    "share.excluded.employers",
                    "share.excluded.dates",
                    "share.excluded.contact",
                  ] as const
                ).map((key) => (
                  <li key={key}>· {pt(key)}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {pt("sc.retentionNote")}
              </p>
            </div>
          </div>
        </details>
      ) : null}

      {/* ── What is public now, and taking it back ───────────────── */}
      <section aria-labelledby="shr-mine" data-social-mine>
        <h2 id="shr-mine" className="text-base font-semibold text-foreground">
          {pt("shr.mine")}
        </h2>
        {mineState === "failed" ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {pt("common.error")}{" "}
            <button type="button" onClick={() => void readMine()} className="underline">
              {pt("common.retry")}
            </button>
          </p>
        ) : mine === null ? (
          <p className="mt-2 text-sm text-muted-foreground">{pt("common.loading")}</p>
        ) : mine.filter((s) => s.status === "active").length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{pt("shr.mineNone")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {mine
              .filter((s) => s.status === "active")
              .map((s) => (
                <li
                  key={s.publicId}
                  data-social-mine-row={s.publicId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="text-foreground">
                    {pt("shr.statusActive")} {s.expiresAt.slice(0, 10)} · {s.claims}
                  </span>
                  <button
                    type="button"
                    data-social-revoke={s.publicId}
                    onClick={() => void revoke(s.publicId)}
                    disabled={revoking === s.publicId}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-input px-4 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {pt("shr.revoke")}
                  </button>
                </li>
              ))}
          </ul>
        )}
        {revokedNote ? (
          <p role="status" data-social-revoked className="mt-2 text-sm text-muted-foreground">
            {pt("shr.revoked")}
          </p>
        ) : null}
      </section>
    </div>
  );
}

interface ChannelNotice {
  readonly channel: ShareChannel;
}

const ERROR_KEY: Readonly<Record<SocialShareErrorCode, PassportCopyKey>> = {
  nothing_selected: "shr.error.nothing_selected",
  not_shareable: "shr.error.not_shareable",
  too_many: "shr.error.too_many",
  key_conflict: "shr.error.key_conflict",
  no_passport: "shr.error.no_passport",
  unknown: "shr.error.unknown",
};
