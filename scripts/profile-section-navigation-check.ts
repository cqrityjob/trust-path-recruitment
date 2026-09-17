// Profile and CV — every section is reachable on the surface that owns it.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// A candidate's information lives on three surfaces: the Profile (who am I
// now), the CV (what have I done) and the Security Passport. Every section
// the completeness model knows about names ONE of them as its owner in
// SECTION_DESTINATIONS, and that owner must actually let the person edit it.
//
// The profile page used to be an index of all ten sections. First the index
// was inert -- it linked only `!done && owner !== "profile"`, so nine rows
// named an editor and opened none. Then every row became a link, but each
// still carried an "Edited here" label that was not a control, above a
// 6 200px page holding the Passport's six-step basics card and every CV
// editor. The owner's 2026-09-17 refinement removed the index: the Profile
// page now holds only the Profile's editors, the CV page holds the CV's,
// and what is MISSING is offered as a link to the field.
//
// Five properties keep the old defects from coming back:
//
//   1. No dead ownership label. Nothing on the Profile page says "edited
//      here" -- a section is either an editor or a link to one.
//   2. Completion never gates an editor. The editors are mounted
//      unconditionally; only the "missing" shortcuts depend on completeness.
//   3. The destination comes from SECTION_DESTINATIONS, through
//      `sectionLinkTarget`. A route or an anchor written again in a route
//      file is a second source of truth, and the two drift the first time a
//      section moves -- which is how a recommendation ended up pointing at
//      an editor that had already been relocated.
//   4. Every destination anchor is RENDERED, exactly once, ON THE SURFACE
//      THAT OWNS IT, and carries a scroll offset. A profile-owned anchor
//      that only exists on the CV page is a dead link with a live id.
//   5. `sectionLinkTarget` round-trips, EXECUTED against the real contract.
//
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SECTION_DESTINATIONS,
  sectionLinkTarget,
  type SectionOwner,
} from "../src/lib/professional-identity/profile-destinations";
import type { CompletenessSection } from "../src/lib/professional-identity/completeness";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const ROUTE = "src/routes/_authenticated.my-career.profile.tsx";
const CV_ROUTE = "src/routes/_authenticated.my-career.cv.index.tsx";

/** Every file that renders on each owning page and may hold an anchor. */
const SURFACES: Readonly<Partial<Record<SectionOwner, readonly string[]>>> = {
  profile: [
    ROUTE,
    "src/components/professional-identity/ProfileBasicsSection.tsx",
    "src/components/assessment/SecurityCareerProfileCard.tsx",
  ],
  cv: [
    CV_ROUTE,
    "src/components/professional-identity/EmploymentHistoryEditor.tsx",
    "src/components/professional-identity/GeneralProfileClaims.tsx",
  ],
};
const OWNER_PATH: Readonly<Partial<Record<SectionOwner, string>>> = {
  profile: "/my-career/profile",
  cv: "/my-career/cv",
};

let failures = 0;
function ck(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
}

// Comments quote the very strings this guard searches for -- including the
// dead label it exists to keep out. Strip them before asserting, or the
// guard reports its own explanation as the defect.
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const route = strip(read(ROUTE));
const cvRoute = strip(read(CV_ROUTE));

const sections = Object.keys(SECTION_DESTINATIONS) as CompletenessSection[];
const ownedBy = (owner: SectionOwner) =>
  sections.filter((s) => SECTION_DESTINATIONS[s].owner === owner);

/** The JSX element that carries `data-section-link` in a route: the opening
 *  tag only, so an assertion about the link is never satisfied by a
 *  neighbour. */
function sectionLinkTag(src: string): string {
  const at = src.indexOf("data-section-link={section}");
  if (at < 0) return "";
  const open = src.lastIndexOf("<", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0 && src[i - 1] !== "=") return src.slice(open, i + 1);
  }
  return "";
}
const profileLink = sectionLinkTag(route);

console.log("1 · the split is real, and nothing is a label pretending to be a control");

