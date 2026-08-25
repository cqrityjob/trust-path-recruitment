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
  "workCountry.title": "Arbetsland",
  "workCountry.current": "Nuvarande",
  "workCountry.save": "Spara arbetsland",
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
  "ev.linkShort": "Länken gäller i fem minuter.",
  "ev.withdraw": "Ta bort",
  "ev.withdrawing": "Tar bort …",
  "ev.withdrawConfirm":
    "Dokumentet raderas. Uppgiften går tillbaka till egenrapporterad om det var det enda dokumentet.",
  "ev.underReview": "Går inte att ta bort under pågående granskning.",
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
  "ver.noEmployers":
    "Ingen ansluten arbetsgivare hittades. Be CQrityjob granska uppgiften i stället.",
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
  "vq.methodRequired": "En godkänd verifiering måste ange metod.",
  "vq.noteInternal": "Intern motivering",
  "vq.noteInternalHelp":
    "Syns bara internt. Kommer aldrig med i ett delat Passport, på ett kort eller i en bild.",
  "vq.messageHolder": "Meddelande till innehavaren",
  "vq.messageHolderHelp": "Det här är vad personen får läsa.",
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
  "cred.field.titleHelp": "Namnet som står på beviset eller beslutet.",
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
  "cred.error.dateFormat": "Använd formatet ÅÅÅÅ-MM-DD.",
  "cred.error.endBeforeStart": "Slutdatumet måste vara efter startdatumet.",
  "cred.error.referenceTooLong": "Referensen är för lång (max 120 tecken).",
  "cred.error.noteTooLong": "Anteckningen är för lång (max 2000 tecken).",
  "cred.error.incompleteForActive":
    "Fyll i de obligatoriska fälten innan du lägger till uppgiften.",
  "cred.error.incompleteForVerification":
    "Uppgiften måste vara komplett innan den skickas för kontroll.",
  "cred.errorSummary": "Kontrollera fälten nedan.",

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
  "vq.decline.invalid_validity":
    "Giltighetstiden går inte att spara. Kontrollera att slutdatum ligger efter startdatum, och att ett tidsbegränsat förordnande har ett slutdatum.",
  "vq.decline.issuer_required":
    "Den här behörigheten måste ange vilken myndighet som utfärdat den.",
  "vq.decline.entry_not_active":
    "Uppgiften har ändrats sedan granskningen öppnades och går inte längre att besluta om. Ladda om sidan.",
  "vq.decline.unknown": "Beslutet kunde inte sparas. Dina val är kvar — försök igen.",
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
  "jurisdiction.GB": "United Kingdom",
  "jurisdiction.AE": "United Arab Emirates",
  "jurisdiction.AE-DU": "Dubai",
  "jurisdiction.marketAvailability":
    "Sweden is available today. Other markets, including the United Kingdom and Dubai, are being prepared and cannot be selected yet. You cannot record an authorisation for a country that is not open.",
  "workCountry.title": "Work country",
  "workCountry.current": "Current",
  "workCountry.save": "Save work country",
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
  "ev.linkShort": "The link is valid for five minutes.",
  "ev.withdraw": "Remove",
  "ev.withdrawing": "Removing …",
  "ev.withdrawConfirm":
    "The document is deleted. The entry returns to self-declared if it was the only document.",
  "ev.underReview": "Cannot be removed while a review is open.",
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
  "ver.noEmployers": "No connected employer was found. Ask CQrityjob to review the entry instead.",
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
  "vq.methodRequired": "An approved verification must state its method.",
  "vq.noteInternal": "Internal reasoning",
  "vq.noteInternalHelp":
    "Internal only. Never appears in a shared Passport, on a card, or in an image.",
  "vq.messageHolder": "Message to the holder",
  "vq.messageHolderHelp": "This is what the person will read.",
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
  "cred.field.titleHelp": "The name as it appears on the certificate or decision.",
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
  "cred.error.dateFormat": "Use the format YYYY-MM-DD.",
  "cred.error.endBeforeStart": "The end date must be after the start date.",
  "cred.error.referenceTooLong": "That reference is too long (120 characters maximum).",
  "cred.error.noteTooLong": "That note is too long (2000 characters maximum).",
  "cred.error.incompleteForActive": "Fill in the required fields before adding this entry.",
  "cred.error.incompleteForVerification":
    "This entry must be complete before it is submitted for checking.",
  "cred.errorSummary": "Please check the fields below.",

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
  "vq.decline.invalid_validity":
    "That validity period cannot be saved. Check that the end date is after the start date, and that a time-limited appointment has an end date.",
  "vq.decline.issuer_required": "This credential must name the authority that issued it.",
  "vq.decline.entry_not_active":
    "The entry changed after this review was opened and can no longer be decided. Reload the page.",
  "vq.decline.unknown": "The decision could not be saved. Your entries are still here — try again.",
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
