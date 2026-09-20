# TRUST och BESKT – innehållsstatus och innehållsspecifikation för granskning

**Status: UTKAST FÖR GRANSKNING. Inget i detta dokument är publicerat, granskat eller validerat innehåll.** Dokumentet anger vad som finns i dag, vad som saknas och vad som behöver tas fram. Det innehåller inga färdiga testfrågor, poängregler eller facit. Innehåll som tas fram utifrån specifikationen ska gå igenom samma innehållsgranskning och versionering som befintliga paket innan det kan publiceras eller göras tillgängligt.

Underlag: *CQrityjob – TRUST och BESKT, samlad produktstruktur och byggspecifikation v2.0* (19 september 2026), avsnitt 3, 4 och 7. Innehållsläget avläst i produktion 19 september 2026 (endast läsning).

## 0. Innehållsläget, exakt (avläst 19 september 2026)

| Innehåll | I källkoden | Installerat i produktionsdatabasen | Tillgängligt för arbetsgivare i produktion |
|---|---|---|---|
| TRUST · intervjuguide *Väktare* (`vaktare-se`) | Ja, i migrationerna | Ja: v1, 8 frågor, 6 kompetensområden, status utkast / pilothypotes | **Ja**, som öppen pilot för alla aktiva arbetsgivare |
| TRUST · kandidattest *Väktare – Recruitment Assessment* | Ja, i migrationerna | Ja: v1 (50 uppgifter, 5 testdelar), status utkast / design | **Ja**, standard för rekrytering för alla aktiva arbetsgivare |
| TRUST · strategiska och ledande roller | Nej | Nej | Nej |
| BESKT v0.1 · rekryteringsstöd | Ja: `src/lib/beskt/import/beskt-v0-1.content.ts` med 4 avsnitt, 51 kandidatfrågor (inklusive följdfrågor), 70 routingregler, 25 samtalsstöd, 7 ankare och 10 FAKTA-fält | **Nej** (0 BESKT-versioner, 0 frågor) | Nej |
| BESKT v0.1 · säkerhetsprövningsstöd | Ja: samma fil, med 7 avsnitt (bas, B, E, S, K, T, situationer), 133 kandidatfrågor, 216 routingregler, 25 samtalsstöd, 7 ankare, 10 FAKTA-fält och 3 aktiveringskrav | **Nej** | Nej |
| Arbetsmiljöpaket (datacenter, sjukhus, köpcentrum) | Nej | Nej | Nej |

**Åtgärd för BESKT i produktion:**
1. Installera v0.1: Admin → BESKT-metoder → *Installera BESKT v0.1* (rekrytering respektive säkerhetsprövning), som innehållsredaktör och med er egen rättsliga grund.
2. Fatta ett centralt tillgänglighetsbeslut per version: Admin → BESKT-metoder → versionen → *Behörigheter* → *Gör tillgänglig för alla arbetsgivare*. Det kräver publicistrollen.

**Konsekvens:** efter steg 2 kan varje aktiv organisation starta BESKT direkt, märkt som ogranskad pilotversion. Ingen aktivering per företag behövs eller återinförs. Utan steg 2 visar kundytan kort att BESKT-innehåll inte är tillgängligt ännu, utan startknapp. De fem granskningsgrindarna påverkas inte och står kvar som öppna.

## 1. De fyra innehållsvägarna

| Metod | Rollgrupp | Status | Vad som finns | Vad som saknas |
|---|---|---|---|---|
| TRUST | Operativa roller (Väktare) | **1 – Finns och får användas** (pilotversion, ogranskad hypotes) | Intervjuguiden *Väktare* (`vaktare-se`, v1, öppen pilot) och kandidattestet *Väktare – Recruitment Assessment* (v1, standard för rekrytering). Båda är kopplade i biblioteket och verifierade genom hela ärendet till Granska & rapport, lokalt. | Innehållsgranskning och validering av båda enligt respektive granskningsstege. |
| TRUST | Strategiska och ledande roller (Security Manager / säkerhetschef) | **3 – Saknas** | Inget. Rollen visas inte för kunden under TRUST, och väktarinnehållet erbjuds aldrig under den rubriken. | Kravprofil, intervjuguide och eventuellt kandidatmoment för ledningsroller, se 3.1. |
| BESKT | Operativa roller | **2 – Finns delvis** | BESKT v0.1 (rekrytering och säkerhetsprövning) med gemensam bas, B, E, S, K, T, situationer, neutrala följdfrågor och FAKTA. Befattningens exponering anges av arbetsgivaren när uppdraget startas (en generisk T-mall). I produktion: **inte installerad ännu**. | Installation och innehållsbeslut i produktion. De fem granskningsgrindarna. Rollspecifika exponeringsmallar för operativa roller, se 3.2. |
| BESKT | Strategiska och ledande roller | **2 – Finns delvis** | Samma gemensamma metod. Frågorna motiveras av befattningens exponering, som arbetsgivaren anger. | Frågor och exponeringsmallar för mandat, åtkomst, styrning och ansvar i ledningsroller, se 3.3. |

