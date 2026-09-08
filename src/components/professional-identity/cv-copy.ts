// Copy for the CV surfaces, in one place.
//
// It moved out of the route when the CV became three screens -- a list, a
// creator and a saved document -- because three copies of "this is built
// from what you already recorded" is three chances for them to start
// disagreeing about what the product promises.
//
// Swedish and English are authored together, as pairs, so a sentence cannot
// be added in one language and forgotten in the other.

import { c, cp, type Copy, type PluralCopy } from "./copy";
import type { CvGenerationStatus } from "@/lib/professional-identity/cv/generation";
import type { CvRequiredField } from "@/lib/professional-identity/cv/readiness";
import type { BundleSection } from "@/lib/professional-identity/cv/bundle-diff";

export const CV = {
  /* -- shared ------------------------------------------------------- */
  back: c("Min karriär", "My Career"),
  backToList: c("Alla CV", "All CVs"),
  title: c("Ditt CV", "Your CV"),
  lede: c(
    "Byggt av det du redan har registrerat i CQrityjob. Arbetsgivare, roller, datum och intyg hämtas från dina egna uppgifter — AI:n formulerar, den hittar inte på.",
    "Built from what you have already recorded in CQrityjob. Employers, roles, dates and credentials come from your own entries — the AI phrases, it does not invent.",
  ),
  loading: c("Hämtar dina uppgifter…", "Loading your information…"),
  loadFailed: c(
    "Dina uppgifter kunde inte hämtas just nu. Ladda om sidan för att försöka igen.",
    "Your information could not be loaded right now. Reload the page to try again.",
  ),

  /* -- readiness ---------------------------------------------------- */
  notReadyTitle: c(
    "Din profil behöver lite mer information innan vi kan skapa ett användbart CV.",
    "Your profile needs a little more information before we can create a useful CV.",
  ),
  completeProfile: c("Komplettera profilen", "Complete profile"),

  /* -- the list ----------------------------------------------------- */
  listEmptyTitle: c("Du har inget CV ännu", "You do not have a CV yet"),
  listEmptyBody: c(
    "Ett CV byggs av de uppgifter du redan har registrerat. Du kan spara flera — ett allmänt, och ett anpassat för en särskild roll.",
    "A CV is built from the information you have already recorded. You can keep several — a general one, and one tailored to a particular role.",
  ),
  createFirst: c("Skapa ditt första CV", "Create your first CV"),
  createNew: c("Skapa nytt CV", "Create a new CV"),
  open: c("Öppna", "Open"),
  updatedAt: c("Uppdaterat {0}", "Updated {0}"),
  purposeGeneralLabel: c("Allmänt CV", "General CV"),
  purposeTargetedLabel: c("Anpassat CV", "Tailored CV"),
  aiAssistedLabel: c("Med AI-utkast", "With an AI draft"),
  factualLabel: c("Utan AI", "No AI"),

  /* -- the creator -------------------------------------------------- */
  step1: c("1. Granska underlaget", "1. Review the information"),
  step1Lede: c(
    "Detta är allt som får användas. Något som saknas här kommer inte att stå i ditt CV.",
    "This is everything that may be used. Anything missing here will not appear in your CV.",
  ),
  employment: c("Anställningar", "Employment"),
  education: c("Utbildning", "Education"),
  credentials: c("Intyg", "Credentials"),
  skills: c("Färdigheter", "Skills"),
  languages: c("Språk", "Languages"),
  identity: c("Namn och yrkestitel", "Name and professional title"),
  none: c("Inga", "None"),

  /* -- step 1b: what goes on it -------------------------------------- */
  selectTitle: c("2. Välj vad som ska med", "2. Choose what to include"),
  selectLede: c(
    "Allt du har registrerat är med från början. Kryssa ur det som inte hör hemma i just det här CV:t — det tas då bort ur dokumentet och ur exporten, och ligger kvar orört i din profil.",
    "Everything you have recorded is included to begin with. Uncheck anything that does not belong on this particular CV — it is then absent from the document and from the export, and stays untouched in your profile.",
  ),
  selectEndedNote: c(
    "Avslutade anställningar är en del av din yrkeshistorik och är med som vanligt.",
    "Employment that has ended is part of your professional history and is included as normal.",
  ),
  selectAll: c("Markera alla", "Select all"),
  selectNone: c("Avmarkera alla", "Clear all"),
  selectedCount: c("{0} med", "{0} included"),
  selectEmptySection: c("Inget registrerat", "Nothing recorded"),
  /** The one selection that produces no CV at all, said before the person
   *  presses a button that would refuse. */
  selectNoHistory: c(
    "Ett CV behöver minst en anställning eller en utbildning. Kryssa i minst en för att fortsätta.",
    "A CV needs at least one employment or one education. Tick at least one to continue.",
  ),

  /* -- language ------------------------------------------------------ */
  languageTitle: c("Språk", "Language"),
  languageHelp: c(
    "Styr rubriker, datumord och verifieringsrader. Din egen text och AI-utkastets text översätts inte — de står kvar på det språk de skrevs.",
    "Sets the headings, the date words and the verification lines. Your own text and any AI-drafted text are not translated — they stay in the language they were written in.",
  ),
  languageSv: c("Svenska", "Swedish"),
  languageEn: c("Engelska", "English"),

  /* -- contact ------------------------------------------------------- */
  contactTitle: c("Kontaktuppgifter", "Contact details"),
  contactHelp: c(
    "Du väljer vad som står på CV:t. Ingenting visas om du inte kryssar i det.",
    "You choose what appears on the CV. Nothing is shown unless you tick it.",
  ),
  contactEmail: c("E-post", "Email"),
  contactPhone: c("Telefon", "Telephone"),
  contactShow: c("Visa på CV:t", "Show on the CV"),
  contactFromAccount: c(
    "Hämtad från ditt konto. Ändra den här om du hellre vill bli kontaktad på en annan adress.",
    "Taken from your account. Change it here if you would rather be contacted at another address.",
  ),
  contactNotVerified: c(
    "Kontaktuppgifter är egna uppgifter och märks aldrig som verifierade.",
    "Contact details are self-reported and are never marked as verified.",
  ),

  step2: c("3. Välj syfte", "3. Choose a purpose"),
  purposeGeneral: c("Allmänt CV", "General CV"),
  purposeGeneralHelp: c(
    "Kronologiskt, utan anpassning mot en särskild roll.",
    "Chronological, with no tailoring towards a particular role.",
  ),
  purposeTargeted: c("Anpassa mot en roll", "Tailor to a role"),
  purposeTargetedHelp: c(
    "Annonsen styr ordning och betoning. Den kan aldrig lägga till en kvalifikation du inte har.",
    "The advert decides order and emphasis. It can never add a qualification you do not have.",
  ),

  step3: c("4. Klistra in jobbannonsen", "4. Paste the job advert"),
  step3Help: c(
    "Valfritt. Texten behandlas som material, aldrig som instruktioner till systemet.",
    "Optional. The text is treated as material, never as instructions to the system.",
  ),

  nameLabel: c("Namn på CV:t", "Name for this CV"),
  nameHelp: c(
    "Bara för dig, så att du hittar rätt bland dina sparade CV.",
    "For you only, so you can tell your saved CVs apart.",
  ),

  includeInsight: c("Inkludera min Karriäranalys", "Include my Career Analysis"),
  includeInsightHelp: c(
    "Visas som en karriärriktning, aldrig som en kompetens eller kvalifikation.",
    "Shown as a career direction, never as a competency or a qualification.",
  ),

  // The button makes a PREVIEW. Saving is a separate, consented act, and the
  // label has to say which one is about to happen -- "Create CV" on a control
  // that writes nothing was a promise the next screen had to walk back.
  generate: c("Förhandsgranska CV", "Preview CV"),
  generating: c("Tar fram förhandsgranskning…", "Preparing preview…"),
  regeneratePreview: c("Uppdatera förhandsgranskningen", "Refresh the preview"),
  previewStaleTitle: c("Förhandsgranskningen gäller inte längre", "This preview is out of date"),
  previewStaleBody: c(
    "Du har ändrat något som påverkar dokumentet. Ta fram en ny förhandsgranskning innan du sparar — annars skulle du spara ett annat CV än det du läste.",
    "You have changed something that affects the document. Take a new preview before saving — otherwise you would be saving a different CV from the one you read.",
  ),

  /* -- what leaves this product ------------------------------------- */
  aiNotice: c(
    "Om du väljer ett AI-utkast skickas de uppgifter du valt ovan till den AI-tjänst som är konfigurerad för CQrityjob, för att formuleras om. Kontaktuppgifter skickas aldrig. Utan AI byggs CV:t direkt av dina uppgifter.",
    "If you choose an AI draft, the entries you selected above are sent to the AI service configured for CQrityjob, to be rephrased. Contact details are never sent. Without AI the CV is built directly from your own information.",
  ),
  awaiting: c(
    "Ditt CV visas här när du har skapat det. Du väljer själv om du vill spara det.",
    "Your CV appears here once you create it. Whether you save it is your choice.",
  ),

  /* -- saving ------------------------------------------------------- */
  save: c("Spara CV", "Save CV"),
  saving: c("Sparar…", "Saving…"),
  saved: c("Sparat", "Saved"),
  saveFailed: c("Kunde inte sparas", "Save failed"),
  saveFailedHelp: c(
    "Ingenting gick förlorat — texten står kvar på skärmen. Försök igen.",
    "Nothing was lost — your text is still on screen. Try again.",
  ),
  saveRejected: c(
    "Utkastet kunde inte sparas: det innehöll uppgifter som inte finns i dina egna registrerade uppgifter. Ingenting sparades.",
    "The draft could not be saved: it contained information that is not in your own recorded entries. Nothing was saved.",
  ),
  unsaved: c("Osparade ändringar", "Unsaved changes"),

  /* -- the saved document ------------------------------------------- */
  review: c("Granska och använd", "Review and use"),
  reviewNote: c(
    "Läs igenom innan du använder det. Du äger det som står här.",
    "Read it through before you use it. You own what it says.",
  ),
  print: c("Skriv ut / spara som PDF", "Print / save as PDF"),
  rename: c("Byt namn", "Rename"),
  deleteCv: c("Ta bort", "Delete"),
  deleteConfirm: c(
    "Ta bort det här CV:t? Uppgifterna i din profil påverkas inte.",
    "Delete this CV? The information in your profile is not affected.",
  ),
  deleting: c("Tar bort…", "Deleting…"),

  editPresentation: c("Redigera texten", "Edit the wording"),
  editDone: c("Klar", "Done"),
  editHeadline: c("Yrkestitel på CV:t", "Professional title on this CV"),
  editSummary: c("Sammanfattning", "Summary"),
  editBullets: c("Punkter", "Bullet points"),
  editHelp: c(
    "Du redigerar hur det står — inte vad som står. Arbetsgivare, roller, datum och intyg kommer från din profil och ditt Security Passport.",
    "You are editing how it reads — not what it says. Employers, roles, dates and credentials come from your profile and your Security Passport.",
  ),
  editInProfile: c("Rätta uppgifter i Min profil", "Correct information in My Profile"),
  factLocked: c(
    "Källuppgift — redigeras i Min profil",
    "Source information — edited in My Profile",
  ),

  /* -- regeneration ------------------------------------------------- */
  regenerate: c("Skapa nytt AI-utkast", "Create a new AI draft"),
  proposalTitle: c("Förslag — inte sparat ännu", "Suggestion — not saved yet"),
  proposalBody: c(
    "Så här skulle AI-stödet formulera ditt CV nu. Ditt sparade CV är oförändrat tills du väljer att använda förslaget.",
    "This is how the AI assistant would phrase your CV now. Your saved CV is unchanged until you choose to use the suggestion.",
  ),
  proposalAccept: c("Använd förslaget", "Use this suggestion"),
  proposalDiscard: c("Behåll mitt sparade CV", "Keep my saved CV"),

  /* -- profile drift ------------------------------------------------ */
  driftTitle: c(
    "Din profil har ändrats sedan det här CV:t sparades",
    "Your profile has changed since this CV was saved",
  ),
  driftBody: c(
    "Det sparade CV:t visar fortfarande uppgifterna som de såg ut när du sparade det. Det ändras inte av sig självt.",
    "The saved CV still shows the information as it stood when you saved it. It does not change on its own.",
  ),
  driftAction: c("Uppdatera från profilen", "Update from profile"),
  driftUpdating: c("Uppdaterar…", "Updating…"),
  driftDropped: c(
    "{0} anställning finns inte längre i din profil, så dess punkter togs bort.",
    "{0} employment is no longer in your profile, so its bullet points were removed.",
  ),
  driftAdded: c("Tillagt", "Added"),
  driftRemoved: c("Borttaget", "Removed"),
  driftChanged: c("Ändrat", "Changed"),

  /* -- what this CV leaves out -------------------------------------- */
  omittedTitle: c(
    "Detta finns i din profil men inte på det här CV:t",
    "In your profile, but not on this CV",
  ),
  omittedBody: c(
    "Antingen valde du bort det, eller så har du lagt till det efter att CV:t sparades. Du kan lägga till det här — inget annat i CV:t ändras.",
    "Either you left it off, or you added it after this CV was saved. You can put it on here — nothing else in the CV changes.",
  ),
  omittedAdd: c("Lägg till på CV:t", "Add to this CV"),
  omittedRemove: c("Ta bort från CV:t", "Remove from this CV"),
  omittedSaving: c("Ändrar…", "Changing…"),
  omittedFailed: c(
    "Det gick inte att ändra vad CV:t innehåller. Ingenting ändrades. Försök igen.",
    "What this CV includes could not be changed. Nothing changed. Try again.",
  ),
  editIncluded: c("Innehåll", "Contents"),
  editIncludedHelp: c(
    "Kryssa ur något för att ta bort det från det här CV:t. Uppgiften ligger kvar i din profil.",
    "Uncheck something to take it off this CV. The entry stays in your profile.",
  ),

  /* -- somebody else wrote first ------------------------------------ */
  changedTitle: c("CV:t har ändrats i ett annat fönster", "This CV was changed in another window"),
  changedBody: c(
    "Ingenting sparades här. Ladda om sidan för att se den senaste versionen — då ser du vad som ändrats innan du skriver över något.",
    "Nothing was saved here. Reload the page to see the latest version — you will then see what changed before you overwrite anything.",
  ),
  changedReload: c("Ladda om CV:t", "Reload this CV"),
  conflictTitle: c(
    "Ett annat CV har redan sparats med den här begäran",
    "A different CV was already saved for this request",
  ),
  conflictBody: c(
    "Ingenting sparades. Ta fram en ny förhandsgranskning och spara den i stället.",
    "Nothing was saved. Take a new preview and save that instead.",
  ),
  limitReached: c(
    "Du har nått gränsen för antal sparade CV. Ta bort ett du inte behöver för att spara ett nytt.",
    "You have reached the limit for saved CVs. Delete one you no longer need to save another.",
  ),
  contactInvalid: c(
    "Kontrollera e-postadressen och telefonnumret du valt att visa. Ingenting sparades.",
    "Check the email address and telephone number you chose to show. Nothing was saved.",
  ),
  notReadyToSave: c(
    "Ett CV behöver minst en anställning eller en utbildning. Ingenting sparades.",
    "A CV needs at least one employment or one education. Nothing was saved.",
  ),

  /* -- leaving with unsaved work ------------------------------------ */
  leaveTitle: c("Du har ändringar som inte är sparade", "You have unsaved changes"),
  leaveBody: c(
    "Om du lämnar sidan nu försvinner det du skrivit. Spara först, eller stäng redigeringen om du vill kasta ändringarna.",
    "If you leave now, what you have written is lost. Save first, or close the editor if you want to discard your changes.",
  ),
  editCloseUnsaved: c("Stäng utan att spara", "Close without saving"),
  deleteCancel: c("Behåll CV:t", "Keep this CV"),
  deleteKeepsApplications: c(
    "CV som du redan har skickat med en jobbansökan finns kvar hos arbetsgivaren. Det är bara det här dokumentet som tas bort.",
    "A CV you have already submitted with a job application stays with that employer. Only this document is removed.",
  ),

  /* -- error recovery ------------------------------------------------ */
  retry: c("Försök igen", "Try again"),
  retrying: c("Försöker igen…", "Trying again…"),
  exportHelp: c(
    "Öppnar webbläsarens utskriftsdialog, där du väljer skrivare eller “Spara som PDF”.",
    "Opens your browser's print dialog, where you choose a printer or “Save as PDF”.",
  ),
} as const;

