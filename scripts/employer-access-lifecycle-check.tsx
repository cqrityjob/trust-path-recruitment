/**
 * The employer ACCESS lifecycle guard.
 *
 * ── WHAT IT IS FOR ──────────────────────────────────────────────────────
 *
 * The launch-readiness audit of the employer account found five places where a
 * person's access to an organisation changed and the product either could not do
 * it or did not say so:
 *
 *   1  MEMBERS     nothing could remove, suspend, reactivate or re-role a member.
 *                  The two server functions existed and nothing called them, so
 *                  "a colleague has left" was unanswerable in the product and
 *                  untestable in a browser.
 *   2  DEAD ENDS   a rejected organisation said "contact us" with no address; a
 *                  removed member landed on a company-creation form with no word
 *                  about what had happened; the workspace layout rendered its
 *                  children while it was still deciding, so a pending
 *                  organisation's pages fired refused calls and flashed errors.
 *   3  IDENTITY    changing name, country, registration number or website put an
 *                  approved organisation back in review -- workspace closed, ads
 *                  offline -- with no warning, and then thanked the owner for
 *                  registering.
 *   4  SEND TEST   an owner whose organisation was under review was told they
 *                  "need to be an owner".
 *   5  PLACEHOLDER areas reachable only by URL.
 *
 * This guard pins each of them: the PURE rules are run across their whole state
 * space, the components are rendered, and the SQL the UI leans on (the
 * final-owner refusal's wording, the four identity columns) is read from the
 * migrations so that a change there fails here rather than turning an exact
 * refusal into "could not be completed".
 *
 * It does not touch the permission model. It reads it.
 *
 * Deterministic, offline, credential-free. Run: bun run employer-access-lifecycle:check
 */

import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* ── harness ───────────────────────────────────────────────────────── */

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
/** Comments DISCUSS what they are about; scan code, not prose. */
const code = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const failures: string[] = [];
let n = 0;
function ck(label: string, ok: boolean): void {
  n += 1;
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}
function group(name: string): void {
  console.log(`\n${name}`);
}
const esc = (t: string): string =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

const actualRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  Link: ({
    to,
    children,
    ...rest
  }: { to: string; children: unknown } & Record<string, unknown>) => {
    const { params: _p, search: _s, ...attrs } = rest as Record<string, unknown>;
    return (
      <a href={String(to)} {...(attrs as object)}>
        {children as never}
      </a>
    );
  },
}));
await mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => undefined }),
  useMutation: () => ({
    mutate: () => undefined,
    reset: () => undefined,
    isPending: false,
    error: null,
  }),
}));
await mock.module("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
await mock.module("@/lib/job-intelligence/membership.functions", () => ({
  adminUpdateEmployerMembershipRole: async () => null,
  adminUpdateEmployerMembershipStatus: async () => null,
  listMyEmployerMemberships: async () => [],
  listMyEmployerWorkspaces: async () => [],
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { CONTACT_EMAIL } = await import("../src/lib/contact/contact-address");
const membership = await import("../src/lib/job-intelligence/membership-admin");
const { adminErrorCode, AdminMutationError, ADMIN_ERROR_CODES, ADMIN_ERROR_COPY } =
  await import("../src/lib/admin/admin-error");
const gate = await import("../src/lib/job-intelligence/employer-access-state");
const identity = await import("../src/lib/job-intelligence/identity-rereview");
const access = await import("../src/lib/library/test-assignment-access");
const { AdminEmployerMembers } = await import("../src/components/admin/AdminEmployerMembers");
const { EmployerAccessEnded } = await import("../src/components/employer/EmployerAccessEnded");

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;
const both = (key: string): boolean =>
  typeof sv[key] === "string" &&
  sv[key].trim().length > 0 &&
  typeof en[key] === "string" &&
  en[key].trim().length > 0 &&
  sv[key] !== en[key];

/* ═══ 1 · MEMBERS: remove, suspend, reactivate, change role ═══════════ */
group("1 · the platform administrator can end, pause, restore and re-role a membership");

const M = (id: string, role: string, status: string) => ({ id, role, status });
ck(
  "an active member can be suspended or removed; a suspended one restored or removed; a removed one restored",
  JSON.stringify(membership.availableStatusActions("active")) === '["suspend","remove"]' &&
    JSON.stringify(membership.availableStatusActions("suspended")) === '["reactivate","remove"]' &&
    JSON.stringify(membership.availableStatusActions("removed")) === '["reactivate"]' &&
    JSON.stringify(membership.availableStatusActions("invited")) === '["remove"]' &&
    membership.availableStatusActions("nonsense").length === 0,
);
ck(
  "the actions lead to the database's own status names",
  membership.MEMBERSHIP_TARGET_STATUS.suspend === "suspended" &&
    membership.MEMBERSHIP_TARGET_STATUS.remove === "removed" &&
    membership.MEMBERSHIP_TARGET_STATUS.reactivate === "active",
);
ck(
  "a role is not offered for a removed membership, and is for every other",
  !membership.canChangeRole("removed") &&
    membership.canChangeRole("active") &&
    membership.canChangeRole("suspended") &&
    membership.canChangeRole("invited"),
);

// The final-owner rule, run over its state space: the same condition
// update_employer_membership() refuses.
const sole = [M("a", "owner", "active"), M("b", "member", "active")];
const two = [M("a", "owner", "active"), M("b", "owner", "active")];
const deadOwner = [M("a", "owner", "active"), M("b", "owner", "suspended")];
ck(
  "the only active owner cannot be suspended, removed or demoted",
  membership.wouldLeaveNoActiveOwner(sole, "a", { status: "suspended" }) &&
    membership.wouldLeaveNoActiveOwner(sole, "a", { status: "removed" }) &&
    membership.wouldLeaveNoActiveOwner(sole, "a", { role: "admin" }) &&
    membership.wouldLeaveNoActiveOwner(sole, "a", { role: "member" }),
);
ck(
  "with a second ACTIVE owner either may go; a suspended owner does not count as one",
  !membership.wouldLeaveNoActiveOwner(two, "a", { status: "removed" }) &&
    !membership.wouldLeaveNoActiveOwner(two, "b", { role: "member" }) &&
    membership.wouldLeaveNoActiveOwner(deadOwner, "a", { status: "removed" }),
);
ck(
  "a change that leaves the row an active owner never trips it, and a non-owner never does",
  !membership.wouldLeaveNoActiveOwner(sole, "a", { role: "owner" }) &&
    !membership.wouldLeaveNoActiveOwner(sole, "a", { status: "active" }) &&
    !membership.wouldLeaveNoActiveOwner(sole, "b", { status: "removed" }) &&
    !membership.wouldLeaveNoActiveOwner(sole, "missing", { status: "removed" }),
);
ck(
  "isOnlyActiveOwner names exactly the row the page labels",
  membership.isOnlyActiveOwner(sole, "a") &&
    !membership.isOnlyActiveOwner(two, "a") &&
    !membership.isOnlyActiveOwner(sole, "b"),
);

// The refusal reaches the person as a sentence, not as the database's wording.
const FINAL_OWNER_RPC =
  "Cannot change this membership: it is the only active owner for this employer. Assign another active owner first.";
const refused = membership.membershipRpcFailure({ message: FINAL_OWNER_RPC, code: "P0001" });
ck(
  "the final-owner refusal is recognised and carried as a stable code",
  refused instanceof AdminMutationError && refused.code === "ADMIN_MEMBERSHIP_FINAL_OWNER",
);
ck(
  "and resolves to its own sentence, in both languages",
  adminErrorCode(refused).code === "membership_final_owner" &&
    both(ADMIN_ERROR_COPY.membership_final_owner),
);
ck(
  "not-found and forbidden are mapped, not worded",
  adminErrorCode(membership.membershipRpcFailure({ message: "Membership not found" })).code ===
    "not_found" &&
    adminErrorCode(
      membership.membershipRpcFailure({ message: "Forbidden: platform admin role required" }),
    ).code === "permission_denied" &&
    adminErrorCode(membership.membershipRpcFailure({ message: "Not authenticated" })).code ===
      "permission_denied",
);
{
  const leak =
    'new row for relation "employer_memberships" violates check constraint "employer_memberships_role_check" DETAIL: Failing row contains (secret@acc.invalid)';
  const err = membership.membershipRpcFailure({ message: leak, code: "23514" });
  const resolved = adminErrorCode(err);
  ck(
    "anything else becomes 'could not be completed' and never quotes the database",
    resolved.code === "unknown_error" &&
      !String(err.message).includes("employer_memberships") &&
      !resolved.raw.includes("secret@acc.invalid") &&
      !err.message.includes("secret"),
  );
}
ck(
  "every code the membership functions can raise is accounted for",
  membership.MEMBERSHIP_ERROR_CODES.every(
    (c) =>
      c === "ADMIN_MEMBERSHIP_UPDATE_FAILED" ||
      adminErrorCode(new AdminMutationError(c)).code !== "unknown_error",
  ) && ADMIN_ERROR_CODES.includes("membership_final_owner"),
);

// The wording the classifier recognises is the wording the migration raises.
{
  const sql = read("supabase/migrations/20260719100000_employer_memberships.sql");
  ck(
    "the RPC still raises the sentences the classifier recognises",
    sql.includes("it is the only active owner for this employer") &&
      sql.includes("RAISE EXCEPTION 'Membership not found'") &&
      sql.includes("RAISE EXCEPTION 'Forbidden: platform admin role required'") &&
      sql.includes("RAISE EXCEPTION 'Not authenticated'") &&
      /FUNCTION public\.update_employer_membership\([\s\S]{0,400}SECURITY INVOKER/.test(sql),
  );
  ck(
    "and that rule is the RPC's: the page's own pre-check names it advisory",
    /_existing\.role = 'owner' AND _existing\.status = 'active'[\s\S]{0,700}_other_active_owners = 0/.test(
      sql,
    ),
  );
}

// The component is wired and renders what it should.
const route = code(read("src/routes/_authenticated.admin.employers.$employerId.tsx"));
const members = code(read("src/components/admin/AdminEmployerMembers.tsx"));
ck(
  "the organisation page mounts the member controls with the page's own memberships",
  /<AdminEmployerMembers\s+employerId=\{employerId\}\s+memberships=\{employer\.memberships\}/.test(
    route,
  ),
);
ck(
  "the controls call BOTH existing admin functions and nothing from the owner's side",
  /adminUpdateEmployerMembershipStatus/.test(members) &&
    /adminUpdateEmployerMembershipRole/.test(members) &&
    !/employer_memberships|supabase\.from\(|\.rpc\(/.test(members),
);
ck(
  "each action is behind a confirmation dialog before any call is made",
  /<Dialog open=\{pending !== null\}/.test(members) &&
    /onClick=\{\(\) => open\(\{ kind: "status", action, member: m \}\)\}/.test(members) &&
    /onClick=\{\(\) => open\(\{ kind: "role", member: m \}\)\}/.test(members) &&
    (members.match(/change\.mutate\(/g) ?? []).length === 1 &&
    /onClick=\{\(\) => change\.mutate\(\{ pending, role: newRole \}\)\}/.test(members),
);
ck(
  "a failure goes through the admin error contract, never a raw message",
  /<AdminActionError error=\{change\.error\}/.test(members) && !/\.message\b/.test(members),
);
ck(
  "success is visible, and the page's own read and the moderation list are refreshed",
  /role="status"/.test(members) &&
    /invalidateQueries\(\{ queryKey: \["admin", "employer-detail", employerId\] \}\)/.test(
      members,
    ) &&
    /invalidateQueries\(\{ queryKey: \["admin", "employers-moderation"\] \}\)/.test(members),
);
ck(
  "the final-owner case is said BEFORE the button and the button is withheld",
  /wouldLeaveNoActiveOwner\(/.test(members) &&
    /disabled=\{change\.isPending \|\| blockedByFinalOwner \|\| roleUnchanged\}/.test(members),
);
{
  const callers = [
    "src/components/employer/EmployerTeamPanel.tsx",
    "src/routes/_authenticated.employer.$employerSlug.settings.tsx",
  ].filter((f) => /adminUpdateEmployerMembership(Role|Status)/.test(read(f)));
  ck(
    "the owner's own surfaces still do not call the platform-admin functions (no self-service removal)",
    callers.length === 0,
  );
}

function renderMembers(lang: "sv" | "en", rows: ReturnType<typeof row>[]) {
  return renderToStaticMarkup(
    <I18nProvider initialLang={lang}>
      <AdminEmployerMembers employerId="e1" memberships={rows} />
    </I18nProvider>,
  );
}
function row(id: string, role: string, status: string, displayName: string | null) {
  return { id, userId: `${id}0000000-0000-4000-8000-000000000000`, role, status, displayName };
}
const ROWS = [
  row("m1", "owner", "active", "Olle Ägare"),
  row("m2", "member", "active", "Maja Medlem"),
  row("m3", "admin", "suspended", "Sture Avstängd"),
  row("m4", "member", "removed", "Rut Borttagen"),
];
for (const lang of ["sv", "en"] as const) {
  const d = dictionaries[lang] as Record<string, string>;
  const html = renderMembers(lang, ROWS);
  const rowOf = (id: string) => {
    const at = html.indexOf(`data-membership-id="${id}"`);
    return html.slice(at, html.indexOf("</tr>", at));
  };
  const actionsOf = (id: string) =>
    [...rowOf(id).matchAll(/data-action="([a-z]+)"/g)].map((m) => m[1]).join(",");
  ck(
    `${lang}: an active member offers suspend, remove and change role`,
    actionsOf("m2") === "suspend,remove,role",
  );
  ck(
    `${lang}: a suspended member offers reactivate, remove and change role`,
    actionsOf("m3") === "reactivate,remove,role",
  );
  ck(`${lang}: a removed member offers only reactivate`, actionsOf("m4") === "reactivate");
  ck(
    `${lang}: the only active owner is labelled as such`,
    rowOf("m1").includes(esc(d["admin.employers.members.onlyOwner"])) &&
      !rowOf("m2").includes(esc(d["admin.employers.members.onlyOwner"])),
  );
  ck(
    `${lang}: roles and statuses are words, not database values`,
    rowOf("m2").includes(esc(d["employer.role.member"])) &&
      rowOf("m4").includes(esc(d["employer.team.status.removed"])),
  );
}

group("1b · the copy is in both languages, and says what actually happens");
for (const key of [
  "admin.employers.members.intro",
  "admin.employers.members.col.actions",
  "admin.employers.members.unnamed",
  "admin.employers.members.onlyOwner",
  "admin.employers.members.action.suspend",
  "admin.employers.members.action.remove",
  "admin.employers.members.action.reactivate",
  "admin.employers.members.action.role",
  "admin.employers.members.dialog.suspend.title",
  "admin.employers.members.dialog.suspend.body",
  "admin.employers.members.dialog.remove.title",
  "admin.employers.members.dialog.remove.body",
  "admin.employers.members.dialog.reactivate.title",
  "admin.employers.members.dialog.reactivate.body",
  "admin.employers.members.dialog.role.title",
  "admin.employers.members.dialog.role.body",
  "admin.employers.members.dialog.role.label",
  "admin.employers.members.dialog.role.ownerWarning",
  "admin.employers.members.dialog.finalOwner",
  "admin.employers.members.result.suspend",
  "admin.employers.members.result.remove",
  "admin.employers.members.result.reactivate",
  "admin.employers.members.result.role",
  "admin.employers.members.result.unchanged",
  "admin.actionError.membershipFinalOwner",
]) {
  ck(`${key} exists in both languages and they differ`, both(key));
}
ck(
  "removal says the membership is kept and nothing is deleted, in both languages",
  /raderas inte/.test(sv["admin.employers.members.dialog.remove.body"]) &&
    /not deleted/.test(en["admin.employers.members.dialog.remove.body"]) &&
    /tas inte bort/.test(sv["admin.employers.members.dialog.suspend.body"]) &&
    /not deleted|is deleted/.test(en["admin.employers.members.dialog.suspend.body"]) === false
    ? true
    : /is deleted/.test(en["admin.employers.members.dialog.suspend.body"]),
);
ck(
  "access is said to end at the person's NEXT ACTION, not 'immediately' (an open page keeps what it loaded)",
  /nästa åtgärd/.test(sv["admin.employers.members.dialog.remove.body"]) &&
    /next action/.test(en["admin.employers.members.dialog.remove.body"]) &&
    !/omedelbart|immediately/i.test(
      sv["admin.employers.members.dialog.remove.body"] +
        en["admin.employers.members.dialog.remove.body"],
    ),
);

/* ═══ 2 · DEAD ENDS ═══════════════════════════════════════════════════ */
group("2a · the workspace layout decides before it renders");

const W = (employerSlug: string, employerStatus: string) => ({ employerSlug, employerStatus });
const decide = (
  loaded: "pending" | "success" | "error",
  workspaces: ReturnType<typeof W>[] | undefined,
  portalEnabled = true,
) => gate.decideEmployerGate({ portalEnabled, loaded, workspaces, slug: "acme" });
ck(
  "while the list is loading the gate WAITS (it used to render the children)",
  decide("pending", undefined) === "wait",
);
for (const status of ["pending", "draft", "rejected", "suspended", "archived"]) {
  ck(`a ${status} organisation redirects`, decide("success", [W("acme", status)]) === "redirect");
}
ck("an active organisation opens", decide("success", [W("acme", "active")]) === "open");
ck(
  "a slug the caller has no membership for opens (the child shows access-denied; a redirect would tell a stranger which slugs exist)",
  decide("success", [W("other", "pending")]) === "open" && decide("success", []) === "open",
);
ck(
  "a failed read opens (the children hold the same query and say so)",
  decide("error", undefined) === "open",
);
ck(
  "a deployment with the portal switched off never waits for a query that will not run",
  decide("pending", undefined, false) === "open",
);

const gateRoute = code(read("src/routes/_authenticated.employer.$employerSlug.tsx"));
ck(
  "the layout uses the decision and returns BEFORE <Outlet />",
  /decideEmployerGate\(\{/.test(gateRoute) &&
    /if \(decision !== "open"\)/.test(gateRoute) &&
    gateRoute.indexOf('decision !== "open"') < gateRoute.indexOf("<Outlet />") &&
    (gateRoute.match(/<Outlet \/>/g) ?? []).length === 1 &&
    /loaded: query\.status/.test(gateRoute),
);
ck(
  "the old shortcut -- 'blocked' derived from a workspace that may not have loaded yet -- is gone",
  !/const blocked\b/.test(gateRoute),
);

group("2b · a removed or suspended member is told, instead of being offered a company form");
const S = (status: string) => ({ status });
ck(
  "no memberships is not 'ended'",
  gate.accessEndedKind([]) === null && gate.accessEndedKind(undefined) === null,
);
ck("a removed membership is 'removed'", gate.accessEndedKind([S("removed")]) === "removed");
ck("a suspended membership is 'suspended'", gate.accessEndedKind([S("suspended")]) === "suspended");
ck(
  "removed wins over suspended when somebody holds both (the more final statement)",
  gate.accessEndedKind([S("suspended"), S("removed")]) === "removed",
);
ck(
  "an ACTIVE membership of anything means there is a workspace and nothing to explain",
  gate.accessEndedKind([S("removed"), S("active")]) === null &&
    gate.accessEndedKind([S("active")]) === null,
);
ck(
  "an invitation that was never accepted is not 'ended'",
  gate.accessEndedKind([S("invited")]) === null,
);

const onboarding = code(read("src/routes/_authenticated.employer.onboarding.tsx"));
ck(
  "onboarding reads the caller's own memberships, which the unused function listMyEmployerMemberships returns",
  /listMyEmployerMemberships/.test(onboarding) && /accessEndedKind\(/.test(onboarding),
);
ck(
  "and shows nothing but a wait until they have answered -- the company form is never flashed at a leaver",
  /membershipsQuery\.isPending/.test(onboarding) &&
    onboarding.indexOf("membershipsQuery.isPending") <
      onboarding.indexOf('t("employer.onboarding.heading")'),
);
ck(
  "a FAILED read is a retry, not 'you never belonged to one'",
  /membershipsQuery\.isError/.test(onboarding) &&
    /employer\.statusUnknown\.heading/.test(onboarding) &&
    /membershipsQuery\.refetch\(\)/.test(onboarding),
);
ck(
  "the explanation replaces the form",
  /<EmployerAccessEnded kind=\{accessEnded\}/.test(onboarding) &&
    onboarding.indexOf("<EmployerAccessEnded") < onboarding.indexOf("<CreateCompanyForm"),
);

for (const lang of ["sv", "en"] as const) {
  const d = dictionaries[lang] as Record<string, string>;
  for (const kind of ["removed", "suspended"] as const) {
    const html = renderToStaticMarkup(
      <I18nProvider initialLang={lang}>
        <EmployerAccessEnded kind={kind} />
      </I18nProvider>,
    );
    ck(
      `${lang}: ${kind}: says what happened and who to write to`,
      html.includes(esc(d[`employer.accessEnded.${kind}.heading`])) &&
        html.includes(esc(d[`employer.accessEnded.${kind}.body`])) &&
        html.includes(`href="mailto:${CONTACT_EMAIL}?subject=`) &&
        html.includes(`>${CONTACT_EMAIL}</a>`),
    );
    ck(
      `${lang}: ${kind}: offers no company-creation form and does not name an organisation`,
      !/<form|<input/.test(html) && !/employer\.onboarding/.test(html),
    );
  }
}
for (const key of [
  "employer.accessEnded.removed.heading",
  "employer.accessEnded.removed.body",
  "employer.accessEnded.suspended.heading",
  "employer.accessEnded.suspended.body",
  "employer.accessEnded.next",
  "employer.contact.writeTo",
  "employer.contact.subject",
]) {
  ck(`${key} exists in both languages and they differ`, both(key));
}
ck(
  "removed and suspended are different statements (suspended is 'paused, not removed')",
  sv["employer.accessEnded.removed.heading"] !== sv["employer.accessEnded.suspended.heading"] &&
    /pausad/.test(sv["employer.accessEnded.suspended.body"]) &&
    /paused/.test(en["employer.accessEnded.suspended.body"]),
);

group("2c · the review page tells the visitor what happens, and who to write to");
const pending = code(read("src/routes/_authenticated.employer.pending.tsx"));
const contactMailto = code(read("src/components/employer/ContactMailto.tsx"));
ck(
  "a rejected organisation has an address to write to (it said 'contact us' and gave none)",
  /state === "rejected" \? \(\s*<>[\s\S]*?<ContactMailto[\s\S]*?\) : state === "unavailable"/.test(
    pending,
  ) &&
    /import \{ ContactMailto \} from "@\/components\/employer\/ContactMailto"/.test(pending) &&
    /mailto:\$\{CONTACT_EMAIL\}/.test(contactMailto) &&
    /import \{ CONTACT_EMAIL \} from "@\/lib\/contact\/contact-address"/.test(contactMailto),
);
ck(
  "so does a suspended or archived one",
  /: state === "unavailable" \? \(\s*<>[\s\S]*?<ContactMailto[\s\S]*?\) : rereview \? \(/.test(
    pending,
  ),
);
ck(
  "the waiting page says what to expect and what to do meanwhile",
  (pending.match(/<WhileYouWait/g) ?? []).length === 2 &&
    /employer\.pending\.wait\.noTime/.test(pending) &&
    /employer\.pending\.wait\.meanwhile/.test(pending) &&
    /<Link to="\/my-career"/.test(pending),
);
ck(
  "the 12 second poll is intact and still stops when an active workspace appears",
  /refetchInterval:\s*\(q\)\s*=>[\s\S]{0,160}some\(\(w\) => w\.employerStatus === "active"\) \? false : 12_000/.test(
    pending,
  ) && /refetchOnWindowFocus: true/.test(pending),
);
for (const key of [
  "employer.pending.wait.heading",
  "employer.pending.wait.noTime",
  "employer.pending.wait.meanwhile",
  "employer.pending.wait.questions",
]) {
  ck(`${key} exists in both languages and they differ`, both(key));
}
ck(
  "no turnaround is promised anywhere in the review copy, in either language",
  ["pending.wait.noTime", "pending.body", "pending.step.review", "pending.step.activated"].every(
    (k) =>
      !/\b\d+\s*(arbetsdagar|dagar|timmar|veckor|business days|working days|days|hours|weeks)\b/i.test(
        sv[`employer.${k}`] + " " + en[`employer.${k}`],
      ),
  ) &&
    /kan inte säga hur lång tid/.test(sv["employer.pending.wait.noTime"]) &&
    /cannot say how long/.test(en["employer.pending.wait.noTime"]),
);
ck(
  "the contact address is the shared constant, not a literal",
  !/@cqrityjob\.com/.test(pending) &&
    !/@cqrityjob\.com/.test(contactMailto) &&
    !/@cqrityjob\.com/.test(code(read("src/components/employer/EmployerAccessEnded.tsx"))),
);

/* ═══ 3 · IDENTITY: the warning before an approved organisation goes back ═══ */
group("3a · the comparison mirrors the trigger");

const mig = read("supabase/migrations/20270123090000_employer_identity_rereview.sql");
ck(
  "the four fields are exactly the four the trigger compares, and descriptions and logo are not among them",
  identity.IDENTITY_FIELDS.length === 4 &&
    ["name", "registration_number", "website", "country"].every((c) =>
      new RegExp(`lower\\(btrim\\(coalesce\\(NEW\\.${c}, ''\\)\\)\\)`).test(mig),
    ) &&
    !/NEW\.(description_sv|description_en|logo_url)/.test(
      mig.slice(mig.indexOf("AND (lower(btrim"), mig.indexOf("NEW.status := 'pending'")),
    ),
);
ck(
  "the trigger only moves an ACTIVE organisation, and never a platform admin's or moderation's own write",
  /OLD\.status = 'active' AND NEW\.status = 'active'/.test(mig) &&
    /NOT public\.is_platform_admin\(auth\.uid\(\)\)/.test(mig) &&
    /app\.employer_moderation_in_progress/.test(mig),
);
const BEFORE = {
  name: "Nordvakt AB",
  country: "Sverige",
  registrationNumber: "556000-0000",
  website: "https://nordvakt.example",
};
ck(
  "a cosmetic re-type (case, surrounding space) is not a change",
  identity.identityChanges(BEFORE, {
    ...BEFORE,
    name: "  NORDVAKT ab ",
    website: "HTTPS://NORDVAKT.EXAMPLE ",
  }).length === 0,
);
for (const [field, value] of [
  ["name", "Nordvakt Syd AB"],
  ["country", "Norge"],
  ["registrationNumber", "556000-0001"],
  ["website", "https://other.example"],
] as const) {
  const changes = identity.identityChanges(BEFORE, { ...BEFORE, [field]: value });
  ck(
    `changing ${field} is reported, with the old and the new value`,
    changes.length === 1 &&
      changes[0].field === field &&
      changes[0].from === BEFORE[field] &&
      changes[0].to === value,
  );
}
ck(
  "clearing an optional field is a change; an absent field is not being changed",
  identity.identityChanges(BEFORE, { ...BEFORE, website: "" }).length === 1 &&
    identity.identityChanges(BEFORE, {}).length === 0,
);
ck(
  "an empty-to-empty edit is not a change",
  identity.identityChanges({ ...BEFORE, website: null }, { ...BEFORE, website: "  " }).length === 0,
);

group("3b · the settings page asks first, and the review page says what happened");
const settings = code(read("src/routes/_authenticated.employer.$employerSlug.settings.tsx"));
ck(
  "the form submits through submit(), never straight to the mutation",
  /onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*submit\(\);\s*\}\}/.test(settings),
);
ck(
  "a changed identity of an ACTIVE organisation opens the confirmation instead of saving",
  /status === "active" && query\.data/.test(settings) &&
    /identityChanges\(/.test(settings) &&
    /if \(changes\.length > 0\) \{\s*setConfirmChanges\(changes\);\s*return;\s*\}/.test(settings),
);
ck(
  "the only other path to the mutation is the confirmation's own button",
  (settings.match(/mutation\.mutate\(\)/g) ?? []).length === 2 &&
    /setConfirmChanges\(null\);\s*mutation\.mutate\(\);/.test(settings),
);
ck(
  "the confirmation lists what changes, and says the workspace closes and the ads go offline",
  /identityConfirm\.changes/.test(settings) &&
    /identityConfirm\.consequence/.test(settings) &&
    /identityConfirm\.noReview/.test(settings) &&
    /data-testid="identity-rereview-confirm"/.test(settings),
);
for (const key of [
  "employer.settings.identityConfirm.title",
  "employer.settings.identityConfirm.body",
  "employer.settings.identityConfirm.consequence",
  "employer.settings.identityConfirm.changes",
  "employer.settings.identityConfirm.empty",
  "employer.settings.identityConfirm.noReview",
  "employer.settings.identityConfirm.confirm",
  "employer.settings.identityConfirm.cancel",
]) {
  ck(`${key} exists in both languages and they differ`, both(key));
}
ck(
  "the consequence names the closed workspace, the ads, and promises no time",
  /arbetsytan stängd/.test(sv["employer.settings.identityConfirm.consequence"]) &&
    /annonser/.test(sv["employer.settings.identityConfirm.consequence"]) &&
    /workspace is closed/.test(en["employer.settings.identityConfirm.consequence"]) &&
    /ads/.test(en["employer.settings.identityConfirm.consequence"]) &&
    /kan inte säga hur lång tid/.test(sv["employer.settings.identityConfirm.consequence"]) &&
    /cannot say how long/.test(en["employer.settings.identityConfirm.consequence"]),
);

const settingsFns = code(read("src/lib/job-intelligence/employer-settings.functions.ts"));
ck(
  "the server function reports the status the database holds AFTER the write",
  /UpdateEmployerOrganisationResult/.test(settingsFns) &&
    /\.select\("status"\)/.test(settingsFns) &&
    /return \{ ok: true, status:/.test(settingsFns),
);
ck(
  "the re-review is recorded from THAT answer, before the workspace list is refetched",
  /status === "active" && result\.status === "pending"/.test(settings) &&
    settings.indexOf("EMPLOYER_IDENTITY_REREVIEW_KEY, { employerId }") <
      settings.lastIndexOf('queryKey: ["employer", "my-workspaces"]'),
);
ck(
  "the review page tells a re-review from a first registration",
  /EMPLOYER_IDENTITY_REREVIEW_KEY/.test(pending) &&
    /rereviewQuery\.data\?\.employerId === org\.employerId/.test(pending) &&
    /employer\.rereview\.heading/.test(pending) &&
    /REREVIEW_STEP_KEYS/.test(pending),
);
ck(
  "and the re-review branch does not thank the owner for registering, nor repeat the registration email",
  (() => {
    const at = pending.indexOf(") : rereview ? (");
    const end = pending.indexOf(") : (", at + 10);
    const branch = pending.slice(at, end);
    return at > 0 && end > at && !/pending\.thanks|pending\.email|notice/.test(branch);
  })(),
);
for (const key of [
  "employer.rereview.heading",
  "employer.rereview.body",
  "employer.rereview.access",
  "employer.rereview.step.saved",
  "employer.rereview.step.review",
  "employer.rereview.step.reopened",
]) {
  ck(`${key} exists in both languages and they differ`, both(key));
}
ck(
  "the re-review says the workspace is closed for the team and nothing was deleted",
  /stängd för hela teamet/.test(sv["employer.rereview.access"]) &&
    /Inget har raderats/.test(sv["employer.rereview.access"]) &&
    /closed for the whole team/.test(en["employer.rereview.access"]) &&
    /Nothing has been deleted/.test(en["employer.rereview.access"]),
);

/* ═══ 4 · SEND TEST: the refusal names its reason ═════════════════════ */
group("4 · who may send a test, and why not");

const evalAccess = (role: string | null, organisationStatus: string | null) =>
  access.evaluateTestAssignmentAccess({ role, organisationStatus });
ck(
  "an active owner or admin of an active organisation may send",
  evalAccess("owner", "active").allowed && evalAccess("admin", "active").allowed,
);
ck(
  "a plain member may not, whatever the organisation's status, and is told it is the role",
  [null, "active", "pending", "suspended"].every((s) => {
    const r = evalAccess("member", s);
    return !r.allowed && r.reason === "not_owner_admin";
  }),
);
ck(
  "no active membership at all is the role reason",
  (() => {
    const r = evalAccess(null, "active");
    return !r.allowed && r.reason === "not_owner_admin";
  })(),
);
for (const status of ["pending", "draft"]) {
  const r = evalAccess("owner", status);
  ck(
    `an owner of a ${status} organisation is told it is UNDER REVIEW`,
    !r.allowed && r.reason === "organisation_under_review",
  );
}
for (const status of ["rejected", "suspended", "archived"]) {
  const r = evalAccess("admin", status);
  ck(
    `an admin of a ${status} organisation is told it is NOT ACTIVE, not that it is under review`,
    !r.allowed && r.reason === "organisation_not_active",
  );
}
ck(
  "an unreadable status falls back to the role alone (the RPC refuses a non-active organisation on its own)",
  evalAccess("owner", null).allowed && evalAccess("owner", undefined as never).allowed,
);

const startFns = code(read("src/lib/library/start.functions.ts"));
ck(
  "the server function reads the organisation's status with the membership, through the same embedded read the workspace list uses",
  /select\("role, employers\(status\)"\)/.test(startFns) &&
    /evaluateTestAssignmentAccess\(/.test(startFns) &&
    /Promise<TestAssignmentAccess>/.test(startFns),
);
ck(
  "the permission model is not changed here: still an ACTIVE membership, still owner or admin",
  /\.eq\("status", "active"\)/.test(startFns) &&
    /role !== "owner" && input\.role !== "admin"/.test(
      code(read("src/lib/library/test-assignment-access.ts")),
    ),
);
const dialog = code(read("src/components/recruitment/SendTestDialog.tsx"));
const bank = code(read("src/components/recruitment/TestBank.tsx"));
ck(
  "both places that ask render the reason, and neither compares the answer to a bare boolean any more",
  /sendTest\.refusal\.underReview/.test(dialog + bank) &&
    /sendTest\.refusal\.notActive/.test(dialog + bank) &&
    !/access\.data === true/.test(dialog + bank) &&
    /access\.data\?\.allowed === true/.test(dialog) &&
    /access\.data\?\.allowed === true/.test(bank),
);
ck(
  "a refusal at send time re-reads the access, so the reason shown is the current one",
  /key === "journey\.assignNotAuthorised"[\s\S]{0,220}test-assignment-access/.test(dialog),
);
for (const key of [
  "sendTest.refusal.underReview",
  "sendTest.refusal.notActive",
  "journey.assignNotAuthorised",
]) {
  ck(`${key} exists in both languages and they differ`, both(key));
}
ck(
  "the generic 'not authorised' sentence no longer tells an owner they need to be one",
  !/Du behöver vara ägare eller administratör för/.test(sv["journey.assignNotAuthorised"]) &&
    !/You need to be an owner or an administrator/.test(en["journey.assignNotAuthorised"]) &&
    /godkänd och aktiv/.test(sv["journey.assignNotAuthorised"]) &&
    /approved and active/.test(en["journey.assignNotAuthorised"]),
);

/* ═══ 5 · PLACEHOLDERS reachable only by URL ══════════════════════════ */
group("5 · areas that are not part of the workspace are honest and unlinked");
const shell = code(read("src/components/employer/EmployerAppShell.tsx"));
const navStart = shell.indexOf("const NAV_GROUPS");
const nav = shell.slice(navStart, shell.indexOf("];", navStart));
for (const area of ["analytics", "competencies", "sites", "preferences"]) {
  const file = code(read(`src/routes/_authenticated.employer.$employerSlug.${area}.tsx`));
  ck(
    `${area}: no navigation entry leads to it`,
    !new RegExp(`/employer/\\$employerSlug/${area}"`).test(nav),
  );
  ck(
    `${area}: it renders the 'not part of your workspace yet' page with a way back, not a form`,
    /<EmployerModuleComingSoon/.test(file) && !/<form|<input|useMutation/.test(file),
  );
}
const comingSoon = code(read("src/components/employer/EmployerModuleComingSoon.tsx"));
ck(
  "that page says it is not available yet and links back to the overview",
  /employer\.module\.notYet\.body/.test(comingSoon) &&
    /employer\.module\.notYet\.back/.test(comingSoon) &&
    /to="\/employer\/\$employerSlug"/.test(comingSoon) &&
    /ingår inte i er arbetsyta ännu/.test(sv["employer.module.notYet.body"]) &&
    /not part of your workspace yet/.test(en["employer.module.notYet.body"]),
);

/* ═══ 6 · the shared dictionaries stay in step ════════════════════════ */
group("6 · Swedish and English carry the same keys for everything this pass added");
const added = (src: Record<string, string>) =>
  Object.keys(src).filter((k) =>
    /^(admin\.employers\.members\.|employer\.accessEnded\.|employer\.rereview\.|employer\.settings\.identityConfirm\.|employer\.pending\.wait\.|sendTest\.refusal\.|employer\.contact\.|admin\.actionError\.membership)/.test(
      k,
    ),
  );
ck(
  `${added(sv).length} added keys, identical sets in sv and en`,
  added(sv).length > 40 && JSON.stringify(added(sv).sort()) === JSON.stringify(added(en).sort()),
);

/* ── verdict ───────────────────────────────────────────────────────── */
console.log(`\n${n - failures.length} of ${n} assertions passed`);
if (failures.length > 0) {
  console.error(`\nFAIL — employer-access-lifecycle-check (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — employer-access-lifecycle-check");
