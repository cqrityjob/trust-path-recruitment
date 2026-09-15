// /my-career/profile — the section overview is navigation, not a list.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The profile workspace opens with an index of every section, its
// completeness and its owner. It was accurate and inert: the row rendered a
// link only when
//
//     !done && owner !== "profile"
//
// and nine of the ten sections are profile-owned. So the index named where
// to go and then left the reader to scroll a long page of stacked editors
// for it, and a section that was already filled in could not be opened at
// all — which is exactly the moment somebody wants to go and correct it.
//
// Four properties keep that from coming back, and each is one edit away
// from being lost:
//
//   1. A profile-owned row IS the link. Not "has a link somewhere in it":
//      the whole row, so the target is large and the affordance obvious.
//   2. Completion does not gate it. `done` may change how a row READS; it
//      may never decide whether the row can be opened.
//   3. The destination comes from SECTION_DESTINATIONS, through
//      `sectionLinkTarget`. A route or an anchor written again in the route
//      file is a second source of truth, and the two drift the first time a
//      section moves — which is how a recommendation ended up pointing at an
//      editor that had already been relocated.
//   4. Every destination anchor is RENDERED, exactly once, and carries a
//      scroll offset. An anchor that exists twice is ambiguous; one with no
//      offset lands under the fixed header, so the reader arrives at the
//      right section and sees the wrong thing.
//
// Sections 1–3 read the route's source. Section 4 reads the whole profile
// surface — the route plus every component it mounts — because an anchor
// lives in the component that renders it, not where it is linked from.
// Section 5 EXECUTES `sectionLinkTarget` against the real contract rather
// than pattern-matching it, so a parser that silently dropped a query or a
// fragment would fail here rather than in a browser.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SECTION_DESTINATIONS,
  sectionLinkTarget,
} from "../src/lib/professional-identity/profile-destinations";
import type { CompletenessSection } from "../src/lib/professional-identity/completeness";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const ROUTE = "src/routes/_authenticated.my-career.profile.tsx";

/** Every file that renders on /my-career/profile and may hold an anchor. */
const PROFILE_SURFACE = [
  ROUTE,
  "src/components/professional-identity/ProfileBasicsSection.tsx",
  "src/components/professional-identity/EmploymentHistoryEditor.tsx",
  "src/components/professional-identity/GeneralProfileClaims.tsx",
  "src/components/assessment/SecurityCareerProfileCard.tsx",
] as const;

let failures = 0;
function ck(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
}

const routeRaw = read(ROUTE);
// Comments quote the very strings this guard searches for — including the
// old gate it exists to keep out. Strip them before asserting, or the guard
// reports its own explanation as the defect.
const route = routeRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sections = Object.keys(SECTION_DESTINATIONS) as CompletenessSection[];
const profileSections = sections.filter((s) => SECTION_DESTINATIONS[s].owner === "profile");

