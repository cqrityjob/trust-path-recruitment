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

const FORM = "src/components/auth/UnifiedAuthForm.tsx";
const DICT = "src/i18n/dictionaries.ts";
const GUARD = "account-confirmation:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "ACC-NC-BACK-TO-A-NOTICE",
    defect:
      "THE ORIGINAL DEFECT: sign-up goes back to setting a one-line notice, so the registration form survives its own submission and the only control left is the button that already worked",
    file: FORM,
    find: "        setAwaitingConfirmation({ email: email.trim(), returnTo });",
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
    find: "        setAwaitingConfirmation({ email: email.trim(), returnTo });",
    replace: '        setAwaitingConfirmation({ email: email.trim(), returnTo: "/" });',
    guard: GUARD,
    expect: "ACS-STATE",
  },
  {
    id: "ACC-NC-SESSION-PATH-BROKEN",
    defect:
      "a sign-up that DOES return a session stops going to the destination, so somebody already signed in is told to read an email that was never sent",
    file: FORM,
    find: "        if (data.session) {\n          goToDestination();",
    replace: "        if (data.session) {\n          setInfo(null);",
    guard: GUARD,
    expect: "ACS-STATE",
  },
  {
    id: "ACC-NC-FORM-DECIDED-FIRST",
    defect:
      "the confirmation branch is moved after the form's, so both can paint and the form survives the submission again",
    file: FORM,
    find: "              ) : awaitingConfirmation ? (",
    replace: "              ) : awaitingConfirmation && false ? (",
    guard: GUARD,
    expect: "ACS-REPLACES",
  },
  {
    id: "ACC-NC-ADDRESS-HIDDEN",
    defect:
      "the address the link was sent to is no longer shown, so a typo stays invisible until nothing ever arrives",
    file: FORM,
    find: "                      {awaitingConfirmation.email}",
    replace: "                      {null}",
    guard: GUARD,
    expect: "ACS-SHOWS",
  },
  {
    id: "ACC-NC-DESTINATION-UNSTATED",
    defect:
      "the panel stops saying the destination survived, so somebody mid-Career-Discovery has no reason to believe their result is still waiting",
    file: FORM,
    find: '                    {t("auth.confirm.destinationKept")}',
    replace: "                    {null}",
    guard: GUARD,
    expect: "ACS-SHOWS",
  },
  {
    id: "ACC-NC-RESEND-READS-THE-FORM-FIELD",
    defect:
      "resend addresses the live form field instead of the stored address -- the field is off screen in this state, so the link goes somewhere else or nowhere",
    file: FORM,
    find: "        email: awaitingConfirmation.email,",
    replace: "        email: email.trim(),",
    guard: GUARD,
    expect: "ACS-ACTIONS",
  },
  {
    id: "ACC-NC-CHANGE-EMAIL-DEAD",
    defect:
      "change-email stops clearing the state, so the control is on screen and does nothing -- a dead control in the middle of registration",
    file: FORM,
    find: "  function onChangeEmail() {\n    setAwaitingConfirmation(null);",
    replace: "  function onChangeEmail() {\n    setInfo(null);",
    guard: GUARD,
    expect: "ACS-ACTIONS",
  },
  {
    id: "ACC-NC-RESEND-SILENT",
    defect:
      "the resend outcome is painted but never announced, so a screen-reader user cannot tell whether pressing it did anything",
    file: FORM,
    find:
      '                      role="status"\n                      className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"',
    replace:
      '                      data-was-status="true"\n                      className="mt-4 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm text-foreground"',
    guard: GUARD,
    expect: "ACS-ACTIONS",
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
