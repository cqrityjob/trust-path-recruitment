// Security Passport — the verified-experience mark.
//
// ── IT COUNTS TIME, IT DOES NOT RATE A PERSON ──────────────────────────
//
// Four segments that fill as verified time accumulates, one metal accent at
// the top band, and the exact duration printed beside it — always. The
// number is the point; the mark is a glance. A reader never has to decode
// the symbol, because the thing it stands for is written next to it.
//
// What it deliberately is not: a percentage, a star rating, a red-amber-green
// scale, or anything that could be read as a judgement of the holder. The
// bands come from experience-policy.ts, where the thresholds are documented
// and asserted, rather than from a number chosen inside a component.
//
// ── SELF-DECLARED TIME IS SHOWN, AND SHOWN AS INCOMPLETE ───────────────
//
// A holder with years of unverified work is not at zero, and pretending
// otherwise would push them to overclaim. So self-declared time is stated in
// words beside the mark while the mark itself stays dashed and empty: the
// segments track VERIFIED time only, because that is the only thing anyone
// else has stood behind.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import { formatDuration } from "@/lib/security-passport/format";
import { TRUST_PALETTE } from "@/lib/security-passport/design/trust-system";
import {
  experienceBandForDays,
  experienceMarkStyle,
} from "@/lib/security-passport/experience-policy";

export function ExperienceMark({
  verifiedDays,
  selfDeclaredDays,
  /** Card surfaces sit on navy and pass their own tones. */
  onNavy = false,
}: {
  verifiedDays: number;
  selfDeclaredDays: number;
  onNavy?: boolean;
}) {
  const { pt, lang } = usePassportCopy();
  const band = experienceBandForDays(verifiedDays);
  const style = experienceMarkStyle(band);

  const ink = onNavy ? TRUST_PALETTE.ink : undefined;
  const muted = onNavy ? TRUST_PALETTE.inkMuted : undefined;
  const filledTone = style.accent
    ? TRUST_PALETTE.goldBright
    : onNavy
      ? TRUST_PALETTE.blueLuminous
      : TRUST_PALETTE.blue;
  const emptyTone = onNavy ? `${TRUST_PALETTE.inkFaint}55` : "rgba(120,140,165,0.30)";

  return (
    <div>
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.18em]"
        style={muted ? { color: muted } : undefined}
        // Without this the segments below are decorative shapes to a screen
        // reader; with it they are labelled as what they count.
      >
        {pt("exp.verifiedLabel")}
      </p>

      <div className="mt-1.5 flex items-center gap-3">
        <span
          className="flex items-center gap-1"
          role="img"
          aria-label={`${pt("exp.verifiedLabel")}: ${formatDuration(verifiedDays, lang)}`}
        >
          {Array.from({ length: style.total }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="block h-2.5 w-6 rounded-sm"
              style={{
                background: i < style.filled ? filledTone : "transparent",
                border:
                  i < style.filled
                    ? `1px solid ${filledTone}`
                    : `1px ${style.outline} ${emptyTone}`,
              }}
            />
          ))}
        </span>

        {/* The exact figure, never replaced by the mark. */}
        <span
          className="text-lg font-semibold tabular-nums"
          style={
            ink
              ? { color: ink, fontFamily: "var(--font-display)" }
              : { fontFamily: "var(--font-display)" }
          }
        >
          {verifiedDays > 0 ? formatDuration(verifiedDays, lang) : pt("exp.noneYet")}
        </span>
      </div>

      {/* Self-declared time is real information and is stated, in words,
          as the different thing it is. */}
      {selfDeclaredDays > verifiedDays ? (
        <p className="mt-1.5 text-xs leading-relaxed" style={muted ? { color: muted } : undefined}>
          {pt("exp.selfDeclaredAlso")} {formatDuration(selfDeclaredDays, lang)}
        </p>
      ) : null}
    </div>
  );
}
