// Voluntary self-declarations — every word the holder reads, in both
// languages, authored together as c(sv, en) pairs.
//
// ── THE WORDING RULES (asserted by scripts/self-declarations-check.ts) ───
//
//   * It is SELF-DECLARATION. Nothing here says or implies verified,
//     cleared, approved, debt-free, clean record, risk or score.
//   * The statements are fixed and versioned (STATEMENT_VERSIONS in
//     model.ts). Changing a sentence in STATEMENTS means a new version and a
//     new processing authorization, not an edit.
//   * Ordinary loans and mortgages are explicitly NOT what the financial
//     statements are about.
//   * There is NO criminal-history statement. That panel only ever explains
//     why it is closed.
//   * Nothing asks for an explanation, an offence, a creditor, an amount or
//     a personal identity number, and no control is pre-selected.
//   * On the Security Passport and to a recipient the label is always
//     "Självdeklarerat" / "Self-declared", whatever document exists, and the
//     sentence saying CQrityjob has not verified it is always shown.

import { c, type Copy } from "@/components/professional-identity/copy";
import type {
  DeclarationKind,
  DocumentType,
  ProcessingAuthorization,
  Provenance,
  SelfDeclarationError,
} from "./model";

export const SECTION = {
  heading: c("Frivilliga självdeklarationer", "Voluntary self-declarations"),
  lede: c(
    "Helt frivilligt. Du kan hoppa över allt här utan att något annat påverkas: din profil, ditt CV, ditt Security Passport och dina ansökningar ser likadana ut oavsett.",
    "Entirely voluntary. You can skip everything here and nothing else changes: your profile, CV, Security Passport and applications look the same either way.",
  ),
  whatItIs: c(
    "Det du anger här är din egen uppgift. Det är inte en verifiering, en identitetskontroll, en säkerhetsprövning eller ett godkännande för anställning.",
    "What you record here is your own statement. It is not verification, an identity check, security vetting or approval for employment.",
  ),
  privacy: c(
    "Bara du ser det, om du inte själv väljer att bifoga en uppgift till en viss delning av ditt Security Passport. Det visas aldrig i din offentliga profil, i ditt CV, i ansökningar, i sökningar eller i bilder, och det används inte för att ranka eller bedöma dig.",
    "Only you can see it, unless you yourself choose to include a statement in a particular share of your Security Passport. It is never shown in your public profile, your CV, applications, search or images, and it is never used to rank or assess you.",
  ),
  loading: c("Läser in…", "Loading…"),
  loadFailed: c(
    "Det gick inte att läsa dina självdeklarationer. Inget har ändrats.",
    "Your self-declarations could not be loaded. Nothing has changed.",
  ),
  retry: c("Försök igen", "Try again"),
} as const;

export const KIND_TITLE: Readonly<Record<DeclarationKind, Copy>> = {
  enforcement_debt_none: c("Skulder hos Kronofogden", "Debts with Kronofogden"),
  payment_remarks_none: c("Betalningsanmärkningar", "Payment remarks"),
  criminal_history: c("Brottshistorik", "Criminal history"),
};

/**
 * The fixed statements, keyed by the version the authorization must name.
 * `{0}` is the date the statement speaks about.
 */
export const STATEMENTS: Readonly<
  Record<string, { readonly statement: Copy; readonly scope: Copy }>
