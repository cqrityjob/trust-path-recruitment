/** The account shown when save was chosen must still own the request. The
 * server derives the actual identity from verified authentication, never this hint. */
export function matchesConfirmedAccount(
  expectedUserId: string | undefined,
  actualUserId: string,
): boolean {
  return expectedUserId === undefined || expectedUserId === actualUserId;
}

export const accountConfirmationCopy = {
  sv: {
    signedIn: "Aktivt konto",
    save: "Spara resultatet på det här kontot",
    switch: "Byt konto",
    switching: "Byter konto …",
    switchFailed: "Kontot kunde inte bytas. Försök igen. Dina svar finns kvar.",
    changed: "Det aktiva kontot har ändrats. Kontrollera kontot innan du sparar resultatet.",
  },
  en: {
    signedIn: "Active account",
    save: "Save the result to this account",
    switch: "Switch account",
    switching: "Switching account …",
    switchFailed: "The account could not be switched. Try again. Your answers are still here.",
    changed: "The active account has changed. Check the account before saving the result.",
  },
} as const;
