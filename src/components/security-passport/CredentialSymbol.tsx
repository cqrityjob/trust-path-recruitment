// Security Passport — the credential symbol, as a component.
//
// A thin accessible wrapper around the string geometry in
// design/credential-symbols.ts. The drawing itself lives there so the
// exported social PNGs (assembled as SVG strings) render the identical
// mark; this file only adds the things a live page needs — an accessible
// name, sizing, and the status word beside the mark.
//
// ── THE WORD TRAVELS WITH THE MARK ─────────────────────────────────────
//
// `CredentialSymbolLockup` is the default way to place a symbol: mark plus
// status word, one unit. A bare `CredentialSymbol` exists for surfaces that
// print the word themselves (the card plates, the detail header) — it still
// carries the full state in its accessible name, so a screen reader never
// gets less than a sighted reader.

import { usePassportCopy } from "@/lib/security-passport/use-passport-copy";
import {
  SYMBOL_VIEWBOX,
  credentialSymbolMarkup,
  presentationWordKey,
  type CredentialPresentationState,
} from "@/lib/security-passport/design/credential-symbols";

export interface CredentialSymbolProps {
  /** Taxonomy code — VU1, VU2, OV, SV — or null for a free-text credential,
   *  which takes the neutral document device. */
  readonly code: string | null;
  readonly state: CredentialPresentationState;
  /** Plate text; defaults to the code. Taxonomy rows carry `symbol_label`. */
  readonly symbolLabel?: string;
  /** Accessible subject — the credential's display name. The state word is
   *  appended automatically. */
  readonly name: string;
  /** Rendered size in px. The drawing is vector; any size is crisp. */
  readonly size?: number;
  readonly className?: string;
}

export function CredentialSymbol({
  code,
  state,
  symbolLabel,
  name,
  size = 44,
  className,
}: CredentialSymbolProps) {
  const { pt } = usePassportCopy();
  const word = pt(presentationWordKey(state));
  return (
    <svg
      role="img"
      aria-label={`${name} — ${word}`}
      width={size}
      height={size}
      viewBox={`0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}`}
      className={className}
      // The geometry is a build-time string from our own design module —
      // no user input reaches it. Sharing the string with the PNG exporter
      // is what guarantees the reviewed mark is the shipped mark.
      dangerouslySetInnerHTML={{ __html: credentialSymbolMarkup(code, state, symbolLabel) }}
    />
  );
}

/** Word tone for THEME surfaces (the private pages), where the plate's own
 *  navy ground guarantees the mark itself but the word sits on the page.
 *  Mirrors the LifecycleChip tone family; never the only channel. */
const WORD_TONE: Record<CredentialPresentationState, string> = {
  draft: "text-muted-foreground",
  self_declared: "text-muted-foreground",
  documented: "text-foreground",
  approved: "text-foreground",
  expired: "text-amber-700 dark:text-amber-400",
  revoked: "text-destructive",
  superseded: "text-muted-foreground",
  disputed: "text-amber-700 dark:text-amber-400",
};

/** Symbol plus its status word — the default placement on theme surfaces. */
export function CredentialSymbolLockup({
  code,
  state,
  symbolLabel,
  name,
  size = 44,
  className,
}: CredentialSymbolProps) {
  const { pt } = usePassportCopy();
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <CredentialSymbol
        code={code}
        state={state}
        symbolLabel={symbolLabel}
        name={name}
        size={size}
      />
      <span
        className={`text-[10px] font-semibold uppercase leading-tight tracking-[0.16em] ${WORD_TONE[state]}`}
      >
        {pt(presentationWordKey(state))}
      </span>
    </span>
  );
}