**Tekniskt färdigt ≠ innehållsmässigt färdigt.** Kundytan (Tester & bedömningar → Rekryteringsstöd) erbjuder bara de vägar som har startbart innehåll. En metod utan tillgängligt innehåll säger det kort, utan startknapp. I produktion i dag har endast *TRUST · operativa roller* innehåll som kan användas hela vägen, och även den vägen är en pilotversion som inte är granskad.

## 2. Arbetsmiljöer

| Miljö | Status | Konsekvens i produkten |
|---|---|---|
| Generell säkerhetsverksamhet | Används av alla befintliga paket | Startbar. Uppläggen visar ”Generellt upplägg – inga miljöspecifika scenarier ingår.” |
| Datacenter | **3 – Saknas** | Visas inte för kunden (ägarbeslut 19 september 2026: ingen katalog av avstängda paket i kundytan). |
| Sjukhus | **3 – Saknas** | Visas inte för kunden. |
| Köpcentrum | **3 – Saknas** | Visas inte för kunden. |

Befintliga arbetsförhållanden i kompetensgrafen (kontrollrum, rondering, stationär post och liknande) är **arbetsförhållanden, inte arbetsmiljöprofiler**. De har inte kopplats om till miljövalet.

## 3. Specifikation av saknat innehåll (för granskning)

### 3.1 TRUST – strategiska och ledande roller

**Syfte.** Ge underlag om arbetsrelaterad kompetens, erfarenhet och omdöme för ledningsroller inom säkerhet. Det ska inte vara väktartestet med ny rubrik, och väktarpaketets eventuella evidens får inte överföras.

**Behöver tas fram:**
1. **Kravprofil** med definierade kompetensområden och observerbara indikatorer. Förslag på områden att pröva i granskningen, inte beslut:
   - riskbaserad prioritering och resursfördelning;
   - styrning, mandat och ansvarsfördelning;
   - incident- och krisledning;
   - samverkan med verksamhet, myndigheter och leverantörer;
   - regelefterlevnad och uppföljning;
   - ledarskap och uppföljning av personal.
2. **Intervjuguide** i samma format som *Väktare*: fasta frågor i fast ordning, ”därför frågar vi”, neutrala fördjupningsfrågor och nivåbeskrivningar per område. Allt versionsbundet och låst innan någon kandidat intervjuas.
3. **Eventuellt kandidatmoment**, till exempel ett strukturerat arbetsprov. Om ett sådant ingår krävs egen instrumentgranskning. Upplägget ska kunna fortsätta utan kandidatmoment (acceptanskriterium A14).
4. **Rapportavsnitt:** kompetensvisa mänskliga bedömningar med belägg. Otillräckligt underlag redovisas som otillräckligt, inte som låg kompetens.
5. **Granskning:** samma stege som intervjupaket (expert, juridik, kognitiv granskning), och därefter publicering eller ett uttryckligt beslut om öppen pilot.

**Källor att utgå från vid framtagning:** extern forskning om strukturerade intervjuer, rollanalys av ledande säkerhetsbefattningar hos pilotkunder, och organisationens egna mandat och rapportvägar. De senare kompletterar upplägget men ändrar inte mätmodellen (avsnitt 4 i byggspecifikationen).

### 3.2 BESKT – operativa roller

**Behöver tas fram:** avhemligade exponeringsmallar per vanlig operativ befattning (till exempel väktare med nyckelhantering eller operatör i larmcentral). Varje mall anger:
- typ av åtkomst;
- självständighet;
- möjlighet att kringgå kontroll;
- möjlig skada;
- tillsyn;
- befintliga skydd.

Mallarna är utgångspunkter som arbetsgivaren justerar, inte slutsatser om en person. Mallarna ska granskas av den som äger personalsäkerhetsgrinden.

### 3.3 BESKT – strategiska och ledande roller

**Behöver tas fram:**
1. **Exponeringsmallar** för ledningsroller: mandat över andras behörigheter, tillgång till skyddsvärd information, beslutsrätt och budget, samt möjlighet att påverka kontroller.
2. **Rollutlösta frågor** kopplade till dessa exponeringar, i BESKT:s befintliga grammatik: neutrala, förklaringsbaserade och utan poäng.

Allt ska granskas genom BESKT:s fem grindar.

### 3.4 Arbetsmiljövarianter

**Per miljö behöver tas fram:**
- situationer och scenarier som är specifika för miljön (till exempel tillträde till serverhall, vårdmiljö med patientintegritet, publik miljö med hög genomströmning);
- vilka intervjufrågor eller situationer i befintliga paket som ersätts eller kompletteras.

Arbetsmiljön får inte själv välja metod, ändra säkerhetsklassning eller ge tillgång till fler personuppgifter. En variant blir startbar först när dess eget innehåll är granskat. Tills dess visas miljön som inte tillgänglig.

## 4. Kvarstående beslut som inte är tekniska

| Beslut | Ansvarig |
|---|---|
| Installera BESKT v0.1 i produktion och besluta om öppen pilot (ett beslut per version, inte per organisation) | Innehållsansvarig (plattformens publicist) |
| De fem granskningsgrindarna för BESKT v0.1 | Utsedda granskare per grind |
| Granskning och validering av TRUST Väktare (guide och test) | Innehållsansvarig och granskare |
| Beställning av innehåll enligt 3.1–3.4 | Produktägare |