export const CV_COUNTED: Readonly<Record<"dropped", PluralCopy>> = {
  dropped: cp(
    c(
      "{0} anställning finns inte längre i din profil, så dess punkter togs bort.",
      "{0} employment is no longer in your profile, so its bullet points were removed.",
    ),
    c(
      "{0} anställningar finns inte längre i din profil, så deras punkter togs bort.",
      "{0} employments are no longer in your profile, so their bullet points were removed.",
    ),
  ),
};

export const CV_MISSING_FIELD: Readonly<Record<CvRequiredField, Copy>> = {
  displayName: c("Ditt namn", "Your name"),
  professionalIdentity: c(
    "En yrkestitel eller ett angivet yrke",
    "A professional title or a stated profession",
  ),
  location: c("Land", "Country"),
  professionalHistory: c(
    "Minst en anställning eller utbildning i Security Passport",
    "At least one employment or education in the Security Passport",
  ),
};

export const CV_DRIFT_SECTION: Readonly<Record<BundleSection, Copy>> = {
  employment: CV.employment,
  education: CV.education,
  credentials: CV.credentials,
  skills: CV.skills,
  languages: CV.languages,
  identity: CV.identity,
};

/** Why there is no assisted draft. Four distinct answers, because a
 *  rejection is a control working and must not read like an outage. */