> = {
  "se-enforcement-v1": {
    statement: c(
      "Jag uppger att jag den {0} inte har några skulder registrerade hos Kronofogden.",
      "I state that on {0} I have no debts registered with Kronofogden (the Swedish Enforcement Authority).",
    ),
    scope: c(
      "Det gäller bara skulder som är registrerade hos Kronofogden. Vanliga lån, bolån och krediter som du betalar enligt avtal räknas inte hit.",
      "This is only about debts registered with Kronofogden. Ordinary loans, mortgages and credit that you are repaying as agreed are not included.",
    ),
  },
  "se-remarks-v1": {
    statement: c(
      "Jag uppger att jag den {0} inte har några aktuella betalningsanmärkningar.",
      "I state that on {0} I have no current payment remarks.",
    ),
    scope: c(
      "En betalningsanmärkning är en notering hos ett kreditupplysningsföretag om en skuld som inte betalats i tid. Att ha lån eller bolån är inte en betalningsanmärkning.",
      "A payment remark is a record at a credit reference agency of a debt that was not paid on time. Having a loan or a mortgage is not a payment remark.",
    ),
  },
};

export const CLOSED = {
  chip: c("Inte öppet", "Not open"),
  financial: c(
    "Den här uppgiften går inte att lämna ännu. Inget samlas in förrän behandlingen är bedömd och dokumenterad: vem som ansvarar, för vilket ändamål, med vilken rättslig grund och hur länge.",
    "This statement cannot be made yet. Nothing is collected until the processing has been assessed and recorded: who is responsible, for what purpose, on what legal basis and for how long.",
  ),
  criminal: c(
    "Den här uppgiften går inte att lämna. Uppgifter om brott får bara behandlas inom en uttryckligen granskad jurisdiktion, period och ett granskat ändamål, och ett samtycke räcker inte. Någon sådan granskning finns inte, så här samlas ingenting in: inga svar och inga filer.",
    "This statement cannot be made. Information about offences may only be processed within an explicitly reviewed jurisdiction, period and purpose, and consent alone is not enough. No such review exists, so nothing is collected here: no answers and no files.",
  ),
} as const;

export const PROVENANCE: Readonly<
  Record<Provenance, { readonly label: Copy; readonly hint: Copy }>
> = {
  self_declared: {
    label: c("Egen uppgift", "Self-declared"),
    hint: c(
      "Du har själv lämnat uppgiften. Ingen har kontrollerat den.",
      "You made this statement yourself. Nobody has checked it.",
    ),
  },
  document_provided: {
    label: c("Dokument bifogat", "Document provided"),
    hint: c(
      "Du har bifogat ett dokument till just den här uppgiften. Ingen har granskat dokumentet.",
      "You attached a document to this exact statement. Nobody has reviewed the document.",
    ),
  },
  document_reviewed: {
    label: c("Dokument granskat", "Document reviewed"),
    hint: c(
      "En utsedd granskare har bekräftat att dokumentet är av angiven typ och utfärdat angivet datum. Det är inte en bedömning av dig eller av uppgiften i övrigt.",
      "An appointed reviewer has confirmed that the document is of the stated type and was issued on the stated date. It is not an assessment of you or of anything else.",
    ),
  },
};

export const DOCUMENT_TYPE: Readonly<Record<DocumentType, Copy>> = {
  enforcement_authority_statement: c(
    "Utdrag eller intyg från Kronofogden",
    "Extract or certificate from Kronofogden",
  ),
  credit_report: c(
    "Kreditupplysning om dig själv (t.ex. från UC)",
    "Your own credit report (e.g. from UC)",
  ),
  police_extract: c("Utdrag ur belastningsregistret", "Police record extract"),
};

export const LEGAL_BASIS: Readonly<Record<ProcessingAuthorization["legalBasis"], Copy>> = {
  consent: c("Samtycke", "Consent"),
  contract: c("Avtal", "Contract"),
  legal_obligation: c("Rättslig förpliktelse", "Legal obligation"),
  legitimate_interests: c("Berättigat intresse", "Legitimate interests"),
  public_task: c("Uppgift av allmänt intresse", "Public task"),
};

