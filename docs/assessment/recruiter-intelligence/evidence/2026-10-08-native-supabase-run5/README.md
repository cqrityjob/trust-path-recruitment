# Fryst native Supabase-bevis: CI-körning 5, FAIL

[GitHub-körning 37762423210](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/37762423210), jobb `113261817819`, testkod `439c96130a2cdb751c42b27432accda580cd0b5c`, den 8 oktober 2026, misslyckades i `twelve_real_password_ui_journeys`. Artefakt `11542903798` har ZIP-SHA256 `92ba9ad3935643cd90406bedbdd1731e62c5fb501eed7cfcb81abc847af1640b`.

Schema `250623cfb677c931caf70a2354daf774f72f443a` och app `a68f22d799769de32230781bba268632e57e796f` är samma pinnar som för körning 4. Testkodens enda ändring sedan dess var en normal merge av verifierad 071-installationsmetadata. Kanoniska migrationer, Supabase-konfiguration, browser-spec och den pinnade produkten ändrades inte. Detta visar inte i sig att felet är tillfälligt eller att produkten är felfri.

Stackstart, strikt replay av samtliga 385 migrationer, åtta riktiga Auth-konton, receipt-off-fixture, alla sju Storage-adapterprov och app-start passerade. Browsergruppen misslyckades efter cirka 5 minuter 52 sekunder. Tvåfliksproven, direkt GoTrue/PostgREST-CAS och slutläsningen nåddes inte. Den egna stacken stoppades och publiceringskontrollen passerade.

Den redigerade artefakten innehåller bara den generiska browserfelkoden och 35 av 36 kuraterade bilder. Jämfört med körning 4 saknas `images/mobile-375-guard-standalone-sv-report.png`; motsvarande prepare- och resumed-bilder finns. Alla 35 originalbilders storlek/SHA256 har verifierats. Bilderna finns i originalarkivet, inte i denna katalog. Privata Playwright-fel, loggar, traces, tokens och svarskroppar publicerades inte. Exakt felrad och orsak är därför ännu inte fastställda. Varken lyckade slutliga browserantal eller slutliga ärende-/rapportantal kan tillskrivas försöket.

Körning 4:s fullständiga PASS bevaras i egen katalog. Körning 5:s FAIL ändras inte av en senare körning. En separat säker diagnostikändring kan visa enbart fasta projekt-/testnamn, felkategori och begränsade koordinater i den kända specfilen samt heltalsräknare. Ingen retry, timeout, versionspinne eller framgångsgrind ska ändras utan separat motiverat beslut.
