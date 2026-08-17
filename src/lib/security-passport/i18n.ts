// Security Passport — domain-local Swedish/English copy.
//
// ── WHY THIS IS NOT IN src/i18n/dictionaries.ts ────────────────────────
//
// Owner decision, Phase 1: the central dictionary is a high-conflict shared
// file that the connected Lovable environment is actively rewriting (the
// six commits between 2e5ad3b and 7aa4105 touch it twice), and Career
// Discovery / Career Card must stay untouched. Adding ~200 Passport keys to
// it would put this prototype directly in the path of that churn.
//
// This is an ISOLATION decision for the prototype, not a final production
// i18n architecture. The shape deliberately mirrors `dictionaries.ts`
// (flat, dotted, string-valued, one object per locale) so folding it into
// the central dictionary later is mechanical.
//
// ── PARITY IS ENFORCED TWICE ───────────────────────────────────────────
//
// 1. At compile time: `en` is typed `Record<PassportCopyKey, string>`, so a
//    missing English key is a type error, not a runtime surprise.
// 2. At check time: scripts/passport-fixture-check.ts additionally rejects
//    extra English keys and empty strings, which the type cannot catch.
//
// No user-facing Passport text may exist outside this file.

export type PassportLang = "sv" | "en";

const sv = {
  // ── Prototype harness ────────────────────────────────────────────────
  "proto.banner.title": "Utvecklingsprototyp — Security Passport",
  "proto.banner.body":
    "Fiktiv testdata. Inget sparas, ingen databas används och inget av detta är produktion. Endast för intern granskning.",
  "proto.screen": "Skärm",
  "proto.persona": "Testperson",
  "proto.language": "Språk",
  "proto.reset": "Nollställ prototypen",
  "proto.resetDone": "Prototypen är nollställd.",
  "proto.back": "Tillbaka",

  // ── Screen names (harness navigation) ────────────────────────────────
  "screen.home": "Kandidathem (mockup)",
  "screen.welcome": "Välkommen och syfte",
  "screen.onboarding": "Kom igång",
  "screen.overview": "Mitt Security Passport",
  "screen.timeline": "Erfarenhetslinje",
  "screen.card": "Passport Card",
  "screen.share": "Dela",
  "screen.shareHistory": "Delningshistorik",
  "screen.recipient": "Mottagarens vy",
  "screen.privacy": "Integritet",
  "screen.studio": "Kortstudio",

  // ── Candidate home mock ──────────────────────────────────────────────
  "home.title": "Min karriär",
  "home.intro": "Två separata produkter, samma inloggning.",
  "home.careerCard.title": "Career Card",
  "home.careerCard.tagline": "Ditt resultat från Karriärutforskning.",
  "home.careerCard.body":
    "Vägledning om vad som kan passa dig. Oförändrad i den här fasen — visas här endast som en angränsande produkt.",
  "home.careerCard.unchanged": "Oförändrad produkt",
  "home.careerCard.none": "Du har inget resultat ännu.",
  "home.passport.title": "Security Passport",
  "home.passport.tagline": "Din yrkesidentitet och dina bevis inom säkerhet.",
  "home.passport.body":
    "Vad du har gjort, lärt dig och fått verifierat. Du bestämmer själv vad som delas.",
  "home.passport.start": "Starta Security Passport",
  "home.passport.continue": "Fortsätt",
  "home.passport.addExperience": "Lägg till erfarenhet",
  "home.passport.addTraining": "Lägg till utbildning eller certifiering",
  "home.passport.manageShares": "Hantera delningar",

  // ── Welcome and purpose ──────────────────────────────────────────────
  "welcome.eyebrow": "Security Passport",
  "welcome.title": "Din yrkesidentitet inom säkerhet",
  "welcome.lead":
    "Security Passport samlar det du har gjort, lärt dig och fått verifierat under din yrkesbana — och växer med dig genom hela karriären.",
  "welcome.isTitle": "Det här är Security Passport",
  "welcome.is1":
    "En strukturerad yrkeshistorik: anställningar, utbildning, certifieringar och behörigheter.",
  "welcome.is2": "Privat som standard. Ingenting visas för någon förrän du själv delar det.",
  "welcome.is3":
    "Ett underlag som du kan dela i ett avgränsat paket, med utgångsdatum, och återkalla när du vill.",
  "welcome.isNotTitle": "Det här är inte Security Passport",
  "welcome.isNot1": "Det är inget prov och ingen bedömning av dig som person.",
  "welcome.isNot2": "Det finns inget samlat betyg, ingen poäng och ingen rangordning av människor.",
  "welcome.isNot3": "Det är ingen bakgrundskontroll och innehåller aldrig uppgifter om brott.",
  "welcome.rulesTitle": "Två regler som gäller hela tiden",
  "welcome.rule1":
    "Du kan aldrig verifiera dina egna uppgifter. Det du själv fyller i är egenrapporterat — inte verifierat.",
  "welcome.rule2":
    "Bara en behörig arbetsgivare, utbildningsanordnare eller utfärdare kan göra en uppgift verifierad.",
  "welcome.start": "Kom igång",
  "welcome.resume": "Fortsätt där du slutade",

  // ── Onboarding ───────────────────────────────────────────────────────
  "onboarding.title": "Bygg ditt Security Passport",
  "onboarding.step": "Steg",
  "onboarding.of": "av",
  "onboarding.required": "Obligatorisk",
  "onboarding.optional": "Frivillig",
  "onboarding.why": "Varför vi frågar",
  "onboarding.continue": "Fortsätt",
  "onboarding.back": "Tillbaka",
  "onboarding.skip": "Hoppa över",
  "onboarding.saveExit": "Spara och avsluta",
  "onboarding.saved": "Sparat",
  "onboarding.savedAt": "Sparat automatiskt",
  "onboarding.createsClaim":
    "Ditt svar skapas som EGENRAPPORTERAD uppgift. Det betyder att det kommer från dig och ännu inte är verifierat av någon annan.",
  "onboarding.finish": "Granska och slutför",

  "onboarding.purpose.title": "Syfte och integritet",
  "onboarding.purpose.body":
    "Vi frågar bara om sådant som hör till ditt yrkesliv inom säkerhet. Allt är privat tills du själv väljer att dela det.",
  "onboarding.purpose.why": "Du ska veta vad uppgifterna används till innan du lämnar dem.",

  "onboarding.identity.title": "Yrkesidentitet",
  "onboarding.identity.name": "Namn som visas",
  "onboarding.identity.headline": "Kort yrkesbeskrivning",
  "onboarding.identity.why": "Det här är namnet och beskrivningen som syns när du delar något.",

  "onboarding.profession.title": "Yrke",
  "onboarding.profession.field": "Yrke inom säkerhet",
  "onboarding.profession.why":
    "Yrket avgör vilka behörigheter och utbildningar som är relevanta att fråga om.",

  "onboarding.jurisdiction.title": "Land och regelverk",
  "onboarding.jurisdiction.field": "Land där du arbetar",
  "onboarding.jurisdiction.why":
    "Behörigheter gäller i ett visst land. En svensk behörighet ger inte automatiskt rätt att arbeta i ett annat land.",

  "onboarding.currentRole.title": "Nuvarande roll",
  "onboarding.currentRole.employer": "Arbetsgivare",
  "onboarding.currentRole.role": "Roll eller titel",
  "onboarding.currentRole.startedOn": "Startdatum",
  "onboarding.currentRole.why": "Din nuvarande roll är utgångspunkten för din erfarenhetslinje.",

  "onboarding.history.title": "Tidigare anställningar",
  "onboarding.history.body":
    "Lägg till dina tidigare anställningar inom säkerhet. Överlappande perioder räknas bara en gång.",
  "onboarding.history.why":
    "Anställningsperioder är grunden för din erfarenhet och för framtida yrkeserkännanden.",

  "onboarding.licence.title": "Behörigheter",
  "onboarding.licence.body": "Till exempel väktarlegitimation eller annan myndighetsbehörighet.",
  "onboarding.licence.why":
    "Behörigheter har giltighetstid och land. De visas alltid med sitt aktuella tillstånd.",

  "onboarding.education.title": "Utbildning",
  "onboarding.education.why": "Formell utbildning som är relevant för ditt yrke.",

  "onboarding.training.title": "Utbildningar och kurser",
  "onboarding.training.why": "Yrkesutbildningar, till exempel väktargrundutbildning.",

  "onboarding.certification.title": "Certifieringar",
  "onboarding.certification.why": "Certifieringar från en utfärdare som kan bekräfta dem.",

  "onboarding.specialisation.title": "Specialiseringar",
  "onboarding.specialisation.body":
    "Områden du faktiskt har arbetat inom — till exempel datacenter, kontrollrum eller ronderande bevakning.",
  "onboarding.specialisation.why":
    "Ett intresse eller en titel räknas inte som en specialisering. Det krävs att du har arbetat med det.",

  "onboarding.languages.title": "Språk och praktiska färdigheter",
  "onboarding.languages.why": "Språk och körkort efterfrågas ofta i säkerhetsroller.",

  "onboarding.declaration.title": "Granska och intyga",
  "onboarding.declaration.body":
    "Kontrollera dina uppgifter. Genom att slutföra intygar du att de är riktiga så vitt du vet.",
  "onboarding.declaration.checkbox": "Jag intygar att uppgifterna är riktiga så vitt jag vet.",
  "onboarding.declaration.why":
    "Ett intygande gör skillnaden mellan en anteckning och en yrkesuppgift tydlig.",

  // ── Overview ─────────────────────────────────────────────────────────
  "overview.title": "Mitt Security Passport",
  "overview.privateNote": "Bara du ser den här sidan.",
  "overview.emptyTitle": "Ditt Passport är tomt",
  "overview.emptyBody":
    "Börja med din nuvarande roll. Du kan fortsätta senare — allt sparas medan du fyller i.",
  "overview.partialTitle": "Du är på god väg",
  "overview.partialBody": "Fortsätt när du vill. Ingenting delas förrän du väljer det.",
  "overview.continue": "Fortsätt fylla i",
  "overview.sectionIdentity": "Yrkesidentitet",
  "overview.sectionExperience": "Erfarenhet",
  "overview.sectionRecognition": "Yrkeserkännande",
  "overview.sectionClaims": "Uppgifter",
  "overview.sectionSharing": "Delning",
  "overview.noClaims": "Inga uppgifter ännu.",
  "overview.viewCard": "Visa Passport Card",
  "overview.share": "Dela",

  // ── Experience totals ────────────────────────────────────────────────
  "totals.title": "Erfarenhet efter underlag",
  "totals.reported": "Rapporterad erfarenhet",
  "totals.documented": "Dokumenterad erfarenhet",
  "totals.verified": "Verifierad erfarenhet",
  "totals.reportedHint": "Allt du själv har uppgett.",
  "totals.documentedHint": "Det du har lämnat underlag för.",
  "totals.verifiedHint": "Det en behörig part har bekräftat.",
  "totals.none": "Ingen",
  "totals.basis": "Visa underlag",
  "totals.basisHide": "Dölj underlag",
  "totals.overlapNote":
    "Överlappande anställningar räknas bara en gång. Perioder som är bestridda eller återkallade räknas inte alls.",
  "totals.fteTitle": "Heltidsmotsvarande tid",
  "totals.fteNote":
    "Kalendertid är hur länge du har arbetat i yrket. Heltidsmotsvarande tid räknar om deltid till heltid. Vi räknar aldrig om åt dig — båda visas.",
  "totals.elapsedLabel": "Kalendertid",
  "totals.fteLabel": "Heltidsmotsvarande",

  // ── Recognition ──────────────────────────────────────────────────────
  "recognition.title": "Yrkeserkännande",
  "recognition.badgePrefix": "Verifierad yrkeserfarenhet",
  "recognition.years": "år",
  "recognition.yearsPlus": "år eller mer",
  "recognition.noneTitle": "Inget erkännande ännu",
  "recognition.noneBody":
    "Ett erkännande kräver att hela perioden är verifierad av en behörig part.",
  "recognition.nextTitle": "Nästa nivå",
  "recognition.remaining": "Återstår i verifierad tid",
  // Without this, a holder five days short of a threshold is told "0 år 0
  // månader återstår" while no badge appears — which reads as a bug.
  "recognition.remainingLessThanMonth": "Mindre än en månad",
  "recognition.mixedTitle": "Din rapporterade tid räcker — men den är inte verifierad",
  "recognition.mixedBody":
    "Ett erkännande ges bara när hela den kvalificerande tiden är verifierad. Blandat underlag ger inget erkännande.",
  "recognition.policy": "Beräkningsregel",
  "recognition.basis": "Visa vad erkännandet bygger på",

  // ── Assertion level and lifecycle ────────────────────────────────────
  "assertion.self_declared": "EGENRAPPORTERAD",
  "assertion.document_provided": "DOKUMENT TILLHANDAHÅLLET",
  "assertion.verified": "VERIFIERAD",
  "assertion.self_declared.help":
    "Uppgiften kommer från dig och är inte kontrollerad av någon annan.",
  "assertion.document_provided.help":
    "Ett underlag har lämnats. Att ett dokument finns betyder inte att uppgiften är verifierad.",
  "assertion.verified.help": "En behörig part har bekräftat uppgiften.",
  "assertion.legend": "Underlagsnivå",

  "lifecycle.draft": "Utkast",
  "lifecycle.active": "Gällande",
  "lifecycle.expired": "Utgången",
  "lifecycle.revoked": "Återkallad",
  "lifecycle.superseded": "Ersatt",
  "lifecycle.disputed": "Bestridd",
  "lifecycle.legend": "Tillstånd",
  "lifecycle.expiredNote": "Uppgiften var verifierad men giltighetstiden har gått ut.",
  "lifecycle.disputedNote": "Uppgiften är bestridd och räknas inte med förrän den är utredd.",
  "lifecycle.locked": "Underlagsnivå och tillstånd sätts av systemet och kan inte ändras av dig.",

  // ── Claims ───────────────────────────────────────────────────────────
  "claims.type.training": "Utbildning",
  "claims.type.certification": "Certifiering",
  "claims.type.licence": "Behörighet",
  "claims.type.specialisation": "Specialisering",
  "claims.type.education": "Formell utbildning",
  "claims.type.professional_membership": "Yrkesmedlemskap",
  "claims.issuer": "Utfärdare",
  "claims.verifier": "Verifierad av",
  "claims.jurisdiction": "Land",
  "claims.issuedOn": "Utfärdat",
  "claims.validUntil": "Giltigt till",
  "claims.noExpiry": "Ingen giltighetstid",
  "claims.limitation": "Begränsning",
  "claims.version": "Version",
  "claims.history": "Historik",

  // ── Timeline ─────────────────────────────────────────────────────────
  "timeline.title": "Erfarenhetslinje",
  "timeline.current": "Pågående",
  "timeline.overlapBadge": "Överlappar",
  "timeline.partTime": "Deltid",
  "timeline.partialSecurity": "Delvis säkerhetsarbete",
  "timeline.break": "Uppehåll",
  "timeline.excluded": "Räknas inte",
  "timeline.employmentType.full_time": "Heltid",
  "timeline.employmentType.part_time": "Deltid",
  "timeline.employmentType.hourly": "Timanställd",
  "timeline.employmentType.temporary": "Visstid",
  "timeline.empty": "Ingen erfarenhet tillagd ännu.",

  // ── Passport Card ────────────────────────────────────────────────────
  "card.title": "Passport Card",
  "card.subtitle": "Yrkesidentitet och underlag",
  "card.locked":
    "Innehållet skapas från dina registrerade uppgifter och deras aktuella tillstånd. Du väljer om och hur det delas — inte vad som står.",
  "card.emptyState": "Inget att visa ännu",
  "card.emptyBody": "Lägg till din erfarenhet så byggs kortet upp.",
  "card.verifyAction": "Kontrollera detta kort",
  "card.notVerifiedIdentity":
    "CQrityjob har inte verifierat innehavarens juridiska identitet i den här fasen.",
  "card.shareExpired": "Delningen har gått ut",
  "card.shareRevoked": "Delningen är återkallad",
  "card.containsExpired": "Innehåller utgångna uppgifter",
  "card.containsDisputed": "Innehåller bestridda uppgifter",
  "card.state": "Kortets tillstånd",

  // ── Disclosure ───────────────────────────────────────────────────────
  "disclosure.title": "Dela ditt Passport",
  "disclosure.lead":
    "Välj ett färdigt paket. Paketen är utformade så att sammanhanget alltid följer med uppgiften.",
  "disclosure.package": "Paket",
  "disclosure.purpose": "Syfte",
  "disclosure.mandatory": "Obligatoriskt innehåll",
  "disclosure.optional": "Frivilligt innehåll",
  "disclosure.mandatoryNote": "Obligatoriskt innehåll kan inte tas bort.",
  "disclosure.recipient": "Mottagare eller ändamål",
  "disclosure.recipientPlaceholder": "Till exempel: rekryterande arbetsgivare",
  "disclosure.expiry": "Delningen upphör",
  "disclosure.expiryDays": "dagar",
  "disclosure.review": "Granska före delning",
  "disclosure.reviewLead": "Exakt det här ser mottagaren. Inget mer.",
  "disclosure.create": "Skapa delning",
  "disclosure.created": "Delningen är skapad",
  "disclosure.revoke": "Återkalla",
  "disclosure.revokeNote": "En återkallad delning kan inte återaktiveras.",
  "disclosure.historyTitle": "Delningshistorik",
  "disclosure.historyEmpty": "Du har inte delat något ännu.",
  "disclosure.opened": "Öppnad",
  "disclosure.times": "gånger",
  "disclosure.status.active": "Aktiv",
  "disclosure.status.expired": "Utgången",
  "disclosure.status.revoked": "Återkallad",

  "package.overview.name": "Yrkesöversikt väktare",
  "package.overview.purpose": "En översiktlig bild av yrkesidentitet och erfarenhet.",
  "package.verified.name": "Verifierad erfarenhet",
  "package.verified.purpose": "Endast anställningsperioder som är verifierade.",
  "package.training.name": "Utbildning och certifieringar",
  "package.training.purpose": "Utbildningar och certifieringar med utfärdare och giltighet.",
  "package.licence.name": "Behörighet i landet",
  "package.licence.purpose": "Behörigheter och deras aktuella giltighet i ett visst land.",
  "package.employer.name": "Underlag begärt av arbetsgivare",
  "package.employer.purpose": "Det en arbetsgivare uttryckligen har efterfrågat.",

  "item.identity": "Yrkesidentitet och land",
  "item.totals": "Erfarenhet efter underlag",
  "item.recognition": "Yrkeserkännande",
  "item.verifiedPeriods": "Verifierade anställningsperioder",
  "item.allPeriods": "Anställningsperioder",
  "item.training": "Utbildningar",
  "item.certifications": "Certifieringar",
  "item.licences": "Behörigheter",
  "item.specialisations": "Specialiseringar",
  "item.contact": "Kontaktuppgifter",

  // ── Recipient verification page ──────────────────────────────────────
  "recipient.title": "Kontroll av delat underlag",
  "recipient.sharedBy": "Delat av",
  "recipient.profession": "Yrke och land",
  "recipient.contents": "Delat innehåll",
  "recipient.shareStatus": "Delningens tillstånd",
  "recipient.verifiedByTitle": "Vad CQrityjob har kontrollerat",
  "recipient.verifiedByBody":
    "CQrityjob visar underlagsnivån för varje uppgift. VERIFIERAD betyder att en behörig part har bekräftat uppgiften.",
  "recipient.notVerifiedTitle": "Vad CQrityjob inte har kontrollerat",
  "recipient.notVerifiedBody":
    "Innehavarens juridiska identitet är inte kontrollerad med BankID eller motsvarande i den här fasen. Egenrapporterade uppgifter är inte kontrollerade av någon annan än innehavaren.",
  "recipient.unavailableTitle": "Länken är inte tillgänglig",
  "recipient.unavailableBody":
    "Länken går inte att öppna. Kontakta den som skickade den om du behöver ett nytt underlag.",
  "recipient.expiresOn": "Upphör",

  // ── Jurisdiction ─────────────────────────────────────────────────────
  "jurisdiction.SE": "Sverige",
  "jurisdiction.title": "Land och behörighet",
  "jurisdiction.crossBorderTitle": "Gäller i Sverige",
  "jurisdiction.crossBorderBody":
    "Den här behörigheten är utfärdad i Sverige och gäller enligt svenska regler. Den ger inte automatiskt rätt att arbeta i ett annat land. Verifierad erfarenhet är inte samma sak som behörighet i ett annat land.",
  "jurisdiction.viewingFrom": "Du tittar från",
  "jurisdiction.experienceVsEligibility":
    "Erfarenhet följer med över gränser. Behörighet gör det inte.",

  // ── Privacy ──────────────────────────────────────────────────────────
  "privacy.title": "Integritet och delning",
  "privacy.defaultTitle": "Privat som standard",
  "privacy.defaultBody": "Ingenting i ditt Passport visas för någon förrän du delar det.",
  "privacy.sharesTitle": "Aktiva delningar",
  "privacy.exportTitle": "Exportera dina uppgifter",
  "privacy.exportBody": "Du kan när som helst få ut allt du har lagt in.",
  "privacy.deleteTitle": "Radera ditt Passport",
  "privacy.deleteBody":
    "Aktiva delningar återkallas först. Bekräftelser som en arbetsgivare har lämnat behålls i avidentifierad form.",
  "privacy.prototypeNote": "Knapparna är inaktiva i prototypen.",

  // ── Common ───────────────────────────────────────────────────────────
  "common.yes": "Ja",
  "common.no": "Nej",
  "common.close": "Stäng",
  "common.present": "nu",
  "common.and": "och",
  "duration.year": "år",
  "duration.years": "år",
  "duration.month": "månad",
  "duration.months": "månader",
  "duration.zero": "Ingen tid registrerad",
  "common.notStated": "Ej angivet",

  // ── Phase 1B: card directions, social sharing, verification ──────────
  "card.direction.tenureCrest": "A — Tjänstemärke",
  "card.direction.collectible": "B — Professionellt samlarkort",
  "card.direction.signature": "C — CQrityjob Signature",
  "card.brand": "Security Passport",
  "card.verifyNow": "Kontrollera aktuell status",
  "card.verifyAtSource": "Kontrollera aktuell status hos CQrityjob",
  "card.snapshotNote":
    "Bilden är en sammanfattning från ett visst tillfälle. Aktuell status finns alltid på verifieringssidan.",
  "card.lastChecked": "Sammanfattning skapad",
  "card.cta.verify": "Verifiera detta Security Passport",
  "card.cta.viewCredentials": "Visa verifierade uppgifter",
  "card.cta.create": "Skapa ditt Security Passport med CQrityjob",
  "card.noVerifiedYet": "Inga verifierade uppgifter ännu",
  "card.selfDeclaredHeading": "Egenrapporterad yrkesprofil",

  "share.title": "Dela som bild",
  "share.lead":
    "Den här bilden är en säker sammanfattning. Den innehåller aldrig nummer på intyg, dokument, arbetsgivarhistorik eller kontaktuppgifter.",
  "share.format": "Format",
  "share.format.square": "Kvadrat 1080×1080",
  "share.format.story": "Story 1080×1920",
  "share.format.og": "LinkedIn/OG 1200×630",
  "share.format.compact": "Kompakt kort",
  "share.privacyMode": "Identitet",
  "share.privacy.full_name": "Fullständigt namn",
  "share.privacy.initials": "Initialer",
  "share.privacy.anonymous": "Utan namn",
  "share.anonymousLabel": "Verifierad väktare",
  "share.channels": "Dela till",
  "share.channel.linkedin": "LinkedIn",
  "share.channel.facebook": "Facebook",
  "share.channel.x": "X",
  "share.channel.whatsapp": "WhatsApp",
  "share.channel.email": "E-post",
  "share.channel.copy_link": "Kopiera säker länk",
  "share.channel.native": "Dela på enheten",
  "share.channel.download_square": "Ladda ned kvadrat",
  "share.channel.download_story": "Ladda ned Story",
  "share.instagramNote":
    "Instagram tillåter inte publicering från webben. Ladda ned Story-bilden och lägg upp den i appen.",
  "share.prototypeOnly": "Prototypkontroller. Inget publiceras och inga API:er anropas.",
  "share.excluded": "Aldrig med på en delad bild",
  "share.excluded.numbers": "Nummer på intyg och behörigheter",
  "share.excluded.documents": "Dokument och bilder på underlag",
  "share.excluded.employers": "Arbetsgivar- och uppdragshistorik",
  "share.excluded.dates": "Datum och känsliga perioder",
  "share.excluded.contact": "Kontaktuppgifter",

  "studio.title": "Kortstudio",
  "studio.lead": "Tre riktningar, samma fiktiva underlag.",
  "studio.direction": "Riktning",
  "studio.compareAll": "Jämför alla tre",
  "studio.recommended": "Rekommenderad",
  "studio.state": "Tillstånd",
} as const;

