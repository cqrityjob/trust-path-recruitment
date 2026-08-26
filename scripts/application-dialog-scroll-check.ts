// Job application dialog — the modal must stay inside the viewport.
//
// ── THE REGRESSION THIS PREVENTS ───────────────────────────────────────
//
// A centred `position: fixed` box with no height limit does not clip when its
// content outgrows the viewport. The -50% translate pushes its top ABOVE the
// viewport and its bottom below it, and because the box is fixed it is not
// reachable by page scroll either — which Radix has locked anyway while a
// dialog is open. Both ends simply become unreachable.
//
// Measured on the live application form at 375x667 before the fix: a 911px
// dialog in a 667px viewport, top at -122, the submit button's bottom edge at
// 764, and `body { overflow: hidden }`. The consent checkbox and "Skicka
// ansökan" could not be reached by any gesture. A candidate could not finish
// an application — the P0 journey blocker this guards.
//
// It is guarded at the source because the failure is a MISSING declaration,
// and the natural way to reintroduce it is for someone to "tidy" an unusual
// looking class list back to the plain shadcn default.
//
// Plain TS run with Bun, matching this repository's scripts/*-check.ts
// convention.

import { readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const dialogPath = "src/components/ui/dialog.tsx";
const applyPath = "src/components/jobs/ApplyInternalDialog.tsx";
const dialog = read(dialogPath);
const apply = read(applyPath);

/** Comments in these files DISCUSS the class names they are about, so a naive
 *  scan counts prose as code. Strip block comments, line comments and JSX
 *  comment braces before counting anything that must be counted exactly. */
function code(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
const applyCode = code(apply);

// ---------------------------------------------------------------------------
// 1. The base primitive carries the constraint
// ---------------------------------------------------------------------------
// Every dialog in the product inherits this. Leaving it to each call site is
// how the bug got in: two dialogs remembered `max-h-[85vh] overflow-y-auto`
// and the application form did not.
const contentClasses =
  code(dialog).match(/DialogPrimitive\.Content[\s\S]*?cn\(([\s\S]*?)className,/)?.[1] ?? "";

expect(
  /max-h-\[calc\(100dvh/.test(contentClasses),
  `${dialogPath}: DialogContent must cap its height against the viewport ` +
    "(max-h-[calc(100dvh-…)]). Without it a tall dialog is clipped at BOTH " +
    "ends and no gesture can reach either.",
);
expect(
  /overflow-y-auto/.test(contentClasses),
  `${dialogPath}: DialogContent must scroll its own content (overflow-y-auto). ` +
    "A height cap without a scroller hides the overflow instead of blocking it.",
);

// dvh, not vh. On mobile Safari/Chrome `100vh` is the LARGEST viewport — the
// one with browser chrome retracted — so a vh-capped dialog still puts its
// footer behind the visible address bar.
expect(
  !/max-h-\[(100vh|calc\(100vh)/.test(contentClasses),
  `${dialogPath}: DialogContent must size against dvh, not vh. 100vh is the ` +
    "chrome-retracted viewport on mobile, so a vh cap hides the footer behind " +
    "the address bar — exactly the control a candidate needs.",
);

// ---------------------------------------------------------------------------
// 2. The application form opts into the stable-footer pattern
// ---------------------------------------------------------------------------
// The longest form in the product. Scrolling the whole box would work, but it
// would scroll the submit button away, and this is the one button a candidate
// must always be able to find.
const applyContent = applyCode.match(/<DialogContent[^>]*>/)?.[0] ?? "";

expect(
  /className="[^"]*\bflex\b[^"]*"/.test(applyContent) &&
    /className="[^"]*flex-col[^"]*"/.test(applyContent),
  `${applyPath}: DialogContent must be a flex column so the field region can ` +
    "scroll independently of the header and the submit footer.",
);
expect(
  /max-h-\[calc\(100dvh/.test(applyContent),
  `${applyPath}: DialogContent must carry its own viewport height cap.`,
);

// The form is the flex child that must shrink. Without min-h-0 its automatic
// minimum size is its CONTENT height, so it refuses to shrink and the
// overflow never engages — the single most common way this fix is silently
// undone.
expect(
  /<form[^>]*className="[^"]*min-h-0[^"]*"/.test(applyCode),
  `${applyPath}: the <form> must carry min-h-0. A flex item's automatic ` +
    "minimum size is its content height, so without it the form refuses to " +
    "shrink and the scroll container never engages.",
);

// ---------------------------------------------------------------------------
// 3. Exactly one scroll region — no nested trap
// ---------------------------------------------------------------------------
// Two scrollers inside one dialog means a thumb can get stuck in the inner
// one while the outer one still has content below.
const scrollers = [...applyCode.matchAll(/overflow-y-auto/g)].length;
expect(
  scrollers === 1,
  `${applyPath}: expected exactly one overflow-y-auto scroll region, found ` +
    `${scrollers}. Nested scrollers trap the gesture in the inner region.`,
);
expect(
  /min-h-0 flex-1 space-y-4 overflow-y-auto/.test(applyCode),
  `${applyPath}: the scrolling field region must be the flex-1 min-h-0 child.`,
);

// ---------------------------------------------------------------------------
// 4. The submit control stays outside the scroll region
// ---------------------------------------------------------------------------
const footerIdx = applyCode.indexOf("<DialogFooter");
const submitIdx = applyCode.indexOf('type="submit"');
expect(
  footerIdx !== -1 && submitIdx > footerIdx,
  `${applyPath}: the submit button must live inside DialogFooter, which sits ` +
    "outside the scroll container so it is reachable at every scroll position.",
);
expect(
  /<DialogFooter className="[^"]*shrink-0[^"]*"/.test(applyCode),
  `${applyPath}: DialogFooter must be shrink-0 so it is never compressed away ` +
    "on a short viewport.",
);

// ---------------------------------------------------------------------------
// 5. Passport sharing stays optional
// ---------------------------------------------------------------------------
// The scroll fix must not be taken as licence to simplify the form by making
// the Passport checkbox non-negotiable. Applying is not consent.
expect(
  /setIncludePassport\(v === true\)/.test(apply),
  `${applyPath}: the Passport checkbox must remain a real, clearable control.`,
);
expect(
  !/disabled=\{[^}]*!includePassport/.test(apply),
  `${applyPath}: submitting must never require including a Passport.`,
);
// Consent to the application and consent to disclose a Passport are two
// decisions and must stay two pieces of state.
expect(
  /const \[consent, setConsent\]/.test(apply) &&
    /const \[includePassport, setIncludePassport\]/.test(apply),
  `${applyPath}: application consent and Passport disclosure must remain ` +
    "separate state — they are conceptually separate decisions.",
);
// The confirmation reports what the SERVER did, never what the form asked for.
expect(
  /setPassportShared\(res\.passportShared\)/.test(apply),
  `${applyPath}: the confirmation must read the server's passportShared, so a ` +
    "candidate with nothing verified is never told a Passport was included.",
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`application-dialog-scroll:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "application-dialog-scroll:check OK " +
    "(DialogContent capped with dvh and scrollable; application form is a flex " +
    "column with min-h-0; exactly one scroll region; submit in a shrink-0 footer " +
    "outside it; Passport sharing optional and separate from application consent)",
);
