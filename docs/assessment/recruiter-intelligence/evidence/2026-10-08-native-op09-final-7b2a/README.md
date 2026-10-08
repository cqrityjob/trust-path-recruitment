# Originalbevis: OP09 native 7b2a

Denna katalog bevarar det faktiskt körda evidenshuvudet `7b2a47026fdd26b18f1674bd494a5800d2399038`, app `40e5775de5195050571421827434ec2872a61506` och schema `1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9`. [Vittnet](../../2026-10-08-native-op09-final-7b2a.md) anger utfört omfång och gränser. En senare test-/metadata-commit får inte ärva denna körnings status.

- [manifest.json](manifest.json) är oförändrat original från artifact `11558490180`. SHA256 `de70fbe7cadf87bb10b66f3e0c4bbd04cc38b2c15b7ddaa34fbe8239df6d1139`.
- [independent-verification.json](independent-verification.json) bevarar separat läsande kontroll av Git-pinnar, alla 387 migrationshashar, SDK-/browserutfall och samtliga 12 PNG. SHA256 `3a8ce41a17de3d50b3165de94d16376345a2db3232d3510299f3972be3d3b119`.
- [Svensk desktop, cleanup spärrad i väntan på bekräftelse](images/sv-desktop1440-fenced.png), SHA256 `07911b4de28cee2c2951245f1b80bb6c393166f3b4de125a16d5de6c16285bb0`.
- [Engelsk emulerad 375, samma sparade cleanup-status](images/en-emulated375-fenced.png), SHA256 `6ac3bffa9465cc152018db71e70e600ced32af4cbd0df021a20b264ad2a7cc7e`.

De två PNG-filerna är oförändrade original, inte redigerade skärmbilder. Endast dessa två är versionshanterade här; arkivets samtliga 12 PNG verifierades mot originalmanifestets storlekar och SHA256. ZIP SHA256 `ef5fdabc520e112278e522fcd88b59bb2a36c9efb9c741783c1ee00dba1f7a26`, 2 816 190 bytes; ZIP lagras inte i repo. Inga privata tjänstnycklar, lösenord, bearer-/refresh-token, signerade URL:er eller privata loggar kopieras.

Båda samtidiga race gav `registration_won`; `bothRaceOrdersObserved=false`. Båda ordningarna prövades sekventiellt. Logout avser lokal session och Passport-skyddet, inte JWT-expiry. Miljön är faktisk isolerad CI, inte hosted drift; 375 är Chromium-emulering, inte fysisk telefon. Bilden på 375 behåller känd layoutskuld: det redan registrerade originalets filnamn bryts nästan ett tecken per rad. Funktionellt PASS är inget fullständigt mobil-/accessibility-/prestandabevis.