export type PassportCopyKey = keyof typeof sv;

// Typed as a full record: a missing key is a compile error.
const en: Record<PassportCopyKey, string> = {
  "proto.banner.title": "Development prototype — Security Passport",
  "proto.banner.body":
    "Fictional test data. Nothing is saved, no database is used, and none of this is production. Internal review only.",
  "proto.screen": "Screen",
  "proto.persona": "Test person",
  "proto.language": "Language",
  "proto.reset": "Reset the prototype",
  "proto.resetDone": "The prototype has been reset.",
  "proto.back": "Back",

  "screen.home": "Candidate home (mock)",
  "screen.welcome": "Welcome and purpose",
  "screen.onboarding": "Get started",
  "screen.overview": "My Security Passport",
  "screen.timeline": "Experience timeline",
  "screen.card": "Passport Card",
  "screen.share": "Share",
  "screen.shareHistory": "Sharing history",
  "screen.recipient": "Recipient view",
  "screen.privacy": "Privacy",
  "screen.studio": "Card studio",

  "home.title": "My career",
  "home.intro": "Two separate products, one sign-in.",
  "home.careerCard.title": "Career Card",
  "home.careerCard.tagline": "Your result from Career Discovery.",
  "home.careerCard.body":
    "Guidance on what may suit you. Unchanged in this phase — shown here only as an adjacent product.",
  "home.careerCard.unchanged": "Unchanged product",
  "home.careerCard.none": "You have no result yet.",
  "home.passport.title": "Security Passport",
  "home.passport.tagline": "Your professional security identity and evidence.",
  "home.passport.body": "What you have done, learned and had verified. You decide what is shared.",
  "home.passport.start": "Start Security Passport",
  "home.passport.continue": "Continue",
  "home.passport.addExperience": "Add experience",
  "home.passport.addTraining": "Add training or certification",
  "home.passport.manageShares": "Manage disclosures",

  "welcome.eyebrow": "Security Passport",
  "welcome.title": "Your professional identity in security",
  "welcome.lead":
    "Security Passport gathers what you have done, learned and had verified across your working life — and grows with you throughout your career.",
  "welcome.isTitle": "This is Security Passport",
  "welcome.is1":
    "A structured professional record: employment, education, certifications and authorisations.",
  "welcome.is2": "Private by default. Nothing is shown to anyone until you share it yourself.",
  "welcome.is3":
    "Evidence you can share as a scoped package, with an expiry date, and revoke whenever you want.",
  "welcome.isNotTitle": "This is not Security Passport",
  "welcome.isNot1": "It is not a test and not an assessment of you as a person.",
  "welcome.isNot2": "There is no overall grade, no score and no ranking of people.",
  "welcome.isNot3": "It is not a background check and never contains criminal-record information.",
  "welcome.rulesTitle": "Two rules that always apply",
  "welcome.rule1":
    "You can never verify your own information. What you enter yourself is self-reported — not verified.",
  "welcome.rule2":
    "Only an authorised employer, training provider or issuer can make an entry verified.",
  "welcome.start": "Get started",
  "welcome.resume": "Continue where you left off",

  "onboarding.title": "Build your Security Passport",
  "onboarding.step": "Step",
  "onboarding.of": "of",
  "onboarding.required": "Required",
  "onboarding.optional": "Optional",
  "onboarding.why": "Why we ask",
  "onboarding.continue": "Continue",
  "onboarding.back": "Back",
  "onboarding.skip": "Skip",
  "onboarding.saveExit": "Save and exit",
  "onboarding.saved": "Saved",
  "onboarding.savedAt": "Saved automatically",
  "onboarding.createsClaim":
    "Your answer is created as a SELF-DECLARED entry. That means it comes from you and has not yet been verified by anyone else.",
  "onboarding.finish": "Review and finish",

  "onboarding.purpose.title": "Purpose and privacy",
  "onboarding.purpose.body":
    "We only ask about things that belong to your working life in security. Everything is private until you choose to share it.",
  "onboarding.purpose.why": "You should know what the information is used for before you give it.",

  "onboarding.identity.title": "Professional identity",
  "onboarding.identity.name": "Name shown",
  "onboarding.identity.headline": "Short professional description",
  "onboarding.identity.why":
    "This is the name and description that appear when you share something.",

  "onboarding.profession.title": "Profession",
  "onboarding.profession.field": "Security profession",
  "onboarding.profession.why":
    "Your profession determines which authorisations and training are relevant to ask about.",

  "onboarding.jurisdiction.title": "Country and regulation",
  "onboarding.jurisdiction.field": "Country where you work",
  "onboarding.jurisdiction.why":
    "Authorisations apply in a specific country. A Swedish authorisation does not automatically confer the right to work in another country.",

  "onboarding.currentRole.title": "Current role",
  "onboarding.currentRole.employer": "Employer",
  "onboarding.currentRole.role": "Role or title",
  "onboarding.currentRole.startedOn": "Start date",
  "onboarding.currentRole.why":
    "Your current role is the starting point for your experience timeline.",

  "onboarding.history.title": "Previous employment",
  "onboarding.history.body":
    "Add your previous employment in security. Overlapping periods are counted only once.",
  "onboarding.history.why":
    "Employment periods are the basis for your experience and for future professional recognition.",

  "onboarding.licence.title": "Authorisations",
  "onboarding.licence.body":
    "For example a security guard licence or other regulatory authorisation.",
  "onboarding.licence.why":
    "Authorisations have a validity period and a country. They are always shown with their current state.",

  "onboarding.education.title": "Education",
  "onboarding.education.why": "Formal education relevant to your profession.",

  "onboarding.training.title": "Training and courses",
  "onboarding.training.why": "Vocational training, for example basic security guard training.",

  "onboarding.certification.title": "Certifications",
  "onboarding.certification.why": "Certifications from an issuer who can confirm them.",

  "onboarding.specialisation.title": "Specialisations",
  "onboarding.specialisation.body":
    "Areas you have actually worked in — for example data centres, control rooms or mobile patrol.",
  "onboarding.specialisation.why":
    "An interest or a job title does not count as a specialisation. It requires that you have worked in it.",

  "onboarding.languages.title": "Languages and practical skills",
  "onboarding.languages.why":
    "Languages and driving licences are often asked for in security roles.",

  "onboarding.declaration.title": "Review and declare",
  "onboarding.declaration.body":
    "Check your information. By finishing you declare that it is accurate to the best of your knowledge.",
  "onboarding.declaration.checkbox":
    "I declare that this information is accurate to the best of my knowledge.",
  "onboarding.declaration.why":
    "A declaration makes the difference between a note and a professional record explicit.",

  "overview.title": "My Security Passport",
  "overview.privateNote": "Only you can see this page.",
  "overview.emptyTitle": "Your Passport is empty",
  "overview.emptyBody":
    "Start with your current role. You can continue later — everything is saved as you go.",
  "overview.partialTitle": "You are well on your way",
  "overview.partialBody": "Continue whenever you like. Nothing is shared until you choose to.",
  "overview.continue": "Continue filling in",
  "overview.sectionIdentity": "Professional identity",
  "overview.sectionExperience": "Experience",
  "overview.sectionRecognition": "Professional recognition",
  "overview.sectionClaims": "Entries",
  "overview.sectionSharing": "Sharing",
  "overview.noClaims": "No entries yet.",
  "overview.viewCard": "View Passport Card",
  "overview.share": "Share",

  "totals.title": "Experience by evidence",
  "totals.reported": "Reported experience",
  "totals.documented": "Documented experience",
  "totals.verified": "Verified experience",
  "totals.reportedHint": "Everything you have stated yourself.",
  "totals.documentedHint": "What you have provided documentation for.",
  "totals.verifiedHint": "What an authorised party has confirmed.",
  "totals.none": "None",
  "totals.basis": "Show basis",
  "totals.basisHide": "Hide basis",
  "totals.overlapNote":
    "Overlapping employment is counted only once. Disputed or revoked periods are not counted at all.",
  "totals.fteTitle": "Full-time equivalent",
  "totals.fteNote":
    "Elapsed time is how long you have worked in the profession. Full-time equivalent converts part-time into full-time. We never convert for you — both are shown.",
  "totals.elapsedLabel": "Elapsed time",
  "totals.fteLabel": "Full-time equivalent",

  "recognition.title": "Professional recognition",
  "recognition.badgePrefix": "Verified professional experience",
  "recognition.years": "years",
  "recognition.yearsPlus": "years or more",
  "recognition.noneTitle": "No recognition yet",
  "recognition.noneBody":
    "Recognition requires that the whole period is verified by an authorised party.",
  "recognition.nextTitle": "Next level",
  "recognition.remaining": "Remaining in verified time",
  "recognition.remainingLessThanMonth": "Less than a month",
  "recognition.mixedTitle": "Your reported time is enough — but it is not verified",
  "recognition.mixedBody":
    "Recognition is given only when all of the qualifying time is verified. Mixed evidence gives no recognition.",
  "recognition.policy": "Calculation rule",
  "recognition.basis": "Show what the recognition is based on",

  "assertion.self_declared": "SELF-DECLARED",
  "assertion.document_provided": "DOCUMENT PROVIDED",
  "assertion.verified": "VERIFIED",
  "assertion.self_declared.help": "This comes from you and has not been checked by anyone else.",
  "assertion.document_provided.help":
    "Documentation has been provided. A document existing does not mean the entry is verified.",
  "assertion.verified.help": "An authorised party has confirmed this entry.",
  "assertion.legend": "Evidence level",

  "lifecycle.draft": "Draft",
  "lifecycle.active": "Active",
  "lifecycle.expired": "Expired",
  "lifecycle.revoked": "Revoked",
  "lifecycle.superseded": "Superseded",
  "lifecycle.disputed": "Disputed",
  "lifecycle.legend": "State",
  "lifecycle.expiredNote": "This entry was verified but its validity period has ended.",
  "lifecycle.disputedNote": "This entry is disputed and is not counted until it is resolved.",
  "lifecycle.locked":
    "Evidence level and state are set by the system and cannot be changed by you.",

  "claims.type.training": "Training",
  "claims.type.certification": "Certification",
  "claims.type.licence": "Authorisation",
  "claims.type.specialisation": "Specialisation",
  "claims.type.education": "Formal education",
  "claims.type.professional_membership": "Professional membership",
  "claims.issuer": "Issuer",
  "claims.verifier": "Verified by",
  "claims.jurisdiction": "Country",
  "claims.issuedOn": "Issued",
  "claims.validUntil": "Valid until",
  "claims.noExpiry": "No expiry",
  "claims.limitation": "Limitation",
  "claims.version": "Version",
  "claims.history": "History",

  "timeline.title": "Experience timeline",
  "timeline.current": "Current",
  "timeline.overlapBadge": "Overlaps",
  "timeline.partTime": "Part-time",
  "timeline.partialSecurity": "Partly security work",
  "timeline.break": "Break",
  "timeline.excluded": "Not counted",
  "timeline.employmentType.full_time": "Full-time",
  "timeline.employmentType.part_time": "Part-time",
  "timeline.employmentType.hourly": "Hourly",
  "timeline.employmentType.temporary": "Fixed-term",
  "timeline.empty": "No experience added yet.",

  "card.title": "Passport Card",
  "card.subtitle": "Professional identity and evidence",
  "card.locked":
    "The content is generated from your recorded entries and their current state. You choose whether and how it is shared — not what it says.",
  "card.emptyState": "Nothing to show yet",
  "card.emptyBody": "Add your experience and the card builds itself.",
  "card.verifyAction": "Check this card",
  "card.notVerifiedIdentity":
    "CQrityjob has not verified the holder's legal identity in this phase.",
  "card.shareExpired": "This disclosure has expired",
  "card.shareRevoked": "This disclosure has been revoked",
  "card.containsExpired": "Contains expired entries",
  "card.containsDisputed": "Contains disputed entries",
  "card.state": "Card state",

  "disclosure.title": "Share your Passport",
  "disclosure.lead":
    "Choose a prepared package. The packages are designed so that context always travels with the entry.",
  "disclosure.package": "Package",
  "disclosure.purpose": "Purpose",
  "disclosure.mandatory": "Mandatory content",
  "disclosure.optional": "Optional content",
  "disclosure.mandatoryNote": "Mandatory content cannot be removed.",
  "disclosure.recipient": "Recipient or purpose",
  "disclosure.recipientPlaceholder": "For example: recruiting employer",
  "disclosure.expiry": "Disclosure expires",
  "disclosure.expiryDays": "days",
  "disclosure.review": "Review before sharing",
  "disclosure.reviewLead": "This is exactly what the recipient sees. Nothing more.",
  "disclosure.create": "Create disclosure",
  "disclosure.created": "The disclosure has been created",
  "disclosure.revoke": "Revoke",
  "disclosure.revokeNote": "A revoked disclosure cannot be reactivated.",
  "disclosure.historyTitle": "Sharing history",
  "disclosure.historyEmpty": "You have not shared anything yet.",
  "disclosure.opened": "Opened",
  "disclosure.times": "times",
  "disclosure.status.active": "Active",
  "disclosure.status.expired": "Expired",
  "disclosure.status.revoked": "Revoked",

  "package.overview.name": "Security Guard Professional Overview",
  "package.overview.purpose": "An overview of professional identity and experience.",
  "package.verified.name": "Verified Experience",
  "package.verified.purpose": "Only employment periods that are verified.",
  "package.training.name": "Training and Certifications",
  "package.training.purpose": "Training and certifications with issuer and validity.",
  "package.licence.name": "Local Licence or Eligibility",
  "package.licence.purpose": "Authorisations and their current validity in a given country.",
  "package.employer.name": "Employer-requested Evidence Package",
  "package.employer.purpose": "What an employer has explicitly asked for.",

  "item.identity": "Professional identity and country",
  "item.totals": "Experience by evidence",
  "item.recognition": "Professional recognition",
  "item.verifiedPeriods": "Verified employment periods",
  "item.allPeriods": "Employment periods",
  "item.training": "Training",
  "item.certifications": "Certifications",
  "item.licences": "Authorisations",
  "item.specialisations": "Specialisations",
  "item.contact": "Contact details",

  "recipient.title": "Check of shared evidence",
  "recipient.sharedBy": "Shared by",
  "recipient.profession": "Profession and country",
  "recipient.contents": "Shared content",
  "recipient.shareStatus": "Disclosure state",
  "recipient.verifiedByTitle": "What CQrityjob has checked",
  "recipient.verifiedByBody":
    "CQrityjob shows the evidence level for each entry. VERIFIED means an authorised party has confirmed it.",
  "recipient.notVerifiedTitle": "What CQrityjob has not checked",
  "recipient.notVerifiedBody":
    "The holder's legal identity has not been checked with BankID or equivalent in this phase. Self-declared entries have not been checked by anyone other than the holder.",
  "recipient.unavailableTitle": "This link is not available",
  "recipient.unavailableBody":
    "This link cannot be opened. Contact whoever sent it if you need new evidence.",
  "recipient.expiresOn": "Expires",

  "jurisdiction.SE": "Sweden",
  "jurisdiction.title": "Country and eligibility",
  "jurisdiction.crossBorderTitle": "Applies in Sweden",
  "jurisdiction.crossBorderBody":
    "This authorisation is issued in Sweden and applies under Swedish rules. It does not automatically confer the right to work in another country. Verified experience is not the same as eligibility in another country.",
  "jurisdiction.viewingFrom": "You are viewing from",
  "jurisdiction.experienceVsEligibility":
    "Experience travels across borders. Eligibility does not.",

  "privacy.title": "Privacy and sharing",
  "privacy.defaultTitle": "Private by default",
  "privacy.defaultBody": "Nothing in your Passport is shown to anyone until you share it.",
  "privacy.sharesTitle": "Active disclosures",
  "privacy.exportTitle": "Export your information",
  "privacy.exportBody": "You can get everything you have entered at any time.",
  "privacy.deleteTitle": "Delete your Passport",
  "privacy.deleteBody":
    "Active disclosures are revoked first. Confirmations given by an employer are retained in unlinked form.",
  "privacy.prototypeNote": "The buttons are inactive in the prototype.",

  "common.yes": "Yes",
  "common.no": "No",
  "common.close": "Close",
  "common.present": "now",
  "common.and": "and",
  "duration.year": "year",
  "duration.years": "years",
  "duration.month": "month",
  "duration.months": "months",
  "duration.zero": "No time recorded",
  "common.notStated": "Not stated",

  "card.direction.tenureCrest": "A — Tenure Crest",
  "card.direction.collectible": "B — Professional Collectible",
  "card.direction.signature": "C — CQrityjob Signature",
  "card.brand": "Security Passport",
  "card.verifyNow": "Check current status",
  "card.verifyAtSource": "Verify current status at CQrityjob",
  "card.snapshotNote":
    "This image is a summary from a point in time. Current status is always on the verification page.",
  "card.lastChecked": "Summary created",
  "card.cta.verify": "Verify this Security Passport",
  "card.cta.viewCredentials": "View verified credentials",
  "card.cta.create": "Create your Security Passport with CQrityjob",
  "card.noVerifiedYet": "No verified entries yet",
  "card.selfDeclaredHeading": "Self-reported professional profile",

  "share.title": "Share as an image",
  "share.lead":
    "This image is a safe summary. It never contains certificate numbers, documents, employment history or contact details.",
  "share.format": "Format",
  "share.format.square": "Square 1080×1080",
  "share.format.story": "Story 1080×1920",
  "share.format.og": "LinkedIn/OG 1200×630",
  "share.format.compact": "Compact card",
  "share.privacyMode": "Identity",
  "share.privacy.full_name": "Full name",
  "share.privacy.initials": "Initials",
  "share.privacy.anonymous": "No name",
  "share.anonymousLabel": "Verified security officer",
  "share.channels": "Share to",
  "share.channel.linkedin": "LinkedIn",
  "share.channel.facebook": "Facebook",
  "share.channel.x": "X",
  "share.channel.whatsapp": "WhatsApp",
  "share.channel.email": "Email",
  "share.channel.copy_link": "Copy secure link",
  "share.channel.native": "Share on device",
  "share.channel.download_square": "Download square",
  "share.channel.download_story": "Download Story",
  "share.instagramNote":
    "Instagram does not allow publishing from the web. Download the Story image and post it in the app.",
  "share.prototypeOnly": "Prototype controls. Nothing is published and no API is called.",
  "share.excluded": "Never on a shared image",
  "share.excluded.numbers": "Certificate and authorisation numbers",
  "share.excluded.documents": "Documents and images of evidence",
  "share.excluded.employers": "Employer and assignment history",
  "share.excluded.dates": "Dates and sensitive periods",
  "share.excluded.contact": "Contact details",

  "studio.title": "Card studio",
  "studio.lead": "Three directions, the same fictional evidence.",
  "studio.direction": "Direction",
  "studio.compareAll": "Compare all three",
  "studio.recommended": "Recommended",
  "studio.state": "State",
};

export const passportCopy: Readonly<Record<PassportLang, Record<PassportCopyKey, string>>> = {
  sv,
  en,
};

export function passportT(key: PassportCopyKey, lang: PassportLang): string {
  return passportCopy[lang][key];
}
