/**
 * Negative controls for the credential shield system.
 *
 * Each mutation reintroduces one quiet defect the guard exists for: history
 * drawn as current, a blank field wearing a globe, an emirate flattened into
 * its country, a row that grows, trust told by colour alone, or a shared view
 * that offers a way into what was not shared.
 *
 * Run: bun run negative-controls:passport-credential-shield
 */
import { runControls, type Mutation } from "./runner";

const RULES = "src/lib/security-passport/credential-shield.ts";
const SHIELD = "src/components/security-passport/CredentialShield.tsx";
const RECIPIENT = "src/components/security-passport/live/RecipientPassportCard.tsx";
const GUARD = "passport-credential-shield:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PCS-NC-HISTORY-DRAWN-AS-CURRENT",
    defect:
      "everything but a draft counts as current, so an expired or revoked licence is drawn as a shield on the card",
    file: RULES,
    find: '  return candidate.lifecycle === "active";',
    replace: '  return candidate.lifecycle !== "draft";',
    guard: GUARD,
    expect: "expired is not current",
  },
  {
    id: "PCS-NC-BLANK-BECOMES-GLOBAL",
    defect:
      "a credential with no jurisdiction is treated as global, so a blank field wears a globe and reads as valid everywhere",
    file: RULES,
    find: "  if (input.global === true) {",
    replace: "  if (input.global === true || !input.jurisdictionCode) {",
    guard: GUARD,
    expect: "never becomes global by omission",
  },
  {
    id: "PCS-NC-GLOBAL-WEARS-A-FLAG",
    defect:
      "a global certification is given a national flag, so a CPP reads as a Swedish credential",
    file: RULES,
    find: '    return { kind: "global", code: null, flag: null, label: passportT("scope.global", lang) };',
    replace:
      '    return { kind: "global", code: null, flag: "SE", label: passportT("scope.global", lang) };',
    guard: GUARD,
    expect: "NO national flag",
  },
  {
    id: "PCS-NC-EMIRATE-FLATTENED",
    defect:
      "the sub-jurisdiction is ignored, so a SIRA card reads as valid across the UAE and an NI licence as Great Britain",
    file: RULES,
    find: '(input.subJurisdictionCode || input.jurisdictionCode || "")',
    replace: '(input.jurisdictionCode || "")',
    guard: GUARD,
    expect: "Dubai is not flattened to the UAE",
  },
  {
    id: "PCS-NC-ROW-GROWS",
    defect: "a fifth slot is added, so the card starts growing with the collection",
    file: RULES,
    find: "export const SHIELD_SLOTS = 4;",
    replace: "export const SHIELD_SLOTS = 5;",
    guard: GUARD,
    expect: "eight render as three shields",
  },
  {
    id: "PCS-NC-COUNT-OFF-BY-ONE",
    defect:
      "+N counts from the slot limit instead of from what is drawn, so eight credentials read as three shields and +4",
    file: RULES,
    find: "  return { shown, overflow: current.length - shown.length };",
    replace: "  return { shown, overflow: current.length - SHIELD_SLOTS };",
    guard: GUARD,
    expect: "5 current → 3 shields and +2",
  },
  {
    id: "PCS-NC-ORDER-IGNORES-TRUST",
    defect:
      "the constellation stops leading with what was checked, so three self-declared rows hide the one reviewed credential behind +N",
    file: RULES,
    find: "(TRUST_ORDER[a.c.state] ?? 9) - (TRUST_ORDER[b.c.state] ?? 9) || a.index - b.index,",
    replace: "a.index - b.index,",
    guard: GUARD,
    expect: "what was checked leads",
  },
  {
    id: "PCS-NC-TRUST-BY-COLOUR-ALONE",
    defect: "the dashed outline is dropped, so self-declared and documented differ only in hue",
    file: SHIELD,
    find: "        strokeDasharray={t.dash ?? undefined}",
    replace: "        strokeDasharray={undefined}",
    guard: GUARD,
    expect: "self-declared is dashed",
  },
  {
    id: "PCS-NC-STATUS-WORD-GONE",
    defect: "the status word beside the mark is removed, leaving the shape to carry trust alone",
    file: SHIELD,
    find: "          {word}\n",
    replace: "",
    guard: GUARD,
    expect: "prints its status WORD",
  },
  {
    id: "PCS-NC-ABBREVIATION-FROM-THE-DATABASE-CODE",
    defect:
      "a credential with no governed mark prints a slice of its database code, so a shield reads 'GB_S' or 'SE_P' on the surface a holder shares",
    file: RULES,
    find: "    credentialMark(c.code) ??\n",
    replace: "    credentialMark(c.code) ??\n    c.code?.slice(0, 4) ??\n",
    guard: GUARD,
    expect: "never composed from initials or sliced from a database code",
  },
  {
    id: "PCS-NC-FLAG-BECOMES-A-FETCH",
    defect:
      "an unknown jurisdiction fetches a flag image by code, which is a broken image for every code nobody has reviewed",
    file: SHIELD,
    find: '  return <MapPin aria-hidden="true" data-scope-mark="generic" size={size} className="shrink-0" />;',
    replace:
      '  return <img alt="" data-scope-mark="generic" width={size} src={`/flags/${scope.code}.svg`} />;',
    guard: GUARD,
    expect: "never an image that could break",
  },
  {
    id: "PCS-NC-RECIPIENT-COUNT-BECOMES-A-DOOR",
    defect:
      "the shared card's +N becomes a link, offering a recipient a way towards credentials the holder did not share",
    file: RECIPIENT,
    find: '              ground="navy"\n',
    replace:
      '              ground="navy"\n              overflow={(node) => <a href="/passport#merits">{node}</a>}\n',
    guard: GUARD,
    expect: "a count, not a link",
  },
  {
    id: "PCS-NC-RECIPIENT-TITLE-COLLIDES-AGAIN",
    defect:
      "the shared credential header goes back to one wrapping row, so at 390px a long title's longest word paints over the trust chip",
    file: "src/components/security-passport/live/RecipientCredentialList.tsx",
    find: 'className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4"',
    replace: 'className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2"',
    guard: GUARD,
    expect: "a deliberate stack below sm",
  },
];

runControls("passport-credential-shield", MUTATIONS);
