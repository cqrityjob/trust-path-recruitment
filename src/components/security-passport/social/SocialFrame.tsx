// Social share formats — the socially-safe card, at real export sizes.
//
// ── RENDERED AT TRUE PIXEL SIZE, THEN SCALED ───────────────────────────
//
// Each format is laid out at its actual export dimensions (1080×1080 and
// so on) and scaled down with a CSS transform purely for review. Nothing in
// the layout responds to the preview size, so what a reviewer sees is what
// an export would produce — a preview built at review size would look fine
// and export broken.
//
// ── THE SAFE SUBSET IS THE ONLY THING AVAILABLE HERE ───────────────────
//
// These components accept a `SocialCardModel` and nothing else. The full
// Passport model, with its issuers, dates, employers and claim ids, is not
// in scope: it cannot be rendered here because it is not passed here.
//
// ── EVERY FORMAT CARRIES THE SAME TRUST CONTEXT ────────────────────────
//
// Layout changes between square, story, OG and compact. The required
// context does not: brand, holder label, profession, jurisdiction, the
// verified milestone with its words, verified credential names, the
// verify-at-source line and the destination. A cached image outliving its
// credential is the whole risk this wording exists to cover, so no format
// is permitted to drop it for space.

import {
  TRUST_PALETTE,
  shareFormat,
  type ShareFormat,
} from "@/lib/security-passport/design/trust-system";
import { useEffect, useRef, useState } from "react";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { useQrDataUrl } from "@/lib/security-passport/use-qr";
import { milestoneStyle } from "@/lib/security-passport/design/trust-system";
import type { SocialCardModel } from "@/lib/security-passport/social";
import {
  BrandMark,
  EngravedField,
  EngravedRule,
  Rosette,
  VerifiedSeal,
} from "../card/CardPrimitives";
import { CredentialSymbol } from "../CredentialSymbol";