export const PANEL = {
  // The processing record, shown before anything is asked.
  aboutProcessing: c("Så behandlas uppgiften", "How this is processed"),
  operator: c("Ansvarig", "Responsible"),
  purpose: c("Ändamål", "Purpose"),
  legalBasis: c("Rättslig grund", "Legal basis"),
  retention: c(
    "Sparas i högst {0} dagar efter att du senast lämnade uppgiften, eller tills du tar bort den.",
    "Kept for at most {0} days after you last made the statement, or until you delete it.",
  ),

  // The form. Nothing is pre-selected.
  notDeclared: c("Du har inte lämnat den här uppgiften.", "You have not made this statement."),
  declare: c("Lämna uppgiften", "Make this statement"),
  asOfLabel: c("Uppgiften gäller den", "The statement is about"),
  affirm: c(
    "Ja, det här är min egen uppgift och den stämmer.",
    "Yes, this is my own statement and it is true.",
  ),
  save: c("Spara uppgiften", "Save statement"),
  saving: c("Sparar…", "Saving…"),
  cancel: c("Avbryt", "Cancel"),
  saved: c("Uppgiften är sparad.", "The statement is saved."),

  // A saved statement.
  declaredOn: c("Lämnad {0}", "Made on {0}"),
  keptUntil: c("Sparas till {0}", "Kept until {0}"),
  renew: c("Ändra eller förnya", "Change or renew"),
  renewHeading: c("Ändra eller förnya uppgiften", "Change or renew the statement"),
  renewWarning: c(
    "När du ändrar eller förnyar blir det en ny uppgift. Ett bifogat dokument och en eventuell granskning hör till den gamla och tas bort.",
    "Changing or renewing makes this a new statement. An attached document, and any review of it, belongs to the old one and is removed.",
  ),
  withdraw: c("Ta tillbaka", "Withdraw"),
  withdrawConfirm: c(
    "Ta tillbaka uppgiften? Den gäller inte längre och ett bifogat dokument raderas.",
    "Withdraw the statement? It no longer stands and an attached document is erased.",
  ),
  withdrawYes: c("Ja, ta tillbaka", "Yes, withdraw"),
  withdrawn: c(
    "Återtagen {0}. Uppgiften gäller inte längre.",
    "Withdrawn on {0}. The statement no longer stands.",
  ),
  declareAgain: c("Lämna uppgiften igen", "Make the statement again"),
  remove: c("Radera", "Delete"),
  removeConfirm: c(
    "Radera uppgiften helt? Uppgiften och ett bifogat dokument tas bort och kan inte återställas.",
    "Delete the statement completely? The statement and any attached document are removed and cannot be restored.",
  ),
  removeYes: c("Ja, radera", "Yes, delete"),
  removed: c("Uppgiften är raderad.", "The statement is deleted."),
  working: c("Arbetar…", "Working…"),
} as const;

