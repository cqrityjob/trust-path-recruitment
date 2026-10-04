// The owner's texts of 2026-10-03, changed only by the owner's decisions. A
// bracketed "[Ange …]" / "[Länk …]" is a decision or a fact the owner has not
// supplied yet. It is rendered as a visible placeholder, never filled in here.
//
// Decisions of 2026-10-03: terms §2 (18 years) and §13 (closing an account
// through info@); privacy §5 (no AI provider) and §11 (functional cookies
// only), both verified in production. See
// docs/release/2026-10-03-launch-legal-and-contact.md.
//
// Decisions of 2026-10-04 (docs/legal/2026-10-04-owner-decisions.md):
//   - the provider and data controller is Cqrityjobb AB, 559261-0249 (the
//     company data lives in ./company.ts; "Cqrityjob LLC" is retired);
//   - contact is info@; job@ is for recruitment communication; no response
//     time is promised in public (two working days is an internal target);
//   - generative AI is off in version 1 and, later, a separate paid service
//     with an explicit order, price information and activation;
//   - the retention plan is approved as a product decision. Section 9 is built
//     from ./retention-plan.ts, row for row, and the policy cannot become
//     final while a row is still `pending` (status.ts);
//   - suppliers, places of processing and transfer support are one list
//     (./vendors.ts); a cell that is not yet a verified fact stays a gap.
// Neither document is approved as published: OWNER_APPROVED stays false.
//
// Inline markup in the strings: **bold** only.

