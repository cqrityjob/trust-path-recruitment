# MVP UX-fixar efter #301/#302/#303 — implementationsplan

## Utgångspunkt (verifierad 2026-09-27)

- origin/main = ee5bd661 och innehåller #301 (Security Work), #302 (Career Center) och #303 (RPC-typer, startsidestester, jobb-tillbakanavigation).
- Nuvarande preview-branch `edit/edt-271c8a4f-756d-4056-b736-97daa48ef13c` ligger EFTER main: lokala `jobs.$slug.tsx` har fortfarande gamla `history.back()`; main har #303:s validerade `from`-sökning.
- **Steg 0:** Synka main in i branchen via befintligt GitHub-flöde (jag kör inga stateändrande git-kommandon själv). Verifiera därefter att previewn speglar #301–#303 innan något nedan påbörjas. Alla ändringar landar på samma branch: `edit/edt-271c8a4f-756d-4056-b736-97daa48ef13c`.

## Avgränsade fixar

1. **Jobbkortets titelbrytning** (`src/components/jobs/JobCard.tsx`): "Säkerhetschef" bryts idag som "Säkerhetsc hef". Ersätt `[overflow-wrap:anywhere]` med normal ordbrytning + `hyphens:auto` med korrekt `lang`-attribut, så långa ord bryts med bindestreck eller inte alls.
2. **Tomma annonsplatshållare** (`src/components/jobs/JobAdContent.tsx`): när beskrivning saknas eller bara innehåller mallplatshållare ("[Beskriv arbetsuppgifterna…]") visas "Arbetsbeskrivning saknas" / "Job description not provided". Dubblerade mallrubriker (t.ex. "Om rollen" upprepat i brödtext) filtreras vid visning. Lagrad data ändras aldrig; meningsfullt arbetsgivarinnehåll rörs inte.
3. **Mobilfilter** (`src/routes/jobs.tsx` / filterkomponent): på mobil kollapsas de fem select-filtren bakom en tillgänglig "Filter"-knapp (aria-expanded, aria-controls) med räknare för aktiva filter. Sökfält och träffräknare ("3 jobb") förblir synliga. URL-filter bevaras oförändrade.
4. **Startsidans knapprad** (`src/routes/index.tsx`): jämn ikon-/textmellanrum på "Hitta jobb" och övriga knappar.
5. **Företagsnamn**: ingen automatisk versalisering av namn eller platser; befintliga kanoniska visningsetiketter används där de finns. (Ingen kodändring väntas — verifieras.)

## Verifiering, inte ombyggnad

- #303:s tillbakanavigation och inloggningsretur: testa att sökfilter överlever lista → annons → tillbaka, samt annons → logga in → tillbaka till annonsen. Byggs bara om om en defekt reproduceras.
- #301 (Security Work) och #302 (Career Center): rörs inte; bekräftas bara visuellt att de laddar utan fel.
- Startsidans godkända innehåll bevaras: alla fem FAQ-frågor, individ- och arbetsgivarspår.

## Test och bevis

- Typecheck (båda), produktionsbygge, berörda fokustester (homepage/jobs-safeguards).
- Före/efter-skärmdumpar: jobbkort, jobbdetalj, mobilfilter, startsidans knapprad — SV och EN, desktop (1280) och mobil (390).
- Autentiserade flöden (ansökan, delning) rapporteras som overifierade utan testkonto.

## Gränser

- Ingen regenerering av databastyper, ingen ändring av previewAuthStorage.ts, auth, scoring, databasregler, AI-aktivering eller priser.
- De tre säkerhetsfynden (sp_credential_definition_versions, sp_recognition_policies, sp_credential_scopes) förblir öppna.
- Ingen merge, publicering eller deploy.