export const DOCUMENT = {
  heading: c("Stödjande dokument (valfritt)", "Supporting document (optional)"),
  lede: c(
    "Du behöver inte bifoga något. Ett dokument visar bara att du har bifogat det; det gör inte uppgiften verifierad. Dokument av den här typen innehåller ofta mer än uppgiften gäller, till exempel personnummer och adress. Bifoga det bara om du vill att det sparas här.",
    "You do not have to attach anything. A document only shows that you attached it; it does not make the statement verified. Documents of this kind often contain more than the statement is about, such as your identity number and address. Attach one only if you want it stored here.",
  ),
  typeLabel: c("Typ av dokument", "Type of document"),
  issueDateLabel: c("Dokumentets datum", "Date on the document"),
  fileLabel: c("Fil (PDF, JPG eller PNG, högst 8 MB)", "File (PDF, JPG or PNG, 8 MB at most)"),
  upload: c("Bifoga dokument", "Attach document"),
  replace: c("Ersätt dokument", "Replace document"),
  replaceWarning: c(
    "Det nya dokumentet ersätter det gamla, som raderas. En granskning av det gamla följer inte med.",
    "The new document replaces the old one, which is erased. A review of the old one does not carry over.",
  ),
  uploading: c("Bifogar…", "Attaching…"),
  attached: c("Dokumentet är bifogat.", "The document is attached."),
  issued: c("daterat {0}", "dated {0}"),
  download: c("Ladda ner", "Download"),
  removeDoc: c("Ta bort dokumentet", "Remove document"),
  removeDocConfirm: c(
    "Ta bort dokumentet? Filen raderas.",
    "Remove the document? The file is erased.",
  ),
  removeDocYes: c("Ja, ta bort", "Yes, remove"),
  unfinished: c(
    "En uppladdning blev inte klar. Inget dokument är bifogat.",
    "An upload did not finish. No document is attached.",
  ),
  unfinishedRemove: c("Rensa uppladdningen", "Clear the upload"),
  problemType: c("Filen måste vara PDF, JPG eller PNG.", "The file must be a PDF, JPG or PNG."),
  problemSize: c("Filen är större än 8 MB.", "The file is larger than 8 MB."),
  problemEmpty: c("Filen är tom.", "The file is empty."),
  problemDate: c(
    "Ange dokumentets datum. Det kan inte ligga i framtiden.",
    "Enter the date on the document. It cannot be in the future.",
  ),
  reviewRequest: c("Be om granskning av dokumentet", "Ask for the document to be reviewed"),
  reviewRequested: c(
    "Du har bett om granskning. En utsedd granskare kan öppna dokumentet tills du tar tillbaka begäran.",
    "You have asked for a review. An appointed reviewer can open the document until you take the request back.",
  ),
  reviewCancel: c("Ta tillbaka begäran", "Take the request back"),
  reviewNotConfirmed: c(
    "Granskaren kunde inte bekräfta dokumentets typ eller datum.",
    "The reviewer could not confirm the document's type or date.",
  ),
} as const;

export const CLEANUP = {
  pending: c(
    "Åtkomsten är borttagen, men filen är inte bekräftat raderad ännu: {0}",
    "Access has been removed, but the file is not confirmed erased yet: {0}",
  ),
  failed: c(
    "Raderingen av filen misslyckades och är inte klar: {0}",
    "Erasing the file failed and is not complete: {0}",
  ),
  deletionPending: c(
    "Uppgiften är borttagen från din profil. Raderingen är klar först när filen är borta.",
    "The statement has been removed from your profile. The deletion is complete only once the file is gone.",
  ),
  retry: c("Försök radera igen", "Try erasing again"),
  retrying: c("Raderar…", "Erasing…"),
  done: c("Filen är raderad.", "The file is erased."),
  stillOwed: c(
    "Filen är fortfarande inte raderad. Försök igen om en stund.",
    "The file is still not erased. Try again in a moment.",
  ),
} as const;

const GENERIC = c(
  "Det gick inte att spara. Inget har ändrats.",
  "That could not be saved. Nothing has changed.",
);

