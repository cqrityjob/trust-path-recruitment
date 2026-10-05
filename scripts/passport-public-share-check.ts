// Security Passport — the public social share, asserted without a browser.
//
// Run: bun run passport-public-share:check
//
// The pure half of the personal, public share: how the application reads
// `sp_get_social_share`, what link preview it writes for a crawler, the
// "select all" rule, and the shape of the page and the server calls. The
// database half is supabase/tests/sp_passport_number_and_social_share_test.sql
// and the two-process races in scripts/db-test.sh; the browser half is
// e2e/passport-social-share.spec.ts.

import { readFileSync } from "node:fs";
import {
  FOUNDER_DESIGNATION,
  isWellFormedPublicId,
  linkPreviewFor,
  parsePublicSocialShare,
  toRecipientPayload,
  type PublicSocialShare,
} from "../src/lib/security-passport/social-share-public";
import { nextOnClick, selectState, withAll } from "../src/lib/security-passport/merit-selection";
import { socialShareErrorCode } from "../src/lib/security-passport/social-share-public";
import { buildRecipientPresentation } from "../src/lib/security-passport/recipient-presentation";

let assertions = 0;
const errors: string[] = [];
function expect(ok: boolean, message: string): void {
  assertions += 1;
  if (!ok) errors.push(message);
}

const AT = "2026-10-05T08:00:00.000Z";
const ID = "AbCdEfGhIjKlMnOpQrStUvWx";

const raw = (over: Record<string, unknown> = {}) => ({
  status: "active",
  locale: "sv",
  snapshot_at: "2026-10-01T10:00:00Z",
  expires_at: "2026-11-01T10:00:00Z",
  holder: "Mostafa Alshawi",
  holder_label: "full_name",
  jurisdiction: "SE",
  passport_number: 1,
  designation: "founder",
  claims: [
    {
      key: "c1",
      type: "certification",
      title: "Certified Protection Professional (CPP)",
      credential_code: "INTL_ASIS_CPP",
      jurisdiction: null,
      sub_jurisdiction: null,
      scope_code: "global_professional",
      no_expiry: false,
      valid_until: "2030-01-01",
      assertion: "self_declared",
      lifecycle: "active",
      verified_at: null,
      verifier_organisation: null,
      verification_method: null,
    },
    {
      key: "c2",
      type: "certification",
      title: "Physical Security Professional (PSP)",
      credential_code: "INTL_ASIS_PSP",
      jurisdiction: null,
      sub_jurisdiction: null,
      scope_code: "global_professional",
      no_expiry: false,
      valid_until: "2020-01-01",
      assertion: "documented",
      lifecycle: "active",
      verified_at: null,
      verifier_organisation: "CQrityjob",
      verification_method: "document_review",
    },
  ],
  ...over,
});

// ── 1: the public id ────────────────────────────────────────────────────
expect(isWellFormedPublicId(ID), "a 24-character URL-safe id is well formed");
for (const bad of ["", "short", ID + "x", ID.slice(1), "a".repeat(23) + "!", null, 7, undefined]) {
  expect(!isWellFormedPublicId(bad), `${JSON.stringify(bad)} is refused before any query`);
}

