# RI-P1-100-v1 — föreslaget acceptansfacit

Detta är ett fristående orakel för [acceptanskriterierna](../2026-10-07-p1-acceptance-criteria.md). Det importerar inte produktkod, använder bara Pythons standardbibliotek och anropar inte DB, nätverk, AI eller webbläsare. Det är inte seedkod, produktimplementation eller en verifiering av P1-API/SQL/RLS/UI. Innehåll och facit inväntar godkännande.

Kör från repositoryroten med Python 3.8 eller senare:

```bash
python3 docs/assessment/recruiter-intelligence/p1-acceptance/ri-p1-100-v1.py > /tmp/ri-p1-100-v1-output.json
```

En lyckad körning avslutas med exit 0. Output anger uttryckligen `PROPOSED_ACCEPTANCE_ORACLE_NOT_PRODUCT_VERIFICATION`. Assertions kontrollerar 100 unika UUID, basens 40/25/35 grupper och 27/73 aktuella granskningsantal samt profil-/källändring, återkallelse, CAS-konflikt, dubbleringsskydd, AI-utkast utan underlag, meriter, datumties och livscykelavgränsning. Exakta sidlistor för varje filter/scenario ingår. Människans möjlighet att avsluta en grå granskning modelleras separat från kravens uppfyllnad.

Den incheckade outputen är root-agentens omkörning med Python 3.12.14. Den är semantiskt identisk med den första modellkörningen. JSON-whitespace kan skilja mellan Python-/formatverktygsversioner; jämför parsade JSON-värden. Artefaktens SHA-256 efter repositoryformatering finns i [granskningsmanifestet](../p0-review/artifact-manifest.json).

Krav-ID, dokument och kandidater är fiktiva. En senare P1-testfixture behöver också riktiga syntetiska original, källidentiteter/versioner, fråga/svar-relationer, aktörer och godkänd isolerad Auth/Storage. Modellens JSON-binding och Python-CAS föreskriver inte ett visst SQL-schema eller en produktimplementation. Alla produkt-/direkt-API-/åtkomst-/samtidighetsprov återstår och får inte bokföras som PASS från denna körning.