export const ERRORS: Readonly<Partial<Record<SelfDeclarationError, Copy>>> = {
  VSD_NOT_AUTHENTICATED: c(
    "Du är inte längre inloggad. Logga in igen och försök på nytt.",
    "You are no longer signed in. Sign in again and retry.",
  ),
  VSD_PROCESSING_NOT_AUTHORIZED: c(
    "Den här uppgiften går inte att lämna just nu. Inget har sparats.",
    "This statement cannot be made right now. Nothing was saved.",
  ),
  VSD_AFFIRMATION_REQUIRED: c(
    "Kryssa i att uppgiften är din egen innan du sparar.",
    "Tick that the statement is your own before saving.",
  ),
  VSD_STATEMENT_VERSION_MISMATCH: c(
    "Formuleringen har uppdaterats. Läs in sidan igen.",
    "The wording has been updated. Reload the page.",
  ),
  VSD_INVALID_DATE: c(
    "Datumet måste vara i dag eller högst 31 dagar tillbaka.",
    "The date must be today or at most 31 days back.",
  ),
  VSD_DECLARATION_EXISTS: c(
    "Uppgiften finns redan. Sidan har lästs in på nytt.",
    "This statement already exists. The page has been reloaded.",
  ),
  VSD_STALE_REVISION: c(
    "Uppgiften har ändrats i ett annat fönster. Sidan har lästs in på nytt.",
    "The statement was changed in another window. The page has been reloaded.",
  ),
  VSD_DECLARATION_NOT_FOUND: c(
    "Uppgiften finns inte längre. Sidan har lästs in på nytt.",
    "The statement no longer exists. The page has been reloaded.",
  ),
  VSD_DOCUMENT_NOT_FOUND: c(
    "Dokumentet finns inte längre.",
    "The document is no longer available.",
  ),
  VSD_DOCUMENT_DUPLICATE: c("Samma fil är redan bifogad.", "This same file is already attached."),
  VSD_UPLOAD_FAILED: c(
    "Dokumentet kunde inte bifogas. Inget dokument har sparats.",
    "The document could not be attached. No document was stored.",
  ),
  VSD_UPLOAD_UNCONFIRMED: c(
    "Det gick inte att bekräfta om dokumentet sparades. Försök igen med samma fil, så fortsätter uppladdningen där den var.",
    "It could not be confirmed whether the document was saved. Try again with the same file and the upload continues where it was.",
  ),
  VSD_CONTENT_MISMATCH: c(
    "Filen som togs emot stämde inte med den du valde. Inget dokument har bifogats.",
    "The file that arrived did not match the one you chose. No document was attached.",
  ),
  VSD_CONTENT_UNVERIFIED: c(
    "Filens innehåll kunde inte kontrolleras. Inget dokument har bifogats.",
    "The file's content could not be checked. No document was attached.",
  ),
  VSD_DOCUMENT_ERASURE_FENCED: c(
    "Den uppladdningen har avbrutits. Välj filen igen för att börja om.",
    "That upload was cancelled. Choose the file again to start over.",
  ),
  VSD_FILE_REJECTED: c(
    "Filen kunde inte tas emot. Den måste vara en riktig PDF, JPG eller PNG på högst 8 MB.",
    "The file was not accepted. It must be a real PDF, JPG or PNG of at most 8 MB.",
  ),
  VSD_REVIEW_UNAVAILABLE: c(
    "Granskning går inte att begära för den här uppgiften.",
    "A review cannot be requested for this statement.",
  ),
  VSD_READ_FAILED: SECTION.loadFailed,
};

export function errorCopy(code: SelfDeclarationError): Copy {
  return ERRORS[code] ?? GENERIC;
}

// ── The Security Passport bridge ─────────────────────────────────────────
//
// The words of the shield, the holder's Passport section, the share step and
// the recipient's view (src/components/security-passport/self-declarations).

/** The shield's subject. Short, and never a claim about the person. */
export const SHIELD_SUBJECT: Readonly<Record<DeclarationKind, Copy>> = {
  enforcement_debt_none: c("Kronofogden", "Swedish Enforcement Authority"),
  payment_remarks_none: c("Betalningsanmärkningar", "Payment remarks"),
  criminal_history: c("Brottshistorik", "Criminal history"),
};

export const SHIELD = {
  /** The one label a shield carries, whatever supports the statement. */
  selfDeclared: c("Självdeklarerat", "Self-declared"),
  /** Always shown when a shield is opened. */
  notVerified: c(
    "Uppgiften är lämnad av personen själv och har inte verifierats av CQrityjob.",
    "This statement was made by the person themself and has not been verified by CQrityjob.",
  ),
  show: c("Visa uppgiften", "Show the statement"),
  hide: c("Dölj uppgiften", "Hide the statement"),
  about: c("Uppgiften gäller den {0}", "Statement about {0}"),
  statementDate: c("Uppgiften gäller den", "The statement is about"),
  madeOn: c("Lämnad den", "Made on"),
  jurisdiction: c("Jurisdiktion", "Jurisdiction"),
  scope: c("Omfattning", "Scope"),
  period: c("Granskad period", "Reviewed period"),
  support: c("Underlag", "Supporting material"),
} as const;

