/**
 * Negative controls for the account-creation confirmation state.
 *
 * Each mutation reintroduces a real form of Emsoms #3 -- the registration
 * form surviving its own submission -- and the guard must refuse it: the
 * handover reduced back to a notice line, the form rendered alongside the
 * confirmation panel, the address hidden, the resend or change-email
 * control removed, and a resend that reads the off-screen form field
 * instead of the stored address.
 *
 * Each mutation changes exactly one thing, the guard must fail with the
 * named diagnostic, and every file is restored byte-for-byte (proved by
 * the shared runner).
 *
 * Run: bun run negative-controls:account-confirmation
 */
import { runControls, type Mutation } from "./runner";

// The auth implementation moved to UnifiedAuthPanel when image 0 put a
// working login panel on the public landing page; UnifiedAuthForm is now
// the /login PAGE around it. The confirmation state, its resend and its
// return path all live in the panel, so that is where these mutations
// plant. The defects and the expectations are unchanged.
const FORM = "src/components/auth/UnifiedAuthPanel.tsx";
const DICT = "src/i18n/dictionaries.ts";
const GUARD = "account-confirmation:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "ACC-NC-BACK-TO-A-NOTICE",
    defect:
      "THE ORIGINAL DEFECT: sign-up goes back to setting a one-line notice, so the registration form survives its own submission and the only control left is the button that already worked",
    file: FORM,
    find: "        setAwaitingConfirmation({\n          email: email.trim(),\n          returnTo,\n          forOrganisation,\n          canSignInHere: true,\n        });",
    replace:
      '        setInfo(\n          t(forOrganisation ? "auth.signup.check_email_employer" : "auth.signup.check_email"),\n        );',
    guard: GUARD,
    expect: "ACS-STATE",
  },
  {
    id: "ACC-NC-STATE-LOSES-RETURN-PATH",
    defect:
      "the confirmation state stops carrying the return path, so the destination a claimed Career Discovery result was heading for cannot be restated or resent",
    file: FORM,
    find: "        setAwaitingConfirmation({\n          email: email.trim(),\n          returnTo,\n          forOrganisation,\n          canSignInHere: true,\n        });",
    replace:
      "        setAwaitingConfirmation({\n          email: email.trim(),\n          returnTo: \"/\",\n          forOrganisation,\n          canSignInHere: true,\n        });",
    guard: GUARD,
    expect: "ACS-STATE",
  },
  {
    id: "ACC-NC-SESSION-PATH-BROKEN",
    defect:
      "a sign-up that DOES return a session stops going to the destination, so somebody already signed in is told to read an email that was never sent",
    file: FORM,
    // Anchored on the destination call itself rather than on its adjacency to
    // `if (data.session) {`. Organisation provisioning now runs between the
    // two, and an anchor that encoded the old adjacency would refuse to mutate
    // rather than plant the defect -- which is a dead control, not a passing
    // one.
    find: "          goToDestination();\n          return;\n        }",
    replace: "          setInfo(null);\n          return;\n        }",
    guard: GUARD,
    expect: "ACS-STATE",
  },
  {
    id: "ACC-NC-SESSION-PATH-SHOWS-INBOX",
    defect:
      "a sign-up that returned a session is ALSO handed to the inbox panel, so somebody who is already signed in is told to go and read a message nobody sent",
    file: FORM,
    find: "          goToDestination();\n          return;\n        }",
    replace:
      "          setAwaitingConfirmation({ email: email.trim(), returnTo });\n          goToDestination();\n          return;\n        }",
    guard: GUARD,
    expect: "ACS-STATE",
  },
  {
    id: "ACC-NC-FORM-DECIDED-FIRST",
    defect:
      "the confirmation branch is moved after the form's, so both can paint and the form survives the submission again",
    file: FORM,
    find: "      ) : awaitingConfirmation ? (",
    replace: "      ) : awaitingConfirmation && false ? (",
    guard: GUARD,
    expect: "ACS-REPLACES",
  },
  {
    id: "ACC-NC-ADDRESS-HIDDEN",
    defect:
      "the address the link was sent to is no longer shown, so a typo stays invisible until nothing ever arrives",
    file: FORM,
    find: "              {awaitingConfirmation.email}",
    replace: "              {null}",
    guard: GUARD,
    expect: "ACS-SHOWS",
  },
  {
    id: "ACC-NC-DESTINATION-UNSTATED",
    defect:
      "the panel stops saying the destination survived, so somebody mid-Career-Discovery has no reason to believe their result is still waiting",
    file: FORM,
    find: '{t("auth.confirm.destinationKept")}</p>',
    replace: "{null}</p>",
    guard: GUARD,
    expect: "ACS-SHOWS",
  },
  {
    id: "ACC-NC-RESEND-READS-THE-FORM-FIELD",
    defect:
      "resend addresses the live form field instead of the stored address -- the field is off screen in this state, so the link goes somewhere else or nowhere",
    file: FORM,
    find: "    await onResendFor(awaitingConfirmation.email, awaitingConfirmation.returnTo);",
    replace: "    await onResendFor(email.trim(), awaitingConfirmation.returnTo);",
    guard: GUARD,
    expect: "ACS-ACTIONS",
  },
  {
    id: "ACC-NC-CHANGE-EMAIL-DEAD",
    defect:
      "change-email stops clearing the state, so the control is on screen and does nothing -- a dead control in the middle of registration",
    file: FORM,
    find: "  function onChangeEmail() {\n    clearPendingConfirmation();\n    setAwaitingConfirmation(null);",
    replace: "  function onChangeEmail() {\n    clearPendingConfirmation();\n    setInfo(null);",
    guard: GUARD,
    expect: "ACS-ACTIONS",
  },
  {
    id: "ACC-NC-RESEND-SILENT",
    defect:
      "the resend outcome is painted but never announced, so a screen-reader user cannot tell whether pressing it did anything",
    file: FORM,
    find: '              role="status"\n              className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"',
    replace:
      '              data-was-status="true"\n              className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"',
    guard: GUARD,
    expect: "ACS-ACTIONS",
  },
  // ── The cross-device repair (owner bug report 2026-09-26) ─────────────
  {
    id: "ACC-NC-PENDING-NOT-REMEMBERED",
    defect:
      "the pending registration is no longer remembered in the browser, so a reload -- or coming back to the laptop after opening the link on a phone -- shows the empty form again",
    file: FORM,
    find: "        rememberPendingConfirmation(\n          { email: email.trim(), returnTo, forOrganisation },\n          DEFAULT_DESTINATION,\n        );\n        setAwaitingConfirmation({\n          email: email.trim(),\n          returnTo,\n          forOrganisation,\n          canSignInHere: true,\n        });",
    replace:
      "        setAwaitingConfirmation({\n          email: email.trim(),\n          returnTo,\n          forOrganisation,\n          canSignInHere: true,\n        });",
    guard: GUARD,
    expect: "ACS-PERSIST",
  },
  {
    id: "ACC-NC-CONTINUE-WITHOUT-SIGNIN",
    defect:
      "'I have confirmed -- continue' stops signing in with the person's credentials and simply navigates, which is either a dead end or a session that was never earned on this device",
    file: FORM,
    find: "      const { error } = await supabase.auth.signInWithPassword({\n        email: waiting.email,\n        password: pwd,\n      });",
    replace: "      const { error } = { error: null as null | { code: string } };",
    guard: GUARD,
    expect: "ACS-DEVICE",
  },
  {
    id: "ACC-NC-EXISTING-TOLD-TO-READ-EMAIL",
    defect:
      "a taken address (no identities back from signUp, nothing sent) is handed to the inbox panel again, telling the person to read an email nobody sent",
    file: FORM,
    find: "          data.user.identities.length === 0\n        ) {\n          setExistingAccount(email.trim());",
    replace:
      "          data.user.identities.length === -1\n        ) {\n          setExistingAccount(email.trim());",
    guard: GUARD,
    expect: "ACS-EXISTING",
  },
  {
    id: "ACC-NC-RAW-PROVIDER-ERRORS",
    defect:
      "the resend prints the provider's raw English message again ('email rate limit exceeded') on a Swedish product, with no next step",
    file: FORM,
    find: "      reportErrors([describe(err)]);\n    } finally {\n      setResending(false);",
    replace:
      "      reportErrors([err instanceof Error ? err.message : String(err)]);\n    } finally {\n      setResending(false);",
    guard: GUARD,
    expect: "ACS-ERRORS",
  },
  {
    id: "ACC-NC-COPY-ENGLISH-MISSING",
    defect:
      "the English confirmation heading is dropped, so an English-reading candidate meets a raw dictionary key at the moment they create an account",
    file: DICT,
    find: '    "auth.confirm.heading": "Check your email",',
    replace: "",
    guard: GUARD,
    expect: "ACS-COPY",
  },
];

runControls("account-confirmation", MUTATIONS);
