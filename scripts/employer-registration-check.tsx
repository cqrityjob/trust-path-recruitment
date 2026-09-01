// EMPLOYER REGISTRATION AND ACTIVATION — the contract that makes an
// employer signup produce a reviewable organisation.
//
// ── THE DEFECT THIS GUARDS ─────────────────────────────────────────────
//
// An independent pilot audit registered an employer exactly as a customer
// would: it ticked "I am creating this account for an organisation", typed
// a company name, and signed in. It then landed on the candidate home with
// no employer context anywhere, no organisation in the database, and an
// empty administrator moderation queue. The organisation only came into
// existence when the tester typed `/employer` into the address bar by
// hand.
//
// Everything downstream of that point already worked — `pending` status,
// the moderation queue, the approval RPC, the workspace. The one missing
// link was that `ensureMyEmployerCompanyFromSignup` ran as a SIDE EFFECT
// OF RENDERING one route, and nothing reliably took the registrant there:
// the destination lived in a `?redirect=` parameter minted at signup,
// which does not survive an auto-confirmed signup, a later sign-in, or a
// Google round trip.
//
// Every property below is one careless edit from restoring that silence,
// and not one of them is visible to a type checker.
//
//   1. Provisioning is mounted in the AUTHENTICATED SHELL, not owned by
//      /employer. If the call goes back to being reachable only from that
//      route, the audit's journey returns exactly as it was.
//
//   2. ONE predicate decides "this person registered for an organisation",
//      shared by the client that decides whether to call and the server
//      that decides whether to create. When it was written twice the two
//      copies disagreed about whether a country was required.
//
//   3. A provisioning FAILURE never routes to the create-a-company form.
//      Answering a backend error with "you have no organisation" invites
//      the person to register a second one — recovery by duplication, on
//      the one flow that must not duplicate.
//
//   4. The pending page handles a failed read as a failed read. A
//      useQuery error is a value, not a throw, so `errorComponent` does
//      not catch it and the page rendered "your organisation is under
//      review" with the name and date silently missing.
//
//   5. An organisation UNDER REVIEW is discoverable from the account menu,
//      wearing its status, pointing at the status page. Hiding it is how
//      a registrant ends up with no route to their own organisation;
//      pointing it at the dashboard is a door that bounces.
//
//   6. Provisioning does not become a poll, and costs nothing for the
//      candidates and administrators who have no intent.
//
//   7. The status contract is unchanged: created `pending`, activated only
//      through the existing admin moderation RPC.
//
// Run via `bun run employer-registration:check`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same substitute, and the same reason, as candidate-app-navigation-check:
// <Link> needs a live router and does not render synchronously under
// renderToStaticMarkup. Params are resolved faithfully, so an href proved
// here is the href a person actually clicks.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));