ck(
  "1.1 the Profile owns its five sections and the CV owns its four",
  ownedBy("profile").length === 5 && ownedBy("cv").length === 4,
  `profile ${ownedBy("profile").length}, cv ${ownedBy("cv").length}`,
);
for (const owner of ["profile", "cv"] as const) {
  for (const section of ownedBy(owner)) {
    ck(
      `1.2 ${section} is edited on ${OWNER_PATH[owner]}`,
      SECTION_DESTINATIONS[section].href.split(/[?#]/)[0] === OWNER_PATH[owner],
      SECTION_DESTINATIONS[section].href,
    );
  }
}
ck(
  "1.3 no dead ownership label on the Profile page",
  !/Redigeras här|Edited here|ownedHere/.test(route),
  'the Profile page says "edited here" beside something that is not a control',
);
ck(
  "1.4 the Profile page mounts no CV editor, and the CV page mounts both",
  !/<EmploymentHistoryEditor|<GeneralProfileClaims/.test(route) &&
    /<EmploymentHistoryEditor/.test(cvRoute) &&
    /<GeneralProfileClaims/.test(cvRoute),
  "career history must have exactly one editing home: the CV page",
);
ck(
  "1.5 each page offers one way to the other, and the Profile one to the Passport",
  /to="\/my-career\/cv"/.test(route) &&
    /to="\/passport"/.test(route) &&
    /to="\/my-career\/profile"/.test(cvRoute),
);

console.log("\n2 · completion never decides whether an editor is there");

for (const [name, src] of [
  ["<ProfileBasicsSection", route],
  ["<SecurityCareerProfileCard", route],
  ["<EmploymentHistoryEditor", cvRoute],
  ["<GeneralProfileClaims", cvRoute],
] as const) {
  const at = src.indexOf(name);
  // What stands IMMEDIATELY before the mount. A conditional that wraps it
  // ends there -- `cond && <X`, `cond && (\n<X`, `cond ? <X` -- whatever the
  // condition itself looks like. The first draft matched on the condition's
  // spelling and let `missing.length > 0 && <X />` straight through; the
  // negative control caught it.
  const before = at < 0 ? "" : src.slice(Math.max(0, at - 40), at);
  const gated = /(&&|\?|:)\s*\(?\s*$/.test(before);
  ck(
    `2.1 ${name} is mounted unconditionally`,
    at >= 0 && !gated,
    at < 0 ? "not mounted at all" : "the mount sits behind a completeness condition",
  );
}
ck(
  "2.2 only the shortcuts depend on completeness",
  /missing\.length > 0 &&/.test(route) && /completedSections\.includes\(section\)/.test(route),
  "the missing-section shortcuts are no longer derived from the completeness model",
);

console.log("\n3 · one source of truth for the destination");

ck(
  "3.1 both routes derive their targets from the shared contract",
  /sectionLinkTarget\(section\)/.test(route) && /sectionLinkTarget\(/.test(cvRoute),
  "expected sectionLinkTarget(...) in the Profile and the CV route",
);
ck(
  "3.1b the shortcut carries a stable hook naming its section",
  profileLink.length > 0,
  "expected data-section-link={section} on the shortcut link",
);
ck(
  "3.2 the Profile's shortcut link is built from that target, part by part",
  /to=\{target\.to\}/.test(profileLink) &&
    /search=\{target\.search\}/.test(profileLink) &&
    /hash=\{target\.hash\}/.test(profileLink),
  "expected to / search / hash on the shortcut's own link",
);
ck(
  "3.2b it offers only what the Profile owns",
  /SECTION_DESTINATIONS\[section\]\.owner === "profile"/.test(route),
  "a missing education is the CV's to ask for, not the Profile's",
);

// A hand-written anchor beside the link is the second source of truth this
// is here to prevent -- in either route.
for (const section of sections) {
  const { href } = SECTION_DESTINATIONS[section];
  const hash = href.includes("#") ? href.split("#")[1]! : null;
  if (!hash) continue;
  for (const [name, src] of [
    ["the Profile route", route],
    ["the CV route", cvRoute],
  ] as const) {
    ck(
      `3.3 ${name} does not re-spell #${hash}`,
      !src.includes(`"${hash}"`) && !src.includes(`#${hash}`),
      `${hash} is written literally in the route as well as in the contract`,
    );
  }
}

console.log("\n4 · every destination anchor is rendered exactly once, with an offset");

const anchorsOf = (owner: SectionOwner) => [
  ...new Set(
    ownedBy(owner)
      .map((s) => SECTION_DESTINATIONS[s].href)
      .filter((h) => h.includes("#"))
      .map((h) => h.split("#")[1]!),
  ),
];

ck(
  "4.0 the anchor sweep actually examined something",
  anchorsOf("profile").length >= 3 && anchorsOf("cv").length >= 4,
  `profile ${anchorsOf("profile").length}, cv ${anchorsOf("cv").length}`,
);

// An anchor reaches the DOM three ways on this surface, and a guard that knew
// only the first reported two live anchors as dead and one offset as missing:
//
//   * literally, on a native element:      <div id="profile-work-country" …>
//   * literally, on a shell component:     <SectionShell id="cv-education" …>
//   * through a table of names:            <SectionShell id={section.anchor} …>
//
// All three are real renders. The offset then has to be read where it is
// actually applied: on the tag itself for a native element, and inside the
// component for a shell, which is the whole point of having a shell.
function openingTagAround(src: string, at: number): string {
  const open = src.lastIndexOf("<", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open, at + 400);
}

const tagNameOf = (tag: string) => /^<([A-Za-z][A-Za-z0-9.]*)/.exec(tag)?.[1] ?? "";

/** The opening tag a local component puts at its own root. */
function componentRootTag(src: string, name: string): string | null {
  const decl = src.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (decl < 0) return null;
  const ret = src.indexOf("return (", decl);
  if (ret < 0) return null;
  const firstTag = src.indexOf("<", ret);
  if (firstTag < 0) return null;
  return openingTagAround(src, firstTag + 1);
}

interface AnchorHit {
  readonly anchor: string;
  readonly file: string;
  readonly tag: string;
  readonly src: string;
}

function renderedAnchors(file: string, src: string): AnchorHit[] {
  const out: AnchorHit[] = [];

  for (const m of src.matchAll(/id=\{?["`]([A-Za-z0-9_-]+)["`]\}?/g)) {
    out.push({ anchor: m[1]!, file, tag: openingTagAround(src, m.index!), src });
  }

  // `anchor: "cv-skills"` in a table, rendered as `id={section.anchor}`.
  const declared = [...src.matchAll(/\banchor:\s*"([A-Za-z0-9_-]+)"/g)].map((m) => m[1]!);
  if (declared.length > 0) {
    for (const m of src.matchAll(/id=\{[^"`{][^}]*\}/g)) {
      const tag = openingTagAround(src, m.index!);
      // Only the CALL SITE counts. A shell's own `id={id}` is the same render
      // seen from the inside, and counting both reported every table-driven
      // anchor as rendered twice.
      if (!/^[A-Z]/.test(tagNameOf(tag))) continue;
      // Resolve the particular mapped table. Several independent section
      // lists now use section.anchor; counting every declared anchor at
      // every map site invents duplicate DOM ids.
      const prefix = src.slice(0, m.index);
      const mapNames = [...prefix.matchAll(/([A-Z_]+)\.map\(/g)];
      const name = mapNames.at(-1)?.[1];
      const declaration = name ? src.slice(src.indexOf("const " + name)) : "";
      const table = declaration.slice(0, declaration.indexOf("]"));
      const local = [...table.matchAll(/\banchor:\s*"([A-Za-z0-9_-]+)"/g)].map((hit) => hit[1]!);
      for (const anchor of local.length ? local : declared) out.push({ anchor, file, tag, src });
    }
  }

  return out;
}

/** Does arriving at this anchor clear the fixed header? */
function hasScrollOffset(hit: AnchorHit): boolean {
  if (/scroll-mt-\d+/.test(hit.tag)) return true;
  const name = tagNameOf(hit.tag);
  // A shell component: the offset belongs on the element it renders, not on
  // the call site. Only a local component can be resolved here; anything else
  // is reported rather than assumed.
  if (!/^[A-Z]/.test(name)) return false;
  const root = componentRootTag(hit.src, name);
  return root !== null && /scroll-mt-\d+/.test(root);
}

for (const owner of ["profile", "cv"] as const) {
  // The OWNER'S surface only. Sweeping both together would let a
  // profile-owned anchor that was rendered on the CV page pass.
  const rendered = (SURFACES[owner] ?? []).flatMap((file) => renderedAnchors(file, read(file)));
  for (const anchor of anchorsOf(owner)) {
    const hits = rendered.filter((r) => r.anchor === anchor);

    ck(
      `4.1 #${anchor} is rendered exactly once on the ${owner} surface`,
      hits.length === 1,
      hits.length === 0
        ? "no rendered id= anywhere on the owning surface — the link is dead"
        : `rendered ${hits.length} times: ${hits.map((h) => h.file).join(", ")}`,
    );

    if (hits.length !== 1) continue;

    ck(
      `4.2 #${anchor} carries a scroll offset where it is rendered`,
      hasScrollOffset(hits[0]!),
      `no scroll-mt-* on the tag, nor on the component it renders through, in ${hits[0]!.file}`,
    );
  }
}

console.log("\n5 · the derived target is the canonical destination");

for (const section of sections) {
  const { href } = SECTION_DESTINATIONS[section];
  const t = sectionLinkTarget(section);

  // Rebuild the href from the parts. If the parser dropped a query or a
  // fragment, or invented one, the round trip stops matching.
  const rebuilt =
    t.to +
    (t.search && Object.keys(t.search).length
      ? `?${new URLSearchParams(t.search as Record<string, string>).toString()}`
      : "") +
    (t.hash ? `#${t.hash}` : "");

  ck(
    `5.1 ${section} round-trips to its canonical href`,
    rebuilt === href,
    `${rebuilt} !== ${href}`,
  );
  ck(
    `5.2 ${section} yields a path, never a fragment or a query in \`to\``,
    t.to.startsWith("/") && !t.to.includes("#") && !t.to.includes("?"),
    `to = ${t.to}`,
  );
}

console.log("\n6 · the shortcut is large enough and focusable");

ck(
  "6.1 the shortcut link declares a 44px minimum",
  /min-h-\[44px\]/.test(profileLink),
  "no min-h-[44px] on the shortcut link",
);

ck(
  "6.2 keyboard focus is visible on the shortcut link",
  // The ring itself, not merely something named ring-*: an offset alone
  // draws nothing, and matching it kept this assertion alive while the
  // visible ring had been deleted.
  /focus-visible:ring-2/.test(profileLink) && /focus-visible:ring-ring/.test(profileLink),
  "the shortcut link has no visible focus ring",
);

console.log("\n7 · both languages come from authored pairs");

ck(
  "7.1 the shortcut is named from a bilingual pair, per section",
  /L\(ADD_LABEL\[section\]!?, l\)/.test(route) && /const ADD_LABEL:/.test(route),
  "expected the link text to be L(ADD_LABEL[section], l)",
);

ck(
  "7.2 no new hardcoded single-language label was introduced",
  !/aria-label="[A-Za-zÅÄÖåäö ]+"/.test(route),
  "a literal aria-label string appears in the route",
);

if (failures > 0) {
  console.error(`\nprofile-section-navigation: ${failures} assertion(s) failed.`);
  process.exit(1);
}

console.log(
  "\nprofile-section-navigation:check OK " +
    "(the Profile and the CV each own and mount their own editors, nothing is a " +
    "dead 'edited here' label, completion never gates an editor, every destination " +
    "is derived from SECTION_DESTINATIONS and never re-spelled, every anchor is " +
    "rendered exactly once on its owner's surface with a scroll offset, the derived " +
    "target round-trips, and the shortcut is 44px, focus-visible and bilingual)",
);
