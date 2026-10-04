# CQrityjob användarflöden 4 oktober 2026

Den samlade ändringen följer användarrapporten **CQrityjob 20261004.docx** och uppdragets F01–F15. Rapportens text och alla 14 bilder har lästs. Originalbilderna och den verkliga delningstoken publiceras inte. Arbetet utgår från `origin/main` `ecaa805`, inklusive tidigare logo-, katalog- och lanseringsändringar. Ingen merge, driftsättning, extern kontoregistrering eller produktionsdatamutation ingår.

Observation nedan är vad testaren rapporterade. Diagnos är vad kod, lokal databas eller webbläsare faktiskt har visat. Fixturetester bevisar gränssnittsbeteende; de ersätter inte Google, mejlleverans eller en verklig mottagarsession i publicerad version. Exakt slutcommit och slutlig CI-status redovisas i PR:n, eftersom en fil inte kan innehålla sitt eget commit-ID.

## Checklista F01–F15

### F01 Yrkesrekommendationer

- **Observation:** ”Utforska nu” gav ingen relevant information om Personskyddsvakt.
- **Diagnos:** Gemensam destinationsresolver fanns redan och pekar på exakt yrke. Katalogvyn läste inte befintliga arbetsmiljö-, kompetens- och erfarenhetsrelationer. Personskyddsvakts `overview` och kompetensbeskrivningar är NULL i seed; längre arbetsbeskrivning saknas i källmaterialet.
- **Ändring:** Separat ”Läs om yrket”-länk, bibehållen tidsklassificering, sammanfattning som fallback samt katalogens arbetsmiljö/kompetenser/erfarenhetskrav. Relationsfel ger retry, inte ”inga krav”. Ingen ny yrkesmappning, certifiering eller erfarenhetstid uppfinns.
- **Verifiering:** Renderkontroller svenska/engelska och befintliga yrkesresor med synlig tillbaka-knapp/webbläsarbakåt. Lokal katalogfråga bekräftar tre kompetenser, Högriskmiljö och inga registrerade erfarenhetsrader för Personskyddsvakt. Bilder: offentlig katalog-SSR plus browserfixture. **Kvarstår:** redaktionellt källinnehåll för en mer utförlig arbetsbeskrivning.

### F02 Google och resultatägare

- **Observation:** Google-inloggning öppnade Mostafas konto.
- **Diagnos:** Befintlig app-session återanvändes och färdiga resultat sparades automatiskt för inloggad användare. Google-anrop saknade uttryckligt kontoval. Detta bevisar inte vilken av dessa mekanismer som orsakade testarens händelse. Servern härleder fortfarande ägare från verifierad autentisering.
- **Ändring:** Aktivt konto och kontobyte visas innan uttryckligt sparande. Identiteten läses om vid åtgärden; servern jämför bekräftad identitet med requestens autentiserade identitet. Google begär kontoval. Buffert/resultat behålls vid byte eller fel. Slutgranskningen hittade också separata klientrisker: ansökningsutkast var nycklade endast per jobb och inloggade vyer behöll lokalt state vid direkt kontobyte. Utkast isoleras nu per konto/jobb och den inloggade vyn monteras om vid ändrad användaridentitet.
- **Verifiering:** Syntetiska browserkonton, account-change-negative test och lokal databas med två användare; se [säkerhetsgranskningen](security-review.md). **Delvis verifierad:** inga två riktiga Google-testkonton finns. Kontovalsdialogen är inte bevis för resultatägarskap. Manuell instruktion nedan.

### F03 E-postbekräftelse

- **Observation:** Användaren förstod inte nästa steg.
- **Diagnos:** Texten blandade aktivering, destination, enhetsbyte och automatisk inloggning.
- **Ändring:** Öppna mejlet → bekräfta adressen → återgå hit → fortsätt. Kort mobilinstruktion och ”Kontrollera och fortsätt” beskriver knappens befintliga kontroll. Återställd sida visar fortsatt att separat inloggning behövs.
- **Verifiering:** Svenska/engelska före-/efterbilder på desktop/375 och account-confirmation-regression. Bilderna använder syntetisk återställd registrering, inte faktisk mejlleverans.