import { COMPANY } from "./company";
import { RETENTION_POLICY_ROWS } from "./retention-plan";
import { VENDORS } from "./vendors";

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
      text: `Tjänsten tillhandahålls av ${COMPANY.legalName}, organisationsnummer ${COMPANY.organisationNumber}. ${COMPANY.brand} är tjänstens varumärke.`,
    },
    // The postal address is an open fact the owner has not supplied.
    { type: "placeholder", text: "[Ange bolagets adress.]" },
    { type: "p", text: `Kontakt: ${COMPANY.contactEmail}` },
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
      heading: "6. Karriärtester och AI",
      blocks: [
        {
          type: "p",
          text: "Karriärtester och rekommendationer är beslutsstöd. De kan innehålla fel, vara ofullständiga eller ge olika resultat beroende på underlaget.",
        },
        {
          type: "p",
          text: "Du behöver kontrollera viktiga uppgifter innan du använder resultatet. Tjänsten garanterar inte ett visst arbete, en viss karriärutveckling eller att du uppfyller kraven för en yrkesroll.",
        },
        // Owner decision 2026-10-04: generative AI stays off in version 1; a
        // later version offers it as separate paid services.
        {
          type: "p",
          text: "Generativa AI-funktioner är avstängda i den här versionen av tjänsten och ingår inte i den. Om vi senare erbjuder sådana funktioner sker det som separata betaltjänster som du uttryckligen beställer efter att du har fått prisinformation, och de aktiveras först när du har beställt dem.",
        },
        {
          type: "p",
          text: "Om AI-funktioner erbjuds i en senare version är ett AI-resultat beslutsstöd. Det ersätter inte juridisk rådgivning, professionell säkerhetsbedömning eller andra specialistbedömningar.",
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
        {
          type: "p",
          text: `Meddelanden från en arbetsgivare om din ansökan skickas via ${COMPANY.brand}. Om du svarar på ett sådant mejl går svaret till ${COMPANY.recruitmentEmail}. Den adressen hanteras av ${COMPANY.brand}, och svaret förs inte automatiskt vidare till arbetsgivaren.`,
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
          text: `När CQrityjob behandlar personuppgifter på företagets uppdrag ska ett personuppgiftsbiträdesavtal finnas innan behandlingen börjar. Vi tillhandahåller ett sådant avtal på begäran via ${COMPANY.contactEmail}.`,
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
        // Owner decision 2026-10-04: AI is a later, separate, paid service.
        {
          type: "p",
          text: "Generativa AI-funktioner, om de erbjuds i en senare version, är separata betaltjänster. De kräver en uttrycklig beställning, tydlig prisinformation och en separat aktivering. De ingår inte i ett kostnadsfritt konto, och de aktiveras inte av att du godkänner dessa villkor.",
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
          text: "Om AI-funktioner erbjuds i en senare version kan rättigheter till AI-genererat material bero på materialets innehåll och tillämplig lag. Vi garanterar inte att sådant material är unikt eller fritt från tredje mans rättigheter.",
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
          text: `Du kan avsluta ditt konto genom att skriva till ${COMPANY.contactEmail} från den e-postadress som kontot är registrerat på. För betaltjänster gäller även avtalad uppsägningstid.`,
        },
        {
          type: "p",
          text: "Vi kan begränsa eller stänga av ett konto vid exempelvis allvarligt avtalsbrott, bedrägeri, obehörig åtkomst eller säkerhetsrisk. Åtgärden ska vara proportionerlig. Vi informerar om skälet och möjlighet till rättelse när det är möjligt och lämpligt.",
        },
        {
          type: "p",
          text: `Kontakta ${COMPANY.contactEmail} om du anser att en åtgärd är felaktig.`,
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
          text: "Vi ansvarar för tjänsten enligt avtalet och tillämplig lag. Vi garanterar inte riktigheten i användares uppgifter, arbetsgivares annonser eller, om AI-funktioner erbjuds i en senare version, enskilda AI-resultat.",
        },
        {
          type: "p",
          text: "Ansvaret för ett rekryteringsbeslut ligger hos arbetsgivaren. Det begränsar inte CQrityjobs ansvar för egna fel eller skyldigheter.",
        },
        {
          type: "p",
          text: "Dessa villkor begränsar inte rättigheter enligt GDPR, tvingande konsumentskydd eller ansvar som enligt lag inte får begränsas. Särskilda ansvarsbegränsningar för företagskunder gäller bara om de har avtalats skriftligt.",
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
          text: `**${COMPANY.legalName}**`,
        },
        {
          type: "p",
          text: `Organisationsnummer: ${COMPANY.organisationNumber}. ${COMPANY.brand} är plattformens varumärke.`,
        },
        // The postal address is an open fact the owner has not supplied.
        { type: "placeholder", text: "[Ange bolagets adress.]" },
        {
          type: "p",
          text: `Kontakt: **${COMPANY.contactEmail}**`,
        },
        {
          type: "p",
          text: `${COMPANY.legalName} är personuppgiftsansvarig för den behandling där vi bestämmer varför och hur personuppgifterna används. Det omfattar exempelvis ditt personliga konto, egna karriärtjänster, Security Passport och plattformens säkerhet.`,
        },
        {
          type: "p",
          text: "När en arbetsgivare använder plattformen för sin rekrytering är arbetsgivaren normalt personuppgiftsansvarig för ansökningar, tester, intervjuer och bedömningar. När vi hanterar dessa uppgifter på arbetsgivarens uppdrag är vi personuppgiftsbiträde.",
        },
        {
          type: "p",
          text: "Arbetsgivarens egen integritetsinformation beskriver hur uppgifterna används i rekryteringen.",
        },
        {
          type: "p",
          text: `Meddelanden från en arbetsgivare om din ansökan skickas via ${COMPANY.brand}. Svar på ett sådant mejl går till ${COMPANY.recruitmentEmail}, som hanteras av ${COMPANY.brand} på arbetsgivarens uppdrag. Svaret förs inte automatiskt vidare till arbetsgivaren.`,
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
        // Owner decision 2026-10-04: generative AI is off in version 1. The
        // facts behind the claim, and the one path the database switch does
        // not cover, are in docs/legal/2026-10-04-text-function-verification.md.
        {
          type: "p",
          text: "Generativa AI-funktioner är avstängda i den här versionen av tjänsten.",
        },
        {
          type: "p",
          text: "Vi använder i dag inga AI-leverantörer, och dina uppgifter skickas inte till någon AI-tjänst.",
        },
        {
          type: "p",
          text: "Om vi i en senare version erbjuder AI-funktioner sker det som separata betaltjänster som du uttryckligen beställer och aktiverar. Vi uppdaterar den här policyn innan en sådan funktion aktiveras och anger då vilken leverantör som används, i vilket land uppgifterna behandlas och vilket stöd som gäller för en överföring.",
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
            "leverantörer av drift, lagring, e-post och support, se tabellen nedan,",
            "myndigheter eller rådgivare när det finns rättsligt stöd.",
          ],
        },
        {
          type: "p",
          text: "Leverantörer som behandlar uppgifter på vårt uppdrag ska omfattas av personuppgiftsbiträdesavtal.",
        },
        // Owner decision 2026-10-04: one list, here, instead of a link. The
        // place and the transfer support are facts the suppliers confirm; a
        // cell that is not yet confirmed stays a visible gap (./vendors.ts).
        {
          type: "table",
          head: [
            "Leverantör",
            "Uppgift",
            "Plats för behandling",
            "Stöd för överföring utanför EU/EES",
          ],
          rows: VENDORS.map((v) => [v.name, v.purpose, v.location, v.transferSupport]),
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
        // Owner decision 2026-10-04: international operation is approved and
        // there is no general requirement to store in the EU. What is required
        // is that the actual countries, agreements and transfer support are
        // documented; they are the table in section 6.
        {
          type: "p",
          text: "Vi har ingen generell regel om att uppgifter bara får behandlas inom EU/EES. Våra leverantörer kan behandla uppgifter i andra länder.",
        },
        {
          type: "p",
          text: "Överföringar av personuppgifter utanför EU/EES ska omfattas av ett giltigt stöd enligt GDPR och de skyddsåtgärder som krävs för överföringen, till exempel EU–U.S. Data Privacy Framework eller EU-kommissionens standardavtalsklausuler. Mottagarland och stöd för varje leverantör framgår av tabellen i avsnitt 6.",
        },
        {
          type: "p",
          text: `Du kan få information om de skyddsåtgärder som gäller, och en kopia av dem, genom att kontakta ${COMPANY.contactEmail}.`,
        },
        {
          type: "p",
          text: "Ett köp av en tjänst eller ett godkännande av användarvillkoren ersätter inte stödet för en överföring.",
        },
      ],
    },
    {
      heading: "9. Hur länge sparas uppgifterna?",
      blocks: [
        {
          type: "p",
          // The owner's sentence said "om lag … kräver fortsatt lagring", which
          // reads the wrong way round; "såvida inte" is the meaning intended.
          text: "Uppgifter sparas så länge de behövs för sitt ändamål och raderas eller anonymiseras därefter, såvida inte lag eller rättsliga anspråk kräver fortsatt lagring.",
        },
        // Owner decision 2026-10-04: the retention plan is approved as a
        // product decision. The table is built from ./retention-plan.ts, so the
        // text IS the plan; a row is not a working commitment until its routine
        // is verified, and the policy cannot become final before that
        // (status.ts, RETENTION_READY). "7 dagar" was never true and stays out.
        {
          type: "table",
          head: ["Uppgifter", "Lagringstid"],
          rows: RETENTION_POLICY_ROWS.map((r) => [r.data, r.period]),
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
          text: "Du kan alltid återkalla ett samtycke för framtida behandling. Återkallandet påverkar inte lagligheten av tidigare behandling.",
        },
        {
          type: "p",
          // Owner decision 2026-10-04: requests are handled within the
          // statutory deadlines (GDPR art. 12.3); no shorter time is promised.
          text: `Kontakta **${COMPANY.contactEmail}**. Vi besvarar din begäran utan onödigt dröjsmål och senast inom en månad efter att vi har tagit emot den. När begäran är komplex eller vi har många begäranden kan tiden förlängas med högst ytterligare två månader. Vi informerar dig då inom den första månaden och anger skälet. Vi kan behöva kontrollera din identitet för att skydda dina uppgifter.`,
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
        // Verified 2026-10-03/04 (was a link to a cookie policy and to cookie
        // settings). Opening a share link to a Security Passport sets two
        // functional cookies, one carrying the share key and one the share
        // session, each for SHARE_COOKIE_MAX_AGE_SECONDS (1800 s,
        // src/lib/security-passport/share-transport.ts). The two cookies of the
        // hosting layer were measured by the release session in a fresh
        // Chromium session on www.cqrityjob.com on 2026-10-04 (deployment
        // 7b19bf27): `__cf_bm`, Cloudflare's bot management, HttpOnly, Secure,
        // 30 minutes; `__dpl`, Lovable's pin to the published version, not
        // HttpOnly, about 24 hours. Both are needed technically and neither is
        // for analysis. Login and language sit in the browser's storage and the
        // sidebar state is a cookie.
        {
          type: "p",
          text: "Vi använder bara kakor och lagring i webbläsaren som behövs för att tjänsten ska fungera eller vara säker, till exempel för inloggning, språkval och sidopanelens läge. När du öppnar en delningslänk till ett Security Passport sätts två kakor (en för delningsnyckeln och en för delningssessionen, som vardera gäller i 30 minuter). Driften av tjänsten sätter dessutom två kakor: __cf_bm från Cloudflare, som skyddar mot automatiserad trafik och gäller i 30 minuter, och __dpl från Lovable, som håller dig på rätt publicerad version och gäller i ungefär 24 timmar. Ingen av dem används för analys eller marknadsföring.",
        },
        // Owner decision 2026-10-04: CQrityjob's own usage measurement is off in
        // version 1 (FUNNEL_MEASUREMENT_ENABLED,
        // src/lib/analytics/funnel-measurement.ts), so the policy says so
        // instead of describing a measurement that does not run. An event with
        // no user or session id is not "anonymous" on that ground alone, and no
        // text says it is. The newsletter and the consent-based tracking that
        // used to be described here are not in the product either.
        //
        // The hosting supplier's built-in "Visitor analytics" (`/~flock.js`,
        // which posted page views to `/~api/analytics` and set a `session-id`
        // cookie) was on until the owner turned it off on 2026-10-04. The
        // release session then checked the live site (deployment 7b19bf27): no
        // `~flock.js` in the HTML of /, /jobb, /om-oss, /integritetspolicy and
        // /villkor, no call to /~api/analytics or tinybird, no `session-id`
        // cookie, empty localStorage and sessionStorage. The sentence below says
        // so as a check on that date, not as a promise: it must not say "Vi mäter
        // inte", and the owner wants it checked again after the next
        // publication (an open item in docs/release/2026-10-04-version-1-launch-status.md,
        // not in this text). launch-legal:check 1.14 requires this wording.
        {
          type: "p",
          text: "Vår egen användningsmätning och driftleverantörens besöksstatistik är avstängda (kontrollerat den 4 oktober 2026), och vi lagrar ingen statistikmarkering i webbläsaren.",
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
          text: `Om du misstänker obehörig åtkomst eller felaktig hantering av personuppgifter, kontakta **${COMPANY.contactEmail}**.`,
        },
        {
          type: "p",
          text: "Policyn uppdateras när behandlingen förändras. Vid betydande förändringar informerar vi berörda användare på ett lämpligt sätt innan den nya behandlingen börjar.",
        },
      ],
    },
  ],
};