export const JURISDICTION_NAME: Readonly<Record<string, Copy>> = {
  SE: c("Sverige", "Sweden"),
};

export const PASSPORT_SECTION = {
  lede: c(
    "Dina egna uppgifter. De är inte meriter, räknas inte in i ditt Security Passport och visas inte för någon annan om du inte själv väljer det för en viss delning.",
    "Your own statements. They are not credentials, do not count toward your Security Passport, and are shown to nobody else unless you choose it for a particular share.",
  ),
  notActivated: c(
    "Funktionen är inte aktiverad. Inget samlas in och inget visas här.",
    "This feature is not activated. Nothing is collected and nothing is shown here.",
  ),
  none: c(
    "Du har inte lämnat någon självdeklaration. Det är helt frivilligt och påverkar ingenting annat.",
    "You have not made any self-declaration. It is entirely voluntary and affects nothing else.",
  ),
  manage: c("Hantera i din profil", "Manage in your profile"),
  readMore: c("Läs mer i din profil", "Read more in your profile"),
  shareable: c(
    "Kan bifogas en delning om du väljer det.",
    "Can accompany a share if you choose it.",
  ),
  notShareable: c(
    "Kan inte delas: delning är inte aktiverad.",
    "Cannot be shared: sharing is not activated.",
  ),
} as const;

