// The Card Studio — the Phase 1B review surface.
//
// Built for one job: letting the owner compare three directions against the
// same fictional evidence, in both languages, across every trust state and
// every share format, without having to construct each case by hand.
//
// The comparison view renders all three side by side at identical size,
// because a direction always looks better alone than next to its
// alternatives — and the decision here is comparative.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  CARD_DIRECTIONS,
  SHARE_FORMATS,
  type CardDirection,
  type ShareFormat,
} from "@/lib/security-passport/design/trust-system";
import { buildPassportCard, type ShareOverlayState } from "@/lib/security-passport/card";
import { buildSocialCard, type PrivacyMode } from "@/lib/security-passport/social";
import { FIXTURE_EVALUATION_DATE, personaById } from "@/lib/security-passport/fixtures/personas";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import { DIRECTION_META, PassportCardDirection } from "./card";
import { SocialFrame } from "./social/SocialFrame";
import { ShareActions, SocialSafetyNote } from "./social/ShareActions";

// Sized so all three directions sit on one row at desktop width. The
// decision this screen exists for is comparative, and a direction that has
// to be scrolled to is not being compared.
const CARD_PREVIEW_WIDTH = 344;

function DirectionCaption({
  direction,
  className,
}: {
  direction: CardDirection;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const meta = DIRECTION_META[direction];
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{pt(meta.labelKey)}</h3>
      {meta.recommended ? (
        <span className="inline-flex items-center rounded-full border border-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
          {pt("studio.recommended")}
        </span>
      ) : null}
    </div>
  );
}

export function CardStudio({ personaId, className }: { personaId: string; className?: string }) {
  const { pt } = usePassportCopy();
  const [direction, setDirection] = useState<CardDirection>("signature");
  const [overlay, setOverlay] = useState<ShareOverlayState>("none");
  const [format, setFormat] = useState<ShareFormat>("square");
  const [privacyMode, setPrivacyMode] = useState<PrivacyMode>("full_name");
  const [compareAll, setCompareAll] = useState(true);

  const holder = personaById(personaId);
  const card = buildPassportCard(holder, FIXTURE_EVALUATION_DATE);
  const social = buildSocialCard(holder, FIXTURE_EVALUATION_DATE, {
    privacyMode,
    anonymousLabel: pt("share.anonymousLabel"),
    staleWarning: overlay !== "none",
  });
  const verifyUrl = social.verifyUrl;

  return (
    <div className={cn("mx-auto w-full max-w-7xl space-y-8", className)}>
      <header>
        <h2
          className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pt("studio.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{pt("studio.lead")}</p>
      </header>

      {/* Studio controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <label
            htmlFor="studio-direction"
            className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {pt("studio.direction")}
          </label>
          <select
            id="studio-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as CardDirection)}
            className="mt-1 block h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {CARD_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {pt(DIRECTION_META[d].labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="studio-overlay"
            className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {pt("studio.state")}
          </label>
          <select
            id="studio-overlay"
            value={overlay}
            onChange={(e) => setOverlay(e.target.value as ShareOverlayState)}
            className="mt-1 block h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="none">—</option>
            <option value="share_expired">{pt("card.shareExpired")}</option>
            <option value="share_revoked">{pt("card.shareRevoked")}</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="studio-format"
            className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {pt("share.format")}
          </label>
          <select
            id="studio-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ShareFormat)}
            className="mt-1 block h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {SHARE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {pt(f.labelKey as PassportCopyKey)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="studio-privacy"
            className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {pt("share.privacyMode")}
          </label>
          <select
            id="studio-privacy"
            value={privacyMode}
            onChange={(e) => setPrivacyMode(e.target.value as PrivacyMode)}
            className="mt-1 block h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {(["full_name", "initials", "anonymous"] as const).map((m) => (
              <option key={m} value={m}>
                {pt(`share.privacy.${m}` as PassportCopyKey)}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex h-10 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={compareAll}
            onChange={(e) => setCompareAll(e.target.checked)}
            className="h-4 w-4 rounded border-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {pt("studio.compareAll")}
        </label>
      </div>

      {/* In-app card(s) */}
      <section>
        {compareAll ? (
          <div className="flex flex-wrap gap-6">
            {CARD_DIRECTIONS.map((d) => (
              <div key={d} className="space-y-2">
                <DirectionCaption direction={d} />
                <div style={{ width: CARD_PREVIEW_WIDTH }}>
                  <PassportCardDirection
                    direction={d}
                    card={card}
                    shareOverlay={overlay}
                    verifyUrl={verifyUrl}
                    className="min-h-[560px]"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <DirectionCaption direction={direction} />
            <div style={{ width: CARD_PREVIEW_WIDTH }}>
              <PassportCardDirection
                direction={direction}
                card={card}
                shareOverlay={overlay}
                verifyUrl={verifyUrl}
                className="min-h-[560px]"
              />
            </div>
          </div>
        )}
      </section>

      {/* Social formats — the safe subset only */}
      <section className="space-y-4">
        <div>
          <h3
            className="text-lg font-semibold tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {pt("share.title")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{pt("share.lead")}</p>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <SocialFrame model={social} format={format} previewWidth={format === "og" ? 480 : 360} />
          <div className="min-w-[18rem] flex-1 space-y-4">
            <SocialSafetyNote />
            <ShareActions />
          </div>
        </div>
      </section>
    </div>
  );
}
