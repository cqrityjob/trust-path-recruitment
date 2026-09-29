// Security Passport — ONE Passport, its credentials grouped by where they apply.
//
// ── THE PRODUCT RULE ───────────────────────────────────────────────────
//
// One holder has ONE Security Passport, and that Passport is ONE shareable
// image. Every credential the holder chooses to present is inside it: four,
// six, eleven -- the layout adapts to the credentials, never the credentials
// to the layout. There is no page, no set, no "1 / 2", and no count at which
// a second image begins. A selection is never cut, never sampled and never
// spread over several images (owner decision, 2026-09-29, after the set of
// "SECURITY PASSPORT · 1 / 2" images the previous version produced).
//
// ── THE INFORMATION ARCHITECTURE ───────────────────────────────────────
//
//   HOLDER
//     ↓
//   COUNTRY / JURISDICTION / INTERNATIONAL GROUP
//     ↓
//   CREDENTIAL SHIELDS
//     ↓
//   TRUTHFUL TRUST STATE, per shield
//
// Credentials that share a scope share a heading: "SVERIGE" once, with three
// shields under it, rather than the same flag and country drawn three times.
//
// ── GROUPING IS CONTROLLED METADATA, NEVER A GUESS ─────────────────────
//
// A credential's group is `resolveCredentialScope` over the same three facts
// every shield already resolves its flag from: whether its DEFINITION
// declares an international professional certification, and its stored
// jurisdiction and sub-jurisdiction codes. Nothing is inferred from a name,
// no relationship is invented, and the catalogue is untouched. A Dubai cadre
// card is grouped under Dubai (its exact scope code), not flattened into the
// UAE; a Northern Ireland licence stays apart from Great Britain; a credential
// nobody placed sits in its own unheaded group at the end, and is never
// promoted into a country or a globe.
//
// Grouping is PRESENTATION only. Trust stays on the shield: a group of three
// self-declared credentials is three self-declared shields, and no heading
// ever says anything about verification.

import { resolveCredentialScope, type CredentialScope } from "./credential-shield";
import type { PassportLang } from "./i18n";
import type { SocialCredentialName } from "./social";

export interface PassportGroup {
  /** `global`, `jurisdiction:<CODE>` or `not_stated`. Stable across renders
   *  and languages, so a test can name the group a credential landed in. */
  readonly key: string;
  /** The shared scope: its kind, exact code, drawable flag and written label. */
  readonly scope: CredentialScope;
  /** Every credential of the group, in the order the Passport lists them. */
  readonly credentials: readonly SocialCredentialName[];
}

/** The group a single credential belongs to, from its controlled scope. */
export function passportGroupKey(scope: CredentialScope): string {
  if (scope.kind === "global") return "global";
  if (scope.kind === "jurisdiction") return `jurisdiction:${scope.code}`;
  return "not_stated";
}

/**
 * The Passport's groups: one per distinct controlled scope, in order of first
 * appearance, with the unplaced credentials last. Every credential given is
 * in exactly one group; nothing is dropped, duplicated or reordered inside a
 * group.
 */
export function groupPassportCredentials(
  credentials: readonly SocialCredentialName[],
  lang: PassportLang,
): readonly PassportGroup[] {
  const groups = new Map<string, { scope: CredentialScope; credentials: SocialCredentialName[] }>();
  for (const c of credentials) {
    const scope = resolveCredentialScope(
      {
        global: c.scope.global,
        jurisdictionCode: c.scope.jurisdictionCode,
        subJurisdictionCode: c.scope.subJurisdictionCode,
      },
      lang,
    );
    const key = passportGroupKey(scope);
    const group = groups.get(key);
    if (group) group.credentials.push(c);
    else groups.set(key, { scope, credentials: [c] });
  }
  const placed = [...groups.entries()].filter(([key]) => key !== "not_stated");
  const unplaced = groups.get("not_stated");
  return [
    ...placed.map(([key, g]) => ({ key, scope: g.scope, credentials: g.credentials })),
    ...(unplaced
      ? [{ key: "not_stated", scope: unplaced.scope, credentials: unplaced.credentials }]
      : []),
  ];
}

/** Design guidance, not a limit: which presentation a Passport of this many
 *  credentials starts from. The drawing still adapts to what actually fits. */
export type PassportDensity = "small" | "medium" | "large" | "dense";

export function passportDensity(credentialCount: number): PassportDensity {
  if (credentialCount <= 3) return "small";
  if (credentialCount <= 6) return "medium";
  if (credentialCount <= 10) return "large";
  return "dense";
}
