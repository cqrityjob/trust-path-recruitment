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

  step2: c("2. Välj syfte", "2. Choose a purpose"),
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

  step3: c("3. Klistra in jobbannonsen", "3. Paste the job advert"),
  step3Help: c(
    "Valfritt. Texten behandlas som material, aldrig som instruktioner till systemet.",
    "Optional. The text is treated as material, never as instructions to the system.",
  ),

  nameLabel: c("Namn på CV:t", "Name for this CV"),
  nameHelp: c(
    "Bara för dig, så att du hittar rätt bland dina sparade CV.",
    "For you only, so you can tell your saved CVs apart.",
  ),

  includeInsight: c("Inkludera min karriärutforskning", "Include my Career Discovery result"),
  includeInsightHelp: c(
    "Visas som en karriärriktning, aldrig som en kompetens eller kvalifikation.",
    "Shown as a career direction, never as a competency or a qualification.",
  ),

  generate: c("Skapa CV", "Create CV"),
  generating: c("Skapar…", "Creating…"),
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
    "Du redigerar hur det står — inte vad som står. Arbetsgivare, roller, datum och intyg kommer från din profil och ditt Säkerhetspass.",
    "You are editing how it reads — not what it says. Employers, roles, dates and credentials come from your profile and your Security Passport.",
  ),
  editInProfile: c("Rätta uppgifter i yrkesprofilen", "Correct information in your Professional Profile"),
  factLocked: c(
    "Källuppgift — redigeras i yrkesprofilen",
    "Source information — edited in your Professional Profile",
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
    "Minst en anställning eller utbildning i Säkerhetspasset",
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
  provider_unavailable: c(
    "Ingen AI-motor är konfigurerad i den här miljön. Ditt CV nedan är byggt direkt av dina uppgifter — det är komplett och går att använda.",
    "No AI engine is configured in this environment. Your CV below is built directly from your own information — it is complete and usable.",
  ),
  provider_error: c(
    "AI-stödet gick inte att nå. Ditt CV nedan är byggt direkt av dina uppgifter.",
    "The AI assistant could not be reached. Your CV below is built directly from your own information.",
  ),
};
