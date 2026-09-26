// Security Passport — the credential shield.
//
// One credential, as one compact mark: the CQrityjob shield, the credential's
// governed abbreviation, where it applies, and how far it has been checked.
//
// ── NOTHING HERE DECIDES ANYTHING ──────────────────────────────────────
//
// The abbreviation is `credentialMark` — the same governed table the plate
// symbol prints. The trust treatment is `symbolTreatment` — the same edge,
// dash, rim and glyph. The scope and the choice of which shields a card shows
// are `credential-shield.ts`. This file is a silhouette and a layout; a second
// catalogue or a second opinion about trust would be a defect.
//
// ── TRUST IS NEVER COLOUR ALONE ────────────────────────────────────────
//
//   verified       filled, doubled rim, check glyph
//   documented     solid outline, document glyph
//   self-declared  dashed outline, no glyph
//   not current    warning treatment — and never drawn on a card at all
//
// plus the status WORD beside the mark, and the whole statement in the
// accessible name. No issuer logo appears anywhere: the shield is ours.

import type { ReactNode } from "react";
import { Globe2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { credentialDate } from "@/lib/security-passport/international";
import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import {
  presentationWordKey,
  symbolTreatment,
  type CredentialPresentationState,
} from "@/lib/security-passport/design/credential-symbols";
import type { PassportCopyKey } from "@/lib/security-passport/i18n";
import {
  constellationOf,
  shieldMarkText,
  type CredentialScope,
  type FlagCode,
} from "@/lib/security-passport/credential-shield";

/* ------------------------------------------------------------------ */
/* Scope mark: a flag, a globe, or a safe generic marker               */
/* ------------------------------------------------------------------ */

/** Drawn, not fetched: an `<img>` to a flag CDN is a broken image the day the
 *  CDN is blocked, on the one surface a holder screenshots. */
const FLAG_ART: Record<FlagCode, ReactNode> = {
  SE: (
    <>
      <rect width="16" height="10" fill="#006AA7" />
      <rect x="5" width="2" height="10" fill="#FECC02" />
      <rect y="4" width="16" height="2" fill="#FECC02" />
    </>
  ),
  GB: (
    <>
      <rect width="16" height="10" fill="#012169" />
      <path d="M0 0 16 10M16 0 0 10" stroke="#FFF" strokeWidth="2" />
      <path d="M0 0 16 10M16 0 0 10" stroke="#C8102E" strokeWidth="0.8" />
      <path d="M8 0v10M0 5h16" stroke="#FFF" strokeWidth="3.2" />
      <path d="M8 0v10M0 5h16" stroke="#C8102E" strokeWidth="1.8" />
    </>
  ),
  AE: (
    <>
      <rect width="16" height="3.34" fill="#00732F" />
      <rect y="3.33" width="16" height="3.34" fill="#FFF" />
      <rect y="6.66" width="16" height="3.34" fill="#000" />
      <rect width="4.2" height="10" fill="#FF0000" />
    </>
  ),
  // India: saffron, white, green, and the navy wheel at the centre.
  IN: (
    <>
      <rect width="16" height="3.34" fill="#FF9933" />
      <rect y="3.33" width="16" height="3.34" fill="#FFF" />
      <rect y="6.66" width="16" height="3.34" fill="#138808" />
      <circle cx="8" cy="5" r="1.25" fill="none" stroke="#000080" strokeWidth="0.35" />
      <circle cx="8" cy="5" r="0.3" fill="#000080" />
    </>
  ),
};

/** Decorative by contract: the written scope always sits beside it. */
export function ScopeMark({ scope, size = 14 }: { scope: CredentialScope; size?: number }) {
  if (scope.kind === "global") {
    return <Globe2 aria-hidden="true" data-scope-mark="globe" size={size} className="shrink-0" />;
  }
  if (scope.flag) {
    return (
      <svg
        aria-hidden="true"
        data-scope-mark="flag"
        data-flag={scope.flag}
        viewBox="0 0 16 10"
        width={Math.round(size * 1.5)}
        height={size}
        className="shrink-0 rounded-[2px] ring-1 ring-black/15"
      >
        {FLAG_ART[scope.flag]}
      </svg>
    );
  }
  // A jurisdiction we cannot draw, or one nobody stated. The label says which.
  return <MapPin aria-hidden="true" data-scope-mark="generic" size={size} className="shrink-0" />;
}

/* ------------------------------------------------------------------ */
/* The shield silhouette                                               */
/* ------------------------------------------------------------------ */

const SHIELD = "M22 3.5 37.5 9v12.2c0 9.6-6.4 16.4-15.5 19.3C12.9 37.6 6.5 30.8 6.5 21.2V9Z";
const SHIELD_RIM = "M22 8 33.5 12v9.4c0 7.2-4.6 12.4-11.5 14.9-6.9-2.5-11.5-7.7-11.5-14.9V12Z";

function Glyph({ kind, tone }: { kind: string | null; tone: string }) {
  const stroke = {
    stroke: tone,
    strokeWidth: 2.4,
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  switch (kind) {
    case "check":
      return <path d="M15 22.5l5 5 9.5-10.5" {...stroke} />;
    case "document":
      return (
        <>
          <path d="M16.5 14h8l3.5 3.5V30h-11.5Z" {...stroke} strokeWidth={1.8} />
          <path d="M19.5 22h6M19.5 26h6" {...stroke} strokeWidth={1.6} />
        </>
      );
    case "warning":
      return <path d="M22 14v9M22 28.5v.5" {...stroke} />;
    case "question":
      return <path d="M18.5 18a3.5 3.5 0 1 1 5.2 3c-1.2.8-1.7 1.5-1.7 3M22 28.5v.5" {...stroke} />;
    case "cross":
      return <path d="M16.5 16.5l11 11M27.5 16.5l-11 11" {...stroke} />;
    case "arrow":
      return <path d="M15 22h14M24 17l5 5-5 5" {...stroke} />;
    default:
      return null;
  }
}

export function ShieldMark({
  state,
  size = 36,
}: {
  state: CredentialPresentationState;
  size?: number;
}) {
  const t = symbolTreatment(state);
  const verified = state === "verified";
  return (
    <svg
      aria-hidden="true"
      data-shield-mark={state}
      viewBox="0 0 44 44"
      width={size}
      height={size}
      className="shrink-0"
      style={{ opacity: t.opacity }}
    >
      <path
        d={SHIELD}
        fill={verified ? `${TRUST_PALETTE.gold}33` : TRUST_PALETTE.navy}
        stroke={t.edge}
        strokeWidth={verified ? 2.4 : 2}
        strokeDasharray={t.dash ?? undefined}
        strokeLinejoin="round"
      />
      {t.doubleRim ? (
        <path d={SHIELD_RIM} fill="none" stroke={t.edge} strokeWidth={1} opacity={0.7} />
      ) : null}
      <Glyph kind={t.glyph} tone={t.glyphTone} />
      {t.strike ? (
        <path d="M9 37 35 7" stroke={TRUST_PALETTE.danger} strokeWidth={2} strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* One shield                                                          */
/* ------------------------------------------------------------------ */

export interface ShieldCredential {
  readonly id: string;
  readonly code: string | null;
  /** The credential's display name, in the reader's language. */
  readonly name: string;
  readonly state: CredentialPresentationState;
  /** Overrides the vocabulary's own word, e.g. "Documented" for a legacy row. */
  readonly statusWordKey?: PassportCopyKey;
  /** EFFECTIVE lifecycle — expiry already applied. */
  readonly lifecycle: string;
  readonly validUntil: string | null;
  readonly scope: CredentialScope;
}

export function CredentialShield({
  credential: c,
  ground,
  className,
}: {
  credential: ShieldCredential;
  /** `navy` on the Passport card, `surface` on a themed page. */
  ground: "navy" | "surface";
  className?: string;
}) {
  const { pt, lang } = usePassportCopy();
  const word = pt(c.statusWordKey ?? presentationWordKey(c.state));
  const lifecycle = pt(`lifecycle.${c.lifecycle}` as PassportCopyKey);
  // "Not stated" is a fact for the ROW, where it can be corrected. On a shield
  // it would read as a property of the credential, so the shield stays silent.
  const scoped = c.scope.kind !== "not_stated";
  const full = [
    c.name,
    scoped ? c.scope.label : null,
    word,
    lifecycle,
    c.validUntil ? `${pt("shield.expires")} ${credentialDate(c.validUntil, lang)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const navy = ground === "navy";
  return (
    <span
      role="img"
      aria-label={full}
      title={full}
      data-credential-shield={c.id}
      data-shield-state={c.state}
      data-shield-scope={c.scope.kind === "jurisdiction" ? c.scope.code : c.scope.kind}
      className={cn("flex min-w-0 flex-col items-center gap-1.5 px-1 text-center", className)}
    >
      <ShieldMark state={c.state} />
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-semibold leading-tight",
            navy ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {shieldMarkText(c) ?? "—"}
        </span>
        {scoped ? (
          <span
            className={cn(
              "mt-0.5 flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[10px] font-medium leading-tight",
              navy ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            <ScopeMark scope={c.scope} size={9} />
            <span className="min-w-0 [overflow-wrap:normal]">{c.scope.label}</span>
          </span>
        ) : null}
        <span
          className={cn(
            "mt-0.5 block text-[10px] lowercase leading-tight first-letter:uppercase",
            navy ? "text-primary-foreground/55" : "text-muted-foreground",
          )}
        >
          {word}
        </span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The constellation                                                   */
/* ------------------------------------------------------------------ */

/**
 * At most four slots, always: every current shield up to four, otherwise three
 * and a count. The same rule at every width, so the card keeps its shape.
 *
 * `overflow` is supplied by the caller because what "+N" DOES differs: on the
 * holder's card it is the one link to Credentials; on a shared view it is a
 * plain count of what was disclosed, with nowhere further to go.
 */
export function CredentialConstellation({
  credentials,
  ground,
  overflow,
  className,
}: {
  credentials: readonly ShieldCredential[];
  ground: "navy" | "surface";
  /** Wraps the "+N" shield, e.g. in a link. Receives the accessible label. */
  overflow?: (shield: ReactNode, label: string, count: number) => ReactNode;
  className?: string;
}) {
  const { pt } = usePassportCopy();
  const { shown, overflow: more } = constellationOf(credentials);
  const navy = ground === "navy";

  if (shown.length === 0) {
    return (
      <p
        data-shield-constellation="empty"
        className={cn(
          "text-xs leading-relaxed",
          navy ? "text-primary-foreground/65" : "text-muted-foreground",
          className,
        )}
      >
        {pt("shield.none")}
      </p>
    );
  }

  const label = `+${more} ${pt("shield.more")}`;
  const moreShield = (
    <span
      data-shield-overflow={more}
      className="flex min-w-0 flex-col items-center gap-1.5 px-1 text-center"
    >
      <svg aria-hidden="true" viewBox="0 0 44 44" width={36} height={36} className="shrink-0">
        <path
          d={SHIELD}
          fill="none"
          stroke={navy ? TRUST_PALETTE.inkFaint : "currentColor"}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-sm font-semibold leading-tight tabular-nums",
            navy ? "text-primary-foreground" : "text-foreground",
          )}
        >
          +{more}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[9px] leading-tight",
            navy ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {pt("shield.more")}
        </span>
      </span>
    </span>
  );

  return (
    <ul
      data-shield-constellation={shown.length + (more > 0 ? 1 : 0)}
      // Four across wherever four FIT. A shield's longest word —
      // "Egenrapporterad" — needs about 72px; below an 18rem container a
      // quarter is narrower than that and the words ran into each other (the
      // homepage's inset example card at 390px). There the same four shields
      // sit two by two.       // keeps its single row at every width and its height does not change.
      className={cn(
        "grid grid-cols-2 items-start gap-y-4 @[18rem]:grid-cols-4 @[18rem]:gap-y-0",
        className,
      )}
    >
      {shown.map((c, i) => (
        <li
          key={c.id}
          className={cn(
            "min-w-0",
            i > 0 &&
              (navy
                ? "@[18rem]:border-l @[18rem]:border-primary-foreground/15"
                : "@[18rem]:border-l"),
          )}
        >
          <CredentialShield credential={c} ground={ground} />
        </li>
      ))}
      {more > 0 ? (
        <li
          className={cn(
            "min-w-0",
            navy ? "@[18rem]:border-l @[18rem]:border-primary-foreground/15" : "@[18rem]:border-l",
          )}
        >
          {overflow ? (
            overflow(moreShield, label, more)
          ) : (
            <span role="img" aria-label={label} title={label}>
              {moreShield}
            </span>
          )}
        </li>
      ) : null}
    </ul>
  );
}