// ── 2: parsing is an allow-list that fails closed ────────────────────────
for (const bad of [
  null,
  undefined,
  3,
  "x",
  [],
  {},
  { status: "unavailable" },
  { status: "active" },
]) {
  expect(
    parsePublicSocialShare(bad, AT).status === "unavailable",
    `${JSON.stringify(bad)} reads as unavailable, never as a half-drawn page`,
  );
}
const ok = parsePublicSocialShare(raw(), AT);
expect(ok.status === "active", "a well-formed payload is active");
if (ok.status === "active") {
  expect(ok.checkedAt === AT, "the checked time is the SERVER's stamp, never the reader's clock");
  expect(
    ok.passportNumber === 1 && ok.designation === "founder",
    "the number and designation read through",
  );
  expect(ok.claims.length === 2, "both approved credentials read through");
  const payload = JSON.stringify(ok);
  for (const secret of [
    "email",
    "user_id",
    "holder_user_id",
    "token",
    'issuer":"',
    "authorisation_scope",
  ]) {
    expect(!payload.includes(secret), `nothing like "${secret}" reaches the page model`);
  }
  expect(
    ok.claims.every((c) => c.issuer === null && c.issued_on === null),
    "no issuer and no issue date, ever",
  );
}
{
  const extra = parsePublicSocialShare(
    raw({
      email: "a@b.c",
      user_id: "u",
      extra: { deep: 1 },
      claims: [{ ...raw().claims[0], issuer: "ACME", authorisation_scope: "Site X", id: "uuid" }],
    }),
    AT,
  );
  const text = JSON.stringify(extra);
  expect(
    extra.status === "active" && !/a@b\.c|ACME|Site X|uuid|"extra"/.test(text),
    "fields the database might one day add are dropped, not rendered",
  );
}
{
  const anon = parsePublicSocialShare(raw({ holder: "Someone", holder_label: "anonymous" }), AT);
  expect(
    anon.status === "active" && anon.holder === null,
    "an anonymous label never carries a name, whatever the payload says",
  );
  const initials = parsePublicSocialShare(raw({ holder: "M. A.", holder_label: "initials" }), AT);
  expect(
    initials.status === "active" && initials.holderLabel === "initials",
    "initials stay initials",
  );
  const bogusNumber = parsePublicSocialShare(raw({ passport_number: -4 }), AT);
  expect(
    bogusNumber.status === "active" && bogusNumber.passportNumber === null,
    "an invalid number is no number",
  );
  const bogusDesignation = parsePublicSocialShare(raw({ designation: "ambassador" }), AT);
  expect(
    bogusDesignation.status === "active" && bogusDesignation.designation === null,
    "only 'founder' is a designation",
  );
  const noTitle = parsePublicSocialShare(
    raw({ claims: [{ key: "c1", assertion: "self_declared", lifecycle: "active" }] }),
    AT,
  );
  expect(
    noTitle.status === "active" && noTitle.claims.length === 0,
    "a claim without a title is skipped, not guessed",
  );
}

// ── 3: the shared renderer reads it, with the same words ─────────────────
if (ok.status === "active") {
  const payload = toRecipientPayload(ok);
  const presentation = buildRecipientPresentation(payload, "2026-10-05");
  expect(presentation.credentials.length === 2, "the shared presentation reads both credentials");
  const cpp = presentation.credentials.find((c) => c.code === "INTL_ASIS_CPP");
  const psp = presentation.credentials.find((c) => c.code === "INTL_ASIS_PSP");
  expect(cpp?.definitionScope === "global", "a global definition keeps its scope");
  expect(cpp?.presentation === "self_declared", "an own entry stays 'own entry', never raised");
  expect(psp?.lapsed === true, "a credential past its date is shown as lapsed, not as current");
  expect(presentation.containsExpired === true, "and the page says that something has expired");
  expect(
    presentation.checkedAt === AT && payload.package === "selected_merits",
    "the page carries the server's check time and is a chosen-merits share",
  );
  expect(presentation.holderLabel === "Mostafa Alshawi", "the holder label is the approved one");
}

// ── 4: the link preview a crawler reads ──────────────────────────────────
{
  const preview = linkPreviewFor(ok);
  expect(
    preview.title === "Mostafa Alshawi · Security Passport #1",
    "the title names the person and the number",
  );
  expect(
    preview.description.includes(FOUNDER_DESIGNATION.sv) &&
      preview.description.includes("Certified Protection Professional (CPP)"),
    "the description names the designation and the approved credentials",
  );
  expect(
    !/verifierad|verified/i.test(preview.description),
    "and claims no standing: standing is on the page, which is read again on every open",
  );
  expect(
    preview.title.length <= 70 && preview.description.length <= 300,
    "both fit a link preview",
  );
  const unavailable: PublicSocialShare = { status: "unavailable" };
  const generic = linkPreviewFor(unavailable);
  expect(
    generic.title === "Security Passport — CQrityjob" && !/Mostafa/.test(JSON.stringify(generic)),
    "an unavailable share previews generically: no name, no credential",
  );
  const many = parsePublicSocialShare(
    raw({
      locale: "en",
      claims: Array.from({ length: 9 }, (_, i) => ({
        ...((raw().claims as never[])[0] as object),
        key: `c${i + 1}`,
        title: `Merit ${i + 1}`,
      })),
    }),
    AT,
  );
  const long = linkPreviewFor(many);
  expect(
    long.description.includes("and 5 more") && !long.description.includes("Merit 5"),
    "nine credentials are summarised in the preview; the page lists all of them",
  );
  const anon = linkPreviewFor(
    parsePublicSocialShare(
      raw({ holder_label: "anonymous", designation: null, passport_number: 12 }),
      AT,
    ),
  );
  expect(anon.title === "Security Passport #12", "an anonymous share previews without a name");
}

