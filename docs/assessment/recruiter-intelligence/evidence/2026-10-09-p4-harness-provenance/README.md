# Lokal återanvändning av CI-harness och bildproveniens

AI-koden är byteidentisk med den granskade, avstängda versionen
`ac1d5fa06fa46a2552bad0fa7e81817d7523fe98`. Den normala cherry-picken av
`85a68b52fa5abb2e830021ba8aa5318f9e168921` ändrar endast tre native-workflows
till exakta `bun test ./scripts/...` och lägger till två regressionsprov.
Proven reproducerar Bun-filfilter som felaktigt samlar in både root- och
app-tester, två separata Playwright-installationer och ett gammalt Git-objekt
som avsiktligt saknas. Samma exakta root-test behåller verkliga mobile-/touch-/
DPR-kontroller och passerar. Alla äldre kontroller är kvar.

Native-pinnarna är fortfarande main-versionens APP
`40e5775de5195050571421827434ec2872a61506` och schema
`1e5988c6f9c7121a0fefd22c0db06f6b573f0ae9`, med 387 migrationsfiler.
Inga 389-pinnar, migrationsändringar eller nya native-resultat har införts
i denna AI-gren.

Det ursprungliga [bildparet](../../../../../artifacts/employer-portal-ux/INDEX.md)
och [lokala fotograferingskvittot](../2026-10-09-schema-portal-local.json)
har kopierats byteidentiskt: 28 före från main55db och 28 efter från
schema-kandidaten b7. Alla ursprungliga SHA-256 matchar. Paret visar sju sidor
på SV/EN, desktop1440 och Chromium-emulerad375 med mobile/touch/DPR3.
Det är stubbad lokal UI-evidens, inte fysisk telefon, riktig Auth/API/Storage,
publicerad runtime eller ny AI-effekt.

Den befintliga pair-guarden passerar för exakt fotograferade55db/b7.
En separat faktisk Git-diff visar noll ändringar i guidens WATCHED-sökvägar
från b7 till AI-huvudet. Ett extra guardförsök mot ett annat huvud utan
GitHub-token vägrades; det är inget full-head-guard-PASS och ingen token
eller guardändring infördes.

Den gamla negativa manifestkontrollen använde en fast localhost-adress som
inte fanns i det nya originalkvittot. Ett unikt strukturellt JSON-ankare
ersätter adressen; samma EPE-ID, avsiktliga parsefel, antal och exakt
byteåterställning är kvar. Originalmanifestet ändras inte.

Utförda lokala kontroller:

| Kontroll                        | Resultat                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tre aktuella root-native-guards | 79 PASS / 233 Bun-expect-kontroller                                                                                  |
| AI-kontrakt och minnessandlåda  | 73 PASS / 176 assertions; alla tidigare 68 kvar                                                                      |
| Offline facit                   | 9 fall, 0 avvikelser, 0 modell-/skriv-/status-/meddelande-/rapporthändelser                                          |
| Äldre AI-spärr och copy         | 35 respektive 40 PASS                                                                                                |
| Negativa kontroller             | AI-spärr 11, AI-copy 12, portalflöde 8, bildpar 3: samtliga upptäckta och byteåterställda                            |
| Typkontroll                     | Full app och scripts samt de faktiskt konfigurerade native-workflowkommandona: exit 0; nio negativa typkontrakt kvar |
| Riktad ESLint och Prettier      | Exit 0, inga lintvarningar                                                                                           |

[Verifieringskvittot](verification.json) binder källor och logghashar och
behåller de första lokala felobservationerna separat: saknad Bun i
underprocessens PATH, gammalt manifestankare och ett extra icke-konfigurerat
Node-typkommando med Bun-testfilen. Inga spärrar eller typkontroller
försvagades för att få dessa fel gröna. Det tidigare separata provet med fem
FAIL mot gamla452a och 68 avsiktligt filtrerade tester är oförändrat.

Ingen tjänst, ny fotografering, hosted skrivning, aktivering, publicering,
push eller PR ingår. De fyra runtime-handlers vägrar fortfarande
ovillkorligen med `RECRUITER_AI_V03_DISABLED`. Sandlådans journal, budget,
cache och idempotens är endast minnestillstånd och inte beständiga eller
samordnade över processer.
