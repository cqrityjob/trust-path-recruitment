// The account-creation confirmation state — asserted from real code.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The owner's pilot review (Emsoms #3): after submitting the registration
// form, the form STAYED on screen. All that changed was a one-line notice
// above it. So the only control the page still offered was the button that
// had already worked, and pressing it again answers "User already
// registered" — an error about the thing that succeeded. Nothing said which
// address the link went to, nothing offered to resend it, and nothing said
// the destination the person was heading for had survived.
//
// The fix is a state that REPLACES the form, and these are its properties:
//
//   1. Sign-up without a session hands over to a confirmation state. It is
//      a state, not a string: a notice can be rendered beside a live form,
//      a branch cannot.
//   2. The form is not rendered in that state — so a second submission is
//      impossible by construction rather than by discipline.
//   3. The address is shown, because a typo in an email address is
//      invisible until nothing arrives.
//   4. Send again and Change email both exist.
//   5. Resend uses the STORED address and return path, not the form's
//      fields — which are no longer on screen, so reading them would send
//      the link somewhere else or nowhere.
//   6. The post-verification destination is preserved, and said in words.
//
// It reads source rather than rendering: UnifiedAuthForm imports the
// Supabase browser client, so rendering it here would assert nothing about
// the branch and everything about a missing module.
//
// Run: bun run account-confirmation:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const FORM = "src/components/auth/UnifiedAuthPanel.tsx";
const DICT = "src/i18n/dictionaries.ts";

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

/** Comments stripped, so no rule is satisfied by prose about the rule. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");
}

const form = code(read(FORM));

/* ---------------------------------------------------------------- */
console.log("\n1 · registration hands over to a state, not a notice");