export const SHARE = {
  heading: c("Självdeklarationer (valfritt)", "Self-declarations (optional)"),
  lede: c(
    "Inget är förvalt. Kryssa bara i det du vill att just den här länken ska innehålla. Bara en mottagare som är inloggad hos CQrityjob kan se uppgiften; alla andra som öppnar länken ser ditt Security Passport utan den.",
    "Nothing is pre-selected. Tick only what you want this particular link to carry. Only a recipient who is signed in to CQrityjob can see the statement; anyone else who opens the link sees your Security Passport without it.",
  ),
  fixed: c(
    "Valet gäller bara den här länken och kan inte utökas i efterhand. Dina befintliga länkar ändras inte. Du kan när som helst sluta dela en uppgift.",
    "The choice applies to this link only and cannot be widened afterwards. Your existing links do not change. You can stop sharing a statement at any time.",
  ),
  notElsewhere: c(
    "Självdeklarationer följer aldrig med i bilder, förhandsvisningar i sociala medier, ditt CV eller nedladdningar.",
    "Self-declarations never appear in images, social media previews, your CV or downloads.",
  ),
  include: c("Bifoga: {0}", "Include: {0}"),
  previewHeading: c(
    "Exakt det här får en inloggad mottagare se, utöver ditt Security Passport",
    "Exactly this is what a signed-in recipient will see, in addition to your Security Passport",
  ),
  previewLoading: c("Hämtar förhandsvisningen…", "Loading the preview…"),
  previewFailed: c(
    "Förhandsvisningen kunde inte läsas. Ingen självdeklaration bifogas förrän du har kunnat se den. Avmarkera uppgiften för att skapa länken utan den.",
    "The preview could not be loaded. No self-declaration is attached until you have been able to see it. Untick the statement to create the link without it.",
  ),
  attached: c(
    "Självdeklarationen följer med den här länken, för inloggade mottagare.",
    "The self-declaration accompanies this link, for signed-in recipients.",
  ),
  // The link's address is shown once by the database. When the answer that
  // carried it never arrived, the link exists, carries the statement, and
  // cannot be shown again; a reissue carries nothing.
  attachedAddressLost: c(
    "Länken skapades och innehåller självdeklarationen, men svaret med länkens adress kom aldrig fram och adressen kan inte visas igen. En länk som du skapar på nytt innehåller inte självdeklarationen. Återkalla den här länken i listan nedan och skapa en ny om du vill dela uppgiften.",
    "The link was created and carries the self-declaration, but the answer with the link's address never arrived and the address cannot be shown again. A link that you issue again does not carry the self-declaration. Revoke this link in the list below and create a new one if you want to share the statement.",
  ),
  // Said only when the DATABASE refused: the link and the choice are one
  // operation, so a refusal leaves neither.
  refused: c(
    "Ingen länk skapades och ingen självdeklaration delades.",
    "No link was created and no self-declaration was shared.",
  ),
  refusedChanged: c(
    "Uppgiften har ändrats sedan du såg förhandsvisningen. Ingen länk skapades och ingen självdeklaration delades. Kontrollera förhandsvisningen och skapa länken igen.",
    "The statement has changed since you saw the preview. No link was created and no self-declaration was shared. Check the preview and create the link again.",
  ),
  refusedNotShareable: c(
    "Självdeklarationen kan inte delas just nu. Ingen länk skapades och ingen självdeklaration delades.",
    "The self-declaration cannot be shared right now. No link was created and no self-declaration was shared.",
  ),
  createdWithout: c(
    "En länk finns redan för det här försöket och den skapades utan självdeklaration. Den kan inte få någon i efterhand. Skapa en ny länk om du vill dela uppgiften.",
    "A link already exists for this attempt and it was created without a self-declaration. It cannot be given one afterwards. Create a new link if you want to share the statement.",
  ),
  // Never "nothing was shared": that is not known.
  unconfirmed: c(
    "Vi fick inget svar och vet därför inte om länken skapades eller om självdeklarationen delas. Försök igen: då kontrolleras samma länk och samma val. Ingenting skapas två gånger och valet kan inte utökas.",
    "We received no answer, so we do not know whether the link was created or whether the self-declaration is shared. Try again: the same link and the same choice are then checked. Nothing is created twice and the choice cannot be widened.",
  ),
  unconfirmedPlain: c(
    "Vi fick inget svar och vet därför inte om länken skapades. Försök igen: då kontrolleras samma länk. Ingenting skapas två gånger.",
    "We received no answer, so we do not know whether the link was created. Try again: the same link is then checked. Nothing is created twice.",
  ),
  retry: c("Kontrollera och försök igen", "Check and try again"),
  settling: c("Kontrollerar…", "Checking…"),
  // A separate fact from whether the statement is shared.
  listStale: c(
    "Listan över dina delade självdeklarationer kunde inte uppdateras. Det ändrar inte vad som delas.",
    "The list of your shared self-declarations could not be updated. That does not change what is shared.",
  ),
  refreshList: c("Uppdatera listan", "Update the list"),
  listHeading: c("Självdeklarationer i dina länkar", "Self-declarations on your links"),
  listLede: c(
    "En länk som du skapar på nytt innehåller ingen självdeklaration.",
    "A link that you issue again carries no self-declaration.",
  ),
  linkCreated: c("Länk skapad {0}", "Link created {0}"),
  active: c("Delas med inloggade mottagare", "Shared with signed-in recipients"),
  ended: c("Delas inte längre", "No longer shared"),
  opened: c("Öppnad {0} gånger", "Opened {0} times"),
  stop: c("Sluta dela", "Stop sharing"),
  stopping: c("Slutar dela…", "Stopping…"),
  stopFailed: c(
    "Det gick inte att sluta dela just nu. Uppgiften delas fortfarande. Försök igen.",
    "Sharing could not be stopped just now. The statement is still shared. Try again.",
  ),
} as const;

export const RECIPIENT = {
  heading: c("Personens egna uppgifter", "The person's own statements"),
  lede: c(
    "Personen har valt att dela följande med dig. Det är självdeklarationer: inte meriter och inte kontrollerade uppgifter.",
    "The person chose to share the following with you. These are self-declarations: not credentials and not checked facts.",
  ),
} as const;