export const CV_STATUS_NOTE: Readonly<Record<CvGenerationStatus, Copy>> = {
  succeeded: c("", ""),
  abstained: c(
    "AI-stödet avstod från att skriva ett utkast. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The AI assistant declined to draft. Your CV below is built directly from your own information.",
  ),
  schema_invalid: c(
    "AI-stödets svar gick inte att använda. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The AI assistant's answer could not be used. Your CV below is built directly from your own information.",
  ),
  fabrication_rejected: c(
    "Utkastet innehöll uppgifter som inte finns i dina egna registrerade uppgifter, och kasserades i sin helhet. Det skrivs aldrig om för att godkännas. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The draft contained information that is not in your own recorded entries, and was discarded in full. It is never rewritten until it passes. Your CV below is built directly from your own information.",
  ),
  // What the READER needs to know is that they have a complete CV. Whether an
  // operator has configured a credential is our business, not theirs, and
  // "no AI engine is configured in this environment" is an internal sentence
  // that reads like a fault on a page where nothing is wrong.
  provider_unavailable: c(
    "AI-stödet är inte tillgängligt just nu. Ditt CV nedan är byggt direkt av dina uppgifter — det är komplett och går att använda.",
    "The AI assistant is not available right now. Your CV below is built directly from your own information — it is complete and usable.",
  ),
  provider_error: c(
    "AI-stödet gick inte att nå. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The AI assistant could not be reached. Your CV below is built directly from your own information.",
  ),
};