check(
  /const \[awaitingConfirmation, setAwaitingConfirmation\] = useState</.test(form),
  "ACS-STATE: the form carries an explicit confirmation state",
);
check(
  /setAwaitingConfirmation\(\{\s*email: email\.trim\(\),\s*returnTo,\s*forOrganisation,\s*canSignInHere: true,?\s*\}\)/.test(
    form,
  ),
  "ACS-STATE: sign-up without a session sets it, carrying the address AND the return path",
);
check(
  !/setInfo\(\s*\n?\s*t\(forOrganisation \? "auth\.signup\.check_email_employer"/.test(form),
  "ACS-STATE: and no longer merely sets a notice line beside a live form",
);
// The session branch, read as a block rather than as "goToDestination is the
// very next token".
//
// It stopped being the next token when organisation provisioning moved into
// the submit: a registration that names a company now creates it in the
// request the person is already waiting on, instead of leaving it to a page
// that has not mounted yet. That is a deliberate improvement and this
// assertion has to survive it -- but WITHOUT going soft on the thing it
// actually protects, which is that a sign-up returning a session must not be
// sent to the inbox panel for a message nobody sent.
//
// So both halves are asserted, and the second is stricter than the pattern it
// replaces: the branch reaches the destination, and it never sets the
// confirmation state.
const sessionBranch = (() => {
  const at = form.indexOf("if (data.session) {");
  return at === -1 ? "" : form.slice(at, form.indexOf("return;", at));
})();
check(
  sessionBranch.includes("goToDestination();"),
  "ACS-STATE: a sign-up that DOES return a session still reaches the destination -- there is no email to read in that case",
);
check(
  sessionBranch.length > 0 && !sessionBranch.includes("setAwaitingConfirmation"),
  "ACS-STATE: and is never handed to the inbox panel, which would be a message nobody sent",
);

/* ---------------------------------------------------------------- */
console.log("\n2 · the form is gone, not merely captioned");

// The confirmation branch must be tested BEFORE the branch that renders the
// form, in the same conditional chain. Any other arrangement can paint both.
const chain = form.slice(form.indexOf("!sessionKnown ?"), form.indexOf("</form>"));
check(
  chain.indexOf("awaitingConfirmation ?") > -1,
  "ACS-REPLACES: the confirmation branch sits in the same chain that decides whether to draw the form",
);
check(
  chain.indexOf("awaitingConfirmation ?") < chain.indexOf("<form onSubmit"),
  "ACS-REPLACES: and is decided BEFORE the form, so the two can never both render",
);

/* ---------------------------------------------------------------- */
console.log("\n3 · it says what happened, to whom, and what is next");

check(
  /\{awaitingConfirmation\.email\}/.test(form),
  "ACS-SHOWS: the address the link was sent to is rendered from the stored state",
);
check(
  /auth\.confirm\.heading/.test(form) && /auth\.confirm\.sentTo/.test(form),
  "ACS-SHOWS: with a heading and a label for the address",
);
check(
  /auth\.confirm\.destinationKept/.test(form),
  "ACS-SHOWS: and says in words that the destination survived -- a claimed Career Discovery result is the reason this matters",
);
check(/auth\.confirm\.notArrived/.test(form), "ACS-SHOWS: and what to do when nothing arrives");

/* ---------------------------------------------------------------- */
console.log("\n4 · send again, and change email");

check(/onResend/.test(form), "ACS-ACTIONS: a resend action exists");
check(/onChangeEmail/.test(form), "ACS-ACTIONS: and a change-email action");
check(
  /supabase\.auth\.resend\(\{\s*type: "signup"/.test(form),
  "ACS-ACTIONS: resend asks for a signup link specifically",
);
check(
  /onResendFor\(awaitingConfirmation\.email, awaitingConfirmation\.returnTo\)/.test(form) &&
    /email: toAddress,/.test(form),
  "ACS-ACTIONS: addressed to the STORED address, never the form field -- which is off screen",
);
check(
  /awaitingConfirmation\.returnTo/.test(form),
  "ACS-ACTIONS: and carrying the STORED return path, so a resend cannot quietly change where the link goes",
);
check(
  /function onChangeEmail\(\) \{[^}]*setAwaitingConfirmation\(null\)/.test(form),
  "ACS-ACTIONS: change-email returns to the form by clearing the state",
);
// Scoped to the confirmation panel itself. A bare search for role="status"
// passes on the form's own notice region, which is a different element on a
// different branch -- so it would have gone on printing "ok" with the
// panel's announcement deleted. The control ACC-NC-RESEND-SILENT is what
// found that, which is exactly what a control is for.
const panel = form.slice(
  form.indexOf('data-testid="auth-awaiting-confirmation"'),
  form.indexOf('data-testid="auth-confirmation-change-email"'),
);
check(panel.length > 0, "ACS-ACTIONS: the confirmation panel is locatable for scoped assertions");
check(
  /role="status"/.test(panel),
  "ACS-ACTIONS: the resend outcome is announced INSIDE the panel, not only painted",
);
check(
  /role="alert"/.test(panel),
  "ACS-ACTIONS: and a failed resend is announced as an alert in the panel too",
);

/* ---------------------------------------------------------------- */
console.log("\n5 · the copy exists in both languages");

const dict = read(DICT);
for (const key of [
  "auth.confirm.heading",
  "auth.confirm.body",
  "auth.confirm.bodyEmployer",
  "auth.confirm.sentTo",
  "auth.confirm.notArrived",
  "auth.confirm.resend",
  "auth.confirm.resending",
  "auth.confirm.resent",
  "auth.confirm.changeEmail",
  "auth.confirm.destinationKept",
]) {
  const n = dict.split(`"${key}":`).length - 1;
  check(n === 2, `ACS-COPY: ${key} is authored in Swedish and English (found ${n})`);
}

/* ---------------------------------------------------------------- */
console.log("");
/* ---------------------------------------------------------------- */
console.log("\n5 · the state survives a reload, and the link may be opened elsewhere");
// Owner bug report 2026-09-26: "Om jag verifierar min mail på min mobil måste
// den synka med datorn, det gör den inte nu." Registration on the laptop,
// link opened on the phone: the laptop must find out, safely, and offer the
// right next step -- never a session copied between devices.
check(
  /rememberPendingConfirmation\(\s*\{ email: email\.trim\(\), returnTo, forOrganisation \},/.test(
    form,
  ),
  "ACS-PERSIST: the pending registration is remembered in this browser when the inbox panel is shown",
);
check(
  /readPendingConfirmation\(DEFAULT_DESTINATION\)/.test(form) && /canSignInHere: false,/.test(form),
  "ACS-PERSIST: and restored on mount WITHOUT a password -- the password is never stored",
);
check(
  /clearPendingConfirmation\(\)/.test(form) &&
    /function onChangeEmail\(\) \{\s*clearPendingConfirmation\(\);/.test(form),
  "ACS-PERSIST: changing the address forgets the pending registration",
);
check(
  /async function tryContinue\(silent: boolean\)/.test(form) &&
    /supabase\.auth\.signInWithPassword\(\{\s*email: waiting\.email,\s*password: pwd,?\s*\}\)/.test(form),
  "ACS-DEVICE: 'I have confirmed -- continue' is a REAL sign-in on this device with the person's own credentials",
);
check(
  /c\.kind === "email_not_confirmed"/.test(form) && /auth\.confirm\.notYet/.test(form),
  "ACS-DEVICE: an address that is not confirmed yet is said in words, not as a raw provider error",
);
check(
  !/auth\.users|admin\.getUserById|getUserByEmail/.test(form),
  "ACS-DEVICE: the panel never reads account state without credentials",
);
check(
  /auth\.confirm\.otherDevice/.test(form) &&
    /auth\.confirm\.restored/.test(form) &&
    /auth\.confirm\.signInToContinue/.test(form),
  "ACS-DEVICE: the cross-device case is explained, and after a reload the next step is the sign-in form",
);
check(
  /consumeAuthErrorFragment\(\)/.test(form) && /auth\.confirm\.linkExpired/.test(form),
  "ACS-LINK: a link opened late or twice is reported from the URL fragment",
);
for (const key of [
  "auth.confirm.otherDevice",
  "auth.confirm.continue",
  "auth.confirm.notYet",
  "auth.confirm.restored",
  "auth.confirm.signInToContinue",
  "auth.confirm.linkExpired",
  "auth.existing.heading",
  "auth.existing.body",
  "auth.error.rateLimited",
  "auth.error.emailNotConfirmed",
  "auth.error.existingAccount",
]) {
  check(
    (dict.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) ?? []).length === 2,
    `ACS-COPY: ${key} exists in both languages`,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n6 · an address that already has an account is not told to read an email");
check(
  /data\.user\.identities\.length === 0/.test(form) &&
    /setExistingAccount\(email\.trim\(\)\)/.test(form),
  "ACS-EXISTING: a confirmation-required signUp that returns no identities is the existing-account state",
);
check(
  /classifyAuthError\(error\)\.kind === "existing_account"/.test(form),
  "ACS-EXISTING: and so is the provider's user_already_exists refusal",
);
check(
  /existingAccount \? \(/.test(form) &&
    form.indexOf("existingAccount ? (") < form.indexOf("awaitingConfirmation ? ("),
  "ACS-EXISTING: the existing-account branch is decided before the inbox panel, so the two never both render",
);
check(
  /reportErrors\(\[describe\(err\)\]\)/.test(form) &&
    !/reportErrors\(\[err instanceof Error \? err\.message/.test(form),
  "ACS-ERRORS: provider refusals are translated (rate limit, wrong password, unconfirmed) rather than printed raw",
);
check(
  /resendCooldown > 0/.test(form) && /RESEND_COOLDOWN_SECONDS = 60/.test(form),
  "ACS-ERRORS: the resend counts down the provider's interval instead of running into its rate limit",
);

if (failures.length > 0) {
  console.error(`account-confirmation-state-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Account confirmation state: ${assertions} of ${assertions} assertions passed.`);
