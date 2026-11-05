// India entry — domain-local copy, English first, Swedish kept.
//
// Same isolation decision as src/lib/security-passport/i18n.ts: the central
// dictionary is a high-conflict shared file, so the India journey carries its
// own flat, dotted catalogue. `sv` is typed against `en`, so a missing key is
// a compile error; scripts/india-entry-check.ts rejects empty strings and the
// claims this journey may never make.
//
// ── WHAT THIS COPY MAY NOT SAY ─────────────────────────────────────────
//
// * that anybody is guaranteed a job, a visa, sponsorship or verification;
// * that CQrityjob partners with any employer, agency or government body;
// * a number of candidates, employers or placements, or a testimonial;
// * that an Indian qualification replaces SIRA training or a SIRA card, or
//   that there is a personal "PSARA licence";
// * that anybody is "Dubai-ready", or any score of readiness;
// * that HAYAT reads Hindi or any script it has not been tested on.
//
// Every example person and credential is labelled fictional where it appears.

export type IndiaLang = "en" | "sv";

const en = {
  // ── Landing page ─────────────────────────────────────────────────────
  "landing.meta.title": "Security Passport for security professionals in India — CQrityjob",
  "landing.meta.description":
    "Collect your Indian and international security qualifications in one Security Passport, use HAYAT to help read supported documents, and choose what prospective employers see.",
  "landing.eyebrow": "Security Passport · India",
  "landing.title": "Your security qualifications, in one place",
  "landing.lead":
    "Build a Security Passport with your Indian and international security qualifications, and decide what prospective employers see — including employers in Dubai.",
  "landing.cta.create": "Create my Security Passport",
  "landing.cta.example": "See an example",
  "landing.cta.note":
    "You need an account. No CV, identity document, payment or verification is needed to start.",
  "landing.what.title": "What you can do",
  "landing.what.collect.title": "Collect your qualifications in one place",
  "landing.what.collect.body":
    "Keep your security certificates together, with their numbers and dates, in a Passport that stays private until you share it.",
  "landing.what.add.title": "Add Indian and international credentials",
  "landing.what.add.body":
    "Choose from a governed catalogue: Indian NSQF security qualifications and international certifications such as ASIS and ISC2.",
  "landing.what.hayat.title": "HAYAT helps read your documents",
  "landing.what.hayat.body":
    "HAYAT reads supported PDF and image certificates in your browser and suggests the number and dates. You confirm every value. Reading a document is not verification.",
  "landing.what.share.title": "You choose what to share",
  "landing.what.share.body":
    "Select the credentials an employer sees and send a time-limited link. You can revoke it at any time. Your documents are never part of a share.",
  "landing.catalogue.title": "Indian qualifications you can add today",
  "landing.catalogue.body":
    "National qualifications on India's National Qualifications Register, awarded under the Management & Entrepreneurship and Professional Skills Council (MEPSC):",
  "landing.catalogue.nq":
    "These are qualifications. They are not licences and do not by themselves give anyone the right to work.",
  "landing.catalogue.psara":
    "The Private Security Agencies (Regulation) Act licenses security agencies, not individual guards, so there is no personal “PSARA licence” to add. Armed-security permissions are not part of this release.",
  "landing.catalogue.intl":
    "International certifications, for example ASIS CPP, PSP and APP, and ISC2 and ISACA certifications, can be added too.",
  "landing.dubai.title": "Thinking about work in Dubai?",
  "landing.dubai.body1":
    "Dubai has its own licensing and employment requirements. Private security work there requires a Security Cadre Card from the Security Industry Regulatory Agency (SIRA), applied for through a licensed security company, and SIRA-approved training.",
  "landing.dubai.body2":
    "An Indian qualification does not replace SIRA training or licensing. Your Passport helps you present what you already hold. It is not a visa, a work permit or a job offer.",
  "landing.dubai.link": "SIRA: Security Cadre Card (official)",
  "landing.example.title": "An example Passport",
  "landing.example.label": "Example",
  "landing.example.caption":
    "A fictional person with fictional credentials, shown the way a new Passport looks: every credential is registered by its holder until it is reviewed.",
  "landing.example.name": "Example Holder",
  "landing.example.status": "Registered by holder",
  "landing.how.title": "How it starts",
  "landing.how.1": "Create an account and confirm your email address.",
  "landing.how.2": "Confirm your name, current work and where you live.",
  "landing.how.3": "Optionally, choose where you would like to work.",
  "landing.how.4": "Add your first credential now, or later.",
  "landing.invite.title": "Know someone who works in security?",
  "landing.invite.body": "Share this page. It carries nothing about you.",
  "landing.invite.share": "Share this page",
  "landing.invite.copy": "Copy link",
  "landing.invite.copied": "Link copied",
  "landing.invite.failed": "Could not copy. Select the address in your browser instead.",
  "landing.truth.title": "Good to know",
  "landing.truth.1":
    "Verification is not automatic. A credential shows what it is — registered by you, with a document, or reviewed — and you can share it at any stage.",
  "landing.truth.2":
    "CQrityjob does not guarantee a job, a visa or a verification result, and does not act as a recruitment agent.",
  "landing.truth.3":
    "HAYAT currently reads English and Swedish text. Documents in other languages or scripts can still be added and completed by hand.",
  "landing.signin": "Already have an account? Sign in",
  "landing.catalogue.source": "MEPSC — security occupational standards (official)",

  // ── Setup (after sign-up) ────────────────────────────────────────────
  "setup.title": "Set up your Security Passport",
  "setup.lead": "Four short steps. You can stop at any time and continue later.",
  "setup.step": "Step",
  "setup.of": "of",
  "setup.saving": "Saving…",
  "setup.saved": "Saved",
  "setup.error": "That could not be saved. What you entered is still here — try again.",
  "setup.loadError": "Your setup could not be loaded.",
  "setup.retry": "Try again",
  "setup.loading": "Loading your setup…",
  "setup.continue": "Save and continue",
  "setup.back": "Back",
  "setup.skip": "Skip for now",
  "setup.later": "Finish later",
  "setup.name.title": "Your name and current work",
  "setup.name.name": "Display name",
  "setup.name.nameHelp":
    "Write your name the way you use it, in any script. It is compared with names on documents only as a consistency check.",
  "setup.name.occupation": "Current occupation",
  "setup.name.occupationPlaceholder": "Choose your occupation",
  "setup.name.occupationOther": "Other — write it",
  "setup.name.occupationOtherPlaceholder": "For example: Security guard at a residential site",
  "setup.name.required": "Enter a name of at least two characters.",
  "setup.location.title": "Where you live now",
  "setup.location.country": "Country of residence",
  "setup.location.locality": "City or state (optional)",
  "setup.location.help":
    "Where you live is not your nationality and not a permission to work anywhere. We never ask for your nationality or immigration status here.",
  "setup.location.prefilled": "Preselected from the India page. Change it if it is not right.",
  "setup.location.required": "Choose a country.",
  "setup.dest.title": "Where would you like to work? (optional)",
  "setup.dest.help":
    "A preference only. It does not change your current country, your credentials or what you can record.",
  "setup.dest.interest": "Are you looking for work abroad?",
  "setup.dest.interest.none": "Not stated",
  "setup.dest.interest.not_looking": "Not looking",
  "setup.dest.interest.open": "Open to it",
  "setup.dest.interest.actively_looking": "Actively looking",
  "setup.first.title": "Add your first credential",
  "setup.first.body":
    "Choose an Indian qualification or an international certification from the catalogue. A document is optional, and HAYAT can help read it.",
  "setup.first.add": "Add a credential",
  "setup.first.skip": "Go to my Passport",
  "setup.passport.creating": "Creating your Passport…",
  "setup.passport.failed": "Your Passport could not be created. Try again.",
  // ── The last step: review, declare, complete ─────────────────────────
  "setup.finish.title": "Review and complete your Passport",
  "setup.finish.lead":
    "Check what you have registered. Your Passport is complete when you confirm it yourself.",
  "setup.finish.summary": "What you have registered",
  "setup.finish.summary.name": "Name",
  "setup.finish.summary.occupation": "Current occupation",
  "setup.finish.summary.residence": "Lives in",
  "setup.finish.summary.destinations": "Would like to work in",
  "setup.finish.summary.notStated": "Not stated",
  "setup.finish.summary.credentials": "Passport credentials",
  "setup.finish.summary.employments": "Employment",
  "setup.finish.summary.none": "None yet",
  "setup.finish.edit": "Change",
  "setup.finish.declare.legend": "Your declaration",
  "setup.finish.declare.help":
    "Only you can make this declaration, and the box is never ticked for you. It is recorded with the date you complete.",
  "setup.finish.declare.required": "Tick the box to make your declaration before you complete.",
  "setup.finish.complete": "Complete my Passport",
  "setup.finish.completing": "Completing your Passport…",
  "setup.finish.noMerit.title": "Add a current merit to complete your Passport",
  "setup.finish.noMerit.body":
    "A Passport is completed with at least one current Passport credential — a certificate, a licence or a training from the catalogue — or an employment.",
  "setup.finish.noMerit.drafts":
    "You have unfinished drafts. A draft counts once you have finished it.",
  "setup.finish.noMerit.cv":
    "Entries in your CV, such as courses, education or skills, do not complete a Passport.",
  "setup.finish.addEmployment": "Add an employment",
  "setup.finish.error.noMerit":
    "Your Passport has no current merit any more, so it was not completed. Add one and complete again.",
  "setup.finish.error.signedOut": "You are signed out. Sign in again to complete your Passport.",
  "setup.finish.error.signIn": "Sign in",
  "setup.finish.error.failed": "Your Passport could not be completed. Try again.",
  "setup.finish.error.unknown":
    "We could not confirm whether your Passport was completed. Try again — a Passport is only ever completed once.",
  "setup.finish.done.title": "Your Passport is complete",
  "setup.finish.done.body": "You can add, correct and share credentials at any time.",
  "setup.finish.done.number": "Your Passport number",
  "setup.finish.done.numberNote": "The number is yours and does not change.",
  "setup.finish.done.numberLoading": "Fetching your Passport number…",
  "setup.finish.done.numberError": "Your Passport number could not be fetched.",
  "setup.finish.done.noNumber":
    "This account is not given a public Passport number, for example because it is a test or staff account.",
  "setup.finish.done.open": "Open my Passport",

  // ── Destinations ─────────────────────────────────────────────────────
  "dest.IN": "India",
  "dest.AE-DU": "Dubai, United Arab Emirates",
  "dest.AE": "Other emirates, United Arab Emirates",
  "dest.GB": "United Kingdom",
  "dest.SE": "Sweden",
  "dest.US": "United States",

  // ── Destination next steps ──────────────────────────────────────────
  "check.title": "Next steps for Dubai",
  "check.lead":
    "A checklist, not a score. Requirements are set by Dubai's authorities and employers, and can change.",
  "check.recorded.title": "Recorded in your Passport",
  "check.recorded.none": "No current credential yet.",
  "check.recorded.note":
    "These are what you hold. None of them is a SIRA card or a permission to work in Dubai.",
  "check.needed.title": "Usually still needed for security work in Dubai",
  "check.needed.training":
    "SIRA-approved training for your role, from a SIRA-approved training centre",
  "check.needed.card":
    "A SIRA Security Cadre Card, applied for through the licensed security company that employs you",
  "check.needed.conduct": "A certificate of good conduct issued by Dubai Police",
  "check.needed.medical": "Medical and fitness certificates where your role requires them",
  "check.external.title": "To confirm with your employer and official sources",
  "check.external.residency":
    "Employment, residency visa and Emirates ID: arranged with the employing company, under UAE rules",
  "check.external.recognition":
    "Whether any of your existing qualifications is accepted towards a requirement",
  "check.notReplace":
    "An Indian qualification does not replace SIRA training or a SIRA card. CQrityjob does not decide eligibility or immigration.",
  "check.source": "Official guidance: SIRA Security Cadre Card",
  "check.checked": "Guidance summarised from the official pages, checked 26 September 2026.",
  "check.uk.title": "Next steps for the United Kingdom",
  "check.uk.body1":
    "Front-line security work in the UK generally needs a licence from the Security Industry Authority (SIA), which requires the licence-linked training for that activity and identity and criminal-record checks.",
  "check.uk.body2":
    "Security guards and related occupations (UK occupation code 9231, which includes CCTV operators) are listed as ineligible for the Skilled Worker visa. Check the UK government's current rules before planning a move.",
  "check.uk.sia": "SIA: apply for an SIA licence (official)",
  "check.uk.visa": "GOV.UK: Skilled Worker eligible occupations (official)",
  "check.addCredential": "Add a credential",
  "check.editDestinations": "Change destinations",
} as const;

