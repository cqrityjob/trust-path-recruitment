/**
 * Negative controls for the ONE-Passport image (owner decision, 2026-09-29).
 *
 * Each mutation reintroduces one defect the guard exists to catch: the old
 * three-credential cut, a second image ("1 / 2"), a dropped or duplicated
 * credential, a credential in the wrong jurisdiction group, every group
 * flattened into one, a private field on the image, critical text below the
 * readability floor, a shared image that is not the preview, a share sheet
 * handed several files, or a link created without the holder's press.
 *
 * Run: bun run negative-controls:social-image
 */
import { runControls, type Mutation } from "./runner";

const guard = "passport-social-image:check";
const DRAWING = "src/components/security-passport/social/SocialCardSvg.tsx";
const MODEL = "src/lib/security-passport/social.ts";
const GROUPS = "src/lib/security-passport/passport-groups.ts";
const CHANNELS = "src/lib/security-passport/share-channels.ts";
const FLOW = "src/components/security-passport/live/SocialShareFlow.tsx";

const mutations: readonly Mutation[] = [
  // ── The wrong model, and every way back to it ──────────────────────────
  {
    id: "ONE-PASSPORT-THREE-CUT",
    defect: "the image quietly keeps the first three of the holder's selection and drops the rest",
    file: MODEL,
    find: "  const drawn = credentials.filter(isSocialPublishable).map((c) => ({",
    replace: "  const drawn = credentials.filter(isSocialPublishable).slice(0, 3).map((c) => ({",
    guard,
    expect: "the model carries every selected credential once, in order: none is cut",
  },
  {
    id: "ONE-PASSPORT-FOURTH-DROPPED",
    defect: "credential number four never reaches the drawing: the grouping drops it",
    file: GROUPS,
    find: "  for (const c of credentials) {\n    const scope = resolveCredentialScope(",
    replace:
      "  for (const c of credentials.filter((_, i) => i !== 3)) {\n    const scope = resolveCredentialScope(",
    guard,
    expect: "selected credentials are drawn as 4 shields on the one image",
  },
  {
    id: "ONE-PASSPORT-PAGES-AGAIN",
    defect: "the drawing marks itself as image 1 of a set again",
    file: DRAWING,
    find: "      {p.strings.brand.toUpperCase()}\n    </Text>,\n  );\n  y += 26 * iu;",
    replace:
      "      {`${p.strings.brand.toUpperCase()} · 1 / ${Math.max(2, Math.ceil(p.model.credentials.length / 3))}`}\n    </Text>,\n  );\n  y += 26 * iu;",
    guard,
    expect: 'no page marker, no "1 / 2", no set',
  },
  {
    id: "ONE-PASSPORT-THREE-PER-IMAGE",
    defect:
      "the drawing draws only the first three credentials, the old per-image limit, and leaves the rest to an image that no longer exists",
    file: DRAWING,
    find: "  const groups = groupPassportCredentials(p.model.credentials, p.lang);",
    replace: "  const groups = groupPassportCredentials(p.model.credentials.slice(0, 3), p.lang);",
    guard,
    expect: "selected credentials are drawn as 4 shields on the one image",
  },
  {
    id: "ONE-PASSPORT-DUPLICATED",
    defect: "the first credential is drawn twice: once in its group and once more at the end of it",
    file: GROUPS,
    find: '  const placed = [...groups.entries()].filter(([key]) => key !== "not_stated");',
    replace:
      '  groups.values().next().value?.credentials.push(credentials[0]!);\n  const placed = [...groups.entries()].filter(([key]) => key !== "not_stated");',
    guard,
    expect: "no credential is drawn twice",
  },
  // ── Grouping is controlled metadata ────────────────────────────────────
  {
    id: "ONE-PASSPORT-WRONG-JURISDICTION",
    defect: "a Dubai cadre card is grouped under the country, not its exact scope",
    file: GROUPS,
    find: '  if (scope.kind === "jurisdiction") return `jurisdiction:${scope.code}`;',
    replace:
      '  if (scope.kind === "jurisdiction") return `jurisdiction:${scope.code?.slice(0, 2)}`;',
    guard,
    expect: "every shield is drawn in the group its own controlled scope names",
  },
  {
    id: "ONE-PASSPORT-GROUPS-FLATTENED",
    defect: "every credential is put into one group under the first credential's flag",
    file: GROUPS,
    find: "    const key = passportGroupKey(scope);",
    replace: '    const key = "jurisdiction:SE";',
    guard,
    expect: "same-scope credentials share one group",
  },
  {
    id: "ONE-PASSPORT-GLOBAL-GUESSED",
    defect: "a credential with no stated jurisdiction is grouped as international",
    file: GROUPS,
    find: '  if (scope.kind === "global") return "global";',
    replace: '  if (scope.kind === "global" || scope.kind === "not_stated") return "global";',
    guard,
    expect: "an unplaced credential is neither",
  },
  // ── Trust stays on the shield ──────────────────────────────────────────
  {
    id: "ONE-PASSPORT-RAISED-TO-VERIFIED",
    defect: "every shield on the image is drawn as verified, whatever the credential's standing",
    file: DRAWING,
    find: "              <ShieldMark state={c.state} size={r(shield)} />",
    replace: '              <ShieldMark state="verified" size={r(shield)} />',
    guard,
    expect: "each shield wears its own state",
  },
  {
    id: "ONE-PASSPORT-WORD-PER-GROUP",
    defect: "the trust word is drawn once per group, from the first shield, instead of per shield",
    file: DRAWING,
    find: "              {cell.word.text}",
    replace: "              {block.cells[0]!.word.text}",
    guard,
    expect: "the word is printed per shield, never per group",
  },
  // ── Privacy ────────────────────────────────────────────────────────────
  {
    id: "ONE-PASSPORT-PRIVATE-ON-IMAGE",
    defect: "the issuer a credential was stated with is printed on the public image",
    file: MODEL,
    find: "    nameSv: c.title,\n    nameEn: c.title,",
    replace: '    nameSv: `${c.title} ${c.issuer ?? ""}`,\n    nameEn: c.title,',
    guard,
    expect: "none of it is drawn",
  },
  // ── Readability ────────────────────────────────────────────────────────
  {
    id: "ONE-PASSPORT-BELOW-FLOOR",
    defect: "a name that does not fit is shrunk without limit instead of stopping at the floor",
    file: DRAWING,
    find: "  const shrunk = Math.max(floor, (maxW / text.length - spacing) / em);",
    replace: "  const shrunk = (maxW / text.length - spacing) / em;",
    guard,
    expect: "no text is drawn below the readability floor",
  },
  {
    id: "ONE-PASSPORT-FLOOR-LOWERED",
    defect:
      "the readability floor is lowered so a crowded format shrinks text instead of saying it is crowded",
    file: DRAWING,
    find: "export const READABILITY_FLOOR = 14;",
    replace: "export const READABILITY_FLOOR = 8;",
    guard,
    expect: "the approved readability floor is 14px per 1080",
  },
  // ── What is shared is what is previewed, and it is one file ────────────
  {
    id: "ONE-PASSPORT-SHARE-NOT-PREVIEW",
    defect: "the share sheet and the saved file are made from a different drawing than the preview",
    file: FLOW,
    find: "  const prepared = svg && file && file.svg === svg ? file.file : null;",
    replace: "  const prepared = file ? file.file : null;",
    guard,
    expect: "the file handed over is the one made from the SVG on screen",
  },
  {
    id: "ONE-PASSPORT-SHEET-GETS-A-SET",
    defect: "the device share sheet is handed the image twice, as a set of files",
    file: CHANNELS,
    find: "    files: [file],",
    replace: "    files: [file, file],",
    guard,
    expect: "the device share is handed ONE image file",
  },
  {
    id: "ONE-PASSPORT-PLATFORM-MANY",
    defect: "LinkedIn is told the images are ready, as if a set were prepared",
    file: CHANNELS,
    find: '    noticeKey: channel === "email" ? "social.ready.email" : "social.ready.post",',
    replace: '    noticeKey: channel === "email" ? "social.ready.email" : "social.device.hint",',
    guard,
    expect: "never claims the image went along; says to add it",
  },
  {
    id: "ONE-PASSPORT-FILE-OF-SET",
    defect: "the downloaded file is named as one of a set again",
    file: "src/lib/security-passport/share-image.ts",
    find: "  return `cqrityjob-passport-${format}.png`;",
    replace: "  return `cqrityjob-passport-${format}-1-of-2.png`;",
    guard,
    expect: "no '-1-of-2' name exists",
  },
  // ── A link only on the holder's own press ──────────────────────────────
  {
    id: "ONE-PASSPORT-LINK-IMPLICIT",
    defect: "saving the image quietly creates a public share as well",
    file: FLOW,
    find: "  function saveImage() {\n    if (!prepared) return;",
    replace: "  function saveImage() {\n    void ensureShare();\n    if (!prepared) return;",
    guard,
    expect: "a public share is created from one function",
  },
  {
    id: "ONE-PASSPORT-CONSENT-BYPASS",
    defect: "the consent gate lets a press through without the holder's confirmation",
    file: FLOW,
    find: "    if (!consent) {\n      setConsentHint(true);",
    replace: "    if (false as boolean) {\n      setConsentHint(true);",
    guard,
    expect: "and both go through the consent gate",
  },
  {
    id: "ONE-PASSPORT-POPUP-AFTER-AWAIT",
    defect:
      "the destination window is opened after the share is created, where a browser blocks it",
    file: FLOW,
    find: '    const popup = isMail ? null : window.open("", "_blank");',
    replace: "    const popup = null as Window | null;",
    guard,
    expect: "the destination window is opened inside the click",
  },
  {
    id: "ONE-PASSPORT-CANCEL-DOWNLOADS",
    defect: "cancelling the device share sheet saves the image anyway",
    file: FLOW,
    find: '      if (err instanceof DOMException && err.name === "AbortError") return;',
    replace:
      '      if (err instanceof DOMException && err.name === "AbortError") {\n        saveImage();\n        return;\n      }',
    guard,
    expect: "cancelling the device share is a decision",
  },
  {
    id: "ONE-PASSPORT-QR-WITHOUT-LINK",
    defect: "the image draws the QR code it was handed even when the holder chose no link",
    file: DRAWING,
    find: "  const qr = link ? p.qrDataUrl : null;",
    replace: "  const qr = p.qrDataUrl;",
    guard,
    expect: "no link and no QR code when the model carries none",
  },
  {
    id: "ONE-PASSPORT-NO-SNAPSHOT-LINE",
    defect: "an image without a link no longer says it is a snapshot",
    file: "src/lib/security-passport/share-image.ts",
    find: 'snapshotNote: pt("social.snapshotNote"),',
    replace: 'snapshotNote: "",',
    guard,
    expect: "an image without a link says it is a snapshot",
  },
  // ── Accessibility ──────────────────────────────────────────────────────
  {
    id: "ONE-PASSPORT-NO-WORDS-BESIDE-PREVIEW",
    defect: "the whole list as text is dropped, so a crowded image silently loses credentials",
    file: FLOW,
    find: "              <div data-social-export>",
    replace: "              <div>",
    guard,
    expect: "the whole Passport is also given in words",
  },
];

runControls("social-image", mutations);
