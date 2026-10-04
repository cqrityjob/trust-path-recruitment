# Före och efter

Bilderna är lokala granskningsbevis. Originalrapporten och dess delningstoken ingår inte. Alla inloggade vyer använder syntetiska identiteter; yrkeskatalogen använder offentlig SSR enligt [manifestet](language-evidence.json). Testerna beskriver separat vad som är mockad transport respektive riktig databasverifiering.

| Vy                              | Före                                                                   | Efter                                                            |
| ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Yrke, mobil svenska             | [Före](screenshots/before-profession-sv-375.png)                       | [Efter](screenshots/after-profession-sv-375.png)                 |
| Mejlinstruktion, mobil svenska  | [Före](screenshots/before-confirmation-sv-375.png)                     | [Efter](screenshots/after-confirmation-sv-375.png)               |
| Passport-preview, mobil svenska | [Före](screenshots/before-mobile-share-preview-sv.png)                 | [Efter](screenshots/after-mobile-share-preview-sv.png)           |
| Annons, desktop engelska        | [Före](screenshots/before-job-en-1440.png)                             | [Efter](screenshots/after-job-en-chromium.png)                   |
| Ansökan, mobil svenska          | [Före](screenshots/before-application-sv-mobile-375.png)               | [Efter](screenshots/after-application-sv-mobile-375.png)         |
| Testinbjudan, svenska desktop   | [Före](screenshots/before-test-invitation-sv-desktop.png)              | [Efter](screenshots/after-test-invitation-sv-desktop.png)        |
| Testöversikt, svenska desktop   | [Före](screenshots/before-test-list-sv-desktop.png)                    | [Efter](screenshots/after-test-list-sv-desktop.png)              |
| Testintro, mobil svenska        | [Före](screenshots/cqrity-flow-before-sv-intro-mobile-375.png)         | [Efter](screenshots/cqrity-flow-sv-intro-mobile-375.png)         |
| Inlämnat test, desktop engelska | [Före](screenshots/cqrity-flow-before-en-submitted-chromium.png)       | [Efter](screenshots/cqrity-flow-en-submitted-chromium.png)       |
| Säkerhetsarbete, mobil svenska  | [Före](screenshots/cqrity-flow-before-sv-security-work-mobile-375.png) | [Efter](screenshots/cqrity-flow-sv-security-work-mobile-375.png) |

Pausbekräftelse är en ny vy: [mobil svenska](screenshots/cqrity-flow-sv-paused-mobile-375.png). Övriga språk och storlekar samt Passport-preview finns i [bildmappen](screenshots).

Annonsens före-bild använder befintlig lista/reader-fixture; efter-bilden visar den separata annonssidan med test av avvikande områdesval. De är inte en pixeljämförelse av identiska sökresultat. Ansökningsbilderna använder samma syntetiska krav och arbetsgivare före/efter.

Testinbjudan och testöversikt använder identiska syntetiska uppgifter före/efter: Exempelbolaget AB, rekryteringstest med 3 av 12 besvarade uppgifter och sista svarsdag 1 november 2030. Inbjudans äldre listadress visar samma meddelande som rå text före och en klickbar ”Öppna testet”-åtgärd efter.