export type IndiaCopyKey = keyof typeof en;

const sv: Record<IndiaCopyKey, string> = {
  "landing.meta.title": "Security Passport för säkerhetsyrkesverksamma i Indien — CQrityjob",
  "landing.meta.description":
    "Samla dina indiska och internationella säkerhetskvalifikationer i ett Security Passport, låt HAYAT hjälpa till att läsa dokument som stöds och välj vad arbetsgivare får se.",
  "landing.eyebrow": "Security Passport · Indien",
  "landing.title": "Dina säkerhetskvalifikationer på ett ställe",
  "landing.lead":
    "Bygg ett Security Passport med dina indiska och internationella säkerhetskvalifikationer och bestäm själv vad arbetsgivare får se — också arbetsgivare i Dubai.",
  "landing.cta.create": "Skapa mitt Security Passport",
  "landing.cta.example": "Se ett exempel",
  "landing.cta.note":
    "Du behöver ett konto. Inget CV, ingen id-handling, ingen betalning och ingen verifiering krävs för att börja.",
  "landing.what.title": "Det här kan du göra",
  "landing.what.collect.title": "Samla dina kvalifikationer på ett ställe",
  "landing.what.collect.body":
    "Håll ihop dina säkerhetsintyg, med nummer och datum, i ett Passport som är privat tills du delar det.",
  "landing.what.add.title": "Lägg till indiska och internationella meriter",
  "landing.what.add.body":
    "Välj ur en styrd katalog: indiska NSQF-kvalifikationer inom säkerhet och internationella certifieringar som ASIS och ISC2.",
  "landing.what.hayat.title": "HAYAT hjälper dig läsa dokumenten",
  "landing.what.hayat.body":
    "HAYAT läser intyg i PDF- och bildformat som stöds i din webbläsare och föreslår nummer och datum. Du bekräftar varje värde. Att läsa ett dokument är inte verifiering.",
  "landing.what.share.title": "Du väljer vad som delas",
  "landing.what.share.body":
    "Välj vilka meriter en arbetsgivare ser och skicka en tidsbegränsad länk. Du kan återkalla den när som helst. Dina dokument ingår aldrig i en delning.",
  "landing.catalogue.title": "Indiska kvalifikationer du kan lägga till i dag",
  "landing.catalogue.body":
    "Nationella kvalifikationer i Indiens nationella kvalifikationsregister, utfärdade inom Management & Entrepreneurship and Professional Skills Council (MEPSC):",
  "landing.catalogue.nq":
    "Det här är kvalifikationer. De är inte licenser och ger i sig ingen rätt att arbeta.",
  "landing.catalogue.psara":
    "Private Security Agencies (Regulation) Act ger tillstånd till säkerhetsföretag, inte till enskilda väktare, så det finns ingen personlig ”PSARA-licens” att lägga till. Tillstånd för beväpnad bevakning ingår inte.",
  "landing.catalogue.intl":
    "Internationella certifieringar, till exempel ASIS CPP, PSP och APP samt certifieringar från ISC2 och ISACA, kan också läggas till.",
  "landing.dubai.title": "Funderar du på att arbeta i Dubai?",
  "landing.dubai.body1":
    "Dubai har egna krav på licenser och anställning. Privat säkerhetsarbete där kräver ett Security Cadre Card från Security Industry Regulatory Agency (SIRA), som söks via ett licensierat säkerhetsföretag, och utbildning som SIRA har godkänt.",
  "landing.dubai.body2":
    "En indisk kvalifikation ersätter inte SIRA:s utbildning eller licens. Ditt Passport hjälper dig att visa det du redan har. Det är inte ett visum, ett arbetstillstånd eller ett jobberbjudande.",
  "landing.dubai.link": "SIRA: Security Cadre Card (officiell sida)",
  "landing.example.title": "Ett exempel på ett Passport",
  "landing.example.label": "Exempel",
  "landing.example.caption":
    "En påhittad person med påhittade meriter, visad så som ett nytt Passport ser ut: varje merit är registrerad av innehavaren tills den har granskats.",
  "landing.example.name": "Exempelperson",
  "landing.example.status": "Registrerad av innehavaren",
  "landing.how.title": "Så börjar du",
  "landing.how.1": "Skapa ett konto och bekräfta din e-postadress.",
  "landing.how.2": "Bekräfta ditt namn, ditt nuvarande arbete och var du bor.",
  "landing.how.3": "Välj om du vill var du skulle vilja arbeta.",
  "landing.how.4": "Lägg till din första merit nu eller senare.",
  "landing.invite.title": "Känner du någon som arbetar inom säkerhet?",
  "landing.invite.body": "Dela den här sidan. Den innehåller ingenting om dig.",
  "landing.invite.share": "Dela sidan",
  "landing.invite.copy": "Kopiera länk",
  "landing.invite.copied": "Länken är kopierad",
  "landing.invite.failed": "Det gick inte att kopiera. Markera adressen i webbläsaren i stället.",
  "landing.truth.title": "Bra att veta",
  "landing.truth.1":
    "Verifiering sker inte automatiskt. En merit visar vad den är — registrerad av dig, med dokument eller granskad — och du kan dela den i alla lägen.",
  "landing.truth.2":
    "CQrityjob garanterar inget jobb, inget visum och inget verifieringsresultat, och agerar inte rekryteringsagent.",
  "landing.truth.3":
    "HAYAT läser i dag engelsk och svensk text. Dokument på andra språk eller i andra skriftsystem kan ändå läggas till och fyllas i för hand.",
  "landing.signin": "Har du redan ett konto? Logga in",
  "landing.catalogue.source": "MEPSC — yrkesstandarder inom säkerhet (officiell sida)",
  "setup.title": "Kom igång med ditt Security Passport",
  "setup.lead": "Fyra korta steg. Du kan avbryta när som helst och fortsätta senare.",
  "setup.step": "Steg",
  "setup.of": "av",
  "setup.saving": "Sparar…",
  "setup.saved": "Sparat",
  "setup.error": "Det gick inte att spara. Det du skrev finns kvar — försök igen.",
  "setup.loadError": "Det gick inte att läsa in dina uppgifter.",
  "setup.retry": "Försök igen",
  "setup.loading": "Läser in…",
  "setup.continue": "Spara och fortsätt",
  "setup.back": "Tillbaka",
  "setup.skip": "Hoppa över",
  "setup.later": "Fortsätt senare",
  "setup.name.title": "Ditt namn och nuvarande arbete",
  "setup.name.name": "Visningsnamn",
  "setup.name.nameHelp":
    "Skriv namnet så som du använder det, i vilket skriftsystem som helst. Det jämförs med namn i dokument bara som en rimlighetskontroll.",
  "setup.name.occupation": "Nuvarande yrke",
  "setup.name.occupationPlaceholder": "Välj ditt yrke",
  "setup.name.occupationOther": "Annat — skriv själv",
  "setup.name.occupationOtherPlaceholder": "Till exempel: väktare på ett bostadsområde",
  "setup.name.required": "Ange ett namn med minst två tecken.",
  "setup.location.title": "Var du bor nu",
  "setup.location.country": "Bosättningsland",
  "setup.location.locality": "Stad eller delstat (valfritt)",
  "setup.location.help":
    "Var du bor är inte ditt medborgarskap och inget tillstånd att arbeta någonstans. Vi frågar aldrig om medborgarskap eller uppehållsstatus här.",
  "setup.location.prefilled": "Förvalt från Indien-sidan. Ändra om det inte stämmer.",
  "setup.location.required": "Välj ett land.",
  "setup.dest.title": "Var skulle du vilja arbeta? (valfritt)",
  "setup.dest.help":
    "Bara en önskan. Den ändrar inte ditt nuvarande land, dina meriter eller vad du kan registrera.",
  "setup.dest.interest": "Söker du arbete utomlands?",
  "setup.dest.interest.none": "Inte angivet",
  "setup.dest.interest.not_looking": "Söker inte",
  "setup.dest.interest.open": "Öppen för det",
  "setup.dest.interest.actively_looking": "Söker aktivt",
  "setup.first.title": "Lägg till din första merit",
  "setup.first.body":
    "Välj en indisk kvalifikation eller en internationell certifiering ur katalogen. Ett dokument är valfritt, och HAYAT kan hjälpa till att läsa det.",
  "setup.first.add": "Lägg till merit",
  "setup.first.skip": "Till mitt Passport",
  "setup.passport.creating": "Skapar ditt Passport…",
  "setup.passport.failed": "Det gick inte att skapa ditt Passport. Försök igen.",
  "setup.finish.title": "Granska och slutför ditt Passport",
  "setup.finish.lead":
    "Kontrollera det du har registrerat. Ditt Passport är slutfört när du själv har intygat uppgifterna.",
  "setup.finish.summary": "Det här har du registrerat",
  "setup.finish.summary.name": "Namn",
  "setup.finish.summary.occupation": "Nuvarande yrke",
  "setup.finish.summary.residence": "Bor i",
  "setup.finish.summary.destinations": "Vill arbeta i",
  "setup.finish.summary.notStated": "Inte angivet",
  "setup.finish.summary.credentials": "Passport-meriter",
  "setup.finish.summary.employments": "Anställningar",
  "setup.finish.summary.none": "Inga ännu",
  "setup.finish.edit": "Ändra",
  "setup.finish.declare.legend": "Ditt intygande",
  "setup.finish.declare.help":
    "Det är bara du som kan intyga detta, och rutan är aldrig ikryssad åt dig. Intygandet sparas med det datum du slutför.",
  "setup.finish.declare.required": "Kryssa i rutan för att intyga innan du slutför.",
  "setup.finish.complete": "Slutför mitt Passport",
  "setup.finish.completing": "Slutför ditt Passport…",
  "setup.finish.noMerit.title": "Lägg till en aktuell merit för att slutföra ditt Passport",
  "setup.finish.noMerit.body":
    "Ett Passport slutförs med minst en aktuell Passport-merit – ett certifikat, en licens eller en utbildning ur katalogen – eller en anställning.",
  "setup.finish.noMerit.drafts":
    "Du har utkast som inte är färdiga. Ett utkast räknas först när du har gjort klart det.",
  "setup.finish.noMerit.cv":
    "Poster i ditt CV, till exempel kurser, utbildningar eller färdigheter, räcker inte för att slutföra ett Passport.",
  "setup.finish.addEmployment": "Lägg till anställning",
  "setup.finish.error.noMerit":
    "Ditt Passport har inte längre någon aktuell merit, så det slutfördes inte. Lägg till en och slutför igen.",
  "setup.finish.error.signedOut": "Du är utloggad. Logga in igen för att slutföra ditt Passport.",
  "setup.finish.error.signIn": "Logga in",
  "setup.finish.error.failed": "Det gick inte att slutföra ditt Passport. Försök igen.",
  "setup.finish.error.unknown":
    "Vi kunde inte bekräfta om ditt Passport slutfördes. Försök igen – ett Passport slutförs bara en gång.",
  "setup.finish.done.title": "Ditt Passport är slutfört",
  "setup.finish.done.body": "Du kan lägga till, rätta och dela meriter när som helst.",
  "setup.finish.done.number": "Ditt Passport-nummer",
  "setup.finish.done.numberNote": "Numret är ditt och ändras inte.",
  "setup.finish.done.numberLoading": "Hämtar ditt Passport-nummer…",
  "setup.finish.done.numberError": "Det gick inte att hämta ditt Passport-nummer.",
  "setup.finish.done.noNumber":
    "Det här kontot får inget publikt Passport-nummer, till exempel för att det är ett test- eller personalkonto.",
  "setup.finish.done.open": "Öppna mitt Passport",
  "dest.IN": "Indien",
  "dest.AE-DU": "Dubai, Förenade Arabemiraten",
  "dest.AE": "Övriga emirat, Förenade Arabemiraten",
  "dest.GB": "Storbritannien",
  "dest.SE": "Sverige",
  "dest.US": "USA",
  "check.title": "Nästa steg för Dubai",
  "check.lead":
    "En checklista, inte ett betyg. Kraven bestäms av Dubais myndigheter och arbetsgivare och kan ändras.",
  "check.recorded.title": "Registrerat i ditt Passport",
  "check.recorded.none": "Ingen aktuell merit ännu.",
  "check.recorded.note":
    "Det här är vad du har. Inget av det är ett SIRA-kort eller ett tillstånd att arbeta i Dubai.",
  "check.needed.title": "Behövs vanligtvis också för säkerhetsarbete i Dubai",
  "check.needed.training":
    "Utbildning för din roll från ett utbildningscenter som SIRA har godkänt",
  "check.needed.card":
    "Ett SIRA Security Cadre Card, som söks via det licensierade säkerhetsföretag som anställer dig",
  "check.needed.conduct": "Ett intyg om gott uppförande utfärdat av Dubais polis",
  "check.needed.medical": "Läkar- och fysikintyg där din roll kräver det",
  "check.external.title": "Att bekräfta med arbetsgivaren och officiella källor",
  "check.external.residency":
    "Anställning, uppehållsvisum och Emirates ID: ordnas med det anställande företaget enligt emiratens regler",
  "check.external.recognition": "Om någon av dina befintliga kvalifikationer godtas för ett krav",
  "check.notReplace":
    "En indisk kvalifikation ersätter inte SIRA:s utbildning eller kort. CQrityjob avgör inte behörighet eller migration.",
  "check.source": "Officiell vägledning: SIRA Security Cadre Card",
  "check.checked": "Sammanfattat från de officiella sidorna, kontrollerade 26 september 2026.",
  "check.uk.title": "Nästa steg för Storbritannien",
  "check.uk.body1":
    "Säkerhetsarbete i frontlinjen i Storbritannien kräver i regel en licens från Security Industry Authority (SIA), med den licenskopplade utbildningen för verksamheten och kontroll av identitet och belastningsregister.",
  "check.uk.body2":
    "Väktare och närliggande yrken (brittisk yrkeskod 9231, som omfattar CCTV-operatörer) är uppförda som ej berättigade till Skilled Worker-visum. Kontrollera den brittiska regeringens aktuella regler innan du planerar en flytt.",
  "check.uk.sia": "SIA: ansök om en SIA-licens (officiell sida)",
  "check.uk.visa": "GOV.UK: yrken som kan få Skilled Worker-visum (officiell sida)",
  "check.addCredential": "Lägg till merit",
  "check.editDestinations": "Ändra önskade länder",
};

export const indiaCopy: Readonly<Record<IndiaLang, Record<IndiaCopyKey, string>>> = { en, sv };

export function indiaT(key: IndiaCopyKey, lang: IndiaLang): string {
  return indiaCopy[lang][key] ?? indiaCopy.en[key];
}

/** The official sources the journey links to. One place, pinned by the check. */
export const INDIA_ENTRY_SOURCES = {
  siraCadreCard: "https://www.sira.gov.ae/en/services/security-cadre-card",
  siaLicence: "https://www.gov.uk/guidance/apply-for-an-sia-licence",
  skilledWorkerOccupations:
    "https://www.gov.uk/government/publications/skilled-worker-visa-eligible-occupations/skilled-worker-visa-eligible-occupations-and-codes",
  mepscSecurity: "https://www.mepsc.in/occupational_standar/security/",
  nqr: "https://www.nqr.gov.in/",
} as const;