### F04 Förhandsgranskning

- **Observation:** Knappen såg inte klickbar ut.
- **Diagnos:** Det var redan en riktig knapp men saknade pekmarkör och hade otydlig etikett. Preview hade dessutom mörk mottagartext mot marinblå bakgrund.
- **Ändring:** ”Förhandsgranska delningen”, konkret hjälptext, pekmarkör, ljus preview-bakgrund och befintligt synligt tangentbordsfokus. Stängning återgår till samma val.
- **Verifiering:** Passport-fixture i desktop/mobil med tangentbord, val och öppna/stäng. Syntetiska före-/efterbilder.

### F05 Delningslänk och 404

- **Observation:** `/p` med fragment gav 404.
- **Diagnos:** Publicerat `/p` utan token svarade 200; lokalt finns en servergateway före routern. Ingen verifierad rotorsak för rapportens 404. Originaltoken har inte återanvänts.
- **Ändring:** Befintlig gateway och tokenregler bevaras; verifiering av korrekt transport, mottagarurval och felstatus dokumenteras.
- **Verifiering:** Transport-/gatewaykontroller samt en sammanhängande riktig lokal kedja på svenska/desktop och engelska/mobil: login → urval/preview → färsk länk → Clipboard/QR → utloggad mottagare → reload → återkallning/ogiltig länk. Ingen responsmockning i denna kedja; exakta miljögränser i säkerhetsgranskningen. **Delvis verifierad:** rapportens historiska hosting-/404-händelse är inte reproducerad och räknas inte som en bevisad rättning.

### F06 Annons, andra jobb och yrke

- **Observation:** Liknande jobb såg ut som en fortsättning på annonsen; säkerhetschef visade finansiell brottslighet.
- **Diagnos:** Andra annonser låg inuti annonsens `<article>`. Yrket slogs upp med CIG-slug i Career Centers andra namnrymd och kunde därför saknas; bara annonsens oberoende områdesval visades.
- **Ändring:** Andra annonser ligger efter avslutad annons i egen avgränsad sektion med förklaring. Befintlig gemensam resolver ger rätt yrke. ”Om yrket” använder det kända yrkets kanoniska område; annonsens lagrade klassificering ändras inte och titel används aldrig för att gissa yrke.
- **Verifiering:** Syntetisk säkerhetschefsannons med avsiktligt avvikande annonsområde visar Säkerhetsledning och styrning. Återgång behåller sökning; befintliga filter-/positionsregressioner körs.

### F07 Ansökningsknappar

- **Observation:** ”Ansök om jobbet” och dialogen var otydliga.
- **Diagnos:** Olika öppningsetiketter och dialogrubrik utan tjänstens namn.
- **Ändring:** ”Sök jobbet” öppnar, ”Skicka ansökan” lämnar in. Extern/e-post-knapp anger dessutom destination. Dialogen visar tjänst och arbetsgivare.
- **Verifiering:** Routed UI på svenska/engelska, desktop/375, med syntetisk arbetsgivare och tydlig slutknapp. Ingen verklig ansökan skickad.

### F08 Kompetenskrav

- **Observation:** Ledarskap, riskbedömning och strategisk säkerhet saknade förklaring.
- **Diagnos:** Frågorna visade endast kravetiketten. Kravtabellen har inga separata arbetsgivardefinitioner att återge; frågor/etiketter behåller arbetsgivarens preciseringar. Publicerade CIG-definitioner hade inte lästs för formuläret.
- **Ändring:** Exakt matchade katalogdefinitioner, därefter befintlig lokal kompetenskatalog eller uppdragets godkända korta definitioner. Hjälptexten är alltid synlig och kopplad med `aria-describedby`. Ingen fuzzy matchning eller nya år/certifikat.
- **Verifiering:** Publicerad definition prioriteras, okänt/förtydligat krav får ingen gissad definition, båda språk, tre tangentbordstillgängliga frågegrupper på mobil/desktop.

