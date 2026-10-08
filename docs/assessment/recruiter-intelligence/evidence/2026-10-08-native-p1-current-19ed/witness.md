# Aktuell native P1-verifiering: #460 / 19edc333

Faktiskt PASS i GitHub Actions-körning **37796857513**, jobb **113378454528**, artifact **11559901382**. Detta paket avser exakt beviskod `19edc333631ac858bfbf5538686fe47bbbece9c8`, APP `40e5775de5195050571421827434ec2872a61506` och schema `1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9`. Körningen utfördes 2026-10-08 15:02:50.232–15:07:31.853 UTC.

Original-ZIP: 5 044 644 byte, SHA-256 `89d6ec6bdaaad26bc345ad8ecaa2c431cca5e34b592baed4c9d57d72e4c0d1ee`. Originalmanifestets SHA-256 är `ab679c025f01a161a95affb91a6ed47cb35fb3e5ad87009f26608ac54f8cddb5`. Manifest och oberoende verifiering är kopierade byte för byte. `witness.json` anger alla exakta källträd, kanoniska källhashar och filhashar.

De 100 syntetiska ansökningarna gav **40 gröna / 25 gula / 35 grå**, **27 granskade / 73 återstående**. V2 gav **30 / 35 / 35**, med **0 aktuellt granskade / 100 återstående**. Återkallat underlag gav **25 / 35 / 40**; ersatt underlag återställde inte tidigare acceptans. Två verkliga inloggade granskare konkurrerade genom HTTP: en vann med **200**, en nekades med **409**. Alla **23 HTTP-kontroller** och **5 browserfall** passerade, utan flaky/skipped/unexpected och med ett försök vardera. Historiska positiva och negativa AI-utkast förblev grå; inget AI-anrop utfördes.

Full strikt återspelning av **387 migrationer** passerade. Verifieringen jämförde migrationsbytes mot exakt schemaref, tre kanoniska provkällor mot exakt APP-ref och samtliga tio PNG-filers hash, storlek och signatur. Ingen lokal tjänst startades vid denna läsande efterkontroll.

## Två originalbilder

- `images/sv-desktop-explicit-peace-handoff.png`: sparad R2/version 1, mänsklig anteckning, neutral fråga, originalreferens och nästa handling är synliga. De åtta rollfrågorna, sex kompetensområdena och utkaststatusen kvarstår. **Den separata levande ansökningspanelen visar fortfarande laddning i just denna bild. Bilden bevisar därför inte att den panelen har laddat färdigt.** Sparad källa och bekräftad evidens hålls isär.
- `images/en-emulated-375-remaining.png`: engelsk vy i **emulerad 375 px-mobilbredd**, med 100 mottagna, 27 granskade, 73 återstående, färggrupperna 40/25/35 samt återstående-filter med sida 1 av 3. Detta är inte prov på en fysisk telefon.

## Avgränsning

Detta är en verklig färsk lokal Supabase-stack i Linux-CI med GoTrue-lösenordsinloggning, Storage, PostgREST 14.15 och PostgreSQL 17.6. De 104 syntetiska Auth-kontona skapades via lokal administrativ setup. De 80 original-PDF-objekten lades in via lokal service-role-setup; detta bevisar **inte kandidatens uppladdningsbehörighet**. Arbetsgivarens signerade originalbytes och fyra server-signerade originalöppningar i UI kontrollerades. AI, verkliga meddelanden, kvitton, cron och worker var avstängda.

Ingen hosted drift/CDN, fysisk telefon eller omedelbar återkallning av redan hämtade bytes bevisas. Inga privata nycklar, lösenord, JWT, signerade URL:er, råloggar eller traces ingår. Äldre misslyckade och lyckade artefakter är bevarade med sina egna huvud och scope; detta paket relabelar inte dem. Original-ZIP och de övriga åtta PNG-filerna finns kvar i `/private/tmp/ri-p1-native-current-19edc333-20261008/`.