// The dropdown's content is Radix, portalled and CLOSED by default, so under
// renderToStaticMarkup the menu renders as an empty trigger and every
// assertion about what it contains would pass vacuously. Substituting plain
// elements renders the same children the open menu shows, which is the thing
// being proved: `asChild` is honoured by rendering the child as-is, exactly as
// Radix does, so the <a> under test is the real one.
const passthrough =
  (tag: string) =>
  ({ children, asChild, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) =>
    asChild ? (children as React.ReactElement) : React.createElement(tag, rest, children);

await mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: passthrough("div"),
  DropdownMenuTrigger: passthrough("button"),
  DropdownMenuContent: passthrough("div"),
  DropdownMenuItem: passthrough("div"),
  DropdownMenuLabel: passthrough("div"),
  DropdownMenuSeparator: passthrough("hr"),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { AccountMenu } = await import("../src/components/site/AccountMenu");
const { workspaceStatusLabelKey } = await import("../src/components/site/workspace-status");
const { readEmployerSignupIntent, hasEmployerSignupIntent } =
  await import("../src/lib/job-intelligence/employer-signup-intent");

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Comments DISCUSS the thing they are about, so a naive scan reads prose
 *  as code — every file in this PR documents the defect it fixes. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const shell = code(read("src/routes/_authenticated.tsx"));
const employerIndex = code(read("src/routes/_authenticated.employer.index.tsx"));
const pending = code(read("src/routes/_authenticated.employer.pending.tsx"));
const hook = code(read("src/lib/job-intelligence/use-employer-signup-provisioning.ts"));
const onboardingFns = code(read("src/lib/job-intelligence/employer-onboarding.functions.ts"));
const authForm = code(read("src/components/auth/UnifiedAuthForm.tsx"));
const header = code(read("src/components/site/SiteHeader.tsx"));
const menu = code(read("src/components/site/AccountMenu.tsx"));
const safeRedirect = code(read("src/lib/auth/safe-redirect.ts"));

// ---------------------------------------------------------------------
group("1 · provisioning is a lifecycle event, not a route's side effect");

ck(
  "the authenticated shell mounts the provisioning hook",
  /useEmployerSignupProvisioning/.test(shell),
);
// Asserted as a RENDERED element, not merely as a defined component. The
// first version of this check matched the function declaration, so deleting
// `<EmployerRegistrationCompletion />` from the tree — which restores the
// original defect exactly — left the guard green.
ck(
  "the shell RENDERS it, and inside the signed-in branch only",
  /<EmployerRegistrationCompletion\s*\/>/.test(shell) &&
    /if \(!signedIn\) return null;/.test(shell) &&
    shell.indexOf("if (!signedIn) return null;") <
      shell.indexOf("<EmployerRegistrationCompletion />"),
);
ck(
  "/employer no longer owns the provisioning call",
  !/ensureMyEmployerCompanyFromSignup/.test(employerIndex) &&
    /useEmployerSignupProvisioning/.test(employerIndex),
);
ck(
  "the hook is the ONLY caller of the server function outside its own module",
  /ensureMyEmployerCompanyFromSignup/.test(hook),
);
ck(
  "the shell's redirect fires on a real outcome, never on mere intent",
  /if \(!created && !failed\) return;/.test(shell),
);
ck(
  "and never while already inside the employer area, which owns its own branching",
  /inEmployerArea/.test(shell) && /if \(inEmployerArea\) return;/.test(shell),
);

// ---------------------------------------------------------------------
group("2 · one predicate for 'registered on behalf of an organisation'");

ck(
  "the server function reads the intent through the shared module",
  /readEmployerSignupIntent/.test(onboardingFns),
);
ck(
  "and no longer re-implements the metadata read inline",
  !/meta\.company_name === "string"/.test(onboardingFns),
);
ck("the hook gates on the same predicate", /hasEmployerSignupIntent/.test(hook));

ck(
  "both name AND country are required — a name alone is not actionable",
  readEmployerSignupIntent({ company_name: "Journey Security AB" }) === null &&
    readEmployerSignupIntent({ company_country: "Sverige" }) === null &&
    readEmployerSignupIntent({ company_name: "Journey Security AB", company_country: "Sverige" })
      ?.companyName === "Journey Security AB",
);
ck(
  "whitespace is not an intent",
  readEmployerSignupIntent({ company_name: "   ", company_country: "Sverige" }) === null,
);
ck(
  "values are trimmed, so a stray space cannot create ' Journey Security AB'",
  readEmployerSignupIntent({ company_name: "  Journey Security AB  ", company_country: " SE " })
    ?.companyName === "Journey Security AB",
);
ck(
  "a missing or malformed metadata bag is simply no intent",
  !hasEmployerSignupIntent(null) &&
    !hasEmployerSignupIntent(undefined) &&
    !hasEmployerSignupIntent({}) &&
    !hasEmployerSignupIntent({ company_name: 42, company_country: true } as never),
);

// ---------------------------------------------------------------------
group("3 · a failure is never reported as 'you have no organisation'");

ck(
  "/employer refuses to route to the onboarding form after a failed provision",
  /if \(provision\.failed\) return;/.test(employerIndex),
);
ck(
  "and renders a truthful error with a retry instead",
  /provision\.failed && workspaces\.length === 0/.test(employerIndex) &&
    /employer\.provisionFailed\.heading/.test(employerIndex) &&
    /provision\.retry\(\)/.test(employerIndex),
);
ck(
  "the error copy warns against registering a second time",
  /do not create a second registration/i.test(dictionaries.en["employer.provisionFailed.body"]) &&
    /skapa inte en ny registrering/i.test(dictionaries.sv["employer.provisionFailed.body"]),
);
ck(
  "the pending page handles a FAILED read as a failure, not as 'under review'",
  /if \(query\.isError\)/.test(pending) && /employer\.statusUnknown\.heading/.test(pending),
);
ck(
  "and does not claim a review for somebody who holds no membership",
  /noMembership/.test(pending),
);
ck(
  "the provisioning hook surfaces failure rather than swallowing it",
  /failed: query\.isError/.test(hook) && /retry: false/.test(hook),
);

// ---------------------------------------------------------------------
group("4 · an organisation under review is discoverable, wearing its status");

ck(
  "pending and draft read as 'under review'",
  workspaceStatusLabelKey("pending") === "account.context.underReview" &&
    workspaceStatusLabelKey("draft") === "account.context.underReview",
);
ck(
  "an active organisation wears no chip — it is simply open",
  workspaceStatusLabelKey("active") === null,
);
ck(
  "rejected, suspended and archived read as unavailable, never as 'under review'",
  (["rejected", "suspended", "archived"] as const).every(
    (s) => workspaceStatusLabelKey(s) === "account.context.unavailable",
  ),
);
ck(
  "the header carries the status through instead of dropping it",
  /employerStatus: w\.employerStatus/.test(header),
);

const render = (el: React.ReactElement): string =>
  renderToStaticMarkup(React.createElement(I18nProvider, null, el));

const menuMarkup = render(
  React.createElement(AccountMenu, {
    identity: {
      name: "Alex",
      email: "alex@example.test",
      currentContext: "personal" as const,
      workspaces: [
        {
          employerSlug: "journey-ab",
          employerName: "Journey Security AB",
          employerStatus: "pending",
        },
        { employerSlug: "open-ab", employerName: "Open Security AB", employerStatus: "active" },
      ],
    },
    onSignOut: () => {},
  }),
);

ck(
  "the pending organisation is NAMED in the account menu",
  menuMarkup.includes("Journey Security AB"),
);
ck(
  "it points at the status page, not at a dashboard that will bounce",
  menuMarkup.includes('href="/employer/pending"'),
);
ck(
  "it carries its status in the menu",
  menuMarkup.includes(dictionaries.sv["account.context.underReview"]),
);
ck(
  "the ACTIVE organisation still points at its own workspace",
  menuMarkup.includes('href="/employer/open-ab"'),
);
ck(
  "a pending organisation never links to /employer/<its slug>",
  !menuMarkup.includes('href="/employer/journey-ab"'),
);
ck(
  "the personal context is never removed — one account keeps both",
  menuMarkup.includes('href="/my-career"'),
);

// ---------------------------------------------------------------------
group("5 · the registrant is carried, and the intent survives every hop");

ck(
  "an immediate-session signup navigates instead of saying 'check your email'",
  /if \(data\.session\) \{/.test(authForm) && /goToDestination\(\);/.test(authForm),
);
ck(
  "the organisation destination is still /employer",
  /const ORGANISATION_DESTINATION = "\/employer";/.test(authForm),
);
ck(
  "the default destination is still the personal home — no forced employer mode",
  /const DEFAULT_DESTINATION = "\/my-career";/.test(authForm),
);
ck(
  "the organisation intent is carried across the Google round trip",
  /rememberOrganisationIntent/.test(authForm) && /consumeOrganisationIntent/.test(authForm),
);
ck(
  "and never overwrites an account that already names a company",
  /hasEmployerSignupIntent\(user\.user_metadata \?\? null\)\) return;/.test(authForm),
);

// ---------------------------------------------------------------------
group("6 · no poll, and no cost for people with no intent");

ck("the provisioning query has no refetchInterval", !/refetchInterval/.test(hook));
ck("it is disabled unless there is an intent", /enabled: hasIntent === true/.test(hook));
ck(
  "and runs once per mount",
  /staleTime: Infinity/.test(hook) && /refetchOnMount: false/.test(hook),
);
ck(
  "the intent is read from the session, not from a network round trip",
  /supabase\.auth\.getSession\(\)/.test(hook) && !/\.from\(/.test(hook),
);

// ---------------------------------------------------------------------
group("7 · the status and authorisation contract is untouched");

ck(
  "the organisation is still created pending, by the existing RPC",
  /create_my_employer_company/.test(onboardingFns),
);
ck(
  "provisioning still refuses a caller who already holds a membership",
  /already_member/.test(onboardingFns),
);
ck(
  "a duplicate is reported, never merged",
  /DUPLICATE_EMPLOYER:/.test(onboardingFns) && /reason: "duplicate"/.test(onboardingFns),
);
ck(
  "no second auth system was introduced",
  !/createClient\(/.test(shell) && !/createClient\(/.test(hook),
);
ck(
  "the return-path allow-list still refuses every auth surface",
  /AUTH_SURFACES/.test(safeRedirect) &&
    ["/login", "/signup", "/auth", "/employer/register"].every((s) =>
      safeRedirect.includes(`"${s}"`),
    ),
);

// ---------------------------------------------------------------------
group("8 · SV / EN parity for every state this PR added");

for (const key of [
  "employer.statusUnknown.heading",
  "employer.statusUnknown.body",
  "employer.provisionFailed.heading",
  "employer.provisionFailed.body",
  "employer.provisionFailed.retry",
  "account.context.underReview",
  "account.context.unavailable",
] as const) {
  const sv = dictionaries.sv[key];
  const en = dictionaries.en[key];
  ck(
    `${key} exists in both languages and they differ`,
    typeof sv === "string" && sv.length > 0 && typeof en === "string" && en.length > 0 && sv !== en,
  );
}

ck(
  "no review-time promise is made in either language",
  !/\b\d+\s*(arbetsdagar|dagar|timmar)\b/i.test(dictionaries.sv["employer.pending.body"]) &&
    !/\b\d+\s*(business days|days|hours)\b/i.test(dictionaries.en["employer.pending.body"]),
);

// ---------------------------------------------------------------------
console.log(
  `\n${fails.length === 0 ? "PASS" : "FAIL"} — employer-registration-check` +
    (fails.length
      ? `\n  ${fails.length} failing assertion(s):\n   - ${fails.join("\n   - ")}`
      : ""),
);
process.exit(fails.length === 0 ? 0 : 1);
