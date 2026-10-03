// GENERATED from the owner's texts of 2026-10-03 by a one-off script; the
// wording is theirs, verbatim. Two substitutions only, both the owner's
// instruction: the provider is "Cqrityjob LLC" (the text said "Cqrityjob AB"),
// and the contact address is info@cqrityjob.com (the text said
// "[kontaktadress]"). A bracketed "[Ange …]" / "[Länk …]" is a decision the
// owner has not made yet. It is rendered as a visible placeholder, never
// filled in here. Filled since, by owner decision of 2026-10-03: terms §2
// (18 years) and terms §13 (closing an account through info@). See docs/release/2026-10-03-launch-legal-and-contact.md.
//
// Inline markup in the strings: **bold** only.

export type LegalBlock =
  | { readonly type: "p"; readonly text: string }
  | { readonly type: "list"; readonly items: readonly string[] }
  | {
      readonly type: "table";
      readonly head: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | { readonly type: "placeholder"; readonly text: string };

export type LegalDocument = {
  readonly title: string;
  readonly dateLabel: string;
  /** ISO date, or a bracketed placeholder while the owner has not set it. */
  readonly date: string;
  readonly intro: readonly LegalBlock[];
  readonly sections: readonly {
    readonly heading: string;
    readonly blocks: readonly LegalBlock[];
  }[];
};

export const TERMS_PATH = "/villkor";
export const PRIVACY_PATH = "/integritetspolicy";

export const TERMS: LegalDocument = {
  title: "Användarvillkor",
  dateLabel: "Gäller från",
  date: "2026-10-01",
  intro: [
    {
      type: "p",
      text: "Dessa villkor gäller för användning av CQrityjob på www.cqrityjob.com och de tjänster som omfattas av plattformen.",
    },
    {
      type: "p",
      text: "Tjänsten tillhandahålls av Cqrityjob LLC, info@cqrityjob.com",
    },
  ],
  sections: [
    {
      heading: "1. Om tjänsten",
      blocks: [
        {
          type: "p",
          text: "CQrityjob erbjuder funktioner för karriärutveckling, yrkesinformation, jobb, rekrytering och presentation av meriter inom säkerhetsbranschen.",
        },
        {
          type: "p",
          text: "Beroende på vilka funktioner som är tillgängliga kan tjänsten omfatta karriärtester, CV-stöd, Security Passport, jobbansökningar samt arbetsgivarverktyg för tester, intervjuer och bedömningar.",
        },
        {
          type: "p",
          text: "Tillgång till en funktion kan bero på kontotyp, behörighet och separat avtal. Framtida funktioner som beskrivs i marknadsföring ingår endast om de uttryckligen erbjuds som del av din tjänst.",
        },
      ],
    },
    {
      heading: "2. Avtal och konto",
      blocks: [
        {
          type: "p",
          text: "Du accepterar dessa villkor när du registrerar ett konto eller uttryckligen godkänner dem vid beställning.",
        },
        {
          type: "p",
          text: "Du ska lämna korrekta registreringsuppgifter och skydda dina inloggningsuppgifter. Dela inte ett personligt konto med andra. Kontakta oss utan dröjsmål om du misstänker obehörig användning.",
        },
        {
          type: "p",
          text: "Om du företräder ett företag ska du ha rätt att ingå avtalet och använda tjänsten för företagets räkning. Företaget ansvarar för sina användares behörigheter och för att ta bort åtkomst när den inte längre behövs.",
        },
        // Owner decision 2026-10-03 (was "[Ange beslutad åldersgräns …]").
        { type: "p", text: "Du måste vara minst 18 år för att skapa ett konto." },
      ],
    },
    {
      heading: "3. Tillåten användning",
      blocks: [
        {
          type: "p",
          text: "Du får använda tjänsten för dess avsedda ändamål och i enlighet med lag.",
        },
        {
          type: "p",
          text: "Du får inte:",
        },
        {
          type: "list",
          items: [
            "lämna falska meriter, förfalskade dokument eller utge dig för att vara någon annan,",
            "publicera vilseledande, olagligt, diskriminerande eller kränkande innehåll,",
            "komma åt andra användares uppgifter utan behörighet,",
            "kringgå säkerhetskontroller eller försöka störa tjänsten,",
            "skicka spam eller samla in kandidatdata för obehöriga ändamål,",
            "kopiera eller masshämta personuppgifter, annonser eller plattformsinnehåll utan tillstånd,",
            "ladda upp material som du saknar rätt att använda.",
          ],
        },
        {
          type: "p",
          text: "Ladda inte upp säkerhetsskyddsklassificerad information, hemliga åtkomstuppgifter eller material som omfattas av sekretess som hindrar behandlingen.",
        },
      ],
    },
    {
      heading: "4. Ditt innehåll",
      blocks: [
        {
          type: "p",
          text: "Du behåller de rättigheter du har till ditt CV, dina dokument och annat innehåll som du laddar upp.",
        },
        {
          type: "p",
          text: "Du ger oss den begränsade rätt att lagra, bearbeta och visa innehållet som behövs för att leverera den tjänst du använder, exempelvis skapa ett CV, hantera en ansökan eller visa ett delat Security Passport.",
        },
        {
          type: "p",
          text: "Du ansvarar för att du har rätt att lämna innehållet och för att uppgifter om andra personer är nödvändiga och lagligen kan behandlas.",
        },
        {
          type: "p",
          text: "Denna rätt innebär inte att vi fritt får sälja ditt innehåll eller använda personuppgifter för andra ändamål. Behandling av personuppgifter regleras av tillämplig lag, integritetspolicyn och eventuella biträdesavtal.",
        },
      ],
    },
    {
      heading: "5. Security Passport och verifiering",
      blocks: [
        {
          type: "p",
          text: "Security Passport samlar och presenterar uppgifter om exempelvis utbildning, certifieringar och yrkesbehörigheter.",
        },
        {
          type: "p",
          text: "Du ansvarar för att dina uppgifter och underlag är korrekta och aktuella. En verifieringsstatus visar endast vad som har kontrollerats, med vilken metod och vid vilken tidpunkt enligt informationen i tjänsten.",
        },
        {
          type: "p",
          text: "En verifierad merit innebär inte en garanti för identitet, lämplighet, anställningsbarhet, säkerhetsprövning eller fortsatt giltighet. Security Passport ersätter inte myndighetsbeslut, arbetsgivarens kontrollskyldigheter eller lagstadgad säkerhetsprövning.",
        },
        {
          type: "p",
          text: "Kontrollera vilka uppgifter som visas innan du delar. Mottagare kan spara eller vidarebefordra information. Återkallad delning tar inte bort redan sparade kopior.",
        },
      ],
    },
    {
      heading: "6. Karriärtester och AI-stöd",
      blocks: [
        {
          type: "p",
          text: "Karriärtester, rekommendationer och AI-genererat material är beslutsstöd. De kan innehålla fel, vara ofullständiga eller ge olika resultat beroende på underlaget.",
        },
        {
          type: "p",
          text: "Du behöver kontrollera viktiga uppgifter innan du använder resultatet. Tjänsten garanterar inte ett visst arbete, en viss karriärutveckling eller att du uppfyller kraven för en yrkesroll.",
        },
        {
          type: "p",
          text: "AI-stödet ersätter inte juridisk rådgivning, professionell säkerhetsbedömning eller andra specialistbedömningar.",
        },
        {
          type: "p",
          text: "Arbetsgivare får inte använda tjänstens resultat som enda grund för ett automatiserat beslut att godkänna eller avslå en kandidat med rättsliga eller motsvarande betydande konsekvenser. En behörig person ska självständigt granska relevant underlag och kunna ändra bedömningen.",
        },
      ],
    },
    {
      heading: "7. Jobbannonser och ansökningar",
      blocks: [
        {
          type: "p",
          text: "Den som publicerar en annons ansvarar för att innehållet är korrekt, aktuellt, lagligt och inte diskriminerande. Annonsören ska ha rätt att företräda arbetsgivaren och erbjuda den aktuella tjänsten.",
        },
        {
          type: "p",
          text: "CQrityjob kan granska, begränsa eller ta bort annonser som bryter mot dessa villkor.",
        },
        {
          type: "p",
          text: "Arbetsgivaren ansvarar för rekryteringsprocessen och anställningsbeslutet. CQrityjob garanterar inte att en ansökan leder till intervju eller anställning.",
        },
        {
          type: "p",
          text: "Om en annons leder till en extern webbplats gäller den mottagande tjänstens villkor och integritetsinformation för den fortsatta användningen.",
        },
      ],
    },
    {
      heading: "8. Arbetsgivarens ansvar",
      blocks: [
        {
          type: "p",
          text: "Arbetsgivaren ska:",
        },
        {
          type: "list",
          items: [
            "informera kandidater om behandlingen av deras personuppgifter,",
            "säkerställa rättslig grund och följa tillämpliga dataskyddsregler,",
            "begränsa åtkomst till personer som behöver uppgifterna för sitt arbete,",
            "använda relevanta och sakliga urvalskriterier,",
            "kontrollera resultat och genomföra meningsfull mänsklig bedömning,",
            "besluta och tillämpa lagringstider och gallringsrutiner,",
            "hantera kandidaters rättigheter.",
          ],
        },
        {
          type: "p",
          text: "Åtkomst inom samma företag ger inte i sig rätt att läsa alla kandidatärenden. Åtkomst ska följa arbetsuppgifter, behörighet och det aktuella ändamålet.",
        },
        {
          type: "p",
          text: "Företaget får inte använda kandidatmaterial för andra ändamål än dem som har kommunicerats och har lagligt stöd.",
        },
        {
          type: "p",
          text: "När CQrityjob behandlar personuppgifter på företagets uppdrag ska ett personuppgiftsbiträdesavtal finnas innan behandlingen börjar.",
        },
      ],
    },
    {
      heading: "9. Personuppgifter",
      blocks: [
        {
          type: "p",
          text: "Vår behandling av personuppgifter beskrivs i integritetspolicyn.",
        },
        {
          type: "p",
          text: "Att acceptera dessa användarvillkor innebär inte ett generellt samtycke till all personuppgiftsbehandling. Samtycke begärs separat när det behövs.",
        },
        {
          type: "p",
          text: "Vid behandling på en arbetsgivares uppdrag gäller även personuppgiftsbiträdesavtalet.",
        },
      ],
    },
    {
      heading: "10. Avgifter och betaltjänster",
      blocks: [
        {
          type: "p",
          text: "Pris, innehåll, avtalsperiod, betalningsvillkor och eventuell förnyelse ska framgå innan du beställer en betaltjänst. Ett kostnadsfritt konto innebär inte att du har beställt en betaltjänst.",
        },
        {
          type: "p",
          text: "Särskilda beställningsvillkor gäller tillsammans med dessa villkor. Om du köper som konsument gäller dessutom tvingande konsumentskydd, inklusive eventuell ångerrätt. Information om ångerrätt och eventuella lagliga undantag ska lämnas innan köp.",
        },
      ],
    },
    {
      heading: "11. Rättigheter till plattformen",
      blocks: [
        {
          type: "p",
          text: "CQrityjobs programvara, varumärke, gränssnitt och eget innehåll tillhör oss eller våra licensgivare.",
        },
        {
          type: "p",
          text: "Du får använda detta inom tjänsten och använda rapporter och exportfiler för deras avsedda ändamål. Du får inte kopiera eller sälja plattformen eller använda vårt varumärke på ett sätt som ger ett missvisande intryck av samarbete eller godkännande.",
        },
        {
          type: "p",
          text: "Rättigheter till AI-genererat material kan bero på materialets innehåll och tillämplig lag. Vi garanterar inte att sådant material är unikt eller fritt från tredje mans rättigheter.",
        },
      ],
    },
    {
      heading: "12. Tillgänglighet och förändringar",
      blocks: [
        {
          type: "p",
          text: "Vi arbetar för en fungerande tjänst, men avbrott kan uppstå vid underhåll, tekniska fel eller händelser utanför vår kontroll.",
        },
        {
          type: "p",
          text: "Vi kan utveckla och ändra funktioner. Förändringar i en betald tjänst ska hanteras enligt avtalet och tillämplig lag. Väsentliga försämringar meddelas i förväg när det är möjligt.",
        },
        {
          type: "p",
          text: "Särskilda tillgänglighetsåtaganden gäller bara om de har avtalats.",
        },
      ],
    },
    {
      heading: "13. Avstängning och avslut",
      blocks: [
        {
          type: "p",
          text: "Du kan avsluta ditt konto genom att skriva till info@cqrityjob.com från den e-postadress som kontot är registrerat på. För betaltjänster gäller även avtalad uppsägningstid.",
        },
        {
          type: "p",
          text: "Vi kan begränsa eller stänga av ett konto vid exempelvis allvarligt avtalsbrott, bedrägeri, obehörig åtkomst eller säkerhetsrisk. Åtgärden ska vara proportionerlig. Vi informerar om skälet och möjlighet till rättelse när det är möjligt och lämpligt.",
        },
        {
          type: "p",
          text: "Kontakta info@cqrityjob.com om du anser att en åtgärd är felaktig.",
        },
        {
          type: "p",
          text: "Vid avslut hanteras personuppgifter enligt integritetspolicyn, lag och eventuella biträdesavtal. Arbetsgivarens redan mottagna material omfattas av arbetsgivarens eget ansvar.",
        },
      ],
    },
    {
      heading: "14. Ansvar",
      blocks: [
        {
          type: "p",
          text: "Vi ansvarar för tjänsten enligt avtalet och tillämplig lag. Vi garanterar inte riktigheten i användares uppgifter, arbetsgivares annonser eller enskilda AI-resultat.",
        },
        {
          type: "p",
          text: "Ansvaret för ett rekryteringsbeslut ligger hos arbetsgivaren. Det begränsar inte CQrityjobs ansvar för egna fel eller skyldigheter.",
        },
        {
          type: "p",
          text: "Dessa villkor begränsar inte rättigheter enligt GDPR, tvingande konsumentskydd eller ansvar som enligt lag inte får begränsas. Eventuella särskilda ansvarsbegränsningar för företagskunder ska framgå av företagsavtalet.",
        },
      ],
    },
    {
      heading: "15. Ändringar av villkoren",
      blocks: [
        {
          type: "p",
          text: "Vid väsentliga ändringar informerar vi berörda kontoinnehavare i förväg och anger när ändringarna börjar gälla. Om en ändring kräver ett nytt godkännande begär vi det.",
        },
        {
          type: "p",
          text: "Ändringar gäller inte retroaktivt. För betalda avtal gäller även särskilda avtalsvillkor och tvingande lag.",
        },
      ],
    },
    {
      heading: "16. Tillämplig lag och tvister",
      blocks: [
        {
          type: "p",
          text: "Svensk rätt gäller, utan att begränsa tvingande skydd som du har som konsument.",
        },
        {
          type: "p",
          text: "Kontakta oss först så att vi kan försöka lösa frågan. Tvister som inte kan lösas prövas av behörig domstol.",
        },
        {
          type: "p",
          text: "Konsumenter kan också vända sig till Allmänna reklamationsnämnden, www.arn.se, när ärendet omfattas av nämndens prövning.",
        },
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: "Integritetspolicy",
  dateLabel: "Senast uppdaterad",
  date: "[publiceringsdatum]",
  intro: [
    {
      type: "p",
      text: "CQrityjob hjälper personer och arbetsgivare inom säkerhetsbranschen med karriärutveckling, meriter och rekrytering. Denna policy beskriver hur dina personuppgifter behandlas när du besöker www.cqrityjob.com, använder plattformen eller kontaktar oss.",
    },
  ],
  sections: [
    {
      heading: "1. Vem ansvarar för dina uppgifter?",
      blocks: [
        {
          type: "p",
          text: "Plattformen tillhandahålls av:",
        },
        {
          type: "p",
          text: "**Cqrityjob LLC**",
        },
        {
          type: "p",
          text: "Kontakt: **info@cqrityjob.com**",
        },
        {
          type: "p",
          text: "Cqrityjob LLC är personuppgiftsansvarig för den behandling där vi bestämmer varför och hur personuppgifterna används. Det omfattar exempelvis ditt personliga konto, egna karriärtjänster, Security Passport och plattformens säkerhet.",
        },
        {
          type: "p",
          text: "När en arbetsgivare använder plattformen för sin rekrytering är arbetsgivaren normalt personuppgiftsansvarig för ansökningar, tester, intervjuer och bedömningar. När vi hanterar dessa uppgifter på arbetsgivarens uppdrag är vi personuppgiftsbiträde.",
        },
        {
          type: "p",
          text: "Arbetsgivarens egen integritetsinformation beskriver hur uppgifterna används i rekryteringen.",
        },
      ],
    },
    {
      heading: "2. Vilka uppgifter behandlar vi?",
      blocks: [
        {
          type: "p",
          text: "Beroende på vilka funktioner du använder kan vi behandla:",
        },
        {
          type: "list",
          items: [
            "**Kontouppgifter:** namn, e-postadress, inloggningsuppgifter och kontoinställningar.",
            "**Profil och karriär:** yrke, erfarenhet, utbildning, kompetenser, CV och karriärmål.",
            "**Tester och rapporter:** svar, resultat och rekommendationer från karriärtester och bedömningsfunktioner.",
            "**Security Passport:** certifieringar, utbildningar, behörigheter, utfärdare, certifikatnummer, giltighetstid, land, underlag och verifieringsstatus.",
            "**Rekryteringsuppgifter:** ansökningar, dokument, meddelanden, intervjuunderlag och arbetsgivarens bedömningar.",
            "**Företagsuppgifter:** kontaktpersoner, arbetsrelaterade kontaktuppgifter och användarbehörigheter.",
            "**Support och administration:** kommunikation med oss samt avtals- och faktureringsuppgifter.",
            "**Tekniska uppgifter:** exempelvis IP-adress, webbläsare och loggar över inloggning och användning.",
          ],
        },
        {
          type: "p",
          text: "Lämna endast uppgifter som behövs. Ladda inte upp personnummer, känsliga personuppgifter, uppgifter om lagöverträdelser eller sekretessbelagt material om inte en särskild funktion uttryckligen är avsedd för detta och behandlingen har lagligt stöd.",
        },
      ],
    },
    {
      heading: "3. Varifrån kommer uppgifterna?",
      blocks: [
        {
          type: "p",
          text: "Vi får främst uppgifter från dig när du skapar ett konto, använder funktioner eller kontaktar oss.",
        },
        {
          type: "p",
          text: "Uppgifter kan också komma från en arbetsgivare som bjuder in dig till en rekrytering eller bedömning. Vid verifiering kan uppgifter hämtas från en utfärdare eller ett relevant register.",
        },
        {
          type: "p",
          text: "När uppgifter hämtas från andra källor ska du få information om källan och behandlingen enligt tillämpliga dataskyddsregler.",
        },
      ],
    },
    {
      heading: "4. Varför använder vi uppgifterna?",
      blocks: [
        {
          type: "p",
          text: "För behandling som vi själva ansvarar för gäller följande:",
        },
        {
          type: "table",
          head: ["Ändamål", "Rättslig grund"],
          rows: [
            [
              "Administrera ditt personliga konto och leverera beställda funktioner",
              "Fullgöra avtalet med dig",
            ],
            [
              "Skapa karriärunderlag och hantera ditt Security Passport",
              "Fullgöra avtalet, i den utsträckning behandlingen är nödvändig för tjänsten",
            ],
            [
              "Administrera kontakter med företagsrepresentanter",
              "Berättigat intresse av att tillhandahålla företagstjänsten",
            ],
            [
              "Hantera support och skydda plattformen mot missbruk och obehörig åtkomst",
              "Berättigat intresse av en fungerande och säker tjänst",
            ],
            ["Uppfylla lagkrav, exempelvis bokföring", "Rättslig förpliktelse"],
            ["Hantera rättsliga anspråk", "Berättigat intresse av att tillvarata våra rättigheter"],
            ["Frivilliga nyhetsbrev och samtyckeskrävande spårning", "Samtycke"],
          ],
        },
        {
          type: "p",
          text: "När vi använder berättigat intresse väger vi vårt behov mot dina rättigheter. Du kan kontakta oss för mer information eller invända mot behandlingen.",
        },
        {
          type: "p",
          text: "Obligatoriska uppgifter anges i respektive funktion. Om du inte lämnar dessa kan vi sakna möjlighet att leverera funktionen. Andra uppgifter är frivilliga.",
        },
        {
          type: "p",
          text: "Arbetsgivaren bestämmer rättslig grund för behandling som sker på arbetsgivarens uppdrag.",
        },
      ],
    },
    {
      heading: "5. Tester, profilering och AI",
      blocks: [
        {
          type: "p",
          text: "Karriärtester och rekommendationer kan innebära profilering: automatisk behandling som beskriver exempelvis kompetenser, intressen och möjliga utvecklingsvägar.",
        },
        {
          type: "p",
          text: "Resultaten bygger på dina svar och tillgängligt underlag. De kan innehålla fel och är vägledning, inte garantier för lämplighet eller anställning.",
        },
        {
          type: "p",
          text: "Vid användning av generativ AI kan relevanta uppgifter behandlas av en AI-leverantör.",
        },
        {
          type: "placeholder",
          text: "[Ange aktiva AI-leverantörer, vilka uppgifter de får, lagringstider, eventuell modellträning och behandling utanför EU/EES. Länka till den fullständiga informationen.]",
        },
        {
          type: "p",
          text: "CQrityjobs funktioner ska användas som beslutsstöd. Arbetsgivaren ska göra en verklig mänsklig bedömning och får inte använda resultatet som enda grund för ett automatiserat beslut med rättsliga eller motsvarande betydande konsekvenser för kandidaten.",
        },
        {
          type: "p",
          text: "Kontakta oss om du vill förstå hur dina uppgifter har använts eller uppmärksamma ett felaktigt resultat. Frågor om ett rekryteringsbeslut riktas till arbetsgivaren.",
        },
      ],
    },
    {
      heading: "6. Vem får tillgång till uppgifterna?",
      blocks: [
        {
          type: "p",
          text: "Uppgifter kan, när det behövs för det aktuella ändamålet, lämnas till:",
        },
        {
          type: "list",
          items: [
            "arbetsgivare som du söker jobb hos eller deltar i en rekrytering hos,",
            "mottagare som du väljer att dela uppgifter med,",
            "utfärdare eller register vid begärd verifiering,",
            "leverantörer av drift, lagring, e-post, support och aktiverade AI-funktioner,",
            "myndigheter eller rådgivare när det finns rättsligt stöd.",
          ],
        },
        {
          type: "p",
          text: "Leverantörer som behandlar uppgifter på vårt uppdrag ska omfattas av personuppgiftsbiträdesavtal.",
        },
        {
          type: "placeholder",
          text: "[Länk till aktuell leverantörsförteckning.]",
        },
        {
          type: "p",
          text: "Behöriga medarbetare hos en arbetsgivare kan få tillgång till rekryteringsmaterial enligt sina arbetsuppgifter och roller. Arbetsgivaren ansvarar för att begränsa tillgången.",
        },
      ],
    },
    {
      heading: "7. Delning av Security Passport",
      blocks: [
        {
          type: "p",
          text: "Kontrollera vilka uppgifter som ingår innan du delar ditt Security Passport.",
        },
        {
          type: "p",
          text: "Delningslänkar kan vidarebefordras. Information som du publicerar i sociala medier kan bli tillgänglig för en större krets.",
        },
        {
          type: "p",
          text: "Om en delning återkallas tas inte kopior bort som en mottagare redan har sparat. Den faktiska möjligheten att avsluta åtkomst framgår av delningsfunktionen.",
        },
      ],
    },
    {
      heading: "8. Behandling utanför EU/EES",
      blocks: [
        {
          type: "p",
          text: "Överföringar av personuppgifter utanför EU/EES ska omfattas av ett giltigt stöd enligt GDPR och de skyddsåtgärder som krävs för överföringen.",
        },
        {
          type: "placeholder",
          text: "[Ange faktiska mottagarländer, överföringsmekanismer och hur användaren kan få information eller en kopia av relevanta skyddsåtgärder.]",
        },
      ],
    },
    {
      heading: "9. Hur länge sparas uppgifterna?",
      blocks: [
        {
          type: "p",
          text: "Uppgifter sparas så länge de behövs för sitt ändamål och raderas eller anonymiseras därefter, om lag eller rättsliga anspråk kräver fortsatt lagring.",
        },
        {
          type: "table",
          head: ["Uppgifter", "Lagringstid"],
          rows: [
            [
              "Konto, kandidatprofil, egna tester och Security Passport",
              "[Ange gallringsregler, även för inaktiva och avslutade konton]",
            ],
            [
              "Rekryteringsmaterial som hanteras för arbetsgivare",
              "Enligt arbetsgivarens dokumenterade regler och biträdesavtalet",
            ],
            ["Supportärenden", "7 dagar"],
            ["Säkerhets- och åtkomstloggar", "7 dagar"],
          ],
        },
        {
          type: "p",
          text: "Radering av ditt konto innebär inte automatiskt att uppgifter raderas hos en arbetsgivare som redan har mottagit dem och ansvarar för sin egen behandling.",
        },
      ],
    },
    {
      heading: "10. Dina rättigheter",
      blocks: [
        {
          type: "p",
          text: "Beroende på behandlingen kan du begära tillgång, rättelse, radering, begränsning och dataportabilitet. Du kan också invända mot behandling som bygger på berättigat intresse.",
        },
        {
          type: "p",
          text: "Du kan alltid invända mot direktmarknadsföring och återkalla samtycke för framtida behandling. Återkallandet påverkar inte lagligheten av tidigare behandling.",
        },
        {
          type: "p",
          text: "Kontakta **info@cqrityjob.com**. Vi svarar normalt inom en månad. Om en förlängning är tillåten och behövs informerar vi dig om skälet. Vi kan behöva kontrollera din identitet för att skydda dina uppgifter.",
        },
        {
          type: "p",
          text: "Du kan lämna klagomål till Integritetsskyddsmyndigheten på www.imy.se eller annan behörig tillsynsmyndighet.",
        },
      ],
    },
    {
      heading: "11. Kakor och liknande teknik",
      blocks: [
        {
          type: "p",
          text: "Information om kakor och liknande teknik, deras ändamål och lagringstider finns i **[länk till kakpolicy]**.",
        },
        {
          type: "p",
          text: "Teknik som kräver samtycke får användas först efter ditt aktiva val. Du ska kunna neka och återkalla samtycke lika enkelt som du lämnar det.",
        },
        {
          type: "placeholder",
          text: "[Länk till kakinställningar.]",
        },
      ],
    },
    {
      heading: "12. Säkerhet och uppdateringar",
      blocks: [
        {
          type: "p",
          text: "Vi ska använda tekniska och organisatoriska skyddsåtgärder som är lämpliga för riskerna i behandlingen.",
        },
        {
          type: "p",
          text: "Om du misstänker obehörig åtkomst eller felaktig hantering av personuppgifter, kontakta **info@cqrityjob.com**.",
        },
        {
          type: "p",
          text: "Policyn uppdateras när behandlingen förändras. Vid betydande förändringar informerar vi berörda användare på ett lämpligt sätt innan den nya behandlingen börjar.",
        },
      ],
    },
  ],
};