### F09 Passport i ansökan

- **Observation:** Efterhandsdelning var klickbar utan verifierade uppgifter.
- **Diagnos:** Efterhands-RPC kunde skapa en tom/identitetsbaserad delning. Mottagarurvalet filtrerade fortfarande verified/active; klickbarheten bevisar inte överföring av overifierade meriter.
- **Ändring:** Båda gränssnitt använder samma verifierade innehållserbjudande; databasfunktionen nekar även direktanrop när verifierat innehåll saknas. Konkret tomtext och ”Öppna Security Passport”. Allmän delning behåller sina regler och statusetiketter.
- **Verifiering:** Ny isolerad databas från hela migrationskedjan. Ansökningsdelning 38 + 7 och allmän selected-sharing 122 assertions godkända. Migrationen är **pending**, inte applicerad i produktion; rollback och verifiering registrerade i release-state.

### F10 Klickbar testinbjudan

- **Observation:** Testets URL var ren text.
- **Diagnos:** Meddelandet renderades i `<pre>` utan länk.
- **Ändring:** Endast tillåtna egna academy-URL:er blir ”Öppna testet”. Nya utskick använder befintligt attempt-ID; gamla listlänkar går till listan. React renderar resten som text; behörighetskontroll finns kvar.
- **Verifiering:** Tillåtna/felaktiga URL:er, främmande domän, HTML, båda språk. Testets auth-redirect bygger fortsatt på befintlig routekontroll.

### F11 Testöversikt

- **Observation:** Internjargong och otydlig förklaring.
- **Diagnos:** ”Frisläppts” och olika navigationsnamn; vissa avslutsstatusar presenterades som inlämnade.
- **Ändring:** ”Tester och utveckling”, tydligt starta/fortsätta, avsändare och befintlig deadline. Abandoned/ej inskickat skiljs från lyckad inlämning; ingen ovillkorlig granskningsstatus.
- **Verifiering:** Språk-/renderkontroller och routed lista → test → lista → fortsätt.

### F12 Introduktion och reflektion

- **Observation:** Lång och otydlig text.
- **Diagnos:** Upprepade instruktioner och blanketlöften om granskning.
- **Ändring:** Kort innehåll, sparande, mottagare och nästa handling. Antal och tid från befintlig definition. Reflektionsinstruktionen är generell så Väktare inte får ledarskapsinstruktion. Upplysningar om behörig granskare och mänskliga beslut bevaras där de gäller.
- **Verifiering:** Reliability, panelrendering, Väktare truth och språkgranskning. Inga testfrågor, scoring eller granskningsregler ändrade.

### F13 Pausa och fortsätta

- **Observation:** Ingen tydlig pausåtgärd.
- **Diagnos:** Utgång väntade inte på serverbekräftat sparande; misslyckade writes räknades inte som osparade; återupptagning valde första obesvarade fråga.
- **Ändring:** ”Spara och fortsätt senare”, sparbekräftelse före utgång, retry utan tappade svar och navigationsblockering vid fel. Aktuell position lagras per attempt, svar ligger kvar på servern. Deadline kontrolleras fortsatt på servern.
- **Verifiering:** Syntetiska sparfel, logo/webbläsarbakåt, retry, lista, andra frågans position och svar efter reload. Riktig klient med syntetisk Auth-transport testar också utloggning → ny session → samma sparade svar/position samt direkt A → B → A utan kvarvarande A-text eller cleanup-skrivningar under B. Detta ersätter inte extern OAuth; serveråtkomst och deadlines kontrolleras i befintliga databasregler.

### F14 Efter inlämnat test

- **Observation:** Ingen väg vidare.
- **Diagnos:** Slutpanel saknade knappar och kunde beskriva granskning för brett.
- **Ändring:** ”Till mina tester” och ”Till översikten”. Väntan på granskning visas bara för aktuell status. `not_open` räknas inte automatiskt som lyckad inlämning; faktisk serverstatus avgör.
- **Verifiering:** Inlämning → slutknappar → reload utan dubbel submit; språk-/statuskontroller.

