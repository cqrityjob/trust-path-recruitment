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
  "screen.marketProfiles": "Marknadsprofiler",
  "screen.welcome": "Välkommen och syfte",
  "screen.onboarding": "Kom igång",
  "screen.overview": "Mitt Security Passport",
  "screen.timeline": "Erfarenhetslinje",
  "screen.card": "Passport Card",
  "screen.share": "Dela",
  "screen.sharePanel": "Delningspanel (live)",
  "screen.shareHistory": "Delningshistorik",
  "screen.recipient": "Mottagarens vy",
  "screen.privacy": "Integritet",
  "screen.studio": "Kortstudio",
  "screen.symbols": "Behörighetssymboler",
  "screen.credentialForm": "Behörighetsformulär",
  "screen.credentialHistory": "Rättelse och versioner",
  "screen.linkedin": "LinkedIn-delning",
  "screen.recipientCard": "Mottagarens Passport-kort",
  "screen.entries": "Mina uppgifter",
  "symbols.title": "CQrityjobs behörighetssymboler",
  "symbols.lead":
    "Fyra egna märken — VU1, VU2, OV och SV — i systemets alla tillstånd. Status bärs alltid av ord, kantstil och statusmärke tillsammans; färgen är aldrig ensam bärare. Endast en gällande, verifierad behörighet får den fulla guldbehandlingen.",
  "symbols.freeText": "Fritextmerit",
  "symbols.smallSize": "Minsta kortstorlek (28 px)",
  "symbols.withWord": "Märke med statusord",
  "nav.overview": "Översikt",
  "nav.onboarding": "Kom igång",
  "nav.card": "Passport Card",
  "nav.credentials": "Behörigheter",
  "nav.privacy": "Integritet",
  "live.loading": "Hämtar ditt Security Passport …",
  "live.error": "Något gick fel. Försök igen.",
  // The READ failure specifically, as distinct from a failed save. "Något gick
  // fel" is true of both, and after F2 this is the sentence a holder sees when
  // their Passport cannot be read at all — the state that used to render as an
  // empty Passport. It says the two things a person needs at that moment:
  // nothing of yours has changed, and this is worth trying again.
  "live.readError": "Vi kunde inte hämta ditt Security Passport.",
  "live.readErrorBody":
    "Ingenting i ditt Passport har ändrats eller tagits bort. Försök igen om en stund.",
  "live.retry": "Försök igen",
  "live.startTitle": "Starta ditt Security Passport",
  "live.startBody":
    "Ditt Passport är privat. Ingenting visas för någon annan, och du bestämmer själv om något någonsin delas.",
  "live.start": "Skapa mitt Passport",
  "live.creating": "Skapar …",
  "live.selfReportedOnly":
    "Allt du lägger in är egenrapporterat tills någon annan har granskat det. Öppna en uppgift för att lägga till underlag och begära verifiering.",
  "live.addExperience": "Lägg till anställning",
  "live.addClaim": "Lägg till utbildning eller behörighet",
  "live.save": "Spara",
  "live.saving": "Sparar …",
  "live.cancel": "Avbryt",
  "live.added": "Tillagd",
  "live.noVerificationYet": "Du kan aldrig verifiera dig själv",
  "live.noVerificationBody":
    "Verifiering görs av CQrityjob eller av en arbetsgivare som känner till anställningen. Först då — och aldrig genom en uppladdning — blir en uppgift verifierad.",
  "live.form.employer": "Arbetsgivare",
  "live.form.role": "Roll eller titel",
  "live.form.startedOn": "Startdatum",
  "live.form.endedOn": "Slutdatum",
  "live.form.current": "Pågående",
  "live.form.employmentType": "Anställningsform",
  "live.form.ftePercent": "Sysselsättningsgrad",
  "live.form.claimType": "Typ",
  "live.form.title": "Namn",
  "live.form.issuer": "Utfärdare (enligt dig)",
  "live.form.issuedOn": "Utfärdat",
  "live.form.validUntil": "Giltigt till",

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
  // "Öppna", not "Starta". The card is deliberately stateless — it fetches
  // nothing, so it cannot know whether a Passport exists — and "Starta" told
  // every returning holder to start something they had already built. "Öppna"
  // is true in both states, and costs no request to be true.
  "home.passport.start": "Öppna Security Passport",
  "home.passport.continue": "Fortsätt",
  "home.passport.addExperience": "Lägg till erfarenhet",
  "home.passport.addTraining": "Lägg till utbildning eller certifiering",
  "home.passport.manageShares": "Hantera delningar",

  // ── Dashboard summary card (candidate home) ──────────────────────────
  // The Passport is the candidate's primary professional asset, so its card
  // on /my-career reports real state rather than linking blindly. Counts are
  // derived from the holder's own claims; there is deliberately no score,
  // rank or completeness percentage, because none of those has a governed
  // meaning in this product and inventing one would be a claim about a person.
  "home.passport.workLabel": "Land / jurisdiktion",
  "home.passport.verified": "Verifierade",
  "home.passport.pending": "Väntar",
  "home.passport.open": "Öppna Passport",
  "home.passport.addCredential": "Lägg till behörighet",
  "home.passport.share": "Dela Passport",
  "home.passport.relevantHere": "Uppgifter för vald jurisdiktion",
  "home.passport.verifiedTotal": "Verifierade totalt",
  "home.passport.relevantVerified": "verifierade gäller för",
  "home.passport.relevantVerifiedNone": "Inga av dina verifierade uppgifter gäller för",
  "home.passport.relevantExplainer":
    "Uppgifterna finns kvar. Verifierat i ett land betyder inte behörighet i ett annat.",
  "home.passport.otherCredentials": "Övriga uppgifter",
  "home.passport.credentialsFrom": "uppgifter från",
  "home.passport.credentialFrom": "uppgift från",
  "home.passport.noneHere": "Inga uppgifter för det här landet ännu",
  "home.passport.noneHereBody":
    "Lägg till dina behörigheter och utbildningar för det land du arbetar i.",
  "home.passport.loading": "Laddar ditt Security Passport …",
  "home.passport.unavailable":
    "Kunde inte läsa ditt Security Passport just nu. Öppna Passport för att försöka igen.",

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
  "att.title": "Behöver din uppmärksamhet",
  "att.clear": "Inget väntar på dig just nu.",
  // För ett beslut vars uppgift inte längre finns i passet. Att visa
  // uppgiftens id i stället vore att visa en databasnyckel som rubrik.
  "att.entryRemoved": "Uppgiften finns inte längre i ditt pass",
  "att.waiting": "Granskas just nu",
  "att.waitingHint": "Någon annan tittar på det här. Du behöver inte göra något.",
  "att.needsHolder": "Väntar på dig",
  "att.needsHolderHint": "Granskaren har bett om komplettering.",
  "att.expiring": "Går ut snart",
  "att.expiringHint": "Förnya i god tid — ett förordnande förnyas hos myndigheten, inte här.",
  "att.expired": "Har gått ut",
  "att.expiredHint": "Visas inte längre som giltigt. Rätta eller förnya uppgiften.",
  "att.daysLeft": "dagar kvar",
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
  // Used wherever a verified credential is no longer CURRENT. The
  // verification really happened and is never erased — but on a card, beside
  // someone's name, the bare word reads as a present fact.
  "assertion.verified.historical": "TIDIGARE VERIFIERAD",
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
  "claims.type.training": "Kurser",
  "claims.type.certification": "Certifiering",
  "claims.type.licence": "Behörighet",
  "claims.type.specialisation": "Specialisering",
  "claims.type.education": "Utbildning",
  "claims.type.professional_membership": "Yrkesmedlemskap",
  "claims.issuer": "Utfärdare",
  "claims.verifier": "Verifierad av",
  // ── UTFÄRDARE ÄR INTE VERIFIERARE ────────────────────────────────────
  // "Utfärdad av BYA" och "Verifierad av BYA" är två skilda påståenden.
  // Etiketten väljs av METODEN som faktiskt användes, aldrig av vem som
  // råkar stå som utfärdare. Utan metod används den neutrala frasen ovan.
  "claims.attribution.document_review": "Dokument granskat av",
  "claims.attribution.employer_confirmation": "Bekräftat av",
  "claims.attribution.issuer_confirmation": "Bekräftat av utfärdaren",
  // A source-confirmation method CQrityjob recorded about itself, before
  // 20261029090000. Rendered by every surface for that shape, and nowhere
  // else. Complete on its own: the decider is named inside it.
  "trust.legacy.unsupported":
    "Granskning registrerad av CQrityjob. Direkt källbekräftelse kan inte visas för denna äldre post.",
  // The short VALUE for the method cell of such a row; the sentence above is
  // rendered beside it. Never a method name it cannot support.
  "trust.legacy.method": "Källmetod utan strukturell källbekräftelse",
  // Field labels for a record that may not claim verification.
  "trust.reviewedBy": "Granskad av",
  "trust.reviewMethod": "Granskningsmetod",
  "trust.reviewedAt": "Granskad",
  // The three public trust levels, and the word for a standing that could
  // not be read. Presentation vocabulary only: nothing stores these.
  "trust.level.self_declared": "Egen uppgift",
  "trust.level.documented": "Dokumenterad",
  // "Bekräftad av källan" in one word. Deliberately not "källverifierad":
  // the regulatory-claim guard refuses "source … verified", and rightly --
  // a source CONFIRMS a fact; nobody here verifies the source.
  "trust.level.source_verified": "Källbekräftad",
  "trust.level.unknown": "Kunde inte läsas",
  // Samma faktum som ovan, i anställningsregister. En anställning som en
  // arbetsgivare har bekräftat förtjänar en mening som säger vad som
  // bekräftades -- inte bara "Bekräftat av" bredvid ett företagsnamn, som
  // på ett CV lika gärna kan läsas som att företaget utfärdat något.
  // Metoden väljer nyckeln precis som ovan; ingen ny nivå tillkommer.
  "employment.attribution.employer_confirmation": "Anställningen är bekräftad av",
  "claims.verifiedOn": "Verifierat",
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
  // The work location is a SEPARATE fact from the professional title, and the
  // card prints it under its own label for that reason. It used to be joined
  // to the derived title by a middot -- "Ordningsvakt · Skyddsvakt · Dubai" --
  // which reads as a Swedish regulated title asserted in the UAE. It is not
  // one, cannot be one, and the card is the artefact people forward onward.
  "card.workLabel": "Arbetsland / jurisdiktion",
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
  //
  // One entry per COUNTRY the taxonomy can produce, so no surface ever falls
  // back to printing a bare ISO code. `formatJurisdiction` resolves these; see
  // the note there for why the fallback is the code rather than a guess.
  "jurisdiction.SE": "Sverige",
  "jurisdiction.GB": "Storbritannien",
  "jurisdiction.AE": "Förenade Arabemiraten",
  // The emirate, not the country. Named separately because a SIRA credential
  // that renders as its country alone reads as UAE-wide, which SIRA does not
  // claim and neither does this product.
  "jurisdiction.AE-DU": "Dubai",
  // Stated wherever a country is chosen. Truthful and DATELESS on purpose: the
  // GB and AE-DU packs are authored but not legally reviewed, and
  // sp_market_pack_active_needs_review means they cannot be switched on until
  // they are. A market that cannot be entered must say so rather than appear
  // as a one-option list with no explanation. No launch date is promised
  // because none is known.
  "jurisdiction.marketAvailability":
    "Sverige är tillgängligt i dag. Andra marknader, däribland Storbritannien och Dubai, är under förberedelse och kan ännu inte väljas. Du kan inte registrera en behörighet för ett land som inte är öppnat.",
  // Shown where the person states WHERE THEY WORK, which is a different
  // question from which regulated credentials the product supports. Says both
  // in one breath so a UK or UAE holder can answer truthfully and still knows,
  // before they go looking, that no credential for that country can be added
  // yet. Dateless for the same reason as the key above.
  // Shown to a holder whose work location nobody has confirmed. Covers the new
  // Passport and the legacy row still carrying the old DEFAULT 'SE' — the same
  // sentence for both, because the product genuinely does not know either way.
  // The permanent work-country control on "My information". Named "arbetsland"
  // rather than "jurisdiktion": the holder is being asked where they work, not
  // to classify themselves legally.
  // Work-country OPTIONS, one language each. The country keys above name the
  // place; these name the CHOICE, which for the UAE has to distinguish the
  // emirate the product models from the rest of the country it does not.
  // Stated per country, because "not supported" without naming the market is
  // the kind of vagueness a holder reads as a fault in their own Passport.
  // Deliberately about REGISTRATION, never about the right to work: a work
  // country is not an authorisation, and the note below says so.
  "workCountry.regulated": "Reglerade behörigheter",
  "workCountry.support.SE":
    "Svenska reglerade behörigheter som Passport stöder kan registreras här.",
  "workCountry.support.GB":
    "CQrityjob stöder ännu inte registrering av brittiska reglerade behörigheter.",
  "workCountry.support.AE":
    "CQrityjob stöder ännu inte registrering av reglerade behörigheter i Förenade Arabemiraten.",
  "workCountry.support.AE-DU":
    "CQrityjob stöder ännu inte registrering av Dubai-reglerade behörigheter.",
  "workCountry.support.AE-AZ":
    "CQrityjob stöder ännu inte registrering av Abu Dhabi-reglerade behörigheter.",
  "workCountry.support.GB-NI":
    "CQrityjob stöder ännu inte registrering av nordirländska reglerade behörigheter.",
  "workCountry.notAuthorisation":
    "Arbetsland är var du arbetar. Det är inte ett besked om att du får arbeta där — det avgörs av dina behörigheter och av myndigheterna i landet.",
  "jurisdiction.option.AE-DU": "Dubai, Förenade Arabemiraten",
  "jurisdiction.AE-AZ": "Abu Dhabi",
  "jurisdiction.GB-NI": "Nordirland",
  "jurisdiction.option.GB-NI": "Nordirland, Storbritannien",
  "jurisdiction.option.AE-AZ": "Abu Dhabi, Förenade Arabemiraten",
  "jurisdiction.option.AE": "Förenade Arabemiraten (övriga)",
  "workCountry.title": "Arbetsland",
  "workCountry.current": "Nuvarande",
  "workCountry.save": "Spara arbetsland",

  // ── The six profile basics, as a permanent editor ────────────────────
  // The questions themselves already have copy under `onboarding.*`, and it
  // is reused verbatim: a holder must not be asked one thing in the wizard
  // and a subtly different thing here. What is new below is only the frame
  // around them -- the heading, the count, and the words for "this is what
  // you told us, and nobody has checked it".
  "basics.title": "Grunduppgifter för ditt Passport",
  "basics.lead":
    "Ditt Passport byggs av sex steg: ett som du bara läser, fyra med uppgifter som du fyller i, och ett intygande. Du kan läsa och ändra dina svar när du vill — du behöver aldrig börja om.",
  // "2 av 4 uppgifter ifyllda". The count ranges over the FOUR data-bearing
  // steps and nothing else. It used to say "av 6", which counted the
  // information page and the declaration as answers a holder had given, so a
  // brand-new Passport claimed one answer had been supplied when none had.
  "basics.filled": "uppgifter ifyllda",
  "basics.question": "Steg",
  "basics.answered": "Ifylld",
  "basics.missing": "Saknas",
  "basics.readThrough": "Läs igenom",
  "basics.notDeclared": "Inte intygat",
  "basics.noAnswerNeeded":
    "Det här steget innehåller ingen uppgift att fylla i — du läser det bara.",
  "basics.selfReported":
    "Det här är uppgifter du själv har lämnat. Ingen har kontrollerat dem, och att spara dem gör dem inte verifierade. Dina behörigheter och kontroller påverkas inte.",
  "basics.save": "Spara grunduppgifter",
  "basics.savedNotice": "Dina grunduppgifter är sparade.",
  // Named after what they change, not after where the control happens to sit.
  "basics.editWorkCountry": "Ändra arbetsland",
  "basics.editCurrentRole": "Ändra nuvarande roll",
  "basics.editProfession": "Ändra i din karriärprofil",
  "basics.editedInCareerProfile":
    "Ditt nuvarande yrke hör hemma i din karriärprofil under Min karriär, och ändras där. Det visas här eftersom det hör till bilden av dig \u2014 men det är en egen uppgift, inte verifierad passinformation.",
  "basics.editedBelow":
    "Den här uppgiften ändras där den hör hemma, längre ned på den här sidan, så att den bara har ett ställe att ändras på. Knappen tar dig dit.",
  "basics.declaredOn": "Intygat",
  "basics.declareAgain": "Intyga på nytt",
  "basics.declarationNote":
    "En försäkran kan inte tas tillbaka här. Har du ändrat något kan du intyga på nytt, och datumet uppdateras.",
  "basics.qualificationsTitle": "Arbetsland och behörigheter",
  "basics.qualificationsLead":
    "Var du arbetar, och de reglerade behörigheter du kan registrera där.",
  "jurisdiction.confirmPrompt":
    "Vi har inte bekräftat var du arbetar. Ange ditt land så att ditt Passport visar rätt sammanhang. Det påverkar inte vilka behörigheter du kan registrera.",
  "jurisdiction.confirmAction": "Ange var jag arbetar",
  "jurisdiction.workCountryAvailability":
    "Ange det land där du arbetar. Reglerade behörigheter kan i dag endast registreras för Sverige — Storbritannien och Dubai är under förberedelse. Du kan ange ditt land nu även om dess behörigheter ännu inte stöds.",
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
  // Neither card carries a control, and both look like the actionable cards
  // elsewhere in the product. This chip says outright how the right is
  // exercised, so nothing reads as a self-service button that does nothing.
  "privacy.handledOnRequest": "Sker på begäran",
  "privacy.deleteTitle": "Radera ditt Passport",
  "privacy.deleteBody":
    "Aktiva delningar återkallas först. Bekräftelser som en arbetsgivare har lämnat behålls i avidentifierad form.",
  // Was "Knapparna är inaktiva i prototypen." — which named buttons that do
  // not exist in this section, and called a product we are putting in front of
  // pilot customers a prototype. Export and deletion are real rights the login
  // page already promises; this says how to use them instead of implying a
  // control that was never built.
  "privacy.requestNote":
    "Vill du exportera eller radera dina uppgifter? Kontakta oss, så hanterar vi det.",
  "privacy.requestAction": "Kontakta CQrityjob",

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
  "card.noVerifiedExperience": "Ingen verifierad yrkeserfarenhet ännu",
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

  // ── Phase 5: evidence, verification, sharing and the recipient page ──
  "ev.title": "Underlag",
  "ev.lead":
    "Dokument du laddar upp är privata. Bara du ser dem — och en granskare hos CQrityjob, men bara så länge en granskning pågår.",
  "ev.add": "Lägg till dokument",
  "ev.uploading": "Laddar upp …",
  "ev.none": "Inga dokument ännu.",
  "ev.ceiling":
    "Att ladda upp ett dokument gör uppgiften Dokument inlämnat. Det blir inte Verifierat förrän någon annan har granskat det.",
  "ev.limits": "PDF, JPG, PNG eller HEIC. Högst 8 MB.",
  "ev.tooLarge": "Filen är för stor. Högst 8 MB.",
  "ev.badType": "Filtypen stöds inte. Använd PDF, JPG, PNG eller HEIC.",
  "ev.failed": "Uppladdningen misslyckades. Försök igen.",
  "ev.view": "Öppna",
  "ev.opening": "Öppnar …",
  // The defect: this sentence sat under the document list, on its own, right
  // after an upload — so "Länken gäller i fem minuter" was read as "your
  // document disappears in five minutes". The five minutes is correct and
  // stays; what changed is that it now says WHICH link, next to the button
  // that makes one, and that the document says separately that it is stored.
  "ev.saved": "Dokument uppladdat och sparat.",
  "ev.stored": "Dokumentet ligger kvar i ditt Passport tills du tar bort det.",
  "ev.linkShort":
    "Öppna-länken skapas när du klickar och slutar gälla efter fem minuter. Dokumentet påverkas inte.",
  "ev.replace": "Ersätt",
  "ev.replacing": "Ersätter …",
  "ev.replaceConfirm": "Välj den nya filen. Den gamla tas bort när den nya har sparats.",
  "ev.withdraw": "Ta bort",
  "ev.withdrawing": "Tar bort …",
  "ev.withdrawConfirm":
    "Dokumentet raderas. Uppgiften går tillbaka till egenrapporterad om det var det enda dokumentet.",
  "ev.underReview": "Går inte att ta bort under pågående granskning.",
  "ev.addOnlyUnderReview":
    "Du kan lägga till fler dokument under granskningen. Befintliga dokument kan inte tas bort förrän granskningen är klar.",
  "ev.count": "dokument",
  "ver.title": "Verifiering",
  "ver.lead":
    "Du kan aldrig verifiera dig själv. Verifiering görs av CQrityjob eller av en arbetsgivare som känner till anställningen.",
  "ver.request": "Begär verifiering",
  "ver.requestCq": "Låt CQrityjob granska dokumentationen",
  "ver.requestCqHelp":
    "En granskare läser dokumentet du laddat upp och avgör om det styrker uppgiften.",
  "ver.requestEmployer": "Be arbetsgivaren bekräfta anställningen",
  "ver.requestEmployerHelp":
    "Arbetsgivaren ser bara den här anställningsperioden och ditt namn. Inget annat i ditt Passport.",
  "ver.chooseEmployer": "Välj arbetsgivare",
  "ver.submitting": "Skickar …",
  "ver.submitted": "Begäran är skickad.",
  "ver.status": "Status",
  "ver.status.pending": "Under granskning",
  "ver.status.approved": "Godkänd",
  "ver.status.rejected": "Avslagen",
  "ver.status.clarification_requested": "Komplettering begärd",
  "ver.status.withdrawn": "Tillbakadragen",
  "ver.withdrawRequest": "Dra tillbaka begäran",
  "ver.withdrawRequestConfirm": "Granskningen avbryts. Du kan skicka in på nytt senare.",
  "ver.progressTitle": "Så går granskningen till",
  "ver.progress1": "Du skickar in uppgiften med underlag.",
  "ver.progress2": "Någon annan än du granskar den.",
  "ver.progress3": "Beslutet visas här, med vem, hur och när.",
  "ver.decidedBy": "Verifierad av",
  "ver.method": "Metod",
  "ver.method.document_review": "Dokumentgranskning",
  "ver.method.employer_confirmation": "Bekräftad av arbetsgivare",
  "ver.method.issuer_confirmation": "Bekräftad av utfärdare",
  "ver.validity": "Giltighet",
  "ver.validFrom": "Giltig från",
  "ver.validUntil": "Giltig till",
  "ver.messageToYou": "Meddelande till dig",
  "ver.decidedAt": "Beslut fattat",
  "ver.noRequests": "Ingen verifiering är begärd ännu.",
  "ver.clarificationCta": "Komplettera och skicka in igen",
  // ── Beslut som inte gick igenom ─────────────────────────────────────
  // Formuleringen gäller UNDERLAGET, aldrig personen. "Avslagen kandidat"
  // är inte det beslut som har fattats — någon har läst ett dokument och
  // bedömt att det inte styrker uppgiften.
  "ver.rejected.title": "Uppgiften kunde inte verifieras",
  "ver.rejected.body":
    "Vi kunde inte verifiera uppgiften utifrån det underlag som lämnades in. Uppgiften finns kvar i ditt Passport som egenrapporterad.",
  "ver.rejected.reason": "Granskarens motivering till dig",
  "ver.rejected.noReason":
    "Ingen motivering registrerades för det här beslutet. Kontakta CQrityjob om du vill veta mer.",
  "ver.rejected.next":
    "Du kan lägga till eller byta ut dokumentationen och begära en ny granskning.",
  "ver.resubmit.title": "Begär en ny granskning",
  "ver.resubmit.help":
    "Ladda upp den dokumentation som saknades och skicka in uppgiften igen. En granskare läser den på nytt.",
  "ver.resubmit.action": "Begär ny granskning",
  // ── Komplettering ───────────────────────────────────────────────────
  "ver.clarification.title": "Mer information behövs innan uppgiften kan verifieras",
  "ver.clarification.whatIsNeeded": "Det här behöver granskaren",
  "ver.clarification.noMessage":
    "Granskaren har begärt komplettering men ingen beskrivning registrerades. Kontakta CQrityjob så hjälper vi dig vidare.",
  "ver.clarification.action":
    "Lägg till dokumentationen under Dokumentation ovan. Granskningen fortsätter — du behöver inte skicka in uppgiften på nytt.",
  "ver.alreadyOpen": "Det finns redan en pågående begäran för den här uppgiften.",
  "ver.renew": "Begär förnyad verifiering",
  "ver.renewBody":
    "Giltigheten har gått ut eller går snart ut. Ladda upp ett nytt intyg och begär verifiering igen.",
  "ver.expiredNotice": "Verifierad, men giltigheten har gått ut.",
  "ver.expiringSoon": "Giltigheten går ut inom 60 dagar.",
  "ver.dispute": "Anmäl att uppgiften är fel",
  "ver.disputeBody":
    "Uppgiften markeras som ifrågasatt. Den räknas inte och delas inte förrän den är rättad.",
  "ver.disputeReason": "Vad är fel?",
  "ver.disputeSubmit": "Markera som ifrågasatt",
  "ver.revokedNotice": "Verifieringen har återkallats av CQrityjob.",
  "ver.historyTitle": "Vad som har hänt",
  "ver.historyEmpty": "Inget har hänt med den här uppgiften ännu.",
  "claim.back": "Tillbaka till Passport",
  "claim.notFound": "Uppgiften finns inte, eller tillhör inte dig.",
  "claim.trustState": "Underlag och status",
  // ── Archive, and why it is not dispute (pilot fix #1) ────────────────
  //
  // The tester asked how to remove an appointment and there was no answer for
  // anything that was not a draft: the holder's UPDATE policy refuses every
  // write to a verified claim, correctly, and that took the archive with it.
  // Archiving deletes nothing — the wording says so, because a holder who
  // believes it erases the record will use the dispute button instead.
  "claim.archive.title": "Ta bort från mitt aktiva Passport",
  "claim.archive.lead":
    "Uppgiften visas inte längre som aktuell och delas inte i nya utlämnanden. Den raderas inte: historik, dokumentation och eventuell verifiering finns kvar.",
  "claim.archive.action": "Arkivera uppgiften",
  "claim.archive.working": "Arkiverar …",
  "claim.archive.confirm":
    "Vill du ta bort uppgiften från ditt aktiva Passport? Den raderas inte, men du kan inte själv göra den aktuell igen.",
  "claim.archive.done": "Uppgiften är borttagen från ditt aktiva Passport.",
  // The line that keeps the two controls apart. Dispute is for information
  // that is WRONG and goes to en granskare; archive is the holder's own
  // decision about what their Passport presents.
  "claim.archive.notDispute":
    "Stämmer uppgiften inte? Anmäl den som fel i stället — då granskas den. Arkivering är för uppgifter som stämmer men som du inte vill visa.",
  "claim.archive.blockedDisputed":
    "Uppgiften är anmäld som fel och väntar på granskning. Den kan inte arkiveras förrän granskningen är klar.",
  "claim.archive.blockedReview": "En granskning pågår. Dra tillbaka begäran om verifiering först.",
  "claim.dispute.pending":
    "Uppgiften är markerad som bestridd och väntar på granskning. Den visas inte som aktuell och delas inte förrän någon har tittat på den.",
  "claim.correct": "Rätta uppgiften",
  "claim.correctLead":
    "En rättelse skapar en ny version. Den gamla versionen sparas i historiken — den raderas inte.",
  "claim.correctReason": "Varför rättas uppgiften?",
  "claim.correctSubmit": "Spara rättelse",
  "claim.remove": "Ta bort uppgiften",
  "claim.removeReason": "Varför tas den bort?",
  "claim.removeConfirm": "Uppgiften tas bort från ditt Passport. Historiken finns kvar.",
  "claim.openDetail": "Öppna",
  "claim.experienceTitle": "Anställning",
  "vq.title": "Verifieringskö",
  "vq.lead":
    "Begäranden om verifiering av Security Passport. Du ser bara det som behövs för granskningen, och bara så länge den är öppen.",
  "vq.notVerifier": "Du har inte behörighet att verifiera.",
  "vq.workspace.title": "Passgranskning",
  "vq.denied.heading": "Du har inte behörighet att granska pass",
  "vq.denied.body":
    "Den här arbetsytan är för utsedda passgranskare. Om du ska granska pass behöver CQrityjob tilldela dig granskarbehörigheten.",
  "vq.denied.back": "Tillbaka till Min karriär",
  "vq.empty": "Inget att granska just nu.",
  "vq.filter": "Visa",
  "vq.filter.open": "Öppna",
  "vq.filter.pending": "Under granskning",
  "vq.filter.clarification": "Väntar på komplettering",
  "vq.filter.approved": "Godkända",
  "vq.filter.rejected": "Avslagna",
  "vq.holder": "Innehavare",
  "vq.submittedAt": "Inskickad",
  "vq.evidence": "Underlag",
  "vq.noEvidence": "Inget dokument bifogat.",
  "vq.accessNote":
    "Du kan öppna dokumenten så länge granskningen är öppen. Sedan upphör åtkomsten.",
  "vq.open": "Öppna ärendet",
  "vq.decision": "Beslut",
  "vq.approve": "Godkänn",
  "vq.reject": "Avslå",
  "vq.requestClarification": "Begär komplettering",
  "vq.methodLabel": "Hur avgjordes det?",
  "vq.methodFixed": "Dokumentgranskning av CQrityjob",
  "vq.methodFixed.help":
    "CQrityjob har granskat det underlag som innehavaren lämnat. Detta är inte en direkt bekräftelse från arbetsgivaren eller utfärdaren.",
  "vq.legacy.title": "Äldre verifieringspost – manuell omprövning krävs",
  "vq.legacy.body":
    "Posten registrerades med en källmetod utan strukturell källbekräftelse. Den visas som Dokumenterad tills en behörig källa har bekräftat uppgiften.",
  "vq.methodRequired": "En godkänd verifiering måste ange metod.",
  "vq.noteInternal": "Intern motivering",
  "vq.noteInternalHelp":
    "Syns bara internt. Kommer aldrig med i ett delat Passport, på ett kort eller i en bild.",
  "vq.messageHolder": "Meddelande till innehavaren",
  "vq.messageHolderHelp": "Det här är vad personen får läsa.",
  "vq.messageHolderRequiredMark": "(obligatoriskt)",
  "vq.messageHolderRequiredHelp":
    "Obligatoriskt vid avslag och komplettering. Skriv vad som saknas eller varför underlaget inte räcker — det här är enda texten personen får läsa. Din interna anteckning visas aldrig.",
  "vq.validFrom": "Giltig från",
  "vq.validUntil": "Giltig till",
  "vq.confirmTitle": "Bekräfta beslutet",
  "vq.confirmApprove":
    "Uppgiften blir Verifierad och kan delas som verifierad. Beslutet sparas permanent med ditt namn.",
  "vq.confirmReject": "Uppgiften förblir egenrapporterad. Beslutet sparas permanent.",
  "vq.confirmClarify": "Innehavaren ombeds komplettera. Ärendet förblir öppet.",
  "vq.confirmYes": "Ja, spara beslutet",
  "vq.deciding": "Sparar …",
  "vq.decided": "Beslutet är sparat.",
  "vq.previousVersions": "Tidigare versioner",
  "vq.priorDecisions": "Tidigare beslut",

  // ── VAD KANDIDATEN UPPGER ────────────────────────────────────────────
  // Granskarens uppgift är att jämföra påståendet med underlaget. Därför
  // står påståendet först, med kandidatens egna ord, och underlaget under.
  "vq.claimHeading": "Vad kandidaten uppger",
  "vq.periodHeading": "Anställning kandidaten uppger",
  "vq.claimType": "Typ",
  "vq.credentialCode": "Utbildningskod",
  "vq.credentialReference": "Referensnummer",
  "vq.issuerStated": "Utfärdare (uppgiven)",
  "vq.jurisdiction": "Giltighetsområde",
  "vq.authorisationScope": "Begränsning",
  "vq.currentState": "Nuvarande status",
  "vq.version": "Version",
  "vq.employer": "Arbetsgivare",
  "vq.role": "Roll",
  "vq.period": "Period",
  "vq.employmentType": "Anställningsform",
  "vq.securityRelevance": "Säkerhetsrelevans",
  "vq.historyHeading": "Tidigare händelser",
  "vq.firstSubmission": "Första inlämningen. Inga tidigare versioner och inga tidigare beslut.",
  // Ett dokument verifierar ingenting i sig. Det är det granskaren bedömer
  // påståendet mot -- skillnaden hela produkten vilar på.
  "vq.evidenceNote":
    "Ett bifogat dokument styrker inte uppgiften i sig. Det är underlaget du bedömer uppgiften mot.",
  "vq.revoke": "Återkalla verifiering",
  "vq.revokeReason": "Varför återkallas den?",
  "vq.revokeConfirm":
    "Verifieringen upphör att gälla och uppgiften slutar delas. Återkallandet sparas i historiken.",
  "vq.immutableNote":
    "Beslut kan inte ändras i efterhand. Ett felaktigt beslut rättas med ett nytt beslut.",
  "emp.title": "Bekräfta anställning",
  "emp.lead":
    "En person har bett dig bekräfta en anställningsperiod hos er. Du ser bara den perioden.",
  "emp.scopeTitle": "Vad du ser och inte ser",
  "emp.scope1": "Du ser: personens namn och den anställning frågan gäller.",
  "emp.scope2": "Du ser inte: utbildningar, behörigheter, dokument eller andra anställningar.",
  "emp.scope3": "Du bedömer inte personen. Du bekräftar bara om uppgiften stämmer.",
  "emp.empty": "Inga förfrågningar just nu.",
  "emp.person": "Person",
  "emp.role": "Roll",
  "emp.period": "Period",
  "emp.employmentType": "Anställningsform",
  "emp.question": "Stämmer det här?",
  "emp.confirm": "Ja, det stämmer",
  "emp.reject": "Nej, det stämmer inte",
  "emp.correction": "Begär rättelse",
  "emp.message": "Meddelande till personen",
  "emp.confirmTitle": "Bekräfta ditt svar",
  "emp.confirmBody": "Ditt namn, din organisation och tidpunkten sparas tillsammans med svaret.",
  "emp.done": "Tack. Ditt svar är registrerat.",
  "emp.decided": "Besvarad",
  "emp.nav": "Passport-förfrågningar",

  // ── PR 8. Employment verification, as work an employer can find ────
  //
  // One vocabulary across both sides of the exchange. The candidate reads
  // "Väntar på Bevakning AB" and the employer reads "Anställningsverifiering";
  // neither ever reads "referens", because nobody here is being asked for an
  // opinion about a person.
  "empv.title": "Anställningsverifiering",
  "empv.lead":
    "Personer som uppger att de har arbetat hos er kan be er bekräfta uppgiften. Ni bekräftar fakta — inte personen.",
  "empv.openHeading": "Väntar på er",
  "empv.waitingHeading": "Väntar på personen",
  "empv.answeredHeading": "Besvarade",
  "empv.emptyTitle": "Inga förfrågningar just nu",
  "empv.emptyBody": "När någon ber er bekräfta en anställning hos er dyker den upp här.",
  "empv.review": "Granska",
  "empv.open": "Öppna",
  "empv.back": "Tillbaka till anställningsverifieringar",
  "empv.notFound": "Den här förfrågan finns inte bland era anställningsverifieringar.",
  "empv.factsTitle": "Anställning att bekräfta",
  "empv.organisation": "Organisation",
  "empv.securityRelevance": "Säkerhetsrelevans",
  "empv.extent": "Omfattning",
  "empv.submitted": "Inkom",
  "empv.responseTitle": "Ert svar",
  "empv.meaningTitle": "Vad en bekräftelse betyder",
  "empv.meaning1": "Ni bekräftar att de uppgivna anställningsuppgifterna stämmer med era register.",
  "empv.meaning2":
    "Ni säger ingenting om hur personen skötte arbetet, och ni rekommenderar inte personen.",
  "empv.meaning3": "CQrityjob har inte kontrollerat uppgiften — det är er bekräftelse som visas.",
  "empv.messageRequired": "Meddelande till personen (obligatoriskt)",
  "empv.messageOptional": "Meddelande till personen (frivilligt)",
  "empv.messageHelpCorrection":
    "Skriv vad som behöver rättas, till exempel: ”Våra register visar att anställningen slutade 31 oktober 2025.”",
  "empv.messageHelpReject":
    "Skriv varför ni inte kan bekräfta, till exempel: ”Vi hittar inga uppgifter om anställning under den angivna perioden.”",
  "empv.messageMissing": "Skriv ett meddelande till personen innan ni skickar svaret.",
  "empv.confirmAction": "Bekräfta anställningen",
  "empv.correctionAction": "Begär rättelse eller mer information",
  "empv.rejectAction": "Kan inte bekräfta",
  "empv.correctionNote":
    "Ni ändrar inte personens uppgifter. Personen rättar dem själv och kan därefter fråga igen.",
  "empv.send": "Skicka svaret",
  "empv.standingTitle": "Ni har redan begärt en rättelse",
  "empv.standingBody":
    "Personen har inte kommit tillbaka med en rättad uppgift ännu. Ni kan svara igen när de har gjort det — ert svar nedan ersätter det ni skrev tidigare.",
  "empv.askedOn": "Begärd",
  "empv.answered.approved": "Ni bekräftade anställningen",
  "empv.answered.rejected": "Ni kunde inte bekräfta anställningen",
  "empv.answered.clarification_requested": "Ni begärde rättelse eller mer information",
  "empv.answered.withdrawn": "Personen drog tillbaka förfrågan",
  "empv.yourMessage": "Ert meddelande till personen",
  "empv.selfTitle": "Ni kan inte bekräfta er egen anställning",
  "empv.selfBody":
    "Förfrågan gäller ert eget konto. Ingen kan verifiera sig själv, oavsett roll i organisationen. En kollega med behörighet owner eller admin får svara i stället.",
  "empv.workspaceTitle": "Välj organisation",
  "empv.workspaceLead": "Anställningsverifieringar hanteras i respektive organisations arbetsyta.",
  "empv.workspaceNone":
    "Ni är inte owner eller admin i någon organisation, så det finns inga anställningsverifieringar att hantera.",
  "empv.workspaceOpen": "väntar på er",
  "empv.workspaceNoneOpen": "Inget väntar på er",

  // ── PR 8. The candidate's side of the same exchange ────────────────
  //
  // Every one of these is composed as `key + " " + organisation`, the same
  // way `formatVerifierAttribution` composes an attribution line. The
  // organisation is never baked into a sentence, because the sentence is
  // translated and the organisation is not.
  "ver.employer.waitingFor": "Väntar på",
  "ver.employer.waitingBody":
    "Arbetsgivaren har fått frågan och ser bara den här anställningen och ditt namn.",
  "ver.employer.confirmedBy": "Anställningen är bekräftad av",
  "ver.employer.clarificationFrom": "Behöver kompletteras enligt",
  "ver.employer.clarificationBody":
    "Arbetsgivaren behöver mer information eller en rättelse innan de kan bekräfta anställningen.",
  "ver.employer.clarificationAction":
    "Rätta uppgiften under Uppgifter i ditt Passport och fråga sedan igen. Arbetsgivaren ändrar aldrig dina uppgifter åt dig.",
  "ver.employer.rejectedBy": "Kunde inte bekräftas av",
  "ver.employer.rejectedBody":
    "Arbetsgivaren hittade inget som stämmer med den anställning du angett. Uppgiften är kvar i ditt Passport som självrapporterad.",
  "ver.employer.rejectedNext":
    "Kontrollera datum, roll och organisation. Rätta det som blivit fel och fråga igen, eller be CQrityjob granska underlag i stället.",
  "ver.employer.messageFrom": "Meddelande från arbetsgivaren",
  "ver.employer.noMessage":
    "Arbetsgivaren lämnade inget meddelande. Kontakta dem direkt om du behöver veta varför.",
  "ver.employer.editEntry": "Rätta uppgiften",
  "ver.employer.notCqrityjob":
    "Det är arbetsgivaren som bekräftar, inte CQrityjob. Vi sparar vem som bekräftade, hur och när.",
  "ver.employer.unknownOrg": "arbetsgivaren",
  "ver.employer.notReference":
    "Arbetsgivaren blir ombedd att bekräfta de uppgifter du fyllt i — roll, datum och anställningsform. De blir inte ombedda att lämna ett omdöme om dig.",

  // ── Att hitta rätt arbetsgivare ──────────────────────────────────────
  //
  // Etiketterna nedan är ord, aldrig siffror. "Samma namn" är något du kan
  // kontrollera genom att titta på raden; "87 % träff" är det inte.
  "ver.employer.searchLabel": "Sök efter arbetsgivaren",
  "ver.employer.searchPlaceholder": "Skriv företagets namn",
  "ver.employer.searchHelp":
    "Vi föreslår organisationer som liknar den arbetsgivare du angett på anställningen. Du väljer själv — CQrityjob avgör aldrig att två företag är samma företag.",
  "ver.employer.searching": "Söker …",
  "ver.employer.searchUnavailable":
    "Arbetsgivarsökningen kunde inte köras just nu. Det betyder inte att arbetsgivaren saknas.",
  "ver.employer.searchRetry": "Försök igen",
  "ver.employer.noMatch": "Ingen matchande arbetsgivare hittades.",
  "ver.employer.noMatchHelp": "Prova en annan stavning eller en kortare del av namnet.",
  "ver.employer.reason.linked": "Tidigare tillfrågad",
  "ver.employer.reason.exact_name": "Samma namn",
  "ver.employer.reason.same_country": "Samma land",
  "ver.employer.reason.search": "Sökträff",
  "ver.employer.moreMatches":
    "Fler organisationer matchar än som visas. Skriv mer av namnet för att smalna av.",
  "ver.employer.countryUnknown": "Land ej angivet",
  "ver.employer.select": "Välj",
  "ver.employer.confirmTitle": "Begär bekräftelse från:",
  "ver.employer.confirmBody":
    "Kontrollera att detta är rätt organisation. Den får se den här anställningsperioden och ditt namn, och inget annat i ditt Passport.",
  "ver.employer.confirmAction": "Ja, skicka begäran",
  "ver.employer.confirmChange": "Välj en annan organisation",
  "ver.employer.notOnPlatform": "Min arbetsgivare finns inte på CQrityjob",
  "ver.employer.notOnPlatformTitle": "Om arbetsgivaren inte finns här",
  "ver.employer.notOnPlatformBody":
    "Bekräftelse från arbetsgivare kräver i dag att arbetsgivaren har ett organisationskonto på CQrityjob. Har de inget konto går det inte att begära bekräftelse den vägen.",
  "ver.employer.notOnPlatformNoInvite":
    "CQrityjob skickar ingen inbjudan och kontaktar inte arbetsgivaren åt dig.",
  "ver.employer.notOnPlatformAlt":
    "Du kan i stället låta CQrityjob granska dokumentation som styrker anställningen — anställningsbevis, arbetsgivarintyg eller lönespecifikation. Alternativet finns ovanför.",
  "ver.employer.notOnPlatformClose": "Stäng",
  "pkg.public_card.name": "Publikt Passport Card",
  "pkg.public_card.purpose": "Ett kort som visar din yrkesroll och dina verifierade behörigheter.",
  "pkg.verified_qualifications.name": "Verifierade behörigheter",
  "pkg.verified_qualifications.purpose":
    "För den som behöver kontrollera utbildning, certifikat och behörigheter.",
  "pkg.verified_experience.name": "Verifierad erfarenhet",
  "pkg.verified_experience.purpose": "För den som behöver kontrollera din yrkeserfarenhet.",
  "pkg.employer_review.name": "Arbetsgivargranskning",
  "pkg.employer_review.purpose": "Det en arbetsgivare normalt behöver inför ett samtal.",
  "pkg.full_verification.name": "Fullständigt verifieringspaket",
  "pkg.full_verification.purpose": "Allt som är verifierat, med fullständig attribution.",
  "pkg.inc.identity": "Ditt namn på den nivå du valt",
  "pkg.inc.professionJurisdiction": "Yrke och jurisdiktion",
  "pkg.inc.verifiedQualifications": "Verifierade behörigheter och utbildningar",
  "pkg.inc.verifiedEmployment": "Verifierade anställningar med arbetsgivare",
  "pkg.inc.verifiedTenureTotal": "Summerad verifierad tid i yrket",
  "pkg.inc.attribution": "Vem som verifierat, hur och när",
  "pkg.inc.validity": "Giltighetstid och nuvarande status",
  "pkg.exc.employers": "Arbetsgivares namn",
  "pkg.exc.qualifications": "Utbildningar och behörigheter",
  "pkg.exc.evidence": "Dina dokument",
  "pkg.exc.selfDeclared": "Egenrapporterade uppgifter",
  "pkg.exc.contact": "Kontaktuppgifter",
  "pkg.exc.internalNotes": "Interna anteckningar från granskning",
  "sc.title": "Dela ditt Passport",
  "sc.lead":
    "Du bestämmer om du delar, vad som delas, med vem och hur länge. Du kan återkalla när som helst.",
  "sc.needPassport": "Skapa ditt Passport först.",
  "sc.choosePackage": "Välj paket",
  "sc.packagesAreFixed":
    "Paketen är fasta. Det är därför en mottagare kan lita på vad de betyder — du kan inte plocka bort det som gör en uppgift begriplig.",
  "sc.includes": "Mottagaren ser",
  "sc.excludes": "Mottagaren ser inte",
  "sc.verifiedOnlyNote": "Bara verifierade uppgifter delas. Egenrapporterat delas aldrig.",
  "sc.nothingVerifiedTitle": "Du har inget verifierat ännu",
  "sc.nothingVerifiedBody":
    "En delningslänk skulle vara tom. Begär verifiering av en uppgift först.",
  "sc.expiry": "Länken slutar gälla",
  "sc.expiry.7": "Efter 7 dagar",
  "sc.expiry.30": "Efter 30 dagar",
  "sc.expiry.90": "Efter 90 dagar",
  "sc.expiry.never": "Ingen tidsgräns",
  "sc.purpose": "Syfte",
  "sc.purposePlaceholder": "Till exempel: ansökan väktare, Stockholm",
  "sc.recipientHint": "Mottagare",
  "sc.recipientHintHelp": "Bara för din egen översikt. Visas inte för mottagaren.",
  "sc.create": "Skapa delningslänk",
  "sc.creating": "Skapar …",
  "sc.createdTitle": "Länken är skapad",
  "sc.onceOnly":
    "Länken visas bara den här gången. Vi sparar den inte i klartext — kopiera den nu. Har du tappat bort den skapar du en ny och återkallar den gamla.",
  "sc.copy": "Kopiera länk",
  "sc.copied": "Kopierad",
  "sc.openRecipient": "Öppna mottagarvyn",
  "sc.qrTitle": "QR-kod",
  "sc.qrBody": "Leder till samma mottagarsida.",
  "sc.qrDownload": "Ladda ner QR-kod",
  "sc.imagesTitle": "Bilder att dela",
  "sc.imagesNote":
    "Bilden är marknadsföring. Den levande sidan är källan — den uppdateras och kan återkallas, det kan inte en bild.",
  "sc.historyTitle": "Dina delningar",
  "sc.historyEmpty": "Du har inte delat något ännu.",
  "sc.state.active": "Aktiv",
  "sc.state.expired": "Utgången",
  "sc.state.revoked": "Återkallad",
  "sc.created": "Skapad",
  "sc.expiresOn": "Gäller till",
  "sc.opened": "Öppnad",
  "sc.timesShort": "ggr",
  "sc.revoke": "Återkalla",
  "sc.revoking": "Återkallar …",
  "sc.revokeConfirm":
    "Länken slutar fungera direkt. Den som redan öppnat sidan ser inget nytt efter det.",
  "sc.revoked": "Delningen är återkallad.",
  "rec.brand": "CQrityjob",
  "rec.title": "Verifiering av Security Passport",
  "rec.checking": "Hämtar …",
  "rec.authoritative":
    "Den här sidan är källan. Den visar läget just nu och ändras om något återkallas eller går ut.",
  "rec.unavailableTitle": "Länken är inte tillgänglig",
  "rec.unavailableBody":
    "Länken kan ha gått ut, ha återkallats eller aldrig ha funnits. Be personen om en ny länk.",
  "rec.package": "Paket",
  "rec.purpose": "Syfte",
  "rec.holder": "Innehavare",
  "rec.anonymousHolder": "Namnet visas inte",
  "rec.profession": "Yrke",
  // ── Derived professional identity ────────────────────────────────────
  // Printed by every surface from one derivation. "Ingen aktiv yrkestitel"
  // is a true statement about somebody who has recorded training but holds
  // no current appointment, and it is deliberately not phrased as a failure:
  // finishing VU1 and not yet being appointed is an ordinary place to be.
  "identity.none": "Ingen aktiv yrkestitel",
  "identity.selfDeclared": "Egenrapporterad",
  "identity.selfDeclaredNote":
    "Titeln bygger på uppgifter du själv har lämnat och som ingen har kontrollerat. Den visas bara för dig.",
  "identity.education": "Genomförd utbildning",
  "identity.competence": "Yrkeskompetens",
  // "Nuvarande" rather than "Lokal": the operative fact for a reader is that
  // the approval is current, not that it is local. The note is not decoration
  // — it names the three things this is NOT, because an approval in the same
  // visual weight as an appointment invites exactly that misreading.
  "identity.eligibility": "Nuvarande behörighet",
  "identity.eligibilityNote":
    "Verifierat underlag för att en behörig myndighet eller arbetsgivare för närvarande godkänner personen. Det är inte en yrkestitel, ett förordnande eller en licens.",
  "identity.activeTitle": "Aktiv yrkestitel",
  "rec.cardTitle": "Delat Security Passport",
  "rec.detailsTitle": "Uppgifter i delningen",
  "rec.packageShows": "Den här delningen visar",
  "rec.expiredNotice":
    "En eller flera uppgifter är inte längre gällande. De visas med sitt nuvarande läge, inte som aktuella.",
  "rec.jurisdiction": "Jurisdiktion",
  "rec.qualifications": "Verifierade behörigheter",
  // A scope shown to a reader who may see it, and the honest placeholder for
  // one who may not. Saying "limited, details withheld" is narrower than
  // saying nothing and letting the reader assume the approval is unlimited.
  "rec.scopeLimited": "Begränsat godkännande",
  "rec.scopeWithheld":
    "Godkännandet gäller ett angivet skyddsobjekt, en arbetsgivare eller en uppdragsgivare. Omfattningen visas inte i den här vyn.",
  "rec.subJurisdiction": "Region",
  // The market the CREDENTIAL was issued under — never the holder's work
  // country, which is stated once at the top of the page. Without this row an
  // employer read a flat list of authorisations under one work location and
  // had nothing to tell them a Swedish appointment was Swedish.
  "rec.credentialMarket": "Gäller i",
  "rec.experience": "Verifierad anställning",
  "rec.tenure": "Verifierad tid i yrket",
  "rec.verifiedBy": "Verifierad av",
  "rec.method": "Metod",
  "rec.verifiedAt": "Verifierad",
  "rec.validUntil": "Giltig till",
  "rec.state": "Status",
  "rec.issuer": "Utfärdare",
  "rec.nothing": "Det här paketet innehåller inget verifierat just nu.",
  "rec.lastUpdated": "Senast uppdaterad",
  "rec.linkExpires": "Länken gäller till",
  "rec.checkedAt": "Kontrollerad",
  "rec.jurisdictionNote":
    "Jurisdiktion beskriver var uppgiften är utfärdad. Den säger ingenting om rätt att arbeta i något land.",
  "rec.notAssessment": "Det här är styrkta uppgifter, inte ett omdöme om personen.",
  "rec.ctaTitle": "Skapa ditt Security Passport",
  "rec.ctaBody": "Samla din yrkeserfarenhet och dina behörigheter. Du bestämmer vad som delas.",
  "rec.ctaAction": "Läs mer",
  "livecard.lockedNote":
    "Innehållet styrs av verifierade uppgifter. Du kan välja om du delar kortet — inte vad det påstår.",
  "livecard.selfReportedTitle": "Egenrapporterat kort",
  "livecard.selfReportedBody":
    "Inget är verifierat ännu, så kortet visar ingen verifieringsstämpel och ingen milstolpe.",
  "livecard.shareCta": "Dela kortet",
  "livecard.needShare": "Skapa en delningslänk för att kunna dela kortet.",
  "common.optional": "valfritt",
  "common.cancel": "Avbryt",
  "common.confirm": "Bekräfta",
  "common.back": "Tillbaka",
  "common.error": "Något gick fel. Försök igen.",
  "common.loading": "Hämtar …",
  "common.days": "dagar",

  // ── Credential forms (Phase 6) ───────────────────────────────────────
  // The four launch credentials. The credential NAMES are not here: they
  // come from sp_credential_types.name_sv/name_en, so adding a supported
  // credential needs no copy change. Only the surrounding form language and
  // the validation messages live here.
  "cred.add.title": "Lägg till behörighet eller utbildning",
  "cred.add.body":
    "Du fyller i uppgifterna själv. Allt du lägger till räknas som uppgivet av dig tills någon annan har kontrollerat det.",
  "cred.select.label": "Vad vill du lägga till?",
  "cred.select.placeholder": "Välj …",
  "cred.section.about": "Om behörigheten",
  "cred.section.dates": "Datum",
  "cred.section.evidence": "Underlag och anteckning",

  "cred.field.title": "Benämning",
  "cred.field.titleHelp":
    "Benämningen bestäms av behörigheten du valde och kan inte ändras. Den ska stämma med beslutet eller beviset.",
  "cred.field.trainingProvider": "Utbildningsanordnare",
  // What a scoped authorisation is limited to. A skyddsvakt approval shown
  // without it reads as a general national licence, which is not what was
  // granted — so the field is required, not optional.
  "cred.field.scope": "Omfattning",
  "cred.field.scopeHelp":
    "Vilken arbetsgivare, uppdragsgivare eller vilket skyddsobjekt förordnandet gäller för. Står på beslutet.",
  "cred.field.narrowResultOnly":
    "Här registreras endast att kontrollen är gjord, med myndighet och datum. Inga uppgifter om vad kontrollen visade sparas.",
  "cred.field.appointingAuthority": "Förordnande myndighet",
  "cred.field.authorityHelp": "Myndigheten som fattade beslutet, till exempel Polismyndigheten.",
  "cred.field.jurisdiction": "Land",
  "cred.field.completedOn": "Slutfört datum",
  "cred.field.decidedOn": "Beslutsdatum",
  "cred.field.validFrom": "Gäller från",
  "cred.field.validUntil": "Gäller till",
  "cred.field.validUntilRequired": "Gäller till (obligatoriskt för förordnande)",
  "cred.field.reference": "Referens- eller beslutsnummer",
  "cred.field.referenceHelp": "Visas aldrig publikt. Endast du och en granskare ser det.",
  "cred.field.holderNote": "Din egen anteckning",
  "cred.field.holderNoteHelp":
    "Dina egna ord. Markeras alltid som uppgiven av dig och delas aldrig publikt.",

  "cred.appointment.notice":
    "Ett förordnande är en tidsbegränsad behörighet. Utbildning är inte samma sak som ett gällande förordnande.",
  "cred.qualification.notice":
    "Detta är en genomförd utbildning. Den har inget slutdatum om inte beviset anger ett.",

  "cred.action.saveDraft": "Spara utkast",
  "cred.action.saving": "Sparar …",
  "cred.action.savedAt": "Utkast sparat",
  "cred.action.resume": "Fortsätt med utkast",
  "cred.action.activate": "Lägg till i passet",
  "cred.action.submitVerification": "Skicka för kontroll",
  "cred.action.uploadEvidence": "Ladda upp underlag",
  "cred.action.correct": "Rätta uppgift",
  "cred.action.discard": "Ta bort utkast",
  // ── SAVE VS FINALISE, IN WORDS ────────────────────────────────────────
  // "Spara utkast" keeps the entry as a draft and asks nothing of it.
  // "Lägg till i passet" is the step that makes it real, and it needs the
  // obligatoriska fälten. Saying which is which next to the buttons is what
  // stops "sparat" reading as "klart".
  "cred.action.lifecycleNote":
    "Spara utkast behåller uppgiften som utkast — bara du ser den. Lägg till i passet gör den aktiv i ditt Passport och kräver att de obligatoriska fälten är ifyllda.",
  "cred.action.draftKept":
    "Sparat som utkast. Den ligger kvar tills du lägger till den i ditt Passport.",
  // Specific refusals from the server. The generic "Något gick fel" was
  // shown for every one of these, including the ones the holder could act on.
  "cred.error.serverIncomplete":
    "Något obligatoriskt fält saknas eller är fel ifyllt. Kontrollera fälten ovan och försök igen.",
  "cred.error.serverInvalid":
    "Uppgiften kunde inte sparas som utkast. Kontrollera fälten ovan och försök igen.",
  "cred.error.serverUnknownCode":
    "Den här behörigheten går inte att registrera längre. Välj en annan i listan.",

  "cred.error.selectCredential": "Välj vilken behörighet du lägger till.",
  "cred.error.titleRequired": "Ange en benämning.",
  "cred.error.jurisdictionRequired": "Ange land.",
  "cred.error.authorityRequired": "Ange vilken myndighet som förordnade dig.",
  "cred.error.validUntilRequired": "Ett förordnande måste ha ett slutdatum.",
  "cred.error.scopeRequired":
    "Ange vad förordnandet är begränsat till. Utan det framstår det som ett generellt nationellt tillstånd.",
  "cred.error.noNoteAllowed":
    "Den här uppgiften kan inte ha någon anteckning. Endast själva kontrollen registreras.",
  "cred.error.controlledLabelOnly":
    "Den här uppgiften har en fast benämning och kan inte skrivas om.",
  // "Format" was never the whole rule -- the shape check accepted
  // 2026-13-45. The message now says what a valid answer is.
  "cred.error.dateFormat": "Ange ett giltigt datum (ÅÅÅÅ-MM-DD).",
  "cred.error.dateFuture": "Datumet kan inte ligga i framtiden.",
  "cred.error.endBeforeStart": "Slutdatumet måste vara efter startdatumet.",
  "cred.error.referenceTooLong": "Referensen är för lång (max 120 tecken).",
  "cred.error.noteTooLong": "Anteckningen är för lång (max 2000 tecken).",
  "cred.error.incompleteForActive":
    "Fyll i de obligatoriska fälten innan du lägger till uppgiften.",
  "cred.error.incompleteForVerification":
    "Uppgiften måste vara komplett innan den skickas för kontroll.",
  // "nedan" was a lie about the layout. The summary renders after the fields,
  // so everything it referred to was ABOVE it — a tester read the sentence,
  // looked below it and found the buttons. Neutral wording is correct wherever
  // the summary happens to sit, and the invalid fields carry their own
  // field-level message and aria-invalid regardless.
  "cred.errorSummary": "Kontrollera de markerade fälten.",

  // ── Which regulated credentials this holder may register (pilot fix #1) ──
  //
  // The selector used to show every ACTIVE credential type, which is the eight
  // Swedish ones — to everybody, including a holder who had told the product
  // they work in Dubai. These are the sentences that replace that list when
  // the holder's own market is not open, and they name the market, because
  // "nothing available" without saying which market is the kind of vagueness a
  // holder reads as a fault in their own Passport. The per-country sentence
  // itself is `workCountry.support.*`, reused rather than restated.
  "cred.market.unavailableTitle": "Inga reglerade behörigheter att registrera ännu",
  "cred.market.stillPossible":
    "Du kan fortfarande lägga till språk, körkort och andra intyg under Mina uppgifter. De hör inte till en reglerad marknad och påverkas inte av det här.",
  "cred.market.keepsExisting":
    "Behörigheter du redan har registrerat finns kvar, med sitt eget land och sin status. De ändras inte av att du byter arbetsland.",
  "cred.market.noWorkCountry":
    "Ange först var du arbetar. Vilka reglerade behörigheter som kan registreras beror på arbetslandet.",
  "cred.market.setWorkCountry": "Ange arbetsland",

  // ── Market profiles ─────────────────────────────────────────────────
  //
  // The market NAME is never baked into these sentences. It is rendered beside
  // them by formatWorkLocation, so one set of strings serves every market and
  // a market added to sp_market_packs needs no copy release. The headings are
  // therefore prefixes and suffixes, which read correctly in both languages
  // because both put the country in the same place.
  "market.step.workMarket": "Arbetsmarknad",
  "market.workMarket.question": "Var arbetar du eller vill du använda ditt Security Passport?",
  "market.registerNote": "Reglerade behörigheter kan endast registreras för det valda landet.",
  "market.section.credentialsFor": "Behörigheter och utbildningar för",
  // ── The internal pilot status line ──────────────────────────────────
  //
  // Restrained on purpose. This is a market STATUS, not a warning: it sits
  // once, beside the market name, in the same register as the rest of the
  // page. A red alert on every screen would train the tester to dismiss it,
  // and the thing it has to convey is a fact, not a danger.
  //
  // What it must never do is let an unreviewed market read as a live one.
  "market.pilot.status": "Intern pilotmarknad — regulatoriskt innehåll granskas fortfarande",
  "market.pilot.body":
    "Du deltar i en intern pilot för den här marknaden. Uppgifter du registrerar sparas i ditt Security Passport med sin egen jurisdiktion. Marknaden är ännu inte öppen för alla och innehållet är inte juridiskt godkänt.",
  "market.section.lead": "Välj en behörighet eller utbildning för att lägga till och fortsätta.",
  "market.pending.headingSuffix": "är ännu inte öppnad",
  "market.pending.body":
    "Registrering av lokala behörigheter för den här marknaden är ännu inte öppnad. Du kan ange den som arbetsmarknad redan nu. Dina verifierade uppgifter från andra länder finns kvar i ditt Security Passport.",
  "market.unsupported.heading": "Marknaden stöds inte ännu",
  "market.unsupported.body": "Den här marknaden stöds ännu inte för reglerade behörigheter.",
  "market.noWorkCountry.heading": "Ange arbetsmarknad först",
  "market.other.title": "Verifierat i andra marknader",
  "market.other.lead":
    "Uppgifter du har verifierat i andra marknader. De hör till sitt eget land och redigeras där, inte härifrån.",
  "market.other.none": "Du har inga verifierade uppgifter i andra marknader ännu.",
  "market.verified.one": "verifierad",
  "market.verified.many": "verifierade",
  "market.details.show": "Visa detaljer",
  "market.details.hide": "Dölj detaljer",
  "market.currentMarket.none": "Inga verifierade uppgifter i denna marknad ännu.",
  "card.verifiedMarkets": "Verifierade marknader",
  "card.currentWorkMarket": "Aktuell arbetsmarknad",
  "cred.field.credentialCountry": "Behörighetens land",
  "cred.field.credentialCountryHelp":
    "Behörigheten hör till det här landet, oavsett var du arbetar i dag. Den ändras inte om du byter arbetsland.",

  // ── Structured entry (Phase 8) ───────────────────────────────────────
  "entry.save": "Spara",
  "entry.saving": "Sparar …",
  "entry.saved": "Sparat.",
  "entry.edit": "Ändra",
  "entry.remove": "Ta bort",
  "entry.removeConfirm": "Ta bort uppgiften? Det går inte att ångra.",
  "entry.removeBlocked":
    "Uppgiften kan inte tas bort längre eftersom den har underlag eller en granskning. Rätta den i stället.",
  "entry.add": "Lägg till",
  "entry.none": "Inget tillagt ännu.",
  "entry.selfDeclaredNote":
    "Allt du lägger till är egenrapporterat tills någon annan har kontrollerat det.",

  "entry.emp.employer": "Arbetsgivare",
  "entry.emp.role": "Roll",
  "entry.emp.startedOn": "Från och med",
  "entry.emp.endedOn": "Till och med",
  "entry.emp.ongoing": "Jag arbetar kvar här",
  "entry.emp.employmentType": "Anställningsform",
  "entry.emp.type.full_time": "Heltid",
  "entry.emp.type.part_time": "Deltid",
  "entry.emp.type.hourly": "Timanställd",
  "entry.emp.type.temporary": "Vikariat eller visstid",
  "entry.emp.extent": "Omfattning",
  "entry.emp.extentHelp": "Hur stor del av en heltid tjänsten motsvarade.",
  "entry.emp.relevance": "Hur mycket av arbetet var säkerhetsarbete?",
  "entry.emp.relevanceHelp":
    "Vi gissar aldrig utifrån titeln. En receptionist med säkerhetsansvar och en väktare är inte samma sak.",
  "entry.emp.relevance.primary": "Hela arbetet var säkerhetsarbete",
  "entry.emp.relevance.partial": "En del av arbetet var säkerhetsarbete",
  "entry.emp.relevance.none": "Inget säkerhetsarbete",
  "entry.emp.securityShare": "Ungefär hur stor del?",
  "entry.emp.securityShareHelp": "Anges uttryckligen — beräkningen antar aldrig en andel.",

  "entry.claim.title": "Benämning",
  "entry.claim.titleHelp": "Namnet som står på beviset, intyget eller kursbeskrivningen.",
  "entry.claim.school": "Skola eller lärosäte",
  "entry.claim.certBody": "Certifierande organ",
  "entry.claim.organisation": "Organisation",
  "entry.claim.confirmedBy": "Bekräftas av",
  "entry.claim.completedOn": "Slutfört datum",
  "entry.claim.hasExpiry": "Uppgiften har ett slutdatum",

  "entry.error.employerRequired": "Ange arbetsgivare.",
  "entry.error.roleRequired": "Ange roll.",
  "entry.error.titleRequired": "Ange en benämning.",
  "entry.error.startRequired": "Ange startdatum.",
  "entry.error.endRequired": "Ange slutdatum.",
  "entry.error.endBeforeStart": "Slutdatumet måste vara efter startdatumet.",
  "entry.error.fractionRange": "Välj en andel mellan 0 och 100 procent.",
  "entry.documentAndVerify": "Underlag och kontroll",
  "exp.verifiedLabel": "Verifierad tid i yrket",
  "exp.noneYet": "Ingen verifierad tid ännu",
  "exp.selfDeclaredAlso": "Egenrapporterat, inte kontrollerat:",
  "share2.title": "Dela ditt Passport",
  "share2.lead":
    "En länk som visar dina verifierade uppgifter. Du kan återkalla den när som helst.",
  "share2.primary": "Dela mitt Passport",
  "share2.creating": "Skapar länk …",
  "share2.share": "Dela",
  "share2.copy": "Kopiera säker länk",
  "share2.view": "Visa Passport",
  "share2.copied": "Länken är kopierad",
  "share2.ready": "Länken är klar",
  "share2.terms": "Gäller i 30 dagar. Du kan återkalla den när som helst.",
  "share2.whatIsShared":
    "Länken visar bara verifierade uppgifter — inget egenrapporterat, inga dokument och inga referensnummer.",
  "share2.nothingVerified":
    "Du har inget verifierat ännu, så en länk skulle vara tom. Lägg till dina uppgifter och skicka dem för kontroll först.",
  "share2.more": "Fler alternativ",
  "share2.moreHint": "Egen giltighetstid, QR-kod, bilder och aktiva länkar.",
  "share2.activeLinks": "Aktiva länkar",
  "share2.cacheNote":
    "En nedladdad eller publicerad bild kan finnas kvar hos plattformen även efter att du återkallat länken. Själva sidan slutar fungera direkt.",
  "vq.error.queue": "Kön kunde inte hämtas.",
  "vq.error.detail": "Ärendet kunde inte öppnas.",
  "vq.error.evidence": "Dokumentet kunde inte öppnas.",
  "vq.error.decision": "Beslutet kunde inte sparas. Dina val är kvar — försök igen.",
  "vq.retry": "Försök igen",
  // A refusal the reviewer can act on. One line each: what happened, and what
  // to do instead. None of them says "try again" unless trying again is
  // genuinely the right move.
  "vq.decline.self_verification":
    "Det här är din egen ansökan. Du kan inte verifiera dig själv — en annan granskare måste ta beslutet.",
  "vq.decline.not_authorised": "Du har inte behörighet att besluta i det här ärendet.",
  "vq.decline.already_decided": "Ärendet är redan avgjort. Ladda om sidan för att se beslutet.",
  "vq.decline.not_found": "Ärendet finns inte längre.",
  "vq.decline.method_required": "Ett godkännande måste ange en verifieringsmetod.",
  "vq.decline.method_not_permitted":
    "Den verifieringsmetoden är inte tillåten för den här typen av ärende. En CQrityjob-granskning registreras som dokumentgranskning, och en arbetsgivarbekräftelse kan bara lämnas av arbetsgivaren.",
  "vq.decline.holder_message_required":
    "Avslag och komplettering måste ha ett meddelande till innehavaren. Skriv vad som saknas eller varför underlaget inte räcker.",
  "vq.decline.invalid_validity":
    "Giltighetstiden går inte att spara. Kontrollera att slutdatum ligger efter startdatum, och att ett tidsbegränsat förordnande har ett slutdatum.",
  "vq.decline.issuer_required":
    "Den här behörigheten måste ange vilken myndighet som utfärdat den.",
  "vq.decline.entry_not_active":
    "Uppgiften har ändrats sedan granskningen öppnades och går inte längre att besluta om. Ladda om sidan.",
  "vq.decline.unknown": "Beslutet kunde inte sparas. Dina val är kvar — försök igen.",

  // ── The dispute queue (pilot fix #1) ─────────────────────────────────
  //
  // A holder pressed "Anmäl att uppgiften är fel", the entry became Bestridd,
  // and it appeared in no queue anywhere — sp_verifier_queue reads
  // verification REQUESTS, and a dispute creates none. This is the destination
  // the tester went looking for and did not find.
  "vq.dispute.title": "Bestridda uppgifter",
  "vq.dispute.lead":
    "Uppgifter som innehavaren har anmält som felaktiga. Varje ärende avgörs av en människa — ingenting avgörs automatiskt.",
  "vq.dispute.empty": "Inga bestridda uppgifter just nu.",
  "vq.dispute.holder": "Innehavare",
  "vq.dispute.reported": "Anmäld",
  "vq.dispute.reason": "Innehavarens motivering",
  "vq.dispute.noReason": "Ingen motivering registrerad.",
  "vq.dispute.evidence": "dokument",
  "vq.dispute.note": "Anteckning (valfri)",
  "vq.dispute.restore": "Uppgiften stämmer — återställ",
  "vq.dispute.withdraw": "Uppgiften stämmer inte — ta bort",
  "vq.dispute.resolving": "Avgör …",
  "vq.dispute.resolved": "Ärendet är avgjort.",
  "vq.dispute.self": "Du kan inte avgöra en anmälan om din egen uppgift.",
  "vq.dispute.restoreHelp":
    "Uppgiften blir aktuell igen, oförändrad. Verifieringsnivån påverkas inte.",
  "vq.dispute.withdrawHelp":
    "Uppgiften tas bort från innehavarens aktiva Passport. Ingenting raderas och ingen verifiering rivs upp — det görs i så fall separat.",
  // The self-review notice, shown before anything is filled in.
  "vq.selfBadge": "Din egen ansökan",
  "vq.selfNotice":
    "Det här är din egen ansökan. Ingen får verifiera sina egna uppgifter, så beslutsformuläret är avstängt här. En annan granskare måste ta beslutet.",
  "cw.detailsTitle": "Uppgifter",
  "cw.shareCredential": "Dela den här behörigheten",
  "cw.creating": "Skapar länk …",
  "cw.addToLinkedIn": "Lägg till på LinkedIn",
  "cw.linkedInPanel": "Uppgifter för LinkedIn",
  "cw.linkedInHow":
    "LinkedIn fyller inte i uppgifterna automatiskt. Kopiera dem här, öppna LinkedIn och klistra in dem i formuläret.",
  "cw.liName": "Namn",
  "cw.liOrg": "Utfärdande organisation",
  "cw.liIssued": "Utfärdat",
  "cw.liExpires": "Upphör att gälla",
  "cw.liId": "Legitimerings-ID",
  "cw.liUrl": "Länk till legitimering",
  "cw.copyDetails": "Kopiera uppgifter",
  "cw.copied": "Uppgifterna är kopierade",
  "cw.openLinkedIn": "Öppna LinkedIn",
  "cw.notShareable":
    "Bara en verifierad och gällande behörighet kan delas för sig. Skicka den för kontroll först.",

  "info.title": "Mina uppgifter",
  "info.lead":
    "Här lägger du in din bakgrund. Allt sparas direkt och du kan fortsätta när du vill. Behörigheter har egna formulär eftersom de har egna regler.",
  "info.employment": "Anställningar",
  // Phase 11 — languages and practical skills.
  "info.languages": "Språk",
  "info.skills": "Praktiska färdigheter",
  "skill.lead.language":
    "Språk du använder i arbetet. Nivån följer den europeiska skalan, så en läsare vet vad den betyder.",
  "skill.lead.practical_skill": "Behörigheter och intyg som har en utfärdare och går att styrka.",
  "skill.add.language": "Lägg till språk",
  "skill.add.practical_skill": "Lägg till behörighet",
  "skill.field.language": "Språk",
  "skill.field.skill": "Behörighet",
  "skill.field.level": "Nivå",
  "skill.field.category": "Behörighetsklass",
  "skill.field.jurisdiction": "Utfärdat i (landskod)",
  "skill.field.validUntil": "Giltigt till och med",
  "skill.field.note": "Egen anteckning",
  "skill.noteHelp": "Syns bara för dig och för den som granskar. Delas aldrig.",
  "skill.none.language": "Inga språk tillagda ännu.",
  "skill.none.practical_skill": "Inga behörigheter tillagda ännu.",
  "skill.selfDeclared": "Egen uppgift tills någon har granskat underlag för den.",
  "skill.levelRequired": "Välj en nivå.",
  "skill.jurisdictionRequired": "Välj var behörigheten är utfärdad.",
  "skill.levelNotApplicable": "Den här behörigheten har ingen nivå.",
  "skill.levelInvalid": "Välj en nivå ur listan.",
  "skill.validUntilRequired": "Den här behörigheten har ett slutdatum.",
  // CEFR, in words rather than bare codes. The code is kept in parentheses so
  // a reader who knows the scale still recognises it.
  "skill.cefr.A1": "Nybörjare (A1)",
  "skill.cefr.A2": "Grundläggande (A2)",
  "skill.cefr.B1": "Självständig (B1)",
  "skill.cefr.B2": "Avancerad (B2)",
  "skill.cefr.C1": "Mycket avancerad (C1)",
  "skill.cefr.C2": "Behärskar fullständigt (C2)",
  "skill.cefr.native": "Modersmål",
  "info.employmentLead":
    "Lägg till varje anställning för sig. Överlappande perioder räknas bara en gång.",
  "info.addEmployment": "Lägg till anställning",
  "nav.information": "Mina uppgifter",

  // ── Credential UI (Phase 7) ──────────────────────────────────────────
  "cred.category.qualification": "Genomförd utbildning",
  "cred.category.appointment": "Tidsbegränsat förordnande",
  "cred.field.validFromHelp": "Endast om beslutet anger ett annat startdatum än beslutsdatumet.",
  "cred.docsNotApproval":
    "Underlag är inte samma sak som godkännande. En uppladdad handling gör uppgiften dokumenterad — bara en genomförd kontroll kan göra den verifierad.",
  "cred.evidenceNext":
    "När uppgiften är tillagd kan du ladda upp underlag och skicka den för kontroll.",
  "cred.addAction": "Lägg till behörighet",
  "cred.overview.title": "Behörigheter och utbildningar",
  "cred.overview.body":
    "Lägg till VU1, VU2, ordningsvaktsförordnande eller skyddsvaktsförordnande. Du kan spara ett utkast och fortsätta senare.",
  "cred.drafts.title": "Utkast",
  "cred.drafts.lead": "Sparade men inte tillagda. Bara du ser dem.",
  "cred.drafts.updated": "Senast sparat",
  "cred.drafts.untitled": "Utan benämning",
  "cred.discardConfirm": "Utkastet tas bort permanent. Det går inte att ångra.",
  "cred.discarded": "Utkastet är borttaget.",
  "cred.onboardingCta": "Lägg till den nu",
  "cred.new.resumeOr": "eller börja på en ny",
  "cred.added": "Uppgiften är tillagd i ditt Passport.",

  "cred.correct.title": "Rätta uppgiften",
  "cred.correct.trustNote":
    "En rättelse skapar en ny version och behåller den gamla i historiken. Om du ändrar det som intygas börjar den nya versionen om som egenrapporterad — en eventuell verifiering följer inte med.",
  "cred.correct.reason": "Vad rättar du?",
  "cred.correct.reasonHelp": "Sparas i historiken tillsammans med rättelsen.",
  "cred.correct.reasonRequired": "Ange vad du rättar.",
  "cred.correct.submit": "Spara rättelsen",
  "cred.versions.title": "Versionshistorik",
  "cred.versions.lead":
    "Tidigare versioner sparas och märks som ersatta. Ingen version försvinner.",
  "cred.versions.current": "Gällande",
  "cred.versions.recordedAt": "Registrerad",

  // ── LinkedIn sharing (fallback experience) ───────────────────────────
  "li.shareText":
    "Mitt verifierade Security Passport från CQrityjob. Länken visar vad som är granskat och av vem.",
  "li.title": "Dela på LinkedIn",
  "li.lead":
    "Så här ser ditt kort ut i LinkedIns format. Tre steg: ladda ner bilden, kopiera länken, bifoga bilden i ditt inlägg.",
  "li.step1": "Ladda ner kortbilden i LinkedIns format (1200×630).",
  "li.step1Action": "Ladda ner bilden",
  "li.step1Done": "Nedladdad — ladda ner igen",
  "li.step2": "Kopiera den levande verifieringslänken och klistra in den i inlägget.",
  "li.step3":
    "Öppna LinkedIn och bifoga den nedladdade bilden i inlägget. Bilden bifogas inte automatiskt.",
  "li.step3Action": "Öppna LinkedIn",
  "li.previewNote":
    "Länkens automatiska förhandsvisning på LinkedIn visar CQrityjobs allmänna kort — inte ditt personliga. Ditt kort syns när du själv bifogar bilden. Länken är alltid källan: sidan bakom den visar aktuellt läge och kan återkallas.",
  "sc.retentionNote":
    "Sociala plattformar kan behålla bilder som redan publicerats eller cachats — även efter att du återkallat länken. Det du återkallar är sidan bakom länken, inte kopior av bilden.",

  // ── Share panel (restructured /passport/share) ───────────────────────
  "sp.verify": "Verifiera Passport",
  "sp.verifyHint": "Öppnar den levande sidan som mottagaren ser.",
  "sp.feed": "Dela i flöde",
  "sp.deviceShare": "Dela på enheten",
  "sp.more": "Fler delningsalternativ",
  "sp.imagesTitle": "Bilder för sociala medier",
  "sp.securityDetails": "Om länken och säkerheten",
  "share.channel.instagram": "Instagram",
  "share.channel.copyUrl": "Kopiera URL",
  "share.channel.instagramHint": "Ladda ned Story-bilden och lägg upp den i appen.",

  // ── Lägg till i LinkedIn-profil ──────────────────────────────────────
  "lip.title": "Lägg till i LinkedIn-profil",
  "lip.lead":
    "Lägg en verifierad merit på din profil, inte bara i ett flöde. Länken som följer med är din levande verifieringssida.",
  "lip.addCert": "Lägg till Certifikat",
  "lip.addEdu": "Lägg till Utbildning",
  "lip.certGroup": "Certifikat och behörigheter",
  "lip.eduGroup": "Utbildningar",
  "lip.noneCert": "Du har ingen verifierad behörighet att lägga till ännu.",
  "lip.noneEdu": "Du har ingen verifierad utbildning att lägga till ännu.",
  "lip.fieldsTitle": "Uppgifterna LinkedIn frågar efter",
  "lip.copyFields": "Kopiera uppgifterna",
  "lip.copied": "Uppgifterna är kopierade",
  "lip.openLinkedIn": "Öppna LinkedIn",
  "lip.prefillNote":
    "LinkedIn fyller inte alltid i fälten åt dig. Kopiera uppgifterna först — då har du dem redo när formuläret öppnas.",
  "lip.fieldCourse": "Utbildning",
  "lip.fieldProvider": "Utbildningsanordnare",
  "lip.fieldCompleted": "Avslutad",

  // ── Disclosing to one employer, through one application ──────────────
  "ad.title": "Dela ditt Passport med den här arbetsgivaren",
  "ad.lead":
    "Att söka jobbet delar ingenting från ditt Passport. Arbetsgivaren ser bara det du uttryckligen väljer här, och du kan återkalla det när du vill.",
  "ad.needPassport":
    "Du har inget Passport ännu. Skapa det först, så kan du välja vad du vill dela.",
  "ad.openPassport": "Öppna Security Passport",
  "ad.share": "Dela med arbetsgivaren",
  "ad.sharing": "Delar …",
  "ad.change": "Ändra det du delar",
  "ad.cancel": "Avbryt",
  "ad.nothingShared": "Du har inte delat något från ditt Passport med den här arbetsgivaren.",
  "ad.sharedNow": "Delat med arbetsgivaren",
  "ad.replacesPrevious":
    "En ny delning ersätter den förra för samma ansökan. Arbetsgivaren ser bara den senaste.",
  "ad.error": "Delningen kunde inte sparas. Försök igen.",
  "ad.revokeError": "Delningen kunde inte återkallas. Försök igen.",
  "ad.employerTitle": "Delat från kandidatens Security Passport",
  "ad.employerLead":
    "Kandidaten har själv valt att dela detta med er. Det är inte hämtat från ansökan och kan återkallas av kandidaten när som helst.",
  "ad.employerOnlyVerified":
    "Bara verifierade uppgifter visas här. Egenrapporterat delas aldrig i ett paket.",
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
  "screen.marketProfiles": "Market profiles",
  "screen.welcome": "Welcome and purpose",
  "screen.onboarding": "Get started",
  "screen.overview": "My Security Passport",
  "screen.timeline": "Experience timeline",
  "screen.card": "Passport Card",
  "screen.share": "Share",
  "screen.sharePanel": "Share panel (live)",
  "screen.shareHistory": "Sharing history",
  "screen.recipient": "Recipient view",
  "screen.privacy": "Privacy",
  "screen.studio": "Card studio",
  "screen.symbols": "Credential symbols",
  "screen.credentialForm": "Credential form",
  "screen.credentialHistory": "Correction and versions",
  "screen.linkedin": "LinkedIn sharing",
  "screen.recipientCard": "Recipient Passport card",
  "screen.entries": "My information",
  "symbols.title": "The CQrityjob credential symbols",
  "symbols.lead":
    "Four original marks — VU1, VU2, OV and SV — in every state the system knows. Status is always carried by the word, the border style and the status glyph together; colour is never the only channel. Only a current, verified credential receives the full gold treatment.",
  "symbols.freeText": "Free-text credential",
  "symbols.smallSize": "Smallest card size (28 px)",
  "symbols.withWord": "Mark with its status word",
  "nav.overview": "Overview",
  "nav.onboarding": "Get started",
  "nav.card": "Passport Card",
  "nav.credentials": "Credentials",
  "nav.privacy": "Privacy",
  "live.loading": "Loading your Security Passport …",
  "live.error": "Something went wrong. Please try again.",
  "live.readError": "We couldn't load your Security Passport.",
  "live.readErrorBody":
    "Nothing in your Passport has been changed or removed. Please try again in a moment.",
  "live.retry": "Try again",
  "live.startTitle": "Start your Security Passport",
  "live.startBody":
    "Your Passport is private. Nothing is shown to anyone else, and you decide whether anything is ever shared.",
  "live.start": "Create my Passport",
  "live.creating": "Creating …",
  "live.selfReportedOnly":
    "Everything you add is self-reported until somebody else has reviewed it. Open an entry to add documentation and request verification.",
  "live.addExperience": "Add employment",
  "live.addClaim": "Add training or authorisation",
  "live.save": "Save",
  "live.saving": "Saving …",
  "live.cancel": "Cancel",
  "live.added": "Added",
  "live.noVerificationYet": "You can never verify yourself",
  "live.noVerificationBody":
    "Verification is done by CQrityjob, or by an employer with direct knowledge of the employment. Only then — and never through an upload — does an entry become verified.",
  "live.form.employer": "Employer",
  "live.form.role": "Role or title",
  "live.form.startedOn": "Start date",
  "live.form.endedOn": "End date",
  "live.form.current": "Current",
  "live.form.employmentType": "Employment type",
  "live.form.ftePercent": "Working hours",
  "live.form.claimType": "Type",
  "live.form.title": "Name",
  "live.form.issuer": "Issuer (as stated by you)",
  "live.form.issuedOn": "Issued",
  "live.form.validUntil": "Valid until",

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
  "home.passport.start": "Open Security Passport",
  "home.passport.continue": "Continue",
  "home.passport.addExperience": "Add experience",
  "home.passport.addTraining": "Add training or certification",
  "home.passport.manageShares": "Manage disclosures",

  "home.passport.workLabel": "Country / jurisdiction",
  "home.passport.verified": "Verified",
  "home.passport.pending": "Pending",
  "home.passport.open": "Open Passport",
  "home.passport.addCredential": "Add credential",
  "home.passport.share": "Share Passport",
  "home.passport.relevantHere": "Records for the selected jurisdiction",
  "home.passport.verifiedTotal": "Verified in total",
  "home.passport.relevantVerified": "verified apply in",
  "home.passport.relevantVerifiedNone": "None of your verified records apply in",
  "home.passport.relevantExplainer":
    "The records remain. Verified in one country does not mean authorised in another.",
  "home.passport.otherCredentials": "Other records",
  "home.passport.credentialsFrom": "records from",
  "home.passport.credentialFrom": "record from",
  "home.passport.noneHere": "No records for this country yet",
  "home.passport.noneHereBody":
    "Add the credentials and training you hold for the country you work in.",
  "home.passport.loading": "Loading your Security Passport …",
  "home.passport.unavailable":
    "Could not read your Security Passport right now. Open Passport to try again.",

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

  "att.title": "Needs your attention",
  "att.clear": "Nothing is waiting on you right now.",
  "att.entryRemoved": "This entry is no longer in your Passport",
  "att.waiting": "Being reviewed",
  "att.waitingHint": "Someone else is looking at this. You do not need to do anything.",
  "att.needsHolder": "Waiting on you",
  "att.needsHolderHint": "The reviewer has asked for something more.",
  "att.expiring": "Expiring soon",
  "att.expiringHint":
    "Renew in good time — an appointment is renewed with the authority, not here.",
  "att.expired": "Has expired",
  "att.expiredHint": "No longer shown as valid. Correct or renew the entry.",
  "att.daysLeft": "days left",
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
  "assertion.verified.historical": "PREVIOUSLY VERIFIED",
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

  "claims.type.training": "Courses",
  "claims.type.certification": "Certification",
  "claims.type.licence": "Authorisation",
  "claims.type.specialisation": "Specialisation",
  "claims.type.education": "Education",
  "claims.type.professional_membership": "Professional membership",
  "claims.issuer": "Issuer",
  "claims.verifier": "Verified by",
  "claims.attribution.document_review": "Document reviewed by",
  "claims.attribution.employer_confirmation": "Confirmed by",
  "claims.attribution.issuer_confirmation": "Confirmed by the issuer",
  "trust.legacy.unsupported":
    "Review recorded by CQrityjob. Direct source confirmation is not available for this legacy record.",
  "trust.legacy.method": "Source method without structural source confirmation",
  "trust.reviewedBy": "Reviewed by",
  "trust.reviewMethod": "Review method",
  "trust.reviewedAt": "Reviewed",
  "trust.level.self_declared": "Self-declared",
  "trust.level.documented": "Documented",
  "trust.level.source_verified": "Source-confirmed",
  "trust.level.unknown": "Could not be loaded",
  "employment.attribution.employer_confirmation": "Employment confirmed by",
  "claims.verifiedOn": "Verified",
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
  "card.workLabel": "Work country / jurisdiction",
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
  "jurisdiction.GB": "United Kingdom",
  "jurisdiction.AE": "United Arab Emirates",
  "jurisdiction.AE-DU": "Dubai",
  "jurisdiction.marketAvailability":
    "Sweden is available today. Other markets, including the United Kingdom and Dubai, are being prepared and cannot be selected yet. You cannot record an authorisation for a country that is not open.",
  "workCountry.regulated": "Regulated credentials",
  "workCountry.support.SE":
    "Swedish regulated credential types supported by the Passport can be registered here.",
  "workCountry.support.GB":
    "CQrityjob does not yet support registration of UK-regulated credentials.",
  "workCountry.support.AE":
    "CQrityjob does not yet support registration of United Arab Emirates regulated credentials.",
  "workCountry.support.AE-DU":
    "CQrityjob does not yet support registration of Dubai-regulated credentials.",
  "workCountry.support.AE-AZ":
    "CQrityjob does not yet support registration of Abu Dhabi-regulated credentials.",
  "workCountry.support.GB-NI":
    "CQrityjob does not yet support registration of Northern Ireland-regulated credentials.",
  "workCountry.notAuthorisation":
    "Work country is where you work. It is not a statement that you may work there — that follows from your authorisations and from the authorities in that country.",
  "jurisdiction.option.AE-DU": "Dubai, United Arab Emirates",
  "jurisdiction.AE-AZ": "Abu Dhabi",
  "jurisdiction.GB-NI": "Northern Ireland",
  "jurisdiction.option.GB-NI": "Northern Ireland, United Kingdom",
  "jurisdiction.option.AE-AZ": "Abu Dhabi, United Arab Emirates",
  "jurisdiction.option.AE": "United Arab Emirates (other)",
  "workCountry.title": "Work country",
  "workCountry.current": "Current",
  "workCountry.save": "Save work country",

  // ── The six profile basics, as a permanent editor ────────────────────
  "basics.title": "Your Passport profile basics",
  "basics.lead":
    "Your Passport is built from six steps: one you only read, four that hold information you fill in, and a declaration. You can read and change your answers whenever you like — you never have to start again.",
  "basics.filled": "fields completed",
  "basics.question": "Step",
  "basics.answered": "Completed",
  "basics.missing": "Missing",
  "basics.readThrough": "Read through",
  "basics.notDeclared": "Not declared",
  "basics.noAnswerNeeded": "This step has nothing to fill in — you only read it.",
  "basics.selfReported":
    "This is information you have given about yourself. Nobody has checked it, and saving it does not make it verified. Your authorisations and reviews are unaffected.",
  "basics.save": "Save profile basics",
  "basics.savedNotice": "Your profile basics have been saved.",
  "basics.editWorkCountry": "Change work country",
  "basics.editCurrentRole": "Change current role",
  "basics.editProfession": "Change in your career profile",
  "basics.editedInCareerProfile":
    "Your current profession belongs to your career profile under My Career, and is changed there. It is shown here because it is part of the picture of you \u2014 but it is self-reported, not verified Passport information.",
  "basics.editedBelow":
    "This answer is changed where it belongs, further down this page, so that it only has one place to be changed. The button takes you there.",
  "basics.declaredOn": "Declared",
  "basics.declareAgain": "Declare again",
  "basics.declarationNote":
    "A declaration cannot be withdrawn here. If you have changed something you can declare again, and the date updates.",
  "basics.qualificationsTitle": "Work country and authorisations",
  "basics.qualificationsLead":
    "Where you work, and the regulated authorisations you can record there.",
  "jurisdiction.confirmPrompt":
    "We have not confirmed where you work. Tell us your country so your Passport shows the right context. It does not change which authorisations you can record.",
  "jurisdiction.confirmAction": "Tell us where I work",
  "jurisdiction.workCountryAvailability":
    "Tell us the country where you work. Regulated authorisations can currently only be recorded for Sweden — the United Kingdom and Dubai are being prepared. You can state your country now even if its authorisations are not supported yet.",
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
  "privacy.handledOnRequest": "Handled on request",
  "privacy.deleteTitle": "Delete your Passport",
  "privacy.deleteBody":
    "Active disclosures are revoked first. Confirmations given by an employer are retained in unlinked form.",
  "privacy.requestNote":
    "Want to export or delete your information? Contact us and we will handle it.",
  "privacy.requestAction": "Contact CQrityjob",

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
  "card.noVerifiedExperience": "No verified professional experience yet",
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

  // ── Phase 5: evidence, verification, sharing and the recipient page ──
  "ev.title": "Supporting documents",
  "ev.lead":
    "Documents you upload are private. Only you can see them — and a CQrityjob reviewer, but only while a review is open.",
  "ev.add": "Add a document",
  "ev.uploading": "Uploading …",
  "ev.none": "No documents yet.",
  "ev.ceiling":
    "Uploading a document makes the entry Document provided. It does not become Verified until somebody else has reviewed it.",
  "ev.limits": "PDF, JPG, PNG or HEIC. 8 MB maximum.",
  "ev.tooLarge": "That file is too large. 8 MB maximum.",
  "ev.badType": "That file type is not supported. Use PDF, JPG, PNG or HEIC.",
  "ev.failed": "The upload failed. Please try again.",
  "ev.view": "Open",
  "ev.opening": "Opening …",
  "ev.saved": "Document uploaded and saved.",
  "ev.stored": "The document stays in your Passport until you remove it.",
  "ev.linkShort":
    "The link to open a document is created when you click and stops working after five minutes. The document itself is unaffected.",
  "ev.replace": "Replace",
  "ev.replacing": "Replacing …",
  "ev.replaceConfirm": "Choose the new file. The old one is removed once the new one is saved.",
  "ev.withdraw": "Remove",
  "ev.withdrawing": "Removing …",
  "ev.withdrawConfirm":
    "The document is deleted. The entry returns to self-declared if it was the only document.",
  "ev.underReview": "Cannot be removed while a review is open.",
  "ev.addOnlyUnderReview":
    "You can add more documents while the review is open. Existing documents cannot be removed until it is finished.",
  "ev.count": "documents",
  "ver.title": "Verification",
  "ver.lead":
    "You can never verify yourself. Verification is done by CQrityjob, or by an employer with direct knowledge of the employment.",
  "ver.request": "Request verification",
  "ver.requestCq": "Have CQrityjob review the documentation",
  "ver.requestCqHelp":
    "A reviewer reads the document you uploaded and decides whether it supports the entry.",
  "ver.requestEmployer": "Ask the employer to confirm the employment",
  "ver.requestEmployerHelp":
    "The employer sees only this employment period and your name. Nothing else in your Passport.",
  "ver.chooseEmployer": "Choose employer",
  "ver.submitting": "Submitting …",
  "ver.submitted": "Your request has been submitted.",
  "ver.status": "Status",
  "ver.status.pending": "In review",
  "ver.status.approved": "Approved",
  "ver.status.rejected": "Rejected",
  "ver.status.clarification_requested": "Clarification requested",
  "ver.status.withdrawn": "Withdrawn",
  "ver.withdrawRequest": "Withdraw request",
  "ver.withdrawRequestConfirm": "The review is cancelled. You can submit again later.",
  "ver.progressTitle": "How the review works",
  "ver.progress1": "You submit the entry with documentation.",
  "ver.progress2": "Somebody other than you reviews it.",
  "ver.progress3": "The decision appears here, with who, how and when.",
  "ver.decidedBy": "Verified by",
  "ver.method": "Method",
  "ver.method.document_review": "Document review",
  "ver.method.employer_confirmation": "Confirmed by employer",
  "ver.method.issuer_confirmation": "Confirmed by issuer",
  "ver.validity": "Validity",
  "ver.validFrom": "Valid from",
  "ver.validUntil": "Valid until",
  "ver.messageToYou": "Message to you",
  "ver.decidedAt": "Decided",
  "ver.noRequests": "No verification has been requested yet.",
  "ver.clarificationCta": "Add what is missing and resubmit",
  "ver.rejected.title": "This could not be verified",
  "ver.rejected.body":
    "We could not verify this information based on the evidence provided. The entry stays in your Passport as self-reported.",
  "ver.rejected.reason": "The reviewer's reason for you",
  "ver.rejected.noReason":
    "No reason was recorded for this decision. Contact CQrityjob if you would like to know more.",
  "ver.rejected.next": "You can add or replace the documentation and request a new review.",
  "ver.resubmit.title": "Request a new review",
  "ver.resubmit.help":
    "Upload the documentation that was missing and submit the entry again. A reviewer reads it afresh.",
  "ver.resubmit.action": "Request a new review",
  "ver.clarification.title": "More information is needed before this can be verified",
  "ver.clarification.whatIsNeeded": "What the reviewer needs",
  "ver.clarification.noMessage":
    "The reviewer asked for more information but no description was recorded. Contact CQrityjob and we will help you from there.",
  "ver.clarification.action":
    "Add the documentation under Documentation above. The review continues — you do not need to submit the entry again.",
  "ver.alreadyOpen": "There is already an open request for this entry.",
  "ver.renew": "Request renewal",
  "ver.renewBody":
    "The validity has ended or ends soon. Upload a current document and request verification again.",
  "ver.expiredNotice": "Verified, but the validity has ended.",
  "ver.expiringSoon": "Validity ends within 60 days.",
  "ver.dispute": "Report this entry as wrong",
  "ver.disputeBody":
    "The entry is marked as disputed. It stops counting and stops being shared until it is corrected.",
  "ver.disputeReason": "What is wrong?",
  "ver.disputeSubmit": "Mark as disputed",
  "ver.revokedNotice": "The verification has been revoked by CQrityjob.",
  "ver.historyTitle": "What has happened",
  "ver.historyEmpty": "Nothing has happened to this entry yet.",
  "claim.back": "Back to Passport",
  "claim.notFound": "That entry does not exist, or does not belong to you.",
  "claim.trustState": "Backing and status",
  "claim.archive.title": "Remove from my active Passport",
  "claim.archive.lead":
    "The entry is no longer presented as current and is not included in new disclosures. It is not deleted: its history, its documentation and any verification stay exactly where they are.",
  "claim.archive.action": "Archive this entry",
  "claim.archive.working": "Archiving …",
  "claim.archive.confirm":
    "Remove this entry from your active Passport? It is not deleted, but you cannot make it current again yourself.",
  "claim.archive.done": "The entry has been removed from your active Passport.",
  "claim.archive.notDispute":
    "Is the information wrong? Report it as incorrect instead — that gets it reviewed. Archiving is for entries that are correct but that you do not want to show.",
  "claim.archive.blockedDisputed":
    "This entry has been reported as incorrect and is waiting to be reviewed. It cannot be archived until the review is finished.",
  "claim.archive.blockedReview":
    "A review is in progress. Withdraw the verification request first.",
  "claim.dispute.pending":
    "This entry is marked as disputed and is waiting to be reviewed. It is not presented as current and is not shared until somebody has looked at it.",
  "claim.correct": "Correct this entry",
  "claim.correctLead":
    "A correction creates a new version. The old version is kept in the history — it is not deleted.",
  "claim.correctReason": "Why is this being corrected?",
  "claim.correctSubmit": "Save correction",
  "claim.remove": "Remove this entry",
  "claim.removeReason": "Why is it being removed?",
  "claim.removeConfirm": "The entry is removed from your Passport. The history remains.",
  "claim.openDetail": "Open",
  "claim.experienceTitle": "Employment",
  "vq.title": "Verification queue",
  "vq.lead":
    "Security Passport verification requests. You see only what the review needs, and only while it is open.",
  "vq.notVerifier": "You do not have verification authority.",
  "vq.workspace.title": "Passport Review",
  "vq.denied.heading": "You do not have Passport review access",
  "vq.denied.body":
    "This workspace is for designated Passport reviewers. If you should be reviewing Passports, CQrityjob needs to grant you the reviewer capability.",
  "vq.denied.back": "Back to My Career",
  "vq.empty": "Nothing to review right now.",
  "vq.filter": "Show",
  "vq.filter.open": "Open",
  "vq.filter.pending": "In review",
  "vq.filter.clarification": "Awaiting clarification",
  "vq.filter.approved": "Approved",
  "vq.filter.rejected": "Rejected",
  "vq.holder": "Holder",
  "vq.submittedAt": "Submitted",
  "vq.evidence": "Documentation",
  "vq.noEvidence": "No document attached.",
  "vq.accessNote":
    "You can open the documents while the review is open. Access ends when it is decided.",
  "vq.open": "Open request",
  "vq.decision": "Decision",
  "vq.approve": "Approve",
  "vq.reject": "Reject",
  "vq.requestClarification": "Request clarification",
  "vq.methodLabel": "How was this decided?",
  "vq.methodFixed": "Document review by CQrityjob",
  "vq.methodFixed.help":
    "CQrityjob has reviewed evidence provided by the holder. This is not direct confirmation from the employer or issuer.",
  "vq.legacy.title": "Legacy verification record – manual re-review required",
  "vq.legacy.body":
    "The record was created with a source method without structural source confirmation. It is displayed as Documented until an authorised source confirms it.",
  "vq.methodRequired": "An approved verification must state its method.",
  "vq.noteInternal": "Internal reasoning",
  "vq.noteInternalHelp":
    "Internal only. Never appears in a shared Passport, on a card, or in an image.",
  "vq.messageHolder": "Message to the holder",
  "vq.messageHolderHelp": "This is what the person will read.",
  "vq.messageHolderRequiredMark": "(required)",
  "vq.messageHolderRequiredHelp":
    "Required for a rejection and for a clarification. Write what is missing, or why the evidence is not enough — this is the only text the person gets to read. Your internal note is never shown to them.",
  "vq.validFrom": "Valid from",
  "vq.validUntil": "Valid until",
  "vq.confirmTitle": "Confirm the decision",
  "vq.confirmApprove":
    "The entry becomes Verified and can be shared as verified. The decision is stored permanently with your name.",
  "vq.confirmReject": "The entry stays self-declared. The decision is stored permanently.",
  "vq.confirmClarify": "The holder is asked to add something. The request stays open.",
  "vq.confirmYes": "Yes, record the decision",
  "vq.deciding": "Recording …",
  "vq.decided": "The decision has been recorded.",
  "vq.previousVersions": "Previous versions",
  "vq.priorDecisions": "Earlier decisions",

  "vq.claimHeading": "What the candidate states",
  "vq.periodHeading": "Employment the candidate states",
  "vq.claimType": "Type",
  "vq.credentialCode": "Credential code",
  "vq.credentialReference": "Reference number",
  "vq.issuerStated": "Issuer (as stated)",
  "vq.jurisdiction": "Jurisdiction",
  "vq.authorisationScope": "Authorisation scope",
  "vq.currentState": "Current state",
  "vq.version": "Version",
  "vq.employer": "Employer",
  "vq.role": "Role",
  "vq.period": "Period",
  "vq.employmentType": "Employment type",
  "vq.securityRelevance": "Security relevance",
  "vq.historyHeading": "Earlier history",
  "vq.firstSubmission": "First submission. No previous versions and no earlier decisions.",
  "vq.evidenceNote":
    "An attached document does not verify the claim by itself. It is what you judge the claim against.",
  "vq.revoke": "Revoke verification",
  "vq.revokeReason": "Why is it being revoked?",
  "vq.revokeConfirm":
    "The verification stops applying and the entry stops being shared. The revocation is kept in the history.",
  "vq.immutableNote":
    "A decision cannot be edited afterwards. A wrong decision is corrected with a new decision.",
  "emp.title": "Confirm employment",
  "emp.lead":
    "Someone has asked you to confirm one employment period with your organisation. You see only that period.",
  "emp.scopeTitle": "What you can and cannot see",
  "emp.scope1": "You see: the person's name and the employment the question is about.",
  "emp.scope2": "You do not see: qualifications, authorisations, documents or other employment.",
  "emp.scope3":
    "You are not assessing the person. You are only confirming whether the facts are right.",
  "emp.empty": "No requests right now.",
  "emp.person": "Person",
  "emp.role": "Role",
  "emp.period": "Period",
  "emp.employmentType": "Employment type",
  "emp.question": "Are these facts correct?",
  "emp.confirm": "Yes, this is correct",
  "emp.reject": "No, this is not correct",
  "emp.correction": "Ask for a correction",
  "emp.message": "Message to the person",
  "emp.confirmTitle": "Confirm your answer",
  "emp.confirmBody":
    "Your name, your organisation and the time are stored together with your answer.",
  "emp.done": "Thank you. Your answer has been recorded.",
  "emp.decided": "Answered",
  "emp.nav": "Passport requests",

  // ── PR 8. Employment verification, as work an employer can find ────
  "empv.title": "Employment verification",
  "empv.lead":
    "People who state that they worked for you can ask you to confirm it. You confirm facts — not the person.",
  "empv.openHeading": "Waiting for you",
  "empv.waitingHeading": "Waiting for the person",
  "empv.answeredHeading": "Answered",
  "empv.emptyTitle": "No requests right now",
  "empv.emptyBody": "When somebody asks you to confirm employment with you, it appears here.",
  "empv.review": "Review",
  "empv.open": "Open",
  "empv.back": "Back to employment verification",
  "empv.notFound": "That request is not among your employment verification requests.",
  "empv.factsTitle": "Employment to confirm",
  "empv.organisation": "Organisation",
  "empv.securityRelevance": "Security relevance",
  "empv.extent": "Extent",
  "empv.submitted": "Received",
  "empv.responseTitle": "Your response",
  "empv.meaningTitle": "What a confirmation means",
  "empv.meaning1": "You confirm that the stated employment facts match your records.",
  "empv.meaning2":
    "You say nothing about how the person performed, and you are not recommending them.",
  "empv.meaning3": "CQrityjob has not checked this — what is shown is your confirmation.",
  "empv.messageRequired": "Message to the person (required)",
  "empv.messageOptional": "Message to the person (optional)",
  "empv.messageHelpCorrection":
    "Say what needs correcting, for example: \u201COur records show the employment ended on 31 October 2025.\u201D",
  "empv.messageHelpReject":
    "Say why you cannot confirm, for example: \u201CWe could not locate employment records for the period stated.\u201D",
  "empv.messageMissing": "Write a message to the person before sending your answer.",
  "empv.confirmAction": "Confirm employment",
  "empv.correctionAction": "Request correction / more information",
  "empv.rejectAction": "Cannot confirm",
  "empv.correctionNote":
    "You do not change the person's entry. They correct it themselves and can then ask again.",
  "empv.send": "Send your answer",
  "empv.standingTitle": "You have already asked for a correction",
  "empv.standingBody":
    "The person has not come back with a corrected entry yet. You can answer again once they do — the answer below replaces what you wrote before.",
  "empv.askedOn": "Asked",
  "empv.answered.approved": "You confirmed the employment",
  "empv.answered.rejected": "You could not confirm the employment",
  "empv.answered.clarification_requested": "You asked for a correction or more information",
  "empv.answered.withdrawn": "The person withdrew the request",
  "empv.yourMessage": "Your message to the person",
  "empv.selfTitle": "You cannot confirm your own employment",
  "empv.selfBody":
    "This request is about your own account. Nobody can verify themselves, whatever their role in the organisation. A colleague who is an owner or an admin can answer instead.",
  "empv.workspaceTitle": "Choose an organisation",
  "empv.workspaceLead": "Employment verification is handled in each organisation's own workspace.",
  "empv.workspaceNone":
    "You are not an owner or an admin of any organisation, so there is no employment verification for you to handle.",
  "empv.workspaceOpen": "waiting for you",
  "empv.workspaceNoneOpen": "Nothing waiting for you",

  // ── PR 8. The candidate's side of the same exchange ────────────────
  "ver.employer.waitingFor": "Waiting for",
  "ver.employer.waitingBody":
    "The employer has the question and sees only this employment and your name.",
  "ver.employer.confirmedBy": "Employment confirmed by",
  "ver.employer.clarificationFrom": "More information needed by",
  "ver.employer.clarificationBody":
    "The employer needs more information or a correction before they can confirm the employment.",
  "ver.employer.clarificationAction":
    "Correct the entry under Information in your Passport, then ask again. The employer never edits your entry for you.",
  "ver.employer.rejectedBy": "Could not be confirmed by",
  "ver.employer.rejectedBody":
    "The employer found nothing matching the employment you entered. The entry stays in your Passport as self-reported.",
  "ver.employer.rejectedNext":
    "Check the dates, the role and the organisation. Correct anything that is wrong and ask again, or ask CQrityjob to review documentation instead.",
  "ver.employer.messageFrom": "Message from the employer",
  "ver.employer.noMessage":
    "The employer left no message. Contact them directly if you need to know why.",
  "ver.employer.editEntry": "Correct the entry",
  "ver.employer.notCqrityjob":
    "The employer confirms this, not CQrityjob. We record who confirmed it, how and when.",
  "ver.employer.unknownOrg": "the employer",
  "ver.employer.notReference":
    "The employer is asked to confirm the facts you entered — role, dates and employment type. They are not asked for a reference or an opinion about you.",

  // ── Finding the right employer ───────────────────────────────────────
  //
  // The labels below are words, never numbers. "Exact match" is something a
  // person can check by looking at the row; "87% match" is not.
  "ver.employer.searchLabel": "Search for the employer",
  "ver.employer.searchPlaceholder": "Type the company name",
  "ver.employer.searchHelp":
    "We suggest organisations that resemble the employer you entered on this employment. You choose — CQrityjob never decides that two companies are the same company.",
  "ver.employer.searching": "Searching …",
  "ver.employer.searchUnavailable":
    "The employer search could not be run just now. That does not mean the employer is missing.",
  "ver.employer.searchRetry": "Try again",
  "ver.employer.noMatch": "No matching employer found.",
  "ver.employer.noMatchHelp": "Try a different spelling, or a shorter part of the name.",
  "ver.employer.reason.linked": "Asked before",
  "ver.employer.reason.exact_name": "Exact match",
  "ver.employer.reason.same_country": "Same country",
  "ver.employer.reason.search": "Search result",
  "ver.employer.moreMatches":
    "More organisations match than are shown. Type more of the name to narrow it down.",
  "ver.employer.countryUnknown": "Country not stated",
  "ver.employer.select": "Choose",
  "ver.employer.confirmTitle": "Request confirmation from:",
  "ver.employer.confirmBody":
    "Check that this is the right organisation. It will see this employment period and your name, and nothing else in your Passport.",
  "ver.employer.confirmAction": "Yes, send the request",
  "ver.employer.confirmChange": "Choose a different organisation",
  "ver.employer.notOnPlatform": "My employer is not on CQrityjob",
  "ver.employer.notOnPlatformTitle": "If the employer is not here",
  "ver.employer.notOnPlatformBody":
    "Employer confirmation currently requires the employer to have an organisation account on CQrityjob. If they have no account, confirmation cannot be requested that way.",
  "ver.employer.notOnPlatformNoInvite":
    "CQrityjob does not send an invitation and does not contact the employer for you.",
  "ver.employer.notOnPlatformAlt":
    "You can instead have CQrityjob review documentation that supports the employment — a contract, an employer certificate or a payslip. That option is above.",
  "ver.employer.notOnPlatformClose": "Close",
  "pkg.public_card.name": "Public Passport Card",
  "pkg.public_card.purpose":
    "A card showing your professional role and your verified authorisations.",
  "pkg.verified_qualifications.name": "Verified qualifications",
  "pkg.verified_qualifications.purpose":
    "For someone who needs to check training, certificates and authorisations.",
  "pkg.verified_experience.name": "Verified experience",
  "pkg.verified_experience.purpose": "For someone who needs to check your professional experience.",
  "pkg.employer_review.name": "Employer review",
  "pkg.employer_review.purpose": "What an employer normally needs ahead of a conversation.",
  "pkg.full_verification.name": "Full verification package",
  "pkg.full_verification.purpose": "Everything that is verified, with full attribution.",
  "pkg.inc.identity": "Your name at the level you chose",
  "pkg.inc.professionJurisdiction": "Profession and jurisdiction",
  "pkg.inc.verifiedQualifications": "Verified authorisations and training",
  "pkg.inc.verifiedEmployment": "Verified employment, including employer names",
  "pkg.inc.verifiedTenureTotal": "Total verified time in the profession",
  "pkg.inc.attribution": "Who verified, how and when",
  "pkg.inc.validity": "Validity period and current status",
  "pkg.exc.employers": "Employer names",
  "pkg.exc.qualifications": "Training and authorisations",
  "pkg.exc.evidence": "Your documents",
  "pkg.exc.selfDeclared": "Self-declared entries",
  "pkg.exc.contact": "Contact details",
  "pkg.exc.internalNotes": "Internal review notes",
  "sc.title": "Share your Passport",
  "sc.lead":
    "You decide whether to share, what is shared, with whom and for how long. You can revoke at any time.",
  "sc.needPassport": "Create your Passport first.",
  "sc.choosePackage": "Choose a package",
  "sc.packagesAreFixed":
    "The packages are fixed. That is why a recipient can trust what they mean — you cannot remove the parts that make an entry understandable.",
  "sc.includes": "The recipient sees",
  "sc.excludes": "The recipient does not see",
  "sc.verifiedOnlyNote":
    "Only verified entries are shared. Self-declared entries are never shared.",
  "sc.nothingVerifiedTitle": "You have nothing verified yet",
  "sc.nothingVerifiedBody": "A share link would be empty. Request verification of an entry first.",
  "sc.expiry": "The link stops working",
  "sc.expiry.7": "After 7 days",
  "sc.expiry.30": "After 30 days",
  "sc.expiry.90": "After 90 days",
  "sc.expiry.never": "No time limit",
  "sc.purpose": "Purpose",
  "sc.purposePlaceholder": "For example: security officer application, Stockholm",
  "sc.recipientHint": "Recipient",
  "sc.recipientHintHelp": "For your own overview only. Not shown to the recipient.",
  "sc.create": "Create share link",
  "sc.creating": "Creating …",
  "sc.createdTitle": "Your link is ready",
  "sc.onceOnly":
    "This is the only time the link is shown. We do not store it in readable form — copy it now. If you lose it, create a new one and revoke the old.",
  "sc.copy": "Copy link",
  "sc.copied": "Copied",
  "sc.openRecipient": "Open the recipient view",
  "sc.qrTitle": "QR code",
  "sc.qrBody": "Leads to the same recipient page.",
  "sc.qrDownload": "Download QR code",
  "sc.imagesTitle": "Images to share",
  "sc.imagesNote":
    "The image is promotional. The live page is the source — it updates and can be revoked, an image cannot.",
  "sc.historyTitle": "Your shares",
  "sc.historyEmpty": "You have not shared anything yet.",
  "sc.state.active": "Active",
  "sc.state.expired": "Expired",
  "sc.state.revoked": "Revoked",
  "sc.created": "Created",
  "sc.expiresOn": "Valid until",
  "sc.opened": "Opened",
  "sc.timesShort": "times",
  "sc.revoke": "Revoke",
  "sc.revoking": "Revoking …",
  "sc.revokeConfirm":
    "The link stops working immediately. Anyone who already opened it sees nothing new afterwards.",
  "sc.revoked": "The share has been revoked.",
  "rec.brand": "CQrityjob",
  "rec.title": "Security Passport verification",
  "rec.checking": "Loading …",
  "rec.authoritative":
    "This page is the source. It shows the position right now and changes if something is revoked or expires.",
  "rec.unavailableTitle": "This link is not available",
  "rec.unavailableBody":
    "The link may have expired, been revoked, or never existed. Ask the person for a new link.",
  "rec.package": "Package",
  "rec.purpose": "Purpose",
  "rec.holder": "Holder",
  "rec.anonymousHolder": "The name is not shown",
  "rec.profession": "Profession",
  "identity.none": "No active professional title",
  "identity.selfDeclared": "Self-declared",
  "identity.selfDeclaredNote":
    "This title rests on information you provided yourself, which nobody has checked. Only you can see it.",
  "identity.education": "Completed education",
  "identity.competence": "Professional competence",
  "identity.eligibility": "Current eligibility",
  "identity.eligibilityNote":
    "Verified evidence that a competent authority or employer currently approves this person. It is not a professional title, an appointment or a licence.",
  "identity.activeTitle": "Active professional title",
  "rec.cardTitle": "Shared Security Passport",
  "rec.detailsTitle": "What this share contains",
  "rec.packageShows": "This share shows",
  "rec.expiredNotice":
    "One or more entries are no longer current. They are shown with their present state, not as current.",
  "rec.jurisdiction": "Jurisdiction",
  "rec.qualifications": "Verified authorisations",
  "rec.scopeLimited": "Limited approval",
  "rec.scopeWithheld":
    "The approval applies to a stated protected object, employer or principal. The scope is not shown in this view.",
  "rec.subJurisdiction": "Region",
  "rec.credentialMarket": "Valid in",
  "rec.experience": "Verified employment",
  "rec.tenure": "Verified time in the profession",
  "rec.verifiedBy": "Verified by",
  "rec.method": "Method",
  "rec.verifiedAt": "Verified",
  "rec.validUntil": "Valid until",
  "rec.state": "Status",
  "rec.issuer": "Issuer",
  "rec.nothing": "This package contains nothing verified right now.",
  "rec.lastUpdated": "Last updated",
  "rec.linkExpires": "The link is valid until",
  "rec.checkedAt": "Checked",
  "rec.jurisdictionNote":
    "Jurisdiction describes where an entry was issued. It says nothing about the right to work in any country.",
  "rec.notAssessment": "These are substantiated facts, not a judgement about the person.",
  "rec.ctaTitle": "Create your Security Passport",
  "rec.ctaBody":
    "Gather your professional experience and authorisations. You decide what is shared.",
  "rec.ctaAction": "Read more",
  "livecard.lockedNote":
    "The contents are set by verified entries. You choose whether to share the card — not what it claims.",
  "livecard.selfReportedTitle": "Self-reported card",
  "livecard.selfReportedBody":
    "Nothing is verified yet, so the card shows no verification seal and no milestone.",
  "livecard.shareCta": "Share this card",
  "livecard.needShare": "Create a share link to be able to share the card.",
  "common.optional": "optional",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.back": "Back",
  "common.error": "Something went wrong. Please try again.",
  "common.loading": "Loading …",
  "common.days": "days",

  // ── Credential forms (Phase 6) ───────────────────────────────────────
  "cred.add.title": "Add a credential or training",
  "cred.add.body":
    "You fill this in yourself. Anything you add counts as stated by you until someone else has checked it.",
  "cred.select.label": "What would you like to add?",
  "cred.select.placeholder": "Choose …",
  "cred.section.about": "About the credential",
  "cred.section.dates": "Dates",
  "cred.section.evidence": "Documentation and note",

  "cred.field.title": "Name",
  "cred.field.titleHelp":
    "The name comes from the credential you chose and cannot be changed. It matches the decision or certificate.",
  "cred.field.trainingProvider": "Training provider",
  "cred.field.scope": "Scope",
  "cred.field.scopeHelp":
    "Which employer, principal or protected object the authorisation applies to. It is stated on the decision.",
  "cred.field.narrowResultOnly":
    "Only the fact that the check was made is recorded, with the authority and the date. Nothing about what the check found is stored.",
  "cred.field.appointingAuthority": "Appointing authority",
  "cred.field.authorityHelp":
    "The authority that made the decision, for example the Swedish Police Authority.",
  "cred.field.jurisdiction": "Country",
  "cred.field.completedOn": "Completed on",
  "cred.field.decidedOn": "Decision date",
  "cred.field.validFrom": "Valid from",
  "cred.field.validUntil": "Valid until",
  "cred.field.validUntilRequired": "Valid until (required for an appointment)",
  "cred.field.reference": "Reference or decision number",
  "cred.field.referenceHelp": "Never shown publicly. Only you and a reviewer can see it.",
  "cred.field.holderNote": "Your own note",
  "cred.field.holderNoteHelp":
    "Your own words. Always marked as stated by you, and never shared publicly.",

  "cred.appointment.notice":
    "An appointment is a time-limited authorisation. Training is not the same thing as a current appointment.",
  "cred.qualification.notice":
    "This is completed training. It has no end date unless the certificate states one.",

  "cred.action.saveDraft": "Save draft",
  "cred.action.saving": "Saving …",
  "cred.action.savedAt": "Draft saved",
  "cred.action.resume": "Continue draft",
  "cred.action.activate": "Add to my Passport",
  "cred.action.submitVerification": "Submit for checking",
  "cred.action.uploadEvidence": "Upload documentation",
  "cred.action.correct": "Correct this entry",
  "cred.action.discard": "Delete draft",
  "cred.action.lifecycleNote":
    "Save draft keeps the entry as a draft — only you can see it. Add to my Passport makes it active in your Passport and requires the mandatory fields to be filled in.",
  "cred.action.draftKept": "Saved as a draft. It stays here until you add it to your Passport.",
  "cred.error.serverIncomplete":
    "A mandatory field is missing or incorrectly filled in. Check the fields above and try again.",
  "cred.error.serverInvalid":
    "The entry could not be saved as a draft. Check the fields above and try again.",
  "cred.error.serverUnknownCode":
    "This credential can no longer be registered. Choose another one from the list.",

  "cred.error.selectCredential": "Choose which credential you are adding.",
  "cred.error.titleRequired": "Enter a name.",
  "cred.error.jurisdictionRequired": "Enter a country.",
  "cred.error.authorityRequired": "Enter the authority that appointed you.",
  "cred.error.validUntilRequired": "An appointment must have an end date.",
  "cred.error.scopeRequired":
    "State what the authorisation is limited to. Without it, it reads as a general national licence.",
  "cred.error.noNoteAllowed":
    "This entry cannot carry a note. Only the fact of the check is recorded.",
  "cred.error.controlledLabelOnly": "This entry has a fixed label and cannot be reworded.",
  "cred.error.dateFormat": "Enter a valid date (YYYY-MM-DD).",
  "cred.error.dateFuture": "This date cannot be in the future.",
  "cred.error.endBeforeStart": "The end date must be after the start date.",
  "cred.error.referenceTooLong": "That reference is too long (120 characters maximum).",
  "cred.error.noteTooLong": "That note is too long (2000 characters maximum).",
  "cred.error.incompleteForActive": "Fill in the required fields before adding this entry.",
  "cred.error.incompleteForVerification":
    "This entry must be complete before it is submitted for checking.",
  "cred.errorSummary": "Check the highlighted fields.",

  "cred.market.unavailableTitle": "No regulated credentials to register yet",
  "cred.market.stillPossible":
    "You can still add languages, driving licences and other certificates under My information. They do not belong to a regulated market and are not affected by this.",
  "cred.market.keepsExisting":
    "Credentials you have already registered stay where they are, with their own country and their own status. Changing your work country does not change them.",
  "cred.market.noWorkCountry":
    "Tell us where you work first. Which regulated credentials can be registered depends on the work country.",
  "cred.market.setWorkCountry": "Set work country",

  // ── Market profiles ─────────────────────────────────────────────────
  "market.step.workMarket": "Work market",
  "market.workMarket.question":
    "Where do you work, or where do you want to use your Security Passport?",
  "market.registerNote": "Regulated credentials can only be registered for the selected country.",
  "market.section.credentialsFor": "Credentials and training for",
  "market.pilot.status": "Internal pilot market — regulatory content is under review",
  "market.pilot.body":
    "You are taking part in an internal pilot for this market. What you register is saved in your Security Passport with its own jurisdiction. The market is not yet open to everyone and its content has not been legally approved.",
  "market.section.lead": "Choose a credential or training to add and continue.",
  "market.pending.headingSuffix": "is not open yet",
  "market.pending.body":
    "Registration of local credentials for this market is not open yet. You can already set it as your work market. Your verified records from other countries remain in your Security Passport.",
  "market.unsupported.heading": "This market is not supported yet",
  "market.unsupported.body": "This market is not yet supported for regulated credentials.",
  "market.noWorkCountry.heading": "Set your work market first",
  "market.other.title": "Verified in other markets",
  "market.other.lead":
    "Records you have verified in other markets. They belong to their own country and are edited there, not from here.",
  "market.other.none": "You have no verified records in other markets yet.",
  "market.verified.one": "verified",
  "market.verified.many": "verified",
  "market.details.show": "View details",
  "market.details.hide": "Hide details",
  "market.currentMarket.none": "No verified records in this market yet.",
  "card.verifiedMarkets": "Verified markets",
  "card.currentWorkMarket": "Current work market",
  "cred.field.credentialCountry": "Credential's country",
  "cred.field.credentialCountryHelp":
    "The credential belongs to this country whatever country you work in today. Changing your work country does not change it.",

  "entry.save": "Save",
  "entry.saving": "Saving …",
  "entry.saved": "Saved.",
  "entry.edit": "Edit",
  "entry.remove": "Remove",
  "entry.removeConfirm": "Remove this entry? This cannot be undone.",
  "entry.removeBlocked":
    "This entry can no longer be removed because it has documentation or a review. Correct it instead.",
  "entry.add": "Add",
  "entry.none": "Nothing added yet.",
  "entry.selfDeclaredNote":
    "Everything you add is self-declared until somebody else has checked it.",

  "entry.emp.employer": "Employer",
  "entry.emp.role": "Role",
  "entry.emp.startedOn": "From",
  "entry.emp.endedOn": "Until",
  "entry.emp.ongoing": "I still work here",
  "entry.emp.employmentType": "Employment type",
  "entry.emp.type.full_time": "Full time",
  "entry.emp.type.part_time": "Part time",
  "entry.emp.type.hourly": "Hourly",
  "entry.emp.type.temporary": "Temporary or fixed term",
  "entry.emp.extent": "Extent",
  "entry.emp.extentHelp": "What share of a full-time post the role amounted to.",
  "entry.emp.relevance": "How much of the work was security work?",
  "entry.emp.relevanceHelp":
    "We never guess from the job title. A receptionist with security duties and a security officer are not the same thing.",
  "entry.emp.relevance.primary": "All of it was security work",
  "entry.emp.relevance.partial": "Part of it was security work",
  "entry.emp.relevance.none": "No security work",
  "entry.emp.securityShare": "Roughly what share?",
  "entry.emp.securityShareHelp": "Stated explicitly — the calculation never assumes a share.",

  "entry.claim.title": "Name",
  "entry.claim.titleHelp":
    "The name as it appears on the certificate, record or course description.",
  "entry.claim.school": "School or institution",
  "entry.claim.certBody": "Certifying body",
  "entry.claim.organisation": "Organisation",
  "entry.claim.confirmedBy": "Confirmed by",
  "entry.claim.completedOn": "Completed on",
  "entry.claim.hasExpiry": "This entry has an end date",

  "entry.error.employerRequired": "Enter an employer.",
  "entry.error.roleRequired": "Enter a role.",
  "entry.error.titleRequired": "Enter a name.",
  "entry.error.startRequired": "Enter a start date.",
  "entry.error.endRequired": "Enter an end date.",
  "entry.error.endBeforeStart": "The end date must be after the start date.",
  "entry.error.fractionRange": "Choose a share between 0 and 100 per cent.",
  "entry.documentAndVerify": "Documentation and checking",
  "exp.verifiedLabel": "Verified time in the profession",
  "exp.noneYet": "No verified time yet",
  "exp.selfDeclaredAlso": "Self-declared, not checked:",
  "share2.title": "Share your Passport",
  "share2.lead": "One link showing your verified records. You can revoke it at any time.",
  "share2.primary": "Share my Passport",
  "share2.creating": "Creating link …",
  "share2.share": "Share",
  "share2.copy": "Copy secure link",
  "share2.view": "View Passport",
  "share2.copied": "Link copied",
  "share2.ready": "Your link is ready",
  "share2.terms": "Valid for 30 days. You can revoke it at any time.",
  "share2.whatIsShared":
    "The link shows verified records only — nothing self-declared, no documents and no reference numbers.",
  "share2.nothingVerified":
    "You have nothing verified yet, so a link would be empty. Add your records and submit them for checking first.",
  "share2.more": "More options",
  "share2.moreHint": "Custom validity, QR code, images and active links.",
  "share2.activeLinks": "Active links",
  "share2.cacheNote":
    "A downloaded or published image can remain with the platform even after you revoke the link. The page itself stops working immediately.",
  "vq.error.queue": "The queue could not be loaded.",
  "vq.error.detail": "This review could not be opened.",
  "vq.error.evidence": "This document could not be opened.",
  "vq.error.decision": "The decision could not be saved. Your entries are still here — try again.",
  "vq.retry": "Try again",
  "vq.decline.self_verification":
    "This is your own request. You cannot verify yourself — another reviewer has to decide it.",
  "vq.decline.not_authorised": "You are not authorised to decide this review.",
  "vq.decline.already_decided":
    "This review has already been decided. Reload the page to see the decision.",
  "vq.decline.not_found": "This review no longer exists.",
  "vq.decline.method_required": "An approval must state a verification method.",
  "vq.decline.method_not_permitted":
    "That verification method is not permitted for this kind of request. A CQrityjob review is recorded as document review, and an employer confirmation can only be given by the employer.",
  "vq.decline.holder_message_required":
    "A rejection or a clarification must include a message to the holder. Write what is missing, or why the evidence is not enough.",
  "vq.decline.invalid_validity":
    "That validity period cannot be saved. Check that the end date is after the start date, and that a time-limited appointment has an end date.",
  "vq.decline.issuer_required": "This credential must name the authority that issued it.",
  "vq.decline.entry_not_active":
    "The entry changed after this review was opened and can no longer be decided. Reload the page.",
  "vq.decline.unknown": "The decision could not be saved. Your entries are still here — try again.",

  "vq.dispute.title": "Disputed entries",
  "vq.dispute.lead":
    "Entries the holder has reported as incorrect. Every case is decided by a person — nothing here is decided automatically.",
  "vq.dispute.empty": "No disputed entries right now.",
  "vq.dispute.holder": "Holder",
  "vq.dispute.reported": "Reported",
  "vq.dispute.reason": "What the holder said",
  "vq.dispute.noReason": "No reason recorded.",
  "vq.dispute.evidence": "documents",
  "vq.dispute.note": "Note (optional)",
  "vq.dispute.restore": "The entry is correct — restore it",
  "vq.dispute.withdraw": "The entry is not correct — remove it",
  "vq.dispute.resolving": "Deciding …",
  "vq.dispute.resolved": "The case is closed.",
  "vq.dispute.self": "You cannot decide a dispute about your own entry.",
  "vq.dispute.restoreHelp":
    "The entry becomes current again, unchanged. Its verification level is not affected.",
  "vq.dispute.withdrawHelp":
    "The entry leaves the holder's active Passport. Nothing is deleted and no verification is undone — that is a separate act.",
  "vq.selfBadge": "Your own request",
  "vq.selfNotice":
    "This is your own request. Nobody may verify their own record, so the decision form is switched off here. Another reviewer has to decide it.",
  "cw.detailsTitle": "Details",
  "cw.shareCredential": "Share this credential",
  "cw.creating": "Creating link …",
  "cw.addToLinkedIn": "Add to LinkedIn",
  "cw.linkedInPanel": "Details for LinkedIn",
  "cw.linkedInHow":
    "LinkedIn does not fill these in for you. Copy them here, open LinkedIn and paste them into the form.",
  "cw.liName": "Name",
  "cw.liOrg": "Issuing organisation",
  "cw.liIssued": "Issue date",
  "cw.liExpires": "Expiration date",
  "cw.liId": "Credential ID",
  "cw.liUrl": "Credential URL",
  "cw.copyDetails": "Copy details",
  "cw.copied": "Details copied",
  "cw.openLinkedIn": "Open LinkedIn",
  "cw.notShareable":
    "Only a verified, current credential can be shared on its own. Submit it for checking first.",

  "info.title": "My information",
  "info.lead":
    "This is where you enter your background. Everything saves immediately and you can continue whenever you like. Credentials have their own forms because they have their own rules.",
  "info.employment": "Employment",
  "info.languages": "Languages",
  "info.skills": "Practical skills",
  "skill.lead.language":
    "Languages you use at work. The level follows the European scale, so a reader knows what it means.",
  "skill.lead.practical_skill":
    "Licences and certificates that have an issuer and can be evidenced.",
  "skill.add.language": "Add a language",
  "skill.add.practical_skill": "Add a licence",
  "skill.field.language": "Language",
  "skill.field.skill": "Licence",
  "skill.field.level": "Level",
  "skill.field.category": "Category",
  "skill.field.jurisdiction": "Issued in (country code)",
  "skill.field.validUntil": "Valid until",
  "skill.field.note": "Your own note",
  "skill.noteHelp": "Visible only to you and to a reviewer. Never shared.",
  "skill.none.language": "No languages added yet.",
  "skill.none.practical_skill": "No licences added yet.",
  "skill.selfDeclared": "Self-declared until someone has reviewed evidence for it.",
  "skill.levelRequired": "Choose a level.",
  "skill.jurisdictionRequired": "Choose where the licence was issued.",
  "skill.levelNotApplicable": "This licence has no level.",
  "skill.levelInvalid": "Choose a level from the list.",
  "skill.validUntilRequired": "This licence has an end date.",
  "skill.cefr.A1": "Beginner (A1)",
  "skill.cefr.A2": "Elementary (A2)",
  "skill.cefr.B1": "Independent (B1)",
  "skill.cefr.B2": "Advanced (B2)",
  "skill.cefr.C1": "Highly advanced (C1)",
  "skill.cefr.C2": "Full command (C2)",
  "skill.cefr.native": "Native",
  "info.employmentLead":
    "Add each employment separately. Overlapping periods are only counted once.",
  "info.addEmployment": "Add employment",
  "nav.information": "My information",

  "cred.category.qualification": "Completed training",
  "cred.category.appointment": "Time-limited appointment",
  "cred.field.validFromHelp":
    "Only if the decision states a start date other than the decision date.",
  "cred.docsNotApproval":
    "Documentation is not the same as approval. An uploaded document makes an entry documented — only a completed check can make it verified.",
  "cred.evidenceNext":
    "Once the entry is added you can upload documentation and submit it for checking.",
  "cred.addAction": "Add a credential",
  "cred.overview.title": "Credentials and training",
  "cred.overview.body":
    "Add VU1, VU2, a public order guard appointment or a protective security guard appointment. You can save a draft and continue later.",
  "cred.drafts.title": "Drafts",
  "cred.drafts.lead": "Saved but not yet added. Only you can see them.",
  "cred.drafts.updated": "Last saved",
  "cred.drafts.untitled": "Untitled",
  "cred.discardConfirm": "The draft will be deleted permanently. This cannot be undone.",
  "cred.discarded": "The draft has been deleted.",
  "cred.onboardingCta": "Add it now",
  "cred.new.resumeOr": "or start a new one",
  "cred.added": "The entry has been added to your Passport.",

  "cred.correct.title": "Correct this entry",
  "cred.correct.trustNote":
    "A correction creates a new version and keeps the old one in the history. If you change what is being asserted, the new version starts over as self-declared — any verification does not carry across.",
  "cred.correct.reason": "What are you correcting?",
  "cred.correct.reasonHelp": "Stored in the history together with the correction.",
  "cred.correct.reasonRequired": "State what you are correcting.",
  "cred.correct.submit": "Save the correction",
  "cred.versions.title": "Version history",
  "cred.versions.lead":
    "Earlier versions are kept and marked as superseded. No version disappears.",
  "cred.versions.current": "Current",
  "cred.versions.recordedAt": "Recorded",

  "li.shareText":
    "My verified Security Passport from CQrityjob. The link shows what has been reviewed, and by whom.",
  "li.title": "Share on LinkedIn",
  "li.lead":
    "This is your card in LinkedIn's format. Three steps: download the image, copy the link, attach the image to your post.",
  "li.step1": "Download the card image in LinkedIn's format (1200×630).",
  "li.step1Action": "Download the image",
  "li.step1Done": "Downloaded — download again",
  "li.step2": "Copy the live verification link and paste it into the post.",
  "li.step3":
    "Open LinkedIn and attach the downloaded image to the post. The image is not attached automatically.",
  "li.step3Action": "Open LinkedIn",
  "li.previewNote":
    "The link's automatic preview on LinkedIn shows CQrityjob's generic card — not your personal one. Your card appears when you attach the image yourself. The link is always the source: the page behind it shows the current position and can be revoked.",
  "sc.retentionNote":
    "Social platforms may keep images that have already been published or cached — even after you withdraw the link. What you revoke is the page behind the link, not copies of the image.",

  // ── Share panel (restructured /passport/share) ───────────────────────
  "sp.verify": "Verify Passport",
  "sp.verifyHint": "Opens the live page your recipient sees.",
  "sp.feed": "Share to feed",
  "sp.deviceShare": "Share on device",
  "sp.more": "More sharing options",
  "sp.imagesTitle": "Social media images",
  "sp.securityDetails": "About the link and its security",
  "share.channel.instagram": "Instagram",
  "share.channel.copyUrl": "Copy URL",
  "share.channel.instagramHint": "Download the Story image and post it from the app.",

  // ── Add to LinkedIn profile ──────────────────────────────────────────
  "lip.title": "Add to LinkedIn profile",
  "lip.lead":
    "Put a verified record on your profile, not just in a feed. The link that travels with it is your live verification page.",
  "lip.addCert": "Add Certificate",
  "lip.addEdu": "Add Training",
  "lip.certGroup": "Certificates and licences",
  "lip.eduGroup": "Training",
  "lip.noneCert": "You have no verified credential to add yet.",
  "lip.noneEdu": "You have no verified training to add yet.",
  "lip.fieldsTitle": "The details LinkedIn asks for",
  "lip.copyFields": "Copy the details",
  "lip.copied": "Details copied",
  "lip.openLinkedIn": "Open LinkedIn",
  "lip.prefillNote":
    "LinkedIn does not always fill the fields in for you. Copy the details first, and you have them ready when the form opens.",
  "lip.fieldCourse": "Course",
  "lip.fieldProvider": "Provider",
  "lip.fieldCompleted": "Completed",

  // ── Disclosing to one employer, through one application ──────────────
  "ad.title": "Share your Passport with this employer",
  "ad.lead":
    "Applying for the job shares nothing from your Passport. This employer sees only what you explicitly choose here, and you can withdraw it whenever you like.",
  "ad.needPassport":
    "You do not have a Passport yet. Create it first, and you can then choose what to share.",
  "ad.openPassport": "Open Security Passport",
  "ad.share": "Share with this employer",
  "ad.sharing": "Sharing …",
  "ad.change": "Change what you share",
  "ad.cancel": "Cancel",
  "ad.nothingShared": "You have not shared anything from your Passport with this employer.",
  "ad.sharedNow": "Shared with this employer",
  "ad.replacesPrevious":
    "A new share replaces the previous one for the same application. The employer only ever sees the latest.",
  "ad.error": "The share could not be saved. Try again.",
  "ad.revokeError": "The share could not be withdrawn. Try again.",
  "ad.employerTitle": "Shared from the candidate's Security Passport",
  "ad.employerLead":
    "The candidate chose to share this with you. It does not come from their application, and they can withdraw it at any time.",
  "ad.employerOnlyVerified":
    "Only verified records appear here. Self-declared entries are never part of a package.",
};

export const passportCopy: Readonly<Record<PassportLang, Record<PassportCopyKey, string>>> = {
  sv,
  en,
};

export function passportT(key: PassportCopyKey, lang: PassportLang): string {
  return passportCopy[lang][key];
}