// The profile-owned branch ONLY. Scoping matters more than it looks: the
// non-profile branch renders a link too, with its own 44px minimum and its
// own hash, so a whole-file search for either is satisfied by the wrong
// branch. Three assertions here were dead exactly that way until the
// controls below caught them.
function profileBranchOf(src: string): string {
  const start = src.indexOf('if (owner === "profile") {');
  if (start < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}
const profileBranch = profileBranchOf(route);

console.log("1 · the overview links every section this page owns");

ck(
  "1.1 there are profile-owned sections to link at all",
  profileSections.length >= 7,
  `found ${profileSections.length}`,
);

// The defect in one line: a link gated on the row not being profile-owned.
ck(
  "1.2 no link in the overview is withheld because the section is profile-owned",
  !/owner\s*!==\s*"profile"/.test(route),
  'the route still gates a link on owner !== "profile"',
);

ck(
  "1.3 a profile-owned row renders the link as the row itself",
  /if\s*\(\s*owner\s*===\s*"profile"\s*\)\s*\{\s*return\s*\(\s*<li[^>]*>\s*<Link/.test(route),
  "expected the profile branch to return a <li> whose only child is the <Link>",
);

ck(
  "1.4 every row carries a stable hook naming its section",
  /data-section-link=\{section\}/.test(profileBranch),
  "expected data-section-link={section} on the profile row link",
);

console.log("\n2 · completion changes how a row reads, never whether it opens");

// `done` may still choose a text colour and the empty-state wording. What it
// must not do is stand between the reader and the editor.

ck(
  "2.1 the profile-owned branch never consults `done`",
  profileBranch.length > 0 && !/\bdone\b/.test(profileBranch),
  "the profile row branch reads `done`, so a completed section can stop being reachable",
);

ck(
  "2.2 `done` is still used, so truthful completeness presentation was not removed",
  /const done = completeness\.completedSections\.includes\(section\)/.test(route) &&
    /done\s*\n?\s*\?/.test(route),
  "completeness is no longer shown at all — the fix must not cost the status",
);

console.log("\n3 · one source of truth for the destination");

ck(
  "3.1 the route derives its targets from the shared contract",
  /sectionLinkTarget\(section\)/.test(route),
  "expected sectionLinkTarget(section)",
);

ck(
  "3.2 the profile row's link is built from that target, part by part",
  /to=\{target\.to\}/.test(profileBranch) &&
    /search=\{target\.search\}/.test(profileBranch) &&
    /hash=\{target\.hash\}/.test(profileBranch),
  "expected to / search / hash on the profile row's own link",
);

// A hand-written anchor or route beside the link is the second source of
// truth this is here to prevent.
for (const section of sections) {
  const { href } = SECTION_DESTINATIONS[section];
  const hash = href.includes("#") ? href.split("#")[1]! : null;
  if (!hash) continue;
  ck(
    `3.3 the route does not re-spell #${hash}`,
    !route.includes(`"${hash}"`) && !route.includes(`#${hash}`),
    `${hash} is written literally in the route as well as in the contract`,
  );
}

console.log("\n4 · every destination anchor is rendered exactly once, with an offset");

const surface = PROFILE_SURFACE.map((f) => ({ file: f, src: read(f) }));

const wantedAnchors = [
  ...new Set(
    profileSections
      .map((s) => SECTION_DESTINATIONS[s].href)
      .filter((h) => h.includes("#"))
      .map((h) => h.split("#")[1]!),
  ),
];

ck(
  "4.0 the anchor sweep actually examined something",
  wantedAnchors.length >= 7,
  `only ${wantedAnchors.length} anchors derived`,
);

// An anchor reaches the DOM three ways on this surface, and a guard that knew
// only the first reported two live anchors as dead and one offset as missing:
//
//   * literally, on a native element:      <div id="profile-work-country" …>
//   * literally, on a shell component:     <SectionShell id="profile-education" …>
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

  // `anchor: "profile-skills"` in a table, rendered as `id={section.anchor}`.
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

const renderedBySurface = surface.flatMap(({ file, src }) => renderedAnchors(file, src));

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

for (const anchor of wantedAnchors) {
  const hits = renderedBySurface.filter((r) => r.anchor === anchor);

  ck(
    `4.1 #${anchor} is rendered exactly once on the profile surface`,
    hits.length === 1,
    hits.length === 0
      ? "no rendered id= anywhere on the surface — the link is dead"
      : `rendered ${hits.length} times: ${hits.map((h) => h.file).join(", ")}`,
  );

  if (hits.length !== 1) continue;

  ck(
    `4.2 #${anchor} carries a scroll offset where it is rendered`,
    hasScrollOffset(hits[0]!),
    `no scroll-mt-* on the tag, nor on the component it renders through, in ${hits[0]!.file}`,
  );
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

console.log("\n6 · the target is large enough and focusable");

ck(
  "6.1 the profile row link declares a 44px minimum",
  /min-h-\[44px\]/.test(profileBranch),
  "no min-h-[44px] on the profile row link",
);

ck(
  "6.2 keyboard focus is visible on the profile row link",
  // The ring itself, not merely something named ring-*: an offset alone
  // draws nothing, and matching it kept this assertion alive while the
  // visible ring had been deleted.
  /focus-visible:ring-2/.test(profileBranch) && /focus-visible:ring-ring/.test(profileBranch),
  "the profile row link has no visible focus ring",
);

console.log("\n7 · both languages come from the existing copy");

ck(
  "7.1 the link is named from the section title, which is bilingual",
  /aria-label=\{L\(SECTION_TITLE\[section\], l\)\}/.test(profileBranch),
  "expected the accessible name to be L(SECTION_TITLE[section], l)",
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
    "(every profile-owned overview row is the link, completion never gates it, " +
    "the destination is derived from SECTION_DESTINATIONS and never re-spelled, " +
    "every anchor is rendered exactly once with a scroll offset, the derived " +
    "target round-trips to its canonical href, and the target is 44px, " +
    "focus-visible and named from bilingual copy)",
);