function useSocialStrings(model: SocialCardModel) {
  const { pt, lang } = usePassportCopy();
  return {
    brand: pt("card.brand"),
    profession: lang === "sv" ? model.professionTitleSv : model.professionTitleEn,
    jurisdiction: model.jurisdictionCode === "SE" ? pt("jurisdiction.SE") : model.jurisdictionCode,
    yearsLabel:
      (model.milestoneYears ?? 0) >= 20
        ? pt("recognition.yearsPlus")
        : model.milestoneYears === 1
          ? pt("duration.year")
          : pt("recognition.years"),
    verifiedLabel: pt("recognition.badgePrefix"),
    verifiedWord: pt("assertion.verified"),
    verifyAtSource: pt("card.verifyAtSource"),
    // With verified credentials named below, the empty milestone slot must
    // say what is actually missing — verified EXPERIENCE — rather than
    // contradicting the list under it.
    noVerified:
      model.verifiedCredentials.length > 0
        ? pt("card.noVerifiedExperience")
        : pt("card.noVerifiedYet"),
    credentials: model.verifiedCredentials.map((c) => ({
      code: c.code,
      name: lang === "sv" ? c.nameSv : c.nameEn,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Shared building blocks at export scale                              */
/* ------------------------------------------------------------------ */

function MilestoneBlock({
  years,
  yearsLabel,
  verifiedLabel,
  scale,
}: {
  years: number;
  yearsLabel: string;
  verifiedLabel: string;
  scale: number;
}) {
  const style = milestoneStyle(years);
  return (
    <div
      className="relative flex items-center gap-6 overflow-hidden rounded-2xl"
      style={{
        padding: `${24 * scale}px ${32 * scale}px`,
        background: style.field,
        border: `${2 * scale}px solid ${style.rim}`,
      }}
    >
      <div className="absolute -right-6 -top-10 opacity-40">
        <Rosette size={220 * scale} tone={style.rimBright} />
      </div>
      <div className="relative">
        <div className="flex items-baseline" style={{ gap: 12 * scale }}>
          <span
            className="font-semibold leading-none tracking-tight tabular-nums"
            style={{
              fontSize: 108 * scale,
              color: style.rimBright,
              fontFamily: "var(--font-display)",
            }}
          >
            {years}
          </span>
          <span
            className="font-medium uppercase tracking-widest"
            style={{ fontSize: 30 * scale, color: style.rimBright }}
          >
            {yearsLabel}
          </span>
        </div>
        <p
          className="font-semibold uppercase leading-tight tracking-[0.18em]"
          style={{ marginTop: 12 * scale, fontSize: 20 * scale, color: TRUST_PALETTE.ink }}
        >
          {verifiedLabel}
        </p>
      </div>
    </div>
  );
}

function CredentialLine({
  code,
  name,
  verifiedWord,
  scale,
}: {
  code: string | null;
  name: string;
  verifiedWord: string;
  scale: number;
}) {
  return (
    <li className="flex items-start" style={{ gap: 14 * scale }}>
      <span style={{ marginTop: 2 * scale }}>
        {/* Everything in this list is verified AND active by construction,
            so the approved mark is the only state that can appear here. */}
        {code ? (
          <CredentialSymbol code={code} state="approved" name={name} size={44 * scale} />
        ) : (
          <VerifiedSeal tone={TRUST_PALETTE.goldBright} size={34 * scale} />
        )}
      </span>
      <span className="min-w-0">
        <span
          className="block font-semibold leading-snug"
          style={{ fontSize: 26 * scale, color: TRUST_PALETTE.ink }}
        >
          {name}
        </span>
        <span
          className="block font-semibold uppercase tracking-[0.18em]"
          style={{ marginTop: 4 * scale, fontSize: 16 * scale, color: TRUST_PALETTE.goldBright }}
        >
          {verifiedWord}
        </span>
      </span>
    </li>
  );
}

function VerifyFooter({
  qr,
  url,
  verifyAtSource,
  scale,
  compact = false,
}: {
  qr: string | null;
  url: string;
  verifyAtSource: string;
  scale: number;
  compact?: boolean;
}) {
  return (
    <div className="flex items-end justify-between" style={{ gap: 24 * scale }}>
      <div className="min-w-0 flex-1">
        <BrandMark tone={TRUST_PALETTE.ink} compact={compact} />
        <p
          className="leading-snug"
          style={{ marginTop: 10 * scale, fontSize: 18 * scale, color: TRUST_PALETTE.inkMuted }}
        >
          {verifyAtSource}
        </p>
        <p
          className="break-all leading-snug"
          style={{ marginTop: 6 * scale, fontSize: 16 * scale, color: TRUST_PALETTE.inkFaint }}
        >
          {url}
        </p>
      </div>
      <div
        className="shrink-0 overflow-hidden rounded bg-white"
        style={{ width: 130 * scale, height: 130 * scale, padding: 8 * scale }}
      >
        {qr ? <img src={qr} alt="" aria-hidden="true" className="h-full w-full" /> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The format canvas                                                   */
/* ------------------------------------------------------------------ */

/**
 * Renders one social format at true size inside a scaled wrapper.
 *
 * `previewWidth` only sets the transform; the inner canvas is always the
 * real export size.
 */
export function SocialFrame({
  model,
  format,
  previewWidth,
}: {
  model: SocialCardModel;
  format: ShareFormat;
  /** Preferred preview width. The frame never exceeds its container, so a
   *  360px preference on a 343px phone column shrinks rather than pushing
   *  the page sideways. */
  previewWidth: number;
}) {
  const spec = shareFormat(format);
  const s = useSocialStrings(model);
  const qr = useQrDataUrl(model.verifyUrl);

  // Measured rather than assumed. A hard-coded preview width overflowed the
  // viewport by exactly the page padding at 375px — the classic way a
  // "responsive" page ends up with a horizontal scrollbar.
  const hostRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvailable(el.clientWidth));
    ro.observe(el);
    setAvailable(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const targetWidth = Math.min(previewWidth, available ?? previewWidth);
  const zoom = targetWidth / spec.width;
  // Layout scale per canvas. Story is 9:16 — square-sized type left roughly
  // a third of it empty, which reads as an unfinished export rather than as
  // deliberate space, so the story layout is scaled up to fill its height.
  // OG is short and wide and needs the opposite.
  const scale =
    format === "og" ? 0.78 : format === "compact" ? 0.62 : format === "story" ? 1.42 : 1;

  const pad = (format === "og" ? 56 : format === "compact" ? 44 : 76) * scale;

  return (
    <div ref={hostRef} className="w-full max-w-full overflow-hidden rounded-lg">
      <div
        style={{
          width: spec.width,
          height: spec.height,
          // `zoom` rather than `transform: scale()`. A transformed 1080px
          // canvas is promoted to its own compositing layer, which made the
          // review screenshots come back blank; `zoom` scales layout in
          // place and screenshots correctly. Either way the canvas is laid
          // out at true export size, so the preview is faithful.
          zoom,
          background: `linear-gradient(165deg, ${TRUST_PALETTE.navyRaised} 0%, ${TRUST_PALETTE.navy} 40%, ${TRUST_PALETTE.navyDeep} 100%)`,
        }}
        className="relative isolate"
      >
        <EngravedField intensity={0.9} tone={TRUST_PALETTE.goldBright} />

        <div className="relative flex h-full flex-col" style={{ padding: pad }}>
          {/* Identity */}
          <header>
            <p
              className="font-semibold uppercase tracking-[0.24em]"
              style={{ fontSize: 20 * scale, color: TRUST_PALETTE.goldBright }}
            >
              {s.brand}
            </p>
            <h2
              className="font-semibold leading-[1.05] tracking-tight text-balance"
              style={{
                marginTop: 20 * scale,
                fontSize: (format === "og" ? 64 : 76) * scale,
                color: TRUST_PALETTE.ink,
                fontFamily: "var(--font-display)",
              }}
            >
              {model.holderLabel}
            </h2>
            <p
              style={{ marginTop: 14 * scale, fontSize: 28 * scale, color: TRUST_PALETTE.inkMuted }}
            >
              {s.profession}
              <span aria-hidden="true"> · </span>
              <span style={{ color: TRUST_PALETTE.ink }}>{s.jurisdiction}</span>
            </p>
          </header>

          <div style={{ marginTop: 28 * scale }}>
            <EngravedRule tone={`${TRUST_PALETTE.gold}66`} />
          </div>

          {/* Milestone */}
          <div style={{ marginTop: 28 * scale }}>
            {model.milestoneYears !== null ? (
              <MilestoneBlock
                years={model.milestoneYears}
                yearsLabel={s.yearsLabel}
                verifiedLabel={s.verifiedLabel}
                scale={scale}
              />
            ) : (
              <p
                className="rounded-xl border border-dashed uppercase tracking-[0.16em]"
                style={{
                  padding: `${20 * scale}px ${24 * scale}px`,
                  fontSize: 20 * scale,
                  borderColor: `${TRUST_PALETTE.inkFaint}66`,
                  color: TRUST_PALETTE.inkMuted,
                }}
              >
                {s.noVerified}
              </p>
            )}
          </div>

          {/* Verified credential NAMES only */}
          {s.credentials.length > 0 ? (
            <ul style={{ marginTop: 30 * scale, display: "grid", rowGap: 20 * scale }}>
              {s.credentials.map((cred) => (
                <CredentialLine
                  key={cred.name}
                  code={cred.code}
                  name={cred.name}
                  verifiedWord={s.verifiedWord}
                  scale={scale}
                />
              ))}
            </ul>
          ) : null}

          <div className="flex-1" />

          <VerifyFooter
            qr={qr}
            url={model.verifyUrl}
            verifyAtSource={s.verifyAtSource}
            scale={scale}
            compact={format === "compact"}
          />
        </div>
      </div>
    </div>
  );
}