// ── 5: select all ────────────────────────────────────────────────────────
{
  const keys = ["a", "b", "c"];
  expect(selectState(keys, new Set()) === "none", "nothing selected");
  expect(selectState(keys, new Set(["a"])) === "some", "some selected is the in-between state");
  expect(selectState(keys, new Set(keys)) === "all", "all selected");
  expect(selectState([], new Set(["a"])) === "none", "an empty group is never 'all'");
  expect(
    selectState(keys, new Set(["a", "z"])) === "some",
    "a key outside the group is not counted",
  );
  expect(
    nextOnClick("none") && nextOnClick("some") && !nextOnClick("all"),
    "a click selects unless everything is already selected",
  );
  const all = withAll(new Set(["x"]), keys, true);
  expect(
    all.has("x") && keys.every((k) => all.has(k)),
    "selecting all adds the group and leaves the rest alone",
  );
  const cleared = withAll(all, keys, false);
  expect(
    cleared.has("x") && !keys.some((k) => cleared.has(k)),
    "clearing a group clears only that group",
  );
  const before = new Set(["a"]);
  withAll(before, keys, true);
  expect(before.size === 1, "the old selection is never mutated");
}

// ── 6: the database's refusals map to a closed set ───────────────────────
{
  const pairs: [string, string][] = [
    ["SP_NOTHING_SELECTED: choose", "nothing_selected"],
    ["SP_MERIT_NOT_SHAREABLE: only", "not_shareable"],
    ["SP_TOO_MANY_SOCIAL_SHARES: revoke", "too_many"],
    ["SP_REQUEST_KEY_CONFLICT: this", "key_conflict"],
    ["SP_NO_PASSPORT", "no_passport"],
    ["something else entirely", "unknown"],
  ];
  for (const [msg, code] of pairs) {
    expect(socialShareErrorCode(msg) === code, `"${msg}" maps to ${code}`);
  }
}

// ── 7: the page, the server calls and the route are shaped as designed ───
{
  const route = readFileSync("src/routes/s.$publicId.tsx", "utf8");
  const fns = readFileSync("src/lib/security-passport/social-share.functions.ts", "utf8");
  const lib = readFileSync("src/lib/security-passport/social-share-public.ts", "utf8");
  expect(
    /loader:\s*async/.test(route) && /head:\s*\(\{ loaderData/.test(route),
    "the tags are written from loader data, so they are in the first response",
  );
  expect(
    !/ssr:\s*false/.test(route),
    "the page is server-rendered: a crawler does not run the application",
  );
  expect(/noindex, nofollow/.test(route), "a personal card is not indexed");
  expect(
    /og-security-passport\.png/.test(route) && /property: "og:image", content: image/.test(route),
    "the preview image is the branded one",
  );
  expect(
    !/image_png|base64|toBlob|FileReader/.test(route + fns + lib),
    "no image is uploaded, stored or served from a client-supplied source",
  );
  expect(
    /serverPublicClient/.test(fns) && !/supabaseAdmin|client\.server/.test(fns),
    "the public read uses the publishable key only: no service role",
  );
  expect(
    /isWellFormedPublicId\(data\.publicId\)/.test(fns),
    "a malformed id is answered without a query",
  );
  expect(
    /\.rpc\("sp_get_social_share", \{\s*_public_id/.test(fns) && !/\.from\(/.test(fns),
    "one function, no table read",
  );
  expect(
    /return \{ status: "error" \}/.test(fns),
    "a failed read is not presented as 'unavailable'",
  );
  expect(
    !/orNull|window\.location/.test(lib),
    "the public address is built on the configured origin, not the browser's",
  );
  expect(
    /publicShareOrigin\(\)\}\/s\//.test(lib),
    "the address is /s/<publicId> on the public origin",
  );
  expect(/data-public-share/.test(route), "the page states which of its states it is in");
}

if (errors.length > 0) {
  console.error(`passport-public-share-check FAILED (${errors.length} of ${assertions}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`passport-public-share-check: ${assertions} assertions passed`);