### F15 Navigation och logotyp

- **Observation:** Huvudnavigation saknades i Mitt säkerhetsarbete; gammal testlogotyp; bilder antydde täckande header.
- **Diagnos:** Separata headers återanvände inte huvudnavigation/BrandLogo. Fullpage-capture efter scroll kan också placera en sticky header mitt i bilden; det är inte ensamt bevis för ett runtime-layoutfel.
- **Ändring:** Befintlig SiteHeader i säkerhetsarbete och gemensam godkänd navy-SVG i testshell. Testheader ligger i sidflödet; utgång använder sparskydd.
- **Verifiering:** Översikt ↔ säkerhetsarbete, tangentbord, mobilmeny, svenska/engelska, initialt och efter scroll. Den godkända SVG:n kom redan från main; ingen ny logotyp ritad.

## Verifieringsgränser

- Verkligt Google-kontoval saknar två tillgängliga testkonton och godkänd isolerad OAuth-konfiguration. Ingen extern kontoansökan eller produktionsändring gjordes.
- Riktig mejlleverans och bekräftelse över två enheter är inte verifierade av språkfixtures.
- Den historiska `/p`-404:an har inte reproducerats. Publicerat `/p` utan token svarade 200; den känsliga token användes inte.
- Befintlig main har lintskuld. Oförändrad `ecaa805` kontrollerades i separat lokal kopia: **800 errors, 114 warnings**. Slutlig jämförelse och CI-resultat finns i PR:n. Detta räknas som underkänt, inte överhoppat/godkänt.
- Databasändringen är föreslagen, med lokal replay och rollback. Att pending-migrationen inte är applicerad hosted är avsiktligt enligt förbudet mot produktionsändringar.

## Manuell återtest för Mostafa

1. I säker preview/lokal miljö, gör ett karriärtest, läs exakt rekommenderat yrke och använd både synlig tillbaka-knapp och webbläsarbakåt. Kontrollera samma resultat.
2. För Google: använd två separata testkonton A/B. Kör först i ren browser, sedan en profil med app-session A och Google-session B. Kontrollera aktivt konto, byt konto, spara och verifiera med båda kontona att bara avsedd ägare kan läsa resultatet. Testa också kontobyte i annan flik mellan visning och sparande. F02 är inte slutligt verklighetsverifierad förrän detta är gjort.
3. Registrera syntetisk e-post i preview, öppna bekräftelsen på mobilen och fortsätt på datorn. Upprepa efter omladdning, då inloggning behövs.
4. Välj Passport-uppgifter, öppna/stäng preview och kontrollera bibehållet urval. Öppna ny länk och QR som utloggad mottagare; ladda om; återkalla och kontrollera att inga uppgifter visas.
5. Sök/filtera jobb, öppna annons, läs kompetenshjälpen och gå tillbaka. Testa ansökningsdelning med inga verifierade uppgifter och med minst en verifierad uppgift, både före och efter ansökan.
6. Öppna testinbjudan, besvara två frågor, pausa, logga in på nytt och fortsätt samma test/steg. Simulera nätfel: svaren ska vara kvar. Lämna in, ladda om och använd båda slutlänkarna.
7. På mobil och dator: öppna Mitt säkerhetsarbete från översikten och återvänd via huvudnavigation. Kontrollera att fokus och knappar syns vid scroll.

## Bilder

Bilderna under [screenshots](screenshots) är nya, med syntetiska konton och data där inloggning behövs. `before-`/`cqrity-flow-before-` kommer från oförändrad main; `after-`/`cqrity-flow-` från arbetsbranchen. [Språkevidens](language-evidence.json) beskriver SSR/fixture-gränsen för yrke och mejlbekräftelse. Originalrapportens privata bilder och token ingår inte.
